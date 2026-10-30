import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/lib/demo';
import { changeTags, hasTagOrFamily, opChange, planMerge, planParent, tagIndex, variantGroups } from '../src/lib/tags';

function withTags() {
  const p = demoProject();
  const keys = Object.keys(p.records);
  const set = (i: number, tags: string[]) => (p.records[keys[i]] = { ...p.records[keys[i]], zoteroTags: tags });
  set(0, ['santé mentale', 'LF:tri:inclus', 'pair-aidance']);
  set(1, ['Santé mentale']);
  set(2, ['sante mentale', 'pairs aidants']);
  set(3, ['pair aidance', 'méthodologie']);
  set(4, ['Méthodologie', 'santé mentale']);
  return { p, keys };
}

describe('marqueurs Zotero', () => {
  it('liste les marqueurs sans les étiquettes de Biblikube', () => {
    const { p } = withTags();
    const idx = tagIndex(p);
    expect(idx.has('LF:tri:inclus')).toBe(false);
    expect(idx.get('santé mentale')).toHaveLength(2);
  });
  it('repère les variantes (majuscules, accents, tirets, pluriel)', () => {
    const { p } = withTags();
    const groups = variantGroups(tagIndex(p)).map((g) => [...g].sort());
    expect(groups).toContainEqual(['Santé mentale', 'sante mentale', 'santé mentale'].sort());
    expect(groups).toContainEqual(['pair aidance', 'pair-aidance'].sort());
    expect(groups).toContainEqual(['Méthodologie', 'méthodologie'].sort());
  });
  it('fusion puis défusion : chaque fiche retrouve ses marqueurs', () => {
    const { p, keys } = withTags();
    const op = planMerge(p, ['Santé mentale', 'sante mentale', 'santé mentale'], 'santé mentale');
    expect(Object.keys(op.items).sort()).toEqual([keys[0], keys[1], keys[2], keys[4]].sort());
    const tags2 = [{ tag: 'sante mentale' }, { tag: 'pairs aidants' }, { tag: 'LF:tri:exclu' }];
    const merged = changeTags(tags2, opChange(op, keys[2]).remove, opChange(op, keys[2]).add);
    expect(merged.map((t) => t.tag)).toEqual(['pairs aidants', 'LF:tri:exclu', 'santé mentale']);
    const back = changeTags(merged, opChange(op, keys[2], true).remove, opChange(op, keys[2], true).add);
    expect(back.map((t) => t.tag).sort()).toEqual(tags2.map((t) => t.tag).sort());
    // Une fiche qui avait déjà le nom gardé le garde après défusion.
    const t0 = [{ tag: 'santé mentale' }];
    expect(changeTags(t0, opChange(op, keys[0], true).remove, opChange(op, keys[0], true).add).map((t) => t.tag)).toEqual(['santé mentale']);
  });
  it('familles : filtre et marqueur parent écrit dans Zotero', () => {
    const { p, keys } = withTags();
    const fam = { id: 'f1', name: 'Pair-aidance (famille)', children: ['pair-aidance', 'pairs aidants', 'pair aidance'] };
    p.tagWork = { families: [fam], history: [] };
    expect(hasTagOrFamily(p, p.records[keys[2]], 'famille:f1')).toBe(true);
    expect(hasTagOrFamily(p, p.records[keys[1]], 'famille:f1')).toBe(false);
    const op = planParent(p, fam);
    expect(Object.keys(op.items).sort()).toEqual([keys[0], keys[2], keys[3]].sort());
    expect(opChange(op, keys[0])).toEqual({ remove: [], add: ['Pair-aidance (famille)'] });
  });
});

describe('marqueurs créés dans Biblikube', () => {
  it('s’écrivent « LF:Important » ; l’ancienne forme est encore comprise', async () => {
    const { markerNameFromTag, markerTag, newMarker } = await import('../src/lib/organisation');
    const p = demoProject();
    expect(markerTag(p, newMarker('Important'))).toBe('LF:Important');
    expect(markerTag(p, newMarker('tri: à revoir'))).toBe('LF:marqueur:tri: à revoir');
    expect(markerNameFromTag('LF', 'LF:Important')).toBe('Important');
    expect(markerNameFromTag('LF', 'LF:marqueur:À citer')).toBe('À citer');
    for (const t of ['LF:tri:inclus', 'LF:texte:exclu', 'LF:doublon', 'LF:tri:raison:Hors sujet', 'LF:rayyan:x', 'Important']) expect(markerNameFromTag('LF', t)).toBeNull();
  });
  it('sans « LF: » dans Zotero, le marqueur redevient un marqueur Zotero ordinaire', async () => {
    const { reconcileOrganisation } = await import('../src/zotero/organisationSync');
    const { newMarker } = await import('../src/lib/organisation');
    const p = demoProject();
    const m = newMarker('Important');
    const k = Object.keys(p.records)[0];
    p.organisation = { ...p.organisation, markers: [m], markerAssignments: { [k]: [m.id] } };
    const r = { ...p.records[k], zoteroTags: ['Important'] };
    const { org } = reconcileOrganisation(p, [r], new Set());
    expect(org.markerAssignments[k]).toBeUndefined();
  });
});

describe('passage à « LF:Important »', () => {
  it('les références qui ont un marqueur seront réécrites à la prochaine synchronisation', async () => {
    const { upgradeProject } = await import('../src/lib/frameworks');
    const p = demoProject();
    const k = Object.keys(p.records)[0];
    p.library = { type: 'user', id: '1', name: 'x' };
    p.organisation = { ...p.organisation, markers: [{ id: 'm1', name: 'Important', color: '#000' }], markerAssignments: { [k]: ['m1'] } };
    delete (p.sync as { markerTags?: number }).markerTags;
    const u = upgradeProject(p);
    expect(u.sync.pending).toContain(k);
    expect(u.sync.markerTags).toBe(2);
    expect(upgradeProject(u).sync.pending.filter((x) => x === k)).toHaveLength(1);
  });
});
