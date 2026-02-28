import { useMapStore, type BaseMapStyle } from '../../stores/mapStore';
import { CollapsibleSection } from './CollapsibleSection';

const MAP_STYLES: { id: BaseMapStyle; label: string }[] = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'satellite', label: 'Satellite' },
];

/**
 * Base map style switcher: Dark, Light, Satellite.
 * Includes a "More Labels" toggle for supplementary town/village labels.
 */
export function BaseMapSwitcher() {
  const style = useMapStore((s) => s.baseMapStyle);
  const setStyle = useMapStore((s) => s.setBaseMapStyle);
  const showMoreLabels = useMapStore((s) => s.showMoreLabels);
  const setShowMoreLabels = useMapStore((s) => s.setShowMoreLabels);

  return (
    <CollapsibleSection
      title="Base Map"
      storageKey="base-map"
      defaultOpen={false}
      helpText="Switch between Dark, Light, and Satellite base map styles. Enable More Town Labels to show additional place names on the map."
    >
      <div className="product-selector">
        {MAP_STYLES.map((s) => (
          <button
            key={s.id}
            className={style === s.id ? 'active' : ''}
            onClick={() => setStyle(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="more-labels-toggle">
        <input
          type="checkbox"
          checked={showMoreLabels}
          onChange={(e) => setShowMoreLabels(e.target.checked)}
        />
        More town labels
      </label>
    </CollapsibleSection>
  );
}
