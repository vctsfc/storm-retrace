/**
 * Draggable title bar for Electron on macOS.
 *
 * Renders a thin bar across the top of the window that acts as a drag
 * handle for moving the window. Only renders when running in Electron.
 * The bar is transparent and sits above both the sidebar and map.
 */

const TITLEBAR_HEIGHT = 38;

export function TitleBar() {
  const isElectron = !!(window as any).electronAPI?.isElectron;
  if (!isElectron) return null;

  return (
    <div
      className="electron-titlebar"
      style={{
        height: TITLEBAR_HEIGHT,
        width: '100%',
        WebkitAppRegion: 'drag',
        position: 'relative',
        zIndex: 1000,
        flexShrink: 0,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      } as React.CSSProperties}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          letterSpacing: '0.5px',
          userSelect: 'none',
        }}
      >
        StormReplay
      </span>
    </div>
  );
}
