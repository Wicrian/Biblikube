import { describe, expect, it } from 'vitest';
import { demoProject } from '../src/lib/demo';
import { firstView, guideSteps, newGuide, visibleViews, type ViewId } from '../src/lib/guide';

const ALL: ViewId[] = ['protocol', 'search', 'import', 'dedup', 'screening', 'fulltext', 'organisation', 'records', 'prisma'];

describe('parcours et guide', () => {
  it('sans niveau choisi, toute l’interface est visible (revues existantes)', () => {
    expect(visibleViews(demoProject(), ALL)).toEqual(ALL);
  });
  it('« Organiser » ne montre que les étapes utiles, « + étapes » montre tout', () => {
    const p = { ...demoProject(), mode: 'organise' as const, guide: newGuide() };
    expect(visibleViews(p, ALL)).toEqual(['import', 'dedup', 'organisation', 'records']);
    expect(visibleViews({ ...p, guide: { ...p.guide, showAll: true } }, ALL)).toEqual(ALL);
  });
  it('les étapes du guide se cochent selon le travail fait', () => {
    const p = { ...demoProject(), mode: 'sort' as const, guide: newGuide() };
    const ids = guideSteps(p, 2).map((s) => [s.id, s.done]);
    expect(ids).toEqual([
      ['zotero', true],
      ['dedup', false],
      ['screen', false],
      ['plan', false],
      ['classify', false],
    ]);
    expect(guideSteps(p, 0).find((s) => s.id === 'dedup')!.done).toBe(true);
  });
  it('la revue systématique commence par la question et finit par le PRISMA', () => {
    const p = { ...demoProject(), mode: 'systematic' as const, guide: { ...newGuide(), visited: ['prisma'] } };
    const steps = guideSteps(p, 0);
    expect(steps[0].id).toBe('question');
    expect(steps.at(-1)).toMatchObject({ id: 'prisma', done: true });
  });
  it('premier écran : les doublons s’il y en a, sinon le tri ou l’organisation', () => {
    const p = { ...demoProject(), mode: 'organise' as const };
    expect(firstView(p, 3)).toBe('dedup');
    expect(firstView(p, 0)).toBe('organisation');
  });
});

import { reportData, reportHtml } from '../src/lib/report';
import { fromTemplate, setAssignment, toggleMarker } from '../src/lib/organisation';

describe('rapport « Point d’étape »', () => {
  const theme = { accent: '#8b6cf0', soft: '#ebe5fd', include: '#2f9a72', exclude: '#d4506f', maybe: '#c98a1d', text: '#222', muted: '#666', name: 'Innovation' };
  it('s’adapte : sans tri ni plan, ni décisions ni organisation', () => {
    const p = { ...demoProject(), mode: 'organise' as const };
    const d = reportData(p);
    expect(d.screening).toBeNull();
    expect(d.plan).toBeNull();
    const html = reportHtml(d, theme);
    expect(html).not.toContain('Décisions du tri');
    expect(html).not.toContain('Commentaire');
  });
  it('compte catégories, marqueurs et articles clés, et ajoute le commentaire', () => {
    let p = demoProject();
    p.screening.DEMO0001 = { decision: 'include', reasons: [], note: '', at: '' };
    p.screening.DEMO0003 = { decision: 'exclude', reasons: ['Hors sujet'], note: '', at: '' };
    p = { ...p, organisation: fromTemplate(p, 'memoire', 'Mémoire'), reportComment: 'Voir avec ma direction <vite>' };
    const intro = p.organisation.categories[0];
    p.organisation = setAssignment(p.organisation, 'DEMO0001', [intro.id]);
    const citer = p.organisation.markers.find((m) => /citer/i.test(m.name))!;
    p.organisation = toggleMarker(p.organisation, 'DEMO0001', citer.id);
    const d = reportData(p);
    expect(d.screening).toMatchObject({ include: 1, exclude: 1 });
    expect(d.plan!.categories[0]).toMatchObject({ label: intro.name, count: 1 });
    expect(d.plan!.keyArticles).toHaveLength(1);
    expect(d.reasons).toEqual([{ label: 'Hors sujet', count: 1 }]);
    const html = reportHtml(d, theme);
    expect(html).toContain('Voir avec ma direction &lt;vite&gt;');
    expect(html).toContain('#8b6cf0');
  });
});
