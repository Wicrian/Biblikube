// « Fiches » : vérifier que les fiches Zotero des références classées dans
// Organisation sont complètes selon la norme choisie.
//
// Avec Zotero, Biblikube relit les fiches (et la référence telle que Zotero
// l'écrit dans le style choisi), propose des corrections (DOI lu dans le PDF,
// Crossref, règles de forme) et enregistre dans Zotero les champs changés, après
// avoir gardé les anciennes valeurs dans une note. Le type de document se change
// dans Zotero. Le projet de démonstration montre des propositions simulées.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, RefreshCw, Undo2 } from 'lucide-react';
import { useProject } from '../store';
import type { Creator, RecordItem } from '../types';
import { itemTypeLabel, toFicheRecord } from '../zotero/mapping';
import { zoteroSelectLink, type ZItemData } from '../zotero/api';
import { buildPatch, canEdit, editValue, oldValuesNote, type Edit } from '../lib/ficheWrite';
import { lookupFiche, lookupWorth, type Lookup } from '../lib/ficheLookup';
import { CITE_STYLES, EXPECTED, FIELD_LABELS, checkRecord, fieldValue, issueCount, referenceHtml, type CiteStyle, type FieldId, type Issue } from '../lib/citeCheck';
import { SOURCE_INFO, applySuggestions, suggestionsFor, type Suggestion } from '../lib/citeSuggest';

/** Styles Zotero correspondants (répertoire officiel des styles CSL). */
const ZOTERO_STYLE: Record<CiteStyle, [style: string, locale: string]> = {
  uqam: ['universite-du-quebec-a-montreal', 'fr-CA'],
  'uqam-prenoms': ['universite-du-quebec-a-montreal-prenoms', 'fr-CA'],
  'apa-en': ['apa', 'en-US'],
};

interface UndoInfo {
  /** Anciennes valeurs, à renvoyer telles quelles à Zotero. */
  patch: Partial<ZItemData>;
  fields: FieldId[];
  at: string;
}

