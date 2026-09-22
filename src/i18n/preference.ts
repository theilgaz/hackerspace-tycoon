import { store } from '@/game/store';
import { isLocale, type Locale } from './locale';

/**
 * The language is a preference of the person, not of the run: it lives in its own storage
 * key rather than the save, so loading a friend's save does not change the language and
 * starting a new run does not forget it. Browser-only — the sim never imports this.
 */
const KEY = 'hackerspace-tycoon-locale';

/** `?lang=tr` beats a stored choice, which beats the browser's own language. */
export function initialLocale(): Locale {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (isLocale(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage can be blocked; the browser's language is still a fine guess.
  }
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

export function applyLocale(locale: Locale, remember = true) {
  store.getState().setLocale(locale);
  // `lang` is what makes CSS `text-transform: uppercase` turn i into İ rather than I.
  document.documentElement.lang = locale === 'xx' ? 'en' : locale;
  // ...which is exactly wrong for English text: "Interest" uppercased as Turkish reads
  // İNTEREST. Anything still in English carries its own `lang="en"` (see `UI.renderChrome`).
  if (!remember) return;
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    // Not remembered, but still applied.
  }
}
