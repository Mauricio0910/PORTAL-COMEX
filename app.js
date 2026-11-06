(() => {
"use strict";
const $ = id => document.getElementById(id);
const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const state = {user:null,csrf:"",schema:[],rubric:[],dossier:null,groups:[],selected:null,doc:"G01",view:"home",dirty:false,saving:false,timer:null};
const teamLabel = x => x==="A" ? "Importação" : "Exportação";
function notice(msg,bad=false) {const el=$("notice");el.textContent=msg;el.className="show"+(bad?" bad":"");clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.className="",7500);}
async function api(path, method="GET", payload) {
  const opt={method,credentials:"same-origin",headers:{}};
  if(method!=="GET"){opt.headers["Content-Type"]="application/json";opt.headers["X-CSRF-Token"]=state.csrf;opt.body=JSON.stringify(payload||{});}
  let r;try{r=await fetch(path,opt);}catch(e){throw Error("Servidor indisponível. Verifique sua conexão.");}
  const data=await r.json().catch(()=>({error:"Resposta inválida."}));
  if(!r.ok)throw Error((data.error||"Erro de solicitação.")+(data.details?" — "+data.details.slice(0,5).join(" | "):""));
  return data;
}
function button(label,action,cls="secondary",extra=""){return `<button type="button" class="${cls}" data-action="${esc(action)}" ${extra}>${esc(label)}</button>`;}
function authScreen(){ $("auth").classList.remove("hidden");$("app").classList.add("hidden");$("userbar").innerHTML=""; }
async function load() {
  const sc=await api("/api/schema");state.schema=sc.schema;state.rubric=sc.rubric;
  try{const me=await api("/api/me");state.user=me.user;state.csrf=me.csrf;await enter();}
  catch(e){authScreen();}
}
async function enter(){
  $("auth").classList.add("hidden");$("app").classList.remove("hidden");
  $("userbar").innerHTML=`<div class="small" style="color:#d5e9ec">${esc(state.user.name)} · ${state.user.role==="teacher"?"Professor":`Trio ${state.user.trio}`}</div>${button("Alterar senha","change-password","secondary")} ${button("Sair","logout","secondary")}`;
  if(state.user.role==="student"){await refreshStudent();state.view="home";renderStudent();}
  else{await refreshGroups();state.view="teacher";renderTeacher();}
}
async function refreshStudent(){state.dossier=await api("/api/dossier");}
async function refreshGroups(){state.groups=(await api("/api/teacher/groups")).groups;}
function statusBadge(x){return `<span class="pill ${esc(x)}">${({reviewed:"Revisado",waived:"Dispensado",draft:"Rascunho"})[x]||esc(x)}</span>`;}
function stats(data){
  const complete=Object.values(data.docs).filter(d=>d.status==="reviewed"||d.status==="waived").length;
  return `<div class="stats"><span class="stat"><b>${complete}/28</b> documentos concluídos</span><span class="stat"><b>${data.members.length}/6</b> estudantes</span><span class="stat">${data.group.submitted_at?`Entregue · ${esc(data.group.protocol)}`:"Entrega ainda aberta"}</span></div><div class="progress"><div style="width:${complete/28*100}%"></div></div>`;
}
function studentSidebar(){
  const d=state.dossier;
  let h=`<div class="navhead">EQUIPE ${esc(d.group.name)}</div><button class="${state.view==="home"?"active":""}" data-action="home">Visão geral e entrega</button><button class="${state.view==="audit"?"active":""}" data-action="audit">Auditoria documental</button>`;
  let last="";
  for(const m of state.schema){
    let heading=m.id.startsWith("G")?"Documentos conjuntos":m.id.startsWith("E")?"Trio B · Exportação":"Trio A · Importação";
    if(heading!==last){h+=`<div class="navhead">${heading}</div>`;last=heading;}
    const disabled=(m.team.startsWith("Trio A")&&state.user.trio!=="A")||(m.team.startsWith("Trio B")&&state.user.trio!=="B");
    h+=`<button class="${state.view==="doc"&&state.doc===m.id?"active":""}" data-action="open-doc" data-id="${m.id}"><span class="dot ${d.docs[m.id].status}"></span>${m.id} · ${esc(m.title)}${disabled?" <small>(consulta)</small>":""}</button>`;
  }
  $("sidebar").innerHTML=h;
}
function renderStudent(){
  studentSidebar();const d=state.dossier;
  if(state.view==="doc"){renderDocument(d,false);return;}
  if(state.view==="audit"){
    $("main").innerHTML=`<div class="hero"><h2>Auditoria de coerência</h2><p class="sub">Checagens automáticas não substituem conferência legal, tributária e pedagógica.</p>${stats(d)}</div><section class="panel"><h3>Pendências e alertas</h3><div class="audit">${esc(d.audit.length?d.audit.map((x,i)=>`${i+1}. ${x}`).join("\n"):"Nenhuma divergência automática detectada. Confirme NCM, tributos, regras de origem e fontes oficiais.")}</div></section>`;
    return;
  }
  $("main").innerHTML=`<section class="hero"><div class="eyebrow" style="color:#087e84">ATIVIDADE AVALIATIVA ND2</div><h2>${esc(d.group.name)} · Empresa importadora e exportadora</h2><p>Uma equipe de seis estudantes, dividida em dois trios. Os registros são compartilhados na equipe, mas cada grupo possui seu dossiê próprio no servidor.</p>${stats(d)}<div class="actions">${button("Atualizar andamento","refresh","secondary")}${button("Baixar dossiê JSON","export","secondary")}${button("Imprimir dossiê / PDF","print","secondary")}</div></section>
  <section class="panel"><h3>Integrantes e responsabilidades</h3><div class="tablewrap"><table><thead><tr><th>Estudante</th><th>Trio</th><th>Função</th></tr></thead><tbody>${d.members.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.trio)}</td><td>${teamLabel(m.trio)}</td></tr>`).join("")}</tbody></table></div><p class="small">São exigidos três integrantes em cada trio para a entrega final. Os formulários conjuntos podem ser editados por ambos os trios.</p></section>
  <section class="panel"><h3>Entrega final ND2</h3><p class="sub">Prazo informado pelo professor: <b>${esc(d.group.due_date||"a definir")}</b>. O prazo é informativo; o professor controla a abertura e o fechamento das entregas.</p>
  ${d.group.submitted_at?`<div class="good"><b>Trabalho enviado.</b> Protocolo acadêmico: <span class="mono">${esc(d.group.protocol)}</span><br>Data/hora UTC: ${esc(d.group.submitted_at)}</div>`:d.group.closed?`<div class="warning">Entrega encerrada pelo professor.</div>`:`<div class="note">Antes de enviar: 6 integrantes cadastrados, 28 documentos revisados ou dispensados quando permitido, fontes oficiais e cálculos conferidos. A entrega bloqueia novas edições até eventual reabertura.</div>${button("Enviar trabalho final da equipe","submit","primary")}`}
  ${d.grade?`<div class="good"><b>Nota ND2: ${Object.values(d.grade.rubric).reduce((a,b)=>a+b,0).toLocaleString("pt-BR")} / 100</b><p>${esc(d.grade.feedback)}</p></div>`:""}
  </section>`;
}
function docPermission(m,teacher=false){
  if(teacher)return false;
  return !(state.dossier.group.submitted_at||state.dossier.group.closed||
    (m.team.startsWith("Trio A")&&state.user.trio!=="A")||
    (m.team.startsWith("Trio B")&&state.user.trio!=="B"));
}
function renderDocument(d,teacher=false){
  const m=state.schema.find(x=>x.id===state.doc);
  const rec=d.docs[m.id],canEdit=docPermission(m,teacher);
  const fields=m.fields.map(f=>{
    const value=rec.values[f.key]??"";
    const element=f.type==="textarea"?
      `<textarea data-field="${esc(f.key)}" ${canEdit?"":"disabled"}>${esc(value)}</textarea>`:
      `<input type="${f.type==="number"?"number":"text"}" ${f.type==="number"?'step="any"':""} data-field="${esc(f.key)}" value="${esc(value)}" ${canEdit?"":"disabled"}>`;
    return `<div class="field ${f.type==="textarea"?"full":""}"><label>${esc(f.label)} ${f.required?'<span style="color:#a33">*</span>':""}</label>${element}</div>`;
  }).join("");
  $("main").innerHTML=`<div class="hero"><h2>${m.id} · ${esc(m.title)}</h2><p class="sub">${esc(m.stage)} · ${esc(m.team)}</p><div class="stats">${statusBadge(rec.status)}<span class="stat">Última atualização: ${esc(rec.updated_at||"não salvo")}</span></div>${m.note?`<div class="note">${esc(m.note)}</div>`:""}${!canEdit?`<div class="warning">Modo de consulta: ${teacher?"painel do professor":"documento de outro trio ou entrega encerrada"}.</div>`:""}</div>
  <section class="panel"><div class="grid">${fields}</div>${m.conditional?`<label>Justificativa para dispensa (se não aplicável, com fonte oficial)<textarea id="waiver" ${canEdit?"":"disabled"}>${esc(rec.waiver)}</textarea></label>`:""}
  ${canEdit?`<div class="actions">${button("Salvar rascunho","save","secondary")}${button("Validar e revisar","review","primary")}${m.conditional?button("Dispensar com justificativa","waive","gold"):""}${button("Imprimir documento","print-one","secondary")}</div><p class="small">Salvamento automático após 3 segundos sem digitar. Se outro integrante alterar este documento, o sistema impedirá sobrescrita silenciosa.</p>`:`<div class="actions">${button("Imprimir documento","print-one","secondary")}</div>`}
  <p class="small">Espelho didático simplificado. Não é documento fiscal, aduaneiro, bancário ou de transporte oficial.</p></section>`;
}
function collectDoc(){
  const m=state.schema.find(x=>x.id===state.doc);
  const values={};
  $("main").querySelectorAll("[data-field]").forEach(el=>values[el.dataset.field]=el.value);
  return {id:m.id,values,waiver:$("waiver")?.value||""};
}
async function saveDoc(status="draft",silent=false){
  if(state.saving)return false;
  if(!state.dossier||state.view!=="doc")return true;
  const m=state.schema.find(x=>x.id===state.doc);
  if(!docPermission(m))return true;
  clearTimeout(state.timer);state.saving=true;
  const doc=collectDoc();const current=state.dossier.docs[m.id];
  try{
    const result=await api("/api/doc","POST",{...doc,status,version:current.updated_at});
    current.values=doc.values;current.waiver=doc.waiver;current.status=status;current.updated_at=result.saved_at;
    state.dirty=false;
    studentSidebar();
    if(!silent)notice(status==="draft"?"Rascunho salvo no servidor.":status==="waived"?"Dispensa acadêmica registrada.":"Documento validado e revisado.");
    return true;
  }catch(e){notice(e.message,true);return false;}
  finally{state.saving=false;}
}
function teacherSidebar(){
  $("sidebar").innerHTML=`<div class="navhead">PAINEL DO PROFESSOR</div><button class="${state.view==="teacher"?"active":""}" data-action="teacher-home">Equipes e entregas</button><button data-action="teacher-new">Cadastrar equipe</button><div class="navhead">CONSULTA</div>${state.selected?`<button data-action="teacher-detail">Equipe selecionada</button><button data-action="teacher-audit">Auditoria</button><button data-action="teacher-grade">Lançar nota ND2</button><div class="navhead">FORMULÁRIOS</div>${state.schema.map(m=>`<button class="${state.view==="teacher-doc"&&state.doc===m.id?"active":""}" data-action="teacher-doc" data-id="${m.id}">${m.id} · ${esc(m.title)}</button>`).join("")}`:"<p class='small'>Selecione uma equipe para consultar o dossiê.</p>"}`;
}
function renderTeacher(){
  teacherSidebar();
  if(state.view==="teacher-new"){
    $("main").innerHTML=`<section class="panel"><h2>Cadastrar nova equipe</h2><p>Uma equipe de seis alunos, organizada em dois trios. O código gerado deve ser entregue somente aos integrantes.</p><form id="createGroup"><label>Nome da equipe<input name="name" placeholder="Ex.: Equipe 01 — Araguaína Trading" required></label><label>Data de entrega (opcional)<input name="due_date" type="date"></label><button class="primary">Criar equipe e código</button></form></section>`;return;
  }
  if(state.view==="teacher"){
    $("main").innerHTML=`<div class="hero"><h2>Monitoramento da atividade ND2</h2><p>Crie equipes, acompanhe 28 formulários por grupo, confira protocolos e registre notas individuais por equipe.</p><div class="actions">${button("Criar equipe","teacher-new","primary")}${button("Atualizar painel","teacher-refresh","secondary")}</div></div><section class="panel"><h3>Equipes cadastradas (${state.groups.length})</h3><div class="tablewrap"><table><thead><tr><th>Equipe</th><th>Código de convite</th><th>Integrantes</th><th>Formulários</th><th>Entrega</th><th>Nota</th><th>Abrir</th></tr></thead><tbody>${state.groups.map(g=>`<tr><td><b>${esc(g.name)}</b></td><td class="mono">${esc(g.invite)}</td><td>${g.members}/6</td><td>${g.completed}/28</td><td>${g.submitted_at?`<span class="pill submitted">Entregue</span><div class="small">${esc(g.protocol)}</div>`:g.closed?"Encerrada":"Em andamento"}</td><td>${g.score??"—"}</td><td>${button("Visualizar","teacher-open","secondary",`data-id="${g.id}"`)}</td></tr>`).join("")||"<tr><td colspan='7'>Nenhuma equipe criada.</td></tr>"}</tbody></table></div></section>`;return;
  }
  const d=state.selected;
  if(!d){state.view="teacher";renderTeacher();return;}
  if(state.view==="teacher-doc"){renderDocument(d,true);return;}
  if(state.view==="teacher-audit"){
    $("main").innerHTML=`<div class="hero"><h2>Auditoria · ${esc(d.group.name)}</h2>${stats(d)}</div><section class="panel"><div class="audit">${esc(d.audit.length?d.audit.map((x,i)=>`${i+1}. ${x}`).join("\n"):"Sem pendências detectadas pela auditoria automática.")}</div></section>`;return;
  }
  if(state.view==="teacher-grade"){
    const old=d.grade?.rubric||{};
    $("main").innerHTML=`<section class="panel"><h2>Avaliação ND2 · ${esc(d.group.name)}</h2>${d.group.submitted_at?"<div class='good'>Equipe entregou o trabalho.</div>":"<div class='warning'>Ainda não entregue. A nota só pode ser lançada após o envio.</div>"}
    <form id="gradeForm">${state.rubric.map(([k,label,max])=>`<label>${esc(label)} · máximo ${max} pontos<input name="${esc(k)}" type="number" min="0" max="${max}" step="0.5" value="${esc(old[k]??0)}" required></label>`).join("")}
    <label>Devolutiva do professor<textarea name="feedback" placeholder="Pontos fortes, correções documentais, justificativas e recomendações">${esc(d.grade?.feedback||"")}</textarea></label><button class="primary" ${d.group.submitted_at?"":"disabled"}>Registrar nota da equipe</button></form></section>`;return;
  }
  $("main").innerHTML=`<section class="hero"><h2>${esc(d.group.name)}</h2><p>Código de convite: <b class="mono">${esc(d.group.invite)}</b> · Prazo: ${esc(d.group.due_date||"não definido")}</p>${stats(d)}<div class="actions">${button("Baixar dossiê JSON","teacher-export","secondary")}${button("Imprimir dossiê / PDF","print","secondary")}${button("Auditoria","teacher-audit","secondary")}${button("Avaliar ND2","teacher-grade","primary")}${d.group.submitted_at?button("Reabrir entrega","teacher-reopen","gold"):button(d.group.closed?"Reabrir inscrições":"Encerrar inscrições","teacher-toggle","gold")}</div>${d.group.submitted_at?`<div class="good">Protocolo: <b class="mono">${esc(d.group.protocol)}</b> · ${esc(d.group.submitted_at)} (UTC)</div>`:""}</section>
  <section class="panel"><h3>Integrantes</h3><div class="tablewrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Trio</th><th>Gestão</th></tr></thead><tbody>${d.members.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${esc(m.trio)} · ${teamLabel(m.trio)}</td><td>${button("Nova senha","teacher-reset-member","secondary",`data-id="${m.id}"`)} ${button("Remover","teacher-remove-member","danger",`data-id="${m.id}"`)}</td></tr>`).join("")}</tbody></table></div></section>
  <section class="panel"><h3>Andamento documental</h3><div class="tablewrap"><table><thead><tr><th>Módulo</th><th>Responsável</th><th>Status</th><th>Consulta</th></tr></thead><tbody>${state.schema.map(m=>`<tr><td>${m.id} · ${esc(m.title)}</td><td>${esc(m.team)}</td><td>${statusBadge(d.docs[m.id].status)}</td><td>${button("Ver","teacher-doc","secondary",`data-id="${m.id}"`)}</td></tr>`).join("")}</tbody></table></div></section>
  ${d.grade?`<section class="panel"><h3>Nota lançada: ${Object.values(d.grade.rubric).reduce((a,b)=>a+b,0)}/100</h3><p>${esc(d.grade.feedback)}</p></section>`:""}`;
}
async function openTeacherGroup(id){
  state.selected=await api("/api/teacher/group?id="+encodeURIComponent(id));
  state.view="teacher-detail";renderTeacher();
}
function printDossier(single=false){
  const d=state.user.role==="teacher"?state.selected:state.dossier;
  if(!d)return;
  const mods=single?state.schema.filter(m=>m.id===state.doc):state.schema;
  $("printArea").innerHTML=mods.map(m=>{
    const r=d.docs[m.id];
    return `<section class="printpage"><div class="printhead"><span class="watermark">SIMULAÇÃO ACADÊMICA · SEM VALIDADE LEGAL</span><h2>${esc(m.id)} · ${esc(m.title)}</h2><p>Equipe: ${esc(d.group.name)} · ${esc(m.team)} · ${esc(r.status)}</p><p>Protocolo de entrega: ${esc(d.group.protocol||"AINDA NÃO ENTREGUE")}</p></div>${m.fields.map(f=>`<div class="printrow"><b>${esc(f.label)}</b><span>${esc(r.values[f.key]||"—")}</span></div>`).join("")}${r.waiver?`<div class="printrow"><b>Dispensa</b><span>${esc(r.waiver)}</span></div>`:""}<p class="small">Documento acadêmico. Não é NF-e, DU-E, Duimp ou registro oficial.</p></section>`;
  }).join("");
  window.print();
}
async function changeView(view){
  if(state.user.role==="student"&&state.view==="doc"&&state.dirty){
    const ok=await saveDoc("draft",true);if(!ok)return;
  }
  state.view=view;
  if(state.user.role==="student")renderStudent();else renderTeacher();
}
document.addEventListener("click",async e=>{
  const btn=e.target.closest("[data-action]");if(!btn)return;
  const action=btn.dataset.action;
  try{
    if(action==="change-password"){$("passwordDialog").showModal();return;}
    if(action==="close-dialog"){$("passwordDialog").close();return;}
    if(action==="logout"){await api("/api/logout","POST");state.user=null;authScreen();return;}
    if(action==="home"||action==="audit"){await changeView(action);return;}
    if(action==="open-doc"){if(state.view==="doc"&&state.dirty){if(!await saveDoc("draft",true))return;}state.doc=btn.dataset.id;state.view="doc";state.dirty=false;renderStudent();return;}
    if(action==="save"||action==="review"||action==="waive"){await saveDoc(action==="save"?"draft":action==="review"?"reviewed":"waived");if(action!=="save"){await refreshStudent();renderStudent();}return;}
    if(action==="refresh"){await refreshStudent();renderStudent();notice("Dados atualizados.");return;}
    if(action==="submit"){
      if(state.view==="doc"&&state.dirty){if(!await saveDoc("draft"))return;}
      if(!confirm("Enviar definitivamente o trabalho de toda a equipe? O dossiê ficará bloqueado até reabertura pelo professor."))return;
      const r=await api("/api/submit","POST");await refreshStudent();state.view="home";renderStudent();notice("Entrega registrada! Protocolo "+r.protocol);return;
    }
    if(action==="export"||action==="teacher-export"){
      const gid=state.user.role==="teacher"?"?id="+state.selected.group.id:"";
      window.location.href="/api/export"+gid;return;
    }
    if(action==="print"||action==="print-one"){if(state.user.role==="student"&&state.view==="doc"&&state.dirty){if(!await saveDoc("draft"))return;}printDossier(action==="print-one");return;}
    if(action==="teacher-home"){state.view="teacher";renderTeacher();return;}
    if(action==="teacher-new"){state.view="teacher-new";renderTeacher();return;}
    if(action==="teacher-refresh"){await refreshGroups();state.view="teacher";renderTeacher();notice("Painel atualizado.");return;}
    if(action==="teacher-open"){await openTeacherGroup(btn.dataset.id);return;}
    if(action==="teacher-detail"||action==="teacher-audit"||action==="teacher-grade"){state.view=action;renderTeacher();return;}
    if(action==="teacher-doc"){state.doc=btn.dataset.id;state.view="teacher-doc";renderTeacher();return;}
    if(action==="teacher-reset-member"){
      if(!confirm("Redefinir a senha deste estudante? A senha anterior deixará de funcionar."))return;
      const r=await api("/api/teacher/reset-member","POST",{user_id:Number(btn.dataset.id)});
      prompt("Copie a senha temporária e envie SOMENTE ao estudante. Ela não será exibida novamente:",r.temporary_password);
      return;
    }
    if(action==="teacher-remove-member"){
      if(!confirm("Remover este estudante da equipe? Essa ação não pode ser desfeita."))return;
      await api("/api/teacher/remove-member","POST",{user_id:Number(btn.dataset.id)});
      await openTeacherGroup(state.selected.group.id);notice("Estudante removido.");return;
    }
    if(action==="teacher-reopen"){
      if(!confirm("Reabrir entrega? A nota eventualmente lançada será apagada."))return;
      await api("/api/teacher/reopen","POST",{group_id:state.selected.group.id});await openTeacherGroup(state.selected.group.id);notice("Entrega reaberta.");return;
    }
    if(action==="teacher-toggle"){
      await api("/api/teacher/close","POST",{group_id:state.selected.group.id,closed:!state.selected.group.closed});await openTeacherGroup(state.selected.group.id);return;
    }
  }catch(err){notice(err.message,true);}
});
document.addEventListener("input",e=>{
  if(!state.user||state.user.role!=="student"||state.view!=="doc")return;
  if(!e.target.matches("[data-field],#waiver"))return;
  state.dirty=true;
  clearTimeout(state.timer);
  state.timer=setTimeout(()=>{if(state.dirty)saveDoc("draft",true);},3000);
});
document.addEventListener("submit",async e=>{
  const form=e.target;
  if(!["loginForm","registerForm","createGroup","gradeForm","passwordForm"].includes(form.id))return;
  e.preventDefault();
  const data=Object.fromEntries(new FormData(form));
  try{
    if(form.id==="passwordForm"){await api("/api/change-password","POST",data);form.reset();$("passwordDialog").close();notice("Senha alterada com sucesso.");}
    else if(form.id==="loginForm"){const r=await api("/api/login","POST",data);state.user=r.user;state.csrf=r.csrf;await enter();notice("Acesso autorizado.");}
    else if(form.id==="registerForm"){await api("/api/register","POST",data);form.reset();notice("Conta criada. Agora faça login.");}
    else if(form.id==="createGroup"){const r=await api("/api/teacher/create","POST",data);await refreshGroups();state.view="teacher";renderTeacher();notice("Equipe criada. Código para os estudantes: "+r.invite);}
    else if(form.id==="gradeForm"){const rubric={};for(const [k] of state.rubric)rubric[k]=Number(data[k]);const r=await api("/api/teacher/grade","POST",{group_id:state.selected.group.id,rubric,feedback:data.feedback});await openTeacherGroup(state.selected.group.id);notice("Nota registrada: "+r.score+"/100.");}
  }catch(err){notice(err.message,true);}
});
if (location.protocol === "file:") {
  $("offlineHelp").classList.remove("hidden");
  $("auth").classList.add("hidden");
} else {
  load().catch(e=>notice(e.message,true));
}
})();