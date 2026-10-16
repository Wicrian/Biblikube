// Question de recherche affichée sous le nom de la revue, modifiable sur place.
import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useProject } from '../store';

export function QuestionLine() {
  const { project: p, update } = useProject();
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null) update((cur) => ({ ...cur, question: draft.trim() }));
    setDraft(null);
  };
  if (draft !== null)
    return (
      <div className="question-line editing">
        <input
          autoFocus
          value={draft}
          placeholder="Votre question de recherche (ou votre sujet en quelques mots)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setDraft(null);
          }}
          onBlur={save}
        />
      </div>
    );
  return (
    <button className="question-line" onClick={() => setDraft(p.question)} title="Modifier la question de recherche">
      {p.question.trim() ? (
        <>
          <span className="muted">Question :</span> <span>{p.question}</span>
        </>
      ) : (
        <span className="muted">+ Ajouter ma question de recherche</span>
      )}
      <Pencil size={13} className="muted" />
    </button>
  );
}
