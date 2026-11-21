// Applique le thème et les préférences d'affichage avant le premier rendu (évite le flash).
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('kl-display') || '{}');
    var t = p.theme || 'auto';
    if (t === 'auto') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var el = document.documentElement;
    el.dataset.theme = t;
    if (p.reduceMotion) el.dataset.reduceMotion = 'true';
    if (p.dyslexiaFont) el.dataset.dyslexia = 'true';
  } catch {
    /* stockage indisponible : thème par défaut */
  }
})();
