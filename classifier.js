/*
 * Classificação automática de lançamentos: regras do usuário ("se a descrição contém X,
 * a categoria é Y") e, na falta delas, o histórico. Funções puras, sem tela.
 * No navegador ficam em window.Classifier; no Node, em module.exports (testes).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Classifier = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_LEN = 2;
  const MAX_LEN = 60;

  // Minúsculas, sem acento e sem pontuação: "UBER*TRIP 123" -> "uber trip 123".
  function norm(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // Texto digitado pelo usuário -> padrão guardado, ou erro.
  function normalizePattern(input) {
    const pattern = norm(input);
    if (pattern.length < MIN_LEN) return { ok: false, error: `Digite pelo menos ${MIN_LEN} letras ou números.` };
    if (pattern.length > MAX_LEN) return { ok: false, error: `Use no máximo ${MAX_LEN} caracteres.` };
    return { ok: true, pattern };
  }

  /*
   * Categoria para uma descrição. rules: [{pattern, category_id}] (pattern já normalizado);
   * categories: [{id, type}]; historyId: categoria sugerida pelo histórico (ou null).
   * A regra mais específica (padrão mais longo) vence; regra de categoria do tipo errado é ignorada.
   * Devolve { id, source: 'rule' | 'history' } ou null.
   */
  function classify(rules, categories, type, description, historyId) {
    const valid = (id) => id && categories.some((c) => c.id === id && c.type === type);
    const text = norm(description);
    if (text) {
      const hits = rules
        .filter((r) => r.pattern && text.includes(r.pattern) && valid(r.category_id))
        .sort((a, b) => b.pattern.length - a.pattern.length);
      if (hits.length > 0) return { id: hits[0].category_id, source: 'rule' };
    }
    if (valid(historyId)) return { id: historyId, source: 'history' };
    return null;
  }

  return { norm, normalizePattern, classify };
});
