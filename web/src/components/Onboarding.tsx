import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Modal } from './Modal';

/** Visite guidée de 4 écrans à la première connexion (ignorable). */
export function Onboarding({ onDone }: { onDone?: () => void }) {
  const { user, app, updatePrefs } = useAuth();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const screens = [
    {
      emoji: '👋',
      title: `Bienvenue, ${user?.displayName ?? ''} !`,
      body: app?.welcomeMessage || 'KnowList est ton carnet de vocabulaire privé : pas de pub, pas d’abonnement, tes données restent ici.',
    },
    {
      emoji: '🗂️',
      title: 'Crée tes sets',
      body: 'Un set, c’est une liste de cartes : un terme et sa définition. Saisis-les à la volée (Tab et Entrée pour enchaîner) ou colle une liste depuis Quizlet ou un tableur.',
    },
    {
      emoji: '🎯',
      title: 'Six façons d’étudier',
      body: 'Cartes mémoire, Apprendre, Test, Association, Écriture et Écoute. Marque d’une étoile les cartes à retravailler.',
    },
    {
      emoji: '🌿',
      title: 'Un peu chaque jour',
      body: 'KnowList te propose chaque jour les cartes à revoir au bon moment. Fixe-toi un petit objectif quotidien : la régularité compte plus que la quantité.',
    },
  ];
  const finish = () => {
    setOpen(false);
    void updatePrefs({ onboarded: true });
    onDone?.();
  };
  const s = screens[step];
  return (
    <Modal
      open={open}
      onClose={finish}
      title={`Visite guidée · ${step + 1}/4`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-ghost mr-auto" onClick={finish}>
            Passer
          </button>
          {step > 0 && (
            <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
              Précédent
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => (step < 3 ? setStep(step + 1) : finish())}>
            {step < 3 ? 'Suivant' : 'C’est parti !'}
          </button>
        </>
      }
    >
      <div className="pop-in py-2 text-center" key={step}>
        <div className="mb-3 text-6xl" aria-hidden="true">
          {s.emoji}
        </div>
        <h3 className="mb-2 text-2xl font-semibold">{s.title}</h3>
        <p className="text-ink-soft">{s.body}</p>
        <div className="mt-5 flex justify-center gap-2" aria-hidden="true">
          {screens.map((_, i) => (
            <span key={i} className={`h-2 rounded-full transition-all ${i === step ? 'w-6 bg-accent' : 'w-2 bg-line'}`} />
          ))}
        </div>
      </div>
    </Modal>
  );
}
