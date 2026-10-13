// Rapport « Point d'étape » : les chiffres de la revue, puis une page HTML
// imprimable (Enregistrer en PDF) aux couleurs de l'ambiance choisie.

import type { Project } from '../types';
import { findDuplicateGroups } from './dedup';
import { categoryLabel, orderedCategories } from './organisation';
import { fulltextKeys, screeningKeys, setAsideDecisions, setAsideNote } from './prisma';
import { authorsShort } from './text';

export interface ReportData {
  name: string;
  date: string;
  modeLabel: string;
  question: string;
  comment: string;
  identified: number;
  duplicates: number;
  unique: number;
  openDuplicates: number;
  sourcesCount: number;
  /** `aside` : décisions prises sur des références écartées ensuite (texte, vide si aucune). */
  screening: { total: number; include: number; exclude: number; maybe: number; aside: string } | null;
  fulltext: { total: number; done: number; include: number; exclude: number; notRetrieved: number } | null;
  steps: { label: string; pct: number; text: string }[];
  plan: {
    name: string;
    pool: number;
    poolLabel: string;
    classified: number;
    categories: { label: string; count: number; sub: boolean }[];
    markers: { name: string; count: number }[];
    keyMarker: string | null;
    keyArticles: { ref: string; cats: string; decision: string }[];
  } | null;
  reasons: { label: string; count: number }[];
  sources: { name: string; count: number; kind: string }[];
  organiseFirst: boolean;
}

