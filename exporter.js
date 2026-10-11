/*
 * Exportação de lançamentos em CSV (separador ";", vírgula decimal, UTF-8 com BOM,
 * para abrir direto no Excel e no Planilhas) e cálculo de metas. Funções puras.
 * No navegador ficam em window.Extras; no Node, em module.exports (testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Extras = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }

  // Texto que começa com = + - @ vira fórmula em planilhas; o apóstrofo evita isso.
  function safeText(value) {
    let s = String(value == null ? '' : value).replace(/[\r\n]+/g, ' ');
    if (/^[=+\-@\t]/.test(s)) s = "'" + s;
    return s;
  }

  function cell(value) {
    const s = safeText(value);
    return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function money(n) {
    return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  }

  // Despesas saem negativas e receitas positivas.
  function transactionsToCSV(transactions, categoryName) {
    const lines = ['Data;Tipo;Descrição;Categoria;Valor'];
    for (const t of transactions) {
      const d = t.occurred_on;
      const signed = t.type === 'expense' ? -Number(t.amount) : Number(t.amount);
      lines.push([
        `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`,
        t.type === 'expense' ? 'Despesa' : 'Receita',
        cell(t.description),
        cell(categoryName(t.category_id)),
        money(signed),
      ].join(';'));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  function exportFileName(label) {
    return `caixa-${label}.csv`;
  }

  function monthIndexOf(ymd) {
    return Number(ymd.slice(0, 4)) * 12 + Number(ymd.slice(5, 7)) - 1;
  }

  /*
   * Situação de uma meta. Com prazo, `perMonth` é quanto guardar por mês, contando o mês
   * atual e o do prazo; prazo vencido (overdue) pede o que falta de uma vez.
   */
  function goalInfo(goal, todayYmd) {
    const target = Number(goal.target_amount);
    const saved = Number(goal.saved_amount);
    const remaining = Math.max(0, Math.round((target - saved) * 100) / 100);
    const done = remaining === 0;
    const info = {
      percent: Math.round((saved / target) * 100),
      remaining,
      done,
      overdue: false,
      monthsLeft: null,
      perMonth: null,
    };
    if (goal.deadline && !done) {
      const diff = monthIndexOf(goal.deadline) - monthIndexOf(todayYmd);
      if (goal.deadline < todayYmd) {
        info.overdue = true;
        info.perMonth = remaining;
      } else {
        info.monthsLeft = diff + 1;
        info.perMonth = Math.ceil((remaining / info.monthsLeft) * 100) / 100;
      }
    }
    return info;
  }

  return { transactionsToCSV, exportFileName, safeText, goalInfo };
});
