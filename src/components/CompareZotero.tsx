// Fenêtre « Comparer avec Zotero » : lit toutes les fiches de la revue dans Zotero,
// montre où Biblikube et Zotero ne disent pas la même chose, et laisse choisir.
import { useMemo, useState } from 'react';
import { Undo2, X } from 'lucide-react';
import { useProject } from '../store';
import type { Project } from '../types';
import type { ZItem } from '../zotero/api';
import { compareWithZotero, keepZotero, type Difference, type Field, type Value } from '../lib/compareZotero';
import { exportProjectJson } from '../lib/export';
import { Portal } from './Portal';

const FIELD: Record<Field, string> = { screening: 'Tri titre-résumé', fulltext: 'Texte intégral', duplicate: 'Doublon' };
const VALUE = (v: Value, f: Field) => {
  if (f === 'duplicate') return v ? 'doublon' : 'pas doublon';
  return v === 'include' ? 'inclus' : v === 'exclude' ? 'exclu' : v === 'maybe' ? 'incertain' : v === 'notretrieved' ? 'introuvable' : '—';
};
/** « col » : le dossier Zotero ; « tag » : l'étiquette LF: ; « biblikube » : l'état de Biblikube. */
type Choice = 'col' | 'tag' | 'biblikube';
const id = (d: Difference) => `${d.key}:${d.field}`;
/** Dans Zotero, le dossier et l'étiquette ne disent pas la même chose. */
const isConflict = (d: Difference) => d.zCol !== d.zTag;
const chosenValue = (d: Difference, c: Choice): Value => (c === 'col' ? d.zCol : c === 'tag' ? d.zTag : d.local);
/** Par défaut : Zotero quand il est d'accord avec lui-même ; sinon (ou si une modification attend l'envoi), Biblikube. */
const defaultChoice = (d: Difference): Choice => (d.pending || isConflict(d) ? 'biblikube' : 'col');

