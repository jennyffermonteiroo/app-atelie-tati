/* ══════════════════════════════════════════
   ATELIÊ TATI BRANDÃO — Gestão Financeira
   script.js — versão Supabase
══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   ⚙️  CONFIGURAÇÃO — preencha com os seus dados
   Supabase → Settings → API
══════════════════════════════════════════ */
const SUPABASE_URL  = 'https://ibvoffzemhvvgyygadsk.supabase.co';       // ex: https://xyzabc.supabase.co
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlidm9mZnplbWh2dmd5eWdhZHNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MTU4MDcsImV4cCI6MjA5MTQ5MTgwN30.nBd_2vQsBbdBfDMUGT15AmM7wlK2hTZcSdE_6bZiuqI'; // começa com eyJ...

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

/* ══════════════════════════════════════════
   USUÁRIOS (autenticação local — senhas no front)
   Para produção futura: migrar para Supabase Auth
══════════════════════════════════════════ */
const USERS = {
  fabiola: { name: 'Fabíola', pass: '0308',  role: 'colab' },
  kaylane: { name: 'Kaylane', pass: '1234',  role: 'colab' },
  tati:    { name: 'Tati',    pass: '1234',  role: 'colab' },
  salao:   { name: 'Salão',   pass: 'admin', role: 'dona'  },
};

const COLABS = ['fabiola', 'kaylane', 'tati'];

let currentUser      = null;
let editingId        = null;

/* ══════════════════════════════════════════
   ESTADO (cache local — carregado do Supabase)
══════════════════════════════════════════ */
let records          = [];
let despesas         = [];
let caixaFechamentos = [];

/* ══════════════════════════════════════════
   HELPERS — UI
══════════════════════════════════════════ */
function showLoading(show) {
  document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function showToast(msg, tipo = 'ok') {
  // Usa os campos de success-msg existentes no contexto atual
  const ids = ['reg-msg','desp-msg','cx-msg'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.offsetParent !== null) {
      el.textContent = msg;
      el.style.color = tipo === 'erro' ? 'var(--danger)' : 'var(--success)';
      setTimeout(() => { el.textContent = ''; el.style.color = ''; }, 3000);
    }
  });
}

