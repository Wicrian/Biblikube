import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

import { applyTheme, loadTheme } from './lib/theme';
import { countVisit } from './lib/visits';

// Ambiance de couleurs choisie par la personne (gardée dans ce navigateur).
applyTheme(loadTheme());

// Visite comptée de façon anonyme (voir src/lib/visits.ts et la FAQ).
countVisit();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
