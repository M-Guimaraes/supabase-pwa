// Rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../exporter.js');

const names = (id) => (id === 'c1' ? 'Mercado' : 'Sem categoria');

test('CSV: cabeçalho, data dd/mm/aaaa, sinal e vírgula decimal', () => {
  const csv = X.transactionsToCSV([
    { occurred_on: '2026-10-05', type: 'expense', amount: 1234.5, description: 'Aluguel', category_id: null },
    { occurred_on: '2026-10-06', type: 'income', amount: 3000, description: 'Salário', category_id: 'c1' },
  ], names);
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(csv[0], '﻿');
  assert.equal(lines[0], 'Data;Tipo;Descrição;Categoria;Valor');
  assert.equal(lines[1], '05/10/2026;Despesa;Aluguel;Sem categoria;-1234,50');
  assert.equal(lines[2], '06/10/2026;Receita;Salário;Mercado;3000,00');
});

test('CSV: aspas, ponto e vírgula e quebras de linha na descrição', () => {
  const csv = X.transactionsToCSV([
    { occurred_on: '2026-10-05', type: 'expense', amount: 10, description: 'Padaria; "Boa"\nVista', category_id: 'c1' },
  ], names);
  assert.ok(csv.includes('"Padaria; ""Boa"" Vista"'));
  assert.equal(csv.trim().split('\r\n').length, 2);
});

test('CSV: textos que começam como fórmula ganham apóstrofo', () => {
  assert.equal(X.safeText('=SOMA(A1)'), "'=SOMA(A1)");
  assert.equal(X.safeText('+55 11'), "'+55 11");
  assert.equal(X.safeText('Normal'), 'Normal');
  const csv = X.transactionsToCSV([
    { occurred_on: '2026-10-05', type: 'expense', amount: 1, description: '@cmd', category_id: null },
  ], names);
  assert.ok(csv.includes(";'@cmd;"));
});

test('CSV sem lançamentos tem só o cabeçalho', () => {
  assert.equal(X.transactionsToCSV([], names).trim(), 'Data;Tipo;Descrição;Categoria;Valor');
});

test('meta sem prazo: percentual e quanto falta', () => {
  const g = X.goalInfo({ target_amount: 1000, saved_amount: 250 }, '2026-10-11');
  assert.deepEqual(g, { percent: 25, remaining: 750, done: false, overdue: false, monthsLeft: null, perMonth: null });
});

test('meta com prazo: valor por mês contando mês atual e do prazo', () => {
  const g = X.goalInfo({ target_amount: 1000, saved_amount: 100, deadline: '2026-12-20' }, '2026-10-11');
  assert.equal(g.monthsLeft, 3);
  assert.equal(g.perMonth, 300);
  const odd = X.goalInfo({ target_amount: 100, saved_amount: 0, deadline: '2026-12-31' }, '2026-10-11');
  assert.equal(odd.perMonth, 33.34);
});

test('meta concluída e meta com prazo vencido', () => {
  const done = X.goalInfo({ target_amount: 500, saved_amount: 600, deadline: '2026-01-01' }, '2026-10-11');
  assert.equal(done.done, true);
  assert.equal(done.remaining, 0);
  assert.equal(done.perMonth, null);
  const late = X.goalInfo({ target_amount: 500, saved_amount: 100, deadline: '2026-09-30' }, '2026-10-11');
  assert.equal(late.overdue, true);
  assert.equal(late.perMonth, 400);
});
