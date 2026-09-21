import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Portals keep tools above the independently scrolling score/editor panes.
// Only deliberate button activation opens them; selection never changes layout.
export default function WorkspaceMenu({ label, children, wide = false }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ visibility: 'hidden' });
  const trigger = useRef(null);
  const panel = useRef(null);
  const id = useId();
  const close = () => setOpen(false);
  useLayoutEffect(() => {
    if (!open) return;
    const box = trigger.current.getBoundingClientRect();
    const width = Math.min(wide ? 460 : 320, window.innerWidth - 24);
    const below = window.innerHeight - box.bottom - 16;
    const above = box.top - 16;
    const upwards = below < Math.min(panel.current.scrollHeight, 260) && above > below;
    setPosition({ width, left: Math.max(12, Math.min(box.left, window.innerWidth - width - 12)),
      ...(upwards ? { bottom: window.innerHeight - box.top + 6 } : { top: box.bottom + 6 }),
      maxHeight: Math.max(80, upwards ? above : below) });
    panel.current.querySelector('button, input, select, a')?.focus({ preventScroll: true });
  }, [open, wide]);
  useEffect(() => {
    if (!open) return;
    const outside = event => {
      if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close();
    };
    const escape = event => {
      if (event.key === 'Escape') { close(); trigger.current?.focus({ preventScroll: true }); }
    };
    const scroll = event => {
      // Playback may scroll the score while a sound control is being adjusted.
      // Only scrolling the trigger's ancestors invalidates its screen position.
      if (event.target === document || event.target === window || event.target?.contains?.(trigger.current)) close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('focusin', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);
  return <>
    <button type="button" ref={trigger} className="workspace-tool-toggle" aria-expanded={open}
      aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>{label} <span aria-hidden="true">▾</span></button>
    {open && createPortal(<div ref={panel} id={id} className="workspace-tool-popover" role="region" aria-label={label}
      style={position} onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') { close(); trigger.current?.focus({ preventScroll: true }); }
      }}>
      {typeof children === 'function' ? children(close) : children}
      <button type="button" className="workspace-tool-close" onClick={() => { close(); trigger.current?.focus({ preventScroll: true }); }}>Close {label.toLowerCase()}</button>
    </div>, document.body)}
  </>;
}
