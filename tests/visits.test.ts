import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countVisit } from '../src/lib/visits';

const sent: string[] = [];
beforeEach(() => {
  sent.length = 0;
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  vi.stubGlobal('screen', { width: 1440, height: 900 });
  vi.stubGlobal('window', { devicePixelRatio: 2 });
  vi.stubGlobal('Image', class { set src(v: string) { sent.push(v); } });
});
const loc = (hostname: string, pathname = '/Biblikube/') => ({ hostname, pathname }) as Location;
const nav = (o: object = {}) => o as Navigator;

describe('compteur de visites', () => {
  it('compte une seule fois par jour, sans rien d’autre que la page et l’écran', () => {
    countVisit(loc('wicrian.github.io'), nav());
    countVisit(loc('wicrian.github.io'), nav());
    expect(sent).toHaveLength(1);
    const u = new URL(sent[0]);
    expect(u.origin).toBe('https://biblikube.goatcounter.com');
    expect([...u.searchParams.keys()].sort()).toEqual(['p', 'rnd', 's', 't']);
    expect(u.searchParams.get('s')).toBe('1440,900,2');
  });
  it('ne compte pas la version test, les essais locaux ni « ne pas me suivre »', () => {
    countVisit(loc('wicrian.github.io', '/Biblikube/test/'), nav());
    countVisit(loc('localhost'), nav());
    countVisit(loc('wicrian.github.io'), nav({ doNotTrack: '1' }));
    countVisit(loc('wicrian.github.io'), nav({ globalPrivacyControl: true }));
    expect(sent).toHaveLength(0);
  });
});
