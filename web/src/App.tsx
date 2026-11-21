import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Home from './pages/Home';
import Login from './pages/Login';

const Invitation = lazy(() => import('./pages/Invitation'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const Library = lazy(() => import('./pages/Library'));
const SetView = lazy(() => import('./pages/SetView'));
const SetEditor = lazy(() => import('./pages/SetEditor'));
const PrintSet = lazy(() => import('./pages/PrintSet'));
const Study = lazy(() => import('./pages/study/Study'));
const Review = lazy(() => import('./pages/study/Review'));
const Stats = lazy(() => import('./pages/Stats'));
const Profile = lazy(() => import('./pages/Profile'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Admin = lazy(() => import('./pages/admin/Admin'));

function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-6xl" aria-hidden="true">
        🧭
      </p>
      <h1 className="mt-3 text-3xl font-semibold">Page introuvable</h1>
      <p className="mt-2 text-ink-soft">Ce chemin ne mène nulle part… mais tes sets t’attendent.</p>
      <a href="/" className="btn-primary mt-6">
        Retour à l’accueil
      </a>
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Après navigation, place le focus sur le contenu (lecteurs d'écran).
    document.getElementById('contenu')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (loading) return <Spinner label="Ouverture de ton carnet…" />;

  const publicRoutes = (
    <>
      <Route path="/invitation/:token" element={<Invitation />} />
      <Route path="/confidentialite" element={<Privacy />} />
    </>
  );

  if (!user) {
    const suite = location.pathname !== '/' && location.pathname !== '/connexion' ? `?suite=${encodeURIComponent(location.pathname)}` : '';
    return (
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/connexion" element={<Login />} />
          {publicRoutes}
          <Route path="*" element={<Navigate to={`/connexion${suite}`} replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (user.mustChangePassword) {
    return (
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/confidentialite" element={<Privacy />} />
          <Route path="*" element={<ChangePassword forced />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/connexion" element={<Navigate to={new URLSearchParams(location.search).get('suite') || '/'} replace />} />
          {publicRoutes}
          <Route path="/sets" element={<Library />} />
          <Route path="/sets/nouveau" element={<SetEditor />} />
          <Route path="/sets/:id" element={<SetView />} />
          <Route path="/sets/:id/modifier" element={<SetEditor />} />
          <Route path="/sets/:id/imprimer" element={<PrintSet />} />
          <Route path="/sets/:id/etude/:mode" element={<Study />} />
          <Route path="/revision" element={<Review />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/admin/*" element={user.role === 'admin' ? <Admin /> : <NotFound />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
