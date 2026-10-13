/*
 * Leitor de extratos (OFX 1.x/2.x e CSV). Funções puras, sem acesso à tela nem ao
 * banco: no navegador ficam em window.Importer; no Node, em module.exports (testes).
 *
 * Cada lançamento lido tem este formato:
 *   { date: 'AAAA-MM-DD', description, signed, externalId }
 * onde `signed` é positivo para entrada e negativo para saída, como veio no arquivo.
 * A inversão de sinais (faturas de cartão) é aplicada depois, em view().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Importer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_DESC = 120;

  /* ---------- Texto ---------- */

  // UTF-8 se o arquivo for válido nessa codificação; senão Windows-1252 (comum em bancos).
  function decodeBytes(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
    const body = bytes.subarray(start);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(body);
    } catch (_) {
      return new TextDecoder('windows-1252').decode(body);
    }
  }

  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function cleanDescription(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_DESC);
  }

  /* ---------- Datas e números ---------- */

  // Aceita dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, dd.mm.aaaa e aaaa-mm-dd (dia antes do mês).
  function parseDate(raw) {
    const s = String(raw == null ? '' : raw).trim();
    let y, mo, d;
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\D.*)?$/);
    if (m) {
      d = +m[1]; mo = +m[2]; y = +m[3];
      if (m[3].length === 2) y += 2000;
    } else {
      m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?:\D.*)?$/);
      if (!m) return null;
      y = +m[1]; mo = +m[2]; d = +m[3];
    }
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }

  // Decide, olhando todos os valores do arquivo, se o decimal é vírgula ou ponto.
  function detectNumberStyle(values) {
    let comma = 0;
    let dot = 0;
    for (const v of values) {
      const s = String(v == null ? '' : v).trim();
      if (/,\d{1,2}$/.test(s)) comma++;
      else if (/\.\d{1,2}$/.test(s)) dot++;
    }
    return dot > comma ? 'dot' : 'comma';
  }

  function parseNumber(raw, style) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    const negative = /^\(.*\)$/.test(s) || s.includes('-');
    s = s.replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return null;
    s = style === 'dot' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.round(n * 100) / 100;
    return negative ? -rounded : rounded;
  }

  /* ---------- CSV ---------- */

  function parseCSVRows(text, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += c;
      } else if (c === '"' && field === '') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.map((r) => r.map((x) => x.trim()));
  }

  function looksLikeHeaderCell(cell) {
    return cell !== '' && parseDate(cell) === null && !/^[-+()\d.,\s]+$/.test(cell);
  }

  // Acha o separador, pula o texto antes da tabela (como o do C6) e separa cabeçalho e linhas.
  function analyzeCSV(text) {
    let best = null;
    for (const delimiter of [',', ';', '\t']) {
      const rows = parseCSVRows(text, delimiter);
      const counts = new Map();
      for (const r of rows) if (r.length >= 3) counts.set(r.length, (counts.get(r.length) || 0) + 1);
      let cols = 0;
      let score = 0;
      for (const [c, n] of counts) {
        if (n > score || (n === score && c > cols)) { cols = c; score = n; }
      }
      if (!best || score > best.score) best = { delimiter, rows, cols, score };
    }
    if (!best || best.score < 2) return null;

    const sameWidth = best.rows.filter((r) => r.length === best.cols);
    const headerAt = sameWidth.findIndex((r) => r.every(looksLikeHeaderCell));
    if (headerAt < 0) return null;

    return {
      delimiter: best.delimiter,
      headers: sameWidth[headerAt],
      rows: sameWidth.slice(headerAt + 1),
    };
  }

  // Sugere quais colunas são data, descrição e valor, a partir dos nomes do cabeçalho.
  function autoMap(headers) {
    const h = headers.map(norm);
    const find = (...tests) => {
      for (const t of tests) {
        const i = h.findIndex((x) => (typeof t === 'string' ? x === t : t.test(x)));
        if (i >= 0) return i;
      }
      return -1;
    };

    const date = find(
      'data lancamento', 'data transacao', 'data da transacao', 'data', 'date',
      /^data (?!contabil)/, /^dt /, /date/
    );

    const descNames = new Set([
      'titulo', 'title', 'descricao', 'description', 'historico', 'memo', 'estabelecimento',
      'favorecido', 'beneficiario', 'detalhes', 'detalhe', 'lancamento', 'nome',
    ]);
    const desc = [];
    h.forEach((x, i) => { if (descNames.has(x) && i !== date && desc.length < 2) desc.push(i); });

    const credit = find(/^(entrada|credito|credit)/);
    const debit = find(/^(saida|debito|debit)/);
    let amount = { mode: 'single', column: -1, credit: -1, debit: -1 };
    if (credit >= 0 && debit >= 0 && credit !== debit) {
      amount = { mode: 'split', column: -1, credit, debit };
    } else {
      amount.column = find('valor', 'amount', 'quantia', 'montante', /^valor/, /valor/);
    }
    return { date, desc, amount };
  }

  function mappingIsComplete(mapping) {
    if (!mapping || mapping.date < 0) return false;
    const a = mapping.amount;
    return a.mode === 'split' ? a.credit >= 0 && a.debit >= 0 : a.column >= 0;
  }

  // Converte as linhas do CSV em lançamentos usando o mapeamento de colunas.
  function csvToItems(analysis, mapping) {
    if (!mappingIsComplete(mapping)) return { items: [], skipped: analysis.rows.length };
    const a = mapping.amount;
    const amountCols = a.mode === 'split' ? [a.credit, a.debit] : [a.column];
    const style = detectNumberStyle(analysis.rows.flatMap((r) => amountCols.map((c) => r[c])));

    const items = [];
    let skipped = 0;
    for (const r of analysis.rows) {
      const date = parseDate(r[mapping.date]);
      let signed = null;
      if (a.mode === 'split') {
        const credit = parseNumber(r[a.credit], style) || 0;
        const debit = parseNumber(r[a.debit], style) || 0;
        signed = Math.abs(credit) - Math.abs(debit);
        if (credit === 0 && debit === 0) signed = null;
      } else {
        signed = parseNumber(r[a.column], style);
      }
      if (!date || signed === null || signed === 0) { skipped++; continue; }
      const description = cleanDescription(
        mapping.desc.map((i) => r[i]).filter(Boolean).join(' - ')
      );
      items.push({ date, description, signed, externalId: null });
    }
    return { items, skipped };
  }

  /* ---------- OFX ---------- */

  function isOFX(text) {
    return /<OFX[\s>]/i.test(text) || /^\s*OFXHEADER:/i.test(text);
  }

  function decodeEntities(s) {
    return s
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'").replace(/&amp;/gi, '&');
  }

  function ofxTag(block, tag) {
    const m = block.match(new RegExp('<' + tag + '>([^<\\r\\n]*)', 'i'));
    return m ? decodeEntities(m[1].trim()) : '';
  }

  function parseOFX(text) {
    const account = ofxTag(text, 'ACCTID');
    const blocks = text.match(
      /<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>|$)/gi
    ) || [];

    const style = detectNumberStyle(blocks.map((b) => ofxTag(b, 'TRNAMT')));
    const seen = new Map();
    const items = [];
    let skipped = 0;

    for (const block of blocks) {
      const date = parseDate(ofxTag(block, 'DTPOSTED').replace(/^(\d{4})(\d{2})(\d{2}).*$/, '$1-$2-$3'));
      const signed = parseNumber(ofxTag(block, 'TRNAMT'), style);
      if (!date || signed === null || signed === 0) { skipped++; continue; }

      const name = ofxTag(block, 'NAME');
      const memo = ofxTag(block, 'MEMO');
      const description = cleanDescription(name && memo && name !== memo ? `${name} - ${memo}` : name || memo);

      let externalId = null;
      const fitid = ofxTag(block, 'FITID');
      if (fitid) {
        const base = `ofx:${account}:${fitid}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        externalId = n === 1 ? base : `${base}#${n}`;
      }
      items.push({ date, description, signed, externalId });
    }
    return { items, skipped };
  }

  /* ---------- PDF (extratos bancários em PDF) ----------
   * Sem mapeamento de colunas: cada banco tem um "schema" próprio (detect + parse),
   * já que o layout do PDF varia demais de banco para banco para uma heurística única.
   * app.js extrai o texto do PDF (pdf.js, linha a linha) e passa pra parsePDFStatement().
   */

  const MONEY_RE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}-?$/;
  const DOC_RE = /^(-|\d{4,})$/;
  const DATE_PREFIX_RE = /^(\d{2}\/\d{2})\s*(.*)$/;

  function isNumericOnly(s) {
    return /^[\d./-]+$/.test(s) && /\d/.test(s);
  }

  // Tira, do fim da linha, até dois valores monetários (movimento e saldo) e o número de
  // documento (ou "-") que normalmente vem logo antes. null se a linha não termina em valor.
  function splitTrailingValues(tokens) {
    const rest = tokens.slice();
    const vals = [];
    while (rest.length && MONEY_RE.test(rest[rest.length - 1]) && vals.length < 2) {
      vals.unshift(rest.pop());
    }
    if (!vals.length) return null;
    while (rest.length && DOC_RE.test(rest[rest.length - 1])) rest.pop();
    return { desc: rest.join(' '), movimento: vals[0], saldo: vals.length === 2 ? vals[1] : null };
  }

  // Extrato Santander (Select / Consolidado Inteligente): tabela "Conta Corrente > Movimentação",
  // com datas que não se repetem a cada linha e descrições quebradas em várias linhas.
  const SANTANDER_SCHEMA = {
    name: 'santander',
    detect: (text) => /extrato\s+consolidado\s+inteligente/i.test(text) && /santander/i.test(text),
    parse(text) {
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

      const monthYearLine = lines.slice(0, 8).find((l) => /^[a-zçãéô]+\/\d{4}$/i.test(l));
      const year = monthYearLine ? monthYearLine.split('/')[1] : String(new Date().getFullYear());

      const ccIdx = lines.findIndex((l) => /^conta corrente$/i.test(l));
      if (ccIdx < 0) return { items: [], skipped: 0 };
      let start = lines.findIndex((l, i) => i > ccIdx && /^movimenta[cç][aã]o$/i.test(l));
      if (start < 0) return { items: [], skipped: 0 };
      start++;

      const STOP_RE = /^(d[ée]bito autom[aá]tico|saldos por per[ií]odo|comprovantes de pagamento|investimentos|renda fixa)/i;
      const HEADER_RE = /^data\s+descri[cç][aã]o/i;
      const SALDO_RE = /^saldo em \d{2}\/\d{2}/i;

      let currentDate = null;
      let pendingDesc = '';
      let openingSeen = false;
      // Em "PIX ENVIADO"/"PIX RECEBIDO" o valor vem na mesma linha da descrição, e o
      // nome do favorecido só aparece DEPOIS, numa linha de continuação sem valor —
      // ao contrário dos outros tipos de lançamento, onde a descrição vem antes do
      // valor. lastPixIdx guarda o índice do último Pix fechado pra anexar esse nome.
      let lastPixIdx = -1;
      const items = [];
      let skipped = 0;

      for (let i = start; i < lines.length; i++) {
        const line = lines[i];
        if (STOP_RE.test(line)) break;
        if (HEADER_RE.test(line)) continue;
        if (SALDO_RE.test(line)) {
          if (!openingSeen) { openingSeen = true; continue; }
          break;
        }

        let rest = line;
        if (!pendingDesc) {
          const m = line.match(DATE_PREFIX_RE);
          if (m) { currentDate = parseDate(`${m[1]}/${year}`); rest = m[2]; lastPixIdx = -1; }
        }

        const tokens = rest.split(/\s+/).filter(Boolean);
        const split = tokens.length ? splitTrailingValues(tokens) : null;

        if (!split) {
          if (!rest || isNumericOnly(rest)) continue;
          if (!pendingDesc && lastPixIdx >= 0) {
            items[lastPixIdx].description = cleanDescription(`${items[lastPixIdx].description} ${rest}`);
            lastPixIdx = -1; // só uma linha de continuação (o nome do favorecido)
          } else {
            pendingDesc = pendingDesc ? `${pendingDesc} ${rest}` : rest;
          }
          continue;
        }

        const description = cleanDescription([pendingDesc, split.desc].filter(Boolean).join(' '));
        pendingDesc = '';
        const signed = parseNumber(split.movimento, 'comma');
        if (!currentDate || signed === null || signed === 0) { skipped++; lastPixIdx = -1; continue; }
        items.push({ date: currentDate, description, signed, externalId: null });
        lastPixIdx = /^pix (enviado|recebido)\b/i.test(description) ? items.length - 1 : -1;
      }
      return { items, skipped };
    },
  };

  const PDF_SCHEMAS = [SANTANDER_SCHEMA];

  // Devolve { items, skipped } se algum schema reconhecer o PDF, ou null se nenhum reconheceu.
  function parsePDFStatement(text) {
    for (const schema of PDF_SCHEMAS) {
      if (schema.detect(text)) return schema.parse(text);
    }
    return null;
  }

  /* ---------- Identificadores estáveis (CSV) ---------- */

  async function sha256Short(str) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // O mesmo arquivo gera sempre os mesmos ids. Linhas idênticas no mesmo dia (dois Pix
  // iguais, por exemplo) ganham sufixos diferentes (:1, :2) e continuam sendo duas linhas.
  async function withIds(items) {
    const counts = new Map();
    for (const item of items) {
      if (item.externalId) continue;
      const key = `${item.date}|${item.signed.toFixed(2)}|${norm(item.description)}`;
      const n = (counts.get(key) || 0) + 1;
      counts.set(key, n);
      item.externalId = `csv:${await sha256Short(key)}:${n}`;
    }
    return items;
  }

  /* ---------- Entrada única ---------- */

  // Lê o arquivo inteiro. Para OFX devolve os lançamentos; para CSV devolve a análise e
  // o mapeamento sugerido, e a tela chama csvToItems() a cada ajuste de colunas.
  function parseStatement(input) {
    const text = decodeBytes(input);
    if (isOFX(text)) {
      const { items, skipped } = parseOFX(text);
      return { kind: 'ofx', items, skipped };
    }
    const analysis = analyzeCSV(text);
    if (!analysis) return null;
    return { kind: 'csv', analysis, mapping: autoMap(analysis.headers) };
  }

  /* ---------- Apoio à tela ---------- */

  // Tipo e valor positivo de um lançamento, com ou sem inversão de sinais.
  function view(item, invert) {
    const signed = invert ? -item.signed : item.signed;
    return { type: signed > 0 ? 'income' : 'expense', amount: Math.abs(signed) };
  }

  // Chave para sugerir categoria: as 3 primeiras palavras, sem números nem acentos.
  function descriptionKey(description) {
    return norm(description).replace(/\d+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  }

  /* ---------- Duplicados entre arquivos ---------- */

  const isStatementId = (id) => typeof id === 'string' && (id.startsWith('csv:') || id.startsWith('ofx:'));
  const sameKey = (date, type, amount) => `${date}|${type}|${Number(amount).toFixed(2)}`;

  /*
   * O mesmo extrato em OFX e em CSV gera ids diferentes, então o id sozinho não pega a repetição.
   * Aqui compara data, tipo e valor com o que já veio de extratos (existing: linhas do banco com
   * external_id csv:/ofx:), respeitando a quantidade: se o banco já tem 2 lançamentos de R$ 5 no
   * dia, só os 2 primeiros do arquivo são considerados repetidos e um terceiro legítimo entra.
   * Devolve o conjunto de índices de items que já existem.
   */
  function crossDuplicates(items, existing, invert) {
    const rows = existing.filter((r) => isStatementId(r.external_id));
    const counts = new Map();
    for (const r of rows) {
      const k = sameKey(r.occurred_on, r.type, r.amount);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const ids = new Set(rows.map((r) => r.external_id));
    const keyOf = (item) => {
      const v = view(item, invert);
      return sameKey(item.date, v.type, v.amount);
    };
    // quem já bate pelo id usa a sua própria linha do banco
    for (const item of items) {
      if (!ids.has(item.externalId)) continue;
      const k = keyOf(item);
      if (counts.get(k) > 0) counts.set(k, counts.get(k) - 1);
    }
    const out = new Set();
    items.forEach((item, i) => {
      if (ids.has(item.externalId)) return;
      const k = keyOf(item);
      if (counts.get(k) > 0) {
        counts.set(k, counts.get(k) - 1);
        out.add(i);
      }
    });
    return out;
  }

  /*
   * Duplicados que já estão salvos: mesma data, tipo e valor vindos de formatos diferentes (csv x ofx).
   * Mantém as linhas do formato com mais lançamentos (empate: o mais antigo) e devolve os ids das
   * outras que têm par, sem passar da quantidade mantida.
   */
  function findImportedDuplicates(rows) {
    const groups = new Map();
    for (const r of rows) {
      if (!isStatementId(r.external_id)) continue;
      const k = sameKey(r.occurred_on, r.type, r.amount);
      if (!groups.has(k)) groups.set(k, new Map());
      const src = r.external_id.slice(0, 3);
      const bySrc = groups.get(k);
      if (!bySrc.has(src)) bySrc.set(src, []);
      bySrc.get(src).push(r);
    }
    const remove = [];
    for (const bySrc of groups.values()) {
      if (bySrc.size < 2) continue;
      const list = [...bySrc.values()].sort((a, b) =>
        b.length - a.length || String(a[0].created_at).localeCompare(String(b[0].created_at)));
      const keep = list[0];
      const others = list.slice(1).flat().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      remove.push(...others.slice(0, Math.min(others.length, keep.length)).map((r) => r.id));
    }
    return remove;
  }

  return {
    crossDuplicates, findImportedDuplicates,
    decodeBytes, parseDate, parseNumber, detectNumberStyle, analyzeCSV, autoMap,
    mappingIsComplete, csvToItems, isOFX, parseOFX, withIds, parseStatement, view,
    descriptionKey, parsePDFStatement,
  };
});
