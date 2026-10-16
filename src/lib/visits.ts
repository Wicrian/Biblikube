// Compteur de visites anonyme (GoatCounter, logiciel libre, sans cookie).
//
// Pourquoi : savoir si Biblikube est utilisé (donc s'il vaut la peine de le
// maintenir) et sur quels appareils, pour vérifier qu'il y fonctionne bien.
// Ce qui part : un seul signal par navigateur et par jour, avec la taille de
// l'écran. GoatCounter en déduit le pays et le type d'appareil ; il ne garde
// pas l'adresse IP. Rien des revues, de Zotero ni de la personne n'est envoyé.
// Pas de signal : version test, essais sur l'ordinateur, ou navigateur qui
// demande à ne pas être suivi.

const ENDPOINT = 'https://biblikube.goatcounter.com/count';
const KEY = 'litflow.lastVisit';

export function countVisit(loc: Location = window.location, nav: Navigator = navigator): void {
  try {
    if (loc.hostname !== 'wicrian.github.io' || loc.pathname.includes('/test/')) return;
    const n = nav as Navigator & { globalPrivacyControl?: boolean };
    if (n.doNotTrack === '1' || n.globalPrivacyControl) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(KEY) === today) return;
    localStorage.setItem(KEY, today);
    const q = new URLSearchParams({
      p: '/',
      t: 'Biblikube',
      s: [screen.width, screen.height, window.devicePixelRatio || 1].join(','),
      rnd: Math.random().toString(36).slice(2),
    });
    // Une simple image : aucun script extérieur n'est chargé.
    new Image().src = `${ENDPOINT}?${q}`;
  } catch {
    // Navigateur en mode privé strict, etc. : on ne compte pas, sans gêner.
  }
}
