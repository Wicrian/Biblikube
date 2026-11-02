// Garde-fou : bandeau affiché quand Zotero a changé beaucoup de décisions d'un coup.
import { useMemo, useState } from 'react';
import { useProject } from '../store';
import { countByField, type ChangeField } from '../lib/pullGuard';
import { exportProjectJson } from '../lib/export';

const FIELD: Record<ChangeField, string> = {
  screening: 'Tri titre-résumé',
  fulltext: 'Texte intégral',
  duplicate: 'Doublon',
  organisation: 'Classement',
};

export function HeldPullBanner() {
  const { project: p, heldPull: h, resolveHeldPull } = useProject();
  const [open, setOpen] = useState(false);
  const [confirmKeep, setConfirmKeep] = useState(false);
  const counts = useMemo(() => (h ? countByField(h.changes) : null), [h]);
  if (!h || !counts) return null;
  const n = h.keys.length;
  const parts = (Object.keys(FIELD) as ChangeField[])
    .filter((f) => counts[f])
    .map((f) => `${FIELD[f].toLowerCase()} : ${counts[f]}`);
  const title = (k: string) => p.records[k]?.title || h.incoming.find((r) => r.key === k)?.title || '(sans titre)';

  return (
    <div className="notice warn stack held-pull" style={{ marginBottom: '1rem', gap: '0.6rem' }}>
      <div>
        <strong>
          ⚠️ Zotero a changé {n} références d’un coup ({parts.join(' · ')}).
        </strong>{' '}
        Ça arrive après un déplacement de beaucoup de fiches, un autre outil, ou Biblikube ouvert dans un autre onglet.
        Par prudence, Biblikube n’a <strong>rien repris</strong> et ne lit plus Zotero tant que vous n’avez pas choisi.
        Vos décisions continuent d’être envoyées normalement.
      </div>

      {open && (
        <div className="table-wrap compare-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Étape</th>
                <th>Dans Biblikube</th>
                <th>Dans Zotero</th>
              </tr>
            </thead>
            <tbody>
              {h.changes.map((c) => (
                <tr key={`${c.key}:${c.field}`}>
                  <td>{title(c.key)}</td>
                  <td className="small">{FIELD[c.field]}</td>
                  <td>{c.from}</td>
                  <td>
                    <strong>{c.to}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmKeep ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <span className="small">
            Biblikube garde ses décisions et <strong>remet ces {n} références dans Zotero</strong> comme il les connaît
            (dossiers et étiquettes). Les nouvelles références et les fiches corrigées dans Zotero sont quand même reprises.
          </span>
          <span className="spacer" />
          <button className="btn small" onClick={() => setConfirmKeep(false)}>
            Retour
          </button>
          <button className="btn small primary" onClick={() => resolveHeldPull(false)}>
            Oui, remettre Zotero
          </button>
        </div>
      ) : (
        <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <button className="btn small" onClick={() => setOpen(!open)}>
            {open ? 'Cacher le détail' : 'Voir le détail'}
          </button>
          <button className="btn small" onClick={() => exportProjectJson(p)}>
            Télécharger une sauvegarde
          </button>
          <span className="spacer" />
          <button className="btn small" onClick={() => setConfirmKeep(true)}>
            Garder Biblikube
          </button>
          <button className="btn small primary" onClick={() => resolveHeldPull(true)}>
            Reprendre les changements de Zotero
          </button>
        </div>
      )}
    </div>
  );
}
