/*
 * Regras de senha do cadastro: funções puras, sem tela.
 * No navegador ficam em window.Password; no Node, em module.exports (testes).
 * Os símbolos aceitos são os mesmos que o Supabase usa na política de senha,
 * para que o app e o servidor não discordem.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Password = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_LENGTH = 8;
  const MAX_LENGTH = 72; // limite do bcrypt, usado pelo Supabase
  const SYMBOLS = '!@#$%^&*()_+-=[]{};\':"|<>?,./`~\\';

  function hasSymbol(s) {
    for (const ch of s) if (SYMBOLS.includes(ch)) return true;
    return false;
  }

  // Lista de requisitos com a situação de cada um. `confirm` entra só se for informado.
  function rules(password, confirm) {
    const p = password || '';
    const list = [
      { id: 'length', label: `Pelo menos ${MIN_LENGTH} caracteres`, ok: p.length >= MIN_LENGTH && p.length <= MAX_LENGTH },
      { id: 'lower', label: 'Uma letra minúscula', ok: /\p{Ll}/u.test(p) },
      { id: 'upper', label: 'Uma letra maiúscula', ok: /\p{Lu}/u.test(p) },
      { id: 'digit', label: 'Um número', ok: /\d/.test(p) },
      { id: 'symbol', label: 'Um caractere especial, como ! @ # $ %', ok: hasSymbol(p) },
    ];
    if (confirm !== undefined) {
      list.push({ id: 'match', label: 'As duas senhas são iguais', ok: p.length > 0 && p === confirm });
    }
    return list;
  }

  function allOk(list) {
    return list.every((r) => r.ok);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());
  }

  return { rules, allOk, isValidEmail, MIN_LENGTH, MAX_LENGTH, SYMBOLS };
});
