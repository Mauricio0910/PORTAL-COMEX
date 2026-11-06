#!/usr/bin/env python3
"""COMEX LAB ND2 — servidor acadêmico independente (Python stdlib + SQLite).
Simulação, sem integração com Siscomex/Receita/SEFAZ.
"""
import argparse
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import threading
from contextlib import contextmanager
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie

BASE = Path(__file__).resolve().parent
DB = Path(os.environ.get("COMEX_DB", str(BASE / "comex_lab.sqlite3")))
SCHEMA = json.loads((BASE / "schema.json").read_text(encoding="utf-8"))
MODULES = {m["id"]: m for m in SCHEMA}
RUBRIC = [("estrategia", "Empresa e estratégia", 10),
          ("conformidade", "NCM e conformidade", 15),
          ("importacao", "Documentação de importação", 20),
          ("exportacao", "Documentação de exportação", 20),
          ("financas", "Finanças, câmbio e riscos", 20),
          ("integracao", "Integração e defesa oral", 15)]
LOGIN_FAILS = {}
LOGIN_LOCK = threading.Lock()

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="microseconds")

@contextmanager
def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB), timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("PRAGMA busy_timeout=15000")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

def init_db():
    with connect() as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript("""
        CREATE TABLE IF NOT EXISTS groups(
          id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, invite TEXT NOT NULL UNIQUE,
          due_date TEXT NOT NULL DEFAULT '', closed INTEGER NOT NULL DEFAULT 0,
          submitted_at TEXT, protocol TEXT, reopened_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS users(
          id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          pass_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('teacher','student')),
          group_id INTEGER REFERENCES groups(id), trio TEXT CHECK(trio IN ('A','B') OR trio IS NULL),
          created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(
          token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
          csrf TEXT NOT NULL, expires_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS documents(
          group_id INTEGER NOT NULL REFERENCES groups(id), doc_id TEXT NOT NULL,
          vals TEXT NOT NULL DEFAULT '{}', waiver TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft', updated_at TEXT NOT NULL,
          updated_by INTEGER REFERENCES users(id),
          PRIMARY KEY(group_id,doc_id));
        CREATE TABLE IF NOT EXISTS grades(
          group_id INTEGER PRIMARY KEY REFERENCES groups(id), rubric TEXT NOT NULL,
          feedback TEXT NOT NULL, graded_at TEXT NOT NULL, graded_by INTEGER NOT NULL REFERENCES users(id));
        """)

def password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310000)
    return "pbkdf2$310000$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()

def password_verify(password, encoded):
    try:
        _, it, salt, expected = encoded.split("$")
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), base64.urlsafe_b64decode(salt), int(it))
        return hmac.compare_digest(actual, base64.urlsafe_b64decode(expected))
    except (ValueError, TypeError):
        return False

def public_user(row):
    return {"id":row["id"],"name":row["name"],"email":row["email"],"role":row["role"],
            "group_id":row["group_id"],"trio":row["trio"]}

def get_group(db, gid):
    row = db.execute("SELECT * FROM groups WHERE id=?", (gid,)).fetchone()
    return dict(row) if row else None

def members(db, gid):
    return [public_user(r) for r in db.execute(
        "SELECT * FROM users WHERE group_id=? ORDER BY trio,name", (gid,))]

def dossier(db, gid):
    group = get_group(db,gid)
    if not group: return None
    docs = {}
    for row in db.execute("SELECT * FROM documents WHERE group_id=?", (gid,)):
        docs[row["doc_id"]] = {"values":json.loads(row["vals"]),"waiver":row["waiver"],
            "status":row["status"],"updated_at":row["updated_at"],"updated_by":row["updated_by"]}
    for m in SCHEMA:
        docs.setdefault(m["id"], {"values":{},"waiver":"","status":"draft","updated_at":"","updated_by":None})
    gr = db.execute("SELECT * FROM grades WHERE group_id=?", (gid,)).fetchone()
    grade = {"rubric":json.loads(gr["rubric"]),"feedback":gr["feedback"],
             "graded_at":gr["graded_at"]} if gr else None
    return {"group":group,"members":members(db,gid),"docs":docs,"grade":grade,
            "audit":audit(docs)}

