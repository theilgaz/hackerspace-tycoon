import type { GameState } from '@/game/store';
import type {
  BacklogEntry,
  ProjectCategory,
  ScoreRow,
  MemberSnapshot,
  MachineSnapshot,
  ProjectData,
  ProjectDef,
  Employment,
  ClaimKey,
  ShippedRecord,
  SkillKey,
  Identity,
} from '@/game/types';
import type { Ceremony, CeremonyAward, YearStanding } from '@/systems/RivalSystem';
import { ROLE_BLURB, ROLE_LABEL, SPACE_SUBJECT, type Role } from '@/game/types';
import { CATALOG_MAP, catalogForEra, missingMachines } from '@/utils/catalog';
import {
  CATEGORY_ORDER,
  categoryAffinity,
  profileOf,
  stageLabel,
  topCategories,
} from '@/utils/categories';
import {
  APPLICANTS,
  FILAMENT,
  MACHINE,
  PLAYER,
  ROSTER,
  STAGE_MAP,
  STAGE_ORDER,
  TIME,
  TRAIT_BLURB,
  TRAIT_LABEL,
  VERB_HOURS,
  eraDef,
  type EraDef,
  weeklyHoursFor,
} from '@/utils/constants';
import { clock, dayName, hours, money, pct } from '@/utils/format';
import { LOCALES, getLocale, num, say, t, type Locale, type MessageKey, type Text } from '@/i18n';
import {
  AMENITIES,
  comfortsOf,
  effectLines,
  type AmenityDef,
} from '@/utils/amenities';
import { CLAIMS, SUBREDDITS, SUBREDDIT_MAP, tasteMatch } from '@/utils/subreddits';
import { merit, projectSubject, react, type Subject } from '@/systems/HypeSystem';
import type { PrinterModel } from '@/utils/printers';
import { CATEGORY_ICON, icon, type IconName } from './icons';
import { AWARDS, LOGOS, NAME_SUGGESTIONS, RIVAL_MAP } from '@/utils/rivals';
import { DIFFICULTIES, type DifficultyKey } from '@/utils/difficulty';
import { ECONOMY } from '@/utils/economy';
import { MACHINE_LABEL, STATION_MAP } from '@/machines/layout';
import { partsEta, partsPending, projectProgress } from '@/systems/ProjectSystem';
import { SHELVE } from '@/utils/constants';

export interface UIHandlers {
  setSpeed(speed: number): void;
  pitch(defId: string, offerId: string | undefined, team: string[]): void;
  workOn(projectId: string): void;
  stopWork(): void;
  calibrate(): void;
  invite(projectId: string, memberId: string): void;
  release(projectId: string, memberId: string): void;
  repitch(projectId: string): void;
  bounty(projectId: string): void;
  bountyCost(projectId: string): number;
  orderParts(projectId: string): void;
  expedite(projectId: string): void;
  expediteCost(projectId: string): number;
  skipSim(projectId: string): void;
  queueAll(projectId: string): void;
  queuePart(projectId: string, partId: string): void;
  moveJob(machineId: string, jobId: string, dir: -1 | 1): void;
  cancelJob(machineId: string, jobId: string): void;
  buyFilament(machineId?: string): void;
  refillCost(machineId?: string): number;
  buyPrinter(modelId: string): void;
  buyAmenity(id: string): void;
  turnAmenity(): void;
  devCommand(line: string): string[];
  setLocale(locale: Locale): void;
  stopMoving(): void;
  sellPrinter(machineId: string): void;
  signLease(): void;
  nextLease(): { era: number; def: EraDef; ready: boolean; afford: boolean } | null;
  resaleFor(machineId: string): number;
  buyablePrinters(): PrinterModel[];
  hire(memberId: string, employment: Employment): void;
  passApplicant(memberId: string): void;
  /** Turn an applicant down. (Declared to match the handler already wired in Game.ts.) */
  passApplicant(memberId: string): void;
  post(projectId: string, subreddit: string, claim: ClaimKey): void;
  setRole(memberId: string, role: Role | null): void;
  /** What a post about the space itself is judged on — the same one the sim will use. */
  spaceSubject(): Subject;
  hireCost(memberId: string, employment: Employment): number;
  canHireFullTime(memberId: string): boolean;
  begin(name: string, logo: number, difficulty: DifficultyKey): void;
  dismissCeremony(): void;
  dismissBill(): void;
  continueRun(): void;
  discardSave(): void;
  savedRun(): {
    name: string;
    icon: string;
    colour: string;
    day: number;
    shipped: number;
    reputation: number;
    cash: number;
    era: string;
  } | null;
  letGo(memberId: string): void;
  previewBill(): { income: number; costs: number; net: number; dueInDays: number };
  scoreboard(): ScoreRow[];
  allocation(): { used: number; total: number };
  totalHours(): number;
}

const MEMBER_COLORS: Record<string, string> = {
  deniz: '#5ecfc0',
  ada: '#f0b429',
  kerem: '#e2725b',
};

/** Everyone who could ever be in the space, starting roster plus applicants. */
const MEMBER_DATA: Record<string, (typeof ROSTER)[number]> = Object.fromEntries(
  [...ROSTER, ...APPLICANTS].map((m) => [m.id, m]),
);

