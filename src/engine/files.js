// files.js — M2 "keep your music".
// Engine rules: plain JS, no React, no DOM. Every browser surface
// (localStorage, File System Access pickers, download) is injected by the
// shell, so this whole module runs — and is smoked — in bare node.
//
// Three seams:
//   ensureIdentity(text, clock)  — pure text transform: id/created/modified
//   createStore(storage, clock)  — autosave slot + recents + per-id snapshots
//   createFileIO(env)            — FSA when available, download fallback

// ---------------------------------------------------------------------------
// Identity maintenance
// ---------------------------------------------------------------------------

const DIRECTIVE_RE = /^([A-Za-z][A-Za-z0-9_-]*):\s?(.*)$/;

/**
 * Locate the header region of a document.
 * Two forms:
 *   fenced   — line 1 is exactly `---`; header is everything until the
 *              closing `---` line (frontmatter, the .md convention).
 *   unfenced — the leading run of `key: value` lines; ends at the first
 *              blank or non-directive line. Mid-document directives
 *              (tal: free) are body, never header.
 * Returns { kind, start, end } as line indices into text.split('\n'):
 * header directive lines occupy [start, end) — for fenced form the fences
 * themselves sit at start-1 and end.
 */
function findHeader(lines) {
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') return { kind: 'fenced', start: 1, end: i };
    }
    // unclosed fence: treat as unfenced to avoid eating the document
  }
  let end = 0;
  while (end < lines.length && DIRECTIVE_RE.test(lines[end])) end++;
  return { kind: 'unfenced', start: 0, end };
}

/**
 * Ensure the identity directives exist and are current.
 *  - inserts `id:` (clock.uuid()) and `created:` (clock.now()) if missing
 *  - sets `modified:` to clock.now(), inserting it if missing
 *  - touches nothing else — the body is preserved byte-identically
 * Call on explicit save only (autosave never mutates the text).
 *
 * @param {string} text
 * @param {{now: () => string, uuid: () => string}} clock  injected for
 *        determinism; shell passes {now: () => new Date().toISOString(),
 *        uuid: () => crypto.randomUUID()}
 * @returns {{text: string, changed: boolean, id: string}}
 */
export function ensureIdentity(text, clock) {
  const lines = text.split('\n');
  const header = findHeader(lines);

  // Read existing identity out of the header region.
  const existing = {};
  for (let i = header.start; i < header.end; i++) {
    const m = lines[i].match(DIRECTIVE_RE);
    if (m && (m[1] === 'id' || m[1] === 'created' || m[1] === 'modified')) {
      existing[m[1]] = { line: i, value: m[2] };
    }
  }

  const id = existing.id ? existing.id.value : clock.uuid();
  const created = existing.created ? existing.created.value : clock.now();
  const modified = clock.now();

  const out = lines.slice();
  let changed = false;

  if (existing.modified) {
    if (existing.modified.value !== modified) {
      out[existing.modified.line] = `modified: ${modified}`;
      changed = true;
    }
  }

  // Missing directives are appended at the end of the header region, in
  // id / created / modified order. Collect then splice once so line
  // indices stay valid.
  const missing = [];
  if (!existing.id) missing.push(`id: ${id}`);
  if (!existing.created) missing.push(`created: ${created}`);
  if (!existing.modified) missing.push(`modified: ${modified}`);

  if (missing.length > 0) {
    changed = true;
    if (header.kind === 'unfenced' && header.end === 0) {
      // Headerless document: prepend a header block plus a separating
      // blank line (unless the document is empty).
      const sep = out.length > 0 && out[0] !== '' ? [''] : [];
      out.splice(0, 0, ...missing, ...sep);
    } else {
      out.splice(header.end, 0, ...missing);
    }
  }

  return { text: out.join('\n'), changed, id };
}


/**
 * Surgically set one header directive — replace in place if present,
 * append at the end of the header (inside frontmatter fences when the
 * document uses them) if absent. Body stays byte-identical. Built for the
 * transport's BPM knob (M, 2026-07-16: `tempo:` IS the playback speed;
 * `laya:` carries the tradition's word) — but generic over any key.
 *
 * @returns {{text: string, changed: boolean}}
 */
export function setDirective(text, key, value) {
  const lines = text.split('\n');
  const header = findHeader(lines);
  const want = `${key}: ${value}`;

  for (let i = header.start; i < header.end; i++) {
    const m = lines[i].match(DIRECTIVE_RE);
    if (m && m[1] === key) {
      if (lines[i] === want) return { text, changed: false };
      const out = lines.slice();
      out[i] = want;
      return { text: out.join('\n'), changed: true };
    }
  }

  const out = lines.slice();
  if (header.kind === 'unfenced' && header.end === 0) {
    const sep = out.length > 0 && out[0] !== '' ? [''] : [];
    out.splice(0, 0, want, ...sep);
  } else {
    out.splice(header.end, 0, want);
  }
  return { text: out.join('\n'), changed: true };
}

// ---------------------------------------------------------------------------
// Store — autosave slot, recents, per-id snapshots
// ---------------------------------------------------------------------------

const KEY_CURRENT = 'sargam.current';
const KEY_RECENTS = 'sargam.recents';
const KEY_SNAP = (id) => `sargam.snap.${id}`;
const KEY_PREF = (k) => `sargam.pref.${k}`;
const MAX_RECENTS = 10;

function readJSON(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch {
    // Corrupt data narrates as absence; the shell reports "couldn't
    // restore" rather than the app dying on a bad byte.
    try { storage.removeItem(key); } catch { /* storage itself hostile */ }
    return null;
  }
}

function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // quota/security errors surface as a false the shell narrates
  }
}

/**
 * @param {{getItem, setItem, removeItem}} storage  localStorage-shaped
 * @param {{now: () => string}} clock
 */
