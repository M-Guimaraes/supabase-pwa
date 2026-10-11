// Rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../trend.js');

const tx = (type, amount, occurred_on) => ({ type, amount, occurred_on });
const today = new Date(2026, 9, 11); // 11/10/2026

test('janela de 6 meses termina no mês atual e preenche meses vazios', () => {
  const s = T.monthlySeries([], today);
  assert.deepEqual(s.map((m) => m.key), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.ok(s.every((m) => m.income === 0 && m.expense === 0 && m.balance === 0));
  assert.equal(T.hasData(s), false);
});

test('soma receitas e despesas por mês e calcula o saldo', () => {
  const s = T.monthlySeries([
    tx('income', 8200, '2026-10-05'), tx('expense', 2450, '2026-10-05'), tx('expense', 386.42, '2026-10-08'),
    tx('income', 8000, '2026-09-05'), tx('expense', 5000.1, '2026-09-30'),
  ], today);
  const oct = s[5];
  assert.deepEqual([oct.income, oct.expense, oct.balance], [8200, 2836.42, 5363.58]);
  const sep = s[4];
  assert.deepEqual([sep.income, sep.expense, sep.balance], [8000, 5000.1, 2999.9]);
  assert.equal(T.hasData(s), true);
});

test('ignora lançamentos fora da janela e vira o ano corretamente', () => {
  const s = T.monthlySeries([tx('expense', 10, '2026-04-30'), tx('expense', 20, '2026-11-01'), tx('income', 5, '2026-05-01')], new Date(2026, 9, 11));
  assert.equal(s[0].income, 5);
  assert.equal(s.reduce((a, m) => a + m.expense, 0), 0);
  const jan = T.monthlySeries([tx('income', 1, '2025-09-15')], new Date(2026, 0, 20));
  assert.deepEqual(jan.map((m) => m.key), ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
  assert.equal(jan[1].income, 1);
});

test('início da janela para a consulta', () => {
  assert.equal(T.windowStart(today, 6), '2026-05-01');
  assert.equal(T.windowStart(new Date(2026, 1, 3), 6), '2025-09-01');
});

test('escala com teto redondo e três marcas', () => {
  assert.deepEqual(T.niceScale(8200), { max: 10000, ticks: [0, 5000, 10000] });
  assert.deepEqual(T.niceScale(1830), { max: 2000, ticks: [0, 1000, 2000] });
  assert.deepEqual(T.niceScale(2300), { max: 5000, ticks: [0, 2500, 5000] });
  assert.deepEqual(T.niceScale(0), { max: 100, ticks: [0, 50, 100] });
  assert.ok(T.niceScale(4999).max >= 4999);
});

test('rótulos compactos em português', () => {
  assert.equal(T.compact(0), '0');
  assert.equal(T.compact(500), '500');
  assert.equal(T.compact(2000), '2 mil');
  assert.equal(T.compact(1250), '1,3 mil');
  assert.equal(T.compact(2500), '2,5 mil');
  assert.equal(T.compact(1200000), '1,2 mi');
});

test('totals soma receitas, despesas e saldo da série', () => {
  const s = T.monthlySeries([
    { type: 'income', amount: 100.1, occurred_on: '2026-09-01' },
    { type: 'expense', amount: 40.05, occurred_on: '2026-10-02' },
    { type: 'expense', amount: 10, occurred_on: '2026-10-03' },
  ], new Date(2026, 9, 11), 6);
  assert.deepStrictEqual(T.totals(s), { income: 100.1, expense: 50.05, balance: 50.05 });
});

test('série de 12 meses ancorada em dezembro cobre janeiro a dezembro do ano', () => {
  const s = T.monthlySeries([{ type: 'income', amount: 5, occurred_on: '2026-01-15' }], new Date(2026, 11, 1), 12);
  assert.strictEqual(s.length, 12);
  assert.strictEqual(s[0].key, '2026-01');
  assert.strictEqual(s[11].key, '2026-12');
  assert.strictEqual(s[0].income, 5);
});

test('yearRange devolve o intervalo do ano', () => {
  assert.deepStrictEqual(T.yearRange(2026), { start: '2026-01-01', next: '2027-01-01' });
});
