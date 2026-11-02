import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/lib/demo';
import { compareWithZotero, keepZotero } from '../src/lib/compareZotero';
import { desiredState } from '../src/zotero/sync';
import type { ZItem } from '../src/zotero/api';

const d = (decision: 'include' | 'exclude' | 'maybe') => ({ decision, reasons: ['r'], note: 'n', at: '2026-11-01T10:00:00Z' });
const COLS = { root: 'R', duplicates: 'DUP', screening_include: 'SI', screening_exclude: 'SE', screening_maybe: 'SM', fulltext_exclude: 'FE', fulltext_maybe: 'FM', fulltext_notretrieved: 'FN', included: 'INC' };

function setup() {
  const p = demoProject();
  p.zoteroCollections = COLS;
  p.fulltextPool = 'include-maybe';
  const [a, b, c, e] = Object.keys(p.records);
  p.screening = { [a]: d('include'), [b]: d('maybe'), [c]: d('exclude'), [e]: d('include') };
  p.fulltext = { [a]: d('include'), [b]: d('maybe') };
  // Ce que Biblikube a écrit dans Zotero, fiche par fiche.
  const item = (k: string, mutate?: (cols: string[], tags: string[]) => void): ZItem => {
    const w = desiredState(p, k);
    const cols = w.collections.map((x) => COLS[x as keyof typeof COLS]);
    const tags = [...w.tags];
    mutate?.(cols, tags);
    return { key: k, version: 1, data: { key: k, version: 1, itemType: 'journalArticle', collections: cols, tags: tags.map((tag) => ({ tag })) } };
  };
  return { p, a, b, c, e, item };
}

describe('comparer avec Zotero', () => {
  it('rien à signaler quand Zotero est comme Biblikube', () => {
    const { p, a, b, c, item } = setup();
    expect(compareWithZotero(p, [item(a), item(b), item(c)])).toEqual([]);
  });
  it('repère un dossier déplacé dans Zotero (étiquette restée ancienne)', () => {
    const { p, b, c, e, item } = setup();
    const moved = item(b, (cols) => cols.splice(cols.indexOf('FM'), 1, 'INC'));
    const tagOnly = item(c, (_cols, tags) => tags.splice(tags.indexOf('LF:tri:exclu'), 1, 'LF:tri:inclus'));
    const diffs = compareWithZotero(p, [moved, tagOnly, item(e)]);
    expect(diffs.map((x) => [x.key, x.field, x.local, x.zCol, x.zTag, x.zotero])).toEqual([
      [b, 'fulltext', 'maybe', 'include', 'maybe', 'include'],
      [c, 'screening', 'exclude', 'exclude', 'include', 'include'],
    ]);
  });
  it('garder Zotero met Biblikube à jour (note gardée, raisons seulement si même décision)', () => {
    const { p, b, item } = setup();
    const moved = item(b, (cols) => cols.splice(cols.indexOf('FM'), 1, 'INC'));
    const np = keepZotero(p, compareWithZotero(p, [moved]), '2026-11-02T00:00:00Z');
    expect(np.fulltext[b]).toEqual({ decision: 'include', reasons: [], note: 'n', at: '2026-11-02T00:00:00Z' });
    expect(p.fulltext[b].decision).toBe('maybe');
  });
});
