import { Game } from '@/game/Game';
import { store } from '@/game/store';
import { applyLocale, initialLocale } from '@/i18n/preference';

// Before anything renders, so the first frame is already in the right language. Not
// remembered: a `?lang=` in the URL is for this visit, and a stored choice already is.
applyLocale(initialLocale(), false);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const labels = document.getElementById('labels') as HTMLElement;
const ui = document.getElementById('ui') as HTMLElement;

const game = new Game(canvas, labels, ui);

// Debugging: window.__store.getState() in the console (CLAUDE.md §11).
declare global {
  interface Window {
    __store: typeof store;
    __game: Game;
  }
}
window.__store = store;
window.__game = game;
