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
let editingDespesaId = null;

// Offset de navegação: 0 = período atual, -1 = anterior, etc.
let colabQuinzenaOffset = 0;
let donaMesOffset       = 0;

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
   HELPERS — MÊS (para perfil dona)
══════════════════════════════════════════ */

/** Retorna { s, e, label } para o mês com offset relativo ao atual */
function getMesOffset(offset) {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = now.getMonth() + offset; // pode ser negativo, JS normaliza
  const s   = new Date(y, m, 1);
  const e   = new Date(y, m + 1, 0);  // último dia do mês
  const label = s.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return { s, e, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

function inMes(ts, mes) {
  return ts >= mes.s.getTime() && ts <= mes.e.getTime() + 86_399_999;
}

/** Agrupa records/despesas por mês (YYYY-MM) para o histórico */
function agruparPorMes(recList, despList) {
  const map = new Map();

  const addToMap = (ts, cb) => {
    const d   = new Date(ts);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!map.has(key)) {
      const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      map.set(key, {
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        s: new Date(d.getFullYear(), d.getMonth(), 1),
        records: [],
        despesas: [],
      });
    }
    cb(map.get(key));
  };

  recList.forEach(r  => addToMap(r.ts,  g => g.records.push(r)));
  despList.forEach(d => addToMap(d.ts,  g => g.despesas.push(d)));

  return Array.from(map.values()).sort((a, b) => b.s - a.s);
}

/* ══════════════════════════════════════════
   NAVEGAÇÃO DE PERÍODO
══════════════════════════════════════════ */

function colabNavQuinzena(dir) {
  colabQuinzenaOffset += dir;
  // Não permite avançar além do período atual
  if (colabQuinzenaOffset > 0) colabQuinzenaOffset = 0;
  renderColab();
}

function donaNavMes(dir) {
  donaMesOffset += dir;
  if (donaMesOffset > 0) donaMesOffset = 0;
  renderDonaPainel();
}

/* ══════════════════════════════════════════
   SUPABASE — CARREGAR DADOS
══════════════════════════════════════════ */

/** Converte linha do Supabase (tabela records) para objeto interno */
function rowToRecord(row) {
  return {
    id:           row.id,
    user:         row.user_key,
    type:         row.type,
    desc:         row.descricao,
    cliente:      row.cliente || '',
    val:          parseFloat(row.valor),
    bronze_salao: parseFloat(row.bronze_salao) || 0,
    ts:           dateDBToTs(row.data_ref),
    fechado:      row.fechado || false,
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
    user_key:     obj.user,
    type:         obj.type,
    descricao:    obj.desc,
    cliente:      obj.cliente || '',
    valor:        obj.val,
    bronze_salao: obj.bronze_salao || 0,
    data_ref:     tsToDateDB(obj.ts),
    fechado:      false,
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

async function updateDespesa(obj) {
  const { error } = await db.from('despesas').update({
    descricao: obj.desc,
    valor:     obj.val,
    data_ref:  tsToDateDB(obj.ts),
  }).eq('id', obj.id);

  if (error) throw error;
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
  colabQuinzenaOffset = 0;
  donaMesOffset       = 0;
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
   TOGGLE GANHO / VALE / BRONZE
══════════════════════════════════════════ */
let regTipo = 'ganho';

function setTipo(t) {
  regTipo = t;
  document.getElementById('tog-ganho').classList.toggle('active',  t === 'ganho');
  document.getElementById('tog-vale').classList.toggle('active',   t === 'vale');
  document.getElementById('tog-bronze').classList.toggle('active', t === 'bronze');
  document.getElementById('form-ganho').style.display  = t === 'ganho'  ? 'block' : 'none';
  document.getElementById('form-vale').style.display   = t === 'vale'   ? 'block' : 'none';
  document.getElementById('form-bronze').style.display = t === 'bronze' ? 'block' : 'none';
}

/** Atualiza o preview em tempo real ao digitar o valor do Bronze */
function previewBronze() {
  const val  = parseFloat(document.getElementById('r-valor-b').value);
  const prev = document.getElementById('bronze-preview');
  if (!isNaN(val) && val > 10) {
    prev.style.display = 'flex';
    document.getElementById('bp-colab').textContent = brl(10);
    document.getElementById('bp-salao').textContent = brl(val - 10);
  } else {
    prev.style.display = 'none';
  }
}

/* ══════════════════════════════════════════
   REGISTRAR (colaboradora)
══════════════════════════════════════════ */
async function registrar() {
  let val, desc, cliente = '', bronze_salao = 0;

  if (regTipo === 'ganho') {
    val     = parseFloat(document.getElementById('r-valor-g').value);
    cliente = document.getElementById('r-cliente').value.trim();
    desc    = 'Atendimento' + (cliente ? ' — ' + cliente : '');
    if (!cliente || isNaN(val) || val <= 0) {
      alert('Preencha o nome da cliente e o valor.');
      return;
    }

  } else if (regTipo === 'vale') {
    val  = parseFloat(document.getElementById('r-valor-v').value);
    desc = document.getElementById('r-desc-v').value.trim();
    if (!desc || isNaN(val) || val <= 0) {
      alert('Preencha a descrição e o valor.');
      return;
    }

  } else if (regTipo === 'bronze') {
    const total = parseFloat(document.getElementById('r-valor-b').value);
    cliente     = document.getElementById('r-cliente-b').value.trim();
    if (!cliente || isNaN(total) || total <= 10) {
      alert('Preencha o nome da cliente e um valor maior que R$ 10,00.');
      return;
    }
    val          = 10;           // colaboradora recebe R$10 fixo, sem desconto de 30%
    bronze_salao = total - 10;   // excedente vai direto para o salão
    desc         = 'Bronze — ' + cliente;
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
      bronze_salao,
      ts,
    });

    records.unshift(novo);

    document.getElementById('r-cliente').value   = '';
    document.getElementById('r-valor-g').value   = '';
    document.getElementById('r-desc-v').value    = '';
    document.getElementById('r-valor-v').value   = '';
    document.getElementById('r-cliente-b').value = '';
    document.getElementById('r-valor-b').value   = '';
    document.getElementById('bronze-preview').style.display = 'none';
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

  // Calcula a quinzena com base no offset de navegação
  const refTs = (() => {
    if (colabQuinzenaOffset === 0) return Date.now();
    // Recua N quinzenas a partir de hoje
    let ts = Date.now();
    for (let i = 0; i < Math.abs(colabQuinzenaOffset); i++) {
      const q  = getQuinzena(ts);
      ts = q.s.getTime() - 1; // 1ms antes do início da quinzena atual = quinzena anterior
    }
    return ts;
  })();

  const q        = getQuinzena(refTs);
  const isAtual  = colabQuinzenaOffset === 0;

  const myRec    = records.filter(r => r.user === currentUser.key);
  const qRec     = myRec.filter(r => inQuinzena(r.ts, q));
  const todayRec = myRec.filter(r => isToday(r.ts));

  // Quinzena selecionada
  const brutoNormal = qRec.filter(r => r.type === 'ganho').reduce((s, r) => s + r.val, 0);
  const brutoBronze = qRec.filter(r => r.type === 'bronze').reduce((s, r) => s + r.val, 0);
  const valesQ      = qRec.filter(r => r.type === 'vale').reduce((s, r) => s + r.val, 0);
  const liquidoQ    = (brutoNormal * 0.7) + brutoBronze - valesQ;

  // Hoje (só faz sentido na quinzena atual)
  const brutoNormalHoje = todayRec.filter(r => r.type === 'ganho').reduce((s, r) => s + r.val, 0);
  const brutoBronzeHoje = todayRec.filter(r => r.type === 'bronze').reduce((s, r) => s + r.val, 0);
  const valesHoje       = todayRec.filter(r => r.type === 'vale').reduce((s, r) => s + r.val, 0);
  const diaLiq          = isAtual ? (brutoNormalHoje * 0.7) + brutoBronzeHoje - valesHoje : null;

  const badgeEl = document.getElementById('colab-quinzena-badge');
  badgeEl.textContent = q.label + (isAtual ? '' : '');

  document.getElementById('c-saldo-dia').textContent      = diaLiq !== null ? brl(Math.max(0, diaLiq)) : '—';
  document.getElementById('c-saldo-quinzena').textContent = brl(Math.max(0, liquidoQ));
  document.getElementById('c-bruto').textContent          = brl(brutoNormal + brutoBronze);

  // Seta "próximo" desabilitada se estiver na quinzena atual
  document.querySelectorAll('.period-nav-btn').forEach((btn, i) => {
    if (i === 1) btn.disabled = isAtual; // botão direito (→)
  });

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
  const isBronze  = r.type === 'bronze';
  const isVale    = r.type === 'vale';
  const isDespesa = r.type === 'despesa';

  let valorDisplay, tipoLabel;
  if (isGanho) {
    valorDisplay = '+' + brl(r.val);
    tipoLabel    = 'líq: ' + brl(r.val * 0.7);
  } else if (isBronze) {
    valorDisplay = '+' + brl(r.val);
    tipoLabel    = 'bronze · salão: ' + brl(r.bronze_salao || 0);
  } else if (isDespesa) {
    valorDisplay = '-' + brl(r.val);
    tipoLabel    = 'despesa';
  } else {
    valorDisplay = '-' + brl(r.val);
    tipoLabel    = 'vale';
  }

  const userLabel = showUser && USERS[r.user] ? USERS[r.user].name + ' · ' : '';
  return `
    <div class="mov-item">
      <div>
        <div class="mov-desc">${r.desc}</div>
        <div class="mov-meta">${userLabel}${fmtFull(r.ts)}</div>
      </div>
      <div>
        <div class="mov-val ${(isGanho || isBronze) ? 'pos' : 'neg'}">${valorDisplay}</div>
        <div class="mov-type">${tipoLabel}</div>
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
    const bronze    = g.items.filter(r => r.type === 'bronze').reduce((s, r) => s + r.val, 0);
    const vales     = g.items.filter(r => r.type === 'vale').reduce((s, r) => s + r.val, 0);
    const liquido   = (bruto * 0.7) + bronze - vales;
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
            <span>Bruto: ${brl(bruto + bronze)}</span>
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
  const mes    = getMesOffset(donaMesOffset);
  const isAtual = donaMesOffset === 0;

  const mRec  = records.filter(r => inMes(r.ts, mes));
  const despM = despesas.filter(d => inMes(d.ts, mes)).reduce((s, d) => s + d.val, 0);

  // 30% dos ganhos normais do mês
  const trinta_normal = mRec
    .filter(r => r.type === 'ganho')
    .reduce((s, r) => s + r.val, 0) * 0.3;

  // Bronze: excedente vai direto para o salão
  const trinta_bronze = mRec
    .filter(r => r.type === 'bronze')
    .reduce((s, r) => s + (r.bronze_salao || 0), 0);

  const salaM    = trinta_normal + trinta_bronze;
  const liqSalao = salaM - despM;

  const badgeEl = document.getElementById('dona-mes-badge');
  badgeEl.textContent = mes.label;

  document.getElementById('d-30-quin').textContent   = brl(salaM);
  document.getElementById('d-desp-q').textContent    = brl(despM);
  document.getElementById('d-liq-salao').textContent = brl(liqSalao);

  // Desabilita botão → quando estiver no mês atual
  const navBtns = document.querySelectorAll('#s-dona .period-nav-btn');
  navBtns.forEach((btn, i) => { if (i === 1) btn.disabled = isAtual; });

  // Movimentações do mês
  const mMovs = [
    ...mRec,
    ...despesas
      .filter(d => inMes(d.ts, mes))
      .map(d => ({ ...d, user: 'salao', type: 'despesa', desc: '📋 ' + d.desc, cliente: '', bronze_salao: 0 })),
  ].sort((a, b) => b.ts - a.ts);

  const el = document.getElementById('dona-movs');
  el.innerHTML = mMovs.length
    ? mMovs.map(r => movItemHtml(r, true)).join('')
    : '<div class="empty-state">Nenhum registro neste mês.</div>';
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

    const brutoNormal = myQ.filter(r => r.type === 'ganho').reduce((s, r) => s + r.val, 0);
    const brutoBronze = myQ.filter(r => r.type === 'bronze').reduce((s, r) => s + r.val, 0);
    const vales       = myQ.filter(r => r.type === 'vale').reduce((s, r) => s + r.val, 0);
    const sala        = brutoNormal * 0.3;
    const liq         = (brutoNormal * 0.7) + brutoBronze - vales;

    const ultimos  = records.filter(r => r.user === key).slice(0, 5);
    const recsHtml = ultimos.map(r => `
      <div class="mov-item">
        <div>
          <div class="mov-desc" style="font-size:12px">${r.desc}</div>
          <div class="mov-meta">${fmtFull(r.ts)}</div>
        </div>
        <div style="text-align:right">
          <div class="mov-val ${r.type === 'vale' ? 'neg' : 'pos'}" style="font-size:12px">
            ${r.type === 'vale' ? '-' : '+'}${brl(r.val)}
          </div>
          <button class="edit-btn" onclick="openEdit(${r.id})">editar</button>
        </div>
      </div>`).join('') || '<div class="empty-state" style="padding:8px">Sem registros</div>';

    return `
      <div class="colab-card">
        <div class="colab-name">${u.name}</div>
        <div class="colab-row"><span>Bruto quinzena</span><span>${brl(brutoNormal + brutoBronze)}</span></div>
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
      <div style="display:flex;align-items:center;gap:8px">
        <div class="mov-val neg">- ${brl(d.val)}</div>
        <button class="edit-btn" onclick="openEditDespesa(${d.id})">editar</button>
      </div>
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
  renderHistoricoMensal();
}

function renderHistoricoMensal() {
  const el     = document.getElementById('cx-hist-mensal');
  const grupos = agruparPorMes(records, despesas);

  if (!grupos.length) {
    el.innerHTML = '<div class="empty-state">Nenhum dado ainda.</div>';
    return;
  }

  const mesAtualKey = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  })();

  el.innerHTML = grupos.map((g, idx) => {
    const isAtual = g.key === mesAtualKey;
    const isOpen  = isAtual || idx === 0;

    const trinta_normal = g.records
      .filter(r => r.type === 'ganho')
      .reduce((s, r) => s + r.val, 0) * 0.3;
    const trinta_bronze = g.records
      .filter(r => r.type === 'bronze')
      .reduce((s, r) => s + (r.bronze_salao || 0), 0);
    const sala30  = trinta_normal + trinta_bronze;
    const despTot = g.despesas.reduce((s, d) => s + d.val, 0);
    const liq     = sala30 - despTot;

    return `
      <div class="hist-group">
        <button class="hist-group-header ${isOpen ? 'open' : ''}" onclick="toggleHistGroup(this)">
          <div class="hist-group-label">
            <span class="hist-group-period">${g.label}</span>
            ${isAtual ? '<span class="hist-badge-atual">atual</span>' : ''}
          </div>
          <div class="hist-group-summary">
            <span class="hist-group-liq" style="color:${liq >= 0 ? 'var(--success)' : 'var(--danger)'}">${brl(liq)}</span>
            <span class="hist-group-arrow">${isOpen ? '▲' : '▼'}</span>
          </div>
        </button>
        <div class="hist-group-body ${isOpen ? 'open' : ''}">
          <div class="hist-group-totals hist-group-totals-mensal">
            <div class="hist-mensal-row">
              <span class="hist-mensal-label">30% salão</span>
              <span class="hist-mensal-val pos">${brl(sala30)}</span>
            </div>
            <div class="hist-mensal-row">
              <span class="hist-mensal-label">Despesas</span>
              <span class="hist-mensal-val neg">- ${brl(despTot)}</span>
            </div>
            <div class="hist-mensal-row hist-mensal-total">
              <span class="hist-mensal-label">Total líquido</span>
              <span class="hist-mensal-val" style="color:${liq >= 0 ? 'var(--success)' : 'var(--danger)'}">${brl(liq)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   MODAL DE EDIÇÃO (proprietária)
══════════════════════════════════════════ */
function openEdit(id) {
  const r = records.find(x => x.id === id);
  if (!r) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Editar — ' + (r.type === 'ganho' ? 'Ganho' : r.type === 'bronze' ? 'Bronze' : 'Vale');
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

/* ══════════════════════════════════════════
   MODAL DE EDIÇÃO DE DESPESA (proprietária)
══════════════════════════════════════════ */
function openEditDespesa(id) {
  const d = despesas.find(x => x.id === id);
  if (!d) return;
  editingDespesaId = id;
  document.getElementById('md-desc').value = d.desc;
  document.getElementById('md-val').value  = d.val;
  document.getElementById('md-data').value = tsToDateInput(d.ts);
  document.getElementById('modal-despesa').classList.add('open');
}

function closeModalDespesa() {
  document.getElementById('modal-despesa').classList.remove('open');
  editingDespesaId = null;
}

async function saveEditDespesa() {
  const d      = despesas.find(x => x.id === editingDespesaId);
  if (!d) return;
  const newVal  = parseFloat(document.getElementById('md-val').value);
  const newDesc = document.getElementById('md-desc').value.trim();
  const newData = document.getElementById('md-data').value;
  if (!newDesc || isNaN(newVal) || newVal <= 0) { alert('Preencha todos os campos.'); return; }
  if (!newData) { alert('Informe a data.'); return; }

  d.desc = newDesc;
  d.val  = newVal;
  d.ts   = dateInputToTs(newData);

  showLoading(true);
  try {
    await updateDespesa(d);
    closeModalDespesa();
    renderDespesas();
    renderDonaPainel();
    renderCaixa();
  } catch (err) {
    console.error('Erro ao editar despesa:', err);
    alert('Erro ao salvar. Tente novamente.');
  } finally {
    showLoading(false);
  }
}