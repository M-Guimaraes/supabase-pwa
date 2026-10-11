// Rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../recurring.js');

const rec = (over = {}) => ({
  id: 'r1', type: 'expense', amount: 1200, description: 'Aluguel',
  day_of_month: 5, start_on: '2026-08-01', generated_through: null, active: true, ...over,
});

test('gera do mês de início até o mês atual, no dia certo', () => {
  const out = R.occurrencesDue(rec(), new Date(2026, 9, 11)); // 11/10/2026
  assert.deepEqual(out.map((o) => o.date), ['2026-08-05', '2026-09-05', '2026-10-05']);
  assert.deepEqual(out.map((o) => o.externalId), ['rec:r1:2026-08', 'rec:r1:2026-09', 'rec:r1:2026-10']);
});

test('não gera dia que ainda não chegou neste mês', () => {
  const out = R.occurrencesDue(rec({ day_of_month: 25, start_on: '2026-10-01' }), new Date(2026, 9, 11));
  assert.deepEqual(out, []);
  const later = R.occurrencesDue(rec({ day_of_month: 25, start_on: '2026-10-01' }), new Date(2026, 9, 25));
  assert.deepEqual(later.map((o) => o.date), ['2026-10-25']);
});

test('continua de onde parou e não repete meses já gerados', () => {
  const out = R.occurrencesDue(rec({ generated_through: '2026-09-01' }), new Date(2026, 9, 11));
  assert.deepEqual(out.map((o) => o.date), ['2026-10-05']);
  const none = R.occurrencesDue(rec({ generated_through: '2026-10-01' }), new Date(2026, 9, 11));
  assert.deepEqual(none, []);
});

test('início no futuro não gera nada', () => {
  assert.deepEqual(R.occurrencesDue(rec({ start_on: '2026-11-01' }), new Date(2026, 9, 11)), []);
});

test('dia 31 vira o último dia dos meses mais curtos', () => {
  const out = R.occurrencesDue(rec({ day_of_month: 31, start_on: '2026-01-01' }), new Date(2026, 4, 31));
  assert.deepEqual(out.map((o) => o.date), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
});

test('limita o preenchimento retroativo a 24 meses', () => {
  const out = R.occurrencesDue(rec({ start_on: '2020-01-01' }), new Date(2026, 9, 11));
  assert.equal(out.length, 24);
  assert.equal(out[0].month, '2024-11');
});

test('generatedThrough devolve o primeiro dia do último mês gerado', () => {
  const out = R.occurrencesDue(rec(), new Date(2026, 9, 11));
  assert.equal(R.generatedThrough(out), '2026-10-01');
  assert.equal(R.generatedThrough([]), null);
});

test('ao retomar, só o mês atual volta a ser gerado', () => {
  const today = new Date(2026, 9, 11);
  const marker = R.resumeMarker(today);
  assert.equal(marker, '2026-09-01');
  const out = R.occurrencesDue(rec({ generated_through: marker }), today);
  assert.deepEqual(out.map((o) => o.month), ['2026-10']);
});

test('resumeMarker em janeiro volta para dezembro do ano anterior', () => {
  assert.equal(R.resumeMarker(new Date(2027, 0, 10)), '2026-12-01');
});

const tx = (description, amount, occurred_on, extra = {}) => ({
  description, amount, occurred_on, type: 'expense', category_id: null, external_id: null, ...extra,
});

test('sugere assinatura: mesmo valor e nome em dois meses seguidos', () => {
  const list = [
    tx('Streaming Exemplo 0912', 39.9, '2026-09-12'),
    tx('Streaming Exemplo 1012', 39.9, '2026-10-12'),
    tx('Mercado', 80, '2026-10-03'),
  ];
  const out = R.suggestRecurring(list, [], new Date(2026, 9, 20));
  assert.equal(out.length, 1);
  assert.equal(out[0].description, 'Streaming Exemplo 1012');
  assert.equal(out[0].amount, 39.9);
  assert.equal(out[0].day, 12);
  assert.equal(out[0].lastMonth, '2026-10');
});

test('mês seguinte, inclusive na virada do ano', () => {
  assert.equal(R.nextMonthLabel('2026-10'), '2026-11');
  assert.equal(R.nextMonthLabel('2026-12'), '2027-01');
});

test('não sugere o que já é recorrência, valor diferente, meses não seguidos ou antigo', () => {
  const today = new Date(2026, 9, 20);
  const existing = [{ type: 'expense', description: 'Streaming Exemplo', amount: 39.9 }];
  assert.deepEqual(
    R.suggestRecurring([tx('Streaming Exemplo', 39.9, '2026-09-12'), tx('Streaming Exemplo', 39.9, '2026-10-12')], existing, today),
    []
  );
  assert.deepEqual(
    R.suggestRecurring([tx('Padaria', 10, '2026-09-12'), tx('Padaria', 11, '2026-10-12')], [], today),
    []
  );
  assert.deepEqual(
    R.suggestRecurring([tx('Revista', 20, '2026-07-12'), tx('Revista', 20, '2026-10-12')], [], today),
    []
  );
  assert.deepEqual(
    R.suggestRecurring([tx('Antigo', 20, '2026-05-12'), tx('Antigo', 20, '2026-06-12')], [], today),
    []
  );
});

test('lançamentos gerados por recorrência não geram sugestão', () => {
  const list = [
    tx('Aluguel', 1200, '2026-09-05', { external_id: 'rec:r1:2026-09' }),
    tx('Aluguel', 1200, '2026-10-05', { external_id: 'rec:r1:2026-10' }),
  ];
  assert.deepEqual(R.suggestRecurring(list, [], new Date(2026, 9, 20)), []);
});

test('total das despesas fixas ativas', () => {
  const recs = [
    rec({ amount: 1200 }),
    rec({ id: 'r2', amount: 39.9 }),
    rec({ id: 'r3', amount: 500, active: false }),
    rec({ id: 'r4', type: 'income', amount: 3000 }),
  ];
  assert.deepEqual(R.fixedExpenseTotal(recs), { count: 2, total: 1239.9 });
});
