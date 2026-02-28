import { useRadarStore, type RadarProduct } from '../../stores/radarStore';

const PRODUCTS: { id: RadarProduct; label: string; title: string }[] = [
  { id: 'REF', label: 'REF', title: 'Reflectivity (R)' },
  { id: 'VEL', label: 'VEL', title: 'Velocity (V)' },
];

/**
 * Product selector buttons: REF, VEL (Phase 1).
 * ZDR, CC, KDP will be added in Phase 10.
 *
 * Renders inline content (no section wrapper) — grouped under
 * the "Radar" collapsible section in Sidebar.tsx.
 */
export function ProductSelector() {
  const product = useRadarStore((s) => s.product);
  const setProduct = useRadarStore((s) => s.setProduct);

  return (
    <div>
      <div className="product-selector">
        {PRODUCTS.map((p) => (
          <button
            key={p.id}
            className={product === p.id ? 'active' : ''}
            onClick={() => setProduct(p.id)}
            title={p.title}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