export function CompareZotero({ onClose }: { onClose: () => void }) {
  const { project: p, update, client, markDirty } = useProject();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [diffs, setDiffs] = useState<Difference[] | null>(null);
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [field, setField] = useState<Field | 'all'>('all');
  const [undo, setUndo] = useState<Pick<Project, 'screening' | 'fulltext' | 'duplicates' | 'notRetrieved'> & { keys: string[] } | null>(null);
  const [done, setDone] = useState('');

  const run = async () => {
    if (!client) return;
    setBusy('Lecture des fiches dans Zotero…');
    setError('');
    setDone('');
    try {
      const keys = Object.keys(p.records);
      const items: ZItem[] = [];
      for (let i = 0; i < keys.length; i += 50) {
        setBusy(`Lecture des fiches dans Zotero… ${Math.min(i + 50, keys.length)} / ${keys.length}`);
        items.push(...(await client.itemsByKeys(keys.slice(i, i + 50))));
      }
      const d = compareWithZotero(p, items);
      setDiffs(d);
      // Par défaut : garder Zotero, sauf si Biblikube a une modification pas encore envoyée.
      setChoice(Object.fromEntries(d.map((x) => [id(x), defaultChoice(x)])));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const shown = useMemo(() => (diffs ?? []).filter((d) => field === 'all' || d.field === field), [diffs, field]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of diffs ?? []) c[d.field] = (c[d.field] ?? 0) + 1;
    return c;
  }, [diffs]);
  const conflicts = useMemo(() => (diffs ?? []).filter(isConflict).length, [diffs]);
  const setAll = (c: Choice) => setChoice((cur) => ({ ...cur, ...Object.fromEntries(shown.map((d) => [id(d), c])) }));
  // Ce qui changerait vraiment dans Biblikube.
  const changing = (diffs ?? []).filter((d) => chosenValue(d, choice[id(d)] ?? 'biblikube') !== d.local);

  const apply = () => {
    if (!diffs) return;
    const toZotero = changing.map((d) => ({ ...d, zotero: chosenValue(d, choice[id(d)]) }));
    const keys = [...new Set(diffs.map((d) => d.key))];
    setUndo({ screening: p.screening, fulltext: p.fulltext, duplicates: p.duplicates, notRetrieved: p.notRetrieved, keys });
    update((cur) => keepZotero(cur, toZotero));
    // Toutes les références concernées sont réécrites : Zotero reçoit l'état choisi, dossiers et étiquettes d'accord.
    markDirty(keys);
    const kz = toZotero.length;
    const kb = diffs.length - kz;
    setDone(`Appliqué : ${kz} décision${kz > 1 ? 's' : ''} de Biblikube remplacée${kz > 1 ? 's' : ''} par celle de Zotero, ${kb} écart${kb > 1 ? 's' : ''} réglé${kb > 1 ? 's' : ''} en gardant Biblikube. Zotero est mis à jour à la synchronisation (dossiers et étiquettes d’accord).`);
    setDiffs(null);
  };

  const cancel = () => {
    if (!undo) return;
    const { keys, ...prev } = undo;
    update((cur) => ({ ...cur, ...prev }));
    markDirty(keys);
    setUndo(null);
    setDone('Annulé : Biblikube est revenu à son état d’avant la réparation.');
  };

  const title = (k: string) => p.records[k]?.title || '(sans titre)';

  return (
    <Portal>
      <div className="overlay above-guide" onClick={onClose}>
        <div className="modal stack transfer" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0 }}>Comparer avec Zotero</h2>
            <span className="spacer" />
            <button className="btn small" onClick={onClose} title="Fermer">
              <X size={15} />
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Biblikube relit toutes les fiches de la revue dans Zotero (dossiers et étiquettes {p.sync.tagPrefix || 'LF'}:…) et montre celles où Zotero ne dit pas la
            même chose que lui : après un travail fait directement dans Zotero, sur un autre appareil, ou par un autre outil. Rien ne change sans votre
            accord.
          </p>
          {!client && <div className="notice warn small">Reliez cette revue à Zotero pour comparer.</div>}
          {error && <div className="notice warn small">Lecture impossible : {error}</div>}
          {done && (
            <div className="notice small row" style={{ flexWrap: 'wrap' }}>
              {done}
              <span className="spacer" />
              {undo && (
                <button className="btn small" onClick={cancel}>
                  <Undo2 size={13} /> Annuler
                </button>
              )}
            </div>
          )}

          {!diffs && (
            <div className="row">
              <button className="btn primary" disabled={!client || !!busy} onClick={() => void run()}>
                {busy || (done ? 'Comparer de nouveau' : 'Lancer la comparaison')}
              </button>
              <span className="small muted">{Object.keys(p.records).length} références à relire</span>
            </div>
          )}

          {diffs && diffs.length === 0 && <div className="notice small">✓ Tout est d’accord : Biblikube et Zotero disent la même chose pour toutes les références.</div>}

          {diffs && diffs.length > 0 && (
            <>
              <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                <strong>
                  {diffs.length} écart{diffs.length > 1 ? 's' : ''} sur {new Set(diffs.map((d) => d.key)).size} référence
                  {new Set(diffs.map((d) => d.key)).size > 1 ? 's' : ''}
                </strong>
                <div className="seg">
                  <button className={field === 'all' ? 'on' : ''} onClick={() => setField('all')}>
                    Tous <span className="seg-count">{diffs.length}</span>
                  </button>
                  {(['screening', 'fulltext', 'duplicate'] as Field[])
                    .filter((f) => counts[f])
                    .map((f) => (
                      <button key={f} className={field === f ? 'on' : ''} onClick={() => setField(f)}>
                        {FIELD[f]} <span className="seg-count">{counts[f]}</span>
                      </button>
                    ))}
                </div>
                <span className="spacer" />
                <button className="btn small" onClick={() => setAll('col')}>
                  Tout : garder les dossiers
                </button>
                <button className="btn small" onClick={() => setAll('tag')}>
                  Tout : garder les étiquettes
                </button>
                <button className="btn small" onClick={() => setAll('biblikube')}>
                  Tout : garder Biblikube
                </button>
              </div>
              {conflicts > 0 && (
                <div className="notice warn small">
                  ⚠️ <strong>
                    {conflicts} écart{conflicts > 1 ? 's' : ''} où Zotero se contredit lui-même
                  </strong>{' '}
                  : le dossier dit une chose, l’étiquette {p.sync.tagPrefix || 'LF'}:… une autre. Ça arrive quand un outil ou une personne déplace des
                  fiches entre dossiers sans changer les étiquettes (ou l’inverse). Biblikube ne tranche pas à votre place : ces lignes restent sur
                  « Biblikube » (Biblikube ne change pas, et Zotero sera remis comme lui). Si c’est Zotero qui a raison, choisissez « Dossier » ou
                  « Étiquette ».
                </div>
              )}
              <div className="table-wrap compare-wrap">
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Référence</th>
                      <th>Étape</th>
                      <th>Biblikube</th>
                      <th>Zotero</th>
                      <th>Garder</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((d) => {
                      const c = choice[id(d)];
                      const split = d.zCol !== d.zTag;
                      return (
                        <tr key={id(d)}>
                          <td>
                            {title(d.key)}
                            {d.pending && <span className="badge maybe" style={{ marginLeft: '0.4rem' }}>pas encore envoyé</span>}
                          </td>
                          <td className="small">{FIELD[d.field]}</td>
                          <td>
                            <strong>{VALUE(d.local, d.field)}</strong>
                          </td>
                          <td>
                            {split ? (
                              <div className="small">
                                dossier : <strong>{VALUE(d.zCol, d.field)}</strong>
                                <br />
                                étiquette : <strong>{VALUE(d.zTag, d.field)}</strong>
                              </div>
                            ) : (
                              <strong>{VALUE(d.zCol, d.field)}</strong>
                            )}
                          </td>
                          <td>
                            <div className="seg small-seg">
                              {split ? (
                                <>
                                  <button className={c === 'col' ? 'on' : ''} onClick={() => setChoice({ ...choice, [id(d)]: 'col' })}>
                                    Dossier
                                  </button>
                                  <button className={c === 'tag' ? 'on' : ''} onClick={() => setChoice({ ...choice, [id(d)]: 'tag' })}>
                                    Étiquette
                                  </button>
                                </>
                              ) : (
                                <button className={c === 'col' || c === 'tag' ? 'on' : ''} onClick={() => setChoice({ ...choice, [id(d)]: 'col' })}>
                                  Zotero
                                </button>
                              )}
                              <button className={c === 'biblikube' ? 'on' : ''} onClick={() => setChoice({ ...choice, [id(d)]: 'biblikube' })}>
                                Biblikube
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                « Zotero », « Dossier » ou « Étiquette » : Biblikube prend cette valeur. « Biblikube » : Zotero est remis comme Biblikube le dit. Dans tous les
                cas, dossiers et étiquettes sont ensuite réécrits pour être d’accord.
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn small" onClick={() => exportProjectJson(p)}>
                  Télécharger une sauvegarde d’abord
                </button>
                <span className="spacer" />
                <button className="btn" onClick={() => setDiffs(null)}>
                  Fermer sans rien changer
                </button>
                <button className="btn primary" onClick={apply}>
                  Appliquer ({changing.length} décision{changing.length > 1 ? 's' : ''} changée{changing.length > 1 ? 's' : ''} dans Biblikube)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
