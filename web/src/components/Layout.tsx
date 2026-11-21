import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { useHotkeys } from '../lib/hooks';
import { Icon } from './Icon';
import { KeyboardHelp } from './KeyboardHelp';
import { Onboarding } from './Onboarding';

const NAV = [
  { to: '/', label: 'Accueil', icon: 'home', end: true },
  { to: '/sets', label: 'Mes sets', icon: 'library' },
  { to: '/stats', label: 'Progrès', icon: 'chart' },
  { to: '/profil', label: 'Profil', icon: 'user' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, offline } = useAuth();
  const [help, setHelp] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const focusMode = /\/(etude|modifier|nouveau|imprimer)(\/|$)|^\/revision/.test(pathname);
  const items = user?.role === 'admin' ? [...NAV, { to: '/admin', label: 'Admin', icon: 'shield' }] : NAV;

  useHotkeys({ '?': () => setHelp(true), '/': (e) => (e.preventDefault(), navigate('/sets?recherche=1')) });

  return (
    <div className="min-h-dvh">
      <a href="#contenu" className="sr-only z-50 rounded-lg bg-accent px-4 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Aller au contenu
      </a>
      <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-display text-2xl font-semibold" aria-label="KnowList, accueil">
            <img src="/icon.svg" alt="" width={32} height={32} className="rounded-lg" />
            <span>KnowList</span>
          </NavLink>
          <nav aria-label="Navigation principale" className="ml-6 hidden flex-1 items-center gap-1 md:flex">
            {items.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold transition ${isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-2 hover:text-ink'}`
                }
              >
                <Icon name={n.icon} size={20} />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <NavLink to="/sets?recherche=1" className="btn-icon" aria-label="Rechercher (raccourci /)">
              <Icon name="search" />
            </NavLink>
            <button type="button" className="btn-icon hidden md:inline-flex" onClick={() => setHelp(true)} aria-label="Raccourcis clavier (?)">
              <Icon name="keyboard" />
            </button>
            <NavLink to="/sets/nouveau" className="btn-primary hidden sm:inline-flex">
              <Icon name="plus" size={20} /> Nouveau set
            </NavLink>
          </div>
        </div>
        {offline && (
          <div className="bg-warn-soft px-4 py-1.5 text-center text-sm font-semibold text-warn" role="status">
            Hors ligne : tes révisions sont enregistrées et seront synchronisées au retour du réseau.
          </div>
        )}
      </header>

      <main id="contenu" className="mx-auto max-w-6xl px-4 pt-6 pb-28 md:pb-12" tabIndex={-1}>
        {children}
      </main>

      <nav
        aria-label="Navigation principale"
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto flex max-w-lg justify-around">
          {items.map((n) => (
            <li key={n.to} className="flex-1">
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-accent' : 'text-ink-soft'}`
                }
              >
                <Icon name={n.icon} size={22} />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {!focusMode && (
      <NavLink
        to="/sets/nouveau"
        className="no-print fixed right-4 bottom-20 z-30 inline-flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-ink shadow-lift sm:hidden"
        aria-label="Nouveau set"
      >
        <Icon name="plus" size={26} />
      </NavLink>
      )}

      <KeyboardHelp open={help} onClose={() => setHelp(false)} />
      {user && !user.prefs.onboarded && <Onboarding />}
    </div>
  );
}
