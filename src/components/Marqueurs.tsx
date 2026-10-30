// Écran « Marqueurs » : les marqueurs Zotero de la personne sur les références
// de la revue. Variantes proposées, fusion (réversible), familles, couleurs.
import { useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useProject } from '../store';
import type { Project, TagFamily, TagOp } from '../types';
import type { ZoteroClient } from '../zotero/api';
import { changeTags, opChange, planMerge, planParent, tagIndex, variantGroups, ZOTERO_COLORS } from '../lib/tags';
import { useTagColors } from './tagColors';

/** Applique (ou défait) une opération sur les fiches Zotero ; renvoie les nouveaux marqueurs de chaque fiche. */
async function runOp(client: ZoteroClient, p: Project, op: TagOp, undo: boolean) {
  const keys = Object.keys(op.items).filter((k) => p.records[k]);
  const tagsAfter: Record<string, string[]> = {};
  const failed: string[] = [];
  for (let i = 0; i < keys.length; i += 50) {
    const items = await client.itemsByKeys(keys.slice(i, i + 50));
    const writes = items.flatMap((it) => {
      const { remove, add } = opChange(op, it.key, undo);
      const before = (it.data.tags ?? []).map((t) => t.tag);
      const tags = changeTags(it.data.tags ?? [], remove, add);
      const names = tags.map((t) => t.tag);
      // Rien à changer sur cette fiche (elle avait déjà le bon marqueur).
      if (names.length === before.length && names.every((t) => before.includes(t))) return [];
      tagsAfter[it.key] = names;
      return [{ key: it.key, version: it.version, tags }];
    });
    if (!writes.length) continue;
    const res = await client.writeItems(writes);
    for (const f of Object.values(res.failed)) if (f.key) failed.push(f.key);
  }
  for (const k of failed) delete tagsAfter[k];
  return { tagsAfter, failed };
}

const when = (iso: string) => new Date(iso).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' });

