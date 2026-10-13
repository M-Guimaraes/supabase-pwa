(() => {
  'use strict';

  // A chave publicável é pública por natureza. A proteção dos dados vem das
  // regras de RLS no banco (cada usuário só acessa as próprias linhas).
  const SUPABASE_URL = 'https://nddrqvueykgyzjwjcygk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Yep8kL5uJzkaHpDQhhRlng_dpfP7-1l';

  const $ = (id) => document.getElementById(id);

  // Script inline é bloqueado pelo CSP (script-src sem 'unsafe-inline'), então essa
  // configuração do pdf.js precisa estar num arquivo externo, não no index.html.
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const state = {
    userId: undefined, // undefined = ainda não verificado
    month: firstOfMonth(new Date()),
    categories: [],
    transactions: [],
    listTx: [],
    listMode: 'day',
    listDate: new Date(),
    listPartial: false,
    selecting: false,
    selected: new Set(),
    recurring: [],
    budgets: [],
    bills: [],
    goals: [],
    rules: [],
    rulesReady: true,
    securityShown: false,
    hints: null,
    hasAnyTx: true,
    trendRows: [],
    viewingCache: false,
    trendSel: null,
    trendRange: '6m',
    trendCategory: '',
    trendYear: new Date().getFullYear(),
    yearRows: {},
    yearPartial: false,
    pwFactorId: null,
    shortcut: Quick.parseShortcut(location.search),
    categoryTouched: false,
    editingGoal: null,
    editingBudget: null,
    editingBill: null,
    suggestions: [],
    lastGeneration: null,
    editing: null,
    editingRecurring: null,
    signupMode: false,
  };

  if (!window.supabase) {
    document.body.textContent =
      'Não foi possível carregar o app. Conecte-se à internet e abra de novo.';
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  let store;
  try { store = Offline.create(window.localStorage); } catch (err) { store = Offline.create({ getItem() { return null; }, setItem() { throw new Error('sem armazenamento'); }, removeItem() {} }); }

  /* ---------- Utilitários ---------- */

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function parseYmd(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function parseAmount(raw) {
    let s = String(raw).trim().replace(/[^\d.,]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  let toastTimer;
  function toast(message) {
    const t = $('toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
  }

  function friendlyError(error) {
    const msg = (error && error.message) || '';
    if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
    if (/already registered/i.test(msg)) return 'Já existe uma conta com esse e-mail. Tente entrar.';
    if (/known to be weak|pwned|leaked/i.test(msg)) return 'Essa senha apareceu em vazamentos de dados. Escolha outra.';
    if (/password should (be at least|contain)/i.test(msg)) return 'A senha não atende às regras de segurança. Confira os requisitos abaixo do campo.';
    if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos e tente de novo.';
    if (/invalid totp|mfa verification failed|invalid.*code/i.test(msg)) return 'Código incorreto. Confira o app e tente de novo.';
    if (/aal2/i.test(msg)) return 'Para trocar a senha, confirme o código das duas etapas: saia e entre de novo.';
    if (/current.?password|incorrect.*password/i.test(msg)) return 'Senha atual incorreta.';
    if (/different from the old/i.test(msg)) return 'A nova senha precisa ser diferente da atual.';
    if (/rate limit/i.test(msg)) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
    if (/category_rules|relation .* does not exist|schema cache/i.test(msg)) return 'As regras ainda não foram ativadas no banco. Aplique o SQL de regras no Supabase.';
    if (/category_rules_user_id_pattern_key|duplicate key/i.test(msg)) return 'Já existe uma regra para esse texto.';
    if (/failed to fetch|network/i.test(msg)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return msg || 'Algo deu errado. Tente de novo.';
  }

  /* ---------- Entrada (login e cadastro) ---------- */

  function showAuth() {
    $('app').hidden = true;
    $('mfa').hidden = true;
    $('auth').hidden = false;
  }

  function showApp() {
    $('auth').hidden = true;
    $('mfa').hidden = true;
    $('app').hidden = false;
  }

  function showMfa() {
    $('auth').hidden = true;
    $('app').hidden = true;
    $('mfa').hidden = false;
    $('mfa-error').hidden = true;
    $('mfa-code').value = '';
    $('mfa-code').focus();
  }

  function setAuthMode(signup) {
    state.signupMode = signup;
    $('auth-title').textContent = signup ? 'Crie sua conta' : 'Acesse sua conta';
    $('auth-submit').textContent = signup ? 'Criar conta' : 'Entrar';
    $('auth-toggle').textContent = signup ? 'Já tem conta? Entrar' : 'Não tem conta? Criar conta';
    $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('auth-confirm-row').hidden = !signup;
    $('password-rules').hidden = !signup;
    $('auth-confirm').value = '';
    $('auth-confirm').required = signup;
    $('auth-error').hidden = true;
    renderPasswordRules();
  }

  // Lista de requisitos da senha, atualizada a cada tecla.
  function renderRules(ul, password, confirm) {
    ul.replaceChildren();
    for (const r of Password.rules(password, confirm)) {
      const li = el('li', r.ok ? 'ok' : '');
      li.append(el('span', 'rule-mark'), el('span', '', r.label), el('span', 'sr-only', r.ok ? ' (atendido)' : ' (pendente)'));
      ul.append(li);
    }
  }

  function renderPasswordRules() {
    if (state.signupMode) renderRules($('password-rules'), $('auth-password').value, $('auth-confirm').value);
  }

  $('auth-password').addEventListener('input', renderPasswordRules);
  $('auth-confirm').addEventListener('input', renderPasswordRules);
  $('auth-toggle').addEventListener('click', () => setAuthMode(!state.signupMode));
  $('auth-show').addEventListener('change', (e) => {
    const type = e.target.checked ? 'text' : 'password';
    $('auth-password').type = type;
    $('auth-confirm').type = type;
  });

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    const errorBox = $('auth-error');
    errorBox.hidden = true;

    const fail = (message, field) => {
      errorBox.textContent = message;
      errorBox.hidden = false;
      if (field) $(field).focus();
    };

    if (!Password.isValidEmail(email)) return fail('Informe um e-mail válido.', 'auth-email');
    if (!password) return fail('Digite sua senha.', 'auth-password');
    if (state.signupMode) {
      const list = Password.rules(password, $('auth-confirm').value);
      const missing = list.filter((r) => !r.ok);
      if (missing.some((r) => r.id === 'match') && missing.length === 1) {
        return fail('As senhas não são iguais.', 'auth-confirm');
      }
      if (missing.length > 0) {
        return fail('A senha ainda não atende a todos os requisitos listados.', 'auth-password');
      }
    }

    const button = $('auth-submit');
    button.disabled = true;
    try {
      if (state.signupMode) {
        // O link do e-mail de confirmação volta para este app. O endereço também
        // precisa estar em Authentication → URL Configuration → Redirect URLs.
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
        if (!data.session) {
          toast('Conta criada. Confirme seu e-mail pelo link que enviamos e depois entre.');
          $('auth-password').value = '';
          setAuthMode(false);
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      errorBox.textContent = friendlyError(err);
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  // Sair apaga a cópia local. Se há lançamentos que ainda não subiram, avisa antes.
  async function leave() {
    const pending = pendingList().length;
    if (pending > 0 && !confirm(`Há ${pending} lançamento(s) que ainda não foram enviados e serão perdidos se você sair. Sair mesmo assim?`)) return;
    store.clearAll();
    await sb.auth.signOut();
  }

  $('logout').addEventListener('click', leave);

  /* ---------- Segunda etapa (TOTP) ---------- */

  async function verifiedFactor() {
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) throw error;
    return data.totp && data.totp.length > 0 ? data.totp[0] : null;
  }

  // Sessão só com senha (aal1) e conta com 2FA: pede o código antes de mostrar o app.
  async function enterApp() {
    try {
      const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!error && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
        showMfa();
        return;
      }
    } catch (err) {
      // sem informação de nível: segue; o banco continua protegendo os dados
    }
    showApp();
    switchTab('summary');
    state.month = firstOfMonth(new Date());
    state.listMode = 'day';
    state.listDate = new Date();
    state.lastGeneration = null;
    refresh();
  }

  $('mfa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = $('mfa-error');
    errorBox.hidden = true;
    const code = $('mfa-code').value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) {
      errorBox.textContent = 'Digite os 6 dígitos do código.';
      errorBox.hidden = false;
      return;
    }
    const button = $('mfa-submit');
    button.disabled = true;
    try {
      const factor = await verifiedFactor();
      if (!factor) throw new Error('Nenhum autenticador encontrado.');
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) throw error;
      await enterApp();
    } catch (err) {
      errorBox.textContent = friendlyError(err);
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  $('mfa-logout').addEventListener('click', leave);

  /* ---------- Dados ---------- */

  async function loadCategories() {
    const { data, error } = await sb
      .from('categories')
      .select('id, name, type')
      .order('name');
    if (error) throw error;
    state.categories = data;
  }

  async function loadTransactions() {
    const start = ymd(state.month);
    const next = ymd(new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1));
    const { data, error } = await sb
      .from('transactions')
      .select('id, type, amount, description, occurred_on, category_id')
      .gte('occurred_on', start)
      .lt('occurred_on', next)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rows = data.map((t) => ({ ...t, amount: Number(t.amount) }));
    state.transactions = Offline.mergePending(rows, pendingList(), start, next);
  }

  /* ---------- Lista por dia, mês ou ano ---------- */

  function listRange() { return Period.range(state.listMode, state.listDate); }

  // Sem internet: usa o que está salvo no aparelho (últimos 6 meses) mais a fila.
  function listLocal() {
    const { start, next } = listRange();
    const rows = (state.yearRows[state.listDate.getFullYear()] || []).length > 0 && state.listMode === 'year'
      ? state.trendRows.concat(state.yearRows[state.listDate.getFullYear()])
      : state.trendRows;
    state.listPartial = start < Trend.windowStart(new Date(), 6);
    // trendRows e yearRows podem repetir lançamentos: dedupe por id quando existir
    const seen = new Set();
    const unique = rows.filter((t) => {
      if (!t.id) return true;
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
    return Offline.mergePending(unique, pendingList(), start, next);
  }

  async function loadList() {
    if (!navigator.onLine || state.viewingCache) {
      state.listTx = listLocal();
      return;
    }
    const { start, next } = listRange();
    const rows = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await sb
        .from('transactions')
        .select('id, type, amount, description, occurred_on, category_id, created_at')
        .gte('occurred_on', start)
        .lt('occurred_on', next)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    state.listPartial = false;
    state.listTx = Offline.mergePending(rows.map((t) => ({ ...t, amount: Number(t.amount) })), pendingList(), start, next);
  }

  async function refreshList() {
    try {
      await loadList();
    } catch (err) {
      if (Offline.isNetworkError(err)) state.listTx = listLocal();
      else toast(friendlyError(err));
    }
    renderList();
  }

  // Depois de salvar um lançamento, a lista passa a mostrar a data dele se estiver fora do período atual.
  function focusListOn(dateStr) {
    if (!Period.contains(state.listMode, state.listDate, dateStr)) state.listDate = parseYmd(dateStr);
  }

  async function loadBudgets() {
    const { data, error } = await sb.from('budgets').select('id, category_id, monthly_limit');
    if (error) throw error;
    state.budgets = data.map((b) => ({ ...b, monthly_limit: Number(b.monthly_limit) }));
  }

  // Só as contas ainda não pagas; as pagas viram lançamentos de despesa.
  async function loadBills() {
    const { data, error } = await sb
      .from('bills')
      .select('id, description, amount, category_id, due_on, paid_on')
      .is('paid_on', null)
      .order('due_on');
    if (error) throw error;
    state.bills = data.map((b) => ({ ...b, amount: Number(b.amount) }));
  }

  // Separado do resto: se a tabela de regras ainda não existe, o app segue funcionando sem elas.
  async function loadRules() {
    const { data, error } = await sb.from('category_rules').select('id, pattern, category_id').order('created_at');
    if (error) {
      if (Offline.isNetworkError(error)) throw error;
      state.rules = [];
      state.rulesReady = false;
      return;
    }
    state.rules = data;
    state.rulesReady = true;
  }

  async function loadGoals() {
    const { data, error } = await sb
      .from('goals')
      .select('id, name, target_amount, saved_amount, deadline')
      .order('created_at');
    if (error) throw error;
    state.goals = data.map((g) => ({ ...g, target_amount: Number(g.target_amount), saved_amount: Number(g.saved_amount) }));
  }

  // Lançamentos digitados à mão, do mais novo ao mais antigo: base das sugestões ao digitar.
  async function loadHints() {
    const { data, error } = await sb
      .from('transactions')
      .select('type, amount, description, category_id')
      .is('external_id', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    state.hints = Quick.buildHints(data);
    const any = await sb.from('transactions').select('id').limit(1);
    if (any.error) throw any.error;
    state.hasAnyTx = any.data.length > 0;
  }

  // Lançamentos dos últimos 6 meses (só tipo, valor e data), para o gráfico de evolução.
  async function loadTrend() {
    const since = Trend.windowStart(new Date(), 6);
    const rows = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await sb
        .from('transactions')
        .select('id, type, amount, description, category_id, occurred_on, created_at')
        .gte('occurred_on', since)
        .order('occurred_on')
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    state.trendRows = rows.map((t) => ({ ...t, amount: Number(t.amount) }));
  }

  async function loadRecurring() {
    const { data, error } = await sb
      .from('recurring_transactions')
      .select('id, type, amount, description, category_id, day_of_month, start_on, generated_through, active')
      .order('created_at');
    if (error) throw error;
    state.recurring = data.map((r) => ({ ...r, amount: Number(r.amount) }));
  }

  // Cria os lançamentos fixos que já deveriam existir. Idempotente: o external_id
  // "rec:<id>:<mês>" é único, então repetir não duplica. Roda uma vez por dia.
  async function generateRecurring() {
    const today = new Date();
    const stamp = ymd(today);
    if (state.lastGeneration === stamp) return 0;
    let added = 0;
    for (const r of state.recurring) {
      if (!r.active) continue;
      const due = Recurring.occurrencesDue(r, today);
      if (due.length === 0) continue;
      const rows = due.map((o) => ({
        user_id: state.userId,
        type: r.type,
        amount: r.amount,
        description: r.description,
        category_id: r.category_id,
        occurred_on: o.date,
        external_id: o.externalId,
      }));
      for (let i = 0; i < rows.length; i += 100) {
        const { data, error } = await sb
          .from('transactions')
          .upsert(rows.slice(i, i + 100), { onConflict: 'user_id,external_id', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        added += data.length;
      }
      const through = Recurring.generatedThrough(due);
      const { error } = await sb.from('recurring_transactions').update({ generated_through: through }).eq('id', r.id);
      if (error) throw error;
      r.generated_through = through;
    }
    state.lastGeneration = stamp;
    return added;
  }

  async function loadRecurringSuggestions() {
    const now = new Date();
    const since = ymd(new Date(now.getFullYear(), now.getMonth() - 5, 1));
    const { data, error } = await sb
      .from('transactions')
      .select('type, amount, description, occurred_on, category_id, external_id')
      .gte('occurred_on', since)
      .not('description', 'is', null)
      .limit(2000);
    if (error) throw error;
    state.suggestions = Recurring.suggestRecurring(
      data.map((t) => ({ ...t, amount: Number(t.amount) })),
      state.recurring,
      now
    );
  }

  /* ---------- Modo offline ---------- */

  function pendingList() {
    return state.userId ? store.queue(state.userId) : [];
  }

  function monthRange() {
    return [ymd(state.month), ymd(new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1))];
  }

  function localMonth() {
    const [start, next] = monthRange();
    return Offline.mergePending(state.trendRows, pendingList(), start, next);
  }

  function saveSnapshot() {
    store.saveSnapshot(state.userId, {
      email: $('account-email').textContent,
      categories: state.categories,
      recurring: state.recurring,
      budgets: state.budgets,
      bills: state.bills,
      goals: state.goals,
      rules: state.rules,
      trendRows: state.trendRows,
      hasAnyTx: state.hasAnyTx,
    });
  }

  // Sem internet: mostra a última cópia salva neste aparelho (só leitura, mais os lançamentos novos da fila).
  function offlineRefresh() {
    const snap = store.loadSnapshot(state.userId);
    if (!snap) {
      toast('Sem conexão e ainda não há dados salvos neste aparelho. Abra o app com internet uma vez.');
      updateBanner();
      return;
    }
    const d = snap.data;
    state.categories = d.categories || [];
    state.recurring = d.recurring || [];
    state.budgets = d.budgets || [];
    state.bills = d.bills || [];
    state.goals = d.goals || [];
    state.rules = d.rules || [];
    state.trendRows = d.trendRows || [];
    state.hasAnyTx = d.hasAnyTx !== false;
    state.hints = null;
    state.suggestions = [];
    if (d.email && !$('account-email').textContent) $('account-email').textContent = d.email;
    state.viewingCache = true;
    state.transactions = localMonth();
    state.listTx = listLocal();
    render();
    updateBanner();
    openShortcut();
  }

  function updateBanner() {
    const pending = pendingList().length;
    const offline = !navigator.onLine || state.viewingCache;
    const box = $('offline-banner');
    const label = pending === 1 ? '1 lançamento aguardando envio' : `${pending} lançamentos aguardando envio`;
    if (offline) {
      $('offline-text').textContent = 'Sem conexão. Você vê a última cópia salva; lançamentos novos ficam neste aparelho' +
        (pending ? ` (${label}).` : '.');
    } else if (pending) {
      $('offline-text').textContent = label + '.';
    }
    box.hidden = !(offline || pending);
    box.classList.toggle('warn', pending > 0);
    $('offline-sync').hidden = offline || !pending;
  }

  let flushing = false;
  // Envia os lançamentos feitos offline. O id é criado no aparelho e o envio ignora duplicados,
  // então repetir não cria lançamento em dobro. Devolve quantos foram enviados.
  async function flushQueue() {
    if (flushing || !state.userId || !navigator.onLine) return 0;
    const queue = store.queue(state.userId);
    if (queue.length === 0) return 0;
    flushing = true;
    let sent = 0;
    try {
      for (const item of queue) {
        const row = {
          id: item.id, type: item.type, amount: item.amount, description: item.description,
          category_id: item.category_id, occurred_on: item.occurred_on, created_at: item.created_at,
        };
        const send = (r) => sb.from('transactions').upsert(r, { onConflict: 'id', ignoreDuplicates: true });
        let { error } = await send(row);
        if (error && !Offline.isNetworkError(error) && row.category_id) {
          // categoria apagada enquanto estava offline: envia sem categoria
          ({ error } = await send({ ...row, category_id: null }));
        }
        if (error) {
          if (!Offline.isNetworkError(error)) toast(friendlyError(error));
          break;
        }
        store.remove(state.userId, [item.id]);
        sent++;
      }
    } finally {
      flushing = false;
    }
    return sent;
  }

  async function syncNow() {
    const sent = await flushQueue();
    if (sent > 0) toast(sent === 1 ? '1 lançamento enviado' : `${sent} lançamentos enviados`);
    await refresh();
  }

  $('offline-sync').addEventListener('click', syncNow);

  window.addEventListener('offline', updateBanner);
  window.addEventListener('online', async () => {
    if (state.userId) {
      try {
        const { data, error } = await sb.auth.getSession();
        if (!error && !data.session) {
          // a sessão não vale mais: sai e apaga a cópia local
          store.clearSnapshot();
          state.userId = null;
          showAuth();
          return;
        }
      } catch (err) { /* segue */ }
      syncNow();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.userId && navigator.onLine && pendingList().length) syncNow();
  });

  async function refresh() {
    if (!navigator.onLine) { offlineRefresh(); return; }
    await flushQueue().then((n) => {
      if (n > 0) toast(n === 1 ? '1 lançamento enviado' : `${n} lançamentos enviados`);
    });
    try {
      await Promise.all([loadCategories(), loadRecurring(), loadBudgets(), loadBills(), loadGoals(), loadRules()]);
    } catch (err) {
      if (Offline.isNetworkError(err)) { offlineRefresh(); return; }
      toast(friendlyError(err));
      return;
    }
    try {
      const added = await generateRecurring();
      if (added > 0) toast(added === 1 ? '1 lançamento fixo adicionado' : `${added} lançamentos fixos adicionados`);
    } catch (err) {
      if (!Offline.isNetworkError(err)) toast(friendlyError(err));
    }
    try {
      await loadTransactions();
    } catch (err) {
      if (Offline.isNetworkError(err)) { offlineRefresh(); return; }
      toast(friendlyError(err));
      return;
    }
    try {
      await loadList();
    } catch (err) {
      if (Offline.isNetworkError(err)) { offlineRefresh(); return; }
      toast(friendlyError(err));
    }
    try {
      await loadRecurringSuggestions();
    } catch (err) {
      state.suggestions = [];
    }
    try {
      await loadHints();
    } catch (err) {
      state.hints = null;
    }
    try {
      await loadTrend();
    } catch (err) {
      state.trendRows = [];
    }
    state.viewingCache = false;
    state.yearRows = {};
    if (state.trendRows.length || state.hasAnyTx === false) saveSnapshot();
    render();
    updateBanner();
    renderSecurityOnce();
    openShortcut();
  }

  // Atalho da tela inicial ("Nova despesa" / "Nova receita"): abre o formulário uma vez.
  function openShortcut() {
    if (!state.shortcut) return;
    const type = state.shortcut;
    state.shortcut = null;
    try { history.replaceState(null, '', location.pathname); } catch (err) { /* sem problema */ }
    openSheet(null, type);
  }

  // Só troca de mês: não recarrega categorias nem recorrências.
  async function refreshMonth() {
    if (!navigator.onLine || state.viewingCache) {
      state.transactions = localMonth();
      render();
      return;
    }
    try {
      await loadTransactions();
      render();
    } catch (err) {
      toast(friendlyError(err));
    }
  }

  function categoryName(id) {
    const c = state.categories.find((x) => x.id === id);
    return c ? c.name : 'Sem categoria';
  }

  /* ---------- Renderização ---------- */

  function render() {
    $('month-label').textContent = monthFmt.format(state.month);
    renderSummary();
    renderList();
    renderCategories();
    renderCategoryRules();
    renderRecurring();
    renderBudgetSettings();
    renderBills();
    renderGoals();
    renderOnboarding();
    renderTrend();
  }

  /* ---------- Evolução mensal ---------- */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

  function svgEl(tag, attrs, cls) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (cls) node.setAttribute('class', cls);
    return node;
  }

  function monthShort(m) { return `${new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(m.year, m.month, 1)).replace('.', '')}/${String(m.year).slice(2)}`; }
  function monthName(m) { return monthFmt.format(new Date(m.year, m.month, 1)); }

  // Coluna com o topo arredondado (4px) e a base reta, como pede o padrão dos gráficos.
  function columnPath(x, y, w, h) {
    const r = Math.min(4, h, w / 2);
    return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
  }

  function fillTrendReadout(m, title) {
    const box = $('trend-readout');
    box.replaceChildren();
    box.append(el('span', 'month', title || monthName(m)));
    const values = el('span', 'values');
    for (const [label, value] of [['Receitas', m.income], ['Despesas', m.expense], ['Saldo', m.balance]]) {
      const item = el('span');
      item.append(`${label} `, el('b', '', brl.format(value)));
      values.append(item);
    }
    box.append(values);
  }

  // i = null mostra o total do período (só na visão do ano).
  function selectTrendMonth(i) {
    state.trendSel = i;
    document.querySelectorAll('#trend-chart .hl').forEach((n, k) => n.classList.toggle('on', k === i));
    document.querySelectorAll('#trend-chart .month-text').forEach((n, k) => n.classList.toggle('on', k === i));
    if (i === null) fillTrendReadout({ ...Trend.totals(state.trendSeries) }, `Total de ${state.trendYear}`);
    else fillTrendReadout(state.trendSeries[i]);
  }

  function drawTrendChart(series) {
    const W = 340, H = 196, L = 34, R = 4, T = 8, B = 26;
    const plotW = W - L - R, plotH = H - T - B;
    const scale = Trend.niceScale(Math.max(...series.map((m) => Math.max(m.income, m.expense))));
    const y = (v) => T + plotH - (v / scale.max) * plotH;
    const slot = plotW / series.length;
    const barW = series.length > 6 ? 10 : 16, gap = 2, pairW = barW * 2 + gap;

    const dense = series.length > 6;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': dense ? `Receitas e despesas de ${state.trendYear}` : 'Receitas e despesas dos últimos 6 meses' }, dense ? 'dense' : '');
    for (const tick of scale.ticks) {
      svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(tick), y2: y(tick) }, 'grid'));
      const t = svgEl('text', { x: L - 6, y: y(tick) + 3.5, 'text-anchor': 'end' }, 'axis-text');
      t.textContent = Trend.compact(tick);
      svg.append(t);
    }
    series.forEach((m, i) => {
      const sx = L + i * slot;
      svg.append(svgEl('rect', { x: sx + 2, y: T, width: slot - 4, height: plotH, rx: 6 }, 'hl'));
      const x0 = sx + (slot - pairW) / 2;
      for (const [value, dx, cls] of [[m.income, 0, 'bar-income'], [m.expense, barW + gap, 'bar-expense']]) {
        if (value <= 0) continue;
        const h = Math.max(2, (value / scale.max) * plotH);
        svg.append(svgEl('path', { d: columnPath(x0 + dx, T + plotH - h, barW, h) }, cls));
      }
      const label = svgEl('text', { x: sx + slot / 2, y: H - 8, 'text-anchor': 'middle' }, 'month-text');
      label.textContent = shortMonth.format(new Date(m.year, m.month, 1)).replace('.', '');
      svg.append(label);
    });
    // Áreas de toque: maiores que as barras, com leitura por teclado.
    series.forEach((m, i) => {
      const hit = svgEl('rect', { x: L + i * slot, y: T, width: slot, height: plotH + B - 4, tabindex: 0, role: 'button', rx: 6 }, 'hit');
      hit.setAttribute('aria-label',
        `${monthName(m)}: receitas ${brl.format(m.income)}, despesas ${brl.format(m.expense)}, saldo ${brl.format(m.balance)}`);
      hit.addEventListener('click', () => selectTrendMonth(state.trendRange === 'year' && state.trendSel === i ? null : i));
      hit.addEventListener('focus', () => selectTrendMonth(i));
      hit.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') selectTrendMonth(i); });
      svg.append(hit);
    });
    $('trend-chart').replaceChildren(svg);
  }

  function fillTrendTable(series) {
    const table = $('trend-table');
    table.replaceChildren();
    const head = el('tr');
    for (const h of ['Mês', 'Receitas', 'Despesas', 'Saldo']) head.append(el('th', '', h));
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const body = el('tbody');
    for (const m of series) {
      const row = el('tr');
      const name = series.length > 6 ? shortMonth.format(new Date(m.year, m.month, 1)).replace('.', '') : monthShort(m);
      row.append(el('td', '', name), el('td', '', brl.format(m.income)), el('td', '', brl.format(m.expense)), el('td', '', brl.format(m.balance)));
      body.append(row);
    }
    table.append(body);
    if (series.length > 6) {
      const sum = Trend.totals(series);
      const foot = el('tfoot');
      const row = el('tr');
      row.append(el('td', '', 'Ano'), el('td', '', brl.format(sum.income)), el('td', '', brl.format(sum.expense)), el('td', '', brl.format(sum.balance)));
      foot.append(row);
      table.append(foot);
    }
  }

  // Lançamentos do ano escolhido (só tipo, valor e data). Fica em cache até o próximo refresh.
  async function loadYear(year) {
    const { start, next } = Trend.yearRange(year);
    const rows = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await sb
        .from('transactions')
        .select('type, amount, occurred_on, category_id')
        .gte('occurred_on', start)
        .lt('occurred_on', next)
        .order('occurred_on')
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    state.yearRows[year] = rows;
  }

  async function ensureYear() {
    const year = state.trendYear;
    state.yearPartial = false;
    if (state.yearRows[year]) return;
    if (!navigator.onLine || state.viewingCache) { state.yearPartial = true; return; }
    try {
      await loadYear(year);
    } catch (err) {
      state.yearPartial = true;
      if (!Offline.isNetworkError(err)) toast(friendlyError(err));
    }
  }

  function renderTrend() {
    const year = state.trendRange === 'year';
    const now = new Date();
    fillTrendCategories();
    const pick = (rows) => Trend.filterByCategory(rows.concat(pendingList()), state.trendCategory);
    let series;
    if (year) {
      series = Trend.monthlySeries(pick(state.yearRows[state.trendYear] || state.trendRows), new Date(state.trendYear, 11, 1), 12);
    } else {
      series = Trend.monthlySeries(pick(state.trendRows), now);
    }
    const catLabel = state.trendCategory === Trend.NO_CATEGORY ? 'Sem categoria' : state.trendCategory ? categoryName(state.trendCategory) : '';
    $('trend-title').textContent = (year ? `Ano de ${state.trendYear}` : 'Últimos 6 meses') + (catLabel ? ` · ${catLabel}` : '');
    $('trend-year-nav').hidden = !year;
    $('year-label').textContent = state.trendYear;
    $('year-next').disabled = state.trendYear >= now.getFullYear();
    $('trend-note').hidden = !(year && state.yearPartial);
    $('trend-note').textContent = 'Sem conexão: mostrando só o que está salvo neste aparelho (últimos 6 meses).';
    // o painel só some quando não há nada na visão de 6 meses e o usuário não está olhando o ano
    const seriesRecent = Trend.monthlySeries(state.trendRows.concat(pendingList()), now);
    $('trend').hidden = !(Trend.hasData(seriesRecent) || year);
    if ($('trend').hidden) return;
    state.trendSeries = series;
    if (!Trend.hasData(series)) {
      $('trend-chart').replaceChildren(el('p', 'empty', catLabel ? 'Nenhum lançamento desta categoria no período.' : `Nenhum lançamento em ${state.trendYear}.`));
      $('trend-readout').replaceChildren();
      fillTrendTable(series);
      return;
    }
    drawTrendChart(series);
    fillTrendTable(series);
    let sel = state.trendSel;
    if (year) sel = sel !== null && sel < series.length ? sel : null;
    else sel = sel !== null && sel < series.length ? sel : series.length - 1;
    selectTrendMonth(sel);
  }

  // Opções do filtro: despesas e receitas em grupos; mantém a escolha se a categoria ainda existe.
  function fillTrendCategories() {
    const select = $('trend-category');
    const valid = new Set(['', Trend.NO_CATEGORY, ...state.categories.map((c) => c.id)]);
    if (!valid.has(state.trendCategory)) state.trendCategory = '';
    select.replaceChildren(new Option('Todas as categorias', ''));
    for (const [label, type] of [['Despesas', 'expense'], ['Receitas', 'income']]) {
      const list = state.categories.filter((c) => c.type === type);
      if (list.length === 0) continue;
      const group = document.createElement('optgroup');
      group.label = label;
      for (const c of list) group.append(new Option(c.name, c.id));
      select.append(group);
    }
    select.append(new Option('Sem categoria', Trend.NO_CATEGORY));
    select.value = state.trendCategory;
  }

  $('trend-category').addEventListener('change', (e) => {
    state.trendCategory = e.target.value;
    state.trendSel = state.trendRange === 'year' ? null : 5;
    renderTrend();
  });

  async function setTrendRange(range) {
    state.trendRange = range;
    state.trendSel = range === 'year' ? null : state.trendSeries ? state.trendSeries.length - 1 : null;
    if (range === 'year') await ensureYear();
    renderTrend();
  }

  document.querySelectorAll('input[name=trange]').forEach((input) => {
    input.addEventListener('change', () => { if (input.checked) setTrendRange(input.value); });
  });

  async function shiftYear(delta) {
    const next = state.trendYear + delta;
    if (next > new Date().getFullYear() || next < 2000) return;
    state.trendYear = next;
    state.trendSel = null;
    await ensureYear();
    renderTrend();
  }
  $('year-prev').addEventListener('click', () => shiftYear(-1));
  $('year-next').addEventListener('click', () => shiftYear(1));

  $('trend-toggle').addEventListener('click', () => {
    const showTable = $('trend-table-wrap').hidden;
    $('trend-table-wrap').hidden = !showTable;
    $('trend-chart').hidden = showTable;
    $('trend-readout').hidden = showTable;
    $('trend-toggle').textContent = showTable ? 'Ver gráfico' : 'Ver em tabela';
  });

  // Quem ainda não tem nenhum dado vê os primeiros passos no Resumo.
  function categoriesSeen() {
    try { return localStorage.getItem('caixa-categorias-vistas') === '1'; } catch (err) { return false; }
  }

  function renderOnboarding() {
    const fresh =
      state.hints && !state.hasAnyTx && state.recurring.length === 0 && state.bills.length === 0 &&
      state.budgets.length === 0 && state.goals.length === 0;
    $('onboarding').hidden = !fresh;
    const seen = categoriesSeen();
    const step = $('onb-cats-step');
    step.classList.toggle('done', seen);
    step.querySelector('.step-mark').textContent = seen ? '✓' : '2';
  }

  $('onb-cats').addEventListener('click', () => switchTab('categories'));
  $('onb-first').addEventListener('click', () => openSheet(null));

  function renderSecurityOnce() {
    if (state.securityShown) return;
    state.securityShown = true;
    renderSecurity();
  }

  function renderSummary() {
    let income = 0;
    let expense = 0;
    const perCategory = new Map();

    for (const t of state.transactions) {
      if (t.type === 'income') {
        income += t.amount;
      } else {
        expense += t.amount;
        perCategory.set(t.category_id, (perCategory.get(t.category_id) || 0) + t.amount);
      }
    }

    const balance = income - expense;
    const value = $('balance-value');
    value.textContent = brl.format(balance);
    value.classList.toggle('neg', balance < 0);
    $('total-income').textContent = brl.format(income);
    $('total-expense').textContent = brl.format(expense);

    const total = income + expense;
    $('split-income').style.width = total ? `${(income / total) * 100}%` : '0%';
    $('split-expense').style.width = total ? `${(expense / total) * 100}%` : '0%';

    const fixed = Recurring.fixedExpenseTotal(state.recurring);
    $('fixed-total').hidden = fixed.count === 0;
    if (fixed.count > 0) {
      $('fixed-total').textContent =
        `Despesas fixas: ${brl.format(fixed.total)} por mês, em ${fixed.count} ` +
        (fixed.count === 1 ? 'lançamento.' : 'lançamentos.');
    }

    renderBudgetProgress(perCategory);

    const list = $('breakdown');
    list.replaceChildren();
    const rows = [...perCategory.entries()].sort((a, b) => b[1] - a[1]);
    $('breakdown-empty').hidden = rows.length > 0;

    for (const [id, sum] of rows) {
      const li = el('li');
      const row = el('div', 'row');
      row.append(el('span', 'name', categoryName(id)), el('span', 'val', brl.format(sum)));
      const bar = el('div', 'bar');
      const fill = el('span');
      fill.style.width = `${(sum / expense) * 100}%`;
      bar.append(fill);
      li.append(row, bar);
      list.append(li);
    }
  }

  function renderBudgetProgress(spentByCategory) {
    const rows = Budget.budgetRows(state.budgets, spentByCategory);
    $('budget-progress').hidden = rows.length === 0;
    const ul = $('budget-list');
    ul.replaceChildren();
    for (const r of rows) {
      const li = el('li', r.level);
      const row = el('div', 'row');
      row.append(
        el('span', 'name', categoryName(r.category_id)),
        el('span', 'val', `${brl.format(r.spent)} de ${brl.format(r.monthly_limit)}`)
      );
      const bar = el('div', 'bar');
      const fill = el('span');
      fill.style.width = `${Math.min(r.percent, 100)}%`;
      bar.append(fill);
      li.append(row, bar);
      if (r.level === 'over') {
        li.append(el('span', 'hint', `Passou ${brl.format(-r.remaining)} do limite.`));
      } else if (r.level === 'warn') {
        li.append(el('span', 'hint', `${r.percent}% do limite. Restam ${brl.format(r.remaining)}.`));
      }
      ul.append(li);
    }
  }

  function renderList() {
    const box = $('tx-groups');
    box.replaceChildren();
    renderPeriodBar();
    const rows = state.listTx;
    $('tx-empty').hidden = rows.length > 0;
    $('tx-empty').textContent = Period.isDefault(state.listMode, state.listDate, new Date())
      ? 'Nenhum lançamento hoje. Toque em + para adicionar.'
      : 'Nenhum lançamento neste período. Toque em + para adicionar.';

    // Lançamentos ainda não enviados (offline) não têm id salvo no banco: não dá pra
    // selecioná-los. Tira do conjunto qualquer id selecionado que não existe mais aqui.
    const selectable = rows.filter((t) => !t.pending);
    const selectableIds = new Set(selectable.map((t) => t.id));
    for (const id of state.selected) if (!selectableIds.has(id)) state.selected.delete(id);

    const byDay = new Map();
    for (const t of rows) {
      if (!byDay.has(t.occurred_on)) byDay.set(t.occurred_on, []);
      byDay.get(t.occurred_on).push(t);
    }

    for (const [day, items] of byDay) {
      const group = el('section', 'day');
      group.append(el('h3', '', dayFmt.format(parseYmd(day))));
      for (const t of items) {
        const selected = state.selecting && state.selected.has(t.id);
        const btn = el('button', `tx ${t.type}${selected ? ' selected' : ''}`);
        btn.type = 'button';
        const info = el('span', 'info');
        info.append(
          el('span', 'title', t.description || categoryName(t.category_id)),
          el('span', 'sub', categoryName(t.category_id))
        );
        const sign = t.type === 'income' ? '+ ' : '− ';
        if (state.selecting && !t.pending) {
          const check = document.createElement('input');
          check.type = 'checkbox';
          check.className = 'check';
          check.checked = selected;
          check.tabIndex = -1;
          check.setAttribute('aria-hidden', 'true');
          btn.append(check);
        }
        btn.append(el('span', 'dot'), info, el('span', 'amount', sign + brl.format(t.amount)));
        if (t.pending) {
          btn.classList.add('pending');
          btn.addEventListener('click', () => toast('Este lançamento ainda não foi enviado. Ele sobe sozinho quando a internet voltar.'));
        } else if (state.selecting) {
          btn.addEventListener('click', () => {
            if (state.selected.has(t.id)) state.selected.delete(t.id); else state.selected.add(t.id);
            renderList();
          });
        } else {
          btn.addEventListener('click', () => openSheet(t));
        }
        group.append(btn);
      }
      box.append(group);
    }

    renderBulkBar(selectable.length);
  }

  function renderBulkBar(selectableCount) {
    $('tx-select-toggle').hidden = state.selecting;
    $('tx-bulk-bar').hidden = !state.selecting;
    if (!state.selecting) return;
    const n = state.selected.size;
    $('tx-bulk-count').textContent = n === 0 ? 'Nenhum selecionado' : n === 1 ? '1 selecionado' : `${n} selecionados`;
    $('tx-select-all').checked = selectableCount > 0 && n === selectableCount;
    $('tx-select-all').disabled = selectableCount === 0;
    $('tx-bulk-delete').disabled = n === 0;
  }

  function exitSelectMode() {
    state.selecting = false;
    state.selected = new Set();
  }

  $('tx-select-toggle').addEventListener('click', () => {
    state.selecting = true;
    state.selected = new Set();
    renderList();
  });

  $('tx-bulk-cancel').addEventListener('click', () => {
    exitSelectMode();
    renderList();
  });

  $('tx-select-all').addEventListener('change', (e) => {
    if (e.target.checked) {
      state.selected = new Set(state.listTx.filter((t) => !t.pending).map((t) => t.id));
    } else {
      state.selected = new Set();
    }
    renderList();
  });

  $('tx-bulk-delete').addEventListener('click', async () => {
    const ids = [...state.selected];
    if (ids.length === 0) return;
    if (!navigator.onLine) { toast('Sem conexão: excluir precisa de internet.'); return; }
    const msg = ids.length === 1 ? 'Excluir 1 lançamento?' : `Excluir ${ids.length} lançamentos?`;
    if (!confirm(msg)) return;
    const button = $('tx-bulk-delete');
    button.disabled = true;
    try {
      for (let i = 0; i < ids.length; i += 80) {
        const { error } = await sb.from('transactions').delete().in('id', ids.slice(i, i + 80));
        if (error) throw error;
      }
      toast(ids.length === 1 ? '1 lançamento excluído' : `${ids.length} lançamentos excluídos`);
      exitSelectMode();
      await refresh();
    } catch (err) {
      toast(friendlyError(err));
      button.disabled = state.selected.size === 0;
    }
  });

  function renderCategories() {
    for (const type of ['expense', 'income']) {
      const ul = $(`cats-${type}`);
      ul.replaceChildren();
      for (const c of state.categories.filter((x) => x.type === type)) {
        const li = el('li');
        const remove = el('button', 'remove', '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Excluir categoria ${c.name}`);
        remove.addEventListener('click', () => removeCategory(c));
        li.append(el('span', '', c.name), remove);
        ul.append(li);
      }
    }
  }

  /* ---------- Regras de categoria ---------- */

  function renderCategoryRules() {
    const ul = $('rules-list');
    ul.replaceChildren();
    $('rules-empty').hidden = state.rules.length > 0;
    for (const r of state.rules) {
      const li = el('li');
      const cat = state.categories.find((c) => c.id === r.category_id);
      const text = el('span', 'bill-text');
      text.append(el('span', 'title', `“${r.pattern}”`), el('span', 'sub', `→ ${cat ? cat.name : 'categoria apagada'}`));
      const remove = el('button', 'remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Excluir regra ${r.pattern}`);
      remove.addEventListener('click', () => removeRule(r));
      li.append(text, remove);
      ul.append(li);
    }

    const select = $('rule-category');
    const keep = select.value;
    select.replaceChildren();
    for (const [label, type] of [['Despesas', 'expense'], ['Receitas', 'income']]) {
      const list = state.categories.filter((c) => c.type === type);
      if (list.length === 0) continue;
      const group = document.createElement('optgroup');
      group.label = label;
      for (const c of list) group.append(new Option(c.name, c.id));
      select.append(group);
    }
    if (keep) select.value = keep;
    $('rule-add').disabled = state.categories.length === 0;
    $('rule-apply').disabled = state.rules.length === 0;
  }

  function showRulesError(msg) {
    $('rules-error').textContent = msg;
    $('rules-error').hidden = !msg;
  }

  $('rule-add').addEventListener('click', async () => {
    showRulesError('');
    const parsed = Classifier.normalizePattern($('rule-pattern').value);
    if (!parsed.ok) { showRulesError(parsed.error); return; }
    if (!$('rule-category').value) { showRulesError('Escolha a categoria.'); return; }
    if (state.rules.some((r) => r.pattern === parsed.pattern)) { showRulesError('Já existe uma regra para esse texto.'); return; }
    if (!navigator.onLine) { showRulesError('Sem conexão: criar regras precisa de internet.'); return; }
    const { error } = await sb.from('category_rules').insert({ pattern: parsed.pattern, category_id: $('rule-category').value });
    if (error) { showRulesError(friendlyError(error)); return; }
    $('rule-pattern').value = '';
    toast('Regra criada');
    await refresh();
  });

  async function removeRule(r) {
    const { error } = await sb.from('category_rules').delete().eq('id', r.id);
    if (error) { showRulesError(friendlyError(error)); return; }
    toast('Regra excluída');
    await refresh();
  }

  // Aplica as regras (só elas, não o histórico) aos lançamentos que estão sem categoria.
  $('rule-apply').addEventListener('click', async () => {
    showRulesError('');
    if (!navigator.onLine) { showRulesError('Sem conexão: precisa de internet.'); return; }
    $('rule-apply').disabled = true;
    try {
      const { data, error } = await sb
        .from('transactions')
        .select('id, type, description')
        .is('category_id', null)
        .not('description', 'is', null)
        .limit(1000);
      if (error) throw error;
      const byCategory = new Map();
      for (const t of data) {
        const guess = Classifier.classify(state.rules, state.categories, t.type, t.description, null);
        if (!guess) continue;
        if (!byCategory.has(guess.id)) byCategory.set(guess.id, []);
        byCategory.get(guess.id).push(t.id);
      }
      let changed = 0;
      for (const [categoryId, ids] of byCategory) {
        for (let i = 0; i < ids.length; i += 80) {
          const part = ids.slice(i, i + 80);
          const res = await sb.from('transactions').update({ category_id: categoryId }).in('id', part);
          if (res.error) throw res.error;
          changed += part.length;
        }
      }
      toast(changed === 0 ? 'Nenhum lançamento sem categoria combina com as regras' : changed === 1 ? '1 lançamento classificado' : `${changed} lançamentos classificados`);
      if (changed > 0) await refresh();
    } catch (err) {
      showRulesError(friendlyError(err));
    } finally {
      $('rule-apply').disabled = state.rules.length === 0;
    }
  });

  /* ---------- Barra de período da lista ---------- */

  const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const yearFmt = new Intl.DateTimeFormat('pt-BR', { year: 'numeric' });

  function periodLabel() {
    const d = state.listDate;
    if (state.listMode === 'year') return yearFmt.format(d);
    if (state.listMode === 'month') return monthFmt.format(d);
    const off = Period.dayOffset(d, new Date());
    const base = weekdayFmt.format(d);
    if (off === 0) return `Hoje, ${base}`;
    if (off === -1) return `Ontem, ${base}`;
    if (off === 1) return `Amanhã, ${base}`;
    return `${base} de ${d.getFullYear()}`;
  }

  function pickValue() {
    const d = state.listDate;
    if (state.listMode === 'year') return String(d.getFullYear());
    if (state.listMode === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    return ymd(d);
  }

  function renderPeriodBar() {
    $(`period-${state.listMode}`).checked = true;
    $('period-label').textContent = periodLabel();
    const pick = $('period-pick');
    const type = state.listMode === 'year' ? 'number' : state.listMode === 'month' ? 'month' : 'date';
    if (pick.type !== type) pick.type = type;
    if (type === 'number') { pick.min = '2000'; pick.max = '2100'; pick.step = '1'; pick.inputMode = 'numeric'; }
    pick.value = pickValue();
    pick.setAttribute('aria-label', state.listMode === 'year' ? 'Ir para um ano' : state.listMode === 'month' ? 'Ir para um mês' : 'Ir para um dia');
    $('period-today').hidden = Period.isDefault(state.listMode, state.listDate, new Date());

    let income = 0;
    let expense = 0;
    for (const t of state.listTx) {
      if (t.type === 'income') income += t.amount; else expense += t.amount;
    }
    const box = $('period-totals');
    box.replaceChildren();
    if (state.listTx.length > 0) {
      const part = (label, value) => { const s = el('span'); s.append(`${label} `, el('b', '', brl.format(value))); return s; };
      box.append(part('Receitas', income), part('Despesas', expense), part('Saldo', income - expense));
    }
    if (state.listPartial) {
      box.append(el('span', 'note', 'Sem conexão: só aparece o que está salvo neste aparelho (últimos 6 meses).'));
    }
  }

  document.querySelectorAll('input[name=period]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.listMode = input.value;
      refreshList();
    });
  });
  $('period-prev').addEventListener('click', () => { state.listDate = Period.shift(state.listMode, state.listDate, -1); refreshList(); });
  $('period-next').addEventListener('click', () => { state.listDate = Period.shift(state.listMode, state.listDate, 1); refreshList(); });
  $('period-today').addEventListener('click', () => { state.listMode = 'day'; state.listDate = new Date(); refreshList(); });
  $('period-pick').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) return;
    let d;
    if (state.listMode === 'year') {
      const y = Number(v);
      if (!(y >= 2000 && y <= 2100)) return;
      d = new Date(y, state.listDate.getMonth(), Math.min(state.listDate.getDate(), 28));
    } else if (state.listMode === 'month') {
      const [y, m] = v.split('-').map(Number);
      d = new Date(y, m - 1, 1);
    } else {
      d = parseYmd(v);
    }
    state.listDate = d;
    refreshList();
  });

  /* ---------- Navegação ---------- */

  function switchTab(name) {
    if (name !== 'list' && state.selecting) { exitSelectMode(); renderList(); }
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.tab === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    // O botão de novo lançamento só aparece na aba Lançamentos.
    $('fab').hidden = name !== 'list';
    // Na lista o período vale para o dia, mês ou ano escolhidos ali; nas outras abas, o mês de cima.
    $('month-nav').hidden = name === 'list';
    $('topbar-title').hidden = name !== 'list';
    window.scrollTo(0, 0);
    if (name === 'categories') {
      try { localStorage.setItem('caixa-categorias-vistas', '1'); } catch (err) { /* sem problema */ }
    }
  }

  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => switchTab(t.dataset.tab))
  );

  function shiftMonth(delta) {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
    $('month-label').textContent = monthFmt.format(state.month);
    refreshMonth();
  }
  $('month-prev').addEventListener('click', () => shiftMonth(-1));
  $('month-next').addEventListener('click', () => shiftMonth(1));

  /* ---------- Categorias ---------- */

  $('cat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('cat-name').value.trim();
    const type = $('cat-type').value;
    if (!name) { toast('Digite um nome para a categoria.'); return; }

    const { error } = await sb.from('categories').insert({ name, type });
    if (error) {
      toast(error.code === '23505' ? 'Essa categoria já existe.' : friendlyError(error));
      return;
    }
    $('cat-name').value = '';
    toast('Categoria adicionada');
    await refresh();
  });

  async function removeCategory(category) {
    const ok = confirm(
      `Excluir a categoria "${category.name}"? Os lançamentos continuam, mas ficam sem categoria.`
    );
    if (!ok) return;
    const { error } = await sb.from('categories').delete().eq('id', category.id);
    if (error) { toast(friendlyError(error)); return; }
    toast('Categoria excluída');
    await refresh();
  }

  /* ---------- Lançamentos ---------- */

  const sheet = $('sheet');

  function fillCategoryOptions(type, selected) {
    const select = $('tx-category');
    select.replaceChildren();
    const none = el('option', '', 'Sem categoria');
    none.value = '';
    select.append(none);
    for (const c of state.categories.filter((x) => x.type === type)) {
      const opt = el('option', '', c.name);
      opt.value = c.id;
      select.append(opt);
    }
    select.value = selected && [...select.options].some((o) => o.value === selected) ? selected : '';
  }

  function currentType() {
    return document.querySelector('input[name="type"]:checked').value;
  }

  function showHint(message) {
    $('tx-hint').textContent = message || '';
    $('tx-hint').hidden = !message;
  }

  function fillDescriptionOptions(type) {
    const list = $('desc-options');
    list.replaceChildren();
    if (!state.hints) return;
    for (const d of Quick.recentDescriptions(state.hints, type)) {
      const o = el('option');
      o.value = d;
      list.append(o);
    }
  }

  document.querySelectorAll('input[name="type"]').forEach((r) =>
    r.addEventListener('change', () => {
      fillCategoryOptions(currentType(), '');
      fillDescriptionOptions(currentType());
      state.categoryTouched = false;
      showHint('');
    })
  );

  // Ao digitar a descrição de um lançamento novo, sugere a categoria usada antes.
  $('tx-desc').addEventListener('input', () => {
    if (state.editing || state.categoryTouched || !state.hints) return;
    const type = currentType();
    const guess = Classifier.classify(state.rules, state.categories, type, $('tx-desc').value, Quick.suggestCategory(state.hints, type, $('tx-desc').value));
    const id = guess ? guess.id : null;
    const valid = Boolean(id);
    $('tx-category').value = valid ? id : '';
    showHint(valid ? `Categoria sugerida: ${categoryName(id)}` : '');
  });

  $('tx-category').addEventListener('change', () => {
    state.categoryTouched = true;
    showHint('');
  });

  $('tx-repeat').addEventListener('click', () => {
    const last = state.hints && state.hints.last;
    if (!last) return;
    $(`type-${last.type}`).checked = true;
    $('tx-amount').value = last.amount.toFixed(2).replace('.', ',');
    $('tx-desc').value = last.description;
    fillCategoryOptions(last.type, last.category_id);
    fillDescriptionOptions(last.type);
    state.categoryTouched = true;
    showHint('');
    $('tx-save').focus();
  });

  // tx = lançamento a editar; presetType = tipo inicial de um lançamento novo.
  function openSheet(tx, presetType) {
    state.editing = tx || null;
    state.categoryTouched = false;
    showHint('');
    $('tx-error').hidden = true;
    $('sheet-title').textContent = tx ? 'Editar lançamento' : 'Novo lançamento';
    $('tx-delete').hidden = !tx;

    const type = tx ? tx.type : presetType || 'expense';
    $(`type-${type}`).checked = true;
    fillDescriptionOptions(type);

    const last = state.hints && state.hints.last;
    const repeat = $('tx-repeat');
    repeat.hidden = !!tx || !last;
    if (last) {
      const what = last.description || categoryName(last.category_id);
      repeat.textContent = `Repetir o último: ${what}, ${brl.format(last.amount)}`;
    }
    $('tx-amount').value = tx ? tx.amount.toFixed(2).replace('.', ',') : '';
    $('tx-desc').value = tx ? tx.description || '' : '';
    fillCategoryOptions(type, tx ? tx.category_id : '');

    const today = new Date();
    const inViewedMonth =
      today.getFullYear() === state.month.getFullYear() && today.getMonth() === state.month.getMonth();
    $('tx-date').value = tx ? tx.occurred_on : ymd(inViewedMonth ? today : state.month);

    sheet.showModal();
    if (!tx) $('tx-amount').focus();
  }

  $('fab').addEventListener('click', () => openSheet(null));
  $('tx-cancel').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => {
    const r = sheet.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) sheet.close();
  });

  $('tx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = $('tx-error');
    errorBox.hidden = true;

    const amount = parseAmount($('tx-amount').value);
    const date = $('tx-date').value;
    if (!(amount > 0)) {
      errorBox.textContent = 'Informe um valor maior que zero.';
      errorBox.hidden = false;
      return;
    }
    if (!date) {
      errorBox.textContent = 'Escolha a data do lançamento.';
      errorBox.hidden = false;
      return;
    }

    const payload = {
      type: currentType(),
      amount,
      description: $('tx-desc').value.trim() || null,
      category_id: $('tx-category').value || null,
      occurred_on: date,
    };

    const save = $('tx-save');

    function saveOffline() {
      const item = store.enqueue(state.userId, { id: Offline.newId(), ...payload, created_at: new Date().toISOString() });
      if (!item) {
        errorBox.textContent = 'Sem conexão e sem espaço para guardar neste aparelho. Tente de novo com internet.';
        errorBox.hidden = false;
        return false;
      }
      sheet.close();
      state.month = firstOfMonth(parseYmd(date));
      focusListOn(date);
      state.viewingCache = state.viewingCache || !navigator.onLine;
      state.transactions = localMonth();
      state.listTx = listLocal();
      render();
      updateBanner();
      toast('Salvo neste aparelho. Envio automático quando a internet voltar.');
      return true;
    }

    if (!navigator.onLine) {
      if (state.editing) {
        errorBox.textContent = 'Sem conexão: editar precisa de internet. Lançamentos novos funcionam offline.';
        errorBox.hidden = false;
        return;
      }
      saveOffline();
      return;
    }

    save.disabled = true;
    const query = state.editing
      ? sb.from('transactions').update(payload).eq('id', state.editing.id)
      : sb.from('transactions').insert(payload);
    const { error } = await query;
    save.disabled = false;

    if (error && !state.editing && Offline.isNetworkError(error)) {
      saveOffline();
      return;
    }
    if (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.hidden = false;
      return;
    }

    sheet.close();
    state.month = firstOfMonth(parseYmd(date));
    focusListOn(date);
    toast('Lançamento salvo');
    await refresh();
  });

  $('tx-delete').addEventListener('click', async () => {
    if (!state.editing) return;
    if (!navigator.onLine) {
      $('tx-error').textContent = 'Sem conexão: excluir precisa de internet.';
      $('tx-error').hidden = false;
      return;
    }
    if (!confirm('Excluir este lançamento?')) return;
    const { error } = await sb.from('transactions').delete().eq('id', state.editing.id);
    if (error) {
      $('tx-error').textContent = friendlyError(error);
      $('tx-error').hidden = false;
      return;
    }
    sheet.close();
    toast('Lançamento excluído');
    await refresh();
  });

  /* ---------- Lançamentos fixos ---------- */

  const recSheet = $('recurring-sheet');

  function monthLabel(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }

  function renderRecurring() {
    const list = $('recurring-list');
    list.replaceChildren();
    $('recurring-empty').hidden = state.recurring.length > 0;

    for (const r of state.recurring) {
      const li = el('li');
      const btn = el('button', `tx ${r.type}${r.active ? '' : ' paused'}`);
      btn.type = 'button';
      const info = el('span', 'info');
      info.append(
        el('span', 'title', r.description),
        el('span', 'sub', `${categoryName(r.category_id)} · todo dia ${r.day_of_month}${r.active ? '' : ' · pausado'}`)
      );
      const sign = r.type === 'income' ? '+ ' : '− ';
      btn.append(el('span', 'dot'), info, el('span', 'amount', sign + brl.format(r.amount)));
      btn.addEventListener('click', () => openRecurringSheet(r));
      li.append(btn);
      list.append(li);
    }

    const box = $('recurring-suggestions');
    const ul = $('suggestion-list');
    ul.replaceChildren();
    box.hidden = state.suggestions.length === 0;
    for (const s of state.suggestions) {
      const li = el('li');
      const text = el('span', 'suggest-text');
      text.append(
        el('span', 'title', s.description),
        el('span', 'sub', `${brl.format(s.amount)} · dia ${s.day} · visto em ${s.months} meses`)
      );
      const add = el('button', 'btn small', 'Adicionar');
      add.type = 'button';
      add.addEventListener('click', () => openRecurringSheet(null, s));
      li.append(text, add);
      ul.append(li);
    }
  }

  function fillRecCategoryOptions(type, selected) {
    const select = $('rec-category');
    select.replaceChildren();
    const none = el('option', '', 'Sem categoria');
    none.value = '';
    select.append(none);
    for (const c of state.categories.filter((x) => x.type === type)) {
      const opt = el('option', '', c.name);
      opt.value = c.id;
      select.append(opt);
    }
    select.value = selected && [...select.options].some((o) => o.value === selected) ? selected : '';
  }

  function currentRecType() {
    return document.querySelector('input[name="rtype"]:checked').value;
  }

  document.querySelectorAll('input[name="rtype"]').forEach((r) =>
    r.addEventListener('change', () => fillRecCategoryOptions(currentRecType(), ''))
  );

  // rec = recorrência existente (editar); hint = sugestão para preencher uma nova.
  function openRecurringSheet(rec, hint) {
    state.editingRecurring = rec || null;
    $('rec-error').hidden = true;
    $('recurring-title').textContent = rec ? 'Editar lançamento fixo' : 'Novo lançamento fixo';
    $('rec-delete').hidden = !rec;
    $('rec-active-row').hidden = !rec;
    $('rec-note').hidden = !rec;

    const src = rec || hint || null;
    const type = src ? src.type : 'expense';
    $(`rtype-${type}`).checked = true;
    $('rec-amount').value = src ? Number(src.amount).toFixed(2).replace('.', ',') : '';
    $('rec-desc').value = src ? src.description || '' : '';
    fillRecCategoryOptions(type, src ? src.category_id : '');
    $('rec-day').value = rec ? rec.day_of_month : hint ? hint.day : new Date().getDate();

    if (rec) {
      $('rec-start').value = rec.start_on.slice(0, 7);
      $('rec-active').checked = rec.active;
    } else {
      $('rec-start').value = hint ? Recurring.nextMonthLabel(hint.lastMonth) : monthLabel(new Date());
    }
    $('rec-start').disabled = !!rec;

    recSheet.showModal();
    if (!rec && !hint) $('rec-amount').focus();
  }

  $('recurring-add').addEventListener('click', () => openRecurringSheet(null));
  $('rec-cancel').addEventListener('click', () => recSheet.close());
  recSheet.addEventListener('click', (e) => {
    const r = recSheet.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (outside) recSheet.close();
  });

  $('recurring-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = $('rec-error');
    errorBox.hidden = true;
    const fail = (message) => { errorBox.textContent = message; errorBox.hidden = false; };

    const amount = parseAmount($('rec-amount').value);
    const description = $('rec-desc').value.trim();
    const day = Number($('rec-day').value);
    const start = $('rec-start').value;
    if (!(amount > 0)) return fail('Informe um valor maior que zero.');
    if (!description) return fail('Digite uma descrição, por exemplo "Aluguel".');
    if (!Number.isInteger(day) || day < 1 || day > 31) return fail('O dia do mês precisa ser de 1 a 31.');
    if (!/^\d{4}-\d{2}$/.test(start)) return fail('Escolha o mês em que começa.');

    const payload = {
      type: currentRecType(),
      amount,
      description,
      category_id: $('rec-category').value || null,
      day_of_month: day,
    };

    const editing = state.editingRecurring;
    if (editing) {
      payload.active = $('rec-active').checked;
      // Ao retomar, não preenche os meses em que ficou pausada.
      if (!editing.active && payload.active) payload.generated_through = Recurring.resumeMarker(new Date());
    } else {
      payload.start_on = `${start}-01`;
    }

    const save = $('rec-save');
    save.disabled = true;
    const query = editing
      ? sb.from('recurring_transactions').update(payload).eq('id', editing.id)
      : sb.from('recurring_transactions').insert(payload);
    const { error } = await query;
    save.disabled = false;
    if (error) return fail(friendlyError(error));

    recSheet.close();
    toast('Lançamento fixo salvo');
    state.lastGeneration = null;
    await refresh();
  });

  $('rec-delete').addEventListener('click', async () => {
    const rec = state.editingRecurring;
    if (!rec) return;
    if (!confirm(`Excluir "${rec.description}"? Os lançamentos já criados continuam.`)) return;
    const { error } = await sb.from('recurring_transactions').delete().eq('id', rec.id);
    if (error) {
      $('rec-error').textContent = friendlyError(error);
      $('rec-error').hidden = false;
      return;
    }
    recSheet.close();
    toast('Lançamento fixo excluído');
    await refresh();
  });

  /* ---------- Orçamento ---------- */

  const budgetSheet = $('budget-sheet');

  function renderBudgetSettings() {
    const ul = $('budget-edit-list');
    ul.replaceChildren();
    $('budget-empty').hidden = state.budgets.length > 0;
    const sorted = state.budgets.slice().sort((a, b) => categoryName(a.category_id).localeCompare(categoryName(b.category_id), 'pt-BR'));
    for (const b of sorted) {
      const li = el('li');
      const btn = el('button', 'tx expense');
      btn.type = 'button';
      const info = el('span', 'info');
      info.append(el('span', 'title', categoryName(b.category_id)), el('span', 'sub', 'Limite por mês'));
      btn.append(el('span', 'dot'), info, el('span', 'amount', brl.format(b.monthly_limit)));
      btn.addEventListener('click', () => openBudgetSheet(b));
      li.append(btn);
      ul.append(li);
    }
  }

  function openBudgetSheet(budget) {
    const taken = new Set(state.budgets.map((b) => b.category_id));
    const options = state.categories.filter(
      (c) => c.type === 'expense' && (budget ? c.id === budget.category_id : !taken.has(c.id))
    );
    if (!budget && options.length === 0) {
      toast('Todas as categorias de despesa já têm limite.');
      return;
    }
    state.editingBudget = budget || null;
    $('bud-error').hidden = true;
    $('budget-title').textContent = budget ? 'Editar limite' : 'Novo limite mensal';
    $('bud-delete').hidden = !budget;
    const select = $('bud-category');
    select.replaceChildren();
    for (const c of options) {
      const o = el('option', '', c.name);
      o.value = c.id;
      select.append(o);
    }
    select.disabled = !!budget;
    $('bud-amount').value = budget ? budget.monthly_limit.toFixed(2).replace('.', ',') : '';
    budgetSheet.showModal();
    $('bud-amount').focus();
  }

  $('budget-add').addEventListener('click', () => openBudgetSheet(null));
  $('bud-cancel').addEventListener('click', () => budgetSheet.close());

  $('budget-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = $('bud-error');
    errorBox.hidden = true;
    const limit = parseAmount($('bud-amount').value);
    const categoryId = $('bud-category').value;
    if (!categoryId) { errorBox.textContent = 'Escolha uma categoria.'; errorBox.hidden = false; return; }
    if (!(limit > 0)) { errorBox.textContent = 'Informe um limite maior que zero.'; errorBox.hidden = false; return; }

    const editing = state.editingBudget;
    const save = $('bud-save');
    save.disabled = true;
    const query = editing
      ? sb.from('budgets').update({ monthly_limit: limit }).eq('id', editing.id)
      : sb.from('budgets').upsert(
          { user_id: state.userId, category_id: categoryId, monthly_limit: limit },
          { onConflict: 'user_id,category_id' }
        );
    const { error } = await query;
    save.disabled = false;
    if (error) { errorBox.textContent = friendlyError(error); errorBox.hidden = false; return; }

    budgetSheet.close();
    toast('Limite salvo');
    await refresh();
  });

  $('bud-delete').addEventListener('click', async () => {
    const b = state.editingBudget;
    if (!b || !confirm(`Remover o limite de "${categoryName(b.category_id)}"?`)) return;
    const { error } = await sb.from('budgets').delete().eq('id', b.id);
    if (error) { $('bud-error').textContent = friendlyError(error); $('bud-error').hidden = false; return; }
    budgetSheet.close();
    toast('Limite removido');
    await refresh();
  });

  /* ---------- Contas a pagar ---------- */

  const billSheet = $('bill-sheet');

  // Dá baixa: cria a despesa de hoje (uma só, pelo external_id) e marca a conta como paga.
  async function payBill(bill) {
    const today = ymd(new Date());
    const { error: txError } = await sb.from('transactions').upsert(
      {
        user_id: state.userId,
        type: 'expense',
        amount: bill.amount,
        description: bill.description,
        category_id: bill.category_id,
        occurred_on: today,
        external_id: `bill:${bill.id}`,
      },
      { onConflict: 'user_id,external_id', ignoreDuplicates: true }
    );
    if (txError) { toast(friendlyError(txError)); return false; }
    const { error } = await sb.from('bills').update({ paid_on: today }).eq('id', bill.id);
    if (error) { toast(friendlyError(error)); return false; }
    state.month = firstOfMonth(new Date());
    toast('Conta paga e lançada nas despesas');
    await refresh();
    return true;
  }

  function renderBills() {
    const today = ymd(new Date());

    const due = Budget.dueBills(state.bills, today);
    $('bills-due').hidden = due.length === 0;
    const dueUl = $('bills-due-list');
    dueUl.replaceChildren();
    for (const b of due) {
      const li = el('li', b.daysLeft < 0 ? 'bill-late' : '');
      const text = el('span', 'bill-text');
      text.append(
        el('span', 'title', b.description),
        el('span', 'sub', `${brl.format(b.amount)} · ${Budget.dueLabel(b.daysLeft)}`)
      );
      const pay = el('button', 'btn small', 'Paguei');
      pay.type = 'button';
      pay.addEventListener('click', async () => {
        pay.disabled = true;
        if (!(await payBill(b))) pay.disabled = false;
      });
      li.append(text, pay);
      dueUl.append(li);
    }

    const ul = $('bills-list');
    ul.replaceChildren();
    $('bills-empty').hidden = state.bills.length > 0;
    for (const b of state.bills) {
      const li = el('li');
      const btn = el('button', 'tx expense');
      btn.type = 'button';
      const info = el('span', 'info');
      info.append(
        el('span', 'title', b.description),
        el('span', 'sub', `${fmtDate(b.due_on)} · ${Budget.dueLabel(Budget.daysUntil(b.due_on, today))}`)
      );
      btn.append(el('span', 'dot'), info, el('span', 'amount', brl.format(b.amount)));
      btn.addEventListener('click', () => openBillSheet(b));
      li.append(btn);
      ul.append(li);
    }
  }

  function openBillSheet(bill) {
    state.editingBill = bill || null;
    $('bill-error').hidden = true;
    $('bill-title').textContent = bill ? 'Editar conta' : 'Nova conta';
    $('bill-delete').hidden = !bill;
    $('bill-pay').hidden = !bill;
    $('bill-amount').value = bill ? bill.amount.toFixed(2).replace('.', ',') : '';
    $('bill-desc').value = bill ? bill.description : '';
    const select = $('bill-category');
    select.replaceChildren();
    const none = el('option', '', 'Sem categoria');
    none.value = '';
    select.append(none);
    for (const c of state.categories.filter((x) => x.type === 'expense')) {
      const o = el('option', '', c.name);
      o.value = c.id;
      select.append(o);
    }
    select.value = bill && bill.category_id ? bill.category_id : '';
    $('bill-due').value = bill ? bill.due_on : ymd(new Date());
    billSheet.showModal();
    if (!bill) $('bill-amount').focus();
  }

  $('bill-add').addEventListener('click', () => openBillSheet(null));
  $('bill-cancel').addEventListener('click', () => billSheet.close());

  $('bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = $('bill-error');
    errorBox.hidden = true;
    const fail = (m) => { errorBox.textContent = m; errorBox.hidden = false; };

    const amount = parseAmount($('bill-amount').value);
    const description = $('bill-desc').value.trim();
    const due = $('bill-due').value;
    if (!(amount > 0)) return fail('Informe um valor maior que zero.');
    if (!description) return fail('Digite uma descrição, por exemplo "Conta de luz".');
    if (!due) return fail('Escolha a data de vencimento.');

    const payload = { amount, description, category_id: $('bill-category').value || null, due_on: due };
    const editing = state.editingBill;
    const save = $('bill-save');
    save.disabled = true;
    const query = editing
      ? sb.from('bills').update(payload).eq('id', editing.id)
      : sb.from('bills').insert(payload);
    const { error } = await query;
    save.disabled = false;
    if (error) return fail(friendlyError(error));

    billSheet.close();
    toast('Conta salva');
    await refresh();
  });

  $('bill-delete').addEventListener('click', async () => {
    const b = state.editingBill;
    if (!b || !confirm(`Excluir a conta "${b.description}"?`)) return;
    const { error } = await sb.from('bills').delete().eq('id', b.id);
    if (error) { $('bill-error').textContent = friendlyError(error); $('bill-error').hidden = false; return; }
    billSheet.close();
    toast('Conta excluída');
    await refresh();
  });

  $('bill-pay').addEventListener('click', async () => {
    const b = state.editingBill;
    if (!b) return;
    $('bill-pay').disabled = true;
    const ok = await payBill({
      ...b,
      amount: parseAmount($('bill-amount').value) || b.amount,
      description: $('bill-desc').value.trim() || b.description,
      category_id: $('bill-category').value || null,
    });
    $('bill-pay').disabled = false;
    if (ok) billSheet.close();
  });

  /* ---------- Segurança: alterar a senha ---------- */

  const pwSheet = $('pw-sheet');
  const pwFields = ['pw-current', 'pw-new', 'pw-confirm'];

  function renderChangeRules() {
    renderRules($('pw-rules'), $('pw-new').value, $('pw-confirm').value);
  }

  $('pw-open').addEventListener('click', async () => {
    pwFields.forEach((id) => { $(id).value = ''; $(id).type = 'password'; });
    $('pw-otp').value = '';
    $('pw-show').checked = false;
    $('pw-error').hidden = true;
    // Com duas etapas ativas, a troca também pede o código do autenticador.
    let factor = null;
    try { factor = await verifiedFactor(); } catch (err) { /* sem informação: segue sem o campo */ }
    state.pwFactorId = factor ? factor.id : null;
    $('pw-otp-row').hidden = !factor;
    renderChangeRules();
    pwSheet.showModal();
    $('pw-current').focus();
  });

  $('pw-cancel').addEventListener('click', () => pwSheet.close());
  $('pw-new').addEventListener('input', renderChangeRules);
  $('pw-confirm').addEventListener('input', renderChangeRules);
  $('pw-show').addEventListener('change', (e) => {
    pwFields.forEach((id) => { $(id).type = e.target.checked ? 'text' : 'password'; });
  });

  $('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = $('pw-error');
    errorBox.hidden = true;
    const fail = (message, field) => { errorBox.textContent = message; errorBox.hidden = false; $(field).focus(); };

    const current = $('pw-current').value;
    const next = $('pw-new').value;
    const confirmation = $('pw-confirm').value;
    if (!current) return fail('Digite a senha atual.', 'pw-current');
    const missing = Password.rules(next, confirmation).filter((r) => !r.ok);
    if (missing.some((r) => r.id !== 'match')) return fail('A nova senha ainda não atende a todos os requisitos listados.', 'pw-new');
    if (missing.length > 0) return fail('As senhas não são iguais.', 'pw-confirm');
    if (next === current) return fail('A nova senha precisa ser diferente da atual.', 'pw-new');

    const otp = $('pw-otp').value.replace(/\s/g, '');
    if (state.pwFactorId && !/^\d{6}$/.test(otp)) return fail('Digite os 6 dígitos do código do autenticador.', 'pw-otp');

    const button = $('pw-submit');
    button.disabled = true;
    if (state.pwFactorId) {
      // Confere o código agora, no servidor, antes de trocar a senha.
      const { error: otpError } = await sb.auth.mfa.challengeAndVerify({ factorId: state.pwFactorId, code: otp });
      if (otpError) {
        button.disabled = false;
        return fail(friendlyError(otpError), 'pw-otp');
      }
    }
    const { error } = await sb.auth.updateUser({ password: next, current_password: current });
    button.disabled = false;
    if (error) {
      const wrongCurrent = /current.?password|incorrect.*password/i.test(error.message || '');
      return fail(friendlyError(error), wrongCurrent ? 'pw-current' : 'pw-new');
    }
    pwFields.forEach((id) => { $(id).value = ''; });
    $('pw-otp').value = '';
    pwSheet.close();
    toast('Senha alterada');
  });

  /* ---------- Segurança: ativar e desativar 2FA ---------- */

  const mfaSheet = $('mfa-sheet');
  let pendingFactorId = null;

  async function renderSecurity() {
    try {
      const factor = await verifiedFactor();
      $('mfa-status').textContent = factor
        ? 'Verificação em duas etapas ativa. Ao entrar, o app pede o código do autenticador.'
        : 'Adicione uma segunda etapa ao entrar: um código de 6 dígitos de um app autenticador.';
      $('mfa-enable').hidden = !!factor;
      $('mfa-disable').hidden = !factor;
    } catch (err) {
      $('mfa-status').textContent = 'Não foi possível verificar a segurança da conta agora.';
      $('mfa-enable').hidden = true;
      $('mfa-disable').hidden = true;
    }
  }

  async function discardPendingFactor() {
    if (!pendingFactorId) return;
    const id = pendingFactorId;
    pendingFactorId = null;
    try { await sb.auth.mfa.unenroll({ factorId: id }); } catch (err) { /* já removido */ }
  }

  $('mfa-enable').addEventListener('click', async () => {
    const button = $('mfa-enable');
    button.disabled = true;
    try {
      // Remove tentativas anteriores que ficaram sem confirmar.
      const { data: all } = await sb.auth.mfa.listFactors();
      for (const f of (all && all.all) || []) {
        if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Caixa' });
      if (error) throw error;
      pendingFactorId = data.id;
      $('mfa-qr').src = data.totp.qr_code;
      $('mfa-secret').textContent = data.totp.secret;
      $('mfa-enroll-code').value = '';
      $('mfa-enroll-error').hidden = true;
      mfaSheet.showModal();
      $('mfa-enroll-code').focus();
    } catch (err) {
      toast(friendlyError(err));
    } finally {
      button.disabled = false;
    }
  });

  $('mfa-enroll-cancel').addEventListener('click', () => mfaSheet.close());
  mfaSheet.addEventListener('close', discardPendingFactor);

  $('mfa-enroll-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = $('mfa-enroll-error');
    errorBox.hidden = true;
    const code = $('mfa-enroll-code').value.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) {
      errorBox.textContent = 'Digite os 6 dígitos do código.';
      errorBox.hidden = false;
      return;
    }
    const button = $('mfa-enroll-submit');
    button.disabled = true;
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: pendingFactorId, code });
    button.disabled = false;
    if (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.hidden = false;
      return;
    }
    pendingFactorId = null; // confirmado: não descartar ao fechar
    mfaSheet.close();
    toast('Verificação em duas etapas ativada');
    await renderSecurity();
  });

  $('mfa-disable').addEventListener('click', async () => {
    if (!confirm('Desativar a verificação em duas etapas? Sua conta volta a pedir só a senha.')) return;
    try {
      const factor = await verifiedFactor();
      if (factor) {
        const { error } = await sb.auth.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }
      toast('Verificação em duas etapas desativada');
    } catch (err) {
      toast(friendlyError(err));
    }
    await renderSecurity();
  });

  /* ---------- Baixar todos os dados ---------- */

  async function fetchAllRows(table) {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select('*').order('created_at').order('id').range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) return all;
    }
  }

  $('backup-download').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    try {
      const tables = {};
      for (const t of ['categories', 'transactions', 'recurring_transactions', 'budgets', 'bills', 'goals']) {
        tables[t] = await fetchAllRows(t);
      }
      const json = Extras.buildBackup(tables, new Date());
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = el('a');
      a.href = url;
      a.download = `caixa-backup-${ymd(new Date())}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('Cópia dos dados baixada');
    } catch (err) {
      toast(friendlyError(err));
    } finally {
      button.disabled = false;
    }
  });

  /* ---------- Exportar CSV ---------- */

  function downloadText(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = el('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function loadAllTransactions() {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from('transactions')
        .select('id, type, amount, description, occurred_on, category_id')
        .order('occurred_on', { ascending: false })
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      all.push(...data);
      if (data.length < 1000) return all;
    }
  }

  async function exportCSV(button, scope) {
    button.disabled = true;
    try {
      const rows = scope === 'all' ? await loadAllTransactions() : state.transactions;
      if (rows.length === 0) { toast('Não há lançamentos para exportar.'); return; }
      const label = scope === 'all' ? 'todos' : monthLabel(state.month);
      downloadText(Extras.transactionsToCSV(rows, categoryName), Extras.exportFileName(label));
      toast(`${rows.length} lançamentos exportados`);
    } catch (err) {
      toast(friendlyError(err));
    } finally {
      button.disabled = false;
    }
  }

  $('export-month').addEventListener('click', (e) => exportCSV(e.currentTarget, 'month'));
  $('export-all').addEventListener('click', (e) => exportCSV(e.currentTarget, 'all'));

  /* ---------- Metas ---------- */

  const goalSheet = $('goal-sheet');

  function renderGoals() {
    const today = ymd(new Date());
    const ul = $('goals-list');
    ul.replaceChildren();
    $('goals-empty').hidden = state.goals.length > 0;
    for (const g of state.goals) {
      const info = Extras.goalInfo(g, today);
      const li = el('li');
      const btn = el('button', 'tx income');
      btn.type = 'button';
      const text = el('span', 'info');
      text.append(
        el('span', 'title', g.name),
        el('span', 'sub', `${brl.format(g.saved_amount)} de ${brl.format(g.target_amount)}`)
      );
      btn.append(el('span', 'dot'), text, el('span', 'amount', `${info.percent}%`));
      btn.addEventListener('click', () => openGoalSheet(g));
      const bar = el('div', 'goal-bar');
      const fill = el('span');
      fill.style.width = `${Math.min(info.percent, 100)}%`;
      bar.append(fill);
      li.append(btn, bar);

      let note = '';
      if (info.done) note = 'Meta alcançada!';
      else if (info.overdue) note = `Prazo vencido em ${fmtDate(g.deadline)}. Faltam ${brl.format(info.remaining)}.`;
      else if (g.deadline) note = `Guarde ${brl.format(info.perMonth)} por mês até ${fmtDate(g.deadline)}.`;
      else note = `Faltam ${brl.format(info.remaining)}.`;
      li.append(el('p', `goal-note${info.overdue ? ' late' : ''}`, note));
      ul.append(li);
    }
  }

  function openGoalSheet(goal) {
    state.editingGoal = goal || null;
    $('goal-error').hidden = true;
    $('goal-title').textContent = goal ? 'Editar meta' : 'Nova meta';
    $('goal-delete').hidden = !goal;
    $('goal-more-row').hidden = !goal;
    $('goal-name').value = goal ? goal.name : '';
    $('goal-target').value = goal ? goal.target_amount.toFixed(2).replace('.', ',') : '';
    $('goal-saved').value = goal && goal.saved_amount ? goal.saved_amount.toFixed(2).replace('.', ',') : '';
    $('goal-more').value = '';
    $('goal-deadline').value = goal && goal.deadline ? goal.deadline : '';
    goalSheet.showModal();
    if (!goal) $('goal-name').focus();
  }

  $('goal-add').addEventListener('click', () => openGoalSheet(null));
  $('goal-cancel').addEventListener('click', () => goalSheet.close());

  $('goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = $('goal-error');
    errorBox.hidden = true;
    const fail = (m) => { errorBox.textContent = m; errorBox.hidden = false; };

    const name = $('goal-name').value.trim();
    const target = parseAmount($('goal-target').value);
    const savedRaw = $('goal-saved').value.trim();
    const moreRaw = $('goal-more').value.trim();
    const saved = savedRaw ? parseAmount(savedRaw) : 0;
    const more = moreRaw ? parseAmount(moreRaw) : 0;
    if (!name) return fail('Dê um nome para a meta, por exemplo "Viagem".');
    if (!(target > 0)) return fail('Informe um valor de meta maior que zero.');
    if (!(saved >= 0) || !(more >= 0)) return fail('Os valores guardados não podem ser negativos.');

    const payload = {
      name,
      target_amount: target,
      saved_amount: Math.round((saved + more) * 100) / 100,
      deadline: $('goal-deadline').value || null,
    };
    const editing = state.editingGoal;
    const save = $('goal-save');
    save.disabled = true;
    const query = editing
      ? sb.from('goals').update(payload).eq('id', editing.id)
      : sb.from('goals').insert(payload);
    const { error } = await query;
    save.disabled = false;
    if (error) return fail(friendlyError(error));

    goalSheet.close();
    toast('Meta salva');
    await refresh();
  });

  $('goal-delete').addEventListener('click', async () => {
    const g = state.editingGoal;
    if (!g || !confirm(`Excluir a meta "${g.name}"?`)) return;
    const { error } = await sb.from('goals').delete().eq('id', g.id);
    if (error) { $('goal-error').textContent = friendlyError(error); $('goal-error').hidden = false; return; }
    goalSheet.close();
    toast('Meta excluída');
    await refresh();
  });

  /* ---------- Importar extrato ---------- */

  const MAX_IMPORT = 1500;
  const importSheet = $('import-sheet');
  const imp = {
    parsed: null,
    items: [],
    existing: new Set(),
    similar: new Set(),
    rows: [],
    cross: new Set(),
    suggestions: null,
    selected: new Set(),
    category: new Map(),
    source: new Map(),
    invert: false,
    token: 0,
  };

  function fmtDate(d) { return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`; }

  function showImportError(message) {
    $('import-error').textContent = message;
    $('import-error').hidden = false;
  }

  function resetImportReview() {
    $('import-review').hidden = true;
    $('import-submit').disabled = true;
    $('import-submit').textContent = 'Importar';
  }

  function fillSelect(select, headers, value, optional) {
    select.replaceChildren();
    const none = el('option', '', optional ? 'Nenhuma' : 'Escolha…');
    none.value = '-1';
    select.append(none);
    headers.forEach((h, i) => {
      const o = el('option', '', h || `Coluna ${i + 1}`);
      o.value = String(i);
      select.append(o);
    });
    select.value = String(value);
  }

  function toggleAmountMode() {
    const split = $('map-mode').value === 'split';
    $('map-single').hidden = split;
    $('map-split').hidden = !split;
  }

  function setupMapping(parsed) {
    const { headers } = parsed.analysis;
    const m = parsed.mapping;
    fillSelect($('map-date'), headers, m.date, false);
    fillSelect($('map-desc1'), headers, m.desc.length > 0 ? m.desc[0] : -1, false);
    fillSelect($('map-desc2'), headers, m.desc.length > 1 ? m.desc[1] : -1, true);
    $('map-mode').value = m.amount.mode;
    fillSelect($('map-amount'), headers, m.amount.column, false);
    fillSelect($('map-credit'), headers, m.amount.credit, false);
    fillSelect($('map-debit'), headers, m.amount.debit, false);
    toggleAmountMode();
    $('import-mapping').hidden = false;
    $('import-mapping').open = !Importer.mappingIsComplete(m);
  }

  function readMapping() {
    const num = (id) => Number($(id).value);
    const mode = $('map-mode').value;
    return {
      date: num('map-date'),
      desc: [num('map-desc1'), num('map-desc2')].filter((i) => i >= 0),
      amount: mode === 'split'
        ? { mode, column: -1, credit: num('map-credit'), debit: num('map-debit') }
        : { mode, column: num('map-amount'), credit: -1, debit: -1 },
    };
  }

  async function findExistingIds(items) {
    const ids = items.map((i) => i.externalId);
    const found = new Set();
    for (let i = 0; i < ids.length; i += 80) {
      const { data, error } = await sb
        .from('transactions')
        .select('external_id')
        .in('external_id', ids.slice(i, i + 80));
      if (error) throw error;
      data.forEach((r) => found.add(r.external_id));
    }
    return found;
  }

  // Lançamentos digitados à mão com mesma data, valor e tipo: provável repetição.
  // Lançamentos já salvos no período do arquivo. Os de extrato (csv:/ofx:) servem para achar
  // repetição entre formatos; os digitados, fixos e contas pagas só geram o aviso "parecido".
  async function findSimilar(items) {
    const dates = items.map((i) => i.date).sort();
    const rows = [];
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await sb
        .from('transactions')
        .select('occurred_on, amount, type, external_id')
        .gte('occurred_on', dates[0])
        .lte('occurred_on', dates[dates.length - 1])
        .order('occurred_on')
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    const similar = new Set();
    for (const r of rows) {
      const id = r.external_id || '';
      if (id.startsWith('csv:') || id.startsWith('ofx:')) continue;
      similar.add(`${r.occurred_on}|${Number(r.amount).toFixed(2)}|${r.type}`);
    }
    return { similar, rows };
  }

  // Já está no banco: pelo id, ou por data, tipo e valor vindos de outro arquivo de extrato.
  function isDup(item) {
    return imp.existing.has(item.externalId) || imp.cross.has(item.externalId);
  }

  function computeCross() {
    const idx = Importer.crossDuplicates(imp.items, imp.rows, imp.invert);
    imp.cross = new Set([...idx].map((i) => imp.items[i].externalId));
  }

  async function loadSuggestions() {
    if (imp.suggestions) return imp.suggestions;
    const { data, error } = await sb
      .from('transactions')
      .select('description, category_id, type')
      .not('category_id', 'is', null)
      .not('description', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    const map = new Map();
    for (const r of data) {
      const key = Importer.descriptionKey(r.description);
      if (key && !map.has(`${r.type}|${key}`)) map.set(`${r.type}|${key}`, r.category_id);
    }
    imp.suggestions = map;
    return map;
  }

  function isSimilar(item) {
    const v = Importer.view(item, imp.invert);
    return imp.similar.has(`${item.date}|${v.amount.toFixed(2)}|${v.type}`);
  }

  // Marca os novos (menos os parecidos com lançamentos manuais) e sugere categorias.
  function resetSelection() {
    imp.selected = new Set();
    imp.category = new Map();
    imp.source = new Map();
    imp.items.forEach((item, i) => {
      const dup = isDup(item);
      if (!dup && !isSimilar(item)) imp.selected.add(i);
      const v = Importer.view(item, imp.invert);
      const past = imp.suggestions && imp.suggestions.get(`${v.type}|${Importer.descriptionKey(item.description)}`);
      const guess = Classifier.classify(state.rules, state.categories, v.type, item.description, past);
      imp.category.set(i, guess ? guess.id : '');
      if (guess) imp.source.set(i, guess.source); else imp.source.delete(i);
    });
  }

  function updateImportSummary() {
    const total = imp.items.length;
    const dups = imp.items.filter(isDup).length;
    $('import-summary').textContent =
      `${total} lançamentos no arquivo, ${total - dups} novos` + (dups ? ` e ${dups} já importados (não serão repetidos).` : '.');

    let income = 0;
    let expense = 0;
    for (const i of imp.selected) {
      const v = Importer.view(imp.items[i], imp.invert);
      if (v.type === 'income') income += v.amount; else expense += v.amount;
    }
    $('import-totals').textContent =
      `Selecionados: ${imp.selected.size}. Receitas ${brl.format(income)}, despesas ${brl.format(expense)}.`;

    const n = imp.selected.size;
    $('import-submit').disabled = n === 0;
    $('import-submit').textContent = n ? `Importar ${n}` : 'Importar';
    $('import-all').checked = n > 0 && n === total - dups;
  }

  function renderImport() {
    const list = $('import-list');
    list.replaceChildren();

    imp.items.forEach((item, i) => {
      const v = Importer.view(item, imp.invert);
      const dup = isDup(item);
      const similar = !dup && isSimilar(item);

      const li = el('li', `import-row ${v.type}${dup ? ' dup' : ''}`);
      const label = el('label', 'import-main');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = imp.selected.has(i);
      box.disabled = dup;
      box.addEventListener('change', () => {
        if (box.checked) imp.selected.add(i); else imp.selected.delete(i);
        updateImportSummary();
      });

      const text = el('span', 'import-text');
      const note = dup ? (imp.existing.has(item.externalId) ? 'Já importado' : 'Já importado de outro arquivo') : similar ? 'Parecido com um lançamento seu' : '';
      const subText = () => {
        const src = imp.source.get(i);
        const how = !dup && src && imp.category.get(i) ? (src === 'rule' ? 'categoria por regra' : 'categoria pelo histórico') : '';
        return [fmtDate(item.date), note, how].filter(Boolean).join(' · ');
      };
      const sub = el('span', 'sub', subText());
      text.append(el('span', 'title', item.description || 'Sem descrição'), sub);
      const sign = v.type === 'income' ? '+ ' : '− ';
      label.append(box, text, el('span', 'amount', sign + brl.format(v.amount)));
      li.append(label);

      if (!dup) {
        const select = el('select');
        select.setAttribute('aria-label', 'Categoria');
        const none = el('option', '', 'Sem categoria');
        none.value = '';
        select.append(none);
        for (const c of state.categories.filter((x) => x.type === v.type)) {
          const o = el('option', '', c.name);
          o.value = c.id;
          select.append(o);
        }
        select.value = imp.category.get(i) || '';
        select.addEventListener('change', () => { imp.category.set(i, select.value); imp.source.delete(i); sub.textContent = subText(); });
        li.append(select);
      }
      list.append(li);
    });
    updateImportSummary();
  }

  // Em CSV, mantém visível o ajuste de colunas para o usuário corrigir; sem prévia de lançamentos.
  function showMappingOnly(message) {
    showImportError(message);
    resetImportReview();
    $('import-summary').textContent = '';
    $('import-totals').textContent = '';
    $('import-list').replaceChildren();
    if (imp.parsed.kind === 'csv') {
      $('import-review').hidden = false;
      $('import-mapping').open = true;
    }
  }

  async function loadImportItems(token) {
    $('import-error').hidden = true;
    try {
      let items;
      if (imp.parsed.kind === 'ofx' || imp.parsed.kind === 'pdf') {
        items = imp.parsed.items;
      } else {
        const mapping = readMapping();
        if (!Importer.mappingIsComplete(mapping)) {
          showMappingOnly('Escolha as colunas de data e valor para continuar.');
          return;
        }
        items = Importer.csvToItems(imp.parsed.analysis, mapping).items;
      }

      if (items.length === 0) {
        showMappingOnly('Não encontrei lançamentos nesse arquivo. Confira as colunas escolhidas.');
        return;
      }
      if (items.length > MAX_IMPORT) {
        showMappingOnly(`O arquivo tem mais de ${MAX_IMPORT} lançamentos. Exporte um período menor no banco.`);
        return;
      }

      await Importer.withIds(items);
      const [existing, found] = await Promise.all([findExistingIds(items), findSimilar(items), loadSuggestions()]);
      if (token !== imp.token) return;

      imp.items = items;
      imp.existing = existing;
      imp.similar = found.similar;
      imp.rows = found.rows;
      computeCross();
      resetSelection();
      renderImport();
      $('import-review').hidden = false;
    } catch (err) {
      showImportError(friendlyError(err));
      resetImportReview();
    }
  }

  // Remove duplicados que já estão salvos (mesmo extrato importado em CSV e em OFX).
  $('dedupe-run').addEventListener('click', async () => {
    if (!navigator.onLine) { toast('Sem conexão: precisa de internet.'); return; }
    const button = $('dedupe-run');
    button.disabled = true;
    try {
      const rows = [];
      for (let from = 0; from < 50000; from += 1000) {
        const { data, error } = await sb
          .from('transactions')
          .select('id, occurred_on, amount, type, external_id, created_at')
          .not('external_id', 'is', null)
          .order('id')
          .range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      const ids = Importer.findImportedDuplicates(rows);
      if (ids.length === 0) { toast('Nenhum duplicado encontrado'); return; }
      const gone = new Set(ids);
      const total = rows.filter((r) => gone.has(r.id)).reduce((s, r) => s + Number(r.amount), 0);
      if (!confirm(`Encontrei ${ids.length} lançamento(s) repetido(s) entre extratos CSV e OFX, somando ${brl.format(total)}. Remover os repetidos e manter um de cada?`)) return;
      for (let i = 0; i < ids.length; i += 80) {
        const { error } = await sb.from('transactions').delete().in('id', ids.slice(i, i + 80));
        if (error) throw error;
      }
      toast(ids.length === 1 ? '1 duplicado removido' : `${ids.length} duplicados removidos`);
      await refresh();
    } catch (err) {
      toast(friendlyError(err));
    } finally {
      button.disabled = false;
    }
  });

  $('import-open').addEventListener('click', () => {
    imp.parsed = null;
    imp.items = [];
    imp.suggestions = null;
    imp.invert = false;
    imp.token++;
    $('import-file').value = '';
    $('import-invert').checked = false;
    $('import-error').hidden = true;
    $('import-mapping').hidden = true;
    resetImportReview();
    importSheet.showModal();
  });

  $('import-cancel').addEventListener('click', () => importSheet.close());

  // Junta os textos do PDF em linhas (agrupando por posição vertical), uma por "linha
  // visual" da tabela, pra Importer.parsePDFStatement() ler como se fosse texto puro.
  async function extractPdfText(buffer) {
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map();
      for (const item of content.items) {
        if (!item.str) continue;
        const y = Math.round(item.transform[5]);
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push(item);
      }
      const ys = [...rows.keys()].sort((a, b) => b - a);
      for (const y of ys) {
        const row = rows.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
        let line = '';
        let lastEnd = null;
        for (const it of row) {
          const x = it.transform[4];
          if (lastEnd !== null && x - lastEnd > 1) line += ' ';
          line += it.str;
          lastEnd = x + it.width;
        }
        if (line.trim()) lines.push(line.trim());
      }
    }
    return lines.join('\n');
  }

  $('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const token = ++imp.token;
    $('import-error').hidden = true;
    $('import-mapping').hidden = true;
    resetImportReview();

    if (file.size > 5 * 1024 * 1024) {
      showImportError('Arquivo grande demais. O máximo é 5 MB.');
      return;
    }
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      let parsed;
      if (isPdf) {
        const text = await extractPdfText(await file.arrayBuffer());
        const result = Importer.parsePDFStatement(text);
        if (!result) {
          showImportError('Não reconheci o layout desse PDF. Por enquanto só oferecemos suporte a extratos do Santander em PDF.');
          return;
        }
        parsed = { kind: 'pdf', items: result.items, skipped: result.skipped };
      } else {
        parsed = Importer.parseStatement(await file.arrayBuffer());
        if (!parsed) {
          showImportError('Não reconheci esse arquivo. Use um extrato em OFX, CSV ou PDF exportado pelo banco.');
          return;
        }
      }
      imp.parsed = parsed;
      if (parsed.kind === 'csv') setupMapping(parsed);
      await loadImportItems(token);
    } catch (err) {
      showImportError(friendlyError(err));
    }
  });

  ['map-date', 'map-desc1', 'map-desc2', 'map-amount', 'map-credit', 'map-debit'].forEach((id) =>
    $(id).addEventListener('change', () => loadImportItems(++imp.token))
  );
  $('map-mode').addEventListener('change', () => {
    toggleAmountMode();
    loadImportItems(++imp.token);
  });

  $('import-invert').addEventListener('change', (e) => {
    imp.invert = e.target.checked;
    computeCross();
    resetSelection();
    renderImport();
  });

  $('import-all').addEventListener('change', (e) => {
    imp.selected = new Set();
    if (e.target.checked) {
      imp.items.forEach((item, i) => { if (!isDup(item)) imp.selected.add(i); });
    }
    renderImport();
  });

  $('import-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = [];
    imp.items.forEach((item, i) => {
      if (!imp.selected.has(i) || isDup(item)) return;
      const v = Importer.view(item, imp.invert);
      rows.push({
        user_id: state.userId,
        type: v.type,
        amount: v.amount,
        description: item.description || null,
        category_id: imp.category.get(i) || null,
        occurred_on: item.date,
        external_id: item.externalId,
      });
    });
    if (rows.length === 0) return;

    const submit = $('import-submit');
    submit.disabled = true;
    $('import-error').hidden = true;
    let inserted = 0;
    try {
      for (let i = 0; i < rows.length; i += 100) {
        const { data, error } = await sb
          .from('transactions')
          .upsert(rows.slice(i, i + 100), { onConflict: 'user_id,external_id', ignoreDuplicates: true })
          .select('id');
        if (error) throw error;
        inserted += data.length;
        submit.textContent = `Importando ${Math.min(i + 100, rows.length)} de ${rows.length}`;
      }
    } catch (err) {
      showImportError(
        friendlyError(err) +
          (inserted ? ` ${inserted} lançamentos já foram salvos; importar o arquivo de novo não duplica.` : '')
      );
      updateImportSummary();
      return;
    }

    importSheet.close();
    const latest = rows.map((r) => r.occurred_on).sort().pop();
    state.month = firstOfMonth(parseYmd(latest));
    const already = rows.length - inserted;
    toast(`${inserted} lançamentos importados` + (already ? `, ${already} já existiam` : ''));
    await refresh();
  });

  /* ---------- Excluir conta ---------- */

  const deleteSheet = $('delete-sheet');

  $('delete-open').addEventListener('click', () => {
    $('delete-confirm').value = '';
    $('delete-submit').disabled = true;
    $('delete-error').hidden = true;
    deleteSheet.showModal();
    $('delete-confirm').focus();
  });

  $('delete-cancel').addEventListener('click', () => deleteSheet.close());

  $('delete-confirm').addEventListener('input', (e) => {
    $('delete-submit').disabled = e.target.value.trim().toLowerCase() !== 'excluir';
  });

  $('delete-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('delete-confirm').value.trim().toLowerCase() !== 'excluir') return;

    const submit = $('delete-submit');
    submit.disabled = true;
    const { error } = await sb.rpc('delete_my_account');
    if (error) {
      submit.disabled = false;
      $('delete-error').textContent = friendlyError(error);
      $('delete-error').hidden = false;
      return;
    }

    deleteSheet.close();
    store.clearAll();
    // A conta já não existe: encerra só a sessão local, sem chamar o servidor.
    await sb.auth.signOut({ scope: 'local' });
    toast('Conta excluída');
  });

  /* ---------- Início ---------- */

  sb.auth.onAuthStateChange((_event, session) => {
    const userId = session ? session.user.id : null;
    if (session) $('account-email').textContent = session.user.email || '';
    if (userId === state.userId) return;
    state.userId = userId;
    if (userId) {
      // adiado: não chamar o Supabase de dentro do callback de autenticação
      setTimeout(enterApp, 0);
    } else {
      // Aberto sem internet e sem sessão carregada: usa a cópia local, se houver.
      if (!navigator.onLine) {
        const snap = store.loadSnapshot();
        if (snap) {
          state.userId = snap.userId;
          setTimeout(enterApp, 0);
          return;
        }
      }
      store.clearSnapshot();
      state.categories = [];
      state.transactions = [];
      state.listTx = [];
      state.recurring = [];
      state.budgets = [];
      state.bills = [];
      state.goals = [];
      state.rules = [];
      state.hints = null;
      state.trendRows = [];
      state.trendCategory = '';
      state.yearRows = {};
      state.securityShown = false;
      state.suggestions = [];
      showAuth();
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