def validate_doc(m, values, waiver, status):
    if status not in ("draft","reviewed","waived"):
        return ["Status inválido."]
    if status == "waived":
        if not m["conditional"]: return ["Este documento não admite dispensa."]
        if len(waiver.strip()) < 35: return ["Justifique a dispensa com ao menos 35 caracteres e fonte."]
        return []
    if status == "draft": return []
    errors = []
    for f in m["fields"]:
        if f.get("required") and not str(values.get(f["key"],"")).strip():
            errors.append("Campo obrigatório: " + f["label"])
    if m["id"] == "G03":
        for k in ("ncmexp","ncmimp"):
            if values.get(k) and not re.fullmatch(r"\d{8}", re.sub(r"\D","",str(values[k]))):
                errors.append("NCM deve ter 8 dígitos: " + k)
    if m["id"] == "G01":
        if values.get("cnpj") and len(re.sub(r"\D","",str(values["cnpj"]))) != 14:
            errors.append("CNPJ fictício deve ter 14 dígitos.")
    if m["id"] in ("E01","E03","I01","I03"):
        if all(str(values.get(k,"")).strip() for k in ("quantidade","total")):
            unit = "preco" if m["id"] in ("E01","I01") else "unitario"
            if str(values.get(unit,"")).strip():
                try:
                    if abs(float(values["quantidade"])*float(values[unit])-float(values["total"]))>.05:
                        errors.append("Quantidade × preço unitário difere do total.")
                except ValueError: errors.append("Valores monetários devem ser numéricos.")
    return errors

def audit(docs):
    issues=[]
    def val(d,k): return str(docs.get(d,{}).get("values",{}).get(k,"")).strip()
    for m in SCHEMA:
        d=docs[m["id"]]
        if d["status"] not in ("reviewed","waived"):
            issues.append(m["id"]+": pendente de revisão.")
        elif d["status"]=="reviewed":
            issues += [m["id"]+": "+x for x in validate_doc(m,d["values"],d["waiver"],d["status"])]
    for a,ak,b,bk,label in [
        ("E01","total","E03","total","Proforma vs invoice exportação"),
        ("I01","total","I03","total","Pedido vs invoice importação"),
        ("I03","total","I08","valor","Invoice vs Duimp"),
        ("I09","total","G06","custoimp","Custo nacionalizado vs balanço"),
        ("E11","receita","G06","receitaexp","Receita vs resultado final")]:
        x,y=val(a,ak),val(b,bk)
        if x and y:
            try:
                if abs(float(x)-float(y))>.05: issues.append(label+": valores divergentes.")
            except ValueError: pass
    for a,ak,b,bk,label in [
        ("G03","ncmexp","E10","ncm","NCM exportação"),
        ("G03","ncmimp","I08","ncm","NCM importação"),
        ("I06","ncm","I08","ncm","NCM catálogo/DUIMP")]:
        x,y=val(a,ak),val(b,bk)
        if x and y and re.sub(r"\D","",x)!=re.sub(r"\D","",y):
            issues.append(label+": códigos divergentes.")
    return issues

def email_valid(s):
    return bool(re.fullmatch(r"[^@\s]{1,80}@[^@\s]{1,120}\.[^@\s]{2,}",s))

