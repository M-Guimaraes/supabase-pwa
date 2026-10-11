/*
 * Período da lista de lançamentos: dia, mês ou ano. Funções puras, sem tela.
 * No navegador ficam em window.Period; no Node, em module.exports (testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Period = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MODES = ['day', 'month', 'year'];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  // Intervalo [start, next) em 'AAAA-MM-DD' do período que contém a data.
  function range(mode, date) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    if (mode === 'year') return { start: ymd(new Date(y, 0, 1)), next: ymd(new Date(y + 1, 0, 1)) };
    if (mode === 'month') return { start: ymd(new Date(y, m, 1)), next: ymd(new Date(y, m + 1, 1)) };
    return { start: ymd(new Date(y, m, d)), next: ymd(new Date(y, m, d + 1)) };
  }

  // Anda um período para frente (+1) ou para trás (-1), sem estourar fim de mês (31/mar -> 28/fev).
  function shift(mode, date, delta) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    if (mode === 'year') return new Date(y + delta, m, Math.min(d, daysIn(y + delta, m)));
    if (mode === 'month') return new Date(y, m + delta, Math.min(d, daysIn(y, m + delta)));
    return new Date(y, m, d + delta);
  }

  function daysIn(year, month) { return new Date(year, month + 1, 0).getDate(); }

  // Diferença em dias entre a data e hoje: 0 = hoje, -1 = ontem, 1 = amanhã.
  function dayOffset(date, today) {
    return Math.round((startOfDay(date) - startOfDay(today)) / 86400000);
  }

  // Sem filtro ativo = o dia de hoje.
  function isDefault(mode, date, today) {
    return mode === 'day' && dayOffset(date, today) === 0;
  }

  // A data cai dentro do período mostrado?
  function contains(mode, anchor, dateStr) {
    const r = range(mode, anchor);
    return dateStr >= r.start && dateStr < r.next;
  }

  return { MODES, range, shift, dayOffset, isDefault, contains, ymd };
});
