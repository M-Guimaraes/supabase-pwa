const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../period.js');

test('range de dia, mês e ano', () => {
  const d = new Date(2026, 9, 11);
  assert.deepEqual(P.range('day', d), { start: '2026-10-11', next: '2026-10-12' });
  assert.deepEqual(P.range('month', d), { start: '2026-10-01', next: '2026-11-01' });
  assert.deepEqual(P.range('year', d), { start: '2026-01-01', next: '2027-01-01' });
});

test('range vira o mês e o ano', () => {
  assert.deepEqual(P.range('day', new Date(2026, 11, 31)), { start: '2026-12-31', next: '2027-01-01' });
  assert.deepEqual(P.range('month', new Date(2026, 11, 15)), { start: '2026-12-01', next: '2027-01-01' });
});

test('shift anda um período sem estourar o fim do mês', () => {
  assert.equal(P.ymd(P.shift('day', new Date(2026, 2, 1), -1)), '2026-02-28');
  assert.equal(P.ymd(P.shift('month', new Date(2026, 2, 31), -1)), '2026-02-28');
  assert.equal(P.ymd(P.shift('month', new Date(2026, 0, 15), -1)), '2025-12-15');
  assert.equal(P.ymd(P.shift('year', new Date(2024, 1, 29), 1)), '2025-02-28');
  assert.equal(P.ymd(P.shift('day', new Date(2026, 11, 31), 1)), '2027-01-01');
});

test('dayOffset e isDefault', () => {
  const today = new Date(2026, 9, 11, 15, 30);
  assert.equal(P.dayOffset(new Date(2026, 9, 11), today), 0);
  assert.equal(P.dayOffset(new Date(2026, 9, 10), today), -1);
  assert.equal(P.dayOffset(new Date(2026, 9, 12, 23, 59), today), 1);
  assert.ok(P.isDefault('day', new Date(2026, 9, 11, 1), today));
  assert.ok(!P.isDefault('month', new Date(2026, 9, 11), today));
  assert.ok(!P.isDefault('day', new Date(2026, 9, 10), today));
});

test('contains diz se a data está no período', () => {
  const anchor = new Date(2026, 9, 11);
  assert.ok(P.contains('month', anchor, '2026-10-01'));
  assert.ok(!P.contains('month', anchor, '2026-11-01'));
  assert.ok(P.contains('year', anchor, '2026-12-31'));
  assert.ok(!P.contains('day', anchor, '2026-10-12'));
});
