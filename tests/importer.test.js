// Rodar com: node --test
// Todos os arquivos em tests/fixtures são fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../importer.js');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

test('CSV no formato do C6: pula o texto inicial e lê entradas e saídas', () => {
  const r = I.parseStatement(fixture('c6-exemplo.csv'));
  assert.equal(r.kind, 'csv');
  assert.deepEqual(r.analysis.headers.slice(0, 3), ['Data Lançamento', 'Data Contábil', 'Título']);
  assert.equal(r.analysis.rows.length, 4);
  assert.equal(r.mapping.date, 0);
  assert.deepEqual(r.mapping.desc, [2, 3]);
  assert.equal(r.mapping.amount.mode, 'split');

  const { items } = I.csvToItems(r.analysis, r.mapping);
  assert.equal(items.length, 4);
  assert.equal(items[0].date, '2026-07-01');
  assert.equal(items[0].signed, 1500);
  assert.equal(items[1].signed, 0.37);
  assert.equal(items[2].signed, -45.9);
  assert.match(items[0].description, /^RECEBIMENTO DE TED - 00000000000000-EMPRESA EXEMPLO/);
});

test('ids do CSV são estáveis e linhas idênticas continuam distintas', async () => {
  const load = async () => {
    const r = I.parseStatement(fixture('c6-exemplo.csv'));
    return I.withIds(I.csvToItems(r.analysis, r.mapping).items);
  };
  const a = await load();
  const b = await load();
  const ids = a.map((x) => x.externalId);

  assert.equal(new Set(ids).size, 4, 'nenhum id repetido');
  assert.deepEqual(ids, b.map((x) => x.externalId), 'mesmo arquivo, mesmos ids');
  assert.ok(ids[2].endsWith(':1') && ids[3].endsWith(':2'), 'os dois Pix iguais viram :1 e :2');
});

test('CSV com ponto e vírgula, Latin-1, vírgula decimal e data com ano de 2 dígitos', () => {
  const text = 'Data;Histórico;Valor\n05/07/26;Padaria São João;-12,50\n06/07/26;Salário;1.234,56\n';
  const r = I.parseStatement(Buffer.from(text, 'latin1'));
  assert.equal(r.kind, 'csv');
  assert.equal(r.mapping.date, 0);
  assert.deepEqual(r.mapping.desc, [1]);
  assert.equal(r.mapping.amount.mode, 'single');
  assert.equal(r.mapping.amount.column, 2);

  const { items } = I.csvToItems(r.analysis, r.mapping);
  assert.deepEqual(items.map((x) => x.date), ['2026-07-05', '2026-07-06']);
  assert.deepEqual(items.map((x) => x.signed), [-12.5, 1234.56]);
  assert.equal(items[0].description, 'Padaria São João');
});

test('OFX 1.x (SGML): data, sinal, FITID e texto com entidade', () => {
  const r = I.parseStatement(fixture('extrato.ofx'));
  assert.equal(r.kind, 'ofx');
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].date, '2026-07-01');
  assert.equal(r.items[0].signed, 1500);
  assert.equal(r.items[0].externalId, 'ofx:12345-6:20260701001');
  assert.equal(r.items[1].signed, -45.9);
  assert.equal(r.items[1].description, 'MERCADO EXEMPLO - COMPRA DEBITO & CIA');
  assert.equal(r.items[2].description, 'ALUGUEL');
  assert.equal(r.items[2].signed, -120.5);
});

test('OFX 2.x (XML): acentos e FITID repetido no mesmo arquivo', () => {
  const r = I.parseStatement(fixture('extrato-xml.ofx'));
  assert.equal(r.kind, 'ofx');
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].description, 'Café da esquina');
  assert.deepEqual(
    r.items.map((x) => x.externalId),
    ['ofx:98765-4:A1', 'ofx:98765-4:A2', 'ofx:98765-4:A2#2']
  );
});

test('arquivo que não é extrato devolve null', () => {
  assert.equal(I.parseStatement(Buffer.from('isto não é um extrato')), null);
});

test('mapeamento incompleto não gera lançamentos', () => {
  const r = I.parseStatement(fixture('c6-exemplo.csv'));
  const out = I.csvToItems(r.analysis, { date: -1, desc: [], amount: { mode: 'single', column: -1 } });
  assert.deepEqual(out.items, []);
});

test('números: vírgula decimal, ponto decimal, moeda, parênteses', () => {
  assert.equal(I.parseNumber('1.234,56', 'comma'), 1234.56);
  assert.equal(I.parseNumber('4776.43', 'dot'), 4776.43);
  assert.equal(I.parseNumber('R$ -45,90', 'comma'), -45.9);
  assert.equal(I.parseNumber('(10,00)', 'comma'), -10);
  assert.equal(I.parseNumber('', 'comma'), null);
  assert.equal(I.detectNumberStyle(['4776.43', '0.00']), 'dot');
  assert.equal(I.detectNumberStyle(['1.234,56', '10,00']), 'comma');
});

test('datas: formatos aceitos e inválidas', () => {
  assert.equal(I.parseDate('01/07/2026'), '2026-07-01');
  assert.equal(I.parseDate('1/7/26'), '2026-07-01');
  assert.equal(I.parseDate('2026-07-01'), '2026-07-01');
  assert.equal(I.parseDate('31/02/2026'), null);
  assert.equal(I.parseDate('abc'), null);
});

test('inverter sinais troca receita e despesa', () => {
  assert.deepEqual(I.view({ signed: -10 }, false), { type: 'expense', amount: 10 });
  assert.deepEqual(I.view({ signed: -10 }, true), { type: 'income', amount: 10 });
});

test('chave de categoria ignora números, acentos e caixa', () => {
  assert.equal(I.descriptionKey('Pix enviado para JOÃO 123'), 'pix enviado para');
  assert.equal(I.descriptionKey('MERCADO  Exemplo 0042'), 'mercado exemplo');
});
