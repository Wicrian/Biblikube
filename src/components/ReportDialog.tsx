// Rapport « Point d'étape » : aperçu, commentaire facultatif, puis
// « Enregistrer en PDF » via la fenêtre d'impression du navigateur.

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDown, X } from 'lucide-react';
import { reportData, reportHtml, type ReportTheme } from '../lib/report';
import { loadTheme, THEMES } from '../lib/theme';
import { useProject } from '../store';
import { Portal } from './Portal';

/** Couleurs de l'ambiance en cours, lues dans les variables CSS de la page. */
function currentTheme(): ReportTheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const id = loadTheme();
  return {
    accent: v('--accent', '#8b6cf0'),
    soft: v('--accent-soft', '#ebe5fd'),
    include: v('--include', '#2f9a72'),
    exclude: v('--exclude', '#d4506f'),
    maybe: v('--maybe', '#c98a1d'),
    text: v('--text', '#23212f'),
    muted: v('--muted', '#6f6b86'),
    name: THEMES.find((t) => t.id === id)?.name ?? 'Innovation',
  };
}

/** Les polices de Biblikube, avec des adresses complètes pour la page du rapport. */
function fontFaces(): string {
  let out = '';
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    const base = sheet.href ?? location.href;
    for (const r of Array.from(rules))
      if (r instanceof CSSFontFaceRule && /Outfit|Inter/.test(r.cssText))
        out += r.cssText.replace(/url\(["']?([^"')]+)["']?\)/g, (_, u: string) => `url("${new URL(u, base).href}")`) + '\n';
  }
  return out;
}

/** iPad et iPhone : l'impression d'un cadre intégré imprime toute la page (capture d'écran). */
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Ouvre la fenêtre d'impression (« Enregistrer au format PDF »). Sur iPad et
 * iPhone, le rapport est d'abord ouvert seul dans un nouvel onglet, sinon le
 * système imprime la page entière de Biblikube au lieu du rapport.
 */
function printReport(html: string, frame: HTMLIFrameElement | null) {
  if (!isIOS()) {
    frame?.contentWindow?.print();
    return;
  }
  const w = window.open('', '_blank');
  if (!w) {
    alert('Votre navigateur a bloqué l’ouverture du rapport. Autorisez les fenêtres pour ce site, puis réessayez.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  const go = () => setTimeout(() => w.print(), 300);
  if (w.document.fonts?.ready) void w.document.fonts.ready.then(go);
  else w.addEventListener('load', go);
}

export function ReportDialog({ onClose }: { onClose: () => void }) {
  const { project: p, update } = useProject();
  const [comment, setComment] = useState(p.reportComment ?? '');
  const frame = useRef<HTMLIFrameElement>(null);
  const fonts = useMemo(fontFaces, []);
  const theme = useMemo(currentTheme, []);
  const html = useMemo(() => reportHtml(reportData({ ...p, reportComment: comment }), theme, fonts, new URL('logo.png', document.baseURI).href), [p, comment, theme, fonts]);

  // Coche « Faire un point d'étape » dans le guide.
  useEffect(() => {
    update((cur) => (cur.guide?.active && !cur.guide.visited.includes('report') ? { ...cur, guide: { ...cur.guide, visited: [...cur.guide.visited, 'report'] } } : cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (c: string) => {
    setComment(c);
    update((cur) => ({ ...cur, reportComment: c }));
  };

  return (
    <Portal>
      <div className="overlay" onClick={onClose}>
        <div className="report-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="report-side stack">
            <div className="row">
              <h2 style={{ margin: 0 }}>Point d’étape</h2>
              <span className="spacer" />
              <button className="btn small" onClick={onClose} title="Fermer">
                <X size={15} />
              </button>
            </div>
            <p className="small muted">
              Un résumé de l’avancée de votre revue, aux couleurs de votre ambiance (« {theme.name} »). Les sections s’adaptent
              à ce que vous avez déjà fait.
            </p>
            <label className="field">
              <span>Votre commentaire (facultatif)</span>
              <textarea
                rows={6}
                value={comment}
                placeholder="Ex. : Prochaine rencontre avec ma direction le 20 octobre. Question : faut-il garder les rapports gouvernementaux ?"
                onChange={(e) => save(e.target.value)}
              />
              <span className="small muted">Il apparaît dans le rapport seulement s’il est rempli. Il est gardé avec la revue.</span>
            </label>
            <button className="btn primary" onClick={() => printReport(html, frame.current)}>
              <FileDown size={16} /> Enregistrer en PDF
            </button>
            <p className="small muted">
              Dans la fenêtre qui s’ouvre, choisissez <strong>« Enregistrer au format PDF »</strong> comme destination.
            </p>
          </div>
          <iframe ref={frame} className="report-frame" title="Aperçu du point d’étape" srcDoc={html} />
        </div>
      </div>
    </Portal>
  );
}
