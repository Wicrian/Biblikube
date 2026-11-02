import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/lib/demo';
import { countByField, describePull, keepBiblikube } from '../src/lib/pullGuard';

const d = (decision: 'include' | 'exclude' | 'maybe') => ({ decision, reasons: [], note: '', at: '2026-11-01T10:00:00Z' });

describe('garde-fou des gros changements venus de Zotero', () => {
  it('décrit les changements étape par étape', () => {
    const before = demoProject();
    const [a, b, c] = Object.keys(before.records);
    before.screening = { [a]: d('include'), [b]: d('maybe') };
    before.fulltext = { [b]: d('include') };
    const after = { ...before, screening: { [a]: d('exclude'), [b]: d('maybe') }, fulltext: {}, notRetrieved: { [b]: '2026-11-02' }, duplicates: { [c]: '' } };
    const changes = describePull(before, after, [a, b, c]);
    expect(changes.map((x) => [x.key, x.field, x.from, x.to])).toEqual([
      [a, 'screening', 'inclus', 'exclu'],
      [b, 'fulltext', 'inclus', 'introuvable'],
      [c, 'duplicate', 'pas doublon', 'doublon'],
    ]);
    expect(countByField(changes)).toEqual({ screening: 1, fulltext: 1, duplicate: 1, organisation: 0 });
  });

  it('« garder Biblikube » reprend les fiches mais pas les décisions', () => {
    const p = demoProject();
    const [a] = Object.keys(p.records);
    p.screening = { [a]: d('include') };
    p.sync.libraryVersion = 5;
    const updated = { ...p.records[a], title: 'Titre corrigé', version: p.records[a].version + 1 };
    const fresh = { ...p.records[a], key: 'NOUVEAU1', title: 'Nouvelle référence' };
    const out = keepBiblikube(p, [updated, fresh], 9);
    expect(out.records[a].title).toBe('Titre corrigé');
    expect(out.records.NOUVEAU1.title).toBe('Nouvelle référence');
    expect(out.screening[a].decision).toBe('include');
    expect(out.sync.libraryVersion).toBe(9);
  });
});
