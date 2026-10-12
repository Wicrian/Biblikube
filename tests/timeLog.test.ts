import { describe, expect, it } from 'vitest';
import { newProject } from '../src/lib/frameworks';
import { estimatePast, formatDuration, recordActivity, sessionRows, summarize, withoutBursts } from '../src/lib/timeLog';
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
    const burst = Array.from({ length: 20 }, (_, i) => T0 + i * 10);
    const manual = [T0 + min(5), T0 + min(6), T0 + min(8)];
    expect(withoutBursts([...burst, ...manual])).toEqual(manual);
  });

  it('estime les séances passées d’après l’heure des décisions', () => {
    const p = newProject('Test');
    const at = (t: number) => new Date(t).toISOString();
    p.screening = {
      A: { decision: 'include', reasons: [], note: '', at: at(T0) },
      B: { decision: 'exclude', reasons: [], note: '', at: at(T0 + min(1)) },
      C: { decision: 'exclude', reasons: [], note: '', at: at(T0 + min(3)) },
      D: { decision: 'include', reasons: [], note: '', at: at(T0 + min(20)) }, // pause trop longue : non comptée
      E: { decision: 'include', reasons: [], note: '', at: at(T0 + min(120)) }, // autre séance
    };
    const rows = estimatePast(p);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ decisions: 4, activeMs: min(3), estimated: true });
    expect(rows[1]).toMatchObject({ decisions: 1, activeMs: min(1) });
  });

  it('mélange séances estimées (avant la minuterie) et mesurées', () => {
    const p = newProject('Test');
    const at = (t: number) => new Date(t).toISOString();
    p.screening = {
      A: { decision: 'include', reasons: [], note: '', at: at(T0 - min(600)) },
      B: { decision: 'exclude', reasons: [], note: '', at: at(T0 + min(5)) },
    };
    p.timeLog = [{ start: at(T0), end: at(T0 + min(30)), activeMs: min(25), views: { screening: min(25) } }];
    const rows = sessionRows(p);
    expect(rows.map((r) => r.estimated)).toEqual([false, true]);
    expect(rows[0].decisions).toBe(1);
    const s = summarize(rows, T0 + min(40));
    expect(s.totalMs).toBe(min(26));
    expect(s.estimatedMs).toBe(min(1));
    expect(s.sessions).toBe(2);
  });

  it('affiche les durées simplement', () => {
    expect(formatDuration(20_000)).toBe('moins d’1 min');
    expect(formatDuration(min(42))).toBe('42 min');
    expect(formatDuration(min(65))).toBe('1 h 05');
  });
});
