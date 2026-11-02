import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/lib/demo';
import { computePrisma, fulltextKeys, hiddenFulltextDecisions } from '../src/lib/prisma';
import { desiredState } from '../src/zotero/sync';

const d = (decision: 'include' | 'exclude' | 'maybe') => ({ decision, reasons: [], note: '', at: '2026-11-02T10:00:00Z' });

function project() {
  const p = demoProject();
  const ks = Object.keys(p.records).filter((k) => !['DEMO0018'].includes(k));
  p.screening = { [ks[0]]: d('include'), [ks[1]]: d('maybe'), [ks[2]]: d('maybe'), [ks[3]]: d('exclude') };
  p.fulltext = { [ks[0]]: d('include'), [ks[1]]: d('include'), [ks[3]]: d('exclude') };
  return { p, ks };
}

describe('qui passe au texte intégral', () => {
  it('par défaut : les inclus au tri ; les autres décisions sont signalées', () => {
    const { p, ks } = project();
    const ft = fulltextKeys(p);
    expect(ft).toContain(ks[0]);
    expect(ft).not.toContain(ks[1]);
    expect(hiddenFulltextDecisions(p)).toEqual({ maybe: 1, exclude: 1, none: 0 });
  });
  it('inclus et incertains : les incertains entrent, le PRISMA le dit', () => {
    const { p, ks } = project();
    p.fulltextPool = 'include-maybe';
    const ft = fulltextKeys(p);
    expect(ft).toEqual(expect.arrayContaining([ks[0], ks[1], ks[2]]));
    expect(ft).not.toContain(ks[3]);
    expect(hiddenFulltextDecisions(p)).toEqual({ maybe: 0, exclude: 1, none: 0 });
    const c = computePrisma(p);
    expect(c.main.sought).toBe(3);
    expect(c.soughtFromMaybe).toBe(2);
    expect(c.main.included).toBe(2);
    // Une décision « inclus » en texte intégral sur un incertain va bien dans « 3 – Inclus dans la revue ».
    expect(desiredState(p, ks[1]).collections).toContain('included');
  });
  it('toutes les références : hors PRISMA', () => {
    const { p, ks } = project();
    p.fulltextPool = 'all';
    expect(fulltextKeys(p)).toEqual(expect.arrayContaining([ks[3], ks[5]]));
    expect(hiddenFulltextDecisions(p)).toEqual({ maybe: 0, exclude: 0, none: 0 });
    const c = computePrisma(p);
    expect(c.poolAll).toBe(true);
    expect(c.main.sought).toBe(1);
  });
});