class Handler(BaseHTTPRequestHandler):
    server_version = "COMEXLAB/1.0"
    def log_message(self, fmt, *args):
        print("%s %s" % (self.address_string(), fmt % args), file=sys.stderr)

    def headers_common(self, code, typ="application/json; charset=utf-8", length=None, extra=None):
        self.send_response(code)
        self.send_header("Content-Type",typ)
        self.send_header("X-Content-Type-Options","nosniff")
        self.send_header("Referrer-Policy","no-referrer")
        self.send_header("X-Frame-Options","DENY")
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        if length is not None: self.send_header("Content-Length",str(length))
        for k,v in (extra or []): self.send_header(k,v)
        self.end_headers()

    def send_json(self, data, status=200, extra=None):
        raw=json.dumps(data,ensure_ascii=False).encode("utf-8")
        self.headers_common(status,length=len(raw),extra=extra)
        self.wfile.write(raw)

    def fail(self, message, code=400):
        self.send_json({"error":message},code)

    def serve_file(self, filename, typ):
        path=BASE/filename
        raw=path.read_bytes()
        self.headers_common(200,typ,len(raw))
        self.wfile.write(raw)

    def body(self):
        length=int(self.headers.get("Content-Length","0"))
        if length<1 or length>200000:
            raise ValueError("Corpo vazio ou maior que 200 KB.")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def session(self,db):
        cookies=SimpleCookie()
        try: cookies.load(self.headers.get("Cookie",""))
        except Exception: return None
        morsel=cookies.get("comex_session")
        if not morsel: return None
        token=morsel.value
        if not re.fullmatch(r"[A-Za-z0-9_-]{32,128}",token): return None
        row=db.execute("""SELECT u.*,s.csrf,s.expires_at FROM sessions s
          JOIN users u ON u.id=s.user_id WHERE s.token_hash=?""",
          (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
        if not row or row["expires_at"]<time.time(): return None
        return row

    def require(self,db,role=None,csrf=False):
        user=self.session(db)
        if not user:
            self.fail("Faça login para continuar.",401)
            return None
        if role and user["role"]!=role:
            self.fail("Acesso restrito.",403)
            return None
        if csrf and not hmac.compare_digest(self.headers.get("X-CSRF-Token",""),user["csrf"]):
            self.fail("Sessão inválida. Recarregue a página.",403)
            return None
        return user

    def do_GET(self):
        parsed=urlparse(self.path)
        path=parsed.path
        if path in ("/","/index.html"):
            return self.serve_file("index.html","text/html; charset=utf-8")
        if path=="/app.js":
            return self.serve_file("app.js","application/javascript; charset=utf-8")
        if path=="/style.css":
            return self.serve_file("style.css","text/css; charset=utf-8")
        if path=="/api/schema":
            return self.send_json({"schema":SCHEMA,"rubric":RUBRIC})
        with connect() as db:
            if path=="/api/me":
                user=self.require(db)
                if not user: return
                return self.send_json({"user":public_user(user),"csrf":user["csrf"]})
            if path=="/api/dossier":
                user=self.require(db,"student")
                if not user:return
                return self.send_json(dossier(db,user["group_id"]))
            if path=="/api/teacher/groups":
                user=self.require(db,"teacher")
                if not user:return
                groups=[]
                for row in db.execute("SELECT * FROM groups ORDER BY id DESC"):
                    g=dict(row)
                    g["members"]=len(members(db,g["id"]))
                    g["completed"]=db.execute(
                        "SELECT COUNT(*) FROM documents WHERE group_id=? AND status IN ('reviewed','waived')",
                        (g["id"],)).fetchone()[0]
                    gr=db.execute("SELECT rubric FROM grades WHERE group_id=?",(g["id"],)).fetchone()
                    g["score"]=sum(json.loads(gr[0]).values()) if gr else None
                    groups.append(g)
                return self.send_json({"groups":groups})
            if path=="/api/teacher/group":
                user=self.require(db,"teacher")
                if not user:return
                try: gid=int(parse_qs(parsed.query).get("id",["0"])[0])
                except ValueError:return self.fail("ID inválido.")
                data=dossier(db,gid)
                if not data:return self.fail("Grupo não encontrado.",404)
                return self.send_json(data)
            if path=="/api/export":
                user=self.require(db)
                if not user:return
                if user["role"]=="teacher":
                    try: gid=int(parse_qs(parsed.query).get("id",["0"])[0])
                    except ValueError:return self.fail("ID inválido.")
                else: gid=user["group_id"]
                data=dossier(db,gid)
                if not data:return self.fail("Grupo não encontrado.",404)
                data["application"]="COMEX LAB ND2 — SIMULAÇÃO ACADÊMICA, SEM VALIDADE LEGAL"
                raw=json.dumps(data,ensure_ascii=False,indent=2).encode()
                name="COMEX_LAB_ND2_Grupo_"+str(gid)+".json"
                return self.headers_and_file(raw,"application/json; charset=utf-8",name)
            return self.fail("Rota não encontrada.",404)

    def headers_and_file(self,raw,typ,name):
        self.headers_common(200,typ,len(raw),[("Content-Disposition",'attachment; filename="'+name+'"')])
        self.wfile.write(raw)

    def do_POST(self):
        origin=self.headers.get("Origin")
        if origin and urlparse(origin).netloc!=self.headers.get("Host",""):
            return self.fail("Origem da requisição não autorizada.",403)
        path=urlparse(self.path).path
        try: data=self.body()
        except (ValueError,json.JSONDecodeError,UnicodeDecodeError) as e:
            return self.fail("Dados inválidos: "+str(e))
        if not isinstance(data,dict): return self.fail("Envie um objeto JSON.")
        with connect() as db:
            if path=="/api/login":
                email=str(data.get("email","")).lower().strip()
                pwd=str(data.get("password",""))
                ip=self.client_address[0]
                with LOGIN_LOCK:
                    failures=[x for x in LOGIN_FAILS.get(ip,[]) if time.time()-x<600]
                    LOGIN_FAILS[ip]=failures
                    if len(failures)>=8:return self.fail("Muitas tentativas. Aguarde 10 minutos.",429)
                row=db.execute("SELECT * FROM users WHERE email=?",(email,)).fetchone()
                if not row or not password_verify(pwd,row["pass_hash"]):
                    with LOGIN_LOCK:LOGIN_FAILS.setdefault(ip,[]).append(time.time())
                    return self.fail("E-mail ou senha inválidos.",401)
                token=secrets.token_urlsafe(36)
                csrf=secrets.token_urlsafe(24)
                db.execute("INSERT INTO sessions VALUES(?,?,?,?)",
                    (hashlib.sha256(token.encode()).hexdigest(),row["id"],csrf,time.time()+8*3600))
                db.commit()
                secure="; Secure" if os.environ.get("COMEX_HTTPS")=="1" else ""
                cookie=f"comex_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800"+secure
                return self.send_json({"user":public_user(row),"csrf":csrf},extra=[("Set-Cookie",cookie)])
            if path=="/api/register":
                email=str(data.get("email","")).lower().strip()
                name=str(data.get("name","")).strip()
                password=str(data.get("password",""))
                invite=str(data.get("invite","")).upper().strip()
                trio=str(data.get("trio","")).upper()
                if not email_valid(email) or len(name)<3 or len(name)>100 or len(password)<10 or len(password)>200 or trio not in ("A","B"):
                    return self.fail("Informe nome, e-mail válido, senha de 10+ caracteres e trio A ou B.")
                group=db.execute("SELECT * FROM groups WHERE invite=?",(invite,)).fetchone()
                if not group:return self.fail("Código de equipe inválido.")
                if group["closed"] or group["submitted_at"]:return self.fail("Inscrições encerradas para esta equipe.")
                if db.execute("SELECT COUNT(*) FROM users WHERE group_id=? AND trio=?",(group["id"],trio)).fetchone()[0]>=3:
                    return self.fail("Este trio já possui três integrantes.")
                try:
                    db.execute("INSERT INTO users(email,name,pass_hash,role,group_id,trio,created_at) VALUES(?,?,?,?,?,?,?)",
                        (email,name,password_hash(password),"student",group["id"],trio,now()))
                    db.commit()
                except sqlite3.IntegrityError:return self.fail("E-mail já cadastrado.")
                return self.send_json({"ok":True,"message":"Cadastro realizado. Entre com seu e-mail e senha."},201)
            user=self.require(db,csrf=True)
            if not user:return
            if path=="/api/change-password":
                old=str(data.get("old_password",""))
                new=str(data.get("new_password",""))
                if len(new)<10 or len(new)>200:return self.fail("Nova senha deve ter entre 10 e 200 caracteres.")
                if not password_verify(old,user["pass_hash"]):return self.fail("Senha atual incorreta.",403)
                db.execute("UPDATE users SET pass_hash=? WHERE id=?",(password_hash(new),user["id"]))
                db.commit()
                return self.send_json({"ok":True})
            if path=="/api/logout":
                cookie=SimpleCookie()
                cookie.load(self.headers.get("Cookie",""))
                token=cookie.get("comex_session")
                if token:db.execute("DELETE FROM sessions WHERE token_hash=?",(hashlib.sha256(token.value.encode()).hexdigest(),))
                db.commit()
                return self.send_json({"ok":True},extra=[("Set-Cookie","comex_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")])
            if path=="/api/doc":
                if user["role"]!="student":return self.fail("Acesso restrito.",403)
                gid=user["group_id"]
                group=get_group(db,gid)
                if group["closed"] or group["submitted_at"]:return self.fail("Entrega encerrada. Solicite reabertura ao professor.",409)
                docid=str(data.get("id",""))
                m=MODULES.get(docid)
                if not m:return self.fail("Documento desconhecido.")
                if m["team"].startswith("Trio A") and user["trio"]!="A":return self.fail("Somente o trio de importação pode editar este documento.",403)
                if m["team"].startswith("Trio B") and user["trio"]!="B":return self.fail("Somente o trio de exportação pode editar este documento.",403)
                values=data.get("values",{})
                if not isinstance(values,dict):return self.fail("Valores inválidos.")
                allowed={f["key"] for f in m["fields"]}
                cleaned={k:str(v)[:10000] for k,v in values.items() if k in allowed and isinstance(v,(str,int,float))}
                if len(json.dumps(cleaned))>100000:return self.fail("Documento muito grande.")
                waiver=str(data.get("waiver",""))[:10000]
                status=str(data.get("status","draft"))
                errors=validate_doc(m,cleaned,waiver,status)
                if errors:return self.send_json({"error":"Revise os campos.","details":errors},422)
                existing=db.execute("SELECT updated_at FROM documents WHERE group_id=? AND doc_id=?",(gid,docid)).fetchone()
                expected=str(data.get("version",""))
                if (existing and expected!=existing["updated_at"]) or (not existing and expected):
                    return self.fail("Este documento foi atualizado por outro integrante. Recarregue antes de editar.",409)
                saved_at=now()
                db.execute("""INSERT INTO documents(group_id,doc_id,vals,waiver,status,updated_at,updated_by)
                  VALUES(?,?,?,?,?,?,?) ON CONFLICT(group_id,doc_id) DO UPDATE SET
                  vals=excluded.vals,waiver=excluded.waiver,status=excluded.status,
                  updated_at=excluded.updated_at,updated_by=excluded.updated_by""",
                  (gid,docid,json.dumps(cleaned,ensure_ascii=False),waiver,status,saved_at,user["id"]))
                db.commit()
                return self.send_json({"ok":True,"status":status,"saved_at":saved_at})
            if path=="/api/submit":
                if user["role"]!="student":return self.fail("Acesso restrito.",403)
                group=get_group(db,user["group_id"])
                if group["closed"] or group["submitted_at"]:return self.fail("Equipe já entregou ou está encerrada.",409)
                roster=members(db,user["group_id"])
                if len(roster)!=6 or sum(m["trio"]=="A" for m in roster)!=3 or sum(m["trio"]=="B" for m in roster)!=3:
                    return self.fail("A entrega exige seis integrantes cadastrados, três em cada trio.",422)
                d=dossier(db,user["group_id"])
                pending=[m["id"] for m in SCHEMA if d["docs"][m["id"]]["status"] not in ("reviewed","waived")]
                if pending:return self.send_json({"error":"Há formulários pendentes.","details":pending},422)
                protocol="ND2-"+dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d")+"-"+str(group["id"]).zfill(4)+"-"+secrets.token_hex(3).upper()
                db.execute("UPDATE groups SET submitted_at=?,protocol=? WHERE id=?",(now(),protocol,user["group_id"]))
                db.commit()
                return self.send_json({"ok":True,"protocol":protocol,"submitted_at":now()})
            if user["role"]!="teacher":return self.fail("Acesso restrito ao professor.",403)
            if path=="/api/teacher/create":
                name=str(data.get("name","")).strip()
                due=str(data.get("due_date","")).strip()
                if len(name)<3 or len(name)>100:return self.fail("Nome da equipe: 3 a 100 caracteres.")
                if due:
                    try:dt.date.fromisoformat(due)
                    except ValueError:return self.fail("Data inválida.")
                invite=secrets.token_hex(6).upper()
                try:
                    db.execute("INSERT INTO groups(name,invite,due_date,created_at) VALUES(?,?,?,?)",(name,invite,due,now()))
                    db.commit()
                except sqlite3.IntegrityError:return self.fail("Nome da equipe já existe.")
                return self.send_json({"ok":True,"invite":invite},201)
            if path=="/api/teacher/grade":
                gid=int(data.get("group_id",0))
                group=get_group(db,gid)
                if not group:return self.fail("Grupo não encontrado.",404)
                if not group["submitted_at"]:return self.fail("A equipe ainda não entregou.")
                vals=data.get("rubric",{})
                rubric={}
                for key,label,maxi in RUBRIC:
                    try:v=float(vals.get(key,0))
                    except (ValueError,TypeError):return self.fail("Nota inválida: "+label)
                    if v<0 or v>maxi:return self.fail("Pontuação fora do limite: "+label)
                    rubric[key]=v
                feedback=str(data.get("feedback",""))[:10000]
                db.execute("""INSERT INTO grades(group_id,rubric,feedback,graded_at,graded_by)
                  VALUES(?,?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET rubric=excluded.rubric,
                  feedback=excluded.feedback,graded_at=excluded.graded_at,graded_by=excluded.graded_by""",
                  (gid,json.dumps(rubric),feedback,now(),user["id"]))
                db.commit()
                return self.send_json({"ok":True,"score":sum(rubric.values())})
            if path=="/api/teacher/reopen":
                gid=int(data.get("group_id",0))
                group=get_group(db,gid)
                if not group:return self.fail("Grupo não encontrado.",404)
                db.execute("UPDATE groups SET submitted_at=NULL,protocol=NULL,closed=0,reopened_count=reopened_count+1 WHERE id=?",(gid,))
                db.execute("DELETE FROM grades WHERE group_id=?",(gid,))
                db.commit()
                return self.send_json({"ok":True,"message":"Equipe reaberta; nota anterior apagada."})
            if path=="/api/teacher/reset-member":
                uid=int(data.get("user_id",0))
                member=db.execute("SELECT * FROM users WHERE id=? AND role='student'",(uid,)).fetchone()
                if not member:return self.fail("Estudante não encontrado.",404)
                temporary=secrets.token_urlsafe(12)
                db.execute("UPDATE users SET pass_hash=? WHERE id=?",(password_hash(temporary),uid))
                db.execute("DELETE FROM sessions WHERE user_id=?",(uid,))
                db.commit()
                return self.send_json({"ok":True,"temporary_password":temporary,
                    "message":"Entregue a senha temporária somente ao estudante."})
            if path=="/api/teacher/remove-member":
                uid=int(data.get("user_id",0))
                member=db.execute("SELECT * FROM users WHERE id=? AND role='student'",(uid,)).fetchone()
                if not member:return self.fail("Estudante não encontrado.",404)
                group=get_group(db,member["group_id"])
                if group["submitted_at"]:return self.fail("Reabra a entrega antes de alterar integrantes.",409)
                db.execute("UPDATE documents SET updated_by=NULL WHERE updated_by=?",(uid,))
                db.execute("DELETE FROM sessions WHERE user_id=?",(uid,))
                db.execute("DELETE FROM users WHERE id=?",(uid,))
                db.commit()
                return self.send_json({"ok":True})
            if path=="/api/teacher/close":
                gid=int(data.get("group_id",0))
                if not get_group(db,gid):return self.fail("Grupo não encontrado.",404)
                closed=1 if data.get("closed") else 0
                db.execute("UPDATE groups SET closed=? WHERE id=?",(closed,gid))
                db.commit()
                return self.send_json({"ok":True})
            return self.fail("Rota não encontrada.",404)

def create_teacher(email,name,password):
    if not email_valid(email) or len(password)<10:raise ValueError("E-mail válido e senha com 10+ caracteres.")
    init_db()
    with connect() as db:
        db.execute("INSERT INTO users(email,name,pass_hash,role,created_at) VALUES(?,?,?,?,?)",
                   (email.lower().strip(),name,password_hash(password),"teacher",now()))
        db.commit()

def main():
    parser=argparse.ArgumentParser(description="COMEX LAB ND2 — portal acadêmico")
    sub=parser.add_subparsers(dest="cmd",required=True)
    srv=sub.add_parser("serve")
    srv.add_argument("--host",default=os.environ.get("COMEX_HOST","127.0.0.1"))
    srv.add_argument("--port",type=int,default=int(os.environ.get("PORT","8080")))
    admin=sub.add_parser("create-teacher")
    admin.add_argument("--email",required=True)
    admin.add_argument("--name",default="Professor")
    args=parser.parse_args()
    if args.cmd=="create-teacher":
        import getpass
        pwd=getpass.getpass("Defina a senha do professor (mín. 10 caracteres): ")
        try:
            create_teacher(args.email,args.name,pwd)
            print("Professor cadastrado.")
        except (ValueError,sqlite3.IntegrityError) as e:
            print("Erro:",e,file=sys.stderr);sys.exit(1)
    else:
        init_db()
        with connect() as db:
            count=db.execute("SELECT COUNT(*) FROM users WHERE role='teacher'").fetchone()[0]
        if count==0 and os.environ.get("COMEX_ADMIN_EMAIL") and os.environ.get("COMEX_ADMIN_PASSWORD"):
            create_teacher(os.environ["COMEX_ADMIN_EMAIL"],os.environ.get("COMEX_ADMIN_NAME","Professor"),os.environ["COMEX_ADMIN_PASSWORD"])
            print("Professor inicial criado a partir das variáveis de ambiente.")
        print(f"COMEX LAB ND2 em http://{args.host}:{args.port}")
        print("Para publicar online: use HTTPS, COMEX_HTTPS=1, backup do SQLite e hospedagem persistente.")
        ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()

if __name__=="__main__":
    main()
