// Keep the editor's selection live, but let surrounding UI catch up only after
// a pointer gesture ends. Score reveals and growing control lists must not
// compete with CodeMirror's drag-selection and edge scrolling.
export function editorSelectionSync(view, publish) {
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  let pointer = null;
  let frame = null;
  let dirty = false;
  let disposed = false;

  function flush() {
    frame = null;
    pointer = null;
    if (disposed || !dirty) return;
    dirty = false;
    publish(view.state);
  }
  function cancelFrame() {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = null;
  }
  function begin(event) {
    if (event.button !== 0 || event.isPrimary === false) return;
    cancelFrame();
    pointer = event.pointerId;
  }
  function end(event) {
    if (pointer === null || event.pointerId !== pointer) return;
    cancelFrame();
    // Pointerup precedes CodeMirror's final mouseup transaction. Read the live
    // selection next frame, including a release outside the editor.
    frame = win.requestAnimationFrame(flush);
  }
  function finish() {
    cancelFrame();
    flush();
  }
  view.dom.addEventListener('pointerdown', begin, true);
  doc.addEventListener('pointerup', end, true);
  doc.addEventListener('pointercancel', end, true);
  win.addEventListener('blur', finish);
  // Keyboard selections should never wait for a missing pointer release.
  view.dom.addEventListener('keydown', finish, true);
  return {
    update() {
      if (disposed) return;
      dirty = true;
      if (pointer === null) flush();
    },
    destroy() {
      disposed = true;
      cancelFrame();
      view.dom.removeEventListener('pointerdown', begin, true);
      doc.removeEventListener('pointerup', end, true);
      doc.removeEventListener('pointercancel', end, true);
      win.removeEventListener('blur', finish);
      view.dom.removeEventListener('keydown', finish, true);
    },
  };
}
