import { describe, expect, it } from 'vitest';
import { newProject } from '../src/lib/frameworks';
import { estimatePast, formatDuration, recordActivity, recordReturn, sessionRows, summarize, withoutBursts } from '../src/lib/timeLog';
import { setAsideDecisions, setAsideText } from '../src/lib/prisma';
import type { TimeSession } from '../src/types';

const T0 = Date.parse('2026-10-12T14:00:00Z');
const min = (n: number) => n * 60_000;

describe('minuterie', () => {
  it('compte le temps actif, se met en pause après 2 min et ouvre une séance après 30 min', () => {
    let log: TimeSession[] = [];
    log = recordActivity(log, T0, 'screening');
    log = recordActivity(log, T0 + min(1), 'screening'); // +1 min
    log = recordActivity(log, T0 + min(2), 'organisation'); // +1 min
    log = recordActivity(log, T0 + min(12), 'organisation'); // pause de 10 min : non comptée
    log = recordActivity(log, T0 + min(13), 'organisation'); // +1 min
    expect(log).toHaveLength(1);
    expect(log[0].activeMs).toBe(min(3));
    expect(log[0].views).toEqual({ screening: min(1), organisation: min(2) });
    expect(log[0].end).toBe(new Date(T0 + min(13)).toISOString());

    log = recordActivity(log, T0 + min(50), 'screening'); // 37 min d'absence
    expect(log).toHaveLength(2);
    expect(log[1].activeMs).toBe(0);
  });

  it('ignore les décisions importées en rafale', () => {
    const burst = Array.from({ length: 20 }, (_, i) => ({ t: T0 + i * 10 }));
    const manual = [T0 + min(5), T0 + min(6), T0 + min(8)].map((t) => ({ t }));
    expect(withoutBursts([...burst, ...manual])).toEqual(manual);
  });

  it('estime les séances passées d’après l’heure des décisions', () => {
    const p = newProject('Test');
    const at = (t: number) => new Date(t).toISOString();
    p.records = Object.fromEntries([...'ABCDE'].map((k) => [k, { key: k } as never]));
    p.screening = {
      A: { decision: 'include', reasons: [], note: '', at: at(T0) },
      B: { decision: 'exclude', reasons: [], note: '', at: at(T0 + min(1)) },
      C: { decision: 'exclude', reasons: [], note: '', at: at(T0 + min(3)) },
      D: { decision: 'include', reasons: [], note: '', at: at(T0 + min(20)) }, // pause trop longue : non comptée
      E: { decision: 'include', reasons: [], note: '', at: at(T0 + min(120)) }, // autre séance
    };
    const rows = estimatePast(p);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ decisions: { screening: 4, fulltext: 0 }, activeMs: min(3), estimated: true });
    expect(rows[1]).toMatchObject({ decisions: { screening: 1, fulltext: 0 }, activeMs: min(1) });
  });

  it('mélange séances estimées (avant la minuterie) et mesurées', () => {
    const p = newProject('Test');
    const at = (t: number) => new Date(t).toISOString();
    p.records = Object.fromEntries([...'ABD'].map((k) => [k, { key: k } as never]));
    p.screening = {
      A: { decision: 'include', reasons: [], note: '', at: at(T0 - min(600)) },
      B: { decision: 'exclude', reasons: [], note: '', at: at(T0 + min(5)) },
      C: { decision: 'exclude', reasons: [], note: '', at: at(T0 + min(6)) }, // retirée ensuite : le travail compte quand même
      D: { decision: 'exclude', reasons: [], note: '', at: at(T0 + min(7)) }, // doublon écarté ensuite : idem
    };
    p.duplicates = { D: 'B' } as never;
    p.fulltext = { A: { decision: 'include', reasons: [], note: '', at: at(T0 + min(8)) } };
    p.timeLog = [{ start: at(T0), end: at(T0 + min(30)), activeMs: min(25), views: { screening: min(15), records: min(10) } }];
    const rows = sessionRows(p);
    expect(rows.map((r) => r.estimated)).toEqual([false, true]);
    expect(rows[0].decisions).toEqual({ screening: 3, fulltext: 1 });
    const s = summarize(rows, T0 + min(40));
    expect(s.totalMs).toBe(min(26));
    expect(s.estimatedMs).toBe(min(1));
    expect(s.sessions).toBe(2);
    expect(s.screening).toMatchObject({ ms: min(16), decisions: 4 });
    expect(s.fulltext).toMatchObject({ ms: 0, decisions: 1 }); // temps du texte intégral non mesuré
    expect(setAsideDecisions(p, 'screening')).toEqual({ duplicates: 1, removed: 1 });
    expect(setAsideText({ duplicates: 1, removed: 1 })).toBe('1 marquée ensuite comme doublon et 1 retirée ensuite de la revue');
  });

  it('compte l’hésitation et la consultation, mais pas une ouverture de quelques secondes', () => {
    const p = newProject('Test');
    let log: TimeSession[] = [];
    log = recordActivity(log, T0, 'screening'); // ouverture
    log = recordActivity(log, T0 + min(1), 'screening'); // lecture, hésitation
    log = recordActivity(log, T0 + min(2), 'screening');
    // Le lendemain : 6 minutes à relire la liste des références.
    for (let i = 0; i <= 6; i++) log = recordActivity(log, T0 + min(1440 + i), 'records');
    // Le surlendemain : ouverte 20 secondes par erreur.
    log = recordActivity(log, T0 + min(2880), 'records');
    log = recordActivity(log, T0 + min(2880) + 20_000, 'records');
    expect(log).toHaveLength(3);
    const rows = sessionRows(p, log);
    expect(rows.map((r) => r.activeMs)).toEqual([min(6), min(2)]);
  });

  it('compte le temps passé dans un autre onglet si l’on revient dans les 5 minutes', () => {
    let log: TimeSession[] = recordActivity([], T0, 'screening');
    log = recordActivity(log, T0 + min(1), 'screening');
    // Va vérifier quelque chose 4 minutes, puis revient.
    log = recordReturn(log, T0 + min(1.5), T0 + min(5.5), 'screening');
    expect(log[0].activeMs).toBe(min(5.5));
    // Part 10 minutes : ne compte pas.
    const after = recordReturn(log, T0 + min(6), T0 + min(16), 'screening');
    expect(after[0].activeMs).toBe(min(5.5));
  });

  it('affiche les durées simplement', () => {
    expect(formatDuration(20_000)).toBe('moins d’1 min');
    expect(formatDuration(min(42))).toBe('42 min');
    expect(formatDuration(min(65))).toBe('1 h 05');
  });
});
