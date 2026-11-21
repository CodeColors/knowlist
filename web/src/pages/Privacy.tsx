import { Link } from 'react-router';
import { useDocumentTitle } from '../lib/hooks';

export default function Privacy() {
  useDocumentTitle('Confidentialité');
  return (
    <main id="contenu" className="mx-auto max-w-2xl px-4 py-10" tabIndex={-1}>
      <Link to="/" className="mb-4 inline-flex min-h-11 items-center text-ink-soft hover:text-ink">
        ← KnowList
      </Link>
      <article className="card space-y-4 p-6 sm:p-8">
        <h1 className="text-3xl font-semibold">Confidentialité</h1>
        <p>
          KnowList est une application privée, hébergée sur un serveur personnel. Aucune publicité, aucun traceur tiers, aucune revente de
          données.
        </p>
        <h2 className="text-xl font-semibold">Données conservées</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Ton nom affiché, ton identifiant et, si tu l’as fourni, ton adresse e-mail.</li>
          <li>Tes sets, cartes, images et sons, ainsi que ta progression d’étude.</li>
          <li>Un cookie de session strictement nécessaire (aucun cookie de mesure d’audience).</li>
          <li>Un journal de sécurité (connexions, adresse IP, actions d’administration), conservé 90 jours.</li>
        </ul>
        <h2 className="text-xl font-semibold">Tes droits</h2>
        <p>
          Depuis ton profil, tu peux à tout moment exporter l’ensemble de tes données (fichier JSON) et supprimer ton compte. Pour toute
          question, contacte l’administrateur du site.
        </p>
        <h2 className="text-xl font-semibold">Synthèse vocale</h2>
        <p>
          La lecture audio utilise la synthèse vocale intégrée à ton navigateur ou à ton système. Selon ton appareil, celle-ci peut être
          fournie par l’éditeur du système.
        </p>
        <h2 className="text-xl font-semibold">Sauvegardes</h2>
        <p>Les données sont sauvegardées chaque nuit et conservées 14 jours, avec une copie chiffrée hors du serveur.</p>
      </article>
    </main>
  );
}
