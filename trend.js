/*
 * Evolução mensal (receitas x despesas dos últimos meses): funções puras, sem tela.
 * No navegador ficam em window.Trend; no Node, em module.exports (testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Trend = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function round2(n) { return Math.round(n * 100) / 100; }
  function pad(n) { return String(n).padStart(2, '0'); }

  // Primeiro dia do mês mais antigo da janela, como 'AAAA-MM-DD'.
  function windowStart(today, count) {
    const d = new Date(today.getFullYear(), today.getMonth() - (count - 1), 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  }

  /*
   * Totais por mês, do mais antigo ao mês atual. Meses sem lançamento entram zerados,
   * para a escala do gráfico não pular meses.
   */
  function monthlySeries(transactions, today, count = 6) {
    const months = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, year: d.getFullYear(), month: d.getMonth(), income: 0, expense: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const t of transactions) {
      const m = byKey.get(String(t.occurred_on).slice(0, 7));
      if (!m) continue;
      if (t.type === 'income') m.income += Number(t.amount);
      else m.expense += Number(t.amount);
    }
    return months.map((m) => ({
      ...m,
      income: round2(m.income),
      expense: round2(m.expense),
      balance: round2(m.income - m.expense),
    }));
  }

  // Teto "redondo" para a escala (1, 2, 5 ou 10 vezes uma potência de 10) e 3 marcas.
  function niceScale(maxValue) {
    if (!(maxValue > 0)) return { max: 100, ticks: [0, 50, 100] };
    const exp = Math.pow(10, Math.floor(Math.log10(maxValue)));
    const step = [1, 2, 5, 10].find((s) => s * exp >= maxValue) * exp;
    return { max: step, ticks: [0, step / 2, step] };
  }

  // 0, 500, 2 mil, 2,5 mil, 1,2 mi.
  function compact(n) {
    const fmt = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
    if (n >= 1e6) return `${fmt(n / 1e6)} mi`;
    if (n >= 1000) return `${fmt(n / 1000)} mil`;
    return fmt(n);
  }

  function hasData(series) {
    return series.some((m) => m.income > 0 || m.expense > 0);
  }

  return { monthlySeries, windowStart, niceScale, compact, hasData };
});
