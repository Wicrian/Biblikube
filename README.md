# Biblikube

**Application libre et gratuite pour mener une revue systématique de littérature, directement connectée à Zotero.**

> ℹ️ **Anciennement « LitFlow ».** L’application a changé de nom en octobre 2026 pour éviter toute confusion avec un
> autre projet de recherche qui porte déjà ce nom. Vos revues, votre clé Zotero et vos collections restent en place.

Biblikube s’inspire de Covidence et de Rayyan, mais avec une idée différente : **Zotero reste la source de vérité**.
Vos références ne sont jamais réimportées ni converties : Biblikube les lit dans votre bibliothèque Zotero et y
écrit, au fur et à mesure, le résultat de chaque étape (collections, étiquettes, notes). Les titres, résumés et
accents restent exactement comme dans Zotero.

> 🧪 Version 0.2.2 : fonctionnelle mais jeune. Faites des sauvegardes (export JSON) et signalez les problèmes dans
> les *issues* GitHub.

---

## Ce que fait Biblikube

| Étape | Dans Biblikube | Ce qui apparaît dans Zotero |
|---|---|---|
| **1. Protocole** | Type de revue, question, cadre **PICO, PICOS, PICOT, PECO, PEO, PCC, SPIDER, SPICE, ECLIPSE** ou personnalisé, critères d’inclusion/exclusion, mots-clés à surligner | — |
| **2. Identification** | Lecture d’une collection Zotero ; chaque sous-collection = une source (PubMed, Cairn, Érudit…) | Rien n’est modifié |
| **3. Doublons** | Détection par DOI, titre identique et titres très proches (accents et majuscules ignorés pour comparer, jamais supprimés) | Collection `0 – Doublons` + étiquette `LF:doublon` |
| **4. Tri titre-résumé** | Cartes à glisser : **← exclure, → inclure, ↑ incertain** (ou clavier). Choix rapide de la raison, ou nouvelle raison mémorisée, ou « Passer » | Collections `1 – Tri titre-résumé · Inclus / Exclus / Incertains`, étiquettes `LF:tri:exclu`, `LF:tri:raison:Hors sujet`… |
| **5. Texte intégral** | Même interface + notes de lecture, liens vers les PDF de Zotero, « texte introuvable » | `2 – Texte intégral · Exclus / Incertains / Introuvables`, `3 – Inclus dans la revue`, note enfant « Biblikube » avec raisons et notes |
| **PRISMA 2020** | Diagramme calculé automatiquement (français ou anglais), avec colonne « autres méthodes », export **SVG et PNG** | — |
| **Références** | Tableau filtrable (type de document, langue, source, années, nombre de pages, résumé, étiquettes Zotero…), décisions groupées, export **CSV** (s’ouvre avec les accents dans Excel) | — |

**La synchronisation marche dans les deux sens** : vous pouvez aussi décider directement dans Zotero (pratique
pendant la lecture des PDF). Ajoutez par exemple les étiquettes `LF:texte:exclu` et `LF:texte:raison:Mauvaise
population`, ou glissez l’item dans la collection `2 – Texte intégral · Exclus` : Biblikube le lit toutes les
45 secondes et met à jour ses décisions et le diagramme PRISMA. Les nouvelles références ajoutées aux collections
sources sont aussi détectées.

Vos autres collections et étiquettes Zotero ne sont **jamais** touchées : Biblikube ne gère que ce qu’il a créé
(la collection `Biblikube – nom du projet` et les étiquettes qui commencent par `LF:`).

## Démarrer (sans rien installer)

1. Ouvrez l’application en ligne : **https://wicrian.github.io/Biblikube/** *(une fois GitHub Pages activé, voir
   plus bas)*. Vous pouvez d’abord cliquer sur **« Essayer avec des données de démonstration »**.
2. Créez une clé API Zotero : <https://www.zotero.org/settings/keys/new>
   - cochez **Allow library access** et **Allow write access** ;
   - pour travailler en équipe, donnez aussi l’accès en lecture/écriture aux **groupes**.