const hhmm = (d = new Date()) => `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;

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
  const [raw, setRaw] = useState<Record<string, ZItemData>>({});
  const [undo, setUndo] = useState<Record<string, UndoInfo>>({});
  const lastRead = useRef(0);
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
      const data: Record<string, ZItemData> = {};
      for (let i = 0; i < keys.length; i += 50) {
        for (const it of await client.itemsWithBib(keys.slice(i, i + 50), zs, locale)) {
          recs[it.key] = { ...toFicheRecord(it), sources: p.records[it.key]?.sources ?? [] };
          data[it.key] = it.data;
          if (it.bib) html[it.key] = it.bib;
        }
      }
      setFresh(recs);
      setBibs(html);
      setRaw(data);
      lastRead.current = Date.now();
      setReadAt(hhmm());
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
  // De retour dans Biblikube (après une correction dans Zotero) : on relit les fiches.
  useEffect(() => {
    if (!live) return;
    const back = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRead.current > 15_000) void reload();
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [live, reload]);

  /** Relit une seule fiche (après un enregistrement). */
  const reloadOne = async (key: string) => {
    if (!client) return;
    const [zs, locale] = ZOTERO_STYLE[style];
    const [it] = await client.itemsWithBib([key], zs, locale);
    if (!it) return;
    setFresh((m) => ({ ...m, [key]: { ...toFicheRecord(it), sources: p.records[key]?.sources ?? [] } }));
    setRaw((m) => ({ ...m, [key]: it.data }));
    if (it.bib) setBibs((m) => ({ ...m, [key]: it.bib! }));
  };

  const save = async (r: RecordItem, edits: Partial<Record<FieldId, Edit>>) => {
    if (!client) return;
    const { patch, changed } = buildPatch(r, edits);
    if (!changed.length) return;
    const before = raw[r.key] ?? {};
    const old: Partial<ZItemData> = {};
    for (const k of Object.keys(patch)) old[k] = before[k] ?? (k === 'creators' ? [] : '');
    // 1. Les champs changés (seulement eux).
    const res = await client.writeItems([{ key: r.key, version: r.version, ...patch }]);
    const failed = Object.values(res.failed)[0];
    if (failed)
      throw new Error(
        failed.code === 412
          ? 'La fiche a changé dans Zotero entre-temps : cliquez « Revérifier », puis recommencez.'
          : `Zotero a refusé la correction : ${failed.message}`,
      );
    // 2. Les anciennes valeurs, dans une note attachée à la fiche.
    const note = await client.writeItems([{ itemType: 'note', parentItem: r.key, note: oldValuesNote(r, changed), tags: [] }]).catch(() => null);
    if (!note || Object.keys(note.failed).length)
      alert('La correction est enregistrée, mais la note des anciennes valeurs n’a pas pu être créée. Le bouton « Annuler » reste disponible pendant cette séance.');
    setUndo((u) => ({ ...u, [r.key]: { patch: old, fields: changed, at: hhmm() } }));
    await reloadOne(r.key);
  };

  const cancel = async (key: string) => {
    const u = undo[key];
    const cur = fresh[key];
    if (!client || !u || !cur) return;
    const res = await client.writeItems([{ key, version: cur.version, ...u.patch }]);
    const failed = Object.values(res.failed)[0];
    if (failed) {
      alert(`Annulation impossible : ${failed.message}. Les anciennes valeurs restent dans la note Zotero de la fiche.`);
      return;
    }
    setUndo((m) => {
      const n = { ...m };
      delete n[key];
      return n;
    });
    await reloadOne(key);
  };

  const rows = keys.map((k) => fresh[k] ?? p.records[k]).map((r) => ({ r, issues: checkRecord(r, style) }));
  const todo = rows.filter((x) => issueCount(x.issues) > 0 && !done.includes(x.r.key));
  const shown = filter === 'todo' ? todo : rows;
  const [sel, setSel] = useState<string | null>(null);
  // La fiche choisie reste affichée même une fois complète (pour voir le résultat ou annuler).
  const current = shown.find((x) => x.r.key === sel) ?? rows.find((x) => x.r.key === sel) ?? shown[0];

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
          <span className="badge">
            {keys.length} référence{keys.length > 1 ? 's' : ''} classée{keys.length > 1 ? 's' : ''}
          </span>
          <span className="badge maybe">
            {todo.length} fiche{todo.length > 1 ? 's' : ''} à revoir
          </span>
          <span className="badge include">
            {rows.length - todo.length} complète{rows.length - todo.length > 1 ? 's' : ''}
          </span>
        </div>
        {error && <div className="notice warn small">Lecture dans Zotero impossible : {error}</div>}
        <p className="small muted" style={{ margin: 0 }}>
          Biblikube vérifie les références que vous avez classées dans Organisation, qu’elles soient incluses ou non dans votre revue. Il
          repère les cas les plus courants de la norme : c’est une aide, pas une garantie. Rien n’est changé dans Zotero sans votre clic.
        </p>
        {(demo || live) && (
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
            <FicheLive
              key={`${current.r.key}-${current.r.version}-${style}`}
              r={current.r}
              issues={current.issues}
              style={style}
              bib={bibs[current.r.key]}
              canSave={live && !!fresh[current.r.key]}
              undo={undo[current.r.key]}
              onSave={save}
              onUndo={() => cancel(current.r.key)}
              onSkip={() => setDone([...done, current.r.key])}
              onRecheck={() => void reload()}
              checking={loading}
            />
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

/** Fiche réelle : corriger dans Biblikube et enregistrer dans Zotero. */
function FicheLive({
  r,
  issues,
  style,
  bib,
  canSave,
  undo,
  onSave,
  onUndo,
  onSkip,
  onRecheck,
  checking,
}: {
  r: RecordItem;
  issues: Issue[];
  style: CiteStyle;
  bib?: string;
  canSave: boolean;
  undo?: UndoInfo;
  onSave: (r: RecordItem, edits: Partial<Record<FieldId, Edit>>) => Promise<void>;
  onUndo: () => Promise<void>;
  onSkip: () => void;
  onRecheck: () => void;
  checking: boolean;
}) {
  const { project: p, client } = useProject();
  const ruleSuggestions = useMemo(() => suggestionsFor(r).filter((s) => s.source === 'rule'), [r]);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [looking, setLooking] = useState(false);
  useEffect(() => {
    if (!canSave || !lookupWorth(r, issues)) return;
    let alive = true;
    setLooking(true);
    lookupFiche(client, r, issues)
      .then((l) => alive && setLookup(l))
      .catch(() => alive && setLookup({ suggestions: [], message: 'Recherche de propositions impossible pour le moment.' }))
      .finally(() => alive && setLooking(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.key, r.version]);
  const suggestions = useMemo(() => {
    const found = lookup?.suggestions ?? [];
    return [...found, ...ruleSuggestions.filter((s) => !found.some((x) => x.field === s.field))];
  }, [lookup, ruleSuggestions]);

  const fields = [...new Set<FieldId>([...(EXPECTED[r.itemType] ?? ['creators', 'date', 'title']), ...issues.map((i) => i.field)])];
  const toFix = fields.filter((f) => issues.some((i) => i.field === f) || suggestions.some((s) => s.field === f));
  const editable = toFix.filter((f) => canEdit(r, f));
  const typeIssue = issues.find((i) => i.field === 'itemType');
  const [edits, setEdits] = useState<Partial<Record<FieldId, Edit>>>({});
  const [touched, setTouched] = useState<FieldId[]>([]);
  // Les propositions remplissent les cases que la personne n'a pas encore touchées.
  const values: Partial<Record<FieldId, Edit>> = {};
  for (const f of editable) {
    const s = suggestions.find((x) => x.field === f && x.value);
    values[f] = touched.includes(f) ? edits[f]! : s ? { value: s.value, creators: s.creators } : { value: editValue(r, f) };
  }
  const { changed } = buildPatch(r, values);
  const after = applySuggestions(r, values);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(r, values);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel stack fiche-detail">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="badge">{itemTypeLabel(r.itemType)}</span>
        <span className="small muted">{r.sources.join(', ')}</span>
        <span className="spacer" />
        {canSave && (
          <button className="btn small" onClick={onRecheck} disabled={checking}>
            <RefreshCw size={13} className={checking ? 'spin' : ''} /> Revérifier
          </button>
        )}
        {p.library && (
          <a className="btn small" href={zoteroSelectLink(p.library, r.key)}>
            Ouvrir dans Zotero <ExternalLink size={13} />
          </a>
        )}
      </div>
      {undo && (
        <div className="notice small row" style={{ flexWrap: 'wrap' }}>
          ✓ Enregistré dans Zotero à {undo.at} ({undo.fields.map((f) => FIELD_LABELS[f]).join(', ')}). Les anciennes valeurs sont dans la note « Biblikube – anciennes valeurs » de la fiche.
          <span className="spacer" />
          <button className="btn small" onClick={() => void onUndo()}>
            <Undo2 size={13} /> Annuler
          </button>
        </div>
      )}
      <div className="dup-group">
        <CurrentFiche r={r} issues={issues} />
        <div className="dup-item keep">
          <div className="row small">
            <strong>Fiche corrigée</strong>
            <span className="muted">· modifiable</span>
          </div>
          {looking && (
            <div className="small muted" style={{ marginTop: '0.4rem' }}>
              <RefreshCw size={12} className="spin" /> Recherche de propositions (PDF, Crossref)…
            </div>
          )}
          {!looking && lookup?.message && <div className="small muted" style={{ marginTop: '0.4rem' }}>{lookup.message}</div>}
          <div className="stack" style={{ gap: '0.6rem', marginTop: '0.5rem' }}>
            {typeIssue && (
              <div className="fiche-edit">
                <strong className="small">{FIELD_LABELS.itemType}</strong>
                <span className="small">{typeIssue.text}</span>
                <span className="small muted">Le type se change dans Zotero (bouton « Ouvrir dans Zotero ») : certains champs n’existent pas d’un type à l’autre.</span>
              </div>
            )}
            {editable.map((f) => {
              const s: Suggestion | undefined = suggestions.find((x) => x.field === f && x.value);
              const src = s ? SOURCE_INFO[s.source] : null;
              const v = values[f]?.value ?? '';
              return (
                <label key={f} className="fiche-edit">
                  <span className="row small" style={{ gap: '0.35rem', flexWrap: 'wrap' }}>
                    <strong>{FIELD_LABELS[f]}</strong>
                    {src && !touched.includes(f) && (
                      <span className={`src ${src.kind}`} title={src.label}>
                        {src.icon} {src.label}
                      </span>
                    )}
                  </span>
                  <input
                    type={f === 'accessDate' ? 'date' : 'text'}
                    value={v}
                    placeholder={f === 'creators' || f === 'editors' ? 'Nom, Prénom ; Nom, Prénom (organisme : sans virgule)' : 'À remplir'}
                    onChange={(e) => {
                      setEdits({ ...edits, [f]: { value: e.target.value } });
                      if (!touched.includes(f)) setTouched([...touched, f]);
                    }}
                  />
                  {s?.note && !touched.includes(f) && <span className="small muted">{s.note}</span>}
                  {editValue(r, f) && v !== editValue(r, f) && <span className="small muted">Actuellement : {editValue(r, f)}</span>}
                </label>
              );
            })}
            {editable.length === 0 && !typeIssue && <span className="small">Rien à corriger selon les règles vérifiées.</span>}
          </div>
        </div>
      </div>

      <div className="fiche-preview">
        <div className="small muted">Référence · {CITE_STYLES[style]}</div>
        {bib ? (
          <div className="fiche-ref">
            <span className="badge">Zotero</span>
            <div className="fiche-bib" dangerouslySetInnerHTML={{ __html: cleanBib(bib) }} />
          </div>
        ) : (
          <div className="fiche-ref">
            <span className="badge">Avant</span>
            <p dangerouslySetInnerHTML={{ __html: referenceHtml(r, style) }} />
          </div>
        )}
        {changed.length > 0 && (
          <div className="fiche-ref">
            <span className="badge include">Après</span>
            <p dangerouslySetInnerHTML={{ __html: referenceHtml(after, style) }} />
          </div>
        )}
        {changed.length > 0 && <div className="small muted">« Après » est un aperçu : Zotero écrira la référence exacte une fois la fiche enregistrée.</div>}
      </div>

      {error && <div className="notice warn small">{error}</div>}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="small muted">
          {canSave ? 'Seuls les champs changés sont envoyés. Les anciennes valeurs sont gardées dans une note Zotero.' : 'Reliez cette revue à Zotero pour enregistrer les corrections.'}
        </span>
        <span className="spacer" />
        <button className="btn small" onClick={onSkip}>
          Passer
        </button>
        <button className="btn primary" disabled={!canSave || !changed.length || saving} onClick={() => void save()}>
          {saving ? 'Enregistrement…' : `Enregistrer dans Zotero (${changed.length} champ${changed.length > 1 ? 's' : ''})`}
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
