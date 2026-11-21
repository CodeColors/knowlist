import type { UserPrefs } from './types';

/** Applique thème, animations et police ; mémorise localement pour le prochain chargement (theme.js). */
export function applyDisplay(p: Pick<UserPrefs, 'theme' | 'reduceMotion' | 'dyslexiaFont'>) {
  const el = document.documentElement;
  const pref = p.theme ?? 'auto';
  const resolved = pref === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref;
  el.dataset.theme = resolved;
  if (p.reduceMotion) el.dataset.reduceMotion = 'true';
  else delete el.dataset.reduceMotion;
  if (p.dyslexiaFont) {
    el.dataset.dyslexia = 'true';
    void import('@fontsource/opendyslexic/400.css');
    void import('@fontsource/opendyslexic/700.css');
  } else delete el.dataset.dyslexia;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', resolved === 'dark' ? '#1d1916' : '#fbf6ee'));
  try {
    localStorage.setItem('kl-display', JSON.stringify({ theme: pref, reduceMotion: !!p.reduceMotion, dyslexiaFont: !!p.dyslexiaFont }));
  } catch {
    /* ignore */
  }
}

export function prefersReducedMotion(): boolean {
  return document.documentElement.dataset.reduceMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}
