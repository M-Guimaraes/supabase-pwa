/*
 * Lógica de orçamento e contas a pagar: funções puras, sem tela nem banco.
 * No navegador ficam em window.Budget; no Node, em module.exports (testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Budget = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WARN_AT = 0.8;

  function round2(n) { return Math.round(n * 100) / 100; }

  // Situação de uma categoria: ok, warn (a partir de 80%) ou over (acima de 100%).
  function status(limit, spent) {
    const ratio = limit > 0 ? spent / limit : 0;
    const level = ratio > 1 ? 'over' : ratio >= WARN_AT ? 'warn' : 'ok';
    return {
      level,
      percent: Math.round(ratio * 100),
      remaining: round2(limit - spent),
    };
  }

  // Une limites e gastos por categoria; mais apertadas primeiro.
  function budgetRows(budgets, spentByCategory) {
    return budgets
      .map((b) => {
        const spent = round2(spentByCategory.get(b.category_id) || 0);
        return { ...b, spent, ...status(b.monthly_limit, spent) };
      })
      .sort((a, b) => b.percent - a.percent);
  }

  function dayNumber(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / 86400000);
  }

  // Dias até o vencimento (negativo = atrasada).
  function daysUntil(dueOn, todayYmd) {
    return dayNumber(dueOn) - dayNumber(todayYmd);
  }

  // Contas não pagas atrasadas ou que vencem nos próximos `days` dias, da mais urgente.
  function dueBills(bills, todayYmd, days = 7) {
    return bills
      .filter((b) => !b.paid_on)
      .map((b) => ({ ...b, daysLeft: daysUntil(b.due_on, todayYmd) }))
      .filter((b) => b.daysLeft <= days)
      .sort((a, b) => a.daysLeft - b.daysLeft || a.due_on.localeCompare(b.due_on));
  }

  function dueLabel(daysLeft) {
    if (daysLeft < -1) return `atrasada há ${-daysLeft} dias`;
    if (daysLeft === -1) return 'atrasada desde ontem';
    if (daysLeft === 0) return 'vence hoje';
    if (daysLeft === 1) return 'vence amanhã';
    return `vence em ${daysLeft} dias`;
  }

  return { status, budgetRows, daysUntil, dueBills, dueLabel, WARN_AT };
});
