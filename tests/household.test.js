// Rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../household.js');

const ME = 'user-a';
const PARTNER = 'user-b';

test('owedByPartner: 50/50 e divisões desiguais', () => {
  assert.equal(H.owedByPartner({ amount: 100, payer_share: 50 }), 50);
  assert.equal(H.owedByPartner({ amount: 100, payer_share: 60 }), 40);
  assert.equal(H.owedByPartner({ amount: 100, payer_share: 0 }), 100);
  assert.equal(H.owedByPartner({ amount: 100, payer_share: 100 }), 0);
});

test('owedByPartner: arredonda em centavos e não perde nada na soma', () => {
  const tx = { amount: 10.01, payer_share: 50 };
  const owed = H.owedByPartner(tx);
  assert.equal(owed, 5.01);
  assert.equal(Math.round((H.payerPart(tx) + owed) * 100), 1001);
});

test('owedByPartner: lançamento privado não gera dívida', () => {
  assert.equal(H.owedByPartner({ amount: 100, payer_share: null }), 0);
  assert.equal(H.owedByPartner({ amount: 100 }), 0);
});

test('balance: água paga por mim, luz paga pelo parceiro', () => {
  const tx = [
    { user_id: ME, type: 'expense', amount: 100, payer_share: 50 },
    { user_id: PARTNER, type: 'expense', amount: 150, payer_share: 50 },
  ];
  // o parceiro me deve 50; eu devo 75 → eu devo 25
  assert.equal(H.balance(tx, [], ME), -25);
  assert.equal(H.balance(tx, [], PARTNER), 25);
});

test('balance: acerto de contas zera a dívida dos dois lados', () => {
  const tx = [{ user_id: PARTNER, type: 'expense', amount: 150, payer_share: 50 }];
  assert.equal(H.balance(tx, [], ME), -75);
  const paid = [{ from_user: ME, to_user: PARTNER, amount: 75 }];
  assert.equal(H.balance(tx, paid, ME), 0);
  assert.equal(H.balance(tx, paid, PARTNER), 0);
});

test('balance: acerto parcial e acerto a mais invertem o sinal', () => {
  const tx = [{ user_id: PARTNER, type: 'expense', amount: 100, payer_share: 50 }];
  assert.equal(H.balance(tx, [{ from_user: ME, to_user: PARTNER, amount: 20 }], ME), -30);
  assert.equal(H.balance(tx, [{ from_user: ME, to_user: PARTNER, amount: 60 }], ME), 10);
});

test('balance: ignora receitas e lançamentos sem divisão', () => {
  const tx = [
    { user_id: ME, type: 'income', amount: 500, payer_share: 50 },
    { user_id: ME, type: 'expense', amount: 80, payer_share: null },
  ];
  assert.equal(H.balance(tx, [], ME), 0);
});

test('balance: centavos não acumulam erro de ponto flutuante', () => {
  const tx = Array.from({ length: 10 }, () => ({ user_id: ME, type: 'expense', amount: 0.1, payer_share: 50 }));
  assert.equal(H.balance(tx, [], ME), 0.5);
});

test('monthSummary: total, quem pagou e a parte de cada um', () => {
  const tx = [
    { user_id: ME, type: 'expense', amount: 100, payer_share: 60 },
    { user_id: PARTNER, type: 'expense', amount: 200, payer_share: 50 },
  ];
  assert.deepEqual(H.monthSummary(tx, ME), {
    total: 300,
    paidByMe: 100,
    paidByPartner: 200,
    myShare: 160, // 60 do que paguei + 100 da parte que me cabe no que ele pagou
    partnerShare: 140, // 40 + 100
  });
});

test('parseShare: aceita vírgula e rejeita fora de 0 a 100', () => {
  assert.equal(H.parseShare('60'), 60);
  assert.equal(H.parseShare('62,5'), 62.5);
  assert.equal(H.parseShare(' 0 '), 0);
  assert.equal(H.parseShare('100'), 100);
  assert.equal(H.parseShare('101'), null);
  assert.equal(H.parseShare('-5'), null);
  assert.equal(H.parseShare('abc'), null);
  assert.equal(H.parseShare(''), null);
});

test('splitLabel', () => {
  assert.equal(H.splitLabel(50), '50/50');
  assert.equal(H.splitLabel(60), '60/40');
  assert.equal(H.splitLabel(62.5), '62,5/37,5');
  assert.equal(H.splitLabel(0), 'Tudo do parceiro');
});

test('códigos de convite: normaliza e valida o alfabeto', () => {
  assert.equal(H.normalizeCode(' abcd-2345 '), 'ABCD2345');
  assert.equal(H.isValidCode('abcd-2345'), true);
  assert.equal(H.isValidCode('ABCD234'), false);
  assert.equal(H.isValidCode('ABCD2340'), false); // 0 não existe no alfabeto
  assert.equal(H.isValidCode('ABCD234I'), false); // I também não
});