export function createStore(storage, clock) {
  return {
    // -- the live autosave slot (crash protection; text stored as-is) --
    saveCurrent(text) {
      return writeJSON(storage, KEY_CURRENT, { text, savedAt: clock.now() });
    },
    loadCurrent() {
      const v = readJSON(storage, KEY_CURRENT);
      return v && typeof v.text === 'string' ? v : null;
    },
    clearCurrent() {
      try { storage.removeItem(KEY_CURRENT); } catch { /* narrated upstream */ }
    },

    // -- recents (deduped by id, newest first, capped) --
    recordRecent({ id, title, name }) {
      const list = readJSON(storage, KEY_RECENTS) || [];
      const kept = list.filter((r) => r && r.id !== id);
      kept.unshift({ id, title: title || null, name: name || null, at: clock.now() });
      const dropped = kept.splice(MAX_RECENTS);
      for (const r of dropped) {
        try { storage.removeItem(KEY_SNAP(r.id)); } catch { /* best effort */ }
      }
      return writeJSON(storage, KEY_RECENTS, kept);
    },
    listRecents() {
      const list = readJSON(storage, KEY_RECENTS);
      return Array.isArray(list) ? list : [];
    },
    removeRecent(id) {
      const list = readJSON(storage, KEY_RECENTS) || [];
      writeJSON(storage, KEY_RECENTS, list.filter((r) => r && r.id !== id));
      try { storage.removeItem(KEY_SNAP(id)); } catch { /* best effort */ }
    },

    // -- per-id snapshots (what a recent entry restores from in v1) --
    saveSnapshot(id, text) {
      return writeJSON(storage, KEY_SNAP(id), { text });
    },
    loadSnapshot(id) {
      const v = readJSON(storage, KEY_SNAP(id));
      return v && typeof v.text === 'string' ? v.text : null;
    },

    // -- small UI preferences (layout toggle now; M3 transport later) --
    setPref(key, value) {
      return writeJSON(storage, KEY_PREF(key), { value });
    },
    getPref(key, fallback = null) {
      const v = readJSON(storage, KEY_PREF(key));
      return v && 'value' in v ? v.value : fallback;
    },
  };
}

// ---------------------------------------------------------------------------
// New-document text (spec §3.1 form, M2.5)
// ---------------------------------------------------------------------------

// Canonical directive order for a new document — mirrors serialize.js's
// KNOWN_KEYS so the form's preview and the app's canonical output agree.
const NEW_DOC_KEYS = ['title', 'raga', 'tal', 'sa', 'tempo', 'composition', 'type', 'laya'];

/**
 * Build a new document's text from the form's fields (spec §3.1).
 * Every field is optional; blanks are dropped rather than emitted empty.
 * Nothing filled → a blank document (no empty fences).
 * Fenced (frontmatter) form: new documents are Obsidian-ready by default.
 *
 * @param {{title?, raga?, tal?, sa?, tempo?, composition?, type?, laya?}} fields
 * @returns {string}
 */
export function newDocumentText(fields = {}) {
  const lines = [];
  for (const k of NEW_DOC_KEYS) {
    const raw = fields[k];
    if (raw === undefined || raw === null) continue;
    const v = String(raw).trim();
    if (v === '') continue;
    lines.push(`${k}: ${v}`);
  }
  if (lines.length === 0) return '';
  return ['---', ...lines, '---', '', ''].join('\n');
}

// ---------------------------------------------------------------------------
// File I/O — FSA in Chrome, download fallback in Safari
// ---------------------------------------------------------------------------

const MD_TYPES = [
  {
    description: 'Sargam notation',
    accept: { 'text/markdown': ['.md'], 'text/plain': ['.txt'] },
  },
];

function isAbort(err) {
  return err && err.name === 'AbortError';
}

/**
 * @param {{fsa: {open, save}|null, download: (name, text) => void}} env
 *   fsa.open — showOpenFilePicker-shaped (async, returns [handle], throws
 *              AbortError on cancel)
 *   fsa.save — showSaveFilePicker-shaped (async, returns handle)
 *   download — shell-provided anchor-download implementation (the one DOM
 *              touch lives in the shell, keeping the engine pure)
 */
export function createFileIO(env) {
  const supportsFSA = !!(env.fsa && env.fsa.open && env.fsa.save);

  return {
    supportsFSA,

    /** → {text, name, handle|null} | null on cancel/unavailable */
    async open() {
      if (!supportsFSA) return null; // shell falls back to <input type=file>
      try {
        const [handle] = await env.fsa.open({ types: MD_TYPES, multiple: false });
        if (!handle) return null;
        const file = await handle.getFile();
        const text = await file.text();
        return { text, name: file.name || handle.name, handle };
      } catch (err) {
        if (isAbort(err)) return null;
        throw err; // real failures narrate in the shell, not vanish here
      }
    },

    /**
     * → {handle|null, name, method: 'fsa'|'download'} | null on cancel.
     * FSA with a handle: write in place. FSA without: save picker, then
     * write. No FSA (Safari): env.download — each save is a downloaded
     * copy, and the UI says so.
     */
    async save(text, { handle = null, suggestedName } = {}) {
      const name = suggestedName || (handle && handle.name) || 'untitled.md';

      if (supportsFSA) {
        try {
          let target = handle;
          if (!target) {
            target = await env.fsa.save({ types: MD_TYPES, suggestedName: name });
          }
          const writable = await target.createWritable();
          await writable.write(text);
          await writable.close();
          return { handle: target, name: target.name || name, method: 'fsa' };
        } catch (err) {
          if (isAbort(err)) return null;
          throw err;
        }
      }

      env.download(name, text);
      return { handle: null, name, method: 'download' };
    },
  };
}
