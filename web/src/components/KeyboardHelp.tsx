import { Modal } from './Modal';

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: 'Partout',
    keys: [
      ['?', 'Afficher cette aide'],
      ['/', 'Rechercher'],
      ['Échap', 'Fermer une fenêtre'],
    ],
  },
  {
    title: 'Cartes mémoire et révision',
    keys: [
      ['Espace', 'Retourner la carte'],
      ['→', 'Je savais'],
      ['←', 'Je ne savais pas'],
      ['A', 'Écouter'],
      ['S', 'Étoile'],
    ],
  },
  {
    title: 'Apprendre, Test, Écriture, Écoute',
    keys: [
      ['1 – 4', 'Choisir une réponse (QCM)'],
      ['V / F', 'Vrai / Faux'],
      ['Entrée', 'Valider / continuer'],
    ],
  },
  {
    title: 'Éditeur de set',
    keys: [
      ['Tab', 'Champ suivant'],
      ['Entrée', 'Enchaîner (terme → définition → carte suivante)'],
      ['Maj + Entrée', 'Retour à la ligne'],
      ['Ctrl + Z / Ctrl + Y', 'Annuler / rétablir'],
      ['Alt + ↑ / ↓', 'Déplacer la carte'],
      ['Ctrl + S', 'Enregistrer'],
    ],
  },
];

export function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Raccourcis clavier" size="lg">
      <div className="grid gap-6 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 text-lg font-semibold">{g.title}</h3>
            <dl className="space-y-1.5">
              {g.keys.map(([k, d]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt>
                    <kbd className="rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-sm">{k}</kbd>
                  </dt>
                  <dd className="text-right text-ink-soft">{d}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
