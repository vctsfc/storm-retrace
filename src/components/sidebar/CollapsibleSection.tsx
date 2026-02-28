/**
 * Collapsible sidebar section.
 *
 * Wraps sidebar content in a section with a clickable header that
 * toggles visibility. Open/closed state is persisted to localStorage
 * so sections stay where the user left them across page reloads.
 */

import { useState, useCallback, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  /** Section title displayed in the header */
  title: string;
  /** Unique key for persisting open/closed state */
  storageKey: string;
  /** Whether the section starts open (default: true) */
  defaultOpen?: boolean;
  /** Child content rendered when open */
  children: ReactNode;
}

function getStoredState(key: string, defaultOpen: boolean): boolean {
  try {
    const stored = localStorage.getItem(`sidebar-${key}`);
    if (stored !== null) return stored === 'true';
  } catch { /* ignore */ }
  return defaultOpen;
}

function setStoredState(key: string, open: boolean): void {
  try {
    localStorage.setItem(`sidebar-${key}`, String(open));
  } catch { /* ignore */ }
}

export function CollapsibleSection({
  title,
  storageKey,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => getStoredState(storageKey, defaultOpen));

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      setStoredState(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return (
    <div className="sidebar-section">
      <h3 className="collapsible-header" onClick={toggle}>
        <span className={`collapse-arrow${open ? ' open' : ''}`}>&#9656;</span>
        {title}
      </h3>
      {open && children}
    </div>
  );
}
