// « Fiches » : vérifier que les fiches Zotero des références classées dans
// Organisation sont complètes selon la norme choisie.
//
// Version test : avec Zotero, Biblikube relit les fiches (et la référence telle
// que Zotero l'écrit dans le style choisi) et dit quoi corriger ; la correction
// se fait dans Zotero. Le projet de démonstration montre en plus des propositions
// simulées (Crossref, PDF) et l'enregistrement, prévus pour une étape suivante.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { useProject } from '../store';
import type { Creator, RecordItem } from '../types';
import { itemTypeLabel, toFicheRecord } from '../zotero/mapping';
import { zoteroSelectLink } from '../zotero/api';
import { CITE_STYLES, EXPECTED, FIELD_LABELS, checkRecord, fieldValue, issueCount, referenceHtml, type CiteStyle, type FieldId, type Issue } from '../lib/citeCheck';
import { SOURCE_INFO, applySuggestions, suggestionsFor, type Suggestion } from '../lib/citeSuggest';

/** Styles Zotero correspondants (répertoire officiel des styles CSL). */
const ZOTERO_STYLE: Record<CiteStyle, [style: string, locale: string]> = {
  uqam: ['universite-du-quebec-a-montreal', 'fr-CA'],
  'uqam-prenoms': ['universite-du-quebec-a-montreal-prenoms', 'fr-CA'],
  'apa-en': ['apa', 'en-US'],
};

const STYLE_KEY = 'litflow.citeStyle';
const loadStyle = (): CiteStyle => {
  try {
    const s = localStorage.getItem(STYLE_KEY);
    return s && s in CITE_STYLES ? (s as CiteStyle) : 'uqam';
  } catch {
    return 'uqam';
  }
};

