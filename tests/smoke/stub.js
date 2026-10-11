(function () {
  let n = 0;
  const uid = () => 'id-' + (++n);
  const db = {
    categories: [
      { id: 'cat-mercado', name: 'Mercado', type: 'expense', created_at: '2026-01-01' },
      { id: 'cat-sal', name: 'Salário', type: 'income', created_at: '2026-01-01' },
    ],
    transactions: [], recurring_transactions: [], budgets: [], bills: [], goals: [],
  };
  if (window.__seed) Object.assign(db, window.__seed);
  window.__db = db;
  const cb = {};
  function builder(table) {
    const q = { table, op: 'select', filters: [], order: [], payload: null, opts: {}, wantRows: false };
    const apply = (rows) => rows.filter((r) => q.filters.every((f) => f(r)));
    const run = () => {
      const rows = db[table];
      if (q.op === 'select') {
        let out = apply(rows).map((r) => ({ ...r }));
        for (const [c, asc] of q.order.slice().reverse()) {
          out.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
        }
        if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
        if (q.limit) out = out.slice(0, q.limit);
        return { data: out, error: null };
      }
      if (q.op === 'insert' || q.op === 'upsert') {
        const list = Array.isArray(q.payload) ? q.payload : [q.payload];
        const inserted = [];
        for (const p of list) {
          if (q.op === 'upsert' && q.opts.onConflict) {
            const cols = q.opts.onConflict.split(',');
            const hit = rows.find((r) => cols.every((c) => r[c] === p[c] && p[c] != null));
            if (hit) { if (!q.opts.ignoreDuplicates) Object.assign(hit, p); continue; }
          }
          const defaults = table === 'recurring_transactions' ? { active: true, generated_through: null } : {};
          const row = { id: uid(), created_at: new Date().toISOString(), user_id: 'u1', ...defaults, ...p };
          rows.push(row); inserted.push({ ...row });
        }
        return { data: q.wantRows ? inserted : null, error: null };
      }
      if (q.op === 'update') { apply(rows).forEach((r) => Object.assign(r, q.payload)); return { data: null, error: null }; }
      if (q.op === 'delete') { db[table] = rows.filter((r) => !apply(rows).includes(r)); return { data: null, error: null }; }
    };
    const api = {
      select(cols) { if (q.op !== 'select') q.wantRows = true; return api; },
      insert(p) { q.op = 'insert'; q.payload = p; return api; },
      upsert(p, o) { q.op = 'upsert'; q.payload = p; q.opts = o || {}; return api; },
      update(p) { q.op = 'update'; q.payload = p; return api; },
      delete() { q.op = 'delete'; return api; },
      eq(c, v) { q.filters.push((r) => r[c] === v); return api; },
      is(c, v) { q.filters.push((r) => (r[c] == null) === (v === null)); return api; },
      not(c, op, v) { q.filters.push((r) => !((r[c] == null) === (v === null))); return api; },
      gte(c, v) { q.filters.push((r) => r[c] >= v); return api; },
      lt(c, v) { q.filters.push((r) => r[c] < v); return api; },
      lte(c, v) { q.filters.push((r) => r[c] <= v); return api; },
      in(c, v) { q.filters.push((r) => v.includes(r[c])); return api; },
      order(c, o) { q.order.push([c, !(o && o.ascending === false)]); return api; },
      limit(n) { q.limit = n; return api; },
      range(a, b) { q.range = [a, b]; return api; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    return api;
  }
  window.supabase = {
    createClient() {
      return {
        from: builder,
        rpc: async () => ({ error: null }),
        auth: {
          onAuthStateChange(fn) { setTimeout(() => fn(window.__noSession ? 'SIGNED_OUT' : 'SIGNED_IN', window.__noSession ? null : { user: { id: 'u1', email: 'marcelo@exemplo.com' } }), 0); },
          updateUser: async ({ password, current_password }) => {
            window.__lastUpdate = { password, current_password };
            if (!current_password) return { error: { message: 'Current password required when setting new password' } };
            if (current_password !== 'Senha#Atual1') return { error: { message: 'Invalid current password' } };
            return { data: {}, error: null };
          },
          signOut: async () => ({}),
          signUp: async () => ({ data: {}, error: null }),
          signInWithPassword: async () => ({ error: null }),
          mfa: {
            getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }),
            listFactors: async () => ({ data: { totp: window.__factor ? [{ id: 'f1', status: 'verified' }] : [], all: [] }, error: null }),
            enroll: async () => ({ data: { id: 'f1', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: 'ABCDEF234567' } }, error: null }),
            challengeAndVerify: async ({ code }) => { if (code === '123456') { window.__factor = true; return { error: null }; } return { error: { message: 'Invalid TOTP code entered' } }; },
            unenroll: async () => { window.__factor = false; return { error: null }; },
          },
        },
      };
    },
  };
})();