const KIND = { database: 'Base de données', register: 'Registre', other: 'Autre méthode' } as const;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function reportData(p: Project, today = new Date()): ReportData {
  const records = Object.values(p.records);
  const duplicates = records.filter((r) => r.key in p.duplicates).length;
  const unique = records.length - duplicates;
  const openDuplicates = findDuplicateGroups(records.filter((r) => !(r.key in p.duplicates))).filter((g) => !p.notDuplicateGroups.includes(g.id)).length;
  const sk = screeningKeys(p);
  const sd = sk.map((k) => p.screening[k]?.decision).filter(Boolean);
  const usesScreening = p.mode !== 'organise' && sd.length > 0;
  const fk = fulltextKeys(p);
  const fd = fk.map((k) => p.fulltext[k]?.decision).filter(Boolean);
  const usesFulltext = p.mode !== 'organise' && (fd.length > 0 || Object.keys(p.notRetrieved).length > 0);

  const screening = usesScreening
    ? { total: sk.length, include: sd.filter((d) => d === 'include').length, exclude: sd.filter((d) => d === 'exclude').length, maybe: sd.filter((d) => d === 'maybe').length, aside: setAsideNote(setAsideDecisions(p, 'screening'), 'screening').text }
    : null;
  const notRetrieved = fk.filter((k) => k in p.notRetrieved).length;
  const fulltext = usesFulltext
    ? { total: fk.length, done: fk.filter((k) => p.fulltext[k] || k in p.notRetrieved).length, include: fd.filter((d) => d === 'include').length, exclude: fd.filter((d) => d === 'exclude').length, notRetrieved }
    : null;

  // Organisation : le « réservoir » d'articles à classer suit l'avancée du tri.
  const o = p.organisation;
  let plan: ReportData['plan'] = null;
  if (o.name) {
    const included = records.filter((r) => p.fulltext[r.key]?.decision === 'include').map((r) => r.key);
    const retained = records.filter((r) => !(r.key in p.duplicates) && ['include', 'maybe'].includes(p.screening[r.key]?.decision ?? '')).map((r) => r.key);
    const all = records.filter((r) => !(r.key in p.duplicates)).map((r) => r.key);
    const [poolKeys, poolLabel] = p.mode !== 'organise' && included.length ? [included, 'incluses'] : p.mode !== 'organise' && retained.length ? [retained, 'retenues au tri'] : [all, 'au total'];
    const classifiedKeys = Object.keys(o.assignments).filter((k) => (o.assignments[k] ?? []).length && !(k in p.duplicates));
    const count = (id: string) => classifiedKeys.filter((k) => o.assignments[k].includes(id)).length;
    const keyMarker = o.markers.find((m) => /citer/i.test(m.name)) ?? o.markers.find((m) => /important/i.test(m.name)) ?? null;
    const keyArticles = keyMarker
      ? records
          .filter((r) => (o.markerAssignments[r.key] ?? []).includes(keyMarker.id))
          .slice(0, 8)
          .map((r) => {
            const f = p.fulltext[r.key]?.decision;
            const s = p.screening[r.key]?.decision;
            const d = f ?? s;
            return {
              ref: `${authorsShort(r.creators, 2) || 'Auteur inconnu'} (${r.year ?? 's.d.'}). ${r.title}`,
              cats: (o.assignments[r.key] ?? []).map((id) => o.categories.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c).map((c) => categoryLabel(o, c)).join(', ') || '—',
              decision: d === 'include' ? '✓ Incluse' : d === 'exclude' ? '✕ Exclue' : d === 'maybe' ? '? Incertaine' : '—',
            };
          })
      : [];
    plan = {
      name: o.name,
      pool: poolKeys.length,
      poolLabel,
      classified: classifiedKeys.filter((k) => poolKeys.includes(k)).length,
      categories: orderedCategories(o).map((c) => ({ label: c.name, count: count(c.id), sub: !!c.parent })),
      markers: o.markers.map((m) => ({ name: m.name, count: Object.values(o.markerAssignments).filter((ids) => ids.includes(m.id)).length })).filter((m) => m.count > 0),
      keyMarker: keyMarker?.name ?? null,
      keyArticles,
    };
  }

  const reasonCount = new Map<string, number>();
  for (const d of [...Object.values(p.screening), ...Object.values(p.fulltext)])
    if (d.decision === 'exclude') for (const r of d.reasons) reasonCount.set(r, (reasonCount.get(r) ?? 0) + 1);
  const reasons = [...reasonCount].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  const steps: ReportData['steps'] = [];
  steps.push({ label: 'Identification', pct: records.length ? 100 : 0, text: records.length ? '✓' : 'à faire' });
  steps.push({ label: 'Doublons', pct: openDuplicates ? 50 : records.length ? 100 : 0, text: openDuplicates ? `${openDuplicates} à vérifier` : records.length ? '✓' : '—' });
  if (screening) {
    const done = screening.include + screening.exclude + screening.maybe;
    steps.push({ label: 'Tri titre-résumé', pct: pct(done, screening.total), text: done >= screening.total ? '✓' : `${pct(done, screening.total)} %` });
  }
  if (fulltext) steps.push({ label: 'Texte intégral', pct: pct(fulltext.done, fulltext.total), text: fulltext.done >= fulltext.total ? '✓' : `${pct(fulltext.done, fulltext.total)} %` });
  if (plan) steps.push({ label: 'Organisation', pct: pct(plan.classified, plan.pool), text: `${pct(plan.classified, plan.pool)} %` });

  const sources = p.sources
    .map((s) => ({ name: s.name, count: records.filter((r) => r.sources.includes(s.name)).length, kind: KIND[s.kind] }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    name: p.name,
    date: today.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }),
    modeLabel: p.mode === 'organise' ? 'Organisation des lectures' : p.mode === 'sort' ? 'Tri et organisation' : 'Revue systématique',
    question: p.question.trim(),
    comment: (p.reportComment ?? '').trim(),
    identified: records.length,
    duplicates,
    unique,
    openDuplicates,
    sourcesCount: sources.length,
    screening,
    fulltext,
    steps,
    plan,
    reasons,
    sources,
    organiseFirst: p.mode === 'organise',
  };
}

