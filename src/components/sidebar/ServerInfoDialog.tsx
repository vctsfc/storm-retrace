import { useState, useEffect } from 'react';

const STORAGE_KEY = 'storm-replay-server-info-seen';

/**
 * Small info dialog that shows on first visit with instructions
 * on how to start the dev server. Re-accessible via a "?" button
 * rendered at the bottom of the sidebar.
 */
export function ServerInfoDialog() {
  const [open, setOpen] = useState(false);
  const isElectron = !!(window as any).electronAPI?.isElectron;

  // Show automatically on first visit (web only)
  useEffect(() => {
    if (isElectron) return;
    if (!localStorage.getItem(STORAGE_KEY)) {
      setOpen(true);
      localStorage.setItem(STORAGE_KEY, '1');
    }
  }, [isElectron]);

  // Hide entirely in Electron — dev server instructions are irrelevant
  if (isElectron) return null;

  return (
    <>
      {/* Help button pinned to bottom of sidebar */}
      <button
        className="server-info-help-btn"
        onClick={() => setOpen(true)}
        title="Server info & help"
      >
        ?
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="server-info-overlay" onClick={() => setOpen(false)}>
          <div className="server-info-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="server-info-header">
              <span>Getting Started</span>
              <button className="server-info-close" onClick={() => setOpen(false)}>
                &times;
              </button>
            </div>

            <div className="server-info-body">
              <p className="server-info-label">Start the dev server:</p>
              <pre className="server-info-code">
                <code>cd ~/Documents/Claude/storm-replay{'\n'}npm run dev</code>
              </pre>

              <p className="server-info-label">Open the app:</p>
              <pre className="server-info-code">
                <code>http://localhost:5173</code>
              </pre>

              <p className="server-info-label">Stop the server:</p>
              <pre className="server-info-code">
                <code>Ctrl + C</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