export function Marqueurs() {
  const { project: p, update, client } = useProject();
  const index = useMemo(() => tagIndex(p), [p]);
  const work = p.tagWork ?? { families: [], history: [] };
  const ignored = new Set(p.tagWork?.ignoredVariants ?? []);
  const variants = useMemo(() => variantGroups(index), [index]).filter((g) => !ignored.has([...g].sort().join('|')));
  const { colors, setColor } = useTagColors();
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [palette, setPalette] = useState<string | null>(null);
  const n = (t: string) => index.get(t)?.length ?? 0;

  const saveWork = (fn: (w: NonNullable<Project['tagWork']>) => NonNullable<Project['tagWork']>) =>
    update((cur) => ({ ...cur, tagWork: fn(cur.tagWork ?? { families: [], history: [] }) }));

  /** Écrit l'opération dans Zotero, met à jour les références et l'historique. */
  const apply = async (op: TagOp, undo = false) => {
    if (!client) return setMessage('Reliez cette revue à Zotero pour modifier les marqueurs.');
    setBusy(undo ? 'Annulation dans Zotero…' : 'Écriture dans Zotero…');
    setMessage('');
    try {
      const { tagsAfter, failed } = await runOp(client, p, op, undo);
      update((cur) => {
        const records = { ...cur.records };
        const pre = `${cur.sync.tagPrefix.trim() || 'LF'}:`;
        for (const [k, tags] of Object.entries(tagsAfter)) if (records[k]) records[k] = { ...records[k], zoteroTags: [...tags.filter((t) => !t.startsWith(pre)), ...records[k].zoteroTags.filter((t) => t.startsWith(pre))] };
        const w = cur.tagWork ?? { families: [], history: [] };
        const history = undo ? w.history.map((h) => (h.id === op.id ? { ...h, undoneAt: new Date().toISOString() } : h)) : [op, ...w.history];
        // Après une fusion, les familles parlent du marqueur gardé.
        const families =
          !undo && op.kind === 'merge'
            ? w.families.map((f) => ({ ...f, children: [...new Set(f.children.map((c) => (op.sources.includes(c) ? op.target : c)))] }))
            : w.families;
        return { ...cur, records, tagWork: { ...w, families, history } };
      });
      const done = Object.keys(tagsAfter).length;
      setMessage(
        `${undo ? 'Annulé' : 'Fait'} : ${done} fiche${done > 1 ? 's' : ''} modifiée${done > 1 ? 's' : ''} dans Zotero.` +
          (failed.length ? ` ${failed.length} n’ont pas pu l’être (fiche modifiée entre-temps ?) : réessayez.` : ''),
      );
      setSelected([]);
    } catch (e) {
      setMessage(`Zotero a refusé la modification : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy('');
    }
  };

  const merge = (sources: string[], target: string) => {
    const t = target.trim();
    if (!t || !sources.length) return;
    const op = planMerge(p, sources, t);
    const count = Object.keys(op.items).length;
    if (!confirm(`Remplacer ${sources.filter((s) => s !== t).map((s) => `« ${s} »`).join(', ')} par « ${t} » sur ${count} fiche${count > 1 ? 's' : ''} de cette revue ?\n\nVous pourrez annuler dans l’historique.`)) return;
    void apply(op);
  };

  const addFamily = (fname: string, children: string[]) => {
    const t = fname.trim();
    if (!t || !children.length) return;
    saveWork((w) => ({ ...w, families: [...w.families, { id: crypto.randomUUID(), name: t, children: children.filter((c) => c !== t) }] }));
    setSelected([]);
    setName('');
  };

  const writeParent = (f: TagFamily) => {
    const op = planParent(p, f);
    const count = Object.keys(op.items).length;
    if (!count) return setMessage(`Toutes les fiches de la famille ont déjà « ${f.name} ».`);
    if (!confirm(`Ajouter le marqueur « ${f.name} » dans Zotero aux ${count} fiche${count > 1 ? 's' : ''} qui ont un marqueur de cette famille ?\n\nVous pourrez annuler dans l’historique.`)) return;
    void apply(op);
  };

  const toggle = (t: string) => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const familiesOf = (t: string) => work.families.filter((f) => f.children.includes(t) || f.name === t).map((f) => f.name);

  if (!index.size)
    return (
      <section className="panel">
        <p style={{ margin: 0 }}>
          Aucune référence de cette revue n’a encore de marqueur Zotero. Les marqueurs (« tags ») que vous ajoutez dans Zotero apparaîtront ici
          après une synchronisation.
        </p>
      </section>
    );

  return (
    <div className="stack">
      <section className="panel stack">
        <p className="small muted" style={{ margin: 0 }}>
          Vos marqueurs Zotero sur les références de cette revue. Les étiquettes de Biblikube ({p.sync.tagPrefix || 'LF'}:…) n’apparaissent pas ici.
          Fusions et marqueurs parents ne touchent <strong>que les références de cette revue</strong>, et s’annulent depuis l’historique.
        </p>
        {busy && <div className="notice small">{busy}</div>}
        {message && <div className="notice small">{message}</div>}
      </section>

      {variants.length > 0 && (
        <section className="panel stack">
          <h2 style={{ margin: 0 }}>Variantes possibles ({variants.length})</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Majuscules, accents, pluriels ou orthographes proches. Choisissez le nom à garder, ou indiquez que ce ne sont pas des variantes.
          </p>
          {variants.map((g) => (
            <VariantCard
              key={g.join('|')}
              group={g}
              count={n}
              disabled={!!busy}
              onMerge={(target) => merge(g, target)}
              onIgnore={() => saveWork((w) => ({ ...w, ignoredVariants: [...(w.ignoredVariants ?? []), [...g].sort().join('|')] }))}
            />
          ))}
        </section>
      )}

      {work.families.length > 0 && (
        <section className="panel stack">
          <h2 style={{ margin: 0 }}>Familles</h2>
          <p className="small muted" style={{ margin: 0 }}>
            Une famille regroupe des marqueurs proches. Elle sert à filtrer dans le Tri et l’Organisation (« Marqueur Zotero »). Elle reste dans
            Biblikube, sauf si vous écrivez le parent dans Zotero.
          </p>
          {work.families.map((f) => {
            const refs = new Set([f.name, ...f.children].flatMap((t) => index.get(t) ?? []));
            return (
              <div key={f.id} className="family-row">
                <strong>{f.name}</strong>
                <span className="small muted">
                  {refs.size} référence{refs.size > 1 ? 's' : ''}
                </span>
                <span className="tag-chips small" style={{ margin: 0 }}>
                  {f.children.map((c) => (
                    <span key={c} className="tag-chip">
                      {c}
                      <button
                        className="chip-x"
                        title="Retirer de la famille"
                        onClick={() => saveWork((w) => ({ ...w, families: w.families.map((x) => (x.id === f.id ? { ...x, children: x.children.filter((y) => y !== c) } : x)) }))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </span>
                <span className="spacer" />
                {selected.length > 0 && (
                  <button
                    className="btn small"
                    onClick={() => saveWork((w) => ({ ...w, families: w.families.map((x) => (x.id === f.id ? { ...x, children: [...new Set([...x.children, ...selected])] } : x)) }))}
                  >
                    + Ajouter la sélection
                  </button>
                )}
                <button className="btn small" disabled={!!busy} onClick={() => writeParent(f)} title="Option : ajouter aussi ce marqueur dans Zotero">
                  Écrire « {f.name} » dans Zotero
                </button>
                <button className="btn small" onClick={() => confirm(`Supprimer la famille « ${f.name} » ? Les marqueurs ne changent pas.`) && saveWork((w) => ({ ...w, families: w.families.filter((x) => x.id !== f.id) }))}>
                  Supprimer
                </button>
              </div>
            );
          })}
        </section>
      )}

      <section className="panel stack">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Tous les marqueurs ({index.size})</h2>
          <span className="spacer" />
          <span className="small muted">Cochez des marqueurs pour les fusionner ou en faire une famille.</span>
        </div>
        {selected.length > 0 && (
          <div className="tag-actions">
            <span className="small">
              <strong>{selected.length}</strong> sélectionné{selected.length > 1 ? 's' : ''}
            </span>
            <input value={name} placeholder={selected[0]} onChange={(e) => setName(e.target.value)} list="tag-names" />
            <datalist id="tag-names">
              {selected.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <button className="btn small primary" disabled={!!busy || selected.length < 1} onClick={() => merge(selected, name || [...selected].sort((a, b) => n(b) - n(a))[0])}>
              Fusionner sous ce nom
            </button>
            <button className="btn small" onClick={() => addFamily(name || 'Nouvelle famille', selected)}>
              Créer une famille avec ce nom
            </button>
            <button className="btn small" onClick={() => setSelected([])}>
              Désélectionner
            </button>
          </div>
        )}
        <div className="table-wrap">
          <table className="tag-table">
            <thead>
              <tr>
                <th />
                <th>Couleur</th>
                <th>Marqueur</th>
                <th>Références</th>
                <th className="hide-mobile">Famille</th>
              </tr>
            </thead>
            <tbody>
              {[...index.entries()].map(([t, keys]) => (
                <tr key={t} className={selected.includes(t) ? 'on' : ''}>
                  <td>
                    <input type="checkbox" checked={selected.includes(t)} onChange={() => toggle(t)} aria-label={`Choisir ${t}`} />
                  </td>
                  <td style={{ position: 'relative' }}>
                    <button className="color-dot" style={{ background: colors.get(t) ?? 'transparent' }} title="Couleur dans Zotero" onClick={() => setPalette(palette === t ? null : t)} />
                    {palette === t && (
                      <div className="palette">
                        {ZOTERO_COLORS.map((c) => (
                          <button
                            key={c}
                            style={{ background: c }}
                            title={c}
                            onClick={() => {
                              setPalette(null);
                              void setColor(t, c).catch((e) => setMessage(`Couleur non enregistrée : ${e.message ?? e}`));
                            }}
                          />
                        ))}
                        <button
                          className="none"
                          title="Sans couleur"
                          onClick={() => {
                            setPalette(null);
                            void setColor(t, null).catch((e) => setMessage(`Couleur non retirée : ${e.message ?? e}`));
                          }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{ cursor: 'pointer' }} onClick={() => toggle(t)}>
                    {t}
                  </td>
                  <td>{keys.length}</td>
                  <td className="hide-mobile small muted">{familiesOf(t).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small muted">Les couleurs sont enregistrées dans Zotero : elles apparaissent aussi dans le sélecteur de marqueurs de Zotero.</div>
      </section>

      {work.history.length > 0 && (
        <section className="panel stack">
          <h2 style={{ margin: 0 }}>Historique</h2>
          {work.history.map((h) => (
            <div key={h.id} className={`history-row ${h.undoneAt ? 'undone' : ''}`}>
              <span className="small muted">{when(h.at)}</span>
              <span>
                {h.kind === 'merge' ? (
                  <>
                    Fusion de {h.sources.map((s) => `« ${s} »`).join(', ')} dans « {h.target} »
                  </>
                ) : (
                  <>Marqueur parent « {h.target} » ajouté dans Zotero</>
                )}{' '}
                <span className="small muted">
                  · {Object.keys(h.items).length} fiche{Object.keys(h.items).length > 1 ? 's' : ''}
                </span>
              </span>
              <span className="spacer" />
              {h.undoneAt ? (
                <span className="small muted">Annulé le {when(h.undoneAt)}</span>
              ) : (
                <button className="btn small" disabled={!!busy} onClick={() => confirm('Remettre chaque fiche comme avant ?') && void apply(h, true)}>
                  <Undo2 size={13} /> {h.kind === 'merge' ? 'Défusionner' : 'Annuler'}
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function VariantCard({ group, count, disabled, onMerge, onIgnore }: { group: string[]; count: (t: string) => number; disabled: boolean; onMerge: (target: string) => void; onIgnore: () => void }) {
  const [target, setTarget] = useState(group[0]);
  return (
    <div className="variant-card">
      <div className="tag-chips" style={{ margin: 0 }}>
        {group.map((t) => (
          <label key={t} className={`tag-chip pick ${t === target ? 'on' : ''}`}>
            <input type="radio" checked={t === target} onChange={() => setTarget(t)} />
            {t} <span className="muted">({count(t)})</span>
          </label>
        ))}
      </div>
      <div className="row small" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
        <span className="muted">Garder :</span>
        <input value={target} onChange={(e) => setTarget(e.target.value)} style={{ minWidth: '12rem' }} />
        <button className="btn small primary" disabled={disabled || !target.trim()} onClick={() => onMerge(target)}>
          Fusionner
        </button>
        <button className="btn small" onClick={onIgnore}>
          Ce ne sont pas des variantes
        </button>
      </div>
    </div>
  );
}
