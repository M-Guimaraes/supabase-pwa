/*
 * Atalhos para digitar menos: sugestão de categoria pela descrição, descrições recentes,
 * repetir o último lançamento e atalhos da tela inicial. Funções puras.
 * No navegador ficam em window.Quick (precisa de window.Importer); no Node, em module.exports.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./importer.js'));
  else root.Quick = factory(root.Importer);
})(typeof self !== 'undefined' ? self : this, function (Importer) {
  'use strict';

  const MAX_RECENT = 30;

  /*
   * `rows` vem do mais novo para o mais antigo, só com lançamentos digitados à mão.
   * - categoryByKey: categoria mais recente usada para cada tipo e descrição parecida.
   * - recent: descrições distintas recentes, com o último valor e categoria.
   * - last: o lançamento mais recente, para "repetir o último".
   */
  function buildHints(rows) {
    const categoryByKey = new Map();
    const seen = new Set();
    const recent = [];

    for (const r of rows) {
      const description = (r.description || '').trim();
      if (!description) continue;
      const key = `${r.type}|${Importer.descriptionKey(description)}`;
      if (r.category_id && !categoryByKey.has(key)) categoryByKey.set(key, r.category_id);

      const exact = `${r.type}|${description.toLowerCase()}`;
      if (!seen.has(exact) && recent.length < MAX_RECENT) {
        seen.add(exact);
        recent.push({
          type: r.type,
          description,
          amount: Number(r.amount),
          category_id: r.category_id || null,
        });
      }
    }

    const first = rows[0];
    const last = first
      ? {
          type: first.type,
          amount: Number(first.amount),
          description: first.description || '',
          category_id: first.category_id || null,
        }
      : null;
    return { categoryByKey, recent, last };
  }

  // Categoria usada antes para uma descrição parecida, ou null.
  function suggestCategory(hints, type, description) {
    const key = Importer.descriptionKey(description || '');
    if (!key) return null;
    return hints.categoryByKey.get(`${type}|${key}`) || null;
  }

  function recentDescriptions(hints, type) {
    return hints.recent.filter((r) => r.type === type).map((r) => r.description);
  }

  // "?novo=despesa" ou "?novo=receita" (atalhos da tela inicial do celular).
  function parseShortcut(search) {
    const value = new URLSearchParams(search || '').get('novo');
    if (value === 'despesa') return 'expense';
    if (value === 'receita') return 'income';
    return null;
  }

  return { buildHints, suggestCategory, recentDescriptions, parseShortcut };
});
