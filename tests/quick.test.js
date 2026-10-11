// Rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../quick.js');

const row = (description, category_id, amount, type = 'expense') => ({ description, category_id, amount, type });

const rows = [
  row('Mercado Central 123', 'c-mercado', 80),
  row('Uber', 'c-transp', 22.5),
  row('Mercado Central 456', 'c-outro', 50),
  row('Salário', 'c-sal', 3000, 'income'),
  row('Mercado Central 123', 'c-mercado', 60),
];

test('sugere a categoria mais recente para descrição parecida, ignorando números', () => {
  const h = Q.buildHints(rows);
  assert.equal(Q.suggestCategory(h, 'expense', 'mercado central 999'), 'c-mercado');
  assert.equal(Q.suggestCategory(h, 'expense', 'Uber'), 'c-transp');
});

test('a sugestão respeita o tipo e não inventa', () => {
  const h = Q.buildHints(rows);
  assert.equal(Q.suggestCategory(h, 'income', 'Uber'), null);
  assert.equal(Q.suggestCategory(h, 'expense', 'Farmácia'), null);
  assert.equal(Q.suggestCategory(h, 'expense', ''), null);
  assert.equal(Q.suggestCategory(h, 'expense', '123'), null);
});

test('descrições recentes: distintas, mais novas primeiro, por tipo', () => {
  const h = Q.buildHints(rows);
  assert.deepEqual(Q.recentDescriptions(h, 'expense'), ['Mercado Central 123', 'Uber', 'Mercado Central 456']);
  assert.deepEqual(Q.recentDescriptions(h, 'income'), ['Salário']);
  assert.equal(h.recent[0].amount, 80);
});

test('o último lançamento serve para repetir', () => {
  assert.deepEqual(Q.buildHints(rows).last, {
    type: 'expense', amount: 80, description: 'Mercado Central 123', category_id: 'c-mercado',
  });
  assert.equal(Q.buildHints([]).last, null);
  const noDesc = Q.buildHints([row(null, null, 12.5)]);
  assert.equal(noDesc.last.description, '');
  assert.equal(noDesc.recent.length, 0);
});

test('limita as descrições recentes', () => {
  const many = Array.from({ length: 50 }, (_, i) => row(`Item ${String.fromCharCode(97 + (i % 26))}${i}`, null, 1));
  assert.ok(Q.buildHints(many).recent.length <= 30);
});

test('atalhos da tela inicial', () => {
  assert.equal(Q.parseShortcut('?novo=despesa'), 'expense');
  assert.equal(Q.parseShortcut('?novo=receita'), 'income');
  assert.equal(Q.parseShortcut('?novo=outra'), null);
  assert.equal(Q.parseShortcut(''), null);
});
