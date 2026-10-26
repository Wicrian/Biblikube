// « Fiches » : vérifier que les fiches Zotero des références classées sont
// complètes selon la norme choisie, et proposer des corrections (MAQUETTE).
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useProject } from '../store';
import type { Creator, RecordItem } from '../types';
import { itemTypeLabel } from '../zotero/mapping';
import { CITE_STYLES, EXPECTED, FIELD_LABELS, checkRecord, fieldValue, issueCount, referenceHtml, type CiteStyle, type FieldId, type Issue } from '../lib/citeCheck';
import { SOURCE_INFO, applySuggestions, suggestionsFor, type Suggestion } from '../lib/citeSuggest';

export function Fiches() {
  const { project: p } = useProject();
  const [style, setStyle] = useState<CiteStyle>('uqam');
  const [filter, setFilter] = useState<'todo' | 'all'>('todo');
  const [done, setDone] = useState<string[]>([]);
  const classified = useMemo(
    () => Object.entries(p.organisation.assignments).filter(([k, ids]) => ids.length && p.records[k] && !(k in p.duplicates)).map(([k]) => p.records[k]),
    [p],
  );
  const rows = classified.map((r) => ({ r, issues: checkRecord(r, style) }));
  const todo = rows.filter((x) => issueCount(x.issues) > 0 && !done.includes(x.r.key));
  const shown = filter === 'todo' ? todo : rows;
  const [sel, setSel] = useState<string | null>(null);
  const current = shown.find((x) => x.r.key === sel) ?? shown[0];

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.6rem' }}>
          <label className="row small" style={{ gap: '0.4rem' }}>
            <strong>Norme</strong>
            <select value={style} onChange={(e) => setStyle(e.target.value as CiteStyle)}>
              {Object.entries(CITE_STYLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
              <option disabled>Autres normes : bientôt</option>
            </select>
          </label>
          <span className="spacer" />
          <span className="badge">{classified.length} références classées</span>
          <span className="badge maybe">{todo.length} fiches à revoir</span>
          <span className="badge include">{rows.length - todo.length} complètes</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Biblikube vérifie les références que vous avez classées dans Organisation, qu’elles soient incluses ou non dans votre revue. Il
          repère les cas les plus courants de la norme : c’est une aide, pas une garantie. Rien n’est changé dans Zotero sans votre clic.
        </p>
        <div className="fiche-legend small">
          <span><b className="src sure">✓</b> sûr : trouvé avec le DOI</span>
          <span><b className="src check">⚠</b> à vérifier : lu dans le PDF, trouvé par le titre, ou correction de forme</span>
          <span><b className="src none">✗</b> rien trouvé : à remplir vous-même</span>
        </div>
      </section>

      <div className="fiches-layout">
        <aside className="panel fiche-list">
          <div className="row small" style={{ gap: '0.3rem', marginBottom: '0.5rem' }}>
            <button className={`btn small ${filter === 'todo' ? 'dark' : ''}`} onClick={() => setFilter('todo')}>
              À revoir ({todo.length})
            </button>
            <button className={`btn small ${filter === 'all' ? 'dark' : ''}`} onClick={() => setFilter('all')}>
              Toutes ({rows.length})
            </button>
          </div>
          {shown.map(({ r, issues }) => {
            const n = issueCount(issues);
            return (
              <button key={r.key} className={`fiche-row ${current?.r.key === r.key ? 'on' : ''}`} onClick={() => setSel(r.key)}>
                <span className="fiche-row-title">{r.title}</span>
                <span className="small muted">
                  {itemTypeLabel(r.itemType)} · {r.year ?? 's. d.'}
                </span>
                <span className={`badge ${n ? 'maybe' : 'include'}`}>{n ? `${n} point${n > 1 ? 's' : ''}` : '✓ complète'}</span>
              </button>
            );
          })}
        </aside>
        {current ? <FicheDetail key={`${current.r.key}-${style}`} r={current.r} issues={current.issues} style={style} onDone={() => setDone([...done, current.r.key])} /> : <section className="panel">Tout est en ordre 🎉</section>}
      </div>
    </div>
  );
}

function FicheDetail({ r, issues, style, onDone }: { r: RecordItem; issues: Issue[]; style: CiteStyle; onDone: () => void }) {
  const suggestions = suggestionsFor(r);
  const fields = [...new Set<FieldId>(['itemType', ...(EXPECTED[r.itemType] ?? ['creators', 'date', 'title']), ...issues.map((i) => i.field)])];
  const toFix = fields.filter((f) => issues.some((i) => i.field === f) || suggestions.some((s) => s.field === f));
  const [values, setValues] = useState<Partial<Record<FieldId, { value: string; creators?: Creator[] }>>>(() =>
    Object.fromEntries(suggestions.map((s) => [s.field, { value: s.value, creators: s.creators }])),
  );
  const after = applySuggestions(r, values);
  const changed = toFix.filter((f) => (values[f]?.value ?? '') !== '' && values[f]?.value !== fieldValue(r, f)).length;

  return (
    <section className="panel stack fiche-detail">
      <div className="row">
        <span className="badge">{itemTypeLabel(r.itemType)}</span>
        <span className="small muted">{r.sources.join(', ')}</span>
        <span className="spacer" />
        <button className="btn small">
          Ouvrir dans Zotero <ExternalLink size={13} />
        </button>
      </div>
      <div className="dup-group">
        <div className="dup-item">
          <div className="row small">
            <strong>Fiche actuelle dans Zotero</strong>
          </div>
          <dl className="dup-fields fiche-fields">
            {fields.map((f) => {
              const its = issues.filter((i) => i.field === f);
              const v = f === 'itemType' ? itemTypeLabel(r.itemType) : fieldValue(r, f);
              const cls = its.some((i) => i.kind === 'manque') ? 'fiche-missing' : its.some((i) => i.kind === 'forme') ? 'dup-diff' : '';
              return (
                <div key={f} className={cls}>
                  <dt>{FIELD_LABELS[f]}</dt>
                  <dd>
                    {v || <span className="muted">— vide</span>}
                    {its.map((i, n) => (
                      <span key={n} className={`fiche-issue ${i.kind}`}>
                        {i.kind === 'conseil' ? '💡' : i.kind === 'manque' ? '●' : '▲'} {i.text}
                      </span>
                    ))}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
        <div className="dup-item keep">
          <div className="row small">
            <strong>Fiche corrigée</strong>
            <span className="muted">· modifiable</span>
          </div>
          <div className="stack" style={{ gap: '0.6rem', marginTop: '0.5rem' }}>
            {toFix.map((f) => {
              const s: Suggestion | undefined = suggestions.find((x) => x.field === f);
              const src = SOURCE_INFO[s?.source ?? 'none'];
              const v = values[f]?.value ?? '';
              return (
                <label key={f} className="fiche-edit">
                  <span className="row small" style={{ gap: '0.35rem' }}>
                    <strong>{FIELD_LABELS[f]}</strong>
                    <span className={`src ${src.kind}`} title={src.label}>
                      {src.icon} {src.label}
                    </span>
                  </span>
                  <input
                    value={v}
                    placeholder={s?.source === 'none' || !s ? 'À remplir vous-même' : ''}
                    onChange={(e) => setValues({ ...values, [f]: { value: e.target.value } })}
                  />
                  {s?.note && <span className="small muted">{s.note}</span>}
                </label>
              );
            })}
            <span className="small muted">Les autres champs ne changent pas.</span>
          </div>
        </div>
      </div>

      <div className="fiche-preview">
        <div className="small muted">Aperçu de la référence · {CITE_STYLES[style]}</div>
        <div className="fiche-ref">
          <span className="badge">Avant</span>
          <p dangerouslySetInnerHTML={{ __html: referenceHtml(r, style) }} />
        </div>
        <div className="fiche-ref">
          <span className="badge include">Après</span>
          <p dangerouslySetInnerHTML={{ __html: referenceHtml(after, style) }} />
        </div>
      </div>

      <div className="row">
        <span className="small muted">Les anciennes valeurs sont gardées dans une note Zotero : vous pourrez annuler.</span>
        <span className="spacer" />
        <button className="btn small" onClick={onDone}>
          Passer
        </button>
        <button className="btn primary" disabled={!changed} onClick={onDone}>
          Enregistrer dans Zotero ({changed} champ{changed > 1 ? 's' : ''})
        </button>
      </div>
    </section>
  );
}

