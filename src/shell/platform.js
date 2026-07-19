// src/shell/platform.js — browser adapters injected into the engine's
// files.js seams. This is deliberately the ONLY place the file system,
// clock, and DOM download shim are real; the engine stays pure and the
// smokes run in bare node with mocks.

/** Clock for ensureIdentity/createStore: real time, real UUIDs. */
export function makeClock() {
  return {
    now: () => new Date().toISOString(),
    uuid: () =>
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : // last-resort fallback (very old engines): timestamp + random
          `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

/** Env for createFileIO: FSA pickers when the browser has them (Chrome),
 *  null otherwise (Safari), plus the anchor-download shim. */
export function makeEnv() {
  const hasFSA =
    typeof window.showOpenFilePicker === 'function' &&
    typeof window.showSaveFilePicker === 'function';
  return {
    fsa: hasFSA
      ? {
          open: (opts) => window.showOpenFilePicker(opts),
          save: (opts) => window.showSaveFilePicker(opts),
        }
      : null,
    download,
  };
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open fallback for browsers without FSA: a transient <input type=file>.
 *  Resolves null on cancel (browsers with the 'cancel' event) — worst case
 *  in older engines the promise simply never resolves, which is inert. */
export function openViaInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.txt,text/markdown,text/plain';
    input.style.display = 'none';
    input.onchange = () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve({ text: String(r.result), name: f.name, handle: null });
      r.onerror = () => resolve(null);
      r.readAsText(f);
    };
    input.oncancel = () => {
      input.remove();
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

/** Audio env for createPlayer: the real AudioContext, lazily. */
export function makeAudioEnv() {
  const fetchChecked = async (url) => {
    const response = await window.fetch(url);
    if (!response.ok) throw new Error(`Could not load audio asset: ${url}`);
    return response;
  };

  return {
    createContext: () => new (window.AudioContext || window.webkitAudioContext)(),
    fetchArrayBuffer: async (url) => (await fetchChecked(url)).arrayBuffer(),
    fetchText: async (url) => (await fetchChecked(url)).text(),
    importModule: (url) => import(/* @vite-ignore */ url),
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}