export interface ReportTheme {
  accent: string;
  soft: string;
  include: string;
  exclude: string;
  maybe: string;
  text: string;
  muted: string;
  name: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (x: number) => x.toLocaleString('fr-CA');

/** Page HTML autonome du rapport (2 pages environ au format Lettre). */
export function reportHtml(d: ReportData, t: ReportTheme, fontCss = '', logoUrl = ''): string {
  const tile = (v: string, l: string, sub = '') => `<div class="card tile"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="d">${sub}</div>` : ''}</div>`;
  const bars = (rows: { label: string; count: number; sub?: boolean }[], color: string, faded = false) => {
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows
      .map(
        (r) =>
          `<div class="cat${r.sub ? ' sub' : ''}"><span class="nm">${r.sub ? '↳ ' : ''}${esc(r.label)}</span><div class="bar" style="width:${((r.count / max) * 100).toFixed(1)}%;background:${color};${faded || r.sub ? 'opacity:.55' : ''}"></div><span class="num">${n(r.count)}</span></div>`,
      )
      .join('');
  };
  const tiles: string[] = [tile(n(d.identified), 'références', d.sourcesCount ? `${d.sourcesCount} source(s)` : '')];
  if (d.duplicates || d.openDuplicates) tiles.push(tile(n(d.duplicates), 'doublons écartés', `${n(d.unique)} références uniques`));
  if (d.screening) tiles.push(tile(n(d.screening.include + d.screening.maybe), 'retenues au tri', `dont ${n(d.screening.maybe)} incertaines`));
  if (d.fulltext) tiles.push(tile(n(d.fulltext.include), 'incluses dans la revue', `${n(d.fulltext.done)} textes intégraux évalués`));
  if (d.plan) tiles.push(tile(`${pct(d.plan.classified, d.plan.pool)} %`, 'classées dans le plan', `${n(d.plan.classified)} sur ${n(d.plan.pool)} ${d.plan.poolLabel}`));

  const decisions = d.screening
    ? (() => {
        const rows: [string, number, string][] = [
          ['✓ Incluses', d.screening.include, t.include],
          ['? Incertaines', d.screening.maybe, t.maybe],
          ['✕ Exclues', d.screening.exclude, t.exclude],
        ];
        const max = Math.max(1, ...rows.map((r) => r[1]));
        const tot = d.screening.include + d.screening.maybe + d.screening.exclude;
        return `<div class="card"><h2>Décisions du tri titre-résumé</h2>${rows
          .map(([l, v, c]) => `<div class="dec"><span>${l}</span><div class="bar" style="width:${((v / max) * 100).toFixed(1)}%;background:${c}"></div><span class="num"><b>${n(v)}</b> · ${pct(v, tot)} %</span></div>`)
          .join('')}<div class="note">Sur ${n(tot)} références triées.${
          d.screening.aside ? ` À noter : ${esc(d.screening.aside)} ; ils ne sont pas comptés ici.` : ''
        }</div></div>`;
      })()
    : '';

  const steps = `<div class="card"><h2>Où en est la revue</h2>${d.steps
    .map((s) => `<div class="step"><span>${s.label}</span><div class="track"><div class="fill" style="width:${s.pct}%"></div></div><span class="pct">${s.text}</span></div>`)
    .join('')}<div class="note">Part des références de chaque étape déjà traitées.</div></div>`;

  const flow =
    d.screening && d.fulltext
      ? `<div class="card"><h2>Le parcours en un coup d’œil</h2><div class="flow">
<div class="box"><div class="v">${n(d.identified)}</div><div class="l">identifiées</div></div><div class="arr">→</div>
<div class="box"><div class="v">${n(d.unique)}</div><div class="l">sans doublons</div></div><div class="arr">→</div>
<div class="box"><div class="v">${n(d.fulltext.total)}</div><div class="l">au texte intégral</div></div><div class="arr">→</div>
<div class="box final"><div class="v">${n(d.fulltext.include)}</div><div class="l">incluses à ce jour</div></div></div>
<div class="flow"><div class="out">−${n(d.duplicates)} doublons</div><div></div><div class="out">−${n(d.screening.exclude)} exclues au tri</div><div></div><div class="out">−${n(d.fulltext.exclude)} exclues · ${n(d.fulltext.total - d.fulltext.done)} à lire</div><div></div><div></div></div>
<div class="note">Le diagramme PRISMA 2020 complet se trouve dans Biblikube (onglet PRISMA).</div></div>`
      : '';

  const sources = d.sources.length
    ? `<div class="card"><h2>Sources</h2><table><tr><th>Source</th><th class="n">Réf.</th>${d.screening ? '<th>Type</th>' : ''}</tr>${d.sources
        .slice(0, 10)
        .map((s) => `<tr><td>${esc(s.name)}</td><td class="n">${n(s.count)}</td>${d.screening ? `<td>${s.kind}</td>` : ''}</tr>`)
        .join('')}</table></div>`
    : '';

  const reasons = d.reasons.length ? `<div class="card"><h2>Principales raisons d’exclusion</h2>${bars(d.reasons, t.muted, true)}<div class="note">Une référence peut avoir plusieurs raisons.</div></div>` : '';

  const plan = d.plan
    ? `<div class="grid2"><div class="card"><h2>Articles par catégorie</h2>${d.plan.categories.length ? bars(d.plan.categories, t.accent) : '<div class="note">Pas encore de catégorie.</div>'}<div class="note">Un article peut être classé dans plusieurs catégories. ${n(d.plan.classified)} classé(s) sur ${n(d.plan.pool)} ${d.plan.poolLabel}.</div></div>
<div class="card"><h2>Marqueurs</h2>${d.plan.markers.length ? `<div class="chips">${d.plan.markers.map((m) => `<span class="chip">${esc(m.name)} · <b>${n(m.count)}</b></span>`).join('')}</div>` : '<div class="note">Aucun marqueur utilisé pour l’instant.</div>'}</div></div>
${d.plan.keyArticles.length ? `<div class="card"><h2>Articles clés (marqués « ${esc(d.plan.keyMarker!)} »)</h2><table><tr><th>Référence</th><th>Catégorie</th><th>Décision</th></tr>${d.plan.keyArticles.map((a) => `<tr><td>${esc(a.ref)}</td><td>${esc(a.cats)}</td><td style="white-space:nowrap">${a.decision}</td></tr>`).join('')}</table></div>` : ''}`
    : '';

  const comment = d.comment ? `<div class="card comment"><h2>Commentaire</h2><p>${esc(d.comment).replace(/\n/g, '<br>')}</p></div>` : '';

  const progress = `<div class="tiles" style="grid-template-columns:repeat(${tiles.length},1fr)">${tiles.join('')}</div>
<div class="${decisions ? 'grid2' : ''}">${steps}${decisions}</div>${flow}`;
  const orgSection = d.plan ? `<h1 class="sec">Organisation · ${esc(d.plan.name)}</h1>${plan}` : '';
  const tail = `<div class="grid2">${reasons}${sources}</div>`;
  const body = d.organiseFirst ? `${progress}${orgSection}${tail}${comment}` : `${progress}${tail}${orgSection}${comment}`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Point d’étape – ${esc(d.name)}</title><style>${fontCss}
@page{size:Letter;margin:.45in 0}
@page :first{margin-top:0}
*{box-sizing:border-box}
body{margin:0;background:#fff linear-gradient(170deg,${t.soft} 0%,#fff 70%) no-repeat;background-size:100% 5in;font-family:'Inter Variable',Inter,system-ui,sans-serif;color:${t.text};font-size:9.4pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{max-width:8.5in;margin:0 auto;padding:.45in .5in .3in}
@media print{.wrap{padding:.45in .5in 0}}
.top{display:flex;align-items:center;gap:10px}
.logo{width:28px;height:28px;border-radius:50%;background:${t.accent};color:#fff;display:grid;place-items:center;font-size:14px}
img.logo{width:34px;height:34px;border-radius:0;background:none;object-fit:contain}
.brand{font-family:'Outfit Variable',Outfit,'Inter Variable',Inter,sans-serif;font-weight:700;font-size:12pt}
.sp{flex:1}
.pill{border:1px solid ${t.soft};border-radius:999px;padding:3px 10px;font-size:8pt;color:${t.muted}}
.eyebrow{margin-top:18px;color:${t.accent};font-weight:700;letter-spacing:.09em;text-transform:uppercase;font-size:8.5pt}
h1{font-family:'Outfit Variable',Outfit,'Inter Variable',Inter,sans-serif;font-size:24pt;margin:2px 0 6px;line-height:1.08}
h1.sec{font-size:15pt;margin:16px 0 8px;break-after:avoid}
.q{border-left:4px solid ${t.accent};background:${t.soft}55;border-radius:4px 12px 12px 4px;padding:9px 12px;margin:8px 0 12px;font-size:10pt}
.q b{display:block;font-size:7.8pt;color:${t.muted};text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}
h2{font-family:'Outfit Variable',Outfit,'Inter Variable',Inter,sans-serif;font-size:12pt;margin:0 0 8px}
.card{border:1px solid ${t.soft};border-radius:14px;padding:11px 13px;margin-bottom:11px;break-inside:avoid}
.tiles{display:grid;gap:9px;margin-bottom:11px}.tiles .card{margin:0}
.tile .v{font-family:'Outfit Variable',Outfit,'Inter Variable',Inter,sans-serif;font-weight:700;font-size:20pt;line-height:1}
.tile .l{font-size:8.3pt;color:${t.muted};margin-top:3px}.tile .d{font-size:7.8pt;margin-top:4px;color:${t.muted}}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:11px;align-items:start}
.step{display:grid;grid-template-columns:105px 1fr auto;align-items:center;gap:8px;margin:6px 0;font-size:8.8pt}
.track{height:10px;border-radius:999px;background:${t.soft};overflow:hidden}.fill{height:100%;border-radius:999px;background:${t.accent}}
.pct{text-align:right;white-space:nowrap;min-width:36px;color:${t.muted}}
.dec{display:grid;grid-template-columns:90px 1fr 74px;align-items:center;gap:8px;margin:7px 0;font-size:8.8pt}
.bar{height:13px;border-radius:0 4px 4px 0}
.num{font-variant-numeric:tabular-nums;text-align:right}
.note{font-size:7.8pt;color:${t.muted};margin-top:6px}
.cat{display:grid;grid-template-columns:140px 1fr 32px;align-items:center;gap:8px;margin:5px 0;font-size:8.8pt}
.cat.sub .nm{padding-left:12px;color:${t.muted}}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{border:1px solid ${t.soft};border-radius:999px;padding:3px 10px;font-size:8.5pt}
table{width:100%;border-collapse:collapse;font-size:8.6pt}
th{text-align:left;color:${t.muted};font-weight:500;font-size:7.8pt;border-bottom:1px solid ${t.soft};padding:4px}
td{padding:5px 4px;border-bottom:1px solid ${t.soft};vertical-align:top}.n{text-align:right;font-variant-numeric:tabular-nums}
.flow{display:grid;grid-template-columns:1fr 18px 1fr 18px 1fr 18px 1fr;align-items:center}
.box{border:1.5px solid ${t.soft};border-radius:12px;padding:8px;text-align:center}
.box .v{font-family:'Outfit Variable',Outfit,'Inter Variable',Inter,sans-serif;font-weight:700;font-size:15pt}.box .l{font-size:7.6pt;color:${t.muted}}
.box.final{background:${t.accent};border-color:${t.accent};color:#fff}.box.final .l{color:#fff;opacity:.85}
.arr{text-align:center;color:${t.accent};font-weight:700}.out{font-size:7.6pt;color:${t.muted};text-align:center;margin-top:4px}
.comment p{margin:0;font-size:9.6pt}
.foot{margin-top:14px;display:flex;font-size:7.6pt;color:${t.muted};border-top:1px solid ${t.soft};padding-top:6px}
</style></head><body><div class="wrap">
<div class="top">${logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="">` : '<span class="logo">✦</span>'}<span class="brand">Biblikube</span><span class="sp"></span><span class="pill">Point d’étape · ${d.date}</span></div>
<div class="eyebrow">${d.modeLabel} · point d’étape</div>
<h1>${esc(d.name)}</h1>
${d.question ? `<div class="q"><b>Question de recherche</b>${esc(d.question)}</div>` : ''}
${body}
<div class="foot">Généré par Biblikube · données lues dans Zotero le ${d.date}<span class="sp"></span>Ambiance « ${esc(t.name)} »</div>
</div></body></html>`;
}
