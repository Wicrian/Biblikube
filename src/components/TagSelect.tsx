// Liste déroulante : un marqueur Zotero de la revue, ou une famille de marqueurs.
import { useMemo } from 'react';
import { useProject } from '../store';
import { tagIndex } from '../lib/tags';

export function TagSelect({ value, onChange, compact = false }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const { project: p } = useProject();
  const index = useMemo(() => tagIndex(p), [p]);
  const families = p.tagWork?.families ?? [];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={compact ? { width: 'auto', maxWidth: '18rem' } : undefined}>
      <option value="">Tous</option>
      {families.length > 0 && (
        <optgroup label="Familles">
          {families.map((f) => (
            <option key={f.id} value={`famille:${f.id}`}>
              Famille : {f.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Marqueurs">
        {[...index.entries()].map(([t, keys]) => (
          <option key={t} value={t}>
            {t} ({keys.length})
          </option>
        ))}
      </optgroup>
    </select>
  );
}
