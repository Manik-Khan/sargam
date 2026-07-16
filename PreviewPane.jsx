// src/shell/PreviewPane.jsx — mounts the engine's detached DOM in a ref
// and swaps it per parse (plan Wave 3). React never reaches inside;
// render.js owns everything below the mount point.

import React, { useEffect, useRef } from 'react';
import { renderDocument } from '../engine/render.js';

export default function PreviewPane({ doc }) {
  const mount = useRef(null);

  useEffect(() => {
    if (!mount.current) return;
    const el = renderDocument(doc);
    mount.current.replaceChildren(el);
  }, [doc]);

  return <div className="app-preview" ref={mount} />;
}
