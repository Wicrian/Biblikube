// « Transférer la revue vers une autre bibliothèque » : associe les références,
// montre le bilan, puis crée une nouvelle revue reliée à la destination.
// La revue actuelle et ses références dans Zotero ne sont pas modifiées.
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useProject } from '../store';
import type { Project, RecordItem, ZoteroLibrary } from '../types';
import { ZoteroClient, type ZCollection } from '../zotero/api';
import { importFromZotero } from '../zotero/sync';
import { matchRecords, transferProject, transferSummary, type MatchResult, type TransferTarget } from '../lib/transfer';
import { saveProject } from '../lib/storage';
import { Portal } from './Portal';

const DECISION: Record<string, string> = { include: 'inclus', exclude: 'exclu', maybe: 'incertain' };

export function TransferDialog({ libraries, onClose }: { libraries: ZoteroLibrary[]; onClose: () => void }) {
  const { project: p, settings } = useProject();
  const [libId, setLibId] = useState('');
  const lib = libraries.find((l) => `${l.type}:${l.id}` === libId) ?? null;
  const client = useMemo(() => (lib && settings.apiKey ? new ZoteroClient(settings.apiKey, lib) : null), [lib, settings.apiKey]);
  const [collections, setCollections] = useState<ZCollection[]>([]);
  const [colKey, setColKey] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [target, setTarget] = useState<TransferTarget | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const [name, setName] = useState(p.name);

  useEffect(() => {
    setCollections([]);
    setColKey('');
    setTarget(null);
    setMatch(null);
    if (!client) return;
    client
      .collections()
      .then(setCollections)
      .catch((e) => setError(String(e.message ?? e)));
  }, [client]);

  const tree: { c: ZCollection; depth: number }[] = [];
  const walk = (parent: string | false, depth: number) =>
    collections
      .filter((c) => c.data.parentCollection === parent)
      .sort((a, b) => a.data.name.localeCompare(b.data.name, 'fr'))
      .forEach((c) => {
        tree.push({ c, depth });
        walk(c.key, depth + 1);
      });
  walk(false, 0);
  const same = lib && p.library && lib.type === p.library.type && lib.id === p.library.id && colKey === p.sourceCollection?.key;

  const compare = async () => {
    const col = collections.find((c) => c.key === colKey);
    if (!client || !lib || !col) return;
    setError('');
    setBusy('Lecture de la destination…');
    try {
      const tmp: Project = {
        ...p,
        library: lib,
        sourceCollection: { key: col.key, name: col.data.name },
        zoteroCollections: {},
        organisation: { ...p.organisation, rootKey: null, categories: [] },
      };
      const res = await importFromZotero(client, tmp, (m) => setBusy(m));
      setBusy('Comparaison des références…');
      const m = matchRecords(Object.values(p.records), res.records);
      setTarget({ library: lib, collection: { key: col.key, name: col.data.name }, ...res });
      setMatch(m);
      setRefused([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const pairs = useMemo(() => {
    if (!match) return {};
    const out = { ...match.pairs };
    for (const k of refused) delete out[k];
    return out;
  }, [match, refused]);
  const summary = match ? transferSummary(p, pairs) : null;
  const dst = useMemo(() => Object.fromEntries((target?.records ?? []).map((r) => [r.key, r])), [target]);

  const create = async () => {
    if (!target || !match) return;
    const np = { ...transferProject(p, target, pairs), name: name.trim() || p.name };
    await saveProject(np);
    window.dispatchEvent(new CustomEvent('biblikube:open-project', { detail: np }));
  };

  const decisionOf = (k: string) => {
    const d = p.fulltext[k] ?? p.screening[k];
    return d ? `${p.fulltext[k] ? 'texte intégral' : 'tri'} : ${DECISION[d.decision] ?? d.decision}` : '';
  };
  const label = (r?: RecordItem) => (r ? `${r.title || '(sans titre)'}${r.year ? ` (${r.year})` : ''}` : '');

  return (
    <Portal>
      <div className="overlay above-guide" onClick={onClose}>
        <div className="modal stack transfer" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <h2 style={{ margin: 0 }}>Transférer la revue vers une autre bibliothèque</h2>
            <span className="spacer" />
            <button className="btn small" onClick={onClose} title="Fermer">
              <X size={15} />
            </button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Pour continuer cette revue sur les mêmes références rangées ailleurs (par exemple la bibliothèque de groupe partagée avec votre
            direction). Biblikube retrouve chaque référence, vous montre le bilan, puis crée une <strong>nouvelle revue</strong> avec votre
            travail. Cette revue-ci et ses références dans Zotero ne sont pas modifiées.
          </p>

          <div className="grid2" style={{ gap: '0.75rem' }}>
            <label className="field">
              <span>Bibliothèque de destination</span>
              <select value={libId} onChange={(e) => setLibId(e.target.value)}>
                <option value="">— Choisir —</option>
                {libraries.map((l) => (
                  <option key={`${l.type}:${l.id}`} value={`${l.type}:${l.id}`}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Collection qui contient les mêmes références</span>
              <select value={colKey} onChange={(e) => setColKey(e.target.value)} disabled={!lib}>
                <option value="">{lib && !collections.length ? 'Lecture…' : '— Choisir —'}</option>
                {tree.map(({ c, depth }) => (
                  <option key={c.key} value={c.key}>
                    {'  '.repeat(depth * 2)}
                    {depth ? '└ ' : ''}
                    {c.data.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {same && <div className="notice warn small">C’est la collection de cette revue : choisissez la collection de destination.</div>}
          <div className="row">
            <button className="btn primary" disabled={!colKey || !!same || !!busy} onClick={() => void compare()}>
              {busy || 'Comparer les références'}
            </button>
          </div>
          {error && <div className="notice warn small">{error}</div>}

          {match && summary && target && (
            <div className="stack transfer-report">
              <div className="tiles">
                <div className="tile t1">
                  <div className="tile-label">Retrouvées</div>
                  <div className="tile-value">
                    {Object.keys(pairs).length} / {Object.keys(p.records).length}
                  </div>
                </div>
                <div className="tile t4">
                  <div className="tile-label">À vérifier</div>
                  <div className="tile-value">{match.doubtful.filter((k) => !refused.includes(k)).length}</div>
                </div>
                <div className="tile t2">
                  <div className="tile-label">Non retrouvées</div>
                  <div className="tile-value">{match.unmatched.length + refused.length}</div>
                </div>
                <div className="tile t3">
                  <div className="tile-label">Nouvelles dans la destination</div>
                  <div className="tile-value">{match.newInTarget.length}</div>
                </div>
              </div>

              <div>
                <strong>Ce qui sera transféré</strong>
                <ul className="small" style={{ margin: '0.3rem 0 0' }}>
                  <li>
                    Tri titre-résumé : {summary.screening[0]} décision{summary.screening[0] > 1 ? 's' : ''} sur {summary.screening[1]}
                  </li>
                  {summary.fulltext[1] > 0 && (
                    <li>
                      Texte intégral : {summary.fulltext[0]} sur {summary.fulltext[1]}
                    </li>
                  )}
                  {summary.duplicates[1] > 0 && (
                    <li>
                      Doublons : {summary.duplicates[0]} sur {summary.duplicates[1]}
                    </li>
                  )}
                  {summary.classified[1] > 0 && (
                    <li>
                      Organisation : {summary.classified[0]} référence{summary.classified[0] > 1 ? 's' : ''} classée{summary.classified[0] > 1 ? 's' : ''} sur{' '}
                      {summary.classified[1]}
                    </li>
                  )}
                  <li>Protocole, question de recherche, raisons, notes de décision et temps de travail</li>
                </ul>
                <div className="small muted">Les corrections faites dans l’écran Fiches restent dans les fiches de l’ancienne bibliothèque.</div>
              </div>

              {match.doubtful.length > 0 && (
                <details open>
                  <summary>
                    <strong>À vérifier ({match.doubtful.length})</strong> : associées par un titre proche ou une année différente
                  </summary>
                  <ul className="transfer-list">
                    {match.doubtful.map((k) => (
                      <li key={k} className={refused.includes(k) ? 'off' : ''}>
                        <span>
                          {label(p.records[k])}
                          <br />→ {label(dst[match.pairs[k]])}
                          {decisionOf(k) && <span className="badge maybe" style={{ marginLeft: '0.4rem' }}>{decisionOf(k)}</span>}
                        </span>
                        <label className="small row" style={{ gap: '0.25rem' }}>
                          <input
                            type="checkbox"
                            checked={!refused.includes(k)}
                            onChange={(e) => setRefused(e.target.checked ? refused.filter((x) => x !== k) : [...refused, k])}
                          />
                          même référence
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {match.unmatched.length > 0 && (
                <details>
                  <summary>
                    <strong>Non retrouvées ({match.unmatched.length})</strong> : leur travail ne sera pas transféré
                  </summary>
                  <ul className="transfer-list">
                    {match.unmatched.map((k) => (
                      <li key={k}>
                        <span>
                          {label(p.records[k])}
                          {decisionOf(k) && <span className="badge maybe" style={{ marginLeft: '0.4rem' }}>{decisionOf(k)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {match.newInTarget.length > 0 && (
                <div className="small muted">
                  {match.newInTarget.length} référence{match.newInTarget.length > 1 ? 's' : ''} de la destination n’existe{match.newInTarget.length > 1 ? 'nt' : ''} pas dans
                  cette revue : elle{match.newInTarget.length > 1 ? 's' : ''} sera{match.newInTarget.length > 1 ? 'ont' : ''} à trier.
                </div>
              )}

              <label className="field">
                <span>Nom de la nouvelle revue</span>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="notice small">
                À la première synchronisation, Biblikube écrira vos décisions dans « {target.library.name} » : étiquettes {p.sync.tagPrefix || 'LF'}:… et
                collection « Biblikube – {name.trim() || p.name} ». Dans une bibliothèque de groupe, tous les membres les verront. L’ancienne revue
                reste dans « Mes revues ».
              </div>
              <div className="row">
                <span className="spacer" />
                <button className="btn" onClick={onClose}>
                  Annuler
                </button>
                <button className="btn primary" disabled={!Object.keys(pairs).length} onClick={() => void create()}>
                  Créer la revue dans « {target.library.name.replace(/^Groupe : /, '')} »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}
