import { firebaseConfig } from './firebase-config.js';

const status = document.getElementById('deliveryStatus');
const login = document.getElementById('deliveryLogin');
const email = document.getElementById('deliveryEmail');
const password = document.getElementById('deliveryPassword');
const send = document.getElementById('submitDelivery');
const panel = document.getElementById('teacherPanel');
const logout = document.getElementById('deliveryLogout');
const results = document.getElementById('deliveryResults');
const report = message => { status.textContent = message; };

function element(tag, parent, content) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  parent.append(node);
  return node;
}

function showDeliveries(deliveries) {
  results.replaceChildren();
  element('h4', results, 'Painel do Professor');
  if (!deliveries.length) element('p', results, 'Nenhuma entrega recebida.');
  for (const delivery of deliveries) {
    const group = element('details', results);
    const date = delivery.sentAt.toDate().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    element('summary', group, [delivery.turma, delivery.grupo, date].join(' · '));
    for (const model of schema) {
      const documentData = delivery.docs[model.id];
      if (!documentData || typeof documentData !== 'object') continue;
      const section = element('details', group);
      const state = { draft: 'Rascunho', reviewed: 'Revisado', waived: 'Dispensado' }[documentData.status] || 'Registrado';
      element('summary', section, model.id + ' · ' + model.title + ' · ' + state);
      const fields = element('dl', section);
      for (const field of model.fields) {
        element('dt', fields, field.label);
        const value = element('dd', fields, documentData.values?.[field.key] || '—');
        value.style.whiteSpace = 'pre-wrap';
      }
      if (documentData.waiver) element('p', section, 'Justificativa: ' + documentData.waiver);
      if (documentData.protocol) element('p', section, 'Protocolo acadêmico: ' + documentData.protocol);
    }
  }
}

async function start() {
  if (!firebaseConfig) return;
  const sdk = 'https://www.gstatic.com/firebasejs/11.10.0/';
  const [{ initializeApp }, authApi, dbApi] = await Promise.all([
    import(sdk + 'firebase-app.js'),
    import(sdk + 'firebase-auth.js'),
    import(sdk + 'firebase-firestore.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authApi.getAuth(app);
  await authApi.setPersistence(auth, authApi.browserSessionPersistence);
  const db = dbApi.getFirestore(app);
  const records = dbApi.collection(db, 'comexEntregas');
  let profile;

  authApi.onAuthStateChanged(auth, async user => {
    profile = undefined;
    results.replaceChildren();
    send.disabled = panel.disabled = true;
    login.hidden = Boolean(user);
    logout.hidden = !user;
    if (!user) {
      report('Entre com a conta fornecida pelo professor.');
      return;
    }
    report('Verificando acesso…');
    try {
      const snapshot = await dbApi.getDocFromServer(dbApi.doc(db, 'comexAcessos', user.uid));
      if (auth.currentUser !== user) return;
      profile = snapshot.data();
      send.disabled = profile?.role !== 'grupo';
      panel.disabled = profile?.role !== 'professor';
      report(profile?.role === 'grupo' ? profile.turma + ' · ' + profile.grupo :
        profile?.role === 'professor' ? 'Acesso do professor ativo.' : 'Conta sem acesso cadastrado.');
    } catch {
      if (auth.currentUser === user) report('Não foi possível verificar o acesso. Saia e entre novamente.');
    }
  });

  login.addEventListener('submit', async event => {
    event.preventDefault();
    const button = login.querySelector('button');
    button.disabled = true;
    try {
      await authApi.signInWithEmailAndPassword(auth, email.value.trim(), password.value);
    } catch {
      report('Não foi possível entrar. Confira o e-mail, a senha e a conexão.');
    } finally {
      password.value = '';
      button.disabled = false;
    }
  });

  logout.addEventListener('click', async () => {
    try { await authApi.signOut(auth); }
    catch { report('Não foi possível sair. Tente novamente.'); }
  });

  send.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user || profile?.role !== 'grupo') return;
    saveForm(false);
    const docs = {};
    for (const model of schema) {
      const data = store.docs[model.id];
      if (!data) continue;
      const hasAnswers = Object.values(data.values || {}).some(value => String(value).trim());
      if (hasAnswers || data.waiver) docs[model.id] = data;
    }
    if (!Object.keys(docs).length) {
      report('Preencha ao menos um formulário antes de entregar.');
      return;
    }
    if (new TextEncoder().encode(JSON.stringify(docs)).length > 750000) {
      report('O conteúdo excede o limite de envio. Avise o professor.');
      return;
    }
    send.disabled = true;
    report('Registrando a entrega…');
    try {
      const reference = await dbApi.addDoc(records, {
        uid: user.uid, turma: profile.turma, grupo: profile.grupo,
        docs, sentAt: dbApi.serverTimestamp()
      });
      if (auth.currentUser === user) report('Entrega registrada. Protocolo: ' + reference.id);
    } catch {
      if (auth.currentUser === user) report('A entrega não foi confirmada. Confira a conexão e tente novamente.');
    } finally {
      if (auth.currentUser === user) send.disabled = false;
    }
  });

  panel.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user || profile?.role !== 'professor') return;
    panel.disabled = true;
    report('Consultando entregas…');
    try {
      const snapshot = await dbApi.getDocsFromServer(records);
      const deliveries = snapshot.docs.map(item => item.data()).sort((a, b) =>
        a.turma.localeCompare(b.turma, 'pt-BR') || a.grupo.localeCompare(b.grupo, 'pt-BR', { numeric: true }) ||
        b.sentAt.toMillis() - a.sentAt.toMillis());
      if (auth.currentUser === user) {
        showDeliveries(deliveries);
        report(deliveries.length + ' entrega(s) registrada(s).');
      }
    } catch {
      if (auth.currentUser === user) report('Não foi possível consultar as entregas. Tente novamente.');
    } finally {
      if (auth.currentUser === user) panel.disabled = false;
    }
  });
}

start().catch(() => report('Não foi possível conectar ao serviço de entregas. Recarregue a página.'));
