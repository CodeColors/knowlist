import { NavLink, Route, Routes } from 'react-router';
import { useDocumentTitle } from '../../lib/hooks';
import { PageHeader } from '../../components/ui';
import Dashboard from './Dashboard';
import Users from './Users';
import Invitations from './Invitations';
import { Sessions, Audit } from './Logs';
import Settings from './Settings';
import Backups from './Backups';

const TABS = [
  { to: '/admin', label: 'Tableau de bord', end: true },
  { to: '/admin/comptes', label: 'Comptes' },
  { to: '/admin/invitations', label: 'Invitations' },
  { to: '/admin/sessions', label: 'Sessions' },
  { to: '/admin/journal', label: 'Journal' },
  { to: '/admin/parametres', label: 'Paramètres' },
  { to: '/admin/sauvegardes', label: 'Sauvegardes' },
];

export default function Admin() {
  useDocumentTitle('Administration');
  return (
    <div>
      <PageHeader title="Administration" />
      <nav aria-label="Administration" className="-mx-4 mb-6 overflow-x-auto px-4">
        <ul className="flex gap-1 border-b border-line">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `inline-flex min-h-11 items-center border-b-2 px-3 font-semibold whitespace-nowrap ${isActive ? 'border-accent text-accent' : 'border-transparent text-ink-soft hover:text-ink'}`
                }
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="comptes" element={<Users />} />
        <Route path="invitations" element={<Invitations />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="journal" element={<Audit />} />
        <Route path="parametres" element={<Settings />} />
        <Route path="sauvegardes" element={<Backups />} />
      </Routes>
    </div>
  );
}
