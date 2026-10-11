const test = require('node:test');
const assert = require('node:assert');
const Offline = require('../offline.js');

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('reconhece erro de rede e não confunde com erro do servidor', () => {
  assert.ok(Offline.isNetworkError(new TypeError('Failed to fetch')));
  assert.ok(Offline.isNetworkError({ message: 'TypeError: Load failed' }));
  assert.ok(!Offline.isNetworkError({ message: 'new row violates row-level security policy' }));
  assert.ok(!Offline.isNetworkError(null));
});

test('newId gera ids diferentes no formato uuid', () => {
  const a = Offline.newId({}), b = Offline.newId({});
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notStrictEqual(a, b);
});

test('cópia local é guardada e só vale para o mesmo usuário', () => {
  const o = Offline.create(memory());
  assert.strictEqual(o.loadSnapshot('u1'), null);
  o.saveSnapshot('u1', { categories: [1] });
  assert.deepStrictEqual(o.loadSnapshot('u1').data, { categories: [1] });
  assert.strictEqual(o.loadSnapshot('u2'), null);
  assert.strictEqual(o.loadSnapshot().userId, 'u1');
  o.clearSnapshot();
  assert.strictEqual(o.loadSnapshot('u1'), null);
});

test('fila: enfileira, separa por usuário e remove só os enviados', () => {
  const o = Offline.create(memory());
  o.enqueue('u1', { id: 'a', amount: 1 });
  o.enqueue('u1', { id: 'b', amount: 2 });
  o.enqueue('u2', { id: 'c', amount: 3 });
  assert.deepStrictEqual(o.queue('u1').map((t) => t.id), ['a', 'b']);
  o.remove('u1', ['a']);
  assert.deepStrictEqual(o.queue('u1').map((t) => t.id), ['b']);
  assert.deepStrictEqual(o.queue('u2').map((t) => t.id), ['c']);
  o.clearAll();
  assert.deepStrictEqual(o.queue('u1'), []);
});

test('storage com falha não derruba o app', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  const o = Offline.create(broken);
  assert.strictEqual(o.enqueue('u1', { id: 'a' }), null);
  assert.deepStrictEqual(o.queue('u1'), []);
  assert.strictEqual(o.loadSnapshot('u1'), null);
  o.clearAll();
});

test('monthRows filtra o mês e ordena do mais novo ao mais antigo', () => {
  const rows = [
    { id: 1, occurred_on: '2026-10-05', created_at: '1' },
    { id: 2, occurred_on: '2026-10-09', created_at: '1' },
    { id: 3, occurred_on: '2026-10-05', created_at: '2' },
    { id: 4, occurred_on: '2026-09-30', created_at: '1' },
    { id: 5, occurred_on: '2026-11-01', created_at: '1' },
  ];
  assert.deepStrictEqual(Offline.monthRows(rows, '2026-10-01', '2026-11-01').map((t) => t.id), [2, 3, 1]);
});

test('mergePending inclui pendentes do mês marcados e ignora outros meses', () => {
  const rows = [{ id: 1, occurred_on: '2026-10-05', created_at: '1' }];
  const pending = [
    { id: 'p1', occurred_on: '2026-10-07', created_at: '2' },
    { id: 'p2', occurred_on: '2026-09-07', created_at: '2' },
  ];
  const out = Offline.mergePending(rows, pending, '2026-10-01', '2026-11-01');
  assert.deepStrictEqual(out.map((t) => t.id), ['p1', 1]);
  assert.strictEqual(out[0].pending, true);
  assert.ok(!out[1].pending);
});
