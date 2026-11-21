/** Synthèse vocale du navigateur (aucune donnée envoyée à un service externe par KnowList). */
export const LANGS: { code: string; label: string; bcp47: string }[] = [
  { code: 'fr', label: 'Français', bcp47: 'fr-FR' },
  { code: 'en', label: 'Anglais', bcp47: 'en-GB' },
  { code: 'en-US', label: 'Anglais (US)', bcp47: 'en-US' },
  { code: 'es', label: 'Espagnol', bcp47: 'es-ES' },
  { code: 'de', label: 'Allemand', bcp47: 'de-DE' },
  { code: 'it', label: 'Italien', bcp47: 'it-IT' },
  { code: 'pt', label: 'Portugais', bcp47: 'pt-PT' },
  { code: 'nl', label: 'Néerlandais', bcp47: 'nl-NL' },
  { code: 'sv', label: 'Suédois', bcp47: 'sv-SE' },
  { code: 'pl', label: 'Polonais', bcp47: 'pl-PL' },
  { code: 'ru', label: 'Russe', bcp47: 'ru-RU' },
  { code: 'ar', label: 'Arabe', bcp47: 'ar-SA' },
  { code: 'zh', label: 'Chinois', bcp47: 'zh-CN' },
  { code: 'ja', label: 'Japonais', bcp47: 'ja-JP' },
  { code: 'ko', label: 'Coréen', bcp47: 'ko-KR' },
  { code: 'la', label: 'Latin', bcp47: 'la' },
  { code: 'other', label: 'Autre', bcp47: '' },
];

export const langLabel = (code: string) => LANGS.find((l) => l.code === code)?.label ?? code;

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickVoice(bcp47: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const base = bcp47.split('-')[0];
  return voices.find((v) => v.lang === bcp47) ?? voices.find((v) => v.lang.startsWith(base));
}

export function speak(text: string, lang: string, opts: { rate?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported() || !text.trim()) return resolve();
    const bcp47 = LANGS.find((l) => l.code === lang)?.bcp47 || lang;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (bcp47) u.lang = bcp47;
    const v = bcp47 ? pickVoice(bcp47) : undefined;
    if (v) u.voice = v;
    u.rate = opts.rate ?? 0.95;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

let currentAudio: HTMLAudioElement | null = null;
/** Lit l'audio enregistré de la carte s'il existe, sinon la synthèse vocale. */
export function playCard(text: string, lang: string, audioUrl?: string) {
  if (audioUrl) {
    currentAudio?.pause();
    currentAudio = new Audio(audioUrl);
    return currentAudio.play().catch(() => speak(text, lang));
  }
  return speak(text, lang);
}