3. Dans Biblikube : ⚙️ **Connexion Zotero** → collez la clé.
4. Créez un projet → onglet **Identification** → choisissez la bibliothèque puis la collection de vos résultats.

### Organisation conseillée dans Zotero

```
📁 Ma revue – santé mentale          ← la collection à choisir dans Biblikube
   📁 PubMed                          ← une sous-collection par base de données
   📁 Cairn
   📁 Érudit
   📁 Recherche par citations         ← « autre méthode » dans PRISMA
📁 Biblikube – Ma revue                 ← créée automatiquement par Biblikube
   📁 0 – Doublons
   📁 1 – Tri titre-résumé · Inclus
   📁 1 – Tri titre-résumé · Exclus
   📁 1 – Tri titre-résumé · Incertains
   📁 2 – Texte intégral · Exclus
   📁 2 – Texte intégral · Incertains
   📁 2 – Texte intégral · Introuvables
   📁 3 – Inclus dans la revue
```

Astuce : dans Zotero, le **sélecteur d’étiquettes** (en bas à gauche) permet de filtrer par raison d’exclusion,
par exemple `LF:tri:raison:Mauvaise population`.

### Raccourcis clavier (tri)

| Touche | Action |
|---|---|
| `→` ou `I` | Inclure |
| `←` ou `E` | Exclure |
| `↑` ou `U` | Incertain |
| `↓` / `P` | Passer / précédente |
| `Z` | Annuler la dernière décision |
| `1`…`9` | Choisir une raison · `Entrée` valider · `Échap` passer |

## Assistant IA local (facultatif)

À activer dans **Protocole › Assistant IA local**. Un petit modèle multilingue (*multilingual-e5-small*, environ
120 Mo) est téléchargé **une seule fois** puis tourne dans le navigateur : vos références ne sont envoyées à aucun
service d’IA.

- **Doublons « de sens »** : repère des doublons que les règles manquent (titre traduit, prépublication et
  article publié…). Seuil réglable ; chaque groupe reste à confirmer.
- **Deuxième avis au tri** : propose inclure / exclure / incertain avec une raison lisible, d’abord en comparant
  le titre et le résumé à vos critères (PICO, inclusion, exclusion), puis en **apprenant de vos décisions**
  (« Ressemble à une référence que vous avez exclue (Hors sujet) : … »).
- **Accord avec l’IA** : pourcentage d’accord et **kappa de Cohen**, calculés uniquement sur les décisions prises
  après la suggestion, et filtre « Revoir les désaccords ».
- La suggestion peut s’afficher avant votre décision, seulement après (plus rigoureux : évite d’être influencé·e),
  ou jamais.

⚠️ L’IA compare le sens des textes ; elle ne « comprend » pas vos critères comme une personne et se trompe
souvent. Elle ne remplace pas un second évaluateur humain dans une revue systématique publiée ; mentionnez son
usage dans votre méthode.

## Stratégie de recherche (équations par base de données)

Onglet **Recherche** :

1. **Concepts et mots-clés** : une colonne par concept (reprise possible des éléments PICO/SPIDER du protocole) ;
   les mots d’une colonne sont reliés par OU, les colonnes par ET ; `*` pour la troncature.
2. **L’équation dans chaque base** : traduction automatique dans la syntaxe de PubMed, Scopus, Web of Science,
   EBSCOhost, ProQuest, Ovid, Google Scholar, Cairn, Érudit, Repère, ou d’une base ajoutée à la main (opérateurs
   AND/OR ou ET/OU, troncature, guillemets, parenthèses). Chaque équation est **modifiable et enregistrée** ;
   avertissements (troncature inconnue, longueur maximale…) et **mode d’emploi ligne par ligne** pour les
   formulaires de recherche avancée. Chaque profil indique si ses règles sont officielles, observées ou à vérifier.
3. **Journal des recherches** (PRISMA-S) : date, équation exacte, nombre de résultats, filtres et notes, avec le
   nombre de références correspondantes dans Zotero ; export CSV.

## Organiser à votre façon (catégories et marqueurs)

