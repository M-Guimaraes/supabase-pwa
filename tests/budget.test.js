// Rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../budget.js');

test('status: ok abaixo de 80%, warn de 80% a 100%, over acima de 100%', () => {
  assert.equal(B.status(100, 79.99).level, 'ok');
  assert.equal(B.status(100, 80).level, 'warn');
  assert.equal(B.status(100, 100).level, 'warn');
  assert.equal(B.status(100, 100.01).level, 'over');
});

test('status: percentual e quanto resta (negativo se estourou)', () => {
  assert.deepEqual(B.status(200, 150), { level: 'ok', percent: 75, remaining: 50 });
  assert.deepEqual(B.status(100, 130.5), { level: 'over', percent: 131, remaining: -30.5 });
});

test('budgetRows soma por categoria e ordena pelos mais apertados', () => {
  const budgets = [
    { id: 'a', category_id: 'c1', monthly_limit: 500 },
    { id: 'b', category_id: 'c2', monthly_limit: 100 },
    { id: 'c', category_id: 'c3', monthly_limit: 300 },
  ];
  const spent = new Map([['c1', 100], ['c2', 120.1]]);
  const rows = B.budgetRows(budgets, spent);
  assert.deepEqual(rows.map((r) => r.category_id), ['c2', 'c1', 'c3']);
  assert.equal(rows[0].level, 'over');
  assert.equal(rows[2].spent, 0);
});

test('daysUntil conta dias de calendário, inclusive na virada de mês e ano', () => {
  assert.equal(B.daysUntil('2026-10-15', '2026-10-11'), 4);
  assert.equal(B.daysUntil('2026-11-02', '2026-10-30'), 3);
  assert.equal(B.daysUntil('2027-01-01', '2026-12-31'), 1);
  assert.equal(B.daysUntil('2026-10-10', '2026-10-11'), -1);
});

test('dueBills: atrasadas e próximas de 7 dias, ignorando pagas e distantes', () => {
  const bills = [
    { id: 1, due_on: '2026-10-18', paid_on: null },
    { id: 2, due_on: '2026-10-19', paid_on: null },
    { id: 3, due_on: '2026-10-05', paid_on: null },
    { id: 4, due_on: '2026-10-12', paid_on: '2026-10-11' },
    { id: 5, due_on: '2026-10-11', paid_on: null },
  ];
  const out = B.dueBills(bills, '2026-10-11');
  assert.deepEqual(out.map((b) => b.id), [3, 5, 1]);
  assert.deepEqual(out.map((b) => b.daysLeft), [-6, 0, 7]);
});

test('dueLabel', () => {
  assert.equal(B.dueLabel(-3), 'atrasada há 3 dias');
  assert.equal(B.dueLabel(-1), 'atrasada desde ontem');
  assert.equal(B.dueLabel(0), 'vence hoje');
  assert.equal(B.dueLabel(1), 'vence amanhã');
  assert.equal(B.dueLabel(5), 'vence em 5 dias');
});
