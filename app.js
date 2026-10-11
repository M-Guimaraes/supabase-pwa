(() => {
  'use strict';

  // A chave publicável é pública por natureza. A proteção dos dados vem das
  // regras de RLS no banco (cada usuário só acessa as próprias linhas).
  const SUPABASE_URL = 'https://nddrqvueykgyzjwjcygk.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Yep8kL5uJzkaHpDQhhRlng_dpfP7-1l';

  const $ = (id) => document.getElementById(id);

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const state = {
    userId: undefined, // undefined = ainda não verificado
    month: firstOfMonth(new Date()),
    categories: [],
    transactions: [],
    editing: null,
    signupMode: false,
  };

  if (!window.supabase) {
    document.body.textContent =
      'Não foi possível carregar o app. Conecte-se à internet e abra de novo.';
    return;
  }
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
    if (/password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail pelo link que enviamos e tente de novo.';
    if (/rate limit/i.test(msg)) return 'Muitas tentativas. Aguarde um pouco e tente de novo.';
    if (/failed to fetch|network/i.test(msg)) return 'Sem conexão. Verifique a internet e tente de novo.';
    return msg || 'Algo deu errado. Tente de novo.';
  }

  /* ---------- Entrada (login e cadastro) ---------- */

  function showAuth() {
    $('app').hidden = true;
    $('auth').hidden = false;
  }

  function showApp() {
    $('auth').hidden = true;
    $('app').hidden = false;
  }

  function setAuthMode(signup) {
    state.signupMode = signup;
    $('auth-submit').textContent = signup ? 'Criar conta' : 'Entrar';
    $('auth-toggle').textContent = signup ? 'Já tem conta? Entrar' : 'Não tem conta? Criar conta';
    $('auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('auth-error').hidden = true;
  }

  $('auth-toggle').addEventListener('click', () => setAuthMode(!state.signupMode));

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    const errorBox = $('auth-error');
    errorBox.hidden = true;

    if (!email || password.length < 6) {
      errorBox.textContent = 'Informe um e-mail válido e uma senha com pelo menos 6 caracteres.';
      errorBox.hidden = false;
      return;
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

  $('logout').addEventListener('click', async () => {
    await sb.auth.signOut();
  });

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
    state.transactions = data.map((t) => ({ ...t, amount: Number(t.amount) }));
  }

  async function refresh() {
    try {
      await Promise.all([loadCategories(), loadTransactions()]);
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

  function renderList() {
    const box = $('tx-groups');
    box.replaceChildren();
    $('tx-empty').hidden = state.transactions.length > 0;

    const byDay = new Map();
    for (const t of state.transactions) {
      if (!byDay.has(t.occurred_on)) byDay.set(t.occurred_on, []);
      byDay.get(t.occurred_on).push(t);
    }

    for (const [day, items] of byDay) {
      const group = el('section', 'day');
      group.append(el('h3', '', dayFmt.format(parseYmd(day))));
      for (const t of items) {
        const btn = el('button', `tx ${t.type}`);
        btn.type = 'button';
        const info = el('span', 'info');
        info.append(
          el('span', 'title', t.description || categoryName(t.category_id)),
          el('span', 'sub', categoryName(t.category_id))
        );
        const sign = t.type === 'income' ? '+ ' : '− ';
        btn.append(el('span', 'dot'), info, el('span', 'amount', sign + brl.format(t.amount)));
        btn.addEventListener('click', () => openSheet(t));
        group.append(btn);
      }
      box.append(group);
    }
  }

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

  /* ---------- Navegação ---------- */

  function switchTab(name) {
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== name; });
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.tab === name) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => switchTab(t.dataset.tab))
  );

  function shiftMonth(delta) {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
    $('month-label').textContent = monthFmt.format(state.month);
    refresh();
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

  document.querySelectorAll('input[name="type"]').forEach((r) =>
    r.addEventListener('change', () => fillCategoryOptions(currentType(), ''))
  );

  function openSheet(tx) {
    state.editing = tx || null;
    $('tx-error').hidden = true;
    $('sheet-title').textContent = tx ? 'Editar lançamento' : 'Novo lançamento';
    $('tx-delete').hidden = !tx;

    const type = tx ? tx.type : 'expense';
    $(`type-${type}`).checked = true;
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
    save.disabled = true;
    const query = state.editing
      ? sb.from('transactions').update(payload).eq('id', state.editing.id)
      : sb.from('transactions').insert(payload);
    const { error } = await query;
    save.disabled = false;

    if (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.hidden = false;
      return;
    }

    sheet.close();
    state.month = firstOfMonth(parseYmd(date));
    toast('Lançamento salvo');
    await refresh();
  });

  $('tx-delete').addEventListener('click', async () => {
    if (!state.editing) return;
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

  /* ---------- Importar extrato ---------- */

  const MAX_IMPORT = 1500;
  const importSheet = $('import-sheet');
  const imp = {
    parsed: null,
    items: [],
    existing: new Set(),
    similar: new Set(),
    suggestions: null,
    selected: new Set(),
    category: new Map(),
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
  async function findSimilar(items) {
    const dates = items.map((i) => i.date).sort();
    const { data, error } = await sb
      .from('transactions')
      .select('occurred_on, amount, type')
      .is('external_id', null)
      .gte('occurred_on', dates[0])
      .lte('occurred_on', dates[dates.length - 1])
      .limit(1000);
    if (error) throw error;
    return new Set(data.map((r) => `${r.occurred_on}|${Number(r.amount).toFixed(2)}|${r.type}`));
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
    imp.items.forEach((item, i) => {
      const dup = imp.existing.has(item.externalId);
      if (!dup && !isSimilar(item)) imp.selected.add(i);
      const v = Importer.view(item, imp.invert);
      const hint = imp.suggestions && imp.suggestions.get(`${v.type}|${Importer.descriptionKey(item.description)}`);
      const valid = hint && state.categories.some((c) => c.id === hint && c.type === v.type);
      imp.category.set(i, valid ? hint : '');
    });
  }

  function updateImportSummary() {
    const total = imp.items.length;
    const dups = imp.items.filter((it) => imp.existing.has(it.externalId)).length;
    $('import-summary').textContent =
      `${total} lançamentos no arquivo, ${total - dups} novos` + (dups ? ` e ${dups} já importados.` : '.');

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
      const dup = imp.existing.has(item.externalId);
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
      const note = dup ? 'Já importado' : similar ? 'Parecido com um lançamento seu' : '';
      text.append(
        el('span', 'title', item.description || 'Sem descrição'),
        el('span', 'sub', [fmtDate(item.date), note].filter(Boolean).join(' · '))
      );
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
        select.addEventListener('change', () => imp.category.set(i, select.value));
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
      if (imp.parsed.kind === 'ofx') {
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
      const [existing, similar] = await Promise.all([findExistingIds(items), findSimilar(items), loadSuggestions()]);
      if (token !== imp.token) return;

      imp.items = items;
      imp.existing = existing;
      imp.similar = similar;
      resetSelection();
      renderImport();
      $('import-review').hidden = false;
    } catch (err) {
      showImportError(friendlyError(err));
      resetImportReview();
    }
  }

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
      const parsed = Importer.parseStatement(await file.arrayBuffer());
      if (!parsed) {
        showImportError('Não reconheci esse arquivo. Use um extrato em OFX ou CSV exportado pelo banco.');
        return;
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
    resetSelection();
    renderImport();
  });

  $('import-all').addEventListener('change', (e) => {
    imp.selected = new Set();
    if (e.target.checked) {
      imp.items.forEach((item, i) => { if (!imp.existing.has(item.externalId)) imp.selected.add(i); });
    }
    renderImport();
  });

  $('import-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = [];
    imp.items.forEach((item, i) => {
      if (!imp.selected.has(i) || imp.existing.has(item.externalId)) return;
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
      showApp();
      switchTab('summary');
      state.month = firstOfMonth(new Date());
      // adiado: não chamar o Supabase de dentro do callback de autenticação
      setTimeout(refresh, 0);
    } else {
      state.categories = [];
      state.transactions = [];
      showAuth();
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
})();