/** Stable colour for recruits, so a person keeps the same dot all game. */
function personColor(id: string): string {
  const palette = ['#7fb2f0', '#c58ef0', '#8fd88f', '#f08fa4', '#e0c36a', '#6fd0e0', '#d49a6a'];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

const ACTIVITY_LABEL: Record<MemberSnapshot['activity'], MessageKey> = {
  away: 'ui.activity.away',
  idle: 'ui.activity.idle',
  walking: 'ui.activity.walking',
  working: 'ui.activity.working',
  resting: 'ui.activity.resting',
  babysitting: 'ui.activity.babysitting',
};

const SOURCE_BADGE: Record<BacklogEntry['source'], { label: MessageKey | null; cls: string }> = {
  catalog: { label: null, cls: '' },
  member: { label: 'ui.source.member', cls: 'src-member' },
  sponsor: { label: 'ui.source.sponsor', cls: 'src-sponsor' },
  trending: { label: 'ui.source.trending', cls: 'src-trending' },
};

type JobStep = 'category' | 'project' | 'crew';
type RankKey =
  | 'projectsThisYear'
  | 'projects'
  | 'members'
  | 'cash'
  | 'reputationThisYear'
  | 'growthThisYear'
  | 'upvotesThisYear'
  | 'bestBuild'
  | 'reputation';

/** The clock face of somebody's contract, e.g. "09:00-14:00". */


/** Narrow enough to keep six numeric columns comparable at a glance. */

type SizeFilter = 'any' | 'solo' | 'small' | 'big';

/**
 * Team-size buckets. These narrow and group the job list in place — size was briefly its own
 * wizard step, which was redundant: every project already states its team size, so the list
 * just had to say it properly.
 */
const SIZE_FILTERS: {
  key: SizeFilter;
  label: MessageKey;
  short: MessageKey;
  hint: MessageKey;
  test: (team: number) => boolean;
}[] = [
  { key: 'any', label: 'ui.size.any', short: 'ui.size.any.short', hint: 'ui.size.any.hint', test: () => true },
  { key: 'solo', label: 'ui.size.solo', short: 'ui.size.solo.short', hint: 'ui.size.solo.hint', test: (n) => n <= 2 },
  { key: 'small', label: 'ui.size.small', short: 'ui.size.small.short', hint: 'ui.size.small.hint', test: (n) => n >= 3 && n <= 4 },
  { key: 'big', label: 'ui.size.big', short: 'ui.size.big.short', hint: 'ui.size.big.hint', test: (n) => n >= 5 },
];
const SIZE_GROUPS = SIZE_FILTERS.filter((f) => f.key !== 'any');

/** The promise each tier makes about length (CLAUDE.md §4). */
const TIER_DAYS: Record<ProjectDef['tier'], string> = {
  small: '1-5',
  medium: '5-10',
  large: '10-30',
};

/** Genre badge: the genre's icon and name, tinted by its own colour and nothing more. */
function categoryChip(category: ProjectCategory): string {
  const profile = profileOf(category);
  return `<span class="ui-badge ui-badge--tone" style="--tone:${profile.accent}"
    title="${esc(profile.blurb)}">${icon(CATEGORY_ICON[category])}${profile.label}</span>`;
}

/** Tier badge — the length promise, in the tier's own muted tone. */
function tierBadge(tier: ProjectDef['tier']): string {
  const tone = { small: '#7ac74f', medium: '#7fb2f0', large: '#c58ef0' }[tier];
  return `<span class="ui-badge ui-badge--tone" style="--tone:${tone}">${t(`ui.tier.${tier}`)} · ${t('ui.days.short', { days: TIER_DAYS[tier] })}</span>`;
}

function bar(value: number, max: number, tone = ''): string {
  const ratio = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  return `<div class="bar ${tone}"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>`;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 1st, 2nd, 3rd, 4th — a place reads as a place, not as a quantity. "1." in Turkish. */
function ordinal(place: number): string {
  return t('ui.ordinal', { place });
}

export class UI {
  private readonly root: HTMLElement;
  private readonly handlers: UIHandlers;
  /** Crews picked on the pitch screen but not yet pitched. Survives the re-render. */
  private draftTeams = new Map<string, Set<string>>();
  /** Drafts the player has actually touched — those are never re-suggested over. */
  private draftTouched = new Set<string>();
  private lastState: GameState | null = null;
  /** Last HTML written per section, so unchanged sections keep their DOM nodes. */
  private htmlCache = new Map<string, string>();

  /** Which build-menu panel is open, if any. */
  private openModal:
    | 'jobs' | 'people' | 'ranking' | 'machines' | 'projects' | 'reddit' | 'shop' | null = null;

  /** Which group of projects is on screen. Falls through when the chosen one is empty. */
  private projectsTab: 'all' | 'on' | 'done' = 'all';

  /** Which build on the bench is open. One at a time; the rest are a line each. */
  private benchOpen: string | null = null;

  /** How many envelopes of the current ceremony have been opened, and which ceremony. */
  private revealed = 0;
  private revealKey: number | null = null;
  private revealTimer = 0;

  /** Standings, or the shelf of everything you have won. */
  private rankTab: 'table' | 'trophies' = 'table';

  /** Which slice of the record is open: every category at once, or one of them. */
  private trophyScope: string | null = null;

  /**
   * How the record is organised. One rule covers all four screens: **by year organises by
   * year, all time organises by space** — so the switch means the same thing whichever
   * scope you are in, and the cumulative half answers the question the matrix cannot
   * (who is the most decorated space in the city).
   */
  private trophyMode: 'year' | 'all' = 'year';

  /** Which awards night the by-year view is showing. Null follows the most recent one. */
  private trophyYear: number | null = null;

  /** A space the player has opened from either table. Null is the table itself. */
  private rankSpace: string | null = null;

  /** Right-column panels the player has folded away. The log starts small on purpose. */
  private folded: { log: boolean; members: boolean } = { log: true, members: false };

  /** Which standing job is showing its list of candidates. */
  private roleOpen: Role | null = null;

  /** Which slice of the roster is on screen. */
  private peopleTab: 'all' | 'free' | 'on' | 'open' = 'all';

  /** What the composer is pointed at. Three decisions, and the claim is the one with teeth. */
  private reddit: { projectId: string | null; claim: ClaimKey } = {
    projectId: null,
    claim: 'wip',
  };
  /** Start screen state; the sim is not running yet so nothing clobbers it. */
  private start = {
    // Pre-named and pre-badged: an empty form with a dead CTA is a worse first frame
    // than a suggestion you can shuffle or type straight over (the field is selected).
    name: '',
    logo: Math.floor(Math.random() * LOGOS.length),
    difficulty: 'normal' as DifficultyKey,
    /** With a saved run on the table, the new-game form waits folded until asked for. */
    newOpen: false,
    /** Discarding a run is the one irreversible press on this screen, so it asks twice. */
    confirmDiscard: false,
  };
  /**
   * Suggestions still to be dealt. A shuffled deck rather than a fresh roll each press, so
   * the whole pool comes round before anything repeats.
   */
  private nameDeck: string[] = [];
  /** The name box is focused once, not on every re-render of the start screen. */
  private startFocused = false;

  private dealName(): string {
    if (this.nameDeck.length === 0) {
      const deck = NAME_SUGGESTIONS.filter((n) => n !== this.start.name);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      this.nameDeck = deck;
    }
    return this.nameDeck.pop() ?? NAME_SUGGESTIONS[0];
  }
  /** Which column the leaderboard is sorted by. */
  private rankSort: { key: RankKey; dir: 1 | -1 } = { key: 'reputation', dir: -1 };

  /** The Jobs wizard: pick a genre, choose the build, crew it up. */
  private jobs: {
    open: boolean;
    step: JobStep;
    source: ProjectCategory | 'offers' | 'bestfit' | null;
    size: SizeFilter;
    defId: string | null;
    offerId: string | null;
  } = { open: false, step: 'category', source: null, size: 'any', defId: null, offerId: null };

  /**
   * Write HTML only when it actually differs. Replacing innerHTML destroys nodes, which
   * cancels in-flight clicks and drops hover/tooltips — and the clock alone would
   * otherwise rebuild every panel sixty times a second.
   */
  /**
   * Can the space wear this? The overdraft is the whole point (§7a), so a button greys out
   * only when the spend would take the balance past the floor — not merely when cash is thin,
   * which is exactly the moment a player needs to spend their way out of trouble.
   */
  private affordable(state: GameState, cost: number): boolean {
    return state.cash - cost >= -ECONOMY.overdraftLimit;
  }

  private setHTML(el: HTMLElement, key: string, html: string) {
    if (this.htmlCache.get(key) === html) return;
    this.htmlCache.set(key, html);
    el.innerHTML = html;
  }
  private topbar!: HTMLElement;
  private clockPanel!: HTMLElement;
  private bottombar!: HTMLElement;
  private modal!: HTMLElement;
  private startEl!: HTMLElement;
  private left!: HTMLElement;
  private members!: HTMLElement;
  private movingEl!: HTMLElement;
  private devEl!: HTMLElement;
  /**
   * The developer console (§15). Not game state — it is a tool sitting on top of the game,
   * so it lives here with the other view state rather than in the store.
   */
  private dev: { open: boolean; lines: string[]; history: string[]; at: number } = {
    open: false,
    lines: [],
    history: [],
    at: -1,
  };
  /** Rolling buffer of recent keystrokes, so typing the magic word opens the console. */
  private typed = '';
  private log!: HTMLElement;

  constructor(root: HTMLElement, handlers: UIHandlers) {
    this.root = root;
    this.handlers = handlers;
    this.build();
    this.bind();
  }

  private build() {
    this.root.innerHTML = `
      <div class="panel" id="clockpanel"></div>
      <div class="panel" id="topbar"></div>
      <div class="panel" id="left"><h2>On the bench</h2><div class="body"></div></div>
      <div id="right">
        <div class="panel" id="log">
          <h2 data-action="panel-toggle" data-value="log">Log<i class="fold"></i></h2>
          <div class="body"></div>
        </div>
        <div class="panel" id="members">
          <h2 data-action="panel-toggle" data-value="members">The People<i class="fold"></i></h2>
          <div class="body"></div>
        </div>
      </div>

      <div class="panel" id="moving"></div>
      <div class="panel" id="devconsole"></div>
      <div id="bottombar"></div>
      <div id="modal"></div>
      <div id="start"></div>
    `;
    this.topbar = this.root.querySelector('#topbar')!;
    this.clockPanel = this.root.querySelector('#clockpanel')!;
    this.bottombar = this.root.querySelector('#bottombar')!;
    this.movingEl = this.root.querySelector('#moving')!;
    this.devEl = this.root.querySelector('#devconsole')!;
    this.modal = this.root.querySelector('#modal')!;
    this.startEl = this.root.querySelector('#start')!;
    this.left = this.root.querySelector('#left .body')!;
    this.members = this.root.querySelector('#members .body')!;
    this.log = this.root.querySelector('#log .body')!;
  }

  private bind() {
    /**
     * Escape closes the topmost thing that is open, one layer per press — a bill sits over
     * a ceremony sits over a panel sits over a picker inside it. Closing the whole stack on
     * one keypress loses the two screens you had not read yet.
     */
    /**
     * The console's own keys. It sits above the Escape stack below, and the backtick and
     * the magic word are both guarded on the focused element — the same rule that stopped
     * the speed shortcuts eating a hackerspace's name (§13).
     */
    window.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '');

      if (this.dev.open && target?.id === 'dev-input') {
        const input = target as HTMLInputElement;
        if (event.key === 'Enter') {
          event.preventDefault();
          const line = input.value;
          input.value = '';
          if (line.trim()) this.devRun(line);
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          // Walking the history, the way every console does.
          event.preventDefault();
          const step = event.key === 'ArrowUp' ? -1 : 1;
          this.dev.at = Math.max(0, Math.min(this.dev.history.length, this.dev.at + step));
          input.value = this.dev.history[this.dev.at] ?? '';
        } else if (event.key === 'Escape') {
          event.preventDefault();
          this.toggleDev(false);
        }
        return;
      }

      if (typing) return;
      if (event.key === '`' || event.key === '~') {
        event.preventDefault();
        this.toggleDev(!this.dev.open);
        return;
      }
      // Typing the word anywhere opens it. A rolling buffer rather than an index, so a
      // mistyped letter does not lock you out until you stop and start again.
      if (/^[a-z]$/.test(event.key)) {
        this.typed = (this.typed + event.key).slice(-8);
        if (this.typed.endsWith('debug')) {
          // Swallow the last letter. Without this the `g` that opened the console was
          // inserted into the input it had just focused, and the first command was `ghelp`.
          event.preventDefault();
          this.typed = '';
          this.toggleDev(true);
        }
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (this.dev.open) return; // the console handles its own Escape, above
      const state = this.lastState;
      if (state?.bill) this.handlers.dismissBill();
      else if (state?.ceremony) this.handlers.dismissCeremony();
      else if (this.roleOpen) this.roleOpen = null;
      else if (this.rankSpace) this.rankSpace = null;
      else if (this.openModal) this.openModal = null;
      else return;
      event.preventDefault();
      this.rerender();
    });

    this.root.addEventListener('input', (event) => {
      const target = event.target as HTMLElement;
      if (target.id === 'space-name') this.onNameTyped(target as HTMLInputElement);
    });

    // Enter in the name box opens the doors: the field and the button are the whole form.
    this.root.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      if (target.id !== 'space-name' || event.key !== 'Enter') return;
      event.preventDefault();
      const name = this.nameField().trim();
      if (name) this.handlers.begin(name, this.start.logo, this.start.difficulty);
    });

    // pointerdown, NOT click. The panels re-render as the sim advances, so the element
    // under the cursor can be replaced between press and release — and the browser then
    // never fires `click` at all. Acting on press is immune to that.
    this.root.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return; // primary button only
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      const { action, value, id, id2 } = target.dataset;
      const h = this.handlers;
      switch (action) {
        case 'speed':
          h.setSpeed(Number(value));
          break;
        case 'noop':
          break;
        case 'jobs-open':
          this.openModal = 'jobs';
          this.jobs = { open: true, step: 'category', source: null, size: 'any', defId: null, offerId: null };
          this.rerender();
          break;
        case 'rank-view':
          this.rankTab = (value as 'table' | 'trophies') ?? 'table';
          this.rankSpace = null;
          this.rerender();
          break;
        case 'trophy-year':
          this.trophyYear = value ? Number(value) : null;
          this.rerender();
          break;
        case 'rank-space':
          // '' is the way back to whichever table you came from.
          this.rankSpace = value || null;
          this.rerender();
          break;
        case 'trophy-mode':
          this.trophyMode = (value as 'year' | 'all') ?? 'year';
          this.rerender();
          break;
        case 'trophy-cat':
          // '' is the way back out to every category.
          this.trophyScope = value || null;
          this.rerender();
          break;
        case 'rank-sort': {
          const key = value as RankKey;
          this.rankSort =
            this.rankSort.key === key
              ? { key, dir: this.rankSort.dir === -1 ? 1 : -1 }
              : { key, dir: -1 };
          this.rerender();
          break;
        }
        case 'ranking-open':
          this.openModal = 'ranking';
          this.rerender();
          break;
        case 'projects-open':
          this.openModal = 'projects';
          this.rerender();
          break;
        case 'role-open':
          this.roleOpen = (value || null) as Role | null;
          this.rerender();
          break;
        case 'set-role':
          if (id) h.setRole(id, (value || null) as Role | null);
          this.roleOpen = null;
          this.rerender();
          break;
        case 'bench-open':
          // Clicking the open one folds it away, so you can see the whole bench at a glance.
          this.benchOpen = this.benchOpen === id ? '' : (id ?? null);
          this.rerender();
          break;
        case 'panel-toggle': {
          // Two panels compete for one column; folding one gives the other the room.
          const key = value as 'log' | 'members';
          if (key) this.folded[key] = !this.folded[key];
          this.rerender();
          break;
        }
        case 'people-tab':
          this.peopleTab = (value as 'all' | 'free' | 'on' | 'open') ?? 'all';
          this.rerender();
          break;
        case 'projects-tab':
          this.projectsTab = (value as 'all' | 'on' | 'done') ?? 'all';
          this.rerender();
          break;
        case 'machines-open':
          this.openModal = 'machines';
          this.rerender();
          break;
        case 'bill-close':
          h.dismissBill();
          this.rerender();
          break;
        case 'let-go':
          if (id) h.letGo(id);
          this.rerender();
          break;
        case 'reveal-next':
          this.revealNext();
          break;
        case 'reveal-all': {
          window.clearTimeout(this.revealTimer);
          this.revealed = this.lastState?.ceremony?.awards.length ?? 0;
          this.rerender();
          break;
        }
        case 'ceremony-close':
          h.dismissCeremony();
          this.rerender();
          break;
        case 'lang':
          if (!this.lastState?.started) this.start.name = this.nameField();
          h.setLocale(value as Locale);
          break;
        case 'logo':
          this.start.name = this.nameField();
          this.start.logo = Number(value);
          this.rerender();
          break;
        case 'difficulty':
          this.start.name = this.nameField();
          this.start.difficulty = value as DifficultyKey;
          this.rerender();
          break;
        case 'continue':
          h.continueRun();
          break;
        case 'discard-ask':
          this.start.confirmDiscard = true;
          this.rerender();
          break;
        case 'discard-keep':
          this.start.confirmDiscard = false;
          this.rerender();
          break;
        case 'discard-save':
          this.start.confirmDiscard = false;
          h.discardSave();
          break;
        case 'new-open':
          this.start.newOpen = true;
          this.startFocused = false; // the name box has just appeared — give it the caret
          this.rerender();
          break;
        case 'shuffle-name': {
          // Swap the text in place rather than re-render: only the field changes, and a
          // repaint of the whole card for one word reads as the screen jumping.
          const input = this.root.querySelector<HTMLInputElement>('#space-name');
          if (!input) break;
          input.value = this.dealName();
          this.onNameTyped(input);
          input.focus();
          input.select();
          break;
        }
        case 'begin': {
          const name = this.nameField().trim();
          if (!name) break;
          h.begin(name, this.start.logo, this.start.difficulty);
          break;
        }
        case 'people-open':
          this.openModal = 'people';
          this.rerender();
          break;
        case 'reddit-open': {
          this.openModal = 'reddit';
          // Open on the build most worth showing that has not already gone up today; the
          // space is the fallback, and it is always a legitimate thing to post about.
          const state = this.lastState;
          const fresh = (id: string) =>
            !state?.posts.some((p) => p.projectId === id && p.day === state.day);
          const best = (state?.runtime.projects ?? [])
            .filter((p) => !p.shipped && fresh(p.id))
            .sort((a, b) => merit(b) - merit(a))[0];
          this.reddit.projectId = best?.id ?? SPACE_SUBJECT;
          this.rerender();
          break;
        }
        case 'reddit-project':
          this.reddit.projectId = id ?? SPACE_SUBJECT;
          this.rerender();
          break;
        case 'reddit-claim':
          this.reddit.claim = (value as ClaimKey) ?? 'wip';
          this.rerender();
          break;
        case 'reddit-post':
          // The room *is* the button, so the click carries everything the post needs.
          if (value) h.post(this.reddit.projectId ?? SPACE_SUBJECT, value, this.reddit.claim);
          this.rerender();
          break;
        case 'jobs-close':
          this.openModal = null;
          this.rerender();
          break;
        case 'hire':
          if (id) h.hire(id, (value as Employment) ?? 'full-time');
          this.rerender();
          break;
        case 'pass-applicant':
          if (id) h.passApplicant(id);
          this.rerender();
          break;
        case 'jobs-back':
          this.jobs.step = this.jobs.step === 'crew' ? 'project' : 'category';
          this.rerender();
          break;
        case 'jobs-step':
          // Breadcrumb: a step you have already completed is a way back to it.
          this.jobs.step = value as JobStep;
          this.rerender();
          break;
        case 'jobs-category':
          this.jobs.source =
            value === 'offers' || value === 'bestfit'
              ? (value as 'offers' | 'bestfit')
              : (value as ProjectCategory);
          this.jobs.size = 'any';
          this.jobs.step = 'project';
          this.rerender();
          break;
        case 'jobs-size':
          // Narrows the list in place; it is a filter, not a step.
          this.jobs.size = value as SizeFilter;
          this.rerender();
          break;
        case 'jobs-project': {
          this.jobs.defId = id ?? null;
          this.jobs.offerId = id2 || null;
          this.jobs.step = 'crew';
          const chosen = id ? CATALOG_MAP[id] : null;
          if (chosen && this.lastState) this.suggestCrew(chosen, this.lastState);
          this.rerender();
          break;
        }
        case 'pitch': {
          if (!id) break;
          const draft = [...(this.draftTeams.get(id) ?? [])];
          h.pitch(id, id2 || undefined, draft);
          this.draftTeams.delete(id);
          this.draftTouched.delete(id);
          this.openModal = null;
          this.rerender();
          break;
        }
        case 'draft': {
          if (!id || !id2) break;
          const def = CATALOG_MAP[id];
          const set = this.draftTeams.get(id) ?? new Set<string>();
          if (set.has(id2)) set.delete(id2);
          else if (set.size < def.teamSize) set.add(id2);
          this.draftTeams.set(id, set);
          // From here the crew is the player's, not a suggestion — stop overwriting it.
          this.draftTouched.add(id);
          this.rerender();
          break;
        }
        case 'work':
          if (id) h.workOn(id);
          break;
        case 'stop-work':
          h.stopWork();
          break;
        case 'calibrate':
          h.calibrate();
          break;
        case 'invite':
          if (id && id2) h.invite(id, id2);
          break;
        case 'release':
          if (id && id2) h.release(id, id2);
          break;
        case 'repitch':
          if (id) h.repitch(id);
          break;
        case 'bounty':
          if (id) h.bounty(id);
          break;
        case 'order':
          if (id) h.orderParts(id);
          break;
        case 'expedite':
          if (id) h.expedite(id);
          break;
        case 'skip-sim':
          if (id) h.skipSim(id);
          break;
        case 'queue-all':
          if (id) h.queueAll(id);
          break;
        case 'queue-part':
          if (id && id2) h.queuePart(id, id2);
          break;
        case 'job-up':
          if (id && id2) h.moveJob(id, id2, -1);
          break;
        case 'job-down':
          if (id && id2) h.moveJob(id, id2, 1);
          break;
        case 'job-cancel':
          if (id && id2) h.cancelJob(id, id2);
          break;
        case 'filament':
          h.buyFilament(id || undefined);
          this.rerender();
          break;
        case 'buy-printer':
          if (value) h.buyPrinter(value);
          this.rerender();
          break;
        case 'dev-close':
          this.toggleDev(false);
          break;
        case 'turn-amenity':
          h.turnAmenity();
          break;
        case 'done-moving':
          h.stopMoving();
          this.rerender();
          break;
        case 'shop-open':
          this.openModal = 'shop';
          this.rerender();
          break;
        case 'buy-amenity':
          if (value) h.buyAmenity(value);
          this.rerender();
          break;
        case 'sign-lease':
          h.signLease();
          this.rerender();
          break;
        case 'sell-printer':
          if (id) h.sellPrinter(id);
          this.rerender();
          break;
      }
    });
  }

  private rerender() {
    if (this.lastState) this.render(this.lastState);
  }

  /** The live value of the name box, so a re-render never eats what was typed. */
  private nameField(): string {
    const input = this.root.querySelector<HTMLInputElement>('#space-name');
    return input ? input.value : this.start.name;
  }

  render(state: GameState) {
    this.lastState = state;
    if (!state.started) {
      this.renderStart();
      return;
    }
    if (state.gameOver) {
      this.renderGameOver(state);
      return;
    }
    this.setHTML(this.startEl, 'start', '');
    this.renderChrome();
    this.renderTopbar(state);
    this.renderProjects(state);
    this.root.querySelector('#log')?.classList.toggle('folded', this.folded.log);
    this.root.querySelector('#members')?.classList.toggle('folded', this.folded.members);
    this.renderMembers(state);
    this.renderLog(state);
    this.renderBottomBar(state);
    this.renderMoving(state);
    this.renderDev();
    this.renderModal(state);
  }

  /**
   * The headings `build()` writes once. They are said again on every render (cached, so it
   * costs nothing) because a language switch has to reach them too.
   */
  private renderChrome() {
    const head = (selector: string, html: string) => {
      const el = this.root.querySelector<HTMLElement>(selector);
      if (el) this.setHTML(el, `head:${selector}`, html);
    };
    head('#left > h2', esc(t('ui.bench.title')));
    head('#log > h2', `${esc(t('ui.log.title'))}<i class="fold"></i>`);
    head('#members > h2', `${esc(t('ui.members.title'))}<i class="fold"></i>`);
    // The build menu is being rebuilt on another branch and has not been translated yet.
    // Saying it is English keeps Turkish casing rules off it: "Ranking" must not become
    // RANKİNG. Drop this when it goes through t().
    this.bottombar.lang = 'en';
  }

  /** English / Türkçe. Each language names itself, so the way back is always readable. */
  private languagePicker(): string {
    const names: Record<Locale, string> = { en: 'English', tr: 'Türkçe', xx: '⟦xx⟧' };
    const shown = LOCALES.filter((l) => l !== 'xx' || getLocale() === 'xx');
    return `<div class="lang-pick" role="radiogroup" aria-label="${esc(t('ui.language'))}">
      ${icon('globe')}
      ${shown
        .map((l) => {
          const on = l === getLocale();
          return `<button class="ui-btn ui-btn--sm ${on ? 'ui-btn--outline on' : 'ui-btn--ghost'}"
            role="radio" aria-checked="${on}" lang="${l === 'xx' ? 'en' : l}"
            data-action="lang" data-value="${l}">${names[l]}</button>`;
        })
        .join('')}
    </div>`;
  }

  /**
   * What you are holding while rearranging the room (§7b). It is a strip above the build
   * menu rather than a modal on purpose: **the thing you are deciding about is the room**,
   * and a dialog over it would cover the tiles you are choosing between.
   */
  private renderMoving(state: GameState) {
    const id = state.moving;
    const comfort = id ? AMENITIES.find((a) => a.id === id) : null;
    const station = id ? STATION_MAP[id] : undefined;
    if (!id || (!comfort && !station)) {
      this.setHTML(this.movingEl, 'moving', '');
      this.movingEl.classList.remove('on');
      return;
    }
    const name = comfort?.name ?? station!.label;
    const tone = comfort?.tone ?? 'var(--primary)';
    const glyph = comfort?.icon ?? 'printer';
    // Turning a station moves the tile somebody stands on, which is a different sentence
    // from turning a sofa — and it is the only thing about it the player has to know.
    const how = station ? t('ui.moving.howStation') : t('ui.moving.howComfort');
    this.movingEl.classList.add('on');
    this.setHTML(
      this.movingEl,
      'moving',
      `<span class="icon-chip" style="--tone:${tone}">${icon(glyph as IconName, 'ui-icon ui-icon--lg')}</span>
       <div class="ui-row__main">
         <b class="ui-title">${esc(t('ui.moving.title', { name }))}</b>
         <span class="ui-desc">${how}</span>
       </div>
       <button class="ui-btn ui-btn--outline ui-btn--sm" data-action="turn-amenity">${icon('shuffle')}${t('ui.moving.turn')}</button>
       <button class="ui-btn ui-btn--primary ui-btn--sm" data-action="done-moving">${icon('check')}${t('ui.done')}</button>`,
    );
  }

  /**
   * The developer console (§15). Opened by typing `debug` anywhere, or with the backtick
   * key, and by nothing else — it is a tool, not a feature, and a player who has not been
   * told about it should never meet it.
   *
   * The output is written straight into the DOM rather than through `setHTML`, because the
   * caching there is keyed on the markup and a command that prints the same lines twice
   * would look like it had not run.
   */
  private renderDev() {
    if (!this.dev.open) {
      if (this.devEl.classList.contains('on')) {
        this.devEl.classList.remove('on');
        this.devEl.innerHTML = '';
        this.htmlCache.delete('dev');
      }
      return;
    }
    if (this.devEl.classList.contains('on')) return; // it owns its own DOM while open
    this.devEl.classList.add('on');
    this.devEl.innerHTML = `
      <div class="dev-head">
        <b>developer console</b>
        <span class="ui-desc">type <code>help</code> · ↑ for the last command · Esc to close</span>
        <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="dev-close">${icon('x')}</button>
      </div>
      <pre class="dev-out"></pre>
      <div class="dev-line"><span>&gt;</span><input id="dev-input" autocomplete="off" spellcheck="false" /></div>`;
    this.paintDevOutput();
    (this.devEl.querySelector('#dev-input') as HTMLInputElement | null)?.focus();
  }

  private paintDevOutput() {
    const out = this.devEl.querySelector('.dev-out');
    if (!out) return;
    out.textContent = this.dev.lines.slice(-200).join('\n');
    out.scrollTop = out.scrollHeight;
  }

  private devRun(line: string) {
    this.dev.lines.push(`> ${line}`);
    if (line.trim() === 'clear') {
      this.dev.lines = [];
    } else {
      for (const out of this.handlers.devCommand(line)) this.dev.lines.push(out);
    }
    this.dev.history.push(line);
    this.dev.at = this.dev.history.length;
    this.paintDevOutput();
    this.rerender();
  }

  private toggleDev(open: boolean) {
    if (this.dev.open === open) return;
    this.dev.open = open;
    if (open && !this.dev.lines.length) {
      this.dev.lines.push('Hackerspace Tycoon — developer console. "help" lists what it can do.');
    }
    this.renderDev();
  }

  private renderGameOver(state: GameState) {
    const best = [...state.shipped].sort((a, b) => b.hype - a.hype)[0];
    this.setHTML(
      this.startEl,
      'start',
      `<div class="start-backdrop">
        <div class="start-card">
          <div class="start-brand">
            <span class="icon-chip start-badge" style="--tone:var(--destructive)">${icon('x', 'ui-icon')}</span>
            <div>
              <div class="ui-label">${t('ui.over.day', { day: state.gameOver!.day })}</div>
              <h1>${esc(t('ui.over.title', { name: state.identity?.name ?? t('ui.over.theSpace') }))}</h1>
            </div>
          </div>
          <p class="ui-desc" style="margin:0 0 16px">${esc(say(state.gameOver!.reason))}</p>
          <div class="over-stats">
            <div><b>${state.shippedCount}</b><span>${t('ui.stat.shipped')}</span></div>
            <div><b>${state.reputation}</b><span>${t('ui.stat.reputation')}</span></div>
            <div><b>${state.runtime.members.length}</b><span>${t('ui.stat.onTheBooks')}</span></div>
            <div><b>${state.ceremonies.reduce((n, c) => n + c.awards.filter((a) => a.playerWon).length, 0)}</b><span>${t('ui.stat.awards')}</span></div>
          </div>
          ${
            best
              ? `<p class="ui-desc" style="margin:14px 0 0">${t('ui.over.remembered', { name: `<b>${esc(best.name)}</b>`, day: best.day })}</p>`
              : `<p class="ui-desc" style="margin:14px 0 0">${t('ui.over.nothing')}</p>`
          }
        </div>
      </div>`,
    );
  }

  // --- start screen ---------------------------------------------------------

  private renderStart() {
    if (!this.start.name && !this.startFocused) this.start.name = this.dealName();
    const name = this.start.name;
    const badge = LOGOS[this.start.logo];
    const saved = this.handlers.savedRun();
    const level = DIFFICULTIES.find((d) => d.key === this.start.difficulty) ?? DIFFICULTIES[1];
    // A saved run is the likelier reason to be here, so it leads and the new form folds.
    const formOpen = !saved || this.start.newOpen;
    this.setHTML(
      this.startEl,
      'start',
      `<div class="start-backdrop">
        <div class="start-stack">
        <div class="start-wordmark">
          ${icon('wrench', 'ui-icon')}<span>Hackerspace Tycoon</span>
        </div>
        ${this.languagePicker()}
        ${saved ? this.resumeCard(saved) : ''}
        ${
          formOpen
            ? `<div class="start-card">
          <header class="start-brand">
            <span class="icon-chip start-badge" style="--tone:${badge.colour}">
              ${icon(badge.icon, 'ui-icon')}
            </span>
            <div class="start-brand__text">
              <label class="ui-label" for="space-name">${t('ui.start.nameLabel')}</label>
              <div class="start-name">
                <input id="space-name" class="start-name__input" maxlength="28"
                  placeholder="${esc(t('ui.start.namePlaceholder'))}" autocomplete="off" spellcheck="false"
                  value="${esc(name)}" />
                <button class="ui-btn ui-btn--ghost start-name__shuffle" data-action="shuffle-name"
                  title="${esc(t('ui.start.shuffleHint'))}" aria-label="${esc(t('ui.start.shuffleHint'))}">
                  ${icon('shuffle')}<span>${t('ui.start.shuffle')}</span>
                </button>
              </div>
            </div>
          </header>
          <p class="ui-desc start-intro">${esc(level.intro)}</p>

          <section class="start-section">
            <div class="ui-label">${t('ui.start.badge')}</div>
            <div class="logo-grid" role="radiogroup" aria-label="${esc(t('ui.start.badge'))}">
              ${LOGOS.map((logo, index) => {
                const on = index === this.start.logo;
                return `<button class="logo-pick ${on ? 'on' : ''}" role="radio"
                  aria-checked="${on}" aria-label="${esc(t('ui.start.badgeN', { n: index + 1 }))}"
                  style="--tone:${logo.colour}" data-action="logo" data-value="${index}">
                  ${icon(logo.icon, 'ui-icon ui-icon--lg')}
                </button>`;
              }).join('')}
            </div>
          </section>

          <section class="start-section">
            <div class="ui-label">${t('ui.start.difficulty')}</div>
            <div class="ui-grid ui-grid--3" role="radiogroup" aria-label="${esc(t('ui.start.difficultyAria'))}">
              ${DIFFICULTIES.map((level) => {
                const on = level.key === this.start.difficulty;
                // Three bars, not three adjectives: the setting is one quantity and it
                // deserves one visual. Colour arrives as --tone (§11), never a raw hex here.
                const meter = [1, 2, 3]
                  .map((step) => `<i class="${step <= level.pressure ? 'lit' : ''}"></i>`)
                  .join('');
                // Terms as a ruled list, not a heap of pills: the same three rows in the
                // same place on every card, so the eye compares across rather than hunts.
                return `<button class="ui-option diff-pick ${on ? 'on' : ''}" role="radio"
                  aria-checked="${on}" style="--tone:${level.accent}"
                  data-action="difficulty" data-value="${level.key}">
                  <div class="ui-option__head">
                    <span class="icon-chip pace">${meter}</span>
                    <span class="ui-title">${level.label}</span>
                    ${on ? `<span class="diff-tick">${icon('check')}</span>` : ''}
                  </div>
                  <span class="ui-option__desc ui-clamp-3">${esc(level.blurb)}</span>
                  <dl class="diff-terms">
                    <div title="${esc(t('ui.start.crewHint'))}">
                      <dt>${icon('users')}${t('ui.start.crew')}</dt><dd>${level.startMembers}</dd>
                    </div>
                    <div title="${esc(t('ui.start.newFaceHint'))}">
                      <dt>${icon('clock')}${t('ui.start.newFace')}</dt><dd>${t('ui.days.short', { days: level.recruitEvery })}</dd>
                    </div>
                    <div title="${esc(t('ui.start.cashHint'))}">
                      <dt>${icon('coins')}${t('ui.start.cash')}</dt><dd>${money(level.startCash)}</dd>
                    </div>
                  </dl>
                </button>`;
              }).join('')}
            </div>
            <p class="ui-desc start-note">${t('ui.start.difficultyNote')}</p>
          </section>

          <button id="start-go" class="ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
            data-action="begin" ${name.trim() ? '' : 'disabled'}>
            ${t('ui.start.go')}<kbd class="start-kbd">Enter</kbd>
          </button>
          ${
            saved
              ? `<p class="start-foot">${t('ui.start.savedStays')}</p>`
              : ''
          }
        </div>`
            : `<button class="start-card start-new" data-action="new-open">
                <span class="icon-chip" style="--tone:var(--primary)">${icon('plus')}</span>
                <span class="start-new__text">
                  <span class="ui-title">${t('ui.start.new')}</span>
                  <span class="ui-desc">${t('ui.start.newBlurb')}</span>
                </span>
              </button>`
        }
        </div>
      </div>`,
    );
    const input = this.root.querySelector<HTMLInputElement>('#space-name');
    if (!input) return;
    if (document.activeElement !== input) input.value = name;
    // Focus once, on the first paint of the screen — never on every re-render, which
    // would steal the caret back to the start of the field mid-word.
    if (!this.startFocused) {
      this.startFocused = true;
      input.focus();
      input.select();
    }
  }

  private resumeCard(saved: NonNullable<ReturnType<UIHandlers['savedRun']>>): string {
    const actions = this.start.confirmDiscard
      ? `<div class="start-confirm" role="alert">
          <span>${t('ui.resume.confirm')}</span>
          <button class="ui-btn ui-btn--ghost" data-action="discard-keep">${t('ui.resume.keep')}</button>
          <button class="ui-btn ui-btn--danger" data-action="discard-save">${icon('x')}${t('ui.resume.discard')}</button>
        </div>`
      : `<div class="row" style="gap:8px">
          <button class="ui-btn ui-btn--primary ui-btn--lg" style="flex:1" data-action="continue">
            ${t('ui.resume.carryOn')}
          </button>
          <button class="ui-btn ui-btn--ghost ui-btn--lg" data-action="discard-ask"
            title="${esc(t('ui.resume.discardHint'))}">
            ${icon('x')}${t('ui.resume.discard')}
          </button>
        </div>`;
    return `<div class="start-card resume">
      <header class="start-brand">
        <span class="icon-chip start-badge" style="--tone:${saved.colour}">
          ${icon(saved.icon as IconName, 'ui-icon')}
        </span>
        <div class="start-brand__text">
          <div class="ui-label">${t('ui.resume.title')}</div>
          <h1>${esc(saved.name)}</h1>
        </div>
        <span class="ui-badge start-era">${icon('building')}${esc(saved.era)}</span>
      </header>
      <div class="resume-stats">
        <div><b>${saved.day}</b><span>${t('ui.stat.day')}</span></div>
        <div><b>${saved.shipped}</b><span>${t('ui.stat.shipped')}</span></div>
        <div><b>${saved.reputation}</b><span>${t('ui.stat.reputation')}</span></div>
        <div><b>${money(saved.cash)}</b><span>${t('ui.stat.cash')}</span></div>
      </div>
      ${actions}
    </div>`;
  }

  /**
   * Typing updates the Open-the-doors button in place. Re-rendering on every keystroke
   * would replace the input under the caret, so this touches only what actually changes.
   */
  private onNameTyped(input: HTMLInputElement) {
    this.start.name = input.value;
    const typed = input.value.trim();
    const go = this.root.querySelector<HTMLButtonElement>('#start-go');
    if (go) go.disabled = !typed;
  }

  // --- top bar --------------------------------------------------------------

  private renderTopbar(state: GameState) {
    const speedButton = (value: number, label: string) => {
      const active = value === 0 ? state.paused : !state.paused && state.speed === value;
      return `<button data-action="speed" data-value="${value}" class="tiny ${active ? 'active' : ''}">${label}</button>`;
    };
    const allocation = this.handlers.allocation();
    const season = state.runtime.season;
    const seasonPct = (season.dayOfYear / season.length) * 100;
    const daysLeft = season.length - season.dayOfYear;

    // The clock lives in its own corner: it is the one thing you glance at constantly,
    // and it changes every frame, so it has no business sharing a box with the totals.
    this.setHTML(
      this.clockPanel,
      'clock',
      `<b class="clock"></b>
       <span class="day">${dayName(state.day)} · ${t('ui.top.day', { day: state.day })}</span>
       <div class="speeds">
         ${speedButton(0, '❙❙')}
         ${TIME.speeds.map((s) => speedButton(s, `${s}×`)).join('')}
       </div>
       ${this.dayBar(state)}`,
    );
    const clockEl = this.clockPanel.querySelector('.clock');
    if (clockEl) clockEl.textContent = clock(state.simTime);

    // Money reads as a state, not a number: in the black, running low, or under water.
    const cashTone = state.cash < 0 ? 'bad' : state.cash < FILAMENT.spoolCost ? 'warn' : 'good';
    this.setHTML(this.topbar, 'topbar', `
      <div class="row" style="gap:8px">
        <span class="icon-chip" style="--tone:${state.identity?.colour ?? 'var(--primary)'};width:28px;height:28px">
          ${icon((state.identity?.icon ?? 'wrench') as IconName)}
        </span>
        <div class="stat"><b style="font-size:12.5px">${esc(state.identity?.name ?? t('ui.top.yourSpace'))}</b>
          <span>${eraDef(state.era).name}</span></div>
        ${(() => {
          const lease = this.handlers.nextLease();
          if (!lease?.ready) return '';
          return `<button class="ui-btn ${lease.afford ? 'ui-btn--primary' : 'ui-btn--outline'} ui-btn--sm"
            data-action="sign-lease" ${lease.afford ? '' : 'disabled'}
            title="${esc(t('ui.top.leaseHint', { space: lease.def.name }))}">
            ${icon('building')}${esc(t('ui.top.moveTo', { space: lease.def.name }))} · ${money(lease.def.moveCost)}
          </button>`;
        })()}
      </div>
      <div class="sep"></div>
      <div class="stat"><b class="cash cash--${cashTone}">${money(state.cash)}</b><span>${t('ui.stat.cash')}</span></div>
      ${(() => {
        const next = this.handlers.previewBill();
        const tone = next.net < 0 && state.cash + next.net < 0 ? 'bad' : next.net < 0 ? 'warn' : 'good';
        return `<div class="stat" title="${esc(t('ui.top.billHint'))}">
          <b class="cash cash--${tone}">${next.net < 0 ? '−' : '+'}${money(Math.abs(next.net))}</b>
          <span>${t('ui.top.billIn', { days: next.dueInDays })}</span>
        </div>`;
      })()}
      <div class="stat"><b>${state.runtime.projects.length}</b><span>${t('ui.top.projects')}</span></div>
      <div class="stat" title="${esc(t('ui.top.allocatedHint'))}">
        <b>${allocation.used}/${allocation.total}</b><span>${t('ui.top.allocated')}</span>
      </div>
      <div class="stat"><b>${state.shippedCount}</b><span>${t('ui.stat.shipped')}</span></div>
      <div class="stat" title="${esc(t('ui.top.reputationHint'))}">
        <b>${state.reputation}${
          Number.isFinite(eraDef(state.era).repToAdvance)
            ? `<span class="muted" style="font-size:10px">/${eraDef(state.era).repToAdvance}</span>`
            : ''
        }</b>
        <span>${t('ui.stat.reputation')}</span>
      </div>
      <div class="sep"></div>
      <button class="season" data-action="ranking-open"
        title="${esc(t('ui.top.seasonHint', { year: season.year, days: daysLeft }))}">
        <span class="season-label">${season.year}</span>
        <span class="season-bar"><i style="width:${seasonPct.toFixed(1)}%"></i></span>
        <span class="season-left">${t('ui.days.short', { days: daysLeft })}</span>
      </button>
      ${(() => {
        // One press flips between the two; the button names the language it switches *to*,
        // in that language, so somebody who cannot read the current one can still find it.
        const next: Locale = getLocale() === 'tr' ? 'en' : 'tr';
        return `<button class="lang-toggle" data-action="lang" data-value="${next}" lang="${next}"
          title="${next === 'tr' ? 'Türkçe' : 'English'}">${icon('globe')}${next.toUpperCase()}</button>`;
      })()}
    `);
  }

  /**
   * The build menu. Shop, Events and the space builder land here in later phases
   * (CLAUDE.md §14). Machines sits here rather than in a permanent sidebar: a queue you
   * only touch a few times a day does not earn a third of the right-hand column.
   */
  private renderBottomBar(state: GameState) {
    const offers = state.backlog.length;
    const machines = state.runtime.machines;
    const jobs = machines.reduce((n, m) => n + m.queue.length + (m.current ? 1 : 0), 0);
    // The one thing the bar must say from across the room: something needs a human.
    const needsHand = machines.some(
      (m) =>
        m.calibration < MACHINE.calibrationWarning ||
        (m.consumableMax > 0 && m.consumable < FILAMENT.lowWarning),
    );
    this.setHTML(
      this.bottombar,
      'bottombar',
      `<button class="bar-item ${this.openModal === 'jobs' ? 'active' : ''}" data-action="jobs-open"
         title="Start something new">
         ${icon('clipboard', 'ui-icon bar-icon')}
         <span class="bar-label">Jobs</span>
         ${offers ? `<i class="pip">${offers}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'projects' ? 'active' : ''}" data-action="projects-open"
         title="Everything on, waiting and done">
         ${icon('clipboard', 'ui-icon bar-icon')}
         <span class="bar-label">Projects</span>
         ${state.runtime.projects.length ? `<i class="pip">${state.runtime.projects.length}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'ranking' ? 'active' : ''}" data-action="ranking-open"
         title="How the other spaces are doing">
         ${icon('flame', 'ui-icon bar-icon')}
         <span class="bar-label">Ranking</span>
       </button>
       <button class="bar-item ${this.openModal === 'machines' ? 'active' : ''} ${needsHand ? 'bar-item--alert' : ''}"
         data-action="machines-open"
         title="${needsHand ? 'A machine wants calibrating or feeding' : 'The shop floor and its queues'}">
         ${icon('printer', 'ui-icon bar-icon')}
         <span class="bar-label">Machines</span>
         ${jobs ? `<i class="pip">${jobs}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'people' ? 'active' : ''} ${state.applicants.length ? 'bar-item--news' : ''}"
         data-action="people-open"
         title="${state.applicants.length ? `${state.applicants.length} waiting on an answer` : 'Who is here, and who you could take on'}">
         ${icon('users', 'ui-icon bar-icon')}
         <span class="bar-label">People</span>
         ${state.applicants.length ? `<i class="pip">${state.applicants.length}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'shop' ? 'active' : ''}" data-action="shop-open"
         title="Comforts for the people, not for the work">
         ${icon('coins', 'ui-icon bar-icon')}
         <span class="bar-label">Shop</span>
         ${
           AMENITIES.some((a) => a.era <= state.era && !state.amenities.includes(a.id))
             ? `<i class="pip">${AMENITIES.filter((a) => a.era <= state.era && !state.amenities.includes(a.id)).length}</i>`
             : ''
         }
       </button>
       <button class="bar-item ${this.openModal === 'reddit' ? 'active' : ''}" data-action="reddit-open"
         title="Put something in front of an audience — attention falls on its own">
         ${icon('flame', 'ui-icon bar-icon')}
         <span class="bar-label">Socials</span>
         ${state.hype >= 1 ? `<i class="pip">${Math.round(state.hype)}</i>` : ''}
       </button>`,
    );
  }

  // --- the Jobs wizard ------------------------------------------------------

  /** The awards night takes the screen until it is dismissed. */
  /**
   * Awards night, read out one envelope at a time. A list of seven results that all appear
   * at once is a table; handing them over one by one is the only thing that makes it a
   * ceremony — and the two skips mean nobody sits through it who does not want to.
   */
  private renderCeremony(state: GameState): boolean {
    const ceremony = state.ceremony;
    if (!ceremony) {
      this.stopReveal();
      return false;
    }
    // A new ceremony starts closed; the same one carries on from where it got to.
    if (this.revealKey !== ceremony.year) {
      this.revealKey = ceremony.year;
      this.revealed = 0;
      this.scheduleReveal();
    }

    const total = ceremony.awards.length;
    const done = this.revealed >= total;
    const won = ceremony.awards.filter((a, i) => a.playerWon && i < this.revealed).length;

    this.setHTML(
      this.modal,
      'modal',
      `<div class="modal-backdrop">
        <div class="modal ceremony modal--fit" data-action="noop">
          <header>
            <div class="modal-head">${icon('flame', 'ui-icon ui-icon--lg')}<b>${t('ui.ceremony.title', { year: ceremony.year })}</b></div>
          </header>
          <div class="modal-body">
            <!-- A stage rather than a list. It is one of four set pieces in the run and the
                 only one that is purely a reward, so it gets curtains and a trophy table. -->
            <div class="stage">
              <div class="stage-curtain stage-curtain--left"></div>
              <div class="stage-curtain stage-curtain--right"></div>
              <div class="stage-floor">
                ${ceremony.awards
                  .map((award, index) => {
                    if (index >= this.revealed) {
                      return `<div class="trophy trophy--sealed">
                        <span class="trophy-cup">${icon('trophy', 'ui-icon')}</span>
                        <span class="trophy-award">${esc(award.category)}</span>
                        <span class="trophy-winner">&nbsp;</span>
                      </div>`;
                    }
                    return `<div class="trophy trophy--open ${award.playerWon ? 'trophy--ours' : ''}"
                      title="${esc(award.blurb)} — ${esc(award.value)}">
                      <span class="trophy-cup">${icon('trophy', 'ui-icon')}</span>
                      <span class="trophy-award">${esc(award.category)}</span>
                      <span class="trophy-winner">${esc(award.winnerName)}</span>
                      <span class="trophy-value">${esc(award.value)}</span>
                    </div>`;
                  })
                  .join('')}
              </div>
            </div>
            <p class="ui-desc" style="margin:14px 0 0;text-align:center">
              ${
                done
                  ? won
                    ? ceremony.reputationGained
                      ? t('ui.ceremony.wonRep', { won: `<b>${won}</b>`, total, reputation: ceremony.reputationGained })
                      : t('ui.ceremony.won', { won: `<b>${won}</b>`, total })
                    : t('ui.ceremony.none')
                  : t('ui.ceremony.envelope', { n: Math.min(this.revealed + 1, total), total })
              }
            </p>
          </div>
          <footer>
            ${
              done
                ? `<button class="ui-btn ui-btn--primary ui-btn--block" data-action="ceremony-close">
                     ${t('ui.ceremony.backToWork')}
                   </button>`
                : `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="reveal-next">
                     ${t('ui.ceremony.next')}
                   </button>
                   <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="reveal-all">
                     ${t('ui.ceremony.skipAll')}
                   </button>`
            }
          </footer>
        </div>
      </div>`,
    );
    return true;
  }

  /** Hand over the next envelope in a moment, unless something skips ahead first. */
  private scheduleReveal() {
    window.clearTimeout(this.revealTimer);
    this.revealTimer = window.setTimeout(() => this.revealNext(), 1100);
  }

  private revealNext() {
    const total = this.lastState?.ceremony?.awards.length ?? 0;
    if (this.revealed >= total) return;
    this.revealed += 1;
    if (this.revealed < total) this.scheduleReveal();
    this.rerender();
  }

  private stopReveal() {
    window.clearTimeout(this.revealTimer);
    this.revealKey = null;
  }

  private rankingBody(state: GameState): { head: string; content: string; foot: string } {
    const season = state.runtime.season;
    const daysLeft = season.length - season.dayOfYear;

    const columns: {
      key: RankKey;
      label: string;
      title: string;
      award?: string;
      value: (row: ScoreRow) => number;
      format: (row: ScoreRow) => string;
    }[] = [
      {
        key: 'projectsThisYear',
        label: t('ui.rank.col.ships'),
        title: t('ui.rank.col.shipsHint'),
        value: (r) => r.projectsThisYear,
        format: (r) => String(r.projectsThisYear),
      },
      {
        key: 'members',
        label: t('ui.rank.col.crew'),
        title: t('ui.rank.col.crewHint'),
        value: (r) => r.members,
        format: (r) => String(r.members),
      },
      {
        key: 'reputation',
        label: t('ui.rank.col.reputation'),
        title: t('ui.rank.col.reputationHint'),
        value: (r) => r.reputation,
        format: (r) => num(r.reputation),
      },
    ];

    const active =
      columns.find((c) => c.key === this.rankSort.key) ?? columns.find((c) => c.key === 'reputation')!;
    const rows = [...this.handlers.scoreboard()].sort(
      (a, b) => (active.value(a) - active.value(b)) * this.rankSort.dir,
    );
    // The leader of each column, so a cell can be marked without re-sorting six times.
    const leaders = new Map(
      columns.map((column) => [
        column.key,
        rows.reduce((best, row) => (column.value(row) > column.value(best) ? row : best), rows[0]).id,
      ]),
    );

    const head = columns
      .map(
        (column) => `<th class="${column.award ? 'award-col' : ''} ${column.key === this.rankSort.key ? 'sorted' : ''}"
          title="${esc(column.award ? t('ui.rank.decides', { title: column.title, award: column.award }) : column.title)}">
          <button data-action="rank-sort" data-value="${column.key}">
            ${column.label}${
              column.key === this.rankSort.key
                ? `<i class="sort-dir">${this.rankSort.dir === -1 ? '▾' : '▴'}</i>`
                : ''
            }
          </button>
        </th>`,
      )
      .join('');

    const body = rows
      .map((row, index) => {
        const blurb = row.isPlayer ? t('ui.top.yourSpace') : RIVAL_MAP[row.id]?.blurb ?? '';
        return `<tr class="${row.isPlayer ? 'me' : ''} clickable" title="${esc(t('ui.rank.openRecordOf', { what: blurb }))}"
          data-action="rank-space" data-value="${esc(row.id)}">
          <td class="rank-cell">${index + 1}</td>
          <td class="space-cell">
            <span class="space-dot" style="--tone:${row.colour}">${icon(row.icon as IconName)}</span>
            <span class="space-name">${esc(row.name)}</span>
          </td>
          ${columns
            .map(
              (column) => `<td class="num ${column.key === this.rankSort.key ? 'sorted' : ''}
                ${leaders.get(column.key) === row.id ? 'lead' : ''}">${column.format(row)}</td>`,
            )
            .join('')}
        </tr>`;
      })
      .join('');

    return {
      head: `<div class="modal-head">${icon('flame', 'ui-icon ui-icon--lg')}<b>${t('ui.rank.title')}</b>
        <span class="ui-badge">${season.year}</span>
        <span class="ui-badge${daysLeft <= 10 ? ' ui-badge--accent' : ''}">${t('ui.rank.toAwards', { days: daysLeft })}</span>
      </div>`,
      content: this.rankSpace
        ? // A drill-in replaces the tabs rather than sitting under them: you are looking at
          // one space, not at a third view of the field, and the crumb says how to get back.
          `<div class="trophy-bar">
            <div class="trophy-scope">
              <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="rank-space" data-value="">
                ${this.rankTab === 'trophies' ? t('ui.rank.trophyRoom') : t('ui.rank.standings')}
              </button>
              <span class="step-sep">›</span>
              <b>${esc(this.handlers.scoreboard().find((r) => r.id === this.rankSpace)?.name ?? t('ui.rank.space'))}</b>
            </div>
          </div>` + this.spaceDetail(state, this.rankSpace)
        : `<div class="ui-segmented" style="margin-bottom:11px">
            <button data-action="rank-view" data-value="table"
              aria-pressed="${this.rankTab === 'table'}">${t('ui.rank.standings')}</button>
            <button data-action="rank-view" data-value="trophies"
              aria-pressed="${this.rankTab === 'trophies'}" ${state.ceremonies.length ? '' : 'disabled'}>
              ${t('ui.rank.trophyRoom')}<span class="seg-count">${state.ceremonies.reduce(
                (n, c) => n + c.awards.filter((a) => a.playerWon).length,
                0,
              )}</span>
            </button>
          </div>` +
          (this.rankTab === 'trophies'
            ? this.trophyRoom(state)
            : `<table class="rank-table standings-table">
                <thead><tr><th></th><th class="space-head">${t('ui.rank.space')}</th>${head}</tr></thead>
                <tbody>${body}</tbody>
              </table>`),
      foot: `<span class="ui-desc" style="font-size:10.5px">${
        this.rankSpace
          ? t('ui.rank.foot.space')
          : this.rankTab === 'trophies'
          ? t('ui.rank.foot.trophies')
            : t('ui.rank.foot.table')
      }</span>`,
    };
  }

  /**
   * The record. Every awards night you have sat through, losses included — the ones you won
   * lit and the rest beside them, because "we came second to Dallas three years running" is
   * part of the story, and a trophy room with only wins in it is a brag rather than a record.
   *
   * Four screens from two switches, on one rule: **by year organises by year, all time
   * organises by space**, at either scope. The year half is the matrix (categories down,
   * years across); the all-time half is a league table of trophies, which is the one
   * question the matrix cannot answer however long you stare at it. Drilling into a single
   * category is what keeps a long run readable — by the fourth year the matrix scrolls, and
   * one category's whole history is seven rows that never will.
   */
  private trophyRoom(state: GameState): string {
    const years = [...state.ceremonies].reverse();
    if (!years.length) {
      return `<p class="ui-desc">${t('ui.trophy.none')}</p>`;
    }

    // AWARDS is the running order of the night. Anything an older save carries that is no
    // longer given out still gets its row rather than being quietly dropped from the record.
    const categories = [
      ...AWARDS.map((award) => award.label),
      ...years.flatMap((year) => year.awards.map((award) => award.category)),
    ].filter((label, i, all) => all.indexOf(label) === i);

    const scope = this.trophyScope && categories.includes(this.trophyScope) ? this.trophyScope : null;
    const won = years.reduce((n, c) => n + c.awards.filter((a) => a.playerWon).length, 0);
    const reputation = years.reduce((n, c) => n + c.reputationGained, 0);
    const scoped = scope
      ? years.filter((c) => c.awards.some((a) => a.category === scope && a.playerWon)).length
      : 0;

    return `<div class="trophy-summary">
        <span class="space-dot" style="--tone:var(--gold)">${icon('trophy')}</span>
        ${
          scope
            ? `${t('ui.trophy.scoped', { won: `<b>${scoped}</b>`, nights: years.length })} —
               ${esc(AWARDS.find((a) => a.label === scope)?.blurb ?? scope)}`
            : reputation
              ? t('ui.trophy.summaryRep', { won: `<b>${won}</b>`, count: won, nights: years.length, reputation })
              : t('ui.trophy.summary', { won: `<b>${won}</b>`, count: won, nights: years.length })
        }
      </div>
      <div class="trophy-bar">
        <div class="trophy-scope">
          ${
            scope
              ? `<button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="trophy-cat" data-value="">
                   ${t('ui.trophy.allCategories')}
                 </button>
                 <span class="step-sep">›</span>
                 <b>${esc(scope)}</b>`
              : this.trophyMode === 'year'
                ? this.yearStrip(years)
                : `<b>${t('ui.trophy.allCategories')}</b>`
          }
        </div>
        <div class="ui-segmented">
          <button data-action="trophy-mode" data-value="year"
            aria-pressed="${this.trophyMode === 'year'}">${t('ui.trophy.byYear')}</button>
          <button data-action="trophy-mode" data-value="all"
            aria-pressed="${this.trophyMode === 'all'}">${t('ui.trophy.allTime')}</button>
        </div>
      </div>
      ${
        scope
          ? this.trophyMode === 'year'
            ? this.trophyCategoryYears(years, scope)
            : this.trophyCategorySpaces(years, scope)
          : this.trophyMode === 'year'
            ? this.trophyYearView(state, years, categories)
            : this.trophyLeague(years, categories)
      }`;
  }

  /** One cell of the record: whose it was, and what it took to win it. */
  private trophyCell(award: CeremonyAward, identity: Identity | null): string {
    const badge = award.playerWon ? identity : RIVAL_MAP[award.winnerId];
    return `<span class="trophy-line">
        <span class="space-dot" style="--tone:${
          award.playerWon ? 'var(--gold)' : badge?.colour ?? 'var(--muted-foreground)'
        }">${icon(award.playerWon ? 'trophy' : ((badge?.icon ?? 'flame') as IconName))}</span>
        <span class="trophy-who">${esc(award.winnerName)}</span>
      </span>
      <span class="trophy-val">${esc(award.value)}</span>`;
  }

  /**
   * One night at a time. The record used to put every year on screen at once, which turned
   * a long run into a sideways scroll and made the newest night — the one you actually came
   * to look at — no more prominent than the one four years ago. A year is now a page, and
   * the strip above it is the whole run: every year, how you did in it, and the way to any
   * of them in one click rather than a scrollbar.
   */
  private trophyYearView(state: GameState, years: Ceremony[], categories: string[]): string {
    const active = this.activeYear(years);

    const body = categories
      .map((category) => {
        const def = AWARDS.find((award) => award.label === category);
        const award = active.awards.find((a) => a.category === category);
        const mine = years.filter((c) =>
          c.awards.some((a) => a.category === category && a.playerWon),
        ).length;
        return `<tr>
          <th class="trophy-cat">
            <span class="trophy-cat-line">
              <button class="trophy-cat-name" data-action="trophy-cat" data-value="${esc(category)}"
                title="${esc(t('ui.trophy.openCategory', { what: def?.blurb ?? '' }))}">${esc(category)}</button>
              <span class="trophy-tally${mine ? ' won' : ''}"
                title="${esc(t('ui.trophy.tallyHint'))}">${mine ? `${mine}x` : '—'}</span>
            </span>
          </th>
          ${
            award
              ? `<td class="trophy-cell${award.playerWon ? ' won' : ''}"
                   data-action="rank-space" data-value="${esc(award.winnerId)}"
                   title="${esc(t('ui.rank.openRecordOf', { what: award.winnerName }))}">
                   ${this.trophyCell(award, state.identity)}
                 </td>`
              : `<td class="trophy-cell"><span class="trophy-none">${t('ui.trophy.notGiven')}</span></td>`
          }
        </tr>`;
      })
      .join('');

    return `<div class="trophy-record">
        <table class="rank-table trophy-single">
          <thead><tr>
            <th class="space-head trophy-cat">
              <span class="trophy-cat-line"><span>${t('ui.trophy.category')}</span><span>${t('ui.trophy.yours')}</span></span>
            </th>
            <th class="space-head">${t('ui.trophy.winnerOctober', { year: active.year })}</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  /** The night on show: whichever the player picked, or the most recent one. */
  private activeYear(years: Ceremony[]): Ceremony {
    return years.find((c) => c.year === this.trophyYear) ?? years[0];
  }

  /**
   * The run as a strip of years — oldest to newest, because a timeline reads that way, with
   * the night you took the most of standing out. It sits in the control bar rather than on a
   * row of its own: four stacked rows of chrome above a seven-row table did not fit the panel.
   */
  private yearStrip(years: Ceremony[]): string {
    const strip = [...years].reverse();
    const active = this.activeYear(years);
    const index = strip.indexOf(active);
    const pills = strip
      .map((ceremony) => {
        const mine = ceremony.awards.filter((a) => a.playerWon).length;
        return `<button class="year-pill" data-action="trophy-year" data-value="${ceremony.year}"
          aria-pressed="${ceremony.year === active.year}"
          title="${esc(
            ceremony.reputationGained
              ? t('ui.trophy.yearHintRep', { year: ceremony.year, won: mine, total: ceremony.awards.length, reputation: ceremony.reputationGained })
              : t('ui.trophy.yearHint', { year: ceremony.year, won: mine, total: ceremony.awards.length })
          )}">
          ${ceremony.year}<i class="${mine ? 'won' : ''}">${mine}/${ceremony.awards.length}</i>
        </button>`;
      })
      .join('');
    return `<div class="year-nav">
      <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="trophy-year"
        data-value="${strip[index - 1]?.year ?? ''}" ${index === 0 ? 'disabled' : ''}
        title="${esc(t('ui.trophy.yearBefore'))}">‹</button>
      <div class="year-pills">${pills}</div>
      <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="trophy-year"
        data-value="${strip[index + 1]?.year ?? ''}" ${
          index === strip.length - 1 ? 'disabled' : ''
        } title="${esc(t('ui.trophy.yearAfter'))}">›</button>
    </div>`;
  }

  /**
   * The cabinet, cumulative: who has won what, all time. Columns are the seven categories at
   * a column head's width, which is why `AwardDef` carries a `short` — and each head is the
   * way into that category, so an abbreviation nobody can decode is one click from its name.
   */
  private trophyLeague(years: Ceremony[], categories: string[]): string {
    const spaces = new Map<
      string,
      { name: string; isPlayer: boolean; total: number; byCategory: Map<string, number> }
    >();
    for (const ceremony of years) {
      for (const award of ceremony.awards) {
        const row =
          spaces.get(award.winnerId) ??
          {
            name: award.winnerName,
            isPlayer: award.playerWon,
            total: 0,
            byCategory: new Map<string, number>(),
          };
        row.total += 1;
        row.byCategory.set(award.category, (row.byCategory.get(award.category) ?? 0) + 1);
        spaces.set(award.winnerId, row);
      }
    }
    // You belong on the table even with nothing on it — "not on the board yet" is the single
    // most useful thing this screen can tell a player who has never won anything.
    if (!spaces.has('player')) {
      spaces.set('player', {
        name: this.lastState?.identity?.name ?? t('ui.top.yourSpace'),
        isPlayer: true,
        total: 0,
        byCategory: new Map(),
      });
    }
    const rows = [...spaces.entries()].sort((a, b) => b[1].total - a[1].total);

    const head = categories
      .map((category) => {
        const def = AWARDS.find((award) => award.label === category);
        return `<th class="league-col">
          <button data-action="trophy-cat" data-value="${esc(category)}"
            title="${esc(category)} — ${esc(def?.blurb ?? '')}">${esc(def?.short ?? category)}</button>
        </th>`;
      })
      .join('');

    const body = rows
      .map(([id, row], index) => {
        const badge = row.isPlayer ? null : RIVAL_MAP[id];
        return `<tr class="${row.isPlayer ? 'me' : ''} clickable"
          data-action="rank-space" data-value="${esc(id)}" title="${esc(t('ui.rank.openRecord'))}">
          <td class="rank-cell">${index + 1}</td>
          <td class="space-cell">
            <span class="space-dot" style="--tone:${
              row.isPlayer ? 'var(--gold)' : badge?.colour ?? 'var(--muted-foreground)'
            }">${icon(row.isPlayer ? 'trophy' : ((badge?.icon ?? 'flame') as IconName))}</span>
            <span class="space-name">${esc(row.name)}</span>
          </td>
          <td class="num trophy-total">${row.total}</td>
          ${categories
            .map((category) => {
              const n = row.byCategory.get(category) ?? 0;
              return `<td class="num league-cell${n ? ' has' : ''}">${n || '·'}</td>`;
            })
            .join('')}
        </tr>`;
      })
      .join('');

    return `<div class="trophy-record">
      <table class="rank-table trophy-league">
        <thead><tr>
          <th></th>
          <th class="space-head">${t('ui.trophy.hackerspace')}</th>
          <th class="league-col league-total">${t('ui.trophy.trophies')}</th>
          ${head}
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  }

  /** One category, year by year — seven rows that never scroll sideways. */
  private trophyCategoryYears(years: Ceremony[], category: string): string {
    const body = years
      .map((ceremony) => {
        const award = ceremony.awards.find((a) => a.category === category);
        if (!award) {
          return `<tr><th class="trophy-cat">${ceremony.year}</th>
            <td class="trophy-cell" colspan="2"><span class="trophy-none">${t('ui.trophy.notGiven')}</span></td>
          </tr>`;
        }
        return `<tr>
          <th class="trophy-cat">${ceremony.year}</th>
          <td class="trophy-cell${award.playerWon ? ' won' : ''}">
            ${this.trophyCell(award, this.lastState?.identity ?? null)}
          </td>
        </tr>`;
      })
      .join('');
    return `<div class="trophy-record">
      <table class="rank-table trophy-single">
        <thead><tr><th class="space-head trophy-cat">${t('ui.trophy.year')}</th><th class="space-head">${t('ui.trophy.winner')}</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  }

  /** One category, cumulative — who owns it, and which years they took. */
  private trophyCategorySpaces(years: Ceremony[], category: string): string {
    const spaces = new Map<string, { name: string; isPlayer: boolean; years: number[] }>();
    for (const ceremony of years) {
      const award = ceremony.awards.find((a) => a.category === category);
      if (!award) continue;
      const row =
        spaces.get(award.winnerId) ?? { name: award.winnerName, isPlayer: award.playerWon, years: [] };
      row.years.push(ceremony.year);
      spaces.set(award.winnerId, row);
    }
    const rows = [...spaces.entries()].sort((a, b) => b[1].years.length - a[1].years.length);
    const body = rows
      .map(([id, row], index) => {
        const badge = row.isPlayer ? null : RIVAL_MAP[id];
        return `<tr class="${row.isPlayer ? 'me' : ''} clickable"
          data-action="rank-space" data-value="${esc(id)}" title="${esc(t('ui.rank.openRecord'))}">
          <td class="rank-cell">${index + 1}</td>
          <td class="space-cell">
            <span class="space-dot" style="--tone:${
              row.isPlayer ? 'var(--gold)' : badge?.colour ?? 'var(--muted-foreground)'
            }">${icon(row.isPlayer ? 'trophy' : ((badge?.icon ?? 'flame') as IconName))}</span>
            <span class="space-name">${esc(row.name)}</span>
          </td>
          <td class="num trophy-total">${row.years.length}</td>
          <td class="num trophy-years">${row.years.join(', ')}</td>
        </tr>`;
      })
      .join('');
    return `<div class="trophy-record">
      <table class="rank-table trophy-single">
        <thead><tr>
          <th></th><th class="space-head">${t('ui.rank.space')}</th>
          <th class="league-col league-total">${t('ui.trophy.won')}</th>
          <th class="league-col">${t('ui.trophy.years')}</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
  }

  /**
   * One space, in full. The tables answer "who is ahead"; this answers "who *are* they" —
   * everything the run knows about a space in one place, including the things no column in
   * the standings has room for: what they are known for, the build that made their year, and
   * every trophy they have ever taken off you.
   *
   * It is a drill-in rather than a fifth tab: you arrive from a row, and the crumb goes back
   * to the table you arrived from. Escape pops it before it closes the panel, per §11.
   */
  private spaceDetail(state: GameState, id: string): string {
    const row = this.handlers.scoreboard().find((r) => r.id === id);
    if (!row) {
      return `<p class="ui-desc">${t('ui.space.missing')}</p>`;
    }
    const ranked = [...this.handlers.scoreboard()].sort((a, b) => b.reputation - a.reputation);
    const rank = ranked.findIndex((r) => r.id === id) + 1;
    const def = RIVAL_MAP[id];
    const blurb = row.isPlayer ? t('ui.space.yours') : def?.blurb ?? '';

    const trophies = state.ceremonies
      .flatMap((ceremony) =>
        ceremony.awards
          .filter((award) => award.winnerId === id)
          .map((award) => ({ year: ceremony.year, award })),
      )
      .reverse();

    const stat = (label: string, value: string, note = '') => `<div class="stat">
        <span class="stat-label">${label}</span>
        <b class="stat-value">${value}</b>
        ${note ? `<span class="stat-note">${note}</span>` : ''}
      </div>`;

    return `<div class="space-detail">
      <div class="space-head-card">
        <span class="space-dot space-dot--lg" style="--tone:${row.colour}">${icon(
          row.icon as IconName,
        )}</span>
        <div class="space-head-text">
          <b>${esc(row.name)}${row.isPlayer ? ` <span class="ui-badge ui-badge--accent">${t('ui.space.you')}</span>` : ''}</b>
          <span class="ui-desc">${esc(blurb)}</span>
        </div>
        <div class="space-rank">
          <b>#${rank}</b>
          <span>${t('ui.space.ofField', { field: ranked.length })}</span>
        </div>
      </div>

      <div class="stat-grid">
        ${stat(t('ui.space.reputation'), num(row.reputation), t('ui.space.thisYear', { value: num(row.reputationThisYear) }))}
        ${stat(t('ui.space.shipped'), String(row.projects), t('ui.space.thisYear', { value: row.projectsThisYear }))}
        ${stat(t('ui.space.crew'), String(row.members), t('ui.stat.onTheBooks'))}
        ${stat(t('ui.space.cash'), money(row.cash), t('ui.space.inHand'))}
        ${stat(t('ui.space.upvotes'), num(row.upvotesThisYear), t('ui.space.thisYearPlain'))}
        ${stat(t('ui.space.growth'), `+${row.growthThisYear}%`, t('ui.space.growthNote'))}
        ${stat(t('ui.trophy.trophies'), String(trophies.length), trophies.length ? t('ui.space.allTime') : t('ui.space.noneYet'))}
        ${stat(
          t('ui.space.bestBuild'),
          row.bestBuild ? esc(row.bestBuild.name) : '—',
          row.bestBuild ? t('ui.space.bestBuildNote', { hype: row.bestBuild.score }) : t('ui.space.nothingShipped'),
        )}
      </div>

      <div class="ui-label" style="margin:14px 0 7px">${t('ui.space.finished')}</div>
      ${this.rankChart(state, id, row.colour)}

      <div class="ui-label" style="margin:14px 0 7px">${t('ui.space.cabinet')}</div>
      ${
        trophies.length
          ? // One line each: a cabinet is a list, and nine two-line rows scrolled the panel.
            `<table class="rank-table cabinet">
              <tbody>${trophies
                .map(
                  ({ year, award }) => `<tr class="${award.playerWon ? 'won' : ''}">
                    <th class="cabinet-year">${year}</th>
                    <td class="cabinet-award">
                      <span class="space-dot" style="--tone:${
                        award.playerWon ? 'var(--gold)' : 'var(--muted-foreground)'
                      }">${icon('trophy')}</span>${esc(award.category)}
                    </td>
                    <td class="num">${esc(award.value)}</td>
                  </tr>`,
                )
                .join('')}</tbody>
            </table>`
          : `<p class="ui-desc">${t('ui.space.shelfEmpty')}</p>`
      }
    </div>`;
  }

  /**
   * Where a space has finished, year by year. One line, so there is no legend — the heading
   * above it names the space and nothing else is plotted.
   *
   * **First place is at the top and the axis runs the whole field**, not just the range this
   * space happens to occupy: a zoomed axis turns a wobble between 11th and 12th into a cliff,
   * and the question the chart answers is "are they pulling away from me", which is only
   * honest against the size of the table. The line wears the space's own colour, every point
   * carries its year and reputation on hover, and only the ends are labelled — a number on
   * every point is noise once a run is five years long.
   */
  private rankChart(state: GameState, id: string, colour: string): string {
    const points = state.ceremonies
      .map((ceremony) => ({
        year: ceremony.year,
        stand: (ceremony.standings ?? []).find((row) => row.id === id),
        field: (ceremony.standings ?? []).length,
      }))
      .filter((p): p is { year: number; stand: YearStanding; field: number } => !!p.stand);

    if (!points.length) {
      // Say when the line starts rather than only that it is empty: a run that predates the
      // record reads "no table was recorded" as a fault, when it is simply not October yet.
      const season = state.runtime.season;
      const days = Math.max(0, season.length - season.dayOfYear);
      const when = days === 0 ? t('ui.chart.today') : t('ui.chart.inDays', { days });
      return `<p class="ui-desc">${
        state.ceremonies.length ? t('ui.chart.noTable', { when }) : t('ui.chart.empty', { when })
      }</p>`;
    }

    const W = 624;
    const H = 132;
    const padL = 30;
    const padR = 14;
    const padT = 14;
    const padB = 20;
    const field = Math.max(...points.map((p) => p.field));
    const x = (i: number) =>
      points.length === 1 ? W / 2 : padL + (i * (W - padL - padR)) / (points.length - 1);
    const y = (rank: number) =>
      padT + ((rank - 1) / Math.max(1, field - 1)) * (H - padT - padB);

    const line =
      points.length > 1
        ? `<polyline fill="none" stroke="${colour}" stroke-width="2" stroke-linejoin="round"
             stroke-linecap="round"
             points="${points.map((p, i) => `${x(i).toFixed(1)},${y(p.stand.rank).toFixed(1)}`).join(' ')}" />`
        : '';

    // Years thin out once there are more of them than there is room for labels.
    const every = points.length > 8 ? 2 : 1;

    const dots = points
      .map((p, i) => {
        const end = i === 0 || i === points.length - 1;
        const cx = x(i);
        const cy = y(p.stand.rank);
        return `<g>
          <title>${esc(t('ui.chart.point', { year: p.year, place: ordinal(p.stand.rank), field: p.field, reputation: num(p.stand.reputation) }))}</title>
          <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="${colour}"
            stroke="var(--popover)" stroke-width="2" />
          ${
            end
              ? `<text class="chart-mark" x="${cx.toFixed(1)}" y="${(cy - 9).toFixed(1)}"
                   text-anchor="${i === 0 && points.length > 1 ? 'start' : points.length === 1 ? 'middle' : 'end'}"
                   >${ordinal(p.stand.rank)}</text>`
              : ''
          }
          ${
            i % every === 0 || i === points.length - 1
              ? `<text class="chart-tick" x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${p.year}</text>`
              : ''
          }
          <rect x="${(cx - 16).toFixed(1)}" y="${padT - 8}" width="32" height="${H - padT - padB + 16}"
            fill="transparent" />
        </g>`;
      })
      .join('');

    const best = points.reduce((a, b) => (b.stand.rank < a.stand.rank ? b : a));
    return `<svg class="rank-chart" viewBox="0 0 ${W} ${H}" width="100%" height="${H}"
      preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="${esc(t('ui.chart.aria', { place: ordinal(best.stand.rank), year: best.year }))}">
      <line class="chart-grid" x1="${padL}" y1="${y(1)}" x2="${W - padR}" y2="${y(1)}" />
      <line class="chart-grid" x1="${padL}" y1="${y(field)}" x2="${W - padR}" y2="${y(field)}" />
      <text class="chart-tick" x="${padL - 7}" y="${y(1) + 3}" text-anchor="end">${ordinal(1)}</text>
      <text class="chart-tick" x="${padL - 7}" y="${y(field) + 3}" text-anchor="end">${ordinal(field)}</text>
      ${line}
      ${dots}
    </svg>`;
  }

  /** The monthly books, as an event you have to look at. */
  private renderBill(state: GameState): boolean {
    const bill = state.bill;
    if (!bill) return false;
    const line = (l: { label: Text; detail: Text; amount: number }) => `
      <div class="bill-line">
        <span class="bill-label">${esc(say(l.label))}<i>${esc(say(l.detail))}</i></span>
        <span class="mono bill-amount ${l.amount < 0 ? 'out' : 'in'}">
          ${l.amount < 0 ? '−' : '+'}${money(Math.abs(l.amount))}
        </span>
      </div>`;
    this.setHTML(
      this.modal,
      'modal',
      `<div class="modal-backdrop">
        <div class="modal bill" data-action="noop">
          <header>
            <div class="modal-head">${icon('coins', 'ui-icon ui-icon--lg')}
              <b>${t('ui.bill.title', { month: bill.month })}</b>
              ${
                bill.shortfall
                  ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--destructive)">${t('ui.bill.short', { amount: bill.shortfall })}</span>`
                  : `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)">${t('ui.bill.settled')}</span>`
              }
            </div>
          </header>
          <div class="modal-body">
            ${bill.income.map(line).join('')}
            ${bill.costs.map(line).join('')}
            <div class="bill-line bill-total">
              <span class="bill-label">${t('ui.bill.onTheMonth')}</span>
              <span class="mono bill-amount ${bill.total < 0 ? 'out' : 'in'}">
                ${bill.total < 0 ? '−' : '+'}${money(Math.abs(bill.total))}
              </span>
            </div>
            <div class="bill-line">
              <span class="bill-label">${t('ui.bill.balance')}</span>
              <span class="mono bill-amount">${money(bill.balanceBefore)} → ${money(bill.balanceAfter)}</span>
            </div>
            ${
              bill.shortfall
                ? `<p class="defect" style="margin-top:12px">
                     ${icon('clock')} ${t('ui.bill.warning')}
                   </p>`
                : ''
            }
          </div>
          <footer>
            <button class="ui-btn ui-btn--primary ui-btn--block" data-action="bill-close">
              ${bill.shortfall ? t('ui.bill.sortItOut') : t('ui.ceremony.backToWork')}
            </button>
          </footer>
        </div>
      </div>`,
    );
    return true;
  }

  private renderModal(state: GameState) {
    if (this.renderBill(state)) return;
    if (this.renderCeremony(state)) return;
    if (this.openModal === null) {
      this.setHTML(this.modal, 'modal', '');
      return;
    }
    const body =
      this.openModal === 'people'
        ? this.peopleBody(state)
        : this.openModal === 'ranking'
          ? this.rankingBody(state)
          : this.openModal === 'machines'
            ? this.machinesBody(state)
            : this.openModal === 'projects'
              ? this.projectsBody(state)
              : this.openModal === 'reddit'
                ? this.redditBody(state)
                : this.openModal === 'shop'
                  ? this.shopBody(state)
                  : this.jobsBody(state);
    this.setHTML(
      this.modal,
      'modal',
      `<div class="modal-backdrop" data-action="jobs-close">
        <div ${
          // Jobs and the Shop are still English (they are being replaced); see renderChrome.
          this.openModal === 'jobs' || this.openModal === 'shop' ? 'lang="en"' : ''
        } class="modal ${
          this.openModal === 'machines' ||
          this.openModal === 'projects' ||
          this.openModal === 'people' ||
          this.openModal === 'shop'
            ? 'modal--fit'
            : ''
        } ${
          this.openModal === 'projects' || this.openModal === 'people' || this.openModal === 'shop'
            ? 'modal--wide'
            : ''
        }"
          data-action="noop">
          <header>
            ${body.head}
            <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="jobs-close">
              ${icon('x')}${t('ui.close')}
            </button>
          </header>
          <div class="modal-body">${body.content}</div>
          <footer>${body.foot}</footer>
        </div>
      </div>`,
    );
  }

  // --- Reddit: attention, and what you claimed to get it -------------------

  /**
   * The composer and the feed (§6), and deliberately shallow: **the room is the button**.
   * It used to ask three questions down a long screen and then make you find a Post button
   * at the bottom, which is a lot of ceremony for a verb you use several times a day. Pick
   * what you are talking about, pick how loudly, then click a room — and each room card
   * shows the reaction it would actually give, so the choice between a big sceptical room
   * and a small warm one is made where it is made.
   */
  private redditBody(state: GameState): { head: string; content: string; foot: string } {
    const open = state.runtime.projects.filter((p) => !p.shipped);
    const hoursLeft = state.runtime.player?.hoursLeft ?? 0;
    const postedToday = (id: string) => state.posts.some((p) => p.projectId === id && p.day === state.day);

    const subjects: { id: string; label: string; sub: ReturnType<typeof projectSubject> }[] = [
      {
        id: SPACE_SUBJECT,
        label: t('ui.social.theSpace'),
        // Straight from the sim: a preview built from different tags is a preview that lies.
        sub: this.handlers.spaceSubject(),
      },
      ...open.map((p) => ({ id: p.id, label: p.name, sub: projectSubject(p) })),
    ];
    const chosen = subjects.find((x) => x.id === this.reddit.projectId) ?? subjects[0];

    const subjectChips = `<div class="ui-segmented" style="margin-bottom:11px;flex-wrap:wrap">
      ${subjects
        .map(
          (x) => `<button data-action="reddit-project" data-id="${x.id}"
            aria-pressed="${x.id === chosen.id}" ${postedToday(x.id) ? 'disabled' : ''}
            title="${esc(postedToday(x.id) ? t('ui.social.postedToday') : t('ui.social.meritHint', { merit: pct(x.sub.merit) }))}">
            ${esc(x.label)}<span class="seg-count">${pct(x.sub.merit)}</span>
          </button>`,
        )
        .join('')}
    </div>`;

    const claimChips = `<div class="ui-segmented" style="margin-bottom:11px">
      ${CLAIMS.map(
        (claim) => `<button data-action="reddit-claim" data-value="${claim.key}"
          aria-pressed="${claim.key === this.reddit.claim}" title="${esc(claim.blurb)}">
          ${esc(claim.label)}
        </button>`,
      ).join('')}
    </div>`;

    const blocked = postedToday(chosen.id);
    const rooms = `<div class="ui-grid ui-grid--3">
      ${SUBREDDITS.map((room) => {
        const already = state.posts.filter(
          (p) => p.projectId === chosen.id && p.subreddit === room.id,
        ).length;
        const preview = react(chosen.sub, room, this.reddit.claim, already);
        const bad = preview.burned;
        const can = !blocked && hoursLeft >= VERB_HOURS.post;
        return `<button class="ui-option" data-action="reddit-post" data-value="${room.id}"
          ${can ? '' : 'disabled'} style="--tone:${bad ? 'var(--destructive)' : 'var(--primary)'}"
          title="${esc(room.blurb)}">
          <div class="ui-option__head">
            <span class="icon-chip">${icon(room.icon, 'ui-icon ui-icon--lg')}</span>
            <span class="ui-title">${esc(room.name)}</span>
          </div>
          <span class="ui-row__meta" style="margin:0">
            <span class="ui-badge ui-badge--tone"
              style="--tone:var(--${bad ? 'destructive' : 'success'})">
              ${icon('arrowUp')}${preview.upvotes}
            </span>
            <span class="ui-badge" title="${esc(t('ui.social.tasteHint'))}">
              ${icon('flame')}${pct(tasteMatch(chosen.sub.tags, room))}
            </span>
            ${bad ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--destructive)">${t('ui.social.theyTurn')}</span>` : ''}
          </span>
        </button>`;
      }).join('')}
    </div>`;

    const feed = state.posts.length
      ? [...state.posts]
          .reverse()
          .slice(0, 6)
          .map(
            (post) => `<div class="ui-row" style="cursor:default">
              <span class="icon-chip" style="--tone:${post.burned ? 'var(--destructive)' : 'var(--success)'}">
                ${icon('arrowUp', 'ui-icon ui-icon--lg')}
              </span>
              <span class="ui-row__main">
                <span class="row between" style="gap:8px">
                  <b>${esc(post.projectName)}</b>
                  <span class="mono">${post.upvotes}</span>
                </span>
                <span class="ui-desc">${esc(SUBREDDIT_MAP[post.subreddit]?.name ?? post.subreddit)} ·
                  ${t('ui.top.day', { day: post.day })} · ${esc(post.comment)}</span>
              </span>
            </div>`,
          )
          .join('')
      : `<p class="ui-desc">${t('ui.social.nothingYet')}</p>`;

    return {
      head: `<div class="modal-head">${icon('flame', 'ui-icon ui-icon--lg')}<b>${t('ui.social.title')}</b>
        <span class="ui-badge ui-badge--tone" style="--tone:var(--primary)"
          title="${esc(t('ui.social.hypeHint'))}">
          ${t('ui.social.hype', { hype: Math.round(state.hype) })}
        </span></div>`,
      content: `
        <div class="ui-label" style="margin-bottom:9px">${t('ui.social.about')}</div>
        ${subjectChips}
        <div class="ui-label" style="margin-bottom:9px">${t('ui.social.howLoud')}</div>
        ${claimChips}
        <div class="ui-label" style="margin-bottom:9px">
          ${blocked ? t('ui.social.blocked') : t('ui.social.pickRoom')}
        </div>
        ${rooms}
        <hr class="ui-sep" />
        <div class="ui-label" style="margin-bottom:9px">${t('ui.social.cameBack')}</div>
        ${feed}
      `,
      foot: `<span class="ui-desc" style="font-size:10.5px">${t('ui.social.foot', { hours: hours(VERB_HOURS.post) })}</span>`,
    };
  }

  // --- People: who is here, and who could be ------------------------------

  /**
   * The roster as a table, for the same reason as the projects one: you read down the Doing
   * column to find the hours going nowhere. Somebody unallocated still pays dues and still
   * turns up, so a free member is the row you came here to act on — called out in warning
   * tone and sorted to the top.
   *
   * Candidates are **not** rows. Mixed into the roster they read as people you already have,
   * and a hire squeezed into the last cell of a wide row was easy to miss. They get their own
   * tab of cards, and a banner above the tabs whenever anybody is waiting on an answer.
   */
  private peopleBody(state: GameState): { head: string; content: string; foot: string } {
    const members = state.runtime.members;
    const hoursLeft = state.runtime.player?.hoursLeft ?? 0;

    const nameCell = (id: string, name: string) => {
      const data = MEMBER_DATA[id];
      const top = topCategories(data?.passions ?? {}, 1)[0];
      const profile = top ? profileOf(top.category) : null;
      return `<td class="space-cell">
        <span class="space-dot" style="--tone:${profile?.accent ?? 'var(--muted-foreground)'}">
          ${profile ? icon(CATEGORY_ICON[top!.category]) : icon('users')}
        </span>
        <span class="space-name">${esc(name)}</span>
      </td>`;
    };
    const skillCell = (id: string) => {
      const data = MEMBER_DATA[id];
      return `<td class="num wide">
        ${topCategories(data?.passions ?? {}, 2)
          .map(({ category, score }) => `${profileOf(category).label} ${pct(score)}`)
          .join(' · ')}
      </td>`;
    };
    const traitCell = (id: string) => {
      const traits = MEMBER_DATA[id]?.traits ?? [];
      return `<td class="num">${
        traits.length
          ? traits.map((trait) => `<span title="${TRAIT_BLURB[trait]}">${TRAIT_LABEL[trait]}</span>`).join(', ')
          : '—'
      }</td>`;
    };

    const memberRow = (m: MemberSnapshot) => {
      const project = m.team ? state.runtime.projects.find((x) => x.id === m.team) : null;
      return `<tr>
        ${nameCell(m.id, m.name)}
        <td class="note ${project ? '' : 'warn'}">
          ${project ? esc(project.name) : t('ui.people.nothingAllocated')}
        </td>
        <td class="num" title="${esc(
          m.employment === 'full-time'
            ? t('ui.people.perWeek', { hours: weeklyHoursFor('full-time') })
            : m.shift === 'afternoon' ? t('ui.people.afternoons') : t('ui.people.mornings'),
        )}">
          ${m.employment === 'full-time' ? t('ui.people.fullTime') : t('ui.people.partTime')}
        </td>
        ${skillCell(m.id)}
        ${traitCell(m.id)}
        <td class="num">
          <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="let-go" data-id="${m.id}"
            title="${esc(t('ui.people.letGoHint', { name: m.name, dues: ECONOMY.crewDues }))}">
            ${icon('x')}
          </button>
        </td>
      </tr>`;
    };

    const candidateCard = (id: string) => {
      const data = MEMBER_DATA[id];
      if (!data) return '';
      const canFull = this.handlers.canHireFullTime(id);
      const top = topCategories(data.passions ?? {}, 1)[0];
      const profile = top ? profileOf(top.category) : null;
      const offer = (employment: Employment) => {
        const cost = this.handlers.hireCost(id, employment);
        const ok = this.affordable(state, cost) && hoursLeft >= VERB_HOURS.hire;
        const label = employment === 'full-time' ? t('ui.people.fullTime') : t('ui.people.partTime');
        return `<button class="ui-btn ${employment === 'full-time' || !canFull ? 'ui-btn--primary' : 'ui-btn--outline'} ui-btn--sm"
          data-action="hire" data-id="${id}" data-value="${employment}" ${ok ? '' : 'disabled'}
          title="${esc(t('ui.people.hireHint', { hours: weeklyHoursFor(employment), dues: ECONOMY.crewDues }))}">
          ${icon('plus')}${label} · ${money(cost)}</button>`;
      };
      const traits = (data.traits ?? [])
        .map((trait) => `<span class="ui-badge" title="${TRAIT_BLURB[trait]}">${TRAIT_LABEL[trait]}</span>`)
        .join('');
      // A greyed-out hire with no reason reads as a broken button. Say which gate is shut.
      const cheapest = this.handlers.hireCost(id, 'part-time');
      const blocked =
        hoursLeft < VERB_HOURS.hire
          ? esc(t('ui.people.noHours', { name: data.name, hours: hours(VERB_HOURS.hire) }))
          : !this.affordable(state, cheapest)
            ? esc(t('ui.people.pastLimit', { amount: cheapest - state.cash - ECONOMY.overdraftLimit }))
            : '';
      return `<div class="ui-card candidate">
        <div class="candidate__head">
          <span class="icon-chip" style="--tone:${profile?.accent ?? 'var(--muted-foreground)'}">
            ${profile ? icon(CATEGORY_ICON[top!.category]) : icon('users')}
          </span>
          <span class="candidate__name">${esc(data.name)}</span>
          ${traits}
        </div>
        <div class="candidate__meta">
          ${topCategories(data.passions ?? {}, 2)
            .map(({ category, score }) => `${profileOf(category).label} ${pct(score)}`)
            .join(' · ')}
        </div>
        <div class="candidate__meta">
          ${t('ui.people.aboutPerWeek', { hours: data.commitment })}${canFull ? '' : ` · ${t('ui.people.dayJob')}`}
        </div>
        <div class="candidate__actions">
          ${canFull ? offer('full-time') : ''}
          ${offer('part-time')}
          <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="pass-applicant" data-id="${id}"
            title="${esc(t('ui.people.passHint', { name: data.name }))}">${t('ui.people.pass')}</button>
        </div>
        ${blocked ? `<div class="candidate__why">${blocked}</div>` : ''}
      </div>`;
    };

    const free = members.filter((m) => !m.team);
    const busy = members.filter((m) => m.team);
    const open = state.applicants;
    // Hiring or passing on the last candidate empties that tab; an empty tab is a dead end.
    if (this.peopleTab === 'open' && !open.length) this.peopleTab = 'all';
    const tab = this.peopleTab;

    const filters = [
      { key: 'all' as const, label: t('ui.people.tab.all'), count: members.length },
      { key: 'free' as const, label: t('ui.people.tab.free'), count: free.length },
      { key: 'on' as const, label: t('ui.people.tab.on'), count: busy.length },
      { key: 'open' as const, label: t('ui.people.tab.open'), count: open.length },
    ];
    const chips = `<div class="ui-segmented" style="margin-bottom:11px">
      ${filters
        .map(
          (f) => `<button data-action="people-tab" data-value="${f.key}"
            aria-pressed="${f.key === tab}" ${f.count ? '' : 'disabled'}>
            ${f.label}<span class="seg-count">${f.count}</span>
          </button>`,
        )
        .join('')}
    </div>`;

    /**
     * Who is actually suited to a standing job. Each one leans on a different skill and a
     * different trait, so the picker can lead with the person who ought to have it rather
     * than making you cross-reference the table underneath — which is what you were doing.
     */
    const roleFit = (id: string, role: Role): { score: number; why: string } => {
      const data = MEMBER_DATA[id];
      if (!data) return { score: 0, why: '' };
      const skill = (key: SkillKey) => (data.skills[key] ?? 0) / 5;
      const has = (trait: string) => (data.traits ?? []).includes(trait as never);
      let score = 0;
      let why = '';
      if (role === 'manager') {
        // Starting the right thing is judgement plus a broad enough taste to judge with.
        const breadth = Math.min(1, Object.keys(data.passions ?? {}).length / 4);
        score = skill('docs') * 0.55 + breadth * 0.45;
        why = has('mentor') ? t('ui.fit.mentor') : breadth > 0.7 ? t('ui.fit.broad') : t('ui.fit.notes');
      } else if (role === 'printer') {
        score = skill('machining') * 0.8 + 0.2;
        why = has('nightOwl') ? t('ui.fit.nightOwl') : t('ui.fit.machining', { level: data.skills.machining ?? 0 });
      } else if (role === 'quartermaster') {
        score = skill('docs') * 0.7 + skill('electronics') * 0.3;
        why = has('documenter') ? t('ui.fit.documenter') : t('ui.fit.docs', { level: data.skills.docs ?? 0 });
      } else {
        // Knowing what reads well is taste and writing, not a bench skill.
        const breadth = Math.min(1, Object.keys(data.passions ?? {}).length / 4);
        score = skill('docs') * 0.45 + skill('software') * 0.2 + breadth * 0.35;
        why = has('documenter') ? t('ui.fit.writesItDown') : breadth > 0.7 ? t('ui.fit.broad') : t('ui.fit.goodEye');
      }
      if (has('mentor') && role === 'manager') score *= 1.25;
      if (has('nightOwl') && role === 'printer') score *= 1.2;
      if (has('documenter') && role === 'quartermaster') score *= 1.3;
      if (has('documenter') && role === 'social') score *= 1.25;
      // Somebody who signs up and then stops turning up is nobody's keyholder.
      if (has('ghost')) score *= 0.4;
      return { score: Math.min(1, score), why };
    };

    const roleIcon: Record<Role, IconName> = {
      manager: 'clipboard',
      printer: 'printer',
      quartermaster: 'package',
      social: 'flame',
    };
    const roles = Object.keys(ROLE_LABEL) as Role[];
    const openRole = this.roleOpen;
    const jobs = `<div class="ui-label" style="margin-bottom:7px">
        ${t('ui.people.keyholders')} <span class="muted" style="text-transform:none;letter-spacing:0">
          · ${t('ui.people.keyholdersHint')}</span>
      </div>
      <div class="keyholders">
        ${roles
          .map((role) => {
            const holder = members.find((m) => m.role === role);
            return `<button class="keyslot ${holder ? 'keyslot--held' : ''} ${openRole === role ? 'keyslot--open' : ''}"
              data-action="role-open" data-value="${openRole === role ? '' : role}"
              title="${ROLE_BLURB[role]}">
              <span class="icon-chip" style="--tone:${holder ? 'var(--primary)' : 'var(--muted-foreground)'}">
                ${icon(roleIcon[role], 'ui-icon')}
              </span>
              <span class="keyslot__text">
                <span class="keyslot__role">${ROLE_LABEL[role]}</span>
                <span class="keyslot__who">${holder ? esc(holder.name) : t('ui.people.nobodyYet')}</span>
              </span>
            </button>`;
          })
          .join('')}
      </div>
      ${
        openRole
          ? `<div class="job-pick">
              <p class="ui-desc" style="width:100%;margin:0 0 3px">${ROLE_BLURB[openRole]}</p>
              ${[...members]
                .map((m) => ({ m, fit: roleFit(m.id, openRole) }))
                .sort((a, b) => b.fit.score - a.fit.score)
                .map(
                  ({ m, fit }, index) => `<button class="ui-toggle ${index === 0 && m.role !== openRole ? 'suggested' : ''}"
                    aria-pressed="${m.role === openRole}"
                    data-action="set-role" data-id="${m.id}" data-value="${openRole}"
                    title="${esc(fit.why)}${m.role && m.role !== openRole ? ` · ${esc(t('ui.people.currently', { role: ROLE_LABEL[m.role] }))}` : ''}">
                    ${icon(m.role === openRole ? 'check' : 'plus')}${esc(m.name)}
                    <span class="ui-toggle__pct">${pct(fit.score)}</span>
                  </button>`,
                )
                .join('')}
              ${
                members.some((m) => m.role === openRole)
                  ? `<button class="ui-toggle" data-action="set-role"
                      data-id="${members.find((m) => m.role === openRole)!.id}" data-value="">
                      ${icon('x')}${t('ui.people.takeBack')}
                    </button>`
                  : ''
              }
            </div>`
          : ''
      }`;

    const rows =
      tab === 'free' ? free.map(memberRow) : tab === 'on' ? busy.map(memberRow) : [...free, ...busy].map(memberRow);

    const waiting =
      open.length && tab !== 'open'
        ? `<div class="candidate-banner">
            ${icon('users', 'ui-icon')}
            <span>${t('ui.people.wantToJoin', { count: open.length, n: `<b>${open.length}</b>` })}
              <span class="muted">· ${open.map((a) => esc(MEMBER_DATA[a]?.name ?? a)).join(', ')}</span></span>
            <button class="ui-btn ui-btn--primary ui-btn--sm" data-action="people-tab" data-value="open">
              ${t('ui.people.review')}
            </button>
          </div>`
        : '';

    const body =
      tab === 'open'
        ? `<div class="candidates">${open.map(candidateCard).join('')}</div>`
        : rows.length
          ? `<table class="rank-table people-table">
              <thead><tr>
                <th class="space-head">${t('ui.people.col.person')}</th><th>${t('ui.people.col.doing')}</th>
                <th>${t('ui.people.col.contract')}</th><th>${t('ui.people.col.goodAt')}</th>
                <th>${t('ui.people.col.trait')}</th><th></th>
              </tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table>`
          : `<p class="ui-desc">${t('ui.people.empty')}</p>`;

    const next = APPLICANTS.filter(
      (a) => !members.some((m) => m.id === a.id) && !open.includes(a.id),
    ).sort((a, b) => (a.repRequired ?? 0) - (b.repRequired ?? 0))[0];

    return {
      head: `<div class="modal-head">${icon('users', 'ui-icon ui-icon--lg')}<b>${t('ui.people.title')}</b></div>`,
      content:
        (members.length ? jobs + `<hr class="ui-sep" />` : '') + waiting + chips + body,
      foot: `<span class="ui-desc" style="font-size:10.5px">
          ${
            free.length
              ? `${t('ui.people.foot.idle', { n: `<b>${free.length}</b>` })} · `
              : members.length
                ? `${t('ui.people.foot.allBusy')} · `
                : ''
          }${t('ui.people.foot.fees', { dues: ECONOMY.crewDues, total: members.length * ECONOMY.crewDues })} ·
          ${
            next
              ? `${
                  state.runtime.recruitIn > 0
                    ? t('ui.people.foot.recruitIn', { days: `<b>${state.runtime.recruitIn}</b>` })
                    : t('ui.people.foot.waitingOnRep')
                }, ${t('ui.people.foot.next', { name: `<b>${esc(next.name)}</b>`, reputation: next.repRequired ?? 0 })}`
              : t('ui.people.foot.everybody')
          }
        </span>`,
    };
  }

  private jobsBody(state: GameState): { head: string; content: string; foot: string } {
    const steps: { key: JobStep; label: string }[] = [
      { key: 'category', label: 'Kind of work' },
      { key: 'project', label: 'Project' },
      { key: 'crew', label: 'Crew' },
    ];
    const current = steps.findIndex((x) => x.key === this.jobs.step);
    const trail = steps
      .map((x, index) => {
        const state = index === current ? 'now' : index < current ? 'done' : '';
        const inner = `<i>${state === 'done' ? icon('check', 'ui-icon step-check') : index + 1}</i>${x.label}`;
        // Only a completed step is a destination; the current one is where you are and the
        // ones ahead do not exist yet.
        return state === 'done'
          ? `<button class="step done" data-action="jobs-step" data-value="${x.key}"
               title="Back to ${x.label.toLowerCase()}">${inner}</button>`
          : `<span class="step ${state}">${inner}</span>`;
      })
      .join(`<span class="step-sep">${icon('chevronRight', 'ui-icon')}</span>`);

    return {
      head: `<div class="steps">${trail}</div>`,
      content:
        this.jobs.step === 'category'
          ? this.jobsCategoryStep(state)
          : this.jobs.step === 'project'
            ? this.jobsProjectStep(state)
            : this.jobsCrewStep(state),
      foot: `
        ${
          this.jobs.step === 'category'
            ? ''
            : `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="jobs-back">
                 ${icon('arrowLeft')}Back
               </button>`
        }
        <span class="ui-desc" style="font-size:10.5px">
          Pitching is free and orders the parts there and then. No limit on how many run at
          once — people are.
        </span>`,
    };
  }

  /**
   * What the people standing around are actually good for. Genre tiles ask you to know which
   * genre your idle members suit; this asks the list instead, across every genre at once, and
   * ranks by how well the free crew matches — weighted down when there are not enough of them
   * to fill the team, because a job you cannot crew is not a good fit however well it reads.
   */
  private bestFitDefs(state: GameState): { def: ProjectDef; fit: number; names: string[] }[] {
    const free = state.runtime.members.filter((m) => !m.team);
    if (!free.length) return [];
    return this.availableDefs(state)
      .map((def) => {
        const ranked = free
          .map((m) => ({
            name: m.name,
            match: categoryAffinity(MEMBER_DATA[m.id]?.passions ?? {}, def.category),
          }))
          .sort((a, b) => b.match - a.match)
          .slice(0, def.teamSize);
        const coverage = ranked.length / def.teamSize;
        const average = ranked.reduce((sum, r) => sum + r.match, 0) / Math.max(1, ranked.length);
        return { def, fit: average * coverage, names: ranked.map((r) => r.name) };
      })
      .filter((entry) => entry.fit > 0)
      .sort((a, b) => b.fit - a.fit);
  }

  /** Step 1: what kind of work, or one of the offers that came to you. */
  private jobsCategoryStep(state: GameState): string {
    const available = this.availableDefs(state);
    const offers = state.backlog.length;
    const tiles = CATEGORY_ORDER.map((category) => {
      const count = available.filter((def) => def.category === category).length;
      const profile = profileOf(category);
      return `<button class="ui-option" data-action="jobs-category" data-value="${category}"
        ${count ? '' : 'disabled'}>
        <div class="ui-option__head">
          <span class="icon-chip" style="--tone:${profile.accent}">${icon(CATEGORY_ICON[category], 'ui-icon ui-icon--lg')}</span>
          <span class="ui-title">${profile.label}</span>
          <span class="ui-badge">${count || '—'}</span>
        </div>
        <span class="ui-option__desc ui-clamp-2">${esc(profile.blurb)}</span>
      </button>`;
    }).join('');

    const bestFit = this.bestFitDefs(state);
    const idle = state.runtime.members.filter((m) => !m.team).length;
    return `
      ${
        bestFit.length
          ? `<button class="ui-row offers-row" data-action="jobs-category" data-value="bestfit">
              <span class="icon-chip" style="--tone:var(--warning)">${icon('users', 'ui-icon ui-icon--lg')}</span>
              <span class="ui-row__main">
                <span class="ui-title">Best for your idle hands</span>
                <p class="ui-desc" style="margin:3px 0 0">
                  What the ${idle === 1 ? 'one person' : `${idle} people`} with nothing to do
                  would actually be good at
                </p>
              </span>
              <span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">
                top ${pct(bestFit[0].fit)}
              </span>
              <span class="ui-row__chevron">${icon('chevronRight')}</span>
            </button>
            <hr class="ui-sep" />`
          : ''
      }
      ${
        offers
          ? `<button class="ui-row offers-row" data-action="jobs-category" data-value="offers">
              <span class="icon-chip" style="--tone:var(--primary)">${icon('mail', 'ui-icon ui-icon--lg')}</span>
              <span class="ui-row__main">
                <span class="ui-title">Offers</span>
                <p class="ui-desc" style="margin:3px 0 0">Proposals, sponsors, and whatever Reddit is excited about</p>
              </span>
              <span class="ui-badge ui-badge--accent">${offers} waiting</span>
              <span class="ui-row__chevron">${icon('chevronRight')}</span>
            </button>
            <hr class="ui-sep" />`
          : ''
      }
      <div class="ui-grid ui-grid--3">${tiles}</div>
    `;
  }

  /** Step 2: the shortlist, with size filtered and grouped in place. */
  private jobsProjectStep(state: GameState): string {
    if (this.jobs.source === 'offers') {
      return `<div class="ui-label" style="margin-bottom:9px">Offers</div>
        ${state.backlog.map((entry) => this.jobCard(CATALOG_MAP[entry.defId], state, entry)).join('')}`;
    }
    if (this.jobs.source === 'bestfit') {
      const ranked = this.bestFitDefs(state);
      if (!ranked.length) return `<p class="ui-desc">Everybody is already on something.</p>`;
      return `<div class="ui-label" style="margin-bottom:9px">
          Best for your idle hands · ${esc(ranked[0].names.join(', '))} and co.
        </div>
        ${ranked
          .slice(0, 8)
          .map((entry) => this.jobCard(entry.def, state, undefined, entry))
          .join('')}`;
    }

    const all = this.availableDefs(state).filter((def) => def.category === this.jobs.source);
    const active = SIZE_FILTERS.find((f) => f.key === this.jobs.size)!;
    const free = state.runtime.members.filter((m) => !m.team).length;

    const segmented = `<div class="ui-segmented">
      ${SIZE_FILTERS.map((filter) => {
        const count = all.filter((def) => filter.test(def.teamSize)).length;
        return `<button data-action="jobs-size" data-value="${filter.key}"
          aria-pressed="${filter.key === this.jobs.size}" ${count ? '' : 'disabled'}>
          ${t(filter.short)}<span class="seg-count">${count}</span>
        </button>`;
      }).join('')}
    </div>`;

    const shown = all.filter((def) => active.test(def.teamSize));
    if (!shown.length) {
      return `
        <div class="row between" style="margin-bottom:10px">${segmented}${categoryChip(this.jobs.source as ProjectCategory)}</div>
        <p class="ui-desc">Nothing this size. Try another.</p>`;
    }

    // Grouped by size when nothing is filtered, so the whole range is visible at once.
    const groups =
      this.jobs.size === 'any'
        ? SIZE_GROUPS.map((group) => {
            const defs = shown.filter((def) => group.test(def.teamSize)).sort((a, b) => a.teamSize - b.teamSize);
            if (!defs.length) return '';
            const short = free < Math.min(...defs.map((d) => d.teamSize));
            return `<div class="job-group">
              <div class="job-group__head">
                <span class="ui-label">${t(group.label)}</span>
                <span class="ui-desc" style="font-size:10.5px">${t(group.hint)}</span>
                ${short ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">short-handed</span>` : ''}
              </div>
              ${defs.map((def) => this.jobCard(def, state)).join('')}
            </div>`;
          }).join('')
        : shown
            .sort((a, b) => a.teamSize - b.teamSize)
            .map((def) => this.jobCard(def, state))
            .join('');

    return `
      <div class="row between" style="gap:10px;margin-bottom:11px">
        ${segmented}
        ${categoryChip(this.jobs.source as ProjectCategory)}
      </div>
      ${groups}`;
  }

  /** Step 3: who is going to do it. */
  private jobsCrewStep(state: GameState): string {
    const def = this.jobs.defId ? CATALOG_MAP[this.jobs.defId] : null;
    if (!def) return `<p class="empty">Pick a project first.</p>`;
    const entry = this.jobs.offerId
      ? state.backlog.find((candidate) => candidate.id === this.jobs.offerId)
      : undefined;
    // The commit step has room to spare, so show what is actually being committed to.
    // It doubles as the place the genre's stage names are introduced.
    const stages = STAGE_ORDER.map((key) => {
      const need = def.work[key] ?? STAGE_MAP[key].work;
      const label = stageLabel(def.category, key);
      const machine = key === 'fabrication';
      const value = machine
        ? def.parts.length
          ? `${def.parts.reduce((sum, part) => sum + part.hours, 0)}h machine`
          : '—'
        : need > 0
          ? `${need}`
          : '—';
      return `<div class="breakdown-row ${need > 0 || machine ? '' : 'skip'}">
        <span>${label}</span><span class="mono">${value}</span>
      </div>`;
    }).join('');

    const parts = def.parts.length
      ? `<div class="ui-label" style="margin-bottom:6px">Parts to make</div>
         ${def.parts
           .map(
             (part) => `<div class="breakdown-row">
               <span>${esc(part.name)}</span>
               <span class="mono">${hours(part.hours)}${part.material ? ` · ${part.material}g` : ''}</span>
             </div>`,
           )
           .join('')}`
      : `<div class="ui-label" style="margin-bottom:6px">Parts to make</div>
         <p class="ui-desc">Nothing to print. It never touches the machine queue.</p>`;

    const profile = profileOf(def.category);
    return `
      <div class="row" style="gap:11px;margin-bottom:9px">
        <span class="icon-chip" style="--tone:${profile.accent};width:38px;height:38px">
          ${icon(CATEGORY_ICON[def.category], 'ui-icon ui-icon--lg')}
        </span>
        <div style="flex:1;min-width:0">
          <div class="row between" style="gap:8px">
            <span class="ui-title" style="font-size:15px">${esc(def.name)}</span>
            ${categoryChip(def.category)}
          </div>
          <p class="ui-desc" style="margin:3px 0 0">${esc(def.blurb)}</p>
        </div>
      </div>
      ${this.defStats(def)}
      ${entry ? this.offerMeta(entry, state) : ''}
      ${this.draftPicker(def, state)}
      <hr class="ui-sep" />
      <div class="breakdown">
        <div>
          <div class="ui-label" style="margin-bottom:6px">Stages</div>
          ${stages}
        </div>
        <div>${parts}</div>
      </div>
      ${
        def.bomCost > state.cash
          ? `<p class="defect" style="margin:0 0 8px">${icon('package')} You cannot cover the
             ${money(def.bomCost)} bill of materials. You can still pitch it, but nothing can be
             assembled until the parts are ordered.</p>`
          : ''
      }
      <button class="ui-btn ui-btn--primary ui-btn--lg pitch-cta" data-action="pitch"
        data-id="${def.id}" data-id2="${entry?.id ?? ''}">
        Pitch ${esc(def.name)}${def.bomCost ? ` · ${money(def.bomCost)}` : ''}
      </button>
      ${
        def.bomCost > 0 && def.bomCost <= state.cash
          ? `<p class="ui-desc" style="margin:7px 0 0;text-align:center;font-size:10.5px">
               Leaves you ${money(state.cash - def.bomCost)}
             </p>`
          : ''
      }
    `;
  }

  /** Projects the space could start right now: era-visible, buildable, not already running. */
  private availableDefs(state: GameState): ProjectDef[] {
    // Kit you do not own no longer hides a project — the card says what it needs instead.
    // A catalogue that silently shrinks when you sell a printer is a catalogue that looks
    // broken, and "go and buy one" is a perfectly good thing for a job board to tell you.
    const active = new Set(state.runtime.projects.map((p) => p.defId));
    return catalogForEra(state.era).filter((def) => !active.has(def.id));
  }

  private offerMeta(entry: BacklogEntry, state: GameState): string {
    const proposer = entry.proposerId ? MEMBER_DATA[entry.proposerId]?.name : null;
    const daysLeft = entry.expiresOnDay ? entry.expiresOnDay - state.day : null;
    const bits = [
      proposer ? `<span class="ui-badge">${icon('users')}${proposer} will take a stage</span>` : '',
      entry.sponsorCash
        ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)">${icon('coins')}${money(entry.sponsorCash)} up front</span>`
        : '',
      entry.hypeMultiplier
        ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${icon('flame')}×${entry.hypeMultiplier} hype</span>`
        : '',
      daysLeft !== null
        ? `<span class="ui-badge ${daysLeft <= 3 ? 'ui-badge--tone' : ''}" ${daysLeft <= 3 ? 'style="--tone:var(--destructive)"' : ''}>${icon('clock')}${daysLeft}d left</span>`
        : '',
    ].filter(Boolean);
    return bits.length ? `<span class="ui-row__meta">${bits.join('')}</span>` : '';
  }

  private jobCard(
    def: ProjectDef,
    state: GameState,
    entry?: BacklogEntry,
    /** Who among the idle would take it, when the list is ranked by fit. */
    fit?: { fit: number; names: string[] },
  ): string {
    const badge = entry ? SOURCE_BADGE[entry.source] : null;
    const missing = missingMachines(def, state.ownedMachines);
    const profile = profileOf(def.category);
    return `<button class="ui-row" data-action="jobs-project"
      data-id="${def.id}" data-id2="${entry?.id ?? ''}" ${missing.length ? 'disabled' : ''}>
      <span class="icon-chip" style="--tone:${profile.accent}">${icon(CATEGORY_ICON[def.category], 'ui-icon ui-icon--lg')}</span>
      <span class="ui-row__main">
        <span class="row between" style="gap:8px">
          <span class="ui-title">${esc(def.name)}</span>
          ${badge?.label ? `<span class="ui-badge ui-badge--accent">${t(badge.label)}</span>` : ''}
          ${
            fit
              ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)"
                   title="${esc(fit.names.join(', '))} would take it">
                   ${icon('users')}${pct(fit.fit)} fit
                 </span>`
              : ''
          }
        </span>
        <p class="ui-desc ui-clamp-2" style="margin:4px 0 0">${esc(def.blurb)}</p>
        <span class="ui-row__meta">
          ${tierBadge(def.tier)}
          ${this.statBadges(def)}
        </span>
        ${entry ? this.offerMeta(entry, state) : ''}
        ${
          missing.length
            ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning);margin-top:6px"
                 title="Buy or build one and this opens up">
                 ${icon('printer')}needs ${missing.map((t) => MACHINE_LABEL[t]).join(' + ')} — buy one first
               </span>`
            : ''
        }
      </span>
      <span class="ui-row__chevron">${icon('chevronRight')}</span>
    </button>`;
  }

  // --- active projects ---  // --- active projects ------------------------------------------------------

  /**
   * The bench is where you *act*, not where you survey — the Projects panel does surveying.
   * So it shows one build open and the rest as a line each: with five or six running, a
   * column of fully expanded cards was several screens of scrolling, and every one of them
   * carried three separate renderings of the same progress.
   *
   * The open one is whichever you are working on, else whatever you last opened, else the
   * first — so the panel is already showing the thing you came to do something about.
   */
  private renderProjects(state: GameState) {
    const projects = state.runtime.projects;
    if (!projects.length) {
      this.setHTML(this.left, 'left', `
        <p class="empty">${t('ui.bench.empty')}</p>
        <p class="blurb">${t('ui.bench.emptyHint', { jobs: `<b>${t('ui.bar.jobs')}</b>` })}</p>
      `);
      return;
    }
    const mine = state.runtime.player?.project;
    // '' means the player folded everything away on purpose; null means "you choose".
    const open =
      this.benchOpen === ''
        ? null
        : (projects.find((x) => x.id === this.benchOpen)?.id ??
          (mine && projects.some((x) => x.id === mine) ? mine : projects[0].id));
    this.setHTML(
      this.left,
      'left',
      projects.map((p) => this.projectCard(p, state, p.id === open)).join(''),
    );
  }

  private projectCard(project: ProjectData, state: GameState, expanded = true): string {
    const player = state.runtime.player;
    const currentIndex = STAGE_ORDER.indexOf(project.stage);
    const stageDef = STAGE_MAP[project.stage];
    const stageName = stageLabel(project.category, project.stage);
    const nowHours = this.handlers.totalHours();

    // One bar for the whole build, and the pipeline as a single line of stage names —
    // eight stacked rows per project made three projects unreadable.
    const overall = projectProgress(project);
    const strip = STAGE_ORDER.map((key) => {
      const label = stageLabel(project.category, key).toLocaleLowerCase(getLocale() === 'tr' ? 'tr' : 'en');
      const index = STAGE_ORDER.indexOf(key);
      const isNow = key === project.stage;
      const resolved =
        key === 'fabrication'
          ? project.parts.length > 0 && project.parts.every((p) => p.status === 'done')
          : key === 'test'
            ? project.testAttempts > 0
            : project.progress[key] > 0;
      const done = index < currentIndex && resolved;
      return `<span class="pipe-stage ${isNow ? 'now' : done ? 'done' : ''}">${label}</span>`;
    }).join('<span class="pipe-dot">·</span>');

    // What the current stage is waiting on, in one line.
    const waitingParts = project.stage === 'assembly' && partsEta(project, nowHours) > 0;
    let statusLine: string;
    if (project.stage === 'fabrication') {
      const madeParts = project.parts.filter((p) => p.status === 'done').length;
      statusLine = t('ui.bench.partsMade', { made: madeParts, total: project.parts.length });
    } else if (waitingParts) {
      statusLine = t('ui.bench.waitingOnParts');
    } else if (project.required[project.stage] > 0) {
      statusLine = `${Math.floor(project.progress[project.stage])}/${project.required[project.stage]}`;
    } else {
      statusLine = t('ui.bench.resolving');
    }

    const playerOn = player?.project === project.id;
    const team = project.team
      .map((id) => state.runtime.members.find((m) => m.id === id))
      .filter((m): m is MemberSnapshot => !!m);
    const free = state.runtime.members
      .filter((m) => !m.team)
      .sort((a, b) => (b.affinity[project.id] ?? 0) - (a.affinity[project.id] ?? 0));
    const room = project.teamSize - project.team.length;

    const teamBlock = `<div class="team">
      <div class="row between" style="margin-bottom:5px">
        <span class="section" style="margin:0">${t('ui.bench.team', { on: project.team.length, size: project.teamSize })}</span>
        ${playerOn ? `<span class="chip you-chip">${t('ui.space.you')}</span>` : ''}
      </div>
      <div class="row wrap" style="gap:4px">
        ${
          team.length
            ? team
                .map(
                  (m) => `<span class="person ${m.present ? '' : 'off'}" title="${m.present ? esc(m.note) : esc(t('ui.bench.notInToday'))}">
                    ${m.name}
                    <button class="x" data-action="release" data-id="${project.id}" data-id2="${m.id}" title="${esc(t('ui.bench.takeOff'))}">×</button>
                  </span>`,
                )
                .join('')
            : `<span class="muted" style="font-size:11px">${t('ui.bench.nobody')}</span>`
        }
      </div>
      ${
        room > 0 && free.length
          ? `<div class="candidates">
              <span class="muted" style="font-size:10px">${room === 1 ? t('ui.bench.askOne') : t('ui.bench.askUpTo', { n: room })}</span>
              ${free
                .slice(0, 6)
                .map((m) => {
                  const match = m.affinity[project.id] ?? 0;
                  const tone = match >= 0.6 ? 'keen' : match >= 0.3 ? '' : 'cold';
                  return `<button class="person ask ${tone}" data-action="invite" data-id="${project.id}" data-id2="${m.id}"
                            title="${esc(t('ui.bench.match', { match: pct(match) }))}${m.present ? '' : ` · ${esc(t('ui.bench.notInToday'))}`}">
                            + ${m.name} <i>${pct(match)}</i>
                          </button>`;
                })
                .join('')}
            </div>`
          : ''
      }
    </div>`;

    // --- sourcing -----------------------------------------------------------
    const waiting = partsEta(project, nowHours);
    let sourcing = '';
    if (!project.partsOrdered) {
      const affordable = this.affordable(state, project.bomCost);
      sourcing = `<div class="sourcing ${project.stage === 'assembly' ? 'urgent' : ''}">
        <span>${t('ui.bench.notOrdered', { days: project.leadDays })}</span>
        <button class="tiny" data-action="order" data-id="${project.id}" ${affordable ? '' : 'disabled'}>
          ${t('ui.bench.order', { cost: project.bomCost })}
        </button>
      </div>`;
    } else if (waiting > 0) {
      const cost = this.handlers.expediteCost(project.id);
      sourcing = `<div class="sourcing ${project.stage === 'assembly' ? 'urgent' : ''}">
        <span>${t('ui.bench.arriveIn', { days: waiting / 24 })}</span>
        <button class="tiny" data-action="expedite" data-id="${project.id}" ${this.affordable(state, cost) ? '' : 'disabled'}>
          ${t('ui.bench.expedite', { cost })}
        </button>
      </div>`;
    }

    // --- your involvement ---------------------------------------------------
    const handStage = stageDef.skill !== null || project.required[project.stage] > 0;
    const blockedAssembly = project.stage === 'assembly' && waiting > 0;
    let workButton = '';
    if (playerOn) {
      workButton = `<button class="ui-btn ui-btn--sm" data-action="stop-work">${t('ui.bench.stop')}</button>`;
    } else if (handStage && !blockedAssembly && project.required[project.stage] > 0) {
      workButton = `<button class="ui-btn ui-btn--primary ui-btn--sm" data-action="work"
        data-id="${project.id}" title="${esc(t('ui.bench.workHint', { stage: stageName }))}">
        ${t('ui.bench.work')}
      </button>`;
    }

    const bountyCost = this.handlers.bountyCost(project.id);
    const canBounty = project.required[project.stage] > 0 && !project.bounties.includes(project.stage);
    const hoursLeft = player?.hoursLeft ?? 0;
    const afford = (verb: string) => hoursLeft >= (VERB_HOURS[verb] ?? 0);

    const parts = project.parts.length
      ? `<div class="parts">
          <div class="row between" style="margin-bottom:6px">
            <span class="section">${t('ui.bench.parts')}</span>
            ${(() => {
              const pending = project.parts.filter((x) => x.status === 'pending').length;
              const printing = project.parts.some((x) => x.status === 'queued');
              if (pending) {
                return `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="queue-all"
                  data-id="${project.id}">${t('ui.bench.queueN', { n: pending })}</button>`;
              }
              return `<span class="ui-badge">${printing ? t('ui.bench.onPrinter') : t('ui.bench.allPrinted')}</span>`;
            })()}
          </div>
          ${project.parts
            .map(
              (p) => `<div class="part ${p.status}">
                <span class="pname">${esc(p.name)}</span>
                ${p.attempts > 0 ? `<span class="tag" title="${esc(t('ui.bench.failedAttempts'))}">×${p.attempts}</span>` : ''}
                <span class="tag">${p.status === 'done' ? t('ui.bench.partDone') : p.status === 'queued' ? t('ui.bench.partQueued') : hours(p.hours)}</span>
                ${p.status === 'pending' ? `<button class="tiny" data-action="queue-part" data-id="${project.id}" data-id2="${p.id}">${t('ui.bench.queue')}</button>` : ''}
              </div>`,
            )
            .join('')}
        </div>`
      : '';

    // What is actually holding this one up, in a few words. It is the only thing a folded
    // card needs to say beyond its name and its bar.
    const shelving = project.idleDays >= SHELVE.warnAfterIdleDays;
    const stop = shelving
      ? { text: t('ui.stop.shelvedIn', { days: SHELVE.afterIdleDays - project.idleDays }), tone: 'bad' }
      : blockedAssembly
        ? {
            text: project.partsOrdered ? t('ui.stop.partsIn', { days: waiting / 24 }) : t('ui.stop.notOrdered'),
            tone: 'warn',
          }
        : !project.team.length && !playerOn
          ? { text: t('ui.stop.nobody'), tone: 'warn' }
          : null;

    const header = `<button class="proj-head" data-action="bench-open" data-id="${project.id}">
      <span class="row between" style="gap:8px;width:100%">
        <span class="ui-title" style="flex:1;min-width:0;text-align:left">${esc(project.name)}</span>
        <span class="mono" style="font-size:10.5px;color:var(--subtle-foreground)">
          ${Math.round(overall.ratio * 100)}%
        </span>
      </span>
      <span class="bar ${stop?.tone ?? ''}" style="margin:6px 0 5px">
        <i style="width:${(overall.ratio * 100).toFixed(1)}%"></i>
      </span>
      <span class="proj-line">
        <span class="proj-line__stage">${stageName}</span>
        ${expanded ? `<span class="proj-line__val">${statusLine}</span>` : ''}
        ${
          stop
            ? `<span class="proj-line__stop ${stop.tone}">${esc(stop.text)}</span>`
            : `<span class="proj-line__crew">${
                playerOn && project.team.length
                  ? t('ui.bench.youPlus', { n: project.team.length })
                  : playerOn
                    ? t('ui.space.you')
                    : t('ui.bench.onIt', { n: project.team.length })
              }</span>`
        }
      </span>
    </button>`;

    if (!expanded) {
      return `<div class="project project--folded ${stop ? 'project--needs' : ''}">${header}</div>`;
    }

    return `<div class="project">
      ${header}
      <div class="row wrap" style="gap:5px;margin:2px 0 8px">
        ${categoryChip(project.category)}
        <span class="ui-badge" title="${esc(t('ui.bench.qualityHint'))}">
          ${icon('effort')}${t('ui.bench.quality', { quality: pct(project.quality) })}
        </span>
        ${
          project.hypeMultiplier > 1
            ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${icon('flame')}×${project.hypeMultiplier}</span>`
            : ''
        }
        ${
          project.sponsorCash
            ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)">${icon('coins')}${t('ui.bench.sponsored')}</span>`
            : ''
        }
      </div>
      <div class="pipe">${strip}</div>

      ${sourcing}
      ${teamBlock}
      <div class="verbs">
        ${workButton}
        <button class="ui-btn ui-btn--outline ui-btn--sm" data-action="repitch" data-id="${project.id}"
          ${afford('repitch') && project.required[project.stage] > 0 ? '' : 'disabled'}>
          ${t('ui.bench.repitch', { hours: hours(VERB_HOURS.repitch) })}
        </button>
        <button class="ui-btn ui-btn--outline ui-btn--sm" data-action="bounty" data-id="${project.id}"
          ${canBounty && this.affordable(state, bountyCost) && afford('bounty') ? '' : 'disabled'}>
          ${t('ui.bench.bounty', { cost: bountyCost })}
        </button>
        ${project.stage === 'simulation' ? `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="skip-sim" data-id="${project.id}">${t('ui.bench.skipSim')}</button>` : ''}
      </div>
      ${parts}
    </div>`;
  }

  // --- backlog --------------------------------------------------------------

  /** Everybody free, best match for this kind of work first. The picker's order, and the suggestion's. */
  private rankedFree(def: ProjectDef, state: GameState) {
    return state.runtime.members
      .filter((m) => !m.team)
      .map((m) => ({ m, match: categoryAffinity(MEMBER_DATA[m.id]?.passions ?? {}, def.category) }))
      .sort((a, b) => b.match - a.match);
  }

  /**
   * Arrive at the crew step with the obvious answer already ticked — the best matches for
   * this genre, up to the team size. Anyone who has since been taken is dropped first, and a
   * draft the player has edited by hand is left exactly as they left it.
   */
  private suggestCrew(def: ProjectDef, state: GameState) {
    const free = new Set(state.runtime.members.filter((m) => !m.team).map((m) => m.id));
    const draft = new Set([...(this.draftTeams.get(def.id) ?? [])].filter((id) => free.has(id)));
    if (!this.draftTouched.has(def.id)) {
      for (const { m } of this.rankedFree(def, state)) {
        if (draft.size >= def.teamSize) break;
        draft.add(m.id);
      }
    }
    this.draftTeams.set(def.id, draft);
  }

  /** Pick the crew before you commit — they are asked the moment you pitch (§3b). */
  private draftPicker(def: ProjectDef, state: GameState): string {
    const picked = this.draftTeams.get(def.id) ?? new Set<string>();
    const free = this.rankedFree(def, state);

    if (!free.length) {
      return `<div class="ui-card" style="padding:11px">
        <p class="ui-desc" style="margin:0">Everybody is already on something. You can still pitch it
        and crew it later from the project card.</p>
      </div>`;
    }
    return `<div class="ui-card" style="padding:11px">
      <div class="row between" style="margin-bottom:8px">
        <span class="ui-label">Crew ${picked.size}/${def.teamSize}</span>
        <span class="ui-desc" style="font-size:10.5px">they can still say no</span>
      </div>
      <div class="row wrap" style="gap:5px">
        ${free
          .slice(0, 8)
          .map(({ m, match }) => {
            const on = picked.has(m.id);
            const full = !on && picked.size >= def.teamSize;
            return `<button class="ui-toggle" aria-pressed="${on}" ${full ? 'disabled' : ''}
              data-action="draft" data-id="${def.id}" data-id2="${m.id}"
              title="${profileOf(def.category).label} match ${pct(match)}${m.present ? '' : ' · not in today'}">
              ${icon(on ? 'check' : 'plus')}${m.name}<span class="ui-toggle__pct">${pct(match)}</span>
            </button>`;
          })
          .join('')}
      </div>
    </div>`;
  }

  /** The numbers that decide whether a job is worth it, as a row of badges. */
  private statBadges(def: ProjectDef): string {
    const printHours = def.parts.reduce((sum, part) => sum + part.hours, 0);
    const workUnits = STAGE_ORDER.reduce((sum, key) => sum + (def.work[key] ?? STAGE_MAP[key].work), 0);
    return `
      <span class="ui-badge ui-badge--tone" style="--tone:var(--primary)" title="team size">
        ${icon('users')}${def.teamSize} ${def.teamSize === 1 ? 'person' : 'people'}
      </span>
      <span class="ui-badge" title="hand work">${icon('effort')}${workUnits}</span>
      <span class="ui-badge" title="machine time">${icon('printer')}${printHours ? `${printHours}h` : 'none'}</span>
      <span class="ui-badge" title="bill of materials and lead time">
        ${icon('package')}${def.bomCost ? `${money(def.bomCost)} · ${def.leadDays}d` : 'none'}
      </span>
      ${
        def.payout
          ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)" title="payout">${icon('coins')}${money(def.payout)}</span>`
          : `<span class="ui-badge" title="you keep it">${icon('coins')}you keep it</span>`
      }`;
  }

  private defStats(def: ProjectDef): string {
    return `<div class="ui-row__meta" style="margin:0 0 10px">${tierBadge(def.tier)}${this.statBadges(def)}</div>`;
  }

  // --- you ---  // --- you ------------------------------------------------------------------

  /**
   * Your day, as one line under the clock. It used to be a panel in its own corner with a
   * heading, two bars and a task line — to say something you glance at. What is left is the
   * only thing worth glancing at: how much of today you can still get anything done in.
   *
   * It draws the *lesser* of what is left in you and what is left of the day, because an
   * idle player at half ten at night has a full tank and one usable hour.
   */
  private dayBar(state: GameState): string {
    const p = state.runtime.player;
    if (!p) return '';
    const open = state.simTime >= PLAYER.startHour && state.simTime < PLAYER.endHour;
    const untilClose = open
      ? PLAYER.endHour - state.simTime
      : state.simTime < PLAYER.startHour
        ? p.hoursToday
        : 0;
    const usable = Math.max(0, Math.min(p.hoursLeft, untilClose));
    const share = usable / Math.max(1, p.hoursToday);
    const tone = share <= 0.08 ? 'bad' : share <= 0.2 ? 'warn' : 'good';
    const task = p.project ? state.runtime.projects.find((x) => x.id === p.project) : null;
    return `<div class="daybar bar ${tone}"
      title="${esc(t('ui.daybar.left', { hours: hours(usable) }))}${task ? ` · ${esc(t('ui.daybar.on', { project: task.name }))}` : ''}">
      <i style="width:${(share * 100).toFixed(1)}%"></i>
    </div>`;
  }

  // --- members --------------------------------------------------------------

  private renderMembers(state: GameState) {
    // Whoever is actually in the building matters most; unallocated people next, since
    // they are the ones you can put on a team right now.
    const ordered = [...state.runtime.members].sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      if (!!a.team !== !!b.team) return a.team ? 1 : -1;
      return a.name.localeCompare(b.name, 'tr');
    });
    this.setHTML(this.members, 'members', ordered
      .map((m) => {
        const data = MEMBER_DATA[m.id];
        const color = MEMBER_COLORS[m.id] ?? personColor(m.id);
        const interestTone = m.interest < 0.4 ? 'bad' : m.interest < 0.7 ? 'warn' : '';
        const energyTone = m.energy < 25 ? 'bad' : m.energy < 50 ? 'warn' : 'good';
        // Mood used to be a stat nothing wrote to. The Shop writes to it, so it is now worth
        // a row: it is the number that says whether the comforts were worth buying.
        const moodTone = m.mood < 45 ? 'bad' : m.mood < 65 ? 'warn' : 'good';
        return `<div class="member ${m.present ? '' : 'away'}">
          <div class="head">
            <i class="swatch" style="background:${color}"></i>
            <span class="mname">${m.name}</span>
            <span class="state">${t(ACTIVITY_LABEL[m.activity])}</span>
          </div>
          <div class="note">${
            m.team
              ? `<b class="on-team">${esc(state.runtime.projects.find((p) => p.id === m.team)?.name ?? '—')}</b> · ${esc(m.note || '')}`
              : esc(m.note || t('ui.members.unallocated'))
          }</div>
          <div class="meters">
            <div class="meter"><label>${t('ui.members.interest')}</label>${bar(m.interest, 1.2, interestTone)}</div>
            <div class="meter"><label>${t('ui.members.energy')}</label>${bar(m.energy, 100, energyTone)}</div>
            <div class="meter" title="${esc(t('ui.members.moodHint'))}"><label>${t('ui.members.mood')}</label>${bar(m.mood, 100, moodTone)}</div>
            <div class="meter"><label>${t('ui.members.commit')}</label><span class="mono">${t('ui.members.perWeek', { hours: data?.commitment ?? '?' })}</span></div>
          </div>
          <div class="traits">
            ${topCategories(data?.passions ?? {})
              .map(({ category, score }) => {
                const profile = profileOf(category);
                return `<span class="ui-badge ui-badge--tone" style="--tone:${profile.accent}"
                  title="${esc(t('ui.members.passion', { category: profile.label, match: pct(score) }))}">
                  ${icon(CATEGORY_ICON[category])}${pct(score)}</span>`;
              })
              .join('')}
            ${(data?.traits ?? []).map((trait) => `<span class="trait" title="${TRAIT_BLURB[trait]}">${TRAIT_LABEL[trait]}</span>`).join('')}
          </div>
        </div>`;
      })
      .join(''));
  }

  // --- machines -------------------------------------------------------------

  /** The shop floor: every machine, what it is chewing on, and what is behind it. */
  // --- the Shop: what you buy for the people (§7b) --------------------------

  /**
   * Comforts, grouped by the lease that unlocks them. **The grouping is the point**: it is
   * the one screen in the game that says out loud what signing the next lease actually gets
   * you, and an arcade cabinet you cannot buy yet is worth seeing for the same reason the
   * printer shop lists the H2S.
   *
   * Each card states its effect in full, including the ones that cost you something — the
   * table tennis table really does mean less work gets done, and hiding that would make the
   * purchase a formality rather than a decision.
   */
  private shopBody(state: GameState): { head: string; content: string; foot: string } {
    const owned = state.amenities;
    const comforts = comfortsOf(owned);
    const pct = (value: number) => `${value > 1 ? '+' : '−'}${Math.round(Math.abs(value - 1) * 100)}%`;

    // What the room is currently doing for everybody in it. Nothing until something is
    // bought — an all-zero readout on an empty shop teaches nothing.
    const summary = owned.length
      ? `<div class="ui-row" style="margin-bottom:12px">
          <span class="icon-chip" style="--tone:var(--success)">${icon('users', 'ui-icon ui-icon--lg')}</span>
          <div class="ui-row__main">
            <b class="ui-title">What the place is like to be in</b>
            <span class="ui-row__meta" style="margin-top:4px">
              <span class="ui-badge ui-badge--accent" title="everybody turns up more, and works better">
                ${icon('effort')}mood +${comforts.mood.toFixed(1)}
              </span>
              ${comforts.focus !== 1 ? `<span class="ui-badge">work rate ${pct(comforts.focus)}</span>` : ''}
              ${comforts.rest !== 1 ? `<span class="ui-badge">rest ${pct(comforts.rest)}</span>` : ''}
              ${comforts.fatigue !== 1 ? `<span class="ui-badge">tiring ${pct(comforts.fatigue)}</span>` : ''}
              ${comforts.drift !== 1 ? `<span class="ui-badge">drift ${pct(comforts.drift)}</span>` : ''}
              ${comforts.draw !== 1 ? `<span class="ui-badge">word of mouth ${pct(comforts.draw)}</span>` : ''}
            </span>
          </div>
          <span class="ui-badge ui-badge--tone" style="--tone:var(--warning)" title="on every monthly statement">
            ${icon('coins')}${money(comforts.upkeep)}/mo
          </span>
        </div>`
      : '';

    const groups = [1, 2, 3]
      .map((era) => {
        const items = AMENITIES.filter((a) => a.era === era);
        if (!items.length) return '';
        const locked = era > state.era;
        return `<div class="ui-label" style="margin:${era === 1 ? 0 : 16}px 0 9px">
            ${esc(eraDef(era).name)}
            ${locked ? `<span class="ui-badge" style="margin-left:7px">${icon('clock')}not yours yet</span>` : ''}
          </div>
          <div class="ui-grid ui-grid--3">${items.map((a) => this.amenityCard(a, state)).join('')}</div>`;
      })
      .join('');

    return {
      head: `<div class="modal-head">${icon('coins', 'ui-icon ui-icon--lg')}<b>The Shop</b>
        <span class="ui-badge${owned.length ? ' ui-badge--accent' : ''}">${owned.length} of ${AMENITIES.length}</span>
      </div>`,
      content: summary + groups,
      foot: `<span class="ui-desc" style="font-size:10.5px">
        None of this makes a part. It makes people turn up, stay longer and work better —
        which §13 says is the only constraint that ever really binds. Everything here can be
        <b>clicked in the room</b> to move or turn it. Printers and tools are in <b>Machines</b>.
      </span>`,
    };
  }

  private amenityCard(def: AmenityDef, state: GameState): string {
    const owned = state.amenities.includes(def.id);
    const locked = def.era > state.era;
    const afford = this.affordable(state, def.price);
    const buyable = !owned && !locked && afford;
    return `<button class="ui-option ${owned ? 'ui-option--on' : ''}" data-action="buy-amenity"
      data-value="${def.id}" ${buyable ? '' : 'disabled'} style="--tone:${def.tone}"
      title="${
        owned
          ? 'Already in the space'
          : locked
            ? `Comes with ${esc(eraDef(def.era).name)}`
            : afford
              ? `${money(def.price)} now${def.upkeep ? `, ${money(def.upkeep)} a month` : ''}`
              : 'Not enough left'
      }">
      <div class="ui-option__head">
        <span class="icon-chip">${icon(def.icon, 'ui-icon ui-icon--lg')}</span>
        <span class="ui-title">${esc(def.name)}</span>
        ${owned ? `<span class="ui-badge ui-badge--accent">${icon('check')}in</span>` : ''}
      </div>
      <span class="ui-option__desc ui-clamp-3">${esc(def.blurb)}</span>
      <span class="ui-row__meta" style="margin:0">
        ${effectLines(def.effect)
          .map(
            (line) =>
              `<span class="ui-badge ui-badge--tone" style="--tone:var(--${line.good ? 'success' : 'destructive'})">
                 ${esc(line.label)}
               </span>`,
          )
          .join('')}
      </span>
      <span class="ui-row__meta" style="margin:0">
        <span class="ui-badge ui-badge--tone"
          style="--tone:var(--${locked ? 'warning' : afford || owned ? 'success' : 'destructive'})">
          ${icon('coins')}${money(def.price)}
        </span>
        ${
          locked
            ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${icon('clock')}era ${def.era}</span>`
            : ''
        }
        ${
          def.upkeep
            ? `<span class="ui-badge" title="charged on every monthly statement">${money(def.upkeep)}/mo</span>`
            : `<span class="ui-badge">no upkeep</span>`
        }
      </span>
    </button>`;
  }

  private machinesBody(state: GameState): { head: string; content: string; foot: string } {
    const machines = state.runtime.machines;
    const running = machines.filter((m) => m.current).length;
    const queued = machines.reduce((n, m) => n + m.queue.length, 0);
    const forSale = this.handlers.buyablePrinters();
    const shop = forSale.length
      ? `<hr class="ui-sep" />
         <div class="ui-label" style="margin-bottom:9px">${t('ui.machines.buy')}</div>
         <div class="ui-grid ui-grid--3">
           ${forSale
             .map((model) => {
               const locked = model.era > state.era;
               const afford = !locked && this.affordable(state, model.price);
               return `<button class="ui-option" data-action="buy-printer" data-value="${model.id}"
                 ${afford ? '' : 'disabled'} style="--tone:var(--primary)"
                 title="${locked ? esc(t('ui.machines.locked', { space: eraDef(state.era).name })) : ''}">
                 <div class="ui-option__head">
                   <span class="icon-chip">${icon('printer', 'ui-icon ui-icon--lg')}</span>
                   <span class="ui-title">${esc(model.name)}</span>
                 </div>
                 <span class="ui-option__desc ui-clamp-3">${esc(model.blurb)}</span>
                 <span class="ui-row__meta" style="margin:0">
                   <span class="ui-badge" title="${esc(t('ui.machines.speedHint'))}">
                     ${icon('effort')}${Math.round(model.speed * 100)}%
                   </span>
                   <span class="ui-badge" title="${esc(t('ui.machines.capacityHint'))}">
                     ${icon('package')}${t('ui.machines.kg', { kg: model.capacity / 1000 })}
                   </span>
                   ${
                     locked
                       ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">
                            ${icon('clock')}${t('ui.machines.era', { era: model.era })}
                          </span>`
                       : ''
                   }
                   <span class="ui-badge ui-badge--tone"
                     style="--tone:var(--${afford ? 'success' : 'destructive'})">
                     ${icon('coins')}${money(model.price)}
                   </span>
                 </span>
               </button>`;
             })
             .join('')}
         </div>`
      : '';

    const content =
      (machines.length
        ? `<div class="ui-grid machine-grid">
            ${machines.map((m) => this.machineCard(m, state)).join('')}
          </div>`
        : `<p class="ui-desc">${t('ui.machines.empty')}</p>`) + shop;
    return {
      head: `<div class="modal-head">${icon('printer', 'ui-icon ui-icon--lg')}<b>${t('ui.machines.title')}</b>
        <span class="ui-badge${running ? ' ui-badge--accent' : ''}">${t('ui.machines.running', { n: running })}</span>
        <span class="ui-badge">${t('ui.machines.queued', { n: queued })}</span>
      </div>`,
      content,
      foot: `<span class="ui-desc" style="font-size:10.5px">${t('ui.machines.foot')}</span>`,
    };
  }

  private machineCard(machine: MachineSnapshot, state: GameState): string {
    const projectName = (id: string) => state.runtime.projects.find((p) => p.id === id)?.name ?? '';
    const job = machine.current;
    const calLow = machine.calibration < MACHINE.calibrationWarning;
    const filamentLow = machine.consumableMax > 0 && machine.consumable < FILAMENT.lowWarning;
    const riskTone = machine.risk > 0.35 ? 'var(--destructive)' : machine.risk > 0.2 ? 'var(--warning)' : 'var(--muted-foreground)';

    const status = job
      ? `<span class="ui-badge ui-badge--accent">${icon('printer')}${t('ui.machine.running')}</span>`
      : machine.queue.length
        ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${icon('clock')}${t('ui.machine.waiting')}</span>`
        : `<span class="ui-badge">${t('ui.activity.idle')}</span>`;

    const left = job
      ? `<div class="row between" style="gap:8px;margin-bottom:5px">
           <span class="ui-title" style="font-size:12.5px">${esc(job.partName)}</span>
           <span class="mono" style="font-size:10.5px;color:var(--muted-foreground)">
             ${t('ui.machine.progress', { done: job.progress, total: job.hoursRequired })}
           </span>
         </div>
         <p class="ui-desc" style="margin:0 0 7px;font-size:10.5px">${esc(projectName(job.projectId))}</p>
         <div class="bar"><i style="width:${((job.progress / job.hoursRequired) * 100).toFixed(1)}%"></i></div>
         <div class="row between" style="margin-top:7px">
           <span class="ui-desc" style="font-size:10.5px">${t('ui.machine.risk')}</span>
           <span class="mono" style="font-size:11px;color:${riskTone}">${pct(machine.risk)}</span>
         </div>`
      : `<p class="ui-desc" style="margin:0">${t('ui.machine.nothing')} ${
          machine.queue.length ? t('ui.machine.queueStarts') : t('ui.machine.queueSomething')
        }</p>`;

    const meters = `
      <div class="meter"><label>${t('ui.machine.calibration')}</label>${bar(machine.calibration, 1, calLow ? 'bad' : machine.calibration < 0.75 ? 'warn' : 'good')}</div>
      ${
        machine.consumableMax > 0
          ? `<div class="meter"><label>${t('ui.machine.filament')}</label>${bar(machine.consumable, machine.consumableMax, filamentLow ? 'warn' : '')}
               <span class="mono" style="font-size:10px;color:var(--subtle-foreground)">${Math.round(machine.consumable)}g</span>
             </div>`
          : ''
      }`;

    const refill = machine.consumableMax > 0 ? this.handlers.refillCost(machine.id) : 0;
    // Levelling the bed lives next to the calibration meter it is about. It used to sit
    // permanently under the player's energy bar, which is neither where you notice the
    // drift nor, with four printers on the floor, clear about which one you meant.
    const actions = `
      ${
        refill
          ? `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="filament" data-id="${machine.id}"
               ${this.affordable(state, refill) ? '' : 'disabled'}>
               ${icon('package')}${t('ui.machine.fill', { cost: refill })}
             </button>`
          : ''
      }
      ${
        machine.calibration < 0.99
          ? `<button class="ui-btn ${calLow ? 'ui-btn--primary' : 'ui-btn--outline'} ui-btn--sm"
               data-action="calibrate"
               title="${esc(t('ui.machine.levelHint'))}">
               ${icon('cog')}${t('ui.machine.level')}
             </button>`
          : ''
      }
      ${(() => {
        const resale = this.handlers.resaleFor(machine.id);
        if (!resale) return '';
        return `<button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="sell-printer"
          data-id="${machine.id}"
          title="${esc(t('ui.machine.sellHint'))}">
          ${icon('coins')}${t('ui.machine.sell', { value: resale })}
        </button>`;
      })()}`;

    const queue = machine.queue.length
      ? machine.queue
          .map(
            (item, index) => `<div class="queue-row">
              <span class="queue-no">${index + 1}</span>
              <span class="queue-name">${esc(item.partName)}</span>
              <span class="mono queue-hours">${hours(item.hoursRequired)}</span>
              <span class="queue-ctrl">
                <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="job-up" data-id="${machine.id}" data-id2="${item.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="job-down" data-id="${machine.id}" data-id2="${item.id}" ${index === machine.queue.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="job-cancel" data-id="${machine.id}" data-id2="${item.id}">${icon('x')}</button>
              </span>
            </div>`,
          )
          .join('')
      : `<p class="ui-desc" style="margin:0;font-size:10.5px">${t('ui.machine.queueEmpty')}</p>`;

    return `<div class="machine-card ${calLow || filamentLow ? 'needs-hand' : ''}">
      <div class="machine-card__head">
        <span class="icon-chip" style="--tone:${job ? 'var(--primary)' : 'var(--muted-foreground)'}">
          ${icon('printer', 'ui-icon ui-icon--lg')}
        </span>
        <span class="ui-title" style="flex:1">${esc(machine.label)}</span>
        ${status}
      </div>
      <div class="machine-card__body">
        <div class="machine-card__col">
          <div class="ui-label" style="margin:0 0 7px">${t('ui.machine.now')}</div>
          ${left}
        </div>
        <div class="machine-card__col">
          <div class="ui-label" style="margin:0 0 7px">${t('ui.machine.condition')}</div>
          <div class="meters">${meters}</div>
          ${actions ? `<div style="margin-top:9px">${actions}</div>` : ''}
        </div>
      </div>
      <div class="machine-card__queue">
        <div class="ui-label" style="margin:0 0 6px">${t('ui.machine.queue', { n: machine.queue.length })}</div>
        ${queue}
      </div>
    </div>`;
  }

  // --- projects: everything on, waiting, and done ---------------------------

  /**
   * Triage as a table. The question is still "what needs me now?", but a table answers it
   * better than a stack of cards for the same reason the leaderboard is one (§3c): you read
   * *down* a column. Every project shares one row shape, running or shipped, so Needs can be
   * scanned in a single pass and Paid compared between two rows that are nowhere near each
   * other. Colour stays rare and meaningful — it appears in the Needs column and the bar,
   * and nowhere else.
   */
  private projectsBody(state: GameState): { head: string; content: string; foot: string } {
    const active = state.runtime.projects;
    const mine = (p: ProjectData) => state.runtime.player?.project === p.id;
    const done = [...state.shipped].reverse();
    const nowHours = this.handlers.totalHours();

    /** What is actually stopping this one, if anything. Order matters: worst first. */
    const blocker = (project: ProjectData, crew: number) => {
      if (project.idleDays >= SHELVE.warnAfterIdleDays) {
        const left = SHELVE.afterIdleDays - project.idleDays;
        return { text: t('ui.stop.shelvedIn', { days: left }), tone: 'bad' as const };
      }
      if (project.stage === 'assembly' && partsPending(project, nowHours)) {
        // The bought bill of materials is what gates assembly (§4), not the printed parts.
        if (!project.partsOrdered) {
          return { text: `${t('ui.stop.notOrdered')} · ${money(project.bomCost)}`, tone: 'bad' as const };
        }
        return {
          text: t('ui.stop.partsIn', { days: Math.ceil(partsEta(project, nowHours) / 24) }),
          tone: 'warn' as const,
        };
      }
      const unprinted = project.parts.filter((part) => part.status !== 'done').length;
      if (project.stage === 'assembly' && unprinted) {
        return { text: t('ui.stop.toPrint', { n: unprinted }), tone: 'warn' as const };
      }
      if (!crew) return { text: t('ui.stop.nobody'), tone: 'warn' as const };
      return null;
    };
    const stopFor = (p: ProjectData) => blocker(p, p.team.length + (mine(p) ? 1 : 0));

    const nameCell = (category: ProjectCategory, name: string) => {
      const profile = profileOf(category);
      return `<td class="space-cell">
        <span class="space-dot" style="--tone:${profile.accent}">${icon(CATEGORY_ICON[category])}</span>
        <span class="space-name">${esc(name)}</span>
      </td>`;
    };
    const barCell = (ratio: number, tone: string) => `<td>
        <span class="cell-bar">
          <span class="bar ${tone}"><i style="width:${(ratio * 100).toFixed(1)}%"></i></span>
          <span class="mono" style="font-size:10.5px;color:var(--muted-foreground)">
            ${Math.round(ratio * 100)}%
          </span>
        </span>
      </td>`;

    const activeRow = (project: ProjectData) => {
      const overall = projectProgress(project);
      const crew = project.team
        .map((id) => state.runtime.members.find((m) => m.id === id)?.name)
        .filter(Boolean);
      if (mine(project)) crew.unshift(t('ui.space.you'));
      const stop = blocker(project, crew.length);
      return `<tr>
        ${nameCell(project.category, project.name)}
        <td class="num">${stageLabel(project.category, project.stage)}</td>
        ${barCell(overall.ratio, stop?.tone ?? '')}
        <td class="note ${stop?.tone ?? ''}">${stop ? esc(stop.text) : '—'}</td>
        <td class="num wide">${crew.length ? esc(crew.join(', ')) : '—'}</td>
        <td class="num">—</td>
      </tr>`;
    };

    const doneRow = (record: ShippedRecord) => `<tr>
        ${nameCell(record.category, record.name)}
        <td class="num">${t('ui.projects.shippedOn', { day: record.day })}</td>
        ${barCell(1, 'good')}
        <td class="note">${t('ui.projects.rep', { rep: record.hype })} · ${pct(record.quality)}</td>
        <td class="num wide">${t('ui.days.short', { days: record.days })}</td>
        ${(() => {
          const net = record.payout - record.spent;
          return `<td class="note ${net >= 0 ? '' : 'bad'}"
            style="${net > 0 ? 'color:var(--success)' : ''}"
            title="${esc(t('ui.projects.netHint', { payout: record.payout, spent: record.spent }))}">
            ${net >= 0 ? '' : '−'}${money(Math.abs(net))}
          </td>`;
        })()}
      </tr>`;

    // Blocked first, then whatever is nearest to shipping: the two reasons to look.
    const urgency = (p: ProjectData) => {
      const stop = stopFor(p);
      return stop ? (stop.tone === 'bad' ? 0 : 1) : 2;
    };
    const runningRows = [...active]
      .sort((a, b) => urgency(a) - urgency(b) || projectProgress(b).ratio - projectProgress(a).ratio)
      .map(activeRow);

    const filters = [
      { key: 'all' as const, label: t('ui.people.tab.all'), count: active.length + done.length },
      { key: 'on' as const, label: t('ui.projects.tab.on'), count: active.length },
      { key: 'done' as const, label: t('ui.projects.tab.done'), count: done.length },
    ];
    const chips = `<div class="ui-segmented" style="margin-bottom:11px">
      ${filters
        .map(
          (f) => `<button data-action="projects-tab" data-value="${f.key}"
            aria-pressed="${f.key === this.projectsTab}" ${f.count ? '' : 'disabled'}>
            ${f.label}<span class="seg-count">${f.count}</span>
          </button>`,
        )
        .join('')}
    </div>`;

    const rows =
      this.projectsTab === 'done'
        ? done.map(doneRow)
        : this.projectsTab === 'on'
          ? runningRows
          : [...runningRows, ...done.map(doneRow)];

    const earned = done.reduce((sum, r) => sum + r.payout, 0);
    const blocked = active.filter((p) => stopFor(p)).length;

    return {
      head: `<div class="modal-head">${icon('clipboard', 'ui-icon ui-icon--lg')}<b>${t('ui.projects.title')}</b></div>`,
      content:
        chips +
        (rows.length
          ? `<table class="rank-table">
              <thead><tr>
                <th class="space-head">${t('ui.projects.col.project')}</th><th>${t('ui.projects.col.stage')}</th>
                <th>${t('ui.projects.col.progress')}</th><th>${t('ui.projects.col.needs')}</th>
                <th>${t('ui.projects.col.crew')}</th><th>${t('ui.projects.col.net')}</th>
              </tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table>`
          : `<p class="ui-desc">${t('ui.projects.empty', { jobs: `<b>${t('ui.bar.jobs')}</b>` })}</p>`),
      foot: `<span class="ui-desc" style="font-size:10.5px">
          ${
            blocked
              ? `${t('ui.projects.foot.blocked', { n: `<b>${blocked}</b>` })} · `
              : active.length
                ? `${t('ui.projects.foot.clear')} · `
                : ''
          }${t('ui.projects.foot.shipped', { count: done.length, earned })} ·
          ${t('ui.projects.foot.shelf', { days: SHELVE.afterIdleDays })}
        </span>`,
    };
  }

  private renderLog(state: GameState) {
    this.setHTML(this.log, 'log', state.log
      .map(
        (entry) =>
          `<div class="entry ${entry.kind}"><time>${t('ui.log.day', { day: entry.day })} ${clock(entry.time)}</time><span>${esc(say(entry.text))}${
            entry.repeats ? ` <i class="repeats">×${entry.repeats}</i>` : ''
          }</span></div>`,
      )
      .join(''));
  }
}

