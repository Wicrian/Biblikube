import type { ReactNode } from 'react';

/** Questions fréquentes, repliées par défaut pour ne pas charger la page d'accueil. */
const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: 'Biblikube peut-il abîmer mon Zotero ?',
    a: (
      <>
        <p>
          Non. Biblikube ne supprime jamais vos références, vos PDF, ni vos propres notes, étiquettes ou collections. Il
          ajoute seulement ses propres éléments : une collection « Biblikube – nom du projet », des étiquettes commençant par{' '}
          <code>LF:</code> et des notes. Quand vous changez une décision, il retire uniquement sa propre étiquette.
        </p>
        <p>
          Seule exception : si vous supprimez une catégorie dans Organisation, sa sous-collection Zotero est supprimée,
          mais les références qu’elle contenait restent dans votre bibliothèque. Pour un premier essai, vous pouvez aussi
          travailler dans une bibliothèque de groupe de test.
        </p>
      </>
    ),
  },
  {
    q: 'Qui peut voir ma revue ?',
    a: (
      <p>
        Seulement vous, et les personnes qui ont déjà accès à votre bibliothèque Zotero. Biblikube n’a ni serveur ni compte :
        vos données restent dans ce navigateur et dans votre Zotero. Si vous travaillez dans une bibliothèque de groupe, les
        membres du groupe voient les collections, étiquettes et notes créées par Biblikube, comme n’importe quel autre
        contenu du groupe. Seul le nombre de visites est compté, de façon anonyme, avec le pays et le type d’appareil (ordinateur, tablette,
        téléphone) : aucune donnée personnelle, aucun cookie, et rien de vos revues. Cela permet de savoir si Biblikube est
        utilisé, donc s’il vaut la peine de continuer à le mettre à jour, et de vérifier qu’il fonctionne bien sur les
        appareils les plus courants. Dans l’écran « Fiches », pour proposer des corrections, seul le DOI ou le titre de la
        référence est envoyé à Crossref (la base publique des éditeurs) ; vos PDF sont lus dans votre navigateur.
      </p>
    ),
  },
  {
    q: 'Où va ma clé API Zotero ?',
    a: (
      <p>
        Elle est enregistrée uniquement dans ce navigateur et n’est envoyée qu’à Zotero (api.zotero.org). Vous pouvez la
        retirer à tout moment avec « Oublier la clé » dans les réglages Zotero de Biblikube, ou la révoquer sur zotero.org. Sur
        un ordinateur partagé, pensez à la retirer après usage.
      </p>
    ),
  },
  {
    q: 'Et si je change d’ordinateur ou que je vide mon navigateur ?',
    a: (
      <p>
        Les revues liées à Zotero y sont sauvegardées automatiquement : sur n’importe quel appareil, « Reprendre depuis
        Zotero » les retrouve. Vous pouvez aussi télécharger une sauvegarde (.json) depuis l’onglet Références, et la rouvrir ici plus tard.
      </p>
    ),
  },
  {
    q: 'L’IA envoie-t-elle mes articles quelque part ?',
    a: (
      <p>
        Non. Le modèle d’IA est téléchargé une seule fois depuis des serveurs publics (jsDelivr et Hugging Face), puis il
        fonctionne entièrement dans votre navigateur. Vos titres et résumés ne quittent jamais votre ordinateur. L’IA
        reste facultative.
      </p>
    ),
  },
  {
    q: 'Puis-je essayer sans connecter Zotero ?',
    a: (
      <p>
        Oui : le bouton « Essayer avec des données de démonstration » permet de tout explorer sans clé ni compte. Rien
        n’est envoyé à Zotero tant que vous n’avez pas lié une bibliothèque.
      </p>
    ),
  },
  {
    q: 'Est-ce vraiment gratuit ?',
    a: (
      <p>
        Oui. Biblikube est un logiciel libre (licence AGPL) : gratuit, sans publicité, et son code est public sur{' '}
        <a href="https://github.com/wicrian/biblikube" target="_blank" rel="noreferrer">
          GitHub
        </a>
        . Il est tout jeune : vos retours aident à l’améliorer.
        <br />
        Le logo (le cube) a été créé par Maude Leblanc-Côté,{' '}
        <a href="https://www.instagram.com/atelier_imel/" target="_blank" rel="noreferrer">
          @atelier_imel
        </a>{' '}
        sur Instagram et YouTube. Merci à elle !
      </p>
    ),
  },
];

export function Faq() {
  return (
    <section className="panel stack" style={{ marginTop: '1rem' }}>
      <h2 style={{ margin: 0 }}>Sécurité et confidentialité · questions fréquentes</h2>
      <div className="faq">
        {FAQ.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}</summary>
            <div className="faq-answer">{a}</div>
          </details>
        ))}
      </div>
      <p className="small muted" style={{ margin: 0, textAlign: 'right' }}>
        Biblikube {__APP_VERSION__.replace(/\.0$/, '')}
      </p>
    </section>
  );
}
