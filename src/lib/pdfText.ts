// Lecture du texte des premières pages d'un PDF, dans le navigateur (pdf.js,
// chargé seulement quand on en a besoin). Le PDF ne quitte pas l'ordinateur.

export async function pdfFirstPagesText(data: ArrayBuffer, pages = 2): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(pages, doc.numPages); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    out.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  await doc.cleanup();
  return out.join('\n');
}