L’onglet **Organisation** permet de ranger les références selon votre logique : sections du mémoire, concepts,
type d’étude, suivi de lecture, ou un plan vide. Ce classement s’utilise seul ou en complément du parcours de revue
systématique (tri, texte intégral, PRISMA) : on peut commencer par l’un, ajouter l’autre ensuite, ou ne jamais
faire de tri. Une référence peut être classée à tout moment, quelle que soit sa décision de tri (ex. exclue pour la
question de recherche, gardée pour la méthodologie).

- **Catégories** (2 niveaux) → sous-collections Zotero dans `Biblikube – projet › 4 – Organisation · nom du plan`,
  ou dans une **collection Zotero existante** que Biblikube reprend et continue à développer.
- **Marqueurs** (⭐ Important, 📌 À citer…) → étiquettes `LF:marqueur:…` ; cliquer sur un marqueur filtre les références.
- **Tri en cercle** : les références à classer en pile au centre, les catégories en bulles autour. Glisser la carte
  (souris ou doigt) vers une bulle la range et fait venir la suivante ; toucher plusieurs bulles puis « Suivante »
  la range dans plusieurs catégories ; une catégorie qui a des sous-catégories ouvre un second cercle. Clavier :
  1–9, Entrée, S (passer), Z (annuler).
- **Tableau en colonnes** : glisser-déposer à la souris (Alt = copier dans une 2e catégorie), toucher une carte sur
  tablette pour la classer ; boutons de classement rapides pendant le tri et le texte intégral ; classement groupé
  depuis l’onglet Références.
- **Dans les deux sens** : glisser une référence dans une de ces sous-collections dans Zotero, en créer, renommer ou
  supprimer une, ajouter une étiquette `LF:marqueur:…` : Biblikube le reprend.
- **Supprimer une catégorie** supprime la sous-collection Zotero mais **jamais les références** : Biblikube demande
  s’il faut les remettre « à classer », les déplacer dans une autre catégorie ou leur donner un marqueur.

## Reprendre un tri commencé dans Rayyan

Onglet **Identification › Reprendre un tri fait dans Rayyan** : choisissez le fichier `articles.csv` de l’export
Rayyan (CSV). Seules les décisions sont reprises (avec raisons d’exclusion et labels, ces derniers devenant des
étiquettes `LF:rayyan:…`) : chaque ligne est rapprochée de la référence Zotero correspondante (DOI, titre, puis
titre proche), dont le texte d’origine est conservé. Les références que Rayyan avait fusionnées comme doublons
sont marquées « doublon ». Un aperçu montre les rapprochements à vérifier et les références introuvables avant
d’importer.

## Reprendre une revue sur un autre appareil

Chaque revue liée à Zotero est sauvegardée automatiquement (protocole, raisons, décisions, notes, réglages) dans
une note de la collection `Biblikube – nom du projet`, avec l’étiquette `Biblikube-projet`. Sur un autre appareil
(iPad, autre ordinateur) ou après avoir vidé le navigateur : **Accueil › Reprendre depuis Zotero**. Les références
sont relues dans Zotero et les décisions prises entre-temps dans Zotero (étiquettes `LF:`) sont reprises.

Conseil : travaillez sur un appareil à la fois. Les décisions passent d’un appareil à l’autre par Zotero, mais
une modification du protocole faite sur l’un n’apparaît sur l’autre qu’en reprenant la revue depuis Zotero.

## Confidentialité

- Biblikube n’a **pas de serveur** : c’est une page web qui fonctionne entièrement dans votre navigateur.
- Vos projets sont enregistrés dans le navigateur (IndexedDB). Utilisez **Références › Sauvegarder le projet**
  pour changer d’ordinateur ou partager.
- La clé API Zotero est stockée dans le navigateur et n’est envoyée qu’à `api.zotero.org`.
- L’assistant IA télécharge son programme (jsDelivr) et son modèle (Hugging Face) ; aucun texte n’est envoyé.
- Écran **Fiches** : pour proposer des corrections, seul le DOI ou le titre de la référence est envoyé à Crossref
  (`api.crossref.org`, base publique des éditeurs). Les PDF sont lus dans le navigateur, sans être envoyés ailleurs.
