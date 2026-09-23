import type { GameState } from '@/game/store';
import type { MessageKey } from '@/i18n';

/**
 * The first-run tour (CLAUDE.md §11). A card and a ring, never a modal of its own: the
 * point is to show the player the real screen, so the thing being explained stays on it and
 * stays pressable. Two kinds of step:
 *
 * - **Look** steps explain a part of the screen and wait for Next.
 * - **Do** steps ask for one real action and move on by themselves when the game sees it
 *   happen — the first project is started by the player, not by the tour.
 *
 * It runs once per browser (`hackerspace-tycoon-toured`, a preference like the language,
 * never part of the save) and can be replayed from the top bar.
 */
export interface TourContext {
  state: GameState;
  /** The panel open in the build menu, if any. */
  openModal: string | null;
}

export interface TourStep {
  id: string;
  /** What to ring. Null centres the card on the screen. */
  target: string | null;
  title: MessageKey;
  body: MessageKey;
  /** A Do step: done when this is true. A Look step has none and waits for Next. */
  done?: (ctx: TourContext) => boolean;
  /** Where the card sits relative to the ring. */
  place?: 'below' | 'above' | 'right' | 'corner';
}

export const TOUR: TourStep[] = [
  { id: 'welcome', target: null, title: 'tour.welcome.title', body: 'tour.welcome.body' },
  { id: 'top', target: '#topbar', title: 'tour.top.title', body: 'tour.top.body', place: 'below' },
  {
    id: 'new',
    target: '[data-action="new-open"]',
    title: 'tour.new.title',
    body: 'tour.new.body',
    place: 'above',
    done: (ctx) => ctx.openModal === 'new' || ctx.state.runtime.projects.length > 0,
  },
  {
    id: 'wizard',
    target: '#modal .modal',
    title: 'tour.wizard.title',
    body: 'tour.wizard.body',
    // The wizard fills the middle of the screen, so the card keeps to the corner.
    place: 'corner',
    done: (ctx) => ctx.state.runtime.projects.length > 0,
  },
  { id: 'bench', target: '#left', title: 'tour.bench.title', body: 'tour.bench.body', place: 'right' },
  { id: 'you', target: '#clockpanel', title: 'tour.you.title', body: 'tour.you.body', place: 'right' },
  { id: 'menu', target: '#bottombar', title: 'tour.menu.title', body: 'tour.menu.body', place: 'above' },
  { id: 'money', target: '#topbar .tb-group:nth-of-type(2)', title: 'tour.money.title', body: 'tour.money.body', place: 'below' },
  { id: 'done', target: null, title: 'tour.done.title', body: 'tour.done.body' },
];

const KEY = 'hackerspace-tycoon-toured';

/** Has this browser seen the tour? Storage can be blocked, in which case: no. */
export function hasToured(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberToured() {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Not remembered: the tour will offer itself again next time, which is harmless.
  }
}
