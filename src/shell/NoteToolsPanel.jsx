import React from 'react';

export default function NoteToolsPanel({ open, children }) {
  return <section id="notation-note-tools" className="app-note-tools" hidden={!open}
    aria-label="Note tools" tabIndex={0}>
    {open ? children : null}
  </section>;
}