/* ══════════════════════════════════════════
   HELPERS — FORMATAÇÃO
══════════════════════════════════════════ */
function brl(v) {
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(d) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function fmtFull(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ══════════════════════════════════════════
   HELPERS — DATA
══════════════════════════════════════════ */

/** "YYYY-MM-DD" → timestamp local às 12h */
function dateInputToTs(dateStr) {
  if (!dateStr) return Date.now();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

/** timestamp → "YYYY-MM-DD" */
function tsToDateInput(ts) {
  const d  = new Date(ts);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** timestamp → "YYYY-MM-DD" para salvar no Supabase (coluna date) */
function tsToDateDB(ts) {
  return tsToDateInput(ts);
}

/** "YYYY-MM-DD" (string do Supabase) → timestamp local às 12h */
function dateDBToTs(dateStr) {
  return dateInputToTs(dateStr);
}

function setDefaultDate() {
  const el = document.getElementById('r-data');
  if (el) el.value = tsToDateInput(Date.now());
}

/* ══════════════════════════════════════════
   HELPERS — QUINZENA
   Ciclo: 21 → 05 e 06 → 20
══════════════════════════════════════════ */
function getQuinzena(ts) {
  const dt  = new Date(ts);
  const day = dt.getDate();
  const m   = dt.getMonth();
  const y   = dt.getFullYear();

  let s, e;
  if (day >= 21) {
    s = new Date(y, m, 21);
    e = new Date(y, m + 1, 5);
  } else if (day <= 5) {
    s = new Date(y, m - 1, 21);
    e = new Date(y, m, 5);
  } else {
    s = new Date(y, m, 6);
    e = new Date(y, m, 20);
  }
  return { s, e, label: `${fmtShort(s)} – ${fmtShort(e)}` };
}

function quinzenaKey(ts) {
  return getQuinzena(ts).s.toISOString().slice(0, 10);
}

function inQuinzena(ts, q) {
  return ts >= q.s.getTime() && ts <= q.e.getTime() + 86_399_999;
}

function isToday(ts) {
  const d = new Date(ts);
  const n = new Date();
  return d.getDate()     === n.getDate()
      && d.getMonth()    === n.getMonth()
      && d.getFullYear() === n.getFullYear();
}

function agruparPorQuinzena(list) {
  const map = new Map();
  list.forEach(r => {
    const key = quinzenaKey(r.ts);
    if (!map.has(key)) {
      const q = getQuinzena(r.ts);
      map.set(key, { key, label: q.label, s: q.s, items: [] });
    }
    map.get(key).items.push(r);
  });
  return Array.from(map.values()).sort((a, b) => b.s - a.s);
}

/* ══════════════════════════════════════════
   SUPABASE — CARREGAR DADOS
══════════════════════════════════════════ */

/** Converte linha do Supabase (tabela records) para objeto interno */
function rowToRecord(row) {
  return {
    id:      row.id,
    user:    row.user_key,
    type:    row.type,
    desc:    row.descricao,
    cliente: row.cliente || '',
    val:     parseFloat(row.valor),
    ts:      dateDBToTs(row.data_ref),
    fechado: row.fechado || false,
  };
}

/** Converte linha do Supabase (tabela despesas) para objeto interno */
function rowToDespesa(row) {
  return {
    id:    row.id,
    desc:  row.descricao,
    val:   parseFloat(row.valor),
    ts:    dateDBToTs(row.data_ref),
  };
}

/** Converte linha do Supabase (tabela caixa_fechamentos) para objeto interno */
function rowToFechamento(row) {
  return {
    id:  row.id,
    val: parseFloat(row.valor),
    ts:  new Date(row.criado_em).getTime(),
  };
}

async function loadAll() {
  showLoading(true);
  try {
    const [rRecords, rDespesas, rFechamentos] = await Promise.all([
      db.from('records').select('*').order('data_ref', { ascending: false }),
      db.from('despesas').select('*').order('data_ref', { ascending: false }),
      db.from('caixa_fechamentos').select('*').order('criado_em', { ascending: false }),
    ]);

    if (rRecords.error)    throw rRecords.error;
    if (rDespesas.error)   throw rDespesas.error;
    if (rFechamentos.error) throw rFechamentos.error;

    records          = (rRecords.data    || []).map(rowToRecord);
    despesas         = (rDespesas.data   || []).map(rowToDespesa);
    caixaFechamentos = (rFechamentos.data || []).map(rowToFechamento);
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    alert('Erro ao conectar com o banco de dados. Verifique a URL e a chave do Supabase.');
  } finally {
    showLoading(false);
  }
}

/* ══════════════════════════════════════════
   SUPABASE — SALVAR / EDITAR / (futuro: deletar)
══════════════════════════════════════════ */

async function insertRecord(obj) {
  const { data, error } = await db.from('records').insert({
    user_key:  obj.user,
    type:      obj.type,
    descricao: obj.desc,
    cliente:   obj.cliente || '',
    valor:     obj.val,
    data_ref:  tsToDateDB(obj.ts),
    fechado:   false,
  }).select().single();

  if (error) throw error;
  return rowToRecord(data);
}

async function updateRecord(obj) {
  const { error } = await db.from('records').update({
    descricao: obj.desc,
    cliente:   obj.cliente || '',
    valor:     obj.val,
    data_ref:  tsToDateDB(obj.ts),
    fechado:   obj.fechado,
  }).eq('id', obj.id);

  if (error) throw error;
}

async function insertDespesa(obj) {
  const { data, error } = await db.from('despesas').insert({
    descricao: obj.desc,
    valor:     obj.val,
    data_ref:  tsToDateDB(obj.ts),
  }).select().single();

  if (error) throw error;
  return rowToDespesa(data);
}

async function insertFechamento(valor) {
  const { data, error } = await db.from('caixa_fechamentos').insert({
    valor,
  }).select().single();

  if (error) throw error;
  return rowToFechamento(data);
}

/* ══════════════════════════════════════════
   AUTH
══════════════════════════════════════════ */
async function doLogin() {
  const key  = document.getElementById('login-user').value;
  const pass = document.getElementById('login-pass').value;
  const err  = document.getElementById('login-err');

  if (!key) { err.textContent = 'Selecione um perfil.'; return; }

  const user = USERS[key];
  if (pass !== user.pass) { err.textContent = 'Senha incorreta.'; return; }

  err.textContent = '';
  currentUser = { key, ...user };

  await loadAll();

  if (user.role === 'dona') {
    showScreen('s-dona');
    renderDona();
  } else {
    document.getElementById('colab-name-top').textContent = user.name;
    showScreen('s-colab');
    setDefaultDate();
    renderColab();
  }
}

function logout() {
  currentUser = null;
  records = []; despesas = []; caixaFechamentos = [];
  showScreen('s-login');
  document.getElementById('login-pass').value = '';
  document.getElementById('login-user').value = '';
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.toggle('active', s.id === id);
  });
}

/* ══════════════════════════════════════════
   NAVEGAÇÃO POR ABAS
══════════════════════════════════════════ */
function switchTab(screen, tab) {
  const allTabs = ['inicio','registrar','historico','painel','equipe','despesas','caixa'];

  allTabs.forEach(t => {
    const el = document.getElementById(`${screen}-${t}`);
    if (el) el.classList.remove('active');
  });

  const target = document.getElementById(`${screen}-${tab}`);
  if (target) target.classList.add('active');

  document.querySelectorAll(`#s-${screen} .nav-btn`).forEach(btn => {
    const fn = btn.getAttribute('onclick') || '';
    btn.classList.toggle('active', fn.includes(`'${tab}'`));
  });

  if (screen === 'dona') {
    if      (tab === 'painel')   renderDonaPainel();
    else if (tab === 'equipe')   renderEquipe();
    else if (tab === 'despesas') renderDespesas();
    else if (tab === 'caixa')    renderCaixa();
  } else {
    if (tab === 'registrar') setDefaultDate();
    renderColab();
  }
}

/* ══════════════════════════════════════════
   TOGGLE GANHO / VALE
══════════════════════════════════════════ */
let regTipo = 'ganho';

function setTipo(t) {
  regTipo = t;
  document.getElementById('tog-ganho').classList.toggle('active', t === 'ganho');
  document.getElementById('tog-vale').classList.toggle('active',  t === 'vale');
  document.getElementById('form-ganho').style.display = t === 'ganho' ? 'block' : 'none';
  document.getElementById('form-vale').style.display  = t === 'vale'  ? 'block' : 'none';
}

/* ══════════════════════════════════════════
   REGISTRAR (colaboradora)
══════════════════════════════════════════ */
async function registrar() {
  let val, desc, cliente = '';

  if (regTipo === 'ganho') {
    val     = parseFloat(document.getElementById('r-valor-g').value);
    cliente = document.getElementById('r-cliente').value.trim();
    desc    = 'Atendimento' + (cliente ? ' — ' + cliente : '');
    if (!cliente || isNaN(val) || val <= 0) {
      alert('Preencha o nome da cliente e o valor.');
      return;
    }
  } else {
    val  = parseFloat(document.getElementById('r-valor-v').value);
    desc = document.getElementById('r-desc-v').value.trim();
    if (!desc || isNaN(val) || val <= 0) {
      alert('Preencha a descrição e o valor.');
      return;
    }
  }

  const ts = dateInputToTs(document.getElementById('r-data').value);

  showLoading(true);
  try {
    const novo = await insertRecord({
      user: currentUser.key,
      type: regTipo,
      desc,
      cliente,
      val,
      ts,
    });

    records.unshift(novo);

    document.getElementById('r-cliente').value = '';
    document.getElementById('r-valor-g').value = '';
    document.getElementById('r-desc-v').value  = '';
    document.getElementById('r-valor-v').value = '';
    setDefaultDate();

    const msg = document.getElementById('reg-msg');
    msg.textContent = 'Registrado com sucesso!';
    setTimeout(() => msg.textContent = '', 2500);

    renderColab();
  } catch (err) {
    console.error('Erro ao registrar:', err);
    alert('Erro ao salvar. Tente novamente.');
  } finally {
    showLoading(false);
  }
}

/* ══════════════════════════════════════════
   RENDER — COLABORADORA
══════════════════════════════════════════ */
function renderColab() {
  if (!currentUser || currentUser.role !== 'colab') return;

  const q        = getQuinzena(Date.now());
  const myRec    = records.filter(r => r.user === currentUser.key);
  const qRec     = myRec.filter(r => inQuinzena(r.ts, q));
  const todayRec = myRec.filter(r => isToday(r.ts));

  const brutoQ   = qRec.filter(r => r.type === 'ganho').reduce((s, r) => s + r.val, 0);
  const valesQ   = qRec.filter(r => r.type === 'vale').reduce((s, r) => s + r.val, 0);
  const liquidoQ = brutoQ * 0.7 - valesQ;

  const brutoHoje = todayRec.filter(r => r.type === 'ganho').reduce((s, r) => s + r.val, 0);
  const valesHoje = todayRec.filter(r => r.type === 'vale').reduce((s, r) => s + r.val, 0);
  const diaLiq    = brutoHoje * 0.7 - valesHoje;

  document.getElementById('colab-quinzena-badge').textContent = 'Quinzena: ' + q.label;
  document.getElementById('c-saldo-dia').textContent          = brl(Math.max(0, diaLiq));
  document.getElementById('c-saldo-quinzena').textContent     = brl(Math.max(0, liquidoQ));
  document.getElementById('c-bruto').textContent              = brl(brutoQ);

  renderMovs('colab-movs', qRec.slice().sort((a,b) => b.ts - a.ts), false);
  renderHistoricoQuinzenas('colab-hist-quinzenas', myRec);
}

/* ══════════════════════════════════════════
   RENDER — MOVIMENTAÇÕES
══════════════════════════════════════════ */
function renderMovs(elId, list, showUser) {
  const el = document.getElementById(elId);
  if (!list.length) {
    el.innerHTML = '<div class="empty-state">Nenhum registro nesta quinzena.</div>';
    return;
  }
  el.innerHTML = list.map(r => movItemHtml(r, showUser)).join('');
}

function movItemHtml(r, showUser) {
  const isGanho   = r.type === 'ganho';
  const liq       = isGanho ? r.val * 0.7 : null;
  const userLabel = showUser && USERS[r.user] ? USERS[r.user].name + ' · ' : '';
  return `
    <div class="mov-item">
      <div>
        <div class="mov-desc">${r.desc}</div>
        <div class="mov-meta">${userLabel}${fmtFull(r.ts)}</div>
      </div>
      <div>
        <div class="mov-val ${isGanho ? 'pos' : 'neg'}">
          ${isGanho ? '+' : '-'}${brl(r.val)}
        </div>
        <div class="mov-type">${isGanho ? 'líq: ' + brl(liq) : 'vale'}</div>
      </div>
    </div>`;
}

/* ══════════════════════════════════════════
   RENDER — HISTÓRICO POR QUINZENA (accordion)
══════════════════════════════════════════ */
function renderHistoricoQuinzenas(elId, allRecords) {
  const el = document.getElementById(elId);

  if (!allRecords.length) {
    el.innerHTML = '<div class="empty-state">Nenhum registro ainda.</div>';
    return;
  }

  const grupos = agruparPorQuinzena(allRecords);
  const qAtual = quinzenaKey(Date.now());

  el.innerHTML = grupos.map((g, idx) => {
    const isAtual   = g.key === qAtual;
    const isOpen    = isAtual || idx === 0;
    const bruto     = g.items.filter(r => r.type === 'ganho').reduce((s, r) => s + r.val, 0);
    const vales     = g.items.filter(r => r.type === 'vale').reduce((s, r) => s + r.val, 0);
    const liquido   = bruto * 0.7 - vales;
    const itemsHtml = g.items.slice().sort((a,b) => b.ts - a.ts).map(r => movItemHtml(r, false)).join('');

    return `
      <div class="hist-group">
        <button class="hist-group-header ${isOpen ? 'open' : ''}" onclick="toggleHistGroup(this)">
          <div class="hist-group-label">
            <span class="hist-group-period">${g.label}</span>
            ${isAtual ? '<span class="hist-badge-atual">atual</span>' : ''}
          </div>
          <div class="hist-group-summary">
            <span class="hist-group-liq">${brl(Math.max(0, liquido))}</span>
            <span class="hist-group-arrow">${isOpen ? '▲' : '▼'}</span>
          </div>
        </button>
        <div class="hist-group-body ${isOpen ? 'open' : ''}">
          <div class="hist-group-totals">
            <span>Bruto: ${brl(bruto)}</span>
            <span>Vales: -${brl(vales)}</span>
            <span>Líquido: ${brl(Math.max(0, liquido))}</span>
          </div>
          <div style="padding: 0 14px">${itemsHtml}</div>
        </div>
      </div>`;
  }).join('');
}

function toggleHistGroup(btn) {
  const body   = btn.nextElementSibling;
  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  btn.classList.toggle('open', !isOpen);
  btn.querySelector('.hist-group-arrow').textContent = !isOpen ? '▲' : '▼';
}

/* ══════════════════════════════════════════
   RENDER — PROPRIETÁRIA
══════════════════════════════════════════ */
function renderDona() {
  renderDonaPainel();
  renderEquipe();
  renderDespesas();
  renderCaixa();
}

function renderDonaPainel() {
  const q = getQuinzena(Date.now());

  const qRec     = records.filter(r => inQuinzena(r.ts, q));
  const todayRec = records.filter(r => isToday(r.ts));

  const brutoQ    = qRec.filter(r => r.type === 'ganho').reduce((s, r) => s + r.val, 0);
  const salaQ     = brutoQ * 0.3;
  const brutoHoje = todayRec.filter(r => r.type === 'ganho').reduce((s, r) => s + r.val, 0);
  const salaHoje  = brutoHoje * 0.3;
  const despQ     = despesas.filter(d => inQuinzena(d.ts, q)).reduce((s, d) => s + d.val, 0);

  document.getElementById('dona-quinzena-badge').textContent = 'Quinzena: ' + q.label;
  document.getElementById('d-30-dia').textContent            = brl(salaHoje);
  document.getElementById('d-30-quin').textContent           = brl(salaQ);
  document.getElementById('d-bruto-q').textContent           = brl(brutoQ);
  document.getElementById('d-desp-q').textContent            = brl(despQ);

  const qMovs = [
    ...qRec,
    ...despesas
      .filter(d => inQuinzena(d.ts, q))
      .map(d => ({ ...d, user: 'salao', type: 'despesa', desc: '📋 ' + d.desc, cliente: '' })),
  ].sort((a, b) => b.ts - a.ts);

  const el = document.getElementById('dona-movs');
  el.innerHTML = qMovs.length
    ? qMovs.map(r => movItemHtml(r, true)).join('')
    : '<div class="empty-state">Nenhum registro nesta quinzena.</div>';
}

/* ══════════════════════════════════════════
   RENDER — ABA EQUIPE
══════════════════════════════════════════ */
function renderEquipe() {
  const q  = getQuinzena(Date.now());
  const el = document.getElementById('dona-equipe-list');

  el.innerHTML = COLABS.map(key => {
    const u     = USERS[key];
    const myQ   = records.filter(r => r.user === key && inQuinzena(r.ts, q));
    const bruto = myQ.filter(r => r.type === 'ganho').reduce((s, r) => s + r.val, 0);
    const vales = myQ.filter(r => r.type === 'vale').reduce((s, r) => s + r.val, 0);
    const sala  = bruto * 0.3;
    const liq   = bruto * 0.7 - vales;

    const ultimos  = records.filter(r => r.user === key).slice(0, 5);
    const recsHtml = ultimos.map(r => `
      <div class="mov-item">
        <div>
          <div class="mov-desc" style="font-size:12px">${r.desc}</div>
          <div class="mov-meta">${fmtFull(r.ts)}</div>
        </div>
        <div style="text-align:right">
          <div class="mov-val ${r.type === 'ganho' ? 'pos' : 'neg'}" style="font-size:12px">
            ${r.type === 'ganho' ? '+' : '-'}${brl(r.val)}
          </div>
          <button class="edit-btn" onclick="openEdit(${r.id})">editar</button>
        </div>
      </div>`).join('') || '<div class="empty-state" style="padding:8px">Sem registros</div>';

    return `
      <div class="colab-card">
        <div class="colab-name">${u.name}</div>
        <div class="colab-row"><span>Bruto quinzena</span><span>${brl(bruto)}</span></div>
        <div class="colab-row"><span>30% salão</span><span>${brl(sala)}</span></div>
        <div class="colab-row"><span>Vales descontados</span><span>- ${brl(vales)}</span></div>
        <div class="colab-row">
          <span style="font-weight:500;color:var(--text)">A receber</span>
          <span style="color:var(--success);font-size:14px">${brl(Math.max(0, liq))}</span>
        </div>
        <div style="margin-top:10px;border-top:0.5px solid var(--border);padding-top:8px">
          ${recsHtml}
        </div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   RENDER — ABA DESPESAS
══════════════════════════════════════════ */
function renderDespesas() {
  const el = document.getElementById('dona-desp-list');
  if (!despesas.length) {
    el.innerHTML = '<div class="empty-state">Nenhuma despesa registrada.</div>';
    return;
  }
  el.innerHTML = despesas.map(d => `
    <div class="mov-item">
      <div>
        <div class="mov-desc">${d.desc}</div>
        <div class="mov-meta">${fmtFull(d.ts)}</div>
      </div>
      <div class="mov-val neg">- ${brl(d.val)}</div>
    </div>`).join('');
}

async function addDespesa() {
  const desc = document.getElementById('d-desc').value.trim();
  const val  = parseFloat(document.getElementById('d-valor').value);
  if (!desc || isNaN(val) || val <= 0) { alert('Preencha a descrição e o valor.'); return; }

  showLoading(true);
  try {
    const nova = await insertDespesa({ desc, val, ts: Date.now() });
    despesas.unshift(nova);

    document.getElementById('d-desc').value  = '';
    document.getElementById('d-valor').value = '';

    const msg = document.getElementById('desp-msg');
    msg.textContent = 'Despesa registrada!';
    setTimeout(() => msg.textContent = '', 2500);

    renderDespesas();
    renderDonaPainel();
    renderCaixa();
  } catch (err) {
    console.error('Erro ao registrar despesa:', err);
    alert('Erro ao salvar despesa. Tente novamente.');
  } finally {
    showLoading(false);
  }
}

/* ══════════════════════════════════════════
   RENDER — ABA CAIXA
══════════════════════════════════════════ */
function renderCaixa() {
  const hoje30 = records
    .filter(r => isToday(r.ts) && r.type === 'ganho' && !r.fechado)
    .reduce((s, r) => s + r.val, 0) * 0.3;

  const ant   = caixaFechamentos.reduce((s, f) => s + f.val, 0);
  const total = hoje30 + ant;

  document.getElementById('cx-hoje').textContent   = brl(hoje30);
  document.getElementById('cx-ant').textContent    = brl(ant);
  document.getElementById('caixa-val').textContent = brl(total);

  const el = document.getElementById('cx-hist');
  if (!caixaFechamentos.length) {
    el.innerHTML = '<div class="empty-state">Nenhum fechamento ainda.</div>';
    return;
  }
  el.innerHTML = caixaFechamentos.map(f => `
    <div class="mov-item">
      <div>
        <div class="mov-desc">Fechamento do caixa</div>
        <div class="mov-meta">${fmtFull(f.ts)}</div>
      </div>
      <div class="mov-val pos">+ ${brl(f.val)}</div>
    </div>`).join('');
}

async function fecharCaixa() {
  const paraFechar = records.filter(r => isToday(r.ts) && r.type === 'ganho' && !r.fechado);
  const msg = document.getElementById('cx-msg');

  if (!paraFechar.length) {
    msg.textContent = 'Sem ganhos novos hoje para fechar.';
    setTimeout(() => msg.textContent = '', 2500);
    return;
  }

  const valor30 = paraFechar.reduce((s, r) => s + r.val, 0) * 0.3;

  showLoading(true);
  try {
    // Marca registros como fechados no Supabase
    await Promise.all(paraFechar.map(r => {
      r.fechado = true;
      return updateRecord(r);
    }));

    const novoFech = await insertFechamento(valor30);
    caixaFechamentos.unshift(novoFech);

    msg.textContent = `Caixa fechado! ${brl(valor30)} adicionado ao saldo.`;
    setTimeout(() => msg.textContent = '', 3000);

    renderCaixa();
  } catch (err) {
    console.error('Erro ao fechar caixa:', err);
    alert('Erro ao fechar caixa. Tente novamente.');
  } finally {
    showLoading(false);
  }
}

/* ══════════════════════════════════════════
   MODAL DE EDIÇÃO (proprietária)
══════════════════════════════════════════ */
function openEdit(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Editar — ' + (r.type === 'ganho' ? 'Ganho' : 'Vale');
  document.getElementById('m-desc').value = r.cliente || r.desc;
  document.getElementById('m-val').value  = r.val;
  document.getElementById('m-data').value = tsToDateInput(r.ts);
  document.getElementById('modal-edit').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-edit').classList.remove('open');
  editingId = null;
}

async function saveEdit() {
  const r      = records.find(x => x.id === editingId);
  if (!r) return;
  const newVal  = parseFloat(document.getElementById('m-val').value);
  const newDesc = document.getElementById('m-desc').value.trim();
  const newData = document.getElementById('m-data').value;
  if (!newDesc || isNaN(newVal) || newVal <= 0) { alert('Preencha todos os campos.'); return; }
  if (!newData) { alert('Informe a data do registro.'); return; }

  if (r.type === 'ganho') {
    r.cliente = newDesc;
    r.desc    = 'Atendimento — ' + newDesc;
  } else {
    r.desc = newDesc;
  }
  r.val = newVal;
  r.ts  = dateInputToTs(newData);

  showLoading(true);
  try {
    await updateRecord(r);
    closeModal();
    renderEquipe();
    renderDonaPainel();
  } catch (err) {
    console.error('Erro ao editar:', err);
    alert('Erro ao salvar edição. Tente novamente.');
  } finally {
    showLoading(false);
  }
}
