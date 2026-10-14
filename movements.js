/*
 * Movimentações que não são gasto nem receita: pagamento da fatura do cartão (as compras
 * da fatura já são o gasto) e investimentos ou transferências entre contas. Funções puras.
 * No navegador ficam em window.Movements; no Node, em module.exports (testes).
 *
 * Um lançamento com `kind` preenchido ('card_payment' ou 'transfer') fica fora dos totais.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Movements = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KIND_LABELS = { card_payment: 'Pagamento de fatura', transfer: 'Transferência' };

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Mesma chave de agrupamento do importador: as 3 primeiras palavras, sem números.
  function groupKey(description) {
    return norm(description).replace(/\d+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  }

  const CARD_PAYMENT_RES = [
    /\bpag(amento|to)? (de )?cartao\b/,
    /\bpgto cartao\b/,
    /\bpag(amento|to)? (de )?fatura\b/,
    /\bfatura cartao\b/,
    /\bdebito fatura\b/,
  ];

  const TRANSFER_RES = [
    /\b(aplicacao|aplic|resgate|resg)\b.*\b(cdb|rdb|lci|lca|fundo|fundos|tesouro|poupanca|previdencia|investimento)\b/,
    /\bcorretora\b/,
    /\bcredito liberado para pix\b/,
    /\b(transferencia|transf) entre contas\b/,
    /\bmesma titularidade\b/,
  ];

  // 'card_payment' | 'transfer' | null. Conservador: o que não for claro continua normal.
  function detect(description, type) {
    const text = norm(description);
    if (!text) return null;
    // Rendimento de aplicação automática é receita de verdade.
    if (/\bremuneracao\b/.test(text)) return null;
    if (type !== 'income' && CARD_PAYMENT_RES.some((re) => re.test(text))) return 'card_payment';
    if (TRANSFER_RES.some((re) => re.test(text))) return 'transfer';
    return null;
  }

  // Entra nos totais (Resumo, lista, gráficos) quando não tem `kind`.
  function counts(tx) {
    return !tx.kind;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  // Totais do que conta e do que ficou de fora, para mostrar a linha "Fora do resumo".
  function summarize(rows) {
    const out = { income: 0, expense: 0, outside: { cardPayment: 0, invested: 0, redeemed: 0 } };
    for (const t of rows) {
      const amount = Number(t.amount);
      if (t.kind === 'card_payment') out.outside.cardPayment += amount;
      else if (t.kind === 'transfer') {
        if (t.type === 'income') out.outside.redeemed += amount; else out.outside.invested += amount;
      } else if (t.type === 'income') out.income += amount;
      else out.expense += amount;
    }
    out.income = round2(out.income);
    out.expense = round2(out.expense);
    for (const k of Object.keys(out.outside)) out.outside[k] = round2(out.outside[k]);
    return out;
  }

  // Sugestões para a revisão: lançamentos normais que parecem movimentação, agrupados por
  // tipo detectado e por descrição parecida (maior total primeiro).
  function suggest(rows) {
    const groups = new Map();
    for (const t of rows) {
      if (t.kind) continue;
      const kind = detect(t.description, t.type);
      if (!kind) continue;
      const key = `${kind}|${groupKey(t.description)}|${t.type}`;
      let g = groups.get(key);
      if (!g) {
        g = { key, kind, type: t.type, label: t.description, ids: [], count: 0, total: 0, months: new Set() };
        groups.set(key, g);
      }
      g.ids.push(t.id);
      g.count += 1;
      g.total += Number(t.amount);
      g.months.add(String(t.occurred_on).slice(0, 7));
    }
    return [...groups.values()]
      .map((g) => ({ ...g, total: round2(g.total), months: [...g.months].sort() }))
      .sort((a, b) => b.total - a.total);
  }

  // Despesas e receitas por mês (AAAA-MM) antes e depois de aplicar as sugestões, para a prévia.
  function impact(rows, suggestions) {
    const moved = new Set();
    for (const g of suggestions) for (const id of g.ids) moved.add(id);
    const byMonth = new Map();
    for (const t of rows) {
      if (t.kind) continue;
      const m = String(t.occurred_on).slice(0, 7);
      if (!byMonth.has(m)) byMonth.set(m, { month: m, before: { income: 0, expense: 0 }, after: { income: 0, expense: 0 } });
      const row = byMonth.get(m);
      const side = t.type === 'income' ? 'income' : 'expense';
      row.before[side] += Number(t.amount);
      if (!moved.has(t.id)) row.after[side] += Number(t.amount);
    }
    return [...byMonth.values()]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((r) => ({
        month: r.month,
        before: { income: round2(r.before.income), expense: round2(r.before.expense) },
        after: { income: round2(r.after.income), expense: round2(r.after.expense) },
      }));
  }

  return { KIND_LABELS, groupKey, detect, counts, summarize, suggest, impact };
});
