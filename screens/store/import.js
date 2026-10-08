/* Store Setup · contacts from a file (both pages). Pure logic, no DOM, so the
   headless tests run it in node.

   A computer has no phone contact list, but it has files (1 Oct 2026):
   - .vcf: a phone's contacts backup, or Google / iCloud Contacts' export;
   - .csv: Google Contacts' or Outlook's export, or any list with a name and
     a number column;
   - .xlsx: the customer list he keeps in Excel (its first sheet).
   Each comes back as [{ name, phone }], one per person, the mobile picked
   when a person has several numbers.
   - A ledger list from Tally, Busy, Marg or Vyapar (as Excel or CSV): its
     group column ("Under": Sundry Debtors, Sundry Creditors…) says who is a
     customer and who a supplier, so they arrive sorted; banks, taxes and
     expense ledgers are left out. Title rows above the header are skipped.
   - Pasted text (fromText): rows copied from Excel, a list from WhatsApp or
     notes, or vCards -- whatever he presses Ctrl+V on. */

(function (root) {
  "use strict";

  const M = typeof module !== "undefined" && module.exports ? require("./model.js") : root.FB_MODEL;

  /* Of a person's numbers, the mobile (10 digits from 6-9); else the first. */
  function pickPhone(list) {
    const nums = list.map(function (x) { return String(x || "").trim(); }).filter(Boolean);
    const mob = nums.find(function (x) { const d = M.phone10(x); return d.length === 10 && /^[6-9]/.test(d); });
    const raw = mob || nums[0] || "";
    return M.phone10(raw) || raw;
  }

  /* ── vCard ── */

  /* Android's backup writes names in quoted-printable UTF-8 (=E0=A4=B6…). */
  function unQP(s) {
    const bytes = [];
    s = s.replace(/=\r?\n/g, "");
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else bytes.push(s.charCodeAt(i) & 0xff);
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
  function unEsc(s) { return s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim(); }

  function parseVcf(text) {
    /* Folded lines (a space or tab at the start) join the line above; QP soft breaks too. */
    const lines = String(text || "").replace(/=\r?\n/g, "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
    const out = [];
    let cur = null;
    lines.forEach(function (line) {
      if (/^BEGIN:VCARD/i.test(line)) { cur = { fn: "", n: "", tels: [] }; return; }
      if (!cur) return;
      if (/^END:VCARD/i.test(line)) {
        const name = cur.fn || cur.n;
        const phone = pickPhone(cur.tels);
        if (name || phone) out.push({ name: name || phone, phone: phone });
        cur = null;
        return;
      }
      const i = line.indexOf(":");
      if (i < 0) return;
      const head = line.slice(0, i), val = line.slice(i + 1);
      const key = head.split(";")[0].replace(/^item\d+\./i, "").toUpperCase();
      const v = /ENCODING=QUOTED-PRINTABLE/i.test(head) ? unQP(val) : val;
      if (key === "FN") cur.fn = unEsc(v);
      else if (key === "N" && !cur.n) cur.n = v.split(";").slice(0, 3).reverse().map(unEsc).filter(Boolean).join(" ");
      else if (key === "TEL") cur.tels.push(v.replace(/^tel:/i, ""));
    });
    return out;
  }

  /* ── tables: CSV and Excel ── */

  function parseCsv(text) {
    text = String(text || "").replace(/^﻿/, "");
    const first = text.split(/\r?\n/)[0] || "";
    const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : ",";
    const rows = [];
    let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
  }

  const NAME_H = /^(name|full ?name|display ?name|contact ?name|customer|customer ?name|party|party ?name|shop|shop ?name|firm|store|नाम|particulars|ledger|ledger ?name|name ?of ?(the )?ledger|account|account ?name|a\/c ?name)$/i;
  const FIRST_H = /^(first ?name|given ?name)$/i, LAST_H = /^(last ?name|family ?name|surname)$/i;
  const ORG_H = /^(organi[sz]ation ?(1 - )?name|company)$/i;
  const PHONE_H = /(phone|mobile|mob\.?|cell|tel|contact ?no|number|whatsapp|फ़ोन|मोबाइल)/i;
  const PHONE_LABEL_H = /(type|label)$/i;
  const NOT_PHONE_H = /(gst|pan|ifsc|bank|account|a\/c|pin|aadhaa?r)/i;
  /* Tally's "Under", Busy's "Group", Vyapar's "Party type": who this ledger is. */
  const GROUP_H = /^(under|group|group ?name|parent|parent ?group|account ?group|ledger ?group|party ?type|type|category|customer ?type|ग्रुप|समूह)$/i;
  function groupType(v) {
    v = String(v || "").toLowerCase();
    if (!v) return null;
    if (/debtor|customer|buyer|retail|shop|dealer|outlet|ग्राहक/.test(v)) return "shop";
    if (/creditor|supplier|vendor|manufacturer|सप्लायर/.test(v)) return "supplier";
    if (/staff|employee|salesm[ae]n|driver|salary|कर्मचारी/.test(v)) return "staff";
    /* A ledger that is not a person: banks, cash, taxes, sales and purchase accounts, expenses... */
    if (/bank|cash|tax|duties|gst|expense|income|sales|purchase|capital|loan|asset|stock|provision|reserve|deposit|suspense|profit|branch|investment|liabilit|od a\/c|cc a\/c/.test(v)) return "skip";
    return null;
  }
  const isHeadRow = function (r) {
    let hits = 0;
    r.forEach(function (x) { if (NAME_H.test(x) || FIRST_H.test(x) || GROUP_H.test(x) || (PHONE_H.test(x) && !NOT_PHONE_H.test(x))) hits++; });
    return hits;
  };

  function digits(s) { return String(s || "").replace(/\D/g, "").length; }
  function looksPhone(s) { const n = digits(s); return n >= 8 && n <= 13 && !/[a-z]{3}/i.test(String(s)); }

  /* Numbers in one cell: Google puts "98… ::: 99…", others a comma or slash. */
  function cellPhones(s) { return String(s || "").split(/\s*(?::::|[,;/|])\s*/).filter(looksPhone); }

  /* A table (rows of cells) → people. With a header row, its names say which
     columns hold what; without one, the column that is mostly numbers is the
     phone and the first mostly-words column is the name. */
  function fromTable(rows) {
    rows = rows.map(function (r) { return r.map(function (x) { return String(x == null ? "" : x).trim(); }); });
    /* Tally and Busy put the firm's name and the report title above the header: start at the header. */
    for (let i = 1; i < Math.min(rows.length, 12); i++) {
      if (!isHeadRow(rows[0]) && isHeadRow(rows[i]) >= 1 && (isHeadRow(rows[i]) >= 2 || rows.slice(0, i).every(function (r) { return r.filter(Boolean).length <= 1; }))) { rows = rows.slice(i); break; }
    }
    if (!rows.length) return [];
    const head = rows[0];
    let name = -1, first = -1, last = -1, org = -1, group = -1;
    const phones = [];
    head.forEach(function (hd, i) {
      if (NAME_H.test(hd)) { if (name < 0) name = i; }
      else if (FIRST_H.test(hd)) first = i;
      else if (LAST_H.test(hd)) last = i;
      else if (ORG_H.test(hd)) org = i;
      else if (GROUP_H.test(hd)) { if (group < 0) group = i; }
      else if (PHONE_H.test(hd) && !PHONE_LABEL_H.test(hd) && !NOT_PHONE_H.test(hd)) phones.push(i);
    });
    let body = rows.slice(1);
    const w = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    const share = function (list, i, fn) { const vals = list.map(function (r) { return r[i] || ""; }).filter(Boolean); return vals.length ? vals.filter(fn).length / vals.length : 0; };
    /* A name column we know but a number column we don't ("Party", "Cell no."): the numbers say which. */
    if ((name >= 0 || first >= 0 || org >= 0) && !phones.length) {
      for (let i = 0; i < w; i++) if ([name, first, last, org, group].indexOf(i) < 0 && share(body, i, looksPhone) > 0.6) phones.push(i);
    }
    if (name < 0 && first < 0 && org < 0 && !phones.length) {
      /* No header we know: guess from what the cells hold. */
      body = rows;
      for (let i = 0; i < w; i++) if (share(rows, i, looksPhone) > 0.6) phones.push(i);
      for (let i = 0; i < w; i++) if (phones.indexOf(i) < 0 && share(rows, i, function (v) { return /[a-zऀ-ॿ]/i.test(v); }) > 0.6) { name = i; break; }
      if (!phones.length && name < 0) return [];
      /* A first row of labels we did not know ("Party", "Cell") is not a person. */
      if (rows[0] && !phones.some(function (i) { return looksPhone(rows[0][i]); })) body = rows.slice(1);
    }
    const out = [];
    body.forEach(function (r) {
      let nm = name >= 0 ? r[name] : [first >= 0 ? r[first] : "", last >= 0 ? r[last] : ""].filter(Boolean).join(" ");
      if (!nm && org >= 0) nm = r[org];
      const phone = pickPhone([].concat.apply([], phones.map(function (i) { return cellPhones(r[i]); })));
      if (!nm && !phone) return;
      const type = group >= 0 ? groupType(r[group]) : null;
      if (type === "skip") return;
      /* Tally's totals and group rows ("Sundry Debtors" itself, "Grand Total") are not people. */
      if (!phone && /^(grand )?total$|^sundry (debtors|creditors)$/i.test(nm)) return;
      out.push(type ? { name: nm || phone, phone: phone, type: type } : { name: nm || phone, phone: phone });
    });
    return out;
  }

  /* ── Excel (.xlsx): its first sheet, as rows ── */

  async function inflate(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }

  /* A zip's files by name, stored or deflated (Excel deflates). */
  async function unzip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let e = bytes.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("not_zip");
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const out = {};
    for (let i = 0; i < count; i++) {
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nlen));
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      const raw = bytes.subarray(start, start + csize);
      if (method === 0) out[name] = raw;
      else if (method === 8) out[name] = await inflate(raw);
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }

  function xmlText(s) {
    return s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, "&");
  }
  function colIndex(ref) {
    const letters = String(ref).replace(/\d+/g, "");
    let n = 0;
    for (let i = 0; i < letters.length; i++) n = n * 26 + letters.charCodeAt(i) - 64;
    return n - 1;
  }

  async function xlsxRows(bytes) {
    const files = await unzip(bytes);
    const dec = function (k) { return files[k] ? new TextDecoder().decode(files[k]) : ""; };
    const shared = (dec("xl/sharedStrings.xml").match(/<si>[\s\S]*?<\/si>/g) || []).map(function (si) {
      return (si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map(xmlText).join("");
    });
    const sheetName = Object.keys(files).filter(function (k) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(k); })
      .sort(function (a, b) { return parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10); })[0];
    if (!sheetName) return [];
    const rows = [];
    (dec(sheetName).match(/<row[^>]*>[\s\S]*?<\/row>|<row[^>]*\/>/g) || []).forEach(function (rx) {
      const row = [];
      (rx.match(/<c [^>]*\/>|<c [^>]*>[\s\S]*?<\/c>/g) || []).forEach(function (cx) {
        const ref = (cx.match(/ r="([A-Z]+\d+)"/) || [])[1];
        const type = (cx.match(/ t="(\w+)"/) || [])[1];
        const v = (cx.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = "";
        if (type === "s" && v != null) val = shared[+v] || "";
        else if (type === "inlineStr") val = xmlText((cx.match(/<is>[\s\S]*?<\/is>/) || [""])[0]);
        else if (v != null) val = xmlText(v);
        /* A phone typed as a number can come back as 9.8200112E9. */
        if (/^\d(\.\d+)?E\+?\d+$/i.test(val)) val = String(Math.round(Number(val)));
        row[ref ? colIndex(ref) : row.length] = val;
      });
      rows.push(Array.from(row, function (x) { return x == null ? "" : x; }));
    });
    return rows;
  }

  /* ── pasted text ── */

  /* A phone number inside a line of text: 10 digits from 6-9, with +91 / 0 / spaces / dashes allowed. */
  /* v11: a typed number follows the sign-in rule (M.phoneOk: 7–10 digits, any first digit; +91 or 0 in front) — it was 6–9 only,
     so "Raju 3453453445" was not read and became a comment. Never the middle of a longer number. */
  const PHONE_IN = /(?<!\d)(?:\+?91[\s-]?|0)?\d(?:[\s-]?\d){6,9}(?![\s-]?\d)/;
  function lineName(s) {
    return s.replace(/^\s*\[[^\]]{4,30}\]\s*/, "")         // a WhatsApp timestamp "[01/10/26, 9:30 pm]"
      .replace(/^\s*(\d{1,4}[.)]|[-•*–])\s+/, "")           // a list mark "1." "-" "•"
      .replace(/(mob(ile)?|ph(one)?|cell|tel|contact|no)\.?\s*[:.-]?\s*$/i, "")
      .replace(/[\s:,;|()–-]+$/, "").replace(/^[\s:,;|()–-]+/, "").replace(/\s+/g, " ").trim();
  }

  /* Whatever he pasted → [{ name, phone }]: rows from Excel (tabs), a CSV with its header, vCards,
     or plain lines with a name and a number on each (or the number on the line under the name). */
  function fromText(text) {
    text = String(text || "").replace(/\r\n?/g, "\n").trim();
    if (!text) return [];
    if (/BEGIN:VCARD/i.test(text)) return parseVcf(text);
    const lines = text.split("\n").filter(function (l) { return l.trim(); });
    const tabbed = lines.filter(function (l) { return l.indexOf("\t") >= 0; }).length;
    if (tabbed && tabbed >= lines.length / 2) return fromTable(parseCsv(text));
    if (lines.length > 1 && isHeadRow(parseCsv(lines[0])[0] || []) >= 2) return fromTable(parseCsv(text));
    const out = [];
    let pending = "";
    lines.forEach(function (l) {
      const m = l.match(PHONE_IN);
      if (!m) { pending = lineName(l); return; }
      const nm = lineName(l.replace(m[0], " "));
      const phone = M.phone10(m[0]) || m[0].replace(/\D/g, "");
      out.push({ name: nm || pending || phone, phone: phone });
      pending = "";
    });
    return out;
  }

  /* One file → { kind: "vcf" | "csv" | "xlsx" | null, people }. kind null: not a contacts file we read. */
  async function readFile(name, bytes) {
    const ext = (String(name).toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1];
    if (ext === "vcf" || ext === "vcard") return { kind: "vcf", people: parseVcf(new TextDecoder().decode(bytes)) };
    if (ext === "csv" || ext === "tsv") return { kind: "csv", people: fromTable(parseCsv(new TextDecoder().decode(bytes))) };
    if (ext === "txt") return { kind: "csv", people: fromText(new TextDecoder().decode(bytes)) };
    if (ext === "xlsx") return { kind: "xlsx", people: fromTable(await xlsxRows(bytes)) };
    return { kind: null, people: [] };
  }

  const api = { parseVcf: parseVcf, parseCsv: parseCsv, fromTable: fromTable, xlsxRows: xlsxRows, readFile: readFile, pickPhone: pickPhone, fromText: fromText, groupType: groupType };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FB_IMPORT = api;
})(typeof window !== "undefined" ? window : globalThis);
