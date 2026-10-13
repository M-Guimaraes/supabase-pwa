/*
 * Gastos compartilhados do casal: funções puras, sem tela nem banco.
 * No navegador ficam em window.Household; no Node, em module.exports (testes).
 *
 * Um lançamento compartilhado tem user_id (quem pagou), amount e payer_share:
 * o percentual do valor que fica com quem pagou. O parceiro deve o resto.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Household = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function round2(n) { return Math.round(n * 100) / 100; }

  // Divisões prontas: payer_share é a parte de quem pagou.
  const SPLIT_PRESETS = [
    { share: 50, label: '50/50' },
    { share: 60, label: '60/40 (eu fico com 60%)' },
    { share: 70, label: '70/30 (eu fico com 70%)' },
    { share: 0, label: 'Tudo do parceiro' },
  ];

  // Aceita "60", "60,5" ou "60.5"; devolve 0 a 100 ou null se não for um percentual válido.
  function parseShare(text) {
    const s = String(text == null ? '' : text).trim().replace('%', '').replace(',', '.');
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
    const n = Number(s);
    return n >= 0 && n <= 100 ? n : null;
  }

  function isShared(tx) {
    return !!tx && tx.household_id != null && tx.payer_share != null;
  }

  // Quanto o parceiro de quem pagou deve neste lançamento (em reais, com centavos).
  function owedByPartner(tx) {
    if (tx.payer_share == null) return 0;
    return round2((Number(tx.amount) * (100 - Number(tx.payer_share))) / 100);
  }

  // Parte do valor que fica com quem pagou.
  function payerPart(tx) {
    return round2(Number(tx.amount) - owedByPartner(tx));
  }

  function sharedExpenses(sharedTx) {
    return sharedTx.filter((t) => t.type !== 'income' && t.payer_share != null);
  }

  // Saldo líquido: positivo = o parceiro me deve; negativo = eu devo ao parceiro.
  // Acertos já feitos abatem a dívida (quem pagou diminui o que devia).
  function balance(sharedTx, settlements, myId) {
    let cents = 0;
    for (const t of sharedExpenses(sharedTx)) {
      const owed = Math.round(owedByPartner(t) * 100);
      cents += t.user_id === myId ? owed : -owed;
    }
    for (const s of settlements || []) {
      const amt = Math.round(Number(s.amount) * 100);
      if (s.from_user === myId) cents += amt;
      else if (s.to_user === myId) cents -= amt;
    }
    return cents / 100;
  }

  // Resumo de um conjunto de lançamentos (normalmente o mês): total da casa,
  // quanto cada um pagou e quanto cada um "consumiu" (a parte dele em tudo).
  function monthSummary(sharedTx, myId) {
    const out = { total: 0, paidByMe: 0, paidByPartner: 0, myShare: 0, partnerShare: 0 };
    for (const t of sharedExpenses(sharedTx)) {
      const amount = Number(t.amount);
      const owed = owedByPartner(t);
      const kept = round2(amount - owed);
      out.total += amount;
      if (t.user_id === myId) {
        out.paidByMe += amount;
        out.myShare += kept;
        out.partnerShare += owed;
      } else {
        out.paidByPartner += amount;
        out.partnerShare += kept;
        out.myShare += owed;
      }
    }
    for (const k of Object.keys(out)) out[k] = round2(out[k]);
    return out;
  }

  // "50/50", "60/40"; 0 vira "Tudo do parceiro".
  function splitLabel(payerShare) {
    const n = Number(payerShare);
    if (n === 0) return 'Tudo do parceiro';
    const fmt = (v) => String(round2(v)).replace('.', ',');
    return `${fmt(n)}/${fmt(100 - n)}`;
  }

  // Alfabeto do convite sem 0/O/1/I; o código é digitado à mão, então tira o que atrapalha.
  function normalizeCode(text) {
    return String(text == null ? '' : text).toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function isValidCode(text) {
    return /^[A-HJ-NP-Z2-9]{8}$/.test(normalizeCode(text));
  }

  return { SPLIT_PRESETS, parseShare, isShared, owedByPartner, payerPart, balance, monthSummary, splitLabel, normalizeCode, isValidCode };
});
