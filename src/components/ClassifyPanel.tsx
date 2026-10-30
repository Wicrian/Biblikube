import { useMemo, useState } from 'react';
import { orderedCategories, toggleCategory, toggleMarker } from '../lib/organisation';
import { useProject } from '../store';
import { changeTags, tagIndex, userTags } from '../lib/tags';
import { useTagColors } from './tagColors';

/**
 * Classement rapide d'une référence : catégories du plan et marqueurs.
 * Utilisable à toutes les étapes (tri, texte intégral, références).
 */
export function ClassifyPanel({ recordKey, always = false }: { recordKey: string; always?: boolean }) {
  const { project: p, update, markDirty } = useProject();
  const o = p.organisation;
  const cats = orderedCategories(o);
  const hasZotero = Object.values(p.records).some((r) => userTags(p, r).length);
  if (!always && !cats.length && !o.markers.length && !hasZotero) return null;
  const mine = o.assignments[recordKey] ?? [];
  const marks = o.markerAssignments[recordKey] ?? [];

  return (
    <div className="classify stack">
      {cats.length > 0 ? (
        <div className="row" style={{ gap: '0.35rem' }}>
          <span className="small muted">Classer :</span>
          {cats.map((c) => (
            <button
              key={c.id}
              className={`chip ${mine.includes(c.id) ? 'on' : ''}`}
              onClick={() => {
                update((cur) => ({ ...cur, organisation: toggleCategory(cur.organisation, recordKey, c.id) }));
                markDirty([recordKey]);
              }}
            >
              {c.parent ? '↳ ' : ''}
              {c.name}
            </button>
          ))}
        </div>
      ) : (
        always && <div className="small muted">Pas encore de plan de classement : créez-le dans l’onglet Organisation.</div>
      )}
      {o.markers.length > 0 && (
        <div className="row" style={{ gap: '0.35rem' }}>
          <span className="small muted">Marqueurs :</span>
          {o.markers.map((m) => (
            <button
              key={m.id}
              className={`chip ${marks.includes(m.id) ? 'on' : ''}`}
              onClick={() => {
                update((cur) => ({ ...cur, organisation: toggleMarker(cur.organisation, recordKey, m.id) }));
                markDirty([recordKey]);
              }}
            >
              <span className="marker-dot" style={{ background: m.color }} /> {m.name}
            </button>
          ))}
        </div>
      )}
      <ZoteroTagsRow recordKey={recordKey} />
    </div>
  );
}

/**
 * Marqueurs Zotero de la personne : ceux de la référence (cochés), les plus utilisés
 * dans la revue, et un champ pour en ajouter. Chaque clic est écrit dans Zotero.
 */
function ZoteroTagsRow({ recordKey }: { recordKey: string }) {
  const { project: p, update, client } = useProject();
  const { colors } = useTagColors();
  const r = p.records[recordKey];
  const index = useMemo(() => tagIndex(p), [p]);
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!r) return null;
  const mine = userTags(p, r);
  const popular = [...index.entries()].sort((a, b) => b[1].length - a[1].length).map(([t]) => t).filter((t) => !mine.includes(t));
  const offer = more ? popular : popular.slice(0, 8);
  if (!mine.length && !popular.length && !client) return null;

  const toggle = async (tag: string, on: boolean) => {
    const t = tag.trim();
    if (!t || !client) return;
    setBusy(t);
    setError('');
    try {
      const [it] = await client.itemsByKeys([recordKey]);
      if (!it) throw new Error('fiche introuvable dans Zotero');
      const tags = changeTags(it.data.tags ?? [], on ? [] : [t], on ? [t] : []);
      const res = await client.writeItems([{ key: recordKey, version: it.version, tags }]);
      const f = Object.values(res.failed)[0];
      if (f) throw new Error(f.message);
      update((cur) => ({ ...cur, records: { ...cur.records, [recordKey]: { ...cur.records[recordKey], zoteroTags: tags.map((x) => x.tag) } } }));
      setAdding('');
    } catch (e) {
      setError(`Zotero a refusé : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy('');
    }
  };

  const chip = (t: string, on: boolean) => {
    const c = colors.get(t);
    return (
      <button key={t} className={`chip ${on ? 'on' : ''}`} disabled={!client || !!busy} onClick={() => void toggle(t, !on)} title={on ? 'Retirer ce marqueur dans Zotero' : 'Ajouter ce marqueur dans Zotero'}>
        {c && <span className="marker-dot" style={{ background: c }} />} {busy === t ? '…' : t}
      </button>
    );
  };

  return (
    <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
      <span className="small muted">Marqueurs Zotero :</span>
      {mine.map((t) => chip(t, true))}
      {offer.map((t) => chip(t, false))}
      {popular.length > 8 && (
        <button className="btn small" onClick={() => setMore(!more)}>
          {more ? 'Moins' : `+ ${popular.length - 8} autres`}
        </button>
      )}
      {client && (
        <form
          className="row"
          style={{ gap: '0.25rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            void toggle(adding, true);
          }}
        >
          <input className="tag-add" value={adding} placeholder="Nouveau marqueur…" list={`tags-${recordKey}`} onChange={(e) => setAdding(e.target.value)} />
          <datalist id={`tags-${recordKey}`}>
            {popular.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          {adding.trim() && (
            <button className="btn small" type="submit" disabled={!!busy}>
              Ajouter
            </button>
          )}
        </form>
      )}
      {!client && <span className="small muted">(reliez la revue à Zotero pour les modifier)</span>}
      {error && <span className="small" style={{ color: 'var(--exclude)' }}>{error}</span>}
    </div>
  );
}