- Les visites sont comptées de façon anonyme avec [GoatCounter](https://www.goatcounter.com) (logiciel libre, sans cookie) :
  un signal par navigateur et par jour, dont on garde seulement le pays et le type d’appareil. Aucune donnée
  personnelle ni rien des revues. Pas de comptage si le navigateur demande à ne pas être suivi, ni sur la version test.
  But : savoir si Biblikube est utilisé (et vaut la peine d’être maintenu) et sur quels appareils le vérifier.

## Travailler en équipe

Aujourd’hui : utilisez une **bibliothèque de groupe Zotero**. Chaque membre voit dans Zotero les collections et
étiquettes créées par Biblikube. Le double tri en aveugle avec gestion des désaccords (comme dans Covidence) est
prévu dans la feuille de route.

---

## Nouveautés

Le numéro de version est affiché en bas de la FAQ, sur la page d’accueil. Tant qu’il commence par 0, l’application
est jeune et peut encore changer ; la version 1.0 sera la première version « stable ».

**0.6.1 — octobre 2026**
- Barre de gauche plus légère : les groupes (Préparer, Trier, Organiser, Résultats) s’ouvrent et se ferment d’un clic,
  avec un petit compteur quand ils sont fermés. Au départ, les groupes ouverts dépendent du parcours choisi ; ensuite,
  Biblikube garde vos choix pour chaque revue. Mes revues, Style et Zotero tiennent sur une ligne en bas.

**0.6 — octobre 2026**
- **Transférer une revue vers une autre bibliothèque** (écran Identification) : pour reprendre son travail sur les mêmes
  références rangées ailleurs (par exemple la bibliothèque de groupe partagée avec sa direction). Biblikube associe les
  références (DOI, titre), montre un bilan (retrouvées, à vérifier, non retrouvées), puis crée une nouvelle revue avec le
  tri, le texte intégral, les doublons, l’organisation, le protocole et le temps de travail. La revue d’origine n’est
  pas modifiée.

**0.5 — octobre 2026**
- **Fiches** : on corrige directement dans Biblikube, puis « Enregistrer dans Zotero ». Seuls les champs changés sont
  envoyés ; les anciennes valeurs sont gardées dans une note « Biblikube – anciennes valeurs » attachée à la fiche, et
  le bouton « Annuler » les remet. Le type de document se change toujours dans Zotero.
- Propositions de correction, chacune avec sa fiabilité : DOI lu dans le PDF rangé dans Zotero (lu dans le navigateur),
  puis Crossref avec le DOI ou le titre exact. Le titre du livre venant de Crossref est toujours « à vérifier » (risque
  de confusion avec la collection).
- Auteurs et directeurs saisis en Nom / Prénom séparés (ou organisme), comme dans Zotero.
- Repère un volume qui est en fait une édition (fréquent avec Cairn) et propose la case « Édition ».
- Projets de loi et lois vérifiés selon le guide de l’UQAM (inspiré du Manuel canadien de la référence juridique) :
  numéro, titre, année, session et législature, URL ; recueil et chapitre pour les lois.
- Tous les types de fiches Zotero sont bien lus partout (acte juridique, affaire, projet de loi… n’apparaissent plus
  « sans titre ») ; pour un type dont les règles ne sont pas encore connues, Biblikube le dit. Noms de types alignés
  sur Zotero (« Acte juridique », « Affaire (jugement) »).
- Fiches relues automatiquement au retour dans l’onglet ; bouton « Revérifier » à côté de la fiche.

**0.4 — octobre 2026**
- Nouvel écran **Fiches** (sous Organisation, en essai) : vérifie que les fiches Zotero des références classées sont
  complètes selon l’APA 7, adaptation UQAM (initiales ou prénoms) ou APA 7 en anglais. Il signale les champs manquants,
  les mauvais types de document (« Document » trop général, mémoire enregistré comme rapport…) et la date de
  consultation (« Récupéré le… » ne s’affiche que pour une page web sans date). Il montre la référence telle que Zotero
  l’écrit. Rien n’est modifié dans Zotero : la correction se fait dans Zotero, puis « Revérifier ».

**0.3 — octobre 2026**
- Question de recherche : un nouvel écran facultatif au démarrage (« Votre sujet, en une phrase »), puis affichée sous
  le nom de la revue sur tous les écrans, modifiable d’un clic (✎). Le guide propose de l’écrire, quel que soit le niveau.
- Type de travail au choix (revue de portée, intégrative…) ; par défaut « Sans type précis (ou je ne sais pas encore) ».
  Il apparaît dans l’état d’avancement (PDF).
- Comptage anonyme des visites (GoatCounter, sans cookie) : nombre, pays et type d’appareil seulement, pour savoir si
  Biblikube est utilisé et sur quels appareils le vérifier. Voir « Confidentialité ».

**0.2.2 — octobre 2026**
- Message plus clair quand aucune collection n’est trouvée : il indique que le Zotero de l’ordinateur n’est sans doute
  pas synchronisé avec zotero.org, avec un lien vers la bibliothèque en ligne.
- Liens toujours soulignés (et bleus dans les ambiances Classique et Moderne, où ils se confondaient avec le texte).
- « Connexion à Zotero » et « Style » s’ouvrent par-dessus le démarrage guidé, et non plus derrière.

**0.2.1 — octobre 2026**
- Le bouton « Synchroniser » montre ce qu’il fait (« Synchronisation… », puis « À jour · heure »).
- Identification : la liste des collections Zotero se recharge d’un clic, et une aide s’affiche quand aucune collection
  n’est trouvée sur zotero.org (Zotero de l’ordinateur pas encore synchronisé).

**0.2 — octobre 2026**
- LitFlow devient **Biblikube**, avec son logo (le cube, par Maude Leblanc-Côté). Les revues déjà commencées
  continuent de fonctionner.
- **Minuterie et séances** sur le tri titre-résumé et l’organisation : temps de travail actif (pause après 2 min sans
  geste), liste des séances, estimation des séances passées d’après l’heure des décisions. Les décisions prises sur
  des articles écartés ensuite (doublons, retirés) sont signalées.
- iPad et tablettes : PDF enregistré correctement, cartes qui glissent sans « retour en arrière », glisser au doigt
  dans les colonnes (appui long).
- Démarrage guidé en 3 questions, menu adapté à votre usage et guide « Pour bien démarrer ».
- « État d’avancement » en PDF pour faire le point avec sa direction, aux couleurs de l’ambiance, avec le temps de travail par étape.
- Doublons plus faciles à départager (titre du livre, pages, ISBN, différences surlignées, notes) ; notes Zotero et
  surlignages des PDF visibles dans les cartes.
- Organisation par catégories, sous-catégories et marqueurs, vue « Tri en cercle », onglet « Toutes », trois façons
  de créer son plan.
- Cinq ambiances de couleurs, import des décisions Rayyan.
- FAQ « Sécurité et confidentialité » sur l’accueil, et une version test séparée (/test/).

**0.1 — septembre 2026**
- Première version : tri titre-résumé en cartes, texte intégral, diagramme PRISMA 2020, synchronisation avec Zotero
  dans les deux sens.

## Pour les développeuses et développeurs

Pile technique volontairement simple : **React + TypeScript + Vite**, aucune dépendance serveur.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests (logique, doublons, PRISMA, synchronisation avec un faux serveur Zotero)
npm run build    # version statique dans dist/ (à héberger n’importe où)
```

```
src/
  types.ts              Modèle de données (projet, références, décisions)
  store.tsx             État du projet, sauvegarde locale, synchronisation automatique
  zotero/api.ts         Client de l’API Web Zotero v3
  zotero/sync.ts        Import depuis Zotero et écriture des collections/étiquettes/notes
  zotero/mapping.ts     Conversion item Zotero → référence (sans modifier le texte)
  zotero/pull.ts        Lecture des changements faits dans Zotero (sync dans les deux sens)
  ai/                   Assistant IA local (modèle dans un Web Worker, logique testée)
  lib/agreement.ts      Kappa de Cohen
  lib/dedup.ts          Détection des doublons
  lib/prisma.ts         Calcul des chiffres PRISMA 2020
  lib/filters.ts        Filtres et tris sur les métadonnées
  lib/frameworks.ts     Cadres PICO, SPIDER, PCC… et raisons par défaut
  components/           Écrans (Protocole, Identification, Doublons, Tri, Références, PRISMA)
```

### Publier sa propre copie

1. *Fork* du dépôt sur GitHub.
2. **Settings › Pages › Source : GitHub Actions**.
3. Chaque push sur la branche par défaut lance les tests puis publie le site (`.github/workflows/deploy.yml`).

Le dossier `dist/` produit par `npm run build` peut aussi être déposé sur n’importe quel hébergement statique
(serveur universitaire, Netlify…).

### Feuille de route

**Déjà fait**

- [x] Tri titre-résumé en cartes (glisser ou clavier), texte intégral, diagramme PRISMA 2020 (FR/EN)
- [x] Doublons : fiches détaillées (type, titre du livre, pages, ISBN, différences surlignées, nombre de notes et
      pièces jointes, alerte « chapitres d’un même livre »)
- [x] Notes Zotero et surlignages des PDF affichés dans les cartes (tri, organisation, doublons)
- [x] Organisation : catégories, sous-catégories et marqueurs, vue en cercle et en colonnes, onglet « Toutes »,
      trois façons de créer son plan (proposé, coller son plan, partir de zéro)
- [x] Démarrage guidé : 3 questions (usage, Zotero, aperçu), menu adapté à l’usage, guide « Pour bien démarrer »
- [x] « État d’avancement » en PDF aux couleurs de l’ambiance, avec commentaire facultatif
- [x] FAQ « Sécurité et confidentialité » sur l’accueil
- [x] Cinq ambiances de couleurs : innovation, classique, moderne, chaleureux, plein air
- [x] Import des décisions Rayyan ; type de chaque source (base de données / autre méthode)
- [x] Version test séparée (/test/) avec ses propres données
- [x] Logo
- [x] Minuterie et séances de travail (temps actif, pause après 2 min sans geste)

**À venir (prioritaire)**

- [ ] Nouveau nom pour l’application (un autre projet s’appelle déjà Biblikube)
- [ ] Recherche : profils Érudit et Cairn corrigés, vérification des équations avec des « articles témoins »
- [ ] Écran « Bon retour » pour reprendre là où on s’était arrêté
- [ ] Empêcher le changement de bibliothèque Zotero en cours de revue, ou « déménager » proprement la revue
- [ ] État d’avancement exportable en Word

**Idées pour plus tard**

- [ ] Lecteur PDF intégré avec surlignage des mots-clés
- [ ] Double tri en aveugle entre personnes, résolution des conflits (le kappa existe déjà pour l’IA)
- [ ] Grille d’extraction de données personnalisable, export tableur
- [ ] Évaluation de la qualité / du risque de biais (CASP, MMAT, RoB 2…)
- [ ] Import des décisions Covidence
- [ ] Organisation : vue libre (zones à dessiner), glisser par appui long dans les colonnes,
      catégorie suggérée par l’IA locale
- [ ] Stockage « permanent » du navigateur + rappel de sauvegarde
- [ ] Héberger le programme de l’assistant IA avec l’application (au lieu de jsDelivr)
- [ ] Assistant IA : explications rédigées par un modèle de langage local (Ollama), en option
- [ ] Interface en anglais et autres langues
- [ ] Extension Zotero 7 (tri directement dans Zotero)

Les contributions sont bienvenues : ouvrez une *issue* pour en discuter.

## Licence

[GNU AGPL v3 ou ultérieure](LICENSE) — la même famille de licence que Zotero. Vous pouvez utiliser, modifier et
redistribuer Biblikube librement ; toute version modifiée mise à disposition en ligne doit rester libre.

## Logo

Le logo (le cube) a été créé par **Maude Leblanc-Côté** — [@atelier_imel](https://www.instagram.com/atelier_imel/) sur Instagram et [@atelier_imel](https://www.youtube.com/@atelier_imel) sur YouTube.
