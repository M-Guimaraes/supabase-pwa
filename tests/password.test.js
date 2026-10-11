// Rodar com: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../password.js');

const status = (pw, confirm) => Object.fromEntries(P.rules(pw, confirm).map((r) => [r.id, r.ok]));

test('senha forte atende a todos os requisitos', () => {
  assert.equal(P.allOk(P.rules('Senha#Forte9', 'Senha#Forte9')), true);
});

test('cada requisito é checado separadamente', () => {
  assert.deepEqual(status('abc'), { length: false, lower: true, upper: false, digit: false, symbol: false });
  assert.equal(status('SENHA#FORTE9').lower, false);
  assert.equal(status('senha#forte9').upper, false);
  assert.equal(status('Senha#Forte').digit, false);
  assert.equal(status('SenhaForte99').symbol, false);
  assert.equal(status('Ab#1').length, false);
});

test('acentos contam como letras, não como especiais', () => {
  const s = status('Ação1234');
  assert.equal(s.lower, true);
  assert.equal(s.upper, true);
  assert.equal(s.symbol, false);
});

test('símbolos aceitos são os da política do Supabase', () => {
  for (const ch of '!@#$%^&*()_+-=[]{};\':"|<>?,./`~\\') {
    assert.equal(status('Aa1' + ch + 'xxxx').symbol, true, `símbolo ${ch}`);
  }
  assert.equal(status('Aa1 xxxxx').symbol, false, 'espaço não é símbolo');
});

test('limite de 72 caracteres', () => {
  assert.equal(status('Aa1!' + 'x'.repeat(68)).length, true);
  assert.equal(status('Aa1!' + 'x'.repeat(69)).length, false);
});

test('confirmação só entra quando informada e precisa ser idêntica', () => {
  assert.equal(P.rules('Senha#Forte9').some((r) => r.id === 'match'), false);
  assert.equal(status('Senha#Forte9', 'Senha#Forte9').match, true);
  assert.equal(status('Senha#Forte9', 'senha#forte9').match, false);
  assert.equal(status('', '').match, false);
  assert.equal(P.allOk(P.rules('Senha#Forte9', 'outra')), false);
});

test('e-mail válido', () => {
  assert.equal(P.isValidEmail('a@b.com'), true);
  assert.equal(P.isValidEmail(' nome.sobrenome@mail.com.br '), true);
  assert.equal(P.isValidEmail('sem-arroba'), false);
  assert.equal(P.isValidEmail('a@b'), false);
  assert.equal(P.isValidEmail('a b@c.com'), false);
  assert.equal(P.isValidEmail(''), false);
});
