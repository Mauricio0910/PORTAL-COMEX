#!/usr/bin/env python3
"""Inicia o COMEX LAB ND2 localmente; não publica na internet."""
import getpass
import sqlite3
import threading
import webbrowser
from http.server import ThreadingHTTPServer

import app

def main():
    print("=" * 62)
    print(" COMEX LAB ND2 | FACDO | INICIALIZACAO LOCAL")
    print("=" * 62)
    app.init_db()
    with app.connect() as db:
        teachers = db.execute("SELECT COUNT(*) FROM users WHERE role='teacher'").fetchone()[0]
    if not teachers:
        print("\nPRIMEIRO ACESSO: cadastre a conta do professor.")
        email = input("E-mail institucional do professor: ").strip()
        name = input("Nome do professor [Professor]: ").strip() or "Professor"
        password = getpass.getpass("Crie uma senha (minimo 10 caracteres): ")
        confirm = getpass.getpass("Repita a senha: ")
        if password != confirm:
            raise SystemExit("As senhas nao coincidem. Execute novamente.")
        try:
            app.create_teacher(email, name, password)
        except (ValueError, sqlite3.IntegrityError) as exc:
            raise SystemExit(f"Cadastro nao concluido: {exc}")
        print("Conta do professor criada com sucesso.")
    url = "http://127.0.0.1:8080"
    print(f"\nPortal pronto: {url}")
    print("Para encerrar o servidor, volte a esta janela e pressione Ctrl+C.")
    print("ATENCAO: acesso somente neste computador; nao e hospedagem publica.\n")
    server = ThreadingHTTPServer(("127.0.0.1", 8080), app.Handler)
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
