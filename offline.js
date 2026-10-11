/*
 * Modo offline: cópia local dos dados para leitura e fila de lançamentos novos.
 * A lógica é pura (recebe o storage de fora) para poder ser testada no Node.
 * No navegador fica em window.Offline; no Node, em module.exports.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Offline = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SNAPSHOT_KEY = 'caixa-offline-snapshot';
  const QUEUE_KEY = 'caixa-offline-queue';

  // Erro de rede (sem internet), e não resposta recusada pelo servidor.
  function isNetworkError(err) {
    const msg = String((err && err.message) || err || '');
    return /failed to fetch|networkerror|network request failed|load failed|fetch failed|offline/i.test(msg);
  }

  function newId(cryptoLike) {
    const c = cryptoLike || (typeof crypto !== 'undefined' ? crypto : null);
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    const hex = () => Math.floor(Math.random() * 16).toString(16);
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) =>
      ch === 'x' ? hex() : ((Math.random() * 4) | 8).toString(16));
  }

  // Lançamentos de um mês [start, next), do mais novo ao mais antigo.
  function monthRows(rows, start, next) {
    return rows
      .filter((t) => t.occurred_on >= start && t.occurred_on < next)
      .slice()
      .sort((a, b) =>
        a.occurred_on === b.occurred_on
          ? String(b.created_at || '').localeCompare(String(a.created_at || ''))
          : b.occurred_on.localeCompare(a.occurred_on));
  }

  // Junta os lançamentos ainda não enviados à lista do mês (marcados com pending).
  function mergePending(rows, pending, start, next) {
    const mine = pending
      .filter((p) => p.occurred_on >= start && p.occurred_on < next)
      .map((p) => ({ ...p, pending: true }));
    return monthRows(rows.concat(mine), start, next);
  }

  function create(storage) {
    function read(key, fallback) {
      try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (err) {
        return fallback;
      }
    }
    function write(key, value) {
      try {
        storage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        return false;
      }
    }
    function drop(key) {
      try { storage.removeItem(key); } catch (err) { /* sem problema */ }
    }

    return {
      saveSnapshot(userId, data) {
        return write(SNAPSHOT_KEY, { userId, savedAt: new Date().toISOString(), data });
      },
      loadSnapshot(userId) {
        const snap = read(SNAPSHOT_KEY, null);
        if (!snap || !snap.data) return null;
        if (userId && snap.userId !== userId) return null;
        return snap;
      },
      clearSnapshot() { drop(SNAPSHOT_KEY); },

      queue(userId) {
        const all = read(QUEUE_KEY, {});
        return Array.isArray(all[userId]) ? all[userId] : [];
      },
      enqueue(userId, tx) {
        const all = read(QUEUE_KEY, {});
        const list = Array.isArray(all[userId]) ? all[userId] : [];
        const item = { ...tx };
        list.push(item);
        all[userId] = list;
        return write(QUEUE_KEY, all) ? item : null;
      },
      remove(userId, ids) {
        const all = read(QUEUE_KEY, {});
        const gone = new Set(ids);
        all[userId] = (all[userId] || []).filter((t) => !gone.has(t.id));
        if (all[userId].length === 0) delete all[userId];
        write(QUEUE_KEY, all);
      },
      clearQueue() { drop(QUEUE_KEY); },
      clearAll() { drop(SNAPSHOT_KEY); drop(QUEUE_KEY); },
    };
  }

  return { create, isNetworkError, newId, monthRows, mergePending };
});
