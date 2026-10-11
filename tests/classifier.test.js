const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../classifier.js');

const cats = [
  { id: 'transp', type: 'expense' },
  { id: 'mercado', type: 'expense' },
  { id: 'comida', type: 'expense' },
  { id: 'salario', type: 'income' },
];

test('norm tira acento, pontuação e caixa', () => {
  assert.equal(C.norm('UBER*TRIP 123'), 'uber trip 123');
  assert.equal(C.norm('  Padaria  São João '), 'padaria sao joao');
  assert.equal(C.norm(null), '');
});

test('normalizePattern valida o tamanho', () => {
  assert.deepEqual(C.normalizePattern(' Uber '), { ok: true, pattern: 'uber' });
  assert.equal(C.normalizePattern('a').ok, false);
  assert.equal(C.normalizePattern('***').ok, false);
  assert.equal(C.normalizePattern('x'.repeat(61)).ok, false);
});

test('regra que está contida na descrição classifica', () => {
  const rules = [{ pattern: 'uber', category_id: 'transp' }];
  assert.deepEqual(C.classify(rules, cats, 'expense', 'UBER *TRIP 8821', null), { id: 'transp', source: 'rule' });
  assert.equal(C.classify(rules, cats, 'expense', 'Padaria', null), null);
});

test('a regra mais específica vence', () => {
  const rules = [
    { pattern: 'ifood', category_id: 'comida' },
    { pattern: 'ifood mercado', category_id: 'mercado' },
  ];
  assert.equal(C.classify(rules, cats, 'expense', 'IFOOD MERCADO LTDA', null).id, 'mercado');
  assert.equal(C.classify(rules, cats, 'expense', 'IFOOD *REST', null).id, 'comida');
});

test('regra vence o histórico; sem regra, usa o histórico', () => {
  const rules = [{ pattern: 'uber', category_id: 'transp' }];
  assert.deepEqual(C.classify(rules, cats, 'expense', 'Uber', 'mercado'), { id: 'transp', source: 'rule' });
  assert.deepEqual(C.classify([], cats, 'expense', 'Padaria', 'mercado'), { id: 'mercado', source: 'history' });
});

test('categoria do tipo errado ou inexistente é ignorada', () => {
  const rules = [{ pattern: 'uber', category_id: 'salario' }, { pattern: 'uber', category_id: 'apagada' }];
  assert.equal(C.classify(rules, cats, 'expense', 'Uber', null), null);
  assert.equal(C.classify([], cats, 'income', 'Uber', 'transp'), null);
  assert.equal(C.classify(rules, cats, 'income', 'Uber', null).id, 'salario');
});
