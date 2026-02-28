/**
 * Collapsible sidebar section.
 *
 * Wraps sidebar content in a section with a clickable header that
 * toggles visibility. Open/closed state is persisted to localStorage
 * so sections stay where the user left them across page reloads.
 *
 * Optional helpText renders a small ℹ button that toggles an
 * inline description below the header.
 */

import { useState, useCallback, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  /** Section title displayed in the header */
  title: string;
  /** Unique key for persisting open/closed state */
  storageKey: string;
  /** Whether the section starts open (default: true) */
  defaultOpen?: boolean;
  /** Optional help text shown when the ℹ button is clicked */
  helpText?: string;
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
  helpText,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => getStoredState(storageKey, defaultOpen));
  const [showHelp, setShowHelp] = useState(false);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      setStoredState(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const toggleHelp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowHelp((prev) => !prev);
  }, []);

  return (
    <div className="sidebar-section">
      <h3 className="collapsible-header" onClick={toggle}>
        <span className={`collapse-arrow${open ? ' open' : ''}`}>&#9656;</span>
        {title}
        {helpText && (
          <button
            className={`section-help-btn${showHelp ? ' active' : ''}`}
            onClick={toggleHelp}
            title="Show help"
          >
            i
          </button>
        )}
      </h3>
      {showHelp && helpText && (
        <div className="section-help-text">{helpText}</div>
      )}
      {open && children}
    </div>
  );
}