export function Fiches() {
  const { project: p, client } = useProject();
  const live = !!client && !!p.library;
  const demo = !live && Object.keys(p.records).every((k) => k.startsWith('DEMO'));
  const [style, setStyleState] = useState<CiteStyle>(loadStyle);
  const setStyle = (s: CiteStyle) => {
    setStyleState(s);
    try {
      localStorage.setItem(STYLE_KEY, s);
    } catch {
      /* rien */
    }
  };
  const [filter, setFilter] = useState<'todo' | 'all'>('todo');
  const [done, setDone] = useState<string[]>([]);
  const keys = useMemo(
    () => Object.entries(p.organisation.assignments).filter(([k, ids]) => ids.length && p.records[k] && !(k in p.duplicates)).map(([k]) => k),
    [p.organisation.assignments, p.records, p.duplicates],
  );

  // Fiches relues dans Zotero (état actuel, avec tous les champs utiles).
  const [fresh, setFresh] = useState<Record<string, RecordItem>>({});
  const [bibs, setBibs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [readAt, setReadAt] = useState('');
  const reload = useCallback(async () => {
    if (!client || !keys.length) return;
    setLoading(true);
    setError('');
    try {
      const [zs, locale] = ZOTERO_STYLE[style];
      const recs: Record<string, RecordItem> = {};
      const html: Record<string, string> = {};
      for (let i = 0; i < keys.length; i += 50) {
        for (const it of await client.itemsWithBib(keys.slice(i, i + 50), zs, locale)) {
          recs[it.key] = { ...toFicheRecord(it), sources: p.records[it.key]?.sources ?? [] };
          if (it.bib) html[it.key] = it.bib;
        }
      }
      setFresh(recs);
      setBibs(html);
      const d = new Date();
      setReadAt(`${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, keys.join(','), style]);
  useEffect(() => {
    if (live) void reload();
  }, [live, reload]);

  const rows = keys.map((k) => fresh[k] ?? p.records[k]).map((r) => ({ r, issues: checkRecord(r, style) }));
  const todo = rows.filter((x) => issueCount(x.issues) > 0 && !done.includes(x.r.key));
  const shown = filter === 'todo' ? todo : rows;
  const [sel, setSel] = useState<string | null>(null);
  const current = shown.find((x) => x.r.key === sel) ?? shown[0];

  if (!keys.length)
    return (
      <section className="panel stack">
        <p style={{ margin: 0 }}>
          Aucune référence classée pour l’instant. Biblikube vérifie les fiches des références que vous avez classées dans
          <strong> Organisation</strong> : commencez par en classer quelques-unes.
        </p>
      </section>
    );

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
          {live && (
            <button className="btn small" onClick={() => void reload()} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> {loading ? 'Lecture dans Zotero…' : 'Revérifier'}
            </button>
          )}
          {live && readAt && !loading && <span className="small muted">Fiches lues dans Zotero à {readAt}</span>}
          <span className="spacer" />
          <span className="badge">{keys.length} références classées</span>
          <span className="badge maybe">{todo.length} fiches à revoir</span>
          <span className="badge include">
            {rows.length - todo.length} complète{rows.length - todo.length > 1 ? 's' : ''}
          </span>
        </div>
        {error && <div className="notice warn small">Lecture dans Zotero impossible : {error}</div>}
        <p className="small muted" style={{ margin: 0 }}>
          Biblikube vérifie les références que vous avez classées dans Organisation, qu’elles soient incluses ou non dans votre revue. Il
          repère les cas les plus courants de la norme : c’est une aide, pas une garantie. Rien n’est changé dans Zotero.
        </p>
        {demo && (
          <div className="fiche-legend small">
            <span>
              <b className="src sure">✓</b> sûr : trouvé avec le DOI
            </span>
            <span>
              <b className="src check">⚠</b> à vérifier : lu dans le PDF, trouvé par le titre, ou correction de forme
            </span>
            <span>
              <b className="src none">✗</b> rien trouvé : à remplir vous-même
            </span>
          </div>
        )}
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
                <span className="fiche-row-title">{r.title || '(sans titre)'}</span>
                <span className="small muted">
                  {itemTypeLabel(r.itemType)} · {r.year ?? 's. d.'}
                </span>
                <span className={`badge ${n ? 'maybe' : 'include'}`}>{n ? `${n} point${n > 1 ? 's' : ''}` : '✓ complète'}</span>
              </button>
            );
          })}
        </aside>
        {current ? (
          !demo ? (
            <FicheLive key={current.r.key} r={current.r} issues={current.issues} style={style} bib={bibs[current.r.key]} onSkip={() => setDone([...done, current.r.key])} />
          ) : (
            <FicheDemo key={`${current.r.key}-${style}`} r={current.r} issues={current.issues} style={style} onDone={() => setDone([...done, current.r.key])} />
          )
        ) : (
          <section className="panel">Tout est en ordre 🎉</section>
        )}
      </div>
    </div>
  );
}

function CurrentFiche({ r, issues }: { r: RecordItem; issues: Issue[] }) {
  const fields = [...new Set<FieldId>(['itemType', ...(EXPECTED[r.itemType] ?? ['creators', 'date', 'title']), ...issues.map((i) => i.field)])];
  return (
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
  );
}

/** Fiche réelle : ce qu'il faut corriger, à faire dans Zotero. */
function FicheLive({ r, issues, style, bib, onSkip }: { r: RecordItem; issues: Issue[]; style: CiteStyle; bib?: string; onSkip: () => void }) {
  const { project: p } = useProject();
  const suggestions = suggestionsFor(r).filter((s) => s.source === 'rule');
  const [copied, setCopied] = useState('');
  const copy = (v: string) => {
    void navigator.clipboard?.writeText(v);
    setCopied(v);
  };
  const todo = issues.filter((i) => i.kind !== 'conseil');
  return (
    <section className="panel stack fiche-detail">
      <div className="row">
        <span className="badge">{itemTypeLabel(r.itemType)}</span>
        <span className="small muted">{r.sources.join(', ')}</span>
        <span className="spacer" />
        {p.library && (
          <a className="btn small" href={zoteroSelectLink(p.library, r.key)}>
            Ouvrir dans Zotero <ExternalLink size={13} />
          </a>
        )}
      </div>
      <div className="dup-group">
        <CurrentFiche r={r} issues={issues} />
        <div className="dup-item keep">
          <div className="row small">
            <strong>À corriger dans Zotero</strong>
          </div>
          {todo.length === 0 ? (
            <p className="small">Rien d’important à corriger selon les règles vérifiées.</p>
          ) : (
            <ol className="fiche-todo">
              {todo.map((i, n) => {
                const s = suggestions.find((x) => x.field === i.field);
                return (
                  <li key={n}>
                    <strong>{FIELD_LABELS[i.field]}</strong> : {i.text}
                    {s?.value && (
                      <span className="fiche-copy">
                        <span className="src check">⚠ Proposition à vérifier</span>
                        <code>{s.value}</code>
                        <button className="btn small" onClick={() => copy(s.value)} title="Copier pour coller dans Zotero">
                          <Copy size={13} /> {copied === s.value ? 'Copié' : 'Copier'}
                        </button>
                        {s.note && <span className="small muted">{s.note}</span>}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <p className="small muted" style={{ marginBottom: 0 }}>
            Corrigez dans Zotero (bouton « Ouvrir dans Zotero »), attendez que Zotero se synchronise, puis cliquez « Revérifier ».
          </p>
        </div>
      </div>
      <div className="fiche-preview">
        <div className="small muted">Référence telle que Zotero l’écrit · {CITE_STYLES[style]}</div>
        {bib ? (
          <div className="fiche-ref">
            <span className="badge">Zotero</span>
            <div className="fiche-bib" dangerouslySetInnerHTML={{ __html: cleanBib(bib) }} />
          </div>
        ) : (
          <div className="fiche-ref">
            <span className="badge">Aperçu</span>
            <p dangerouslySetInnerHTML={{ __html: referenceHtml(r, style) }} />
          </div>
        )}
      </div>
      <div className="row">
        <span className="spacer" />
        <button className="btn small" onClick={onSkip}>
          Passer
        </button>
      </div>
    </section>
  );
}

/** Garde seulement le texte et la mise en forme simple de la référence envoyée par Zotero. */
const KEEP = new Set(['DIV', 'SPAN', 'I', 'EM', 'B', 'STRONG', 'SUP', 'SUB']);
function cleanBib(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const inner = [...n.childNodes].map(walk).join('');
    const tag = (n as Element).tagName;
    return tag && KEEP.has(tag) ? `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>` : inner;
  };
  return walk(doc.body);
}

/** Projet de démonstration : propositions simulées et fiche corrigée modifiable. */
function FicheDemo({ r, issues, style, onDone }: { r: RecordItem; issues: Issue[]; style: CiteStyle; onDone: () => void }) {
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
        <span className="badge maybe">Exemple : propositions simulées</span>
      </div>
      <div className="dup-group">
        <CurrentFiche r={r} issues={issues} />
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
        <span className="small muted">Dans la démonstration, rien n’est enregistré.</span>
        <span className="spacer" />
        <button className="btn small" onClick={onDone}>
          Passer
        </button>
        <button className="btn primary" disabled={!changed} onClick={onDone}>
          Enregistrer ({changed} champ{changed > 1 ? 's' : ''})
        </button>
      </div>
    </section>
  );
}
