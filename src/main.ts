import { Game } from '@/game/Game';
import { store } from '@/game/store';

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
