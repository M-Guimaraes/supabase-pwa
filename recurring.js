/*
 * Lógica das recorrências (lançamentos fixos): funções puras, sem tela nem banco.
 * No navegador ficam em window.Recurring; no Node, em module.exports (testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Recurring = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_BACKFILL_MONTHS = 24;

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

  // 'AAAA-MM-DD' ou 'AAAA-MM' -> número de meses desde o ano 0 (para comparar e iterar).
  function monthIndex(s) {
    return Number(String(s).slice(0, 4)) * 12 + Number(String(s).slice(5, 7)) - 1;
  }

  function monthStart(index) {
    return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`;
  }

  // 'AAAA-MM' -> 'AAAA-MM' do mês seguinte.
  function nextMonthLabel(label) {
    const i = monthIndex(label) + 1;
    return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
  }

  /*
   * Ocorrências que já deveriam existir, e ainda não foram geradas, para uma recorrência.
   * - Começa no mês de `start_on` ou no mês seguinte ao de `generated_through`.
   * - Nunca gera mês futuro nem dia que ainda não chegou.
   * - Dia 31 vira o último dia de meses mais curtos.
   * O externalId é fixo por recorrência e mês, então gerar duas vezes não duplica.
   */
  function occurrencesDue(rec, today) {
    const current = today.getFullYear() * 12 + today.getMonth();
    let from = monthIndex(rec.start_on);
    if (rec.generated_through) from = Math.max(from, monthIndex(rec.generated_through) + 1);
    from = Math.max(from, current - (MAX_BACKFILL_MONTHS - 1));

    const todayStr = ymd(today);
    const out = [];
    for (let mi = from; mi <= current; mi++) {
      const year = Math.floor(mi / 12);
      const month = mi % 12;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const date = `${year}-${pad(month + 1)}-${pad(Math.min(rec.day_of_month, lastDay))}`;
      if (date > todayStr) break;
      const label = `${year}-${pad(month + 1)}`;
      out.push({ month: label, date, externalId: `rec:${rec.id}:${label}` });
    }
    return out;
  }

  // Valor para gravar em generated_through depois de gerar: o primeiro dia do último mês gerado.
  function generatedThrough(occurrences) {
    return occurrences.length ? `${occurrences[occurrences.length - 1].month}-01` : null;
  }

  // Ao retomar uma recorrência pausada, não preenche os meses em que ficou parada.
  function resumeMarker(today) {
    return monthStart(today.getFullYear() * 12 + today.getMonth() - 1);
  }

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\d+/g, ' ')
      .replace(/[^a-z]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');
  }

  function sameThingKey(item) {
    return `${item.type}|${norm(item.description)}|${Number(item.amount).toFixed(2)}`;
  }

  /*
   * Possíveis recorrências ainda não cadastradas: mesmo tipo, descrição parecida e mesmo
   * valor nos dois meses mais recentes seguidos, com o último no mês atual ou no anterior.
   * Lançamentos gerados por recorrência (external_id "rec:") não contam.
   */
  function suggestRecurring(transactions, recurrences, today) {
    const current = today.getFullYear() * 12 + today.getMonth();
    const known = new Set(recurrences.map(sameThingKey));
    const groups = new Map();

    for (const t of transactions) {
      if (t.external_id && String(t.external_id).startsWith('rec:')) continue;
      if (!norm(t.description)) continue;
      const key = sameThingKey(t);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }

    const out = [];
    for (const [key, list] of groups) {
      if (known.has(key)) continue;
      const months = [...new Set(list.map((t) => monthIndex(t.occurred_on)))].sort((a, b) => b - a);
      if (months.length < 2) continue;
      if (months[0] < current - 1) continue;
      if (months[1] !== months[0] - 1) continue;

      const latest = list.slice().sort((a, b) => b.occurred_on.localeCompare(a.occurred_on))[0];
      out.push({
        type: latest.type,
        description: latest.description,
        amount: Number(latest.amount),
        category_id: latest.category_id || null,
        day: Number(latest.occurred_on.slice(8, 10)),
        lastMonth: latest.occurred_on.slice(0, 7),
        months: months.length,
      });
    }
    return out.sort((a, b) => b.months - a.months || b.amount - a.amount).slice(0, 5);
  }

  // Total mensal das despesas fixas ativas.
  function fixedExpenseTotal(recurrences) {
    const active = recurrences.filter((r) => r.active && r.type === 'expense');
    return {
      count: active.length,
      total: Math.round(active.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100,
    };
  }

  return {
    occurrencesDue, generatedThrough, resumeMarker, suggestRecurring, fixedExpenseTotal,
    monthIndex, nextMonthLabel,
  };
});
