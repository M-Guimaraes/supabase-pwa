// Rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../movements.js');

test('detect: pagamento da fatura (descrições reais de extrato)', () => {
  assert.equal(M.detect('PAGAMENTO CARTAO CREDITO BCE 07/09 08:36 CARTAO VISA', 'expense'), 'card_payment');
  assert.equal(M.detect('PAGTO CARTAO CREDITO', 'expense'), 'card_payment');
  assert.equal(M.detect('Pagamento de fatura', 'expense'), 'card_payment');
  assert.equal(M.detect('DEBITO FATURA CARTAO', 'expense'), 'card_payment');
});

test('detect: investimentos e transferências', () => {
  assert.equal(M.detect('APLICACAO CDB/RDB', 'expense'), 'transfer');
  assert.equal(M.detect('RESGATE CDB/RDB', 'income'), 'transfer');
  assert.equal(M.detect('PIX ENVIADO SANTANDER CORRETORA DE TI', 'expense'), 'transfer');
  assert.equal(M.detect('CREDITO DA SANTANDER CORRETORA', 'income'), 'transfer');
  assert.equal(M.detect('CREDITO LIBERADO PARA PIX PIX NO CARTAO FINAL 1221', 'income'), 'transfer');
  assert.equal(M.detect('Transferência entre contas', 'expense'), 'transfer');
});

test('detect: o que não é claro continua normal', () => {
  assert.equal(M.detect('MERCADO PAGO', 'expense'), null);
  assert.equal(M.detect('LIQUIDO DE VENCIMENTO', 'income'), null);
  assert.equal(M.detect('PIX ENVIADO Maria Paula Sales', 'expense'), null);
  assert.equal(M.detect('DEB AUT. RECEITA FEDERAL DO BRASIL RFB - COTA IRPF', 'expense'), null);
  assert.equal(M.detect('DROGARIA SAO PAULO SA', 'expense'), null);
  assert.equal(M.detect('', 'expense'), null);
  assert.equal(M.detect(null, 'expense'), null);
});

test('detect: rendimento da aplicação automática é receita de verdade', () => {
  assert.equal(M.detect('REMUNERACAO APLICACAO AUTOMATICA', 'income'), null);
});

test('detect: pagamento de fatura só vale para despesa', () => {
  assert.equal(M.detect('PAGAMENTO CARTAO CREDITO', 'income'), null);
});

test('counts: só lançamento sem kind entra nos totais', () => {
  assert.equal(M.counts({ kind: null }), true);
  assert.equal(M.counts({}), true);
  assert.equal(M.counts({ kind: 'transfer' }), false);
  assert.equal(M.counts({ kind: 'card_payment' }), false);
});

test('summarize: separa o que conta do que ficou de fora', () => {
  const rows = [
    { type: 'expense', amount: '100.50', kind: null },
    { type: 'income', amount: 3000, kind: null },
    { type: 'expense', amount: 15411.88, kind: 'card_payment' },
    { type: 'expense', amount: 9500, kind: 'transfer' },
    { type: 'income', amount: 7001.62, kind: 'transfer' },
  ];
  assert.deepEqual(M.summarize(rows), {
    income: 3000,
    expense: 100.5,
    outside: { cardPayment: 15411.88, invested: 9500, redeemed: 7001.62 },
  });
});

test('suggest: agrupa por tipo e descrição parecida, maior total primeiro', () => {
  const rows = [
    { id: 'a', type: 'expense', amount: 9500, description: 'APLICACAO CDB/RDB', occurred_on: '2026-09-30' },
    { id: 'b', type: 'expense', amount: 5000, description: 'APLICACAO CDB/RDB', occurred_on: '2026-08-12' },
    { id: 'c', type: 'income', amount: 7000, description: 'RESGATE CDB/RDB', occurred_on: '2026-09-08' },
    { id: 'd', type: 'expense', amount: 50, description: 'PADARIA', occurred_on: '2026-09-02' },
    { id: 'e', type: 'expense', amount: 99, description: 'APLICACAO CDB/RDB', occurred_on: '2026-09-01', kind: 'transfer' },
  ];
  const s = M.suggest(rows);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].ids, ['a', 'b']);
  assert.equal(s[0].total, 14500);
  assert.deepEqual(s[0].months, ['2026-08', '2026-09']);
  assert.equal(s[0].kind, 'transfer');
  assert.deepEqual(s[1].ids, ['c']);
});

test('impact: despesas e receitas por mês antes e depois', () => {
  const rows = [
    { id: 'a', type: 'expense', amount: 15411.88, description: 'PAGAMENTO CARTAO CREDITO', occurred_on: '2026-09-08' },
    { id: 'b', type: 'expense', amount: 100, description: 'PADARIA', occurred_on: '2026-09-09' },
    { id: 'c', type: 'income', amount: 7000, description: 'RESGATE CDB/RDB', occurred_on: '2026-09-08' },
    { id: 'd', type: 'income', amount: 8467.46, description: 'LIQUIDO DE VENCIMENTO', occurred_on: '2026-09-30' },
    { id: 'e', type: 'expense', amount: 10, description: 'CAFE', occurred_on: '2026-08-02' },
  ];
  const r = M.impact(rows, M.suggest(rows));
  assert.equal(r[0].month, '2026-09');
  assert.deepEqual(r[0].before, { income: 15467.46, expense: 15511.88 });
  assert.deepEqual(r[0].after, { income: 8467.46, expense: 100 });
  assert.deepEqual(r[1], { month: '2026-08', before: { income: 0, expense: 10 }, after: { income: 0, expense: 10 } });
});
