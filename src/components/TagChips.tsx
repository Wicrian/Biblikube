// Pastilles des marqueurs Zotero de la personne, avec leurs couleurs Zotero.
import { useEffect, useState } from 'react';
import { useProject } from '../store';
import type { RecordItem } from '../types';
import type { ZoteroClient } from '../zotero/api';
import { userTags } from '../lib/tags';

type Colors = { list: { name: string; color: string }[]; version: number };
const cache = new Map<string, Colors>();
const listeners = new Set<() => void>();
const libId = (c: ZoteroClient | null) => (c?.library ? `${c.library.type}:${c.library.id}` : '');

/** Couleurs des marqueurs de la bibliothèque, lues une fois puis partagées. */
export function useTagColors() {
  const { client } = useProject();
  const id = libId(client);
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    if (client && id && !cache.has(id)) {
      cache.set(id, { list: [], version: 0 });
      client
        .tagColors()
        .then((c) => {
          cache.set(id, { list: c.colors, version: c.version });
          listeners.forEach((f) => f());
        })
        .catch(() => cache.delete(id));
    }
    return () => void listeners.delete(l);
  }, [client, id]);
  const cur = cache.get(id) ?? { list: [], version: 0 };
  const map = new Map(cur.list.map((c) => [c.name, c.color]));
  /** Donne (ou retire, avec null) une couleur à un marqueur, dans Zotero. */
  const setColor = async (name: string, color: string | null) => {
    if (!client) return;
    const fresh = await client.tagColors();
    const list = fresh.colors.filter((c) => c.name !== name);
    if (color) list.push({ name, color });
    await client.setTagColors(list, fresh.version);
    const after = await client.tagColors();
    cache.set(id, { list: after.colors, version: after.version });
    listeners.forEach((f) => f());
  };
  return { colors: map, setColor };
}

export function TagChips({ r, max = 12, small = false }: { r: RecordItem; max?: number; small?: boolean }) {
  const { project: p } = useProject();
  const { colors } = useTagColors();
  const tags = userTags(p, r);
  if (!tags.length) return null;
  // Les marqueurs en couleur d'abord, comme dans Zotero.
  const sorted = [...tags].sort((a, b) => Number(colors.has(b)) - Number(colors.has(a)));
  return (
    <span className={`tag-chips ${small ? 'small' : ''}`}>
      {sorted.slice(0, max).map((t) => {
        const c = colors.get(t);
        return (
          <span key={t} className="tag-chip" style={c ? { background: `${c}22`, borderColor: c } : undefined} title="Marqueur Zotero">
            {c && <i style={{ background: c }} />}
            {t}
          </span>
        );
      })}
      {tags.length > max && <span className="tag-chip more">+{tags.length - max}</span>}
    </span>
  );
}
