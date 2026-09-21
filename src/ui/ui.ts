import type { GameState } from '@/game/store';
import type {
  BacklogEntry,
  ProjectCategory,
  ScoreRow,
  MemberSnapshot,
  MachineSnapshot,
  PlayerSnapshot,
  ProjectData,
  ProjectDef,
  Employment,
  ClaimKey,
  ShippedRecord,
} from '@/game/types';
import { ROLE_BLURB, ROLE_LABEL, SPACE_SUBJECT, type Role } from '@/game/types';
import { CATALOG_MAP, catalogForEra, canBuild, missingMachines } from '@/utils/catalog';
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
  ROSTER,
  STAGE_MAP,
  STAGE_ORDER,
  TIME,
  TRAIT_BLURB,
  TRAIT_LABEL,
  VERB_HOURS,
  eraDef,
  weeklyHoursFor,
} from '@/utils/constants';
import { clock, dayName, hours, money, pct } from '@/utils/format';
import { CLAIMS, SUBREDDITS, SUBREDDIT_MAP, tasteMatch } from '@/utils/subreddits';
import { merit, projectSubject, react, type Subject } from '@/systems/HypeSystem';
import type { PrinterModel } from '@/utils/printers';
import { CATEGORY_ICON, icon, type IconName } from './icons';
import { LOGOS, NAME_SUGGESTIONS, RIVAL_MAP } from '@/utils/rivals';
import { DIFFICULTIES, type DifficultyKey } from '@/utils/difficulty';
import { ECONOMY } from '@/utils/economy';
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
  buyablePrinters(): PrinterModel[];
  hire(memberId: string, employment: Employment): void;
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

const ACTIVITY_LABEL: Record<MemberSnapshot['activity'], string> = {
  away: 'away',
  idle: 'idle',
  walking: 'walking',
  working: 'working',
  resting: 'resting',
  babysitting: 'at printer',
};

const SOURCE_BADGE: Record<BacklogEntry['source'], { label: string; cls: string }> = {
  catalog: { label: '', cls: '' },
  member: { label: 'proposed', cls: 'src-member' },
  sponsor: { label: 'sponsor', cls: 'src-sponsor' },
  trending: { label: 'trending', cls: 'src-trending' },
};

type JobStep = 'category' | 'project' | 'crew';
type RankKey = 'projectsThisYear' | 'projects' | 'members' | 'cash' | 'reputationThisYear' | 'reputation';

/** The clock face of somebody's contract, e.g. "09:00-14:00". */


/** Narrow enough to keep six numeric columns comparable at a glance. */
function compactMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `₺${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `₺${(value / 1000).toFixed(1)}k`;
  return `₺${Math.round(value)}`;
}
type SizeFilter = 'any' | 'solo' | 'small' | 'big';

/**
 * Team-size buckets. These narrow and group the job list in place — size was briefly its own
 * wizard step, which was redundant: every project already states its team size, so the list
 * just had to say it properly.
 */
const SIZE_FILTERS: { key: SizeFilter; label: string; short: string; hint: string; test: (team: number) => boolean }[] = [
  { key: 'any', label: 'All sizes', short: 'All', hint: 'everything on offer', test: () => true },
  { key: 'solo', label: '1-2 people', short: '1-2', hint: 'fits alongside a long build', test: (t) => t <= 2 },
  { key: 'small', label: '3-4 people', short: '3-4', hint: 'most of the space', test: (t) => t >= 3 && t <= 4 },
  { key: 'big', label: '5+ people', short: '5+', hint: 'everyone you have', test: (t) => t >= 5 },
];
const SIZE_GROUPS = SIZE_FILTERS.filter((f) => f.key !== 'any');

/** The promise each tier makes about length (CLAUDE.md §4). */
const TIER_DAYS: Record<ProjectDef['tier'], string> = {
  small: '1-5d',
  medium: '5-10d',
  large: '10-30d',
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
  return `<span class="ui-badge ui-badge--tone" style="--tone:${tone}">${tier} · ${TIER_DAYS[tier]}</span>`;
}

function bar(value: number, max: number, tone = ''): string {
  const ratio = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  return `<div class="bar ${tone}"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>`;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    | 'jobs' | 'people' | 'ranking' | 'machines' | 'projects' | 'reddit' | null = null;

  /** Which group of projects is on screen. Falls through when the chosen one is empty. */
  private projectsTab: 'all' | 'on' | 'done' = 'all';

  /** Which build on the bench is open. One at a time; the rest are a line each. */
  private benchOpen: string | null = null;

  /** Standings, or the shelf of everything you have won. */
  private rankTab: 'table' | 'trophies' = 'table';

  /** Right-column panels the player has folded away. The log starts small on purpose. */
  private folded: { log: boolean; members: boolean } = { log: true, members: false };

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
  private you!: HTMLElement;
  private members!: HTMLElement;
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
      <div class="panel" id="you"><div class="body"></div></div>
      <div id="bottombar"></div>
      <div id="modal"></div>
      <div id="start"></div>
    `;
    this.topbar = this.root.querySelector('#topbar')!;
    this.clockPanel = this.root.querySelector('#clockpanel')!;
    this.bottombar = this.root.querySelector('#bottombar')!;
    this.modal = this.root.querySelector('#modal')!;
    this.startEl = this.root.querySelector('#start')!;
    this.left = this.root.querySelector('#left .body')!;
    this.you = this.root.querySelector('#you .body')!;
    this.members = this.root.querySelector('#members .body')!;
    this.log = this.root.querySelector('#log .body')!;
  }

  private bind() {
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
        case 'set-role':
          if (id) h.setRole(id, (value || null) as Role | null);
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
        case 'ceremony-close':
          h.dismissCeremony();
          this.rerender();
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
    this.renderTopbar(state);
    this.renderProjects(state);
    this.root.querySelector('#log')?.classList.toggle('folded', this.folded.log);
    this.root.querySelector('#members')?.classList.toggle('folded', this.folded.members);
    this.renderYou(state);
    this.renderMembers(state);
    this.renderLog(state);
    this.renderBottomBar(state);
    this.renderModal(state);
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
              <div class="ui-label">Day ${state.gameOver!.day}</div>
              <h1>${esc(state.identity?.name ?? 'The space')} is gone</h1>
            </div>
          </div>
          <p class="ui-desc" style="margin:0 0 16px">${esc(state.gameOver!.reason)}</p>
          <div class="over-stats">
            <div><b>${state.shippedCount}</b><span>shipped</span></div>
            <div><b>${state.reputation}</b><span>reputation</span></div>
            <div><b>${state.runtime.members.length}</b><span>on the books</span></div>
            <div><b>${state.ceremonies.reduce((n, c) => n + c.awards.filter((a) => a.playerWon).length, 0)}</b><span>awards</span></div>
          </div>
          ${
            best
              ? `<p class="ui-desc" style="margin:14px 0 0">The one people remember:
                 <b>${esc(best.name)}</b>, day ${best.day}.</p>`
              : `<p class="ui-desc" style="margin:14px 0 0">Nothing ever made it out of the door.</p>`
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
        ${saved ? this.resumeCard(saved) : ''}
        ${
          formOpen
            ? `<div class="start-card">
          <header class="start-brand">
            <span class="icon-chip start-badge" style="--tone:${badge.colour}">
              ${icon(badge.icon, 'ui-icon')}
            </span>
            <div class="start-brand__text">
              <label class="ui-label" for="space-name">Name your hackerspace</label>
              <div class="start-name">
                <input id="space-name" class="start-name__input" maxlength="28"
                  placeholder="Name it" autocomplete="off" spellcheck="false"
                  value="${esc(name)}" />
                <button class="ui-btn ui-btn--ghost start-name__shuffle" data-action="shuffle-name"
                  title="Suggest another name" aria-label="Suggest another name">
                  ${icon('shuffle')}<span>Shuffle</span>
                </button>
              </div>
            </div>
          </header>
          <p class="ui-desc start-intro">${esc(level.intro)}</p>

          <section class="start-section">
            <div class="ui-label">Badge</div>
            <div class="logo-grid" role="radiogroup" aria-label="Badge">
              ${LOGOS.map((logo, index) => {
                const on = index === this.start.logo;
                return `<button class="logo-pick ${on ? 'on' : ''}" role="radio"
                  aria-checked="${on}" aria-label="Badge ${index + 1}"
                  style="--tone:${logo.colour}" data-action="logo" data-value="${index}">
                  ${icon(logo.icon, 'ui-icon ui-icon--lg')}
                </button>`;
              }).join('')}
            </div>
          </section>

          <section class="start-section">
            <div class="ui-label">How hard should the others push?</div>
            <div class="ui-grid ui-grid--3" role="radiogroup" aria-label="Difficulty">
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
                    <div title="people on the books on day one">
                      <dt>${icon('users')}Crew</dt><dd>${level.startMembers}</dd>
                    </div>
                    <div title="how often somebody new gets in touch">
                      <dt>${icon('clock')}New face</dt><dd>${level.recruitEvery}d</dd>
                    </div>
                    <div title="opening cash">
                      <dt>${icon('coins')}Cash</dt><dd>${money(level.startCash)}</dd>
                    </div>
                  </dl>
                </button>`;
              }).join('')}
            </div>
            <p class="ui-desc start-note">
              Difficulty sets your crew and how fast it grows, plus how hard the other spaces
              push. Your hours, costs and pipeline are the same at every setting.
            </p>
          </section>

          <button id="start-go" class="ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
            data-action="begin" ${name.trim() ? '' : 'disabled'}>
            Open the doors<kbd class="start-kbd">Enter</kbd>
          </button>
          ${
            saved
              ? `<p class="start-foot">Your saved run stays put until the first day of this one ends.</p>`
              : ''
          }
        </div>`
            : `<button class="start-card start-new" data-action="new-open">
                <span class="icon-chip" style="--tone:var(--primary)">${icon('plus')}</span>
                <span class="start-new__text">
                  <span class="ui-title">Start a new hackerspace</span>
                  <span class="ui-desc">New name, new badge, new landlord.</span>
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
          <span>Throw this run away for good?</span>
          <button class="ui-btn ui-btn--ghost" data-action="discard-keep">Keep it</button>
          <button class="ui-btn ui-btn--danger" data-action="discard-save">${icon('x')}Discard</button>
        </div>`
      : `<div class="row" style="gap:8px">
          <button class="ui-btn ui-btn--primary ui-btn--lg" style="flex:1" data-action="continue">
            Carry on
          </button>
          <button class="ui-btn ui-btn--ghost ui-btn--lg" data-action="discard-ask"
            title="Throw the saved run away">
            ${icon('x')}Discard
          </button>
        </div>`;
    return `<div class="start-card resume">
      <header class="start-brand">
        <span class="icon-chip start-badge" style="--tone:${saved.colour}">
          ${icon(saved.icon as IconName, 'ui-icon')}
        </span>
        <div class="start-brand__text">
          <div class="ui-label">Where you left it</div>
          <h1>${esc(saved.name)}</h1>
        </div>
        <span class="ui-badge start-era">${icon('building')}${esc(saved.era)}</span>
      </header>
      <div class="resume-stats">
        <div><b>${saved.day}</b><span>day</span></div>
        <div><b>${saved.shipped}</b><span>shipped</span></div>
        <div><b>${saved.reputation}</b><span>reputation</span></div>
        <div><b>${money(saved.cash)}</b><span>cash</span></div>
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
       <span class="day">${dayName(state.day)} · day ${state.day}</span>
       <div class="speeds">
         ${speedButton(0, '❙❙')}
         ${TIME.speeds.map((s) => speedButton(s, `${s}×`)).join('')}
       </div>`,
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
        <div class="stat"><b style="font-size:12.5px">${esc(state.identity?.name ?? 'Your space')}</b>
          <span>${eraDef(state.era).name}</span></div>
      </div>
      <div class="sep"></div>
      <div class="stat"><b class="cash cash--${cashTone}">${money(state.cash)}</b><span>cash</span></div>
      ${(() => {
        const next = this.handlers.previewBill();
        const tone = next.net < 0 && state.cash + next.net < 0 ? 'bad' : next.net < 0 ? 'warn' : 'good';
        return `<div class="stat" title="Rent and power against everybody's dues">
          <b class="cash cash--${tone}">${next.net < 0 ? '−' : '+'}${money(Math.abs(next.net))}</b>
          <span>bill in ${next.dueInDays}d</span>
        </div>`;
      })()}
      <div class="stat"><b>${state.runtime.projects.length}</b><span>projects</span></div>
      <div class="stat" title="somebody can only be on one project at a time">
        <b>${allocation.used}/${allocation.total}</b><span>allocated</span>
      </div>
      <div class="stat"><b>${state.shippedCount}</b><span>shipped</span></div>
      <div class="stat" title="cumulative hype from everything you've shipped">
        <b>${state.reputation}${
          Number.isFinite(eraDef(state.era).repToAdvance)
            ? `<span class="muted" style="font-size:10px">/${eraDef(state.era).repToAdvance}</span>`
            : ''
        }</b>
        <span>reputation</span>
      </div>
      <div class="sep"></div>
      <button class="season" data-action="ranking-open"
        title="${season.year} · ${daysLeft} days to the awards in October">
        <span class="season-label">${season.year}</span>
        <span class="season-bar"><i style="width:${seasonPct.toFixed(1)}%"></i></span>
        <span class="season-left">${daysLeft}d</span>
      </button>
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
       <button class="bar-item ${this.openModal === 'people' ? 'active' : ''}" data-action="people-open"
         title="Who is here, and who you could take on">
         ${icon('users', 'ui-icon bar-icon')}
         <span class="bar-label">People</span>
         ${state.applicants.length ? `<i class="pip">${state.applicants.length}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'reddit' ? 'active' : ''}" data-action="reddit-open"
         title="Put something in front of an audience — attention falls on its own">
         ${icon('flame', 'ui-icon bar-icon')}
         <span class="bar-label">Reddit</span>
         ${state.hype >= 1 ? `<i class="pip">${Math.round(state.hype)}</i>` : ''}
       </button>`,
    );
  }

  // --- the Jobs wizard ------------------------------------------------------

  /** The awards night takes the screen until it is dismissed. */
  private renderCeremony(state: GameState): boolean {
    const ceremony = state.ceremony;
    if (!ceremony) return false;
    const won = ceremony.awards.filter((a) => a.playerWon).length;
    this.setHTML(
      this.modal,
      'modal',
      `<div class="modal-backdrop">
        <div class="modal ceremony modal--fit" data-action="noop">
          <header>
            <div class="modal-head">${icon('flame', 'ui-icon ui-icon--lg')}<b>Awards night · October ${ceremony.year}</b></div>
          </header>
          <div class="modal-body">
            <!-- A stage rather than a list. It is one of four set pieces in the run and the
                 only one that is purely a reward, so it gets curtains and a trophy table. -->
            <div class="stage">
              <div class="stage-curtain stage-curtain--left"></div>
              <div class="stage-curtain stage-curtain--right"></div>
              <div class="stage-floor">
                ${ceremony.awards
                  .map(
                    (award) => `<div class="trophy ${award.playerWon ? 'trophy--ours' : ''}"
                      title="${esc(award.blurb)} — ${esc(award.value)}">
                      <span class="trophy-cup">${icon('trophy', 'ui-icon')}</span>
                      <span class="trophy-award">${esc(award.category)}</span>
                      <span class="trophy-winner">${esc(award.winnerName)}</span>
                      <span class="trophy-value">${esc(award.value)}</span>
                    </div>`,
                  )
                  .join('')}
              </div>
            </div>
            <p class="ui-desc" style="margin:14px 0 0;text-align:center">
              ${
                won
                  ? `You took <b>${won}</b> of ${ceremony.awards.length}${ceremony.reputationGained ? `, and ${ceremony.reputationGained} reputation with them` : ''}.`
                  : `Nothing for us this year. Somebody else had a better one.`
              }
            </p>
          </div>
          <footer>
            <button class="ui-btn ui-btn--primary ui-btn--block" data-action="ceremony-close">
              Back to work
            </button>
          </footer>
        </div>
      </div>`,
    );
    return true;
  }

  // --- ranking --------------------------------------------------------------

  /**
   * A table, not a list of cards. The whole point of this panel is comparison, and cards
   * with wrapping badges give you nothing to read down. Every column is sortable, and the
   * four that decide an award are marked, because "who is going to beat me to Deepest
   * Pockets" is the actual question being asked here.
   */
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
        label: 'Ships',
        title: 'Shipped this year',
        award: 'Most Projects',
        value: (r) => r.projectsThisYear,
        format: (r) => String(r.projectsThisYear),
      },
      {
        key: 'projects',
        label: 'All',
        title: 'Shipped all time',
        value: (r) => r.projects,
        format: (r) => String(r.projects),
      },
      {
        key: 'members',
        label: 'Crew',
        title: 'People',
        award: 'Biggest Crew',
        value: (r) => r.members,
        format: (r) => String(r.members),
      },
      {
        key: 'cash',
        label: 'Cash',
        title: 'Balance',
        award: 'Deepest Pockets',
        value: (r) => r.cash,
        format: (r) => compactMoney(r.cash),
      },
      {
        key: 'reputationThisYear',
        label: 'Rep yr',
        title: 'Reputation earned this year',
        award: 'Space of the Year',
        value: (r) => r.reputationThisYear,
        format: (r) => r.reputationThisYear.toLocaleString('tr-TR'),
      },
      {
        key: 'reputation',
        label: 'Rep',
        title: 'Reputation all time',
        value: (r) => r.reputation,
        format: (r) => r.reputation.toLocaleString('tr-TR'),
      },
    ];

    const active = columns.find((c) => c.key === this.rankSort.key) ?? columns[5];
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
          title="${column.title}${column.award ? ` — decides ${column.award}` : ''}">
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
        const blurb = row.isPlayer ? 'Your space' : RIVAL_MAP[row.id]?.blurb ?? '';
        return `<tr class="${row.isPlayer ? 'me' : ''}" title="${esc(blurb)}">
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
      head: `<div class="modal-head">${icon('flame', 'ui-icon ui-icon--lg')}<b>The other spaces</b>
        <span class="ui-badge">${season.year}</span>
        <span class="ui-badge${daysLeft <= 10 ? ' ui-badge--accent' : ''}">${daysLeft}d to the awards</span>
      </div>`,
      content:
        `<div class="ui-segmented" style="margin-bottom:11px">
          <button data-action="rank-view" data-value="table"
            aria-pressed="${this.rankTab === 'table'}">Standings</button>
          <button data-action="rank-view" data-value="trophies"
            aria-pressed="${this.rankTab === 'trophies'}" ${state.ceremonies.length ? '' : 'disabled'}>
            Trophy room<span class="seg-count">${state.ceremonies.reduce(
              (n, c) => n + c.awards.filter((a) => a.playerWon).length,
              0,
            )}</span>
          </button>
        </div>` +
        (this.rankTab === 'trophies'
          ? this.trophyRoom(state)
          : `<table class="rank-table">
              <thead><tr><th></th><th class="space-head">Space</th>${head}</tr></thead>
              <tbody>${body}</tbody>
            </table>`),
      foot: `<span class="ui-desc" style="font-size:10.5px">
        <b class="award-key">◆</b> decides an award, judged on the year just gone — so a quiet year
        costs you even while you are ahead overall.
      </span>`,
    };
  }

  /**
   * The shelf. Every awards night you have sat through, newest first, with the ones you won
   * lit and the rest in the dark beside them — because "we came second to Dallas three years
   * running" is part of the story too, and a trophy room with only wins in it is a brag
   * rather than a record.
   */
  private trophyRoom(state: GameState): string {
    if (!state.ceremonies.length) {
      return `<p class="ui-desc">No awards night yet. The first is in October.</p>`;
    }
    return [...state.ceremonies]
      .reverse()
      .map((ceremony) => {
        const won = ceremony.awards.filter((a) => a.playerWon).length;
        return `<div class="trophy-year">
          <div class="ui-label">
            October ${ceremony.year} · ${won ? `${won} of ${ceremony.awards.length}` : 'nothing'}
          </div>
          <div class="trophy-shelf">
            ${ceremony.awards
              .map(
                (award) => `<div class="trophy ${award.playerWon ? 'trophy--ours' : ''}"
                  title="${esc(award.blurb)} — ${esc(award.value)}">
                  <span class="trophy-cup">${icon('trophy', 'ui-icon')}</span>
                  <span class="trophy-award">${esc(award.category)}</span>
                  <span class="trophy-winner">${esc(award.winnerName)}</span>
                </div>`,
              )
              .join('')}
          </div>
        </div>`;
      })
      .join('');
  }

  /** The monthly books, as an event you have to look at. */
  private renderBill(state: GameState): boolean {
    const bill = state.bill;
    if (!bill) return false;
    const line = (l: { label: string; detail: string; amount: number }) => `
      <div class="bill-line">
        <span class="bill-label">${l.label}<i>${esc(l.detail)}</i></span>
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
              <b>The books · month ${bill.month}</b>
              ${
                bill.shortfall
                  ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--destructive)">short ${money(bill.shortfall)}</span>`
                  : `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)">settled</span>`
              }
            </div>
          </header>
          <div class="modal-body">
            ${bill.income.map(line).join('')}
            ${bill.costs.map(line).join('')}
            <div class="bill-line bill-total">
              <span class="bill-label">On the month</span>
              <span class="mono bill-amount ${bill.total < 0 ? 'out' : 'in'}">
                ${bill.total < 0 ? '−' : '+'}${money(Math.abs(bill.total))}
              </span>
            </div>
            <div class="bill-line">
              <span class="bill-label">Balance</span>
              <span class="mono bill-amount">${money(bill.balanceBefore)} → ${money(bill.balanceAfter)}</span>
            </div>
            ${
              bill.shortfall
                ? `<p class="defect" style="margin-top:12px">
                     ${icon('clock')} You could not cover it. Miss the next one and the lease is gone —
                     let somebody go, or ship something that pays.
                   </p>`
                : ''
            }
          </div>
          <footer>
            <button class="ui-btn ui-btn--primary ui-btn--block" data-action="bill-close">
              ${bill.shortfall ? 'Sort it out' : 'Back to work'}
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
                : this.jobsBody(state);
    this.setHTML(
      this.modal,
      'modal',
      `<div class="modal-backdrop" data-action="jobs-close">
        <div class="modal ${
          this.openModal === 'machines' || this.openModal === 'projects' || this.openModal === 'people'
            ? 'modal--fit'
            : ''
        } ${this.openModal === 'projects' || this.openModal === 'people' ? 'modal--wide' : ''}"
          data-action="noop">
          <header>
            ${body.head}
            <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="jobs-close">
              ${icon('x')}Close
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
        label: 'The space',
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
            title="${postedToday(x.id) ? 'Already posted today' : `${pct(x.sub.merit)} of a claim`}">
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
            <span class="ui-badge" title="how much this room cares">
              ${icon('flame')}${pct(tasteMatch(chosen.sub.tags, room))}
            </span>
            ${bad ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--destructive)">they turn</span>` : ''}
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
                  day ${post.day} · ${esc(post.comment)}</span>
              </span>
            </div>`,
          )
          .join('')
      : `<p class="ui-desc">Nothing posted yet.</p>`;

    return {
      head: `<div class="modal-head">${icon('flame', 'ui-icon ui-icon--lg')}<b>Reddit</b>
        <span class="ui-badge ui-badge--tone" style="--tone:var(--primary)"
          title="attention right now — it falls every day on its own">
          ${Math.round(state.hype)} hype
        </span></div>`,
      content: `
        <div class="ui-label" style="margin-bottom:9px">What are you posting about</div>
        ${subjectChips}
        <div class="ui-label" style="margin-bottom:9px">How loudly</div>
        ${claimChips}
        <div class="ui-label" style="margin-bottom:9px">
          ${blocked ? 'Already posted today — pick something else' : 'Pick a room and it goes up'}
        </div>
        ${rooms}
        <hr class="ui-sep" />
        <div class="ui-label" style="margin-bottom:9px">What came back</div>
        ${feed}
      `,
      foot: `<span class="ui-desc" style="font-size:10.5px">
          One post per thing per day, ${hours(VERB_HOURS.post)} of yours each — and attention
          falls every day whether you post or not.
        </span>`,
    };
  }

  // --- People: who is here, and who could be ------------------------------

  /**
   * The roster as a table, for the same reason as the projects one: you read down the Doing
   * column to find the hours going nowhere. Somebody unallocated still pays dues and still
   * turns up, so a free member is the row you came here to act on — called out in warning
   * tone and sorted to the top, with applicants in the same table as another state rather
   * than in a section below the fold.
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
          ? traits.map((t) => `<span title="${TRAIT_BLURB[t]}">${TRAIT_LABEL[t]}</span>`).join(', ')
          : '—'
      }</td>`;
    };

    const memberRow = (m: MemberSnapshot) => {
      const project = m.team ? state.runtime.projects.find((x) => x.id === m.team) : null;
      return `<tr>
        ${nameCell(m.id, m.name)}
        <td class="note ${project ? '' : 'warn'}">
          ${project ? esc(project.name) : 'nothing allocated'}
        </td>
        <td class="num">${m.employment === 'full-time' ? 'Full-time' : `Part-time · ${m.shift}s`}</td>
        <td class="num">${m.present ? 'in today' : 'away'}</td>
        ${(() => {
          // One button that cycles: none → the three jobs → none. A select is heavier than
          // the decision deserves, and the roles are few enough to walk through.
          const order: (Role | null)[] = [null, 'manager', 'printer', 'quartermaster'];
          const next = order[(order.indexOf(m.role) + 1) % order.length];
          return `<td class="num">
            <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="set-role"
              data-id="${m.id}" data-value="${next ?? ''}"
              title="${m.role ? ROLE_BLURB[m.role] : 'No standing job — click to give them one'}">
              ${m.role ? ROLE_LABEL[m.role] : '—'}
            </button>
          </td>`;
        })()}
        ${skillCell(m.id)}
        ${traitCell(m.id)}
        <td class="num">
          <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="let-go" data-id="${m.id}"
            title="Ask ${esc(m.name)} to leave — the space loses ${money(ECONOMY.crewDues)} a month in dues">
            ${icon('x')}
          </button>
        </td>
      </tr>`;
    };

    const applicantRow = (id: string) => {
      const data = MEMBER_DATA[id];
      if (!data) return '';
      const canFull = this.handlers.canHireFullTime(id);
      const offer = (employment: Employment, label: string) => {
        const cost = this.handlers.hireCost(id, employment);
        const ok = this.affordable(state, cost) && hoursLeft >= VERB_HOURS.hire;
        return `<button class="ui-btn ${employment === 'full-time' ? 'ui-btn--primary' : 'ui-btn--outline'} ui-btn--sm"
          data-action="hire" data-id="${id}" data-value="${employment}" ${ok ? '' : 'disabled'}
          title="${weeklyHoursFor(employment)}h a week · pays ${money(ECONOMY.crewDues)} a month in dues">
          ${label}</button>`;
      };
      return `<tr>
        ${nameCell(id, data.name)}
        <td class="note">interested</td>
        <td class="num">${canFull ? 'either' : 'part-time only'}</td>
        <td class="num">~${data.commitment}h/wk</td>
        <td class="num">—</td>
        ${skillCell(id)}
        ${traitCell(id)}
        <td class="num">
          <span class="row" style="gap:5px;justify-content:flex-end">
            ${canFull ? offer('full-time', `Full-time · ${money(this.handlers.hireCost(id, 'full-time'))}`) : ''}
            ${offer('part-time', `Part-time · ${money(this.handlers.hireCost(id, 'part-time'))}`)}
          </span>
        </td>
      </tr>`;
    };

    const free = members.filter((m) => !m.team);
    const busy = members.filter((m) => m.team);
    const open = state.applicants;

    const filters = [
      { key: 'all' as const, label: 'All', count: members.length + open.length },
      { key: 'free' as const, label: 'Free', count: free.length },
      { key: 'on' as const, label: 'On a project', count: busy.length },
      { key: 'open' as const, label: 'Interested', count: open.length },
    ];
    const chips = `<div class="ui-segmented" style="margin-bottom:11px">
      ${filters
        .map(
          (f) => `<button data-action="people-tab" data-value="${f.key}"
            aria-pressed="${f.key === this.peopleTab}" ${f.count ? '' : 'disabled'}>
            ${f.label}<span class="seg-count">${f.count}</span>
          </button>`,
        )
        .join('')}
    </div>`;

    const rows =
      this.peopleTab === 'free'
        ? free.map(memberRow)
        : this.peopleTab === 'on'
          ? busy.map(memberRow)
          : this.peopleTab === 'open'
            ? open.map(applicantRow)
            : [...free.map(memberRow), ...busy.map(memberRow), ...open.map(applicantRow)];

    const next = APPLICANTS.filter(
      (a) => !members.some((m) => m.id === a.id) && !open.includes(a.id),
    ).sort((a, b) => (a.repRequired ?? 0) - (b.repRequired ?? 0))[0];

    return {
      head: `<div class="modal-head">${icon('users', 'ui-icon ui-icon--lg')}<b>People</b></div>`,
      content:
        chips +
        (rows.length
          ? `<table class="rank-table">
              <thead><tr>
                <th class="space-head">Person</th><th>Doing</th><th>Contract</th><th>Today</th>
                <th>Standing job</th><th>Good at</th><th>Trait</th><th></th>
              </tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table>`
          : `<p class="ui-desc">Nobody here. Ship something and word gets around.</p>`),
      foot: `<span class="ui-desc" style="font-size:10.5px">
          ${
            free.length
              ? `<b>${free.length}</b> with nothing to do · `
              : members.length
                ? 'Everybody is on something · '
                : ''
          }taking somebody on is a one-off joining fee; they then pay the space
          ${money(ECONOMY.crewDues)} a month like everybody else — dues are
          ${money(members.length * ECONOMY.crewDues)} a month ·
          ${
            next
              ? `${
                  state.runtime.recruitIn > 0
                    ? `somebody gets in touch in <b>${state.runtime.recruitIn}d</b>`
                    : 'word is out — waiting on reputation'
                }, next along <b>${next.name}</b> at ${next.repRequired} reputation.`
              : 'everybody in town knows about you now.'
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
          ${filter.short}<span class="seg-count">${count}</span>
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
                <span class="ui-label">${group.label}</span>
                <span class="ui-desc" style="font-size:10.5px">${group.hint}</span>
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
    const active = new Set(state.runtime.projects.map((p) => p.defId));
    return catalogForEra(state.era).filter(
      (def) => canBuild(def, state.ownedMachines) && !active.has(def.id),
    );
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
          ${badge?.label ? `<span class="ui-badge ui-badge--accent">${badge.label}</span>` : ''}
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
        ${missing.length ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning);margin-top:6px">needs ${missing.join(', ')}</span>` : ''}
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
        <p class="empty">Nothing on the bench.</p>
        <p class="blurb">Open <b>Jobs</b> at the bottom of the screen and pitch something.</p>
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
      const label = stageLabel(project.category, key).toLowerCase();
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
      statusLine = `${madeParts}/${project.parts.length} parts`;
    } else if (waitingParts) {
      statusLine = `waiting on parts`;
    } else if (project.required[project.stage] > 0) {
      statusLine = `${Math.floor(project.progress[project.stage])}/${project.required[project.stage]}`;
    } else {
      statusLine = 'resolving';
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
        <span class="section" style="margin:0">Team ${project.team.length}/${project.teamSize}</span>
        ${playerOn ? `<span class="chip you-chip">you</span>` : ''}
      </div>
      <div class="row wrap" style="gap:4px">
        ${
          team.length
            ? team
                .map(
                  (m) => `<span class="person ${m.present ? '' : 'off'}" title="${m.present ? esc(m.note) : 'not in today'}">
                    ${m.name}
                    <button class="x" data-action="release" data-id="${project.id}" data-id2="${m.id}" title="take off the team">×</button>
                  </span>`,
                )
                .join('')
            : `<span class="muted" style="font-size:11px">nobody allocated</span>`
        }
      </div>
      ${
        room > 0 && free.length
          ? `<div class="candidates">
              <span class="muted" style="font-size:10px">ask ${room === 1 ? 'one more' : `up to ${room}`}:</span>
              ${free
                .slice(0, 6)
                .map((m) => {
                  const match = m.affinity[project.id] ?? 0;
                  const tone = match >= 0.6 ? 'keen' : match >= 0.3 ? '' : 'cold';
                  return `<button class="person ask ${tone}" data-action="invite" data-id="${project.id}" data-id2="${m.id}"
                            title="passion match ${pct(match)}${m.present ? '' : ' · not in today'}">
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
        <span>Parts not ordered · ${project.leadDays}d lead</span>
        <button class="tiny" data-action="order" data-id="${project.id}" ${affordable ? '' : 'disabled'}>
          Order ${money(project.bomCost)}
        </button>
      </div>`;
    } else if (waiting > 0) {
      const cost = this.handlers.expediteCost(project.id);
      sourcing = `<div class="sourcing ${project.stage === 'assembly' ? 'urgent' : ''}">
        <span>Parts arrive in ${(waiting / 24).toFixed(1)}d</span>
        <button class="tiny" data-action="expedite" data-id="${project.id}" ${this.affordable(state, cost) ? '' : 'disabled'}>
          Expedite ${money(cost)}
        </button>
      </div>`;
    }

    // --- your involvement ---------------------------------------------------
    const handStage = stageDef.skill !== null || project.required[project.stage] > 0;
    const blockedAssembly = project.stage === 'assembly' && waiting > 0;
    let workButton = '';
    if (playerOn) {
      workButton = `<button class="ui-btn ui-btn--sm" data-action="stop-work">Stop working</button>`;
    } else if (handStage && !blockedAssembly && project.required[project.stage] > 0) {
      workButton = `<button class="ui-btn ui-btn--primary ui-btn--sm" data-action="work"
        data-id="${project.id}" title="Put your own hours on ${stageName}">
        Work on this
      </button>`;
    }

    const bountyCost = this.handlers.bountyCost(project.id);
    const canBounty = project.required[project.stage] > 0 && !project.bounties.includes(project.stage);
    const hoursLeft = player?.hoursLeft ?? 0;
    const afford = (verb: string) => hoursLeft >= (VERB_HOURS[verb] ?? 0);

    const parts = project.parts.length
      ? `<div class="parts">
          <div class="row between" style="margin-bottom:6px">
            <span class="section">Parts</span>
            ${(() => {
              const pending = project.parts.filter((x) => x.status === 'pending').length;
              const printing = project.parts.some((x) => x.status === 'queued');
              if (pending) {
                return `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="queue-all"
                  data-id="${project.id}">Queue ${pending}</button>`;
              }
              return `<span class="ui-badge">${printing ? 'on the printer' : 'all printed'}</span>`;
            })()}
          </div>
          ${project.parts
            .map(
              (p) => `<div class="part ${p.status}">
                <span class="pname">${esc(p.name)}</span>
                ${p.attempts > 0 ? `<span class="tag" title="failed attempts">×${p.attempts}</span>` : ''}
                <span class="tag">${p.status === 'done' ? 'done' : p.status === 'queued' ? 'queued' : hours(p.hours)}</span>
                ${p.status === 'pending' ? `<button class="tiny" data-action="queue-part" data-id="${project.id}" data-id2="${p.id}">queue</button>` : ''}
              </div>`,
            )
            .join('')}
        </div>`
      : '';

    // What is actually holding this one up, in a few words. It is the only thing a folded
    // card needs to say beyond its name and its bar.
    const shelving = project.idleDays >= SHELVE.warnAfterIdleDays;
    const stop = shelving
      ? { text: `shelved in ${SHELVE.afterIdleDays - project.idleDays}d`, tone: 'bad' }
      : blockedAssembly
        ? { text: project.partsOrdered ? `parts in ${(waiting / 24).toFixed(1)}d` : 'parts not ordered', tone: 'warn' }
        : !project.team.length && !playerOn
          ? { text: 'nobody on it', tone: 'warn' }
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
                  ? `you + ${project.team.length}`
                  : playerOn
                    ? 'you'
                    : `${project.team.length} on it`
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
        <span class="ui-badge" title="build quality — it gates what you can claim on Reddit">
          ${icon('effort')}quality ${pct(project.quality)}
        </span>
        ${
          project.hypeMultiplier > 1
            ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${icon('flame')}×${project.hypeMultiplier}</span>`
            : ''
        }
        ${
          project.sponsorCash
            ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)">${icon('coins')}sponsored</span>`
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
          Re-pitch ${VERB_HOURS.repitch}h
        </button>
        <button class="ui-btn ui-btn--outline ui-btn--sm" data-action="bounty" data-id="${project.id}"
          ${canBounty && this.affordable(state, bountyCost) && afford('bounty') ? '' : 'disabled'}>
          Bounty ${money(bountyCost)}
        </button>
        ${project.stage === 'simulation' ? `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="skip-sim" data-id="${project.id}">Skip sim</button>` : ''}
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

  private renderYou(state: GameState) {
    const p: PlayerSnapshot | null = state.runtime.player;
    if (!p) {
      this.you.innerHTML = '';
      return;
    }
    const task = p.project ? state.runtime.projects.find((x) => x.id === p.project) : null;
    const hoursTone = p.hoursLeft <= 1 ? 'bad' : p.hoursLeft <= 2.5 ? 'warn' : '';
    const energyTone = p.burntOut ? 'bad' : p.energy < 55 ? 'warn' : 'good';
    return void this.setHTML(this.you, 'you', `
      <div class="row between" style="margin-bottom:6px">
        <span class="mono" style="font-size:13px">${p.hoursLeft.toFixed(1)}h left</span>
        <span class="muted" style="font-size:10.5px">of ${p.hoursToday.toFixed(1)}h</span>
      </div>
      ${bar(p.hoursLeft, p.hoursToday, hoursTone)}
      <div class="meters" style="margin:7px 0 0 0">
        <div class="meter"><label>energy</label>${bar(p.energy, 100, energyTone)}</div>
      </div>
      <div class="verbs" style="margin-top:7px">
        ${p.project || p.activity === 'babysitting' ? `<button class="tiny" data-action="stop-work">Stop</button>` : ''}
        <button class="tiny" data-action="calibrate">Calibrate</button>
      </div>
      <div class="note" style="margin:6px 0 0 0" title="${esc(p.note || 'idle')}">${
        task && p.stage
          ? `${esc(task.name)} · ${stageLabel(task.category, p.stage).toLowerCase()}`
          : esc(p.note || 'idle')
      }</div>
      ${p.burntOut ? `<p class="defect" style="margin-top:6px">⚠ Running on fumes — tomorrow will be shorter.</p>` : ''}
    `);
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
        return `<div class="member ${m.present ? '' : 'away'}">
          <div class="head">
            <i class="swatch" style="background:${color}"></i>
            <span class="mname">${m.name}</span>
            <span class="state">${ACTIVITY_LABEL[m.activity]}</span>
          </div>
          <div class="note">${
            m.team
              ? `<b class="on-team">${esc(state.runtime.projects.find((p) => p.id === m.team)?.name ?? '—')}</b> · ${esc(m.note || '')}`
              : esc(m.note || 'unallocated')
          }</div>
          <div class="meters">
            <div class="meter"><label>interest</label>${bar(m.interest, 1.2, interestTone)}</div>
            <div class="meter"><label>energy</label>${bar(m.energy, 100, energyTone)}</div>
            <div class="meter"><label>commit</label><span class="mono">${data?.commitment ?? '?'} h/wk</span></div>
          </div>
          <div class="traits">
            ${topCategories(data?.passions ?? {})
              .map(({ category, score }) => {
                const profile = profileOf(category);
                return `<span class="ui-badge ui-badge--tone" style="--tone:${profile.accent}"
                  title="${profile.label}: ${pct(score)} passion match">
                  ${icon(CATEGORY_ICON[category])}${pct(score)}</span>`;
              })
              .join('')}
            ${(data?.traits ?? []).map((t) => `<span class="trait" title="${TRAIT_BLURB[t]}">${TRAIT_LABEL[t]}</span>`).join('')}
          </div>
        </div>`;
      })
      .join(''));
  }

  // --- machines -------------------------------------------------------------

  /** The shop floor: every machine, what it is chewing on, and what is behind it. */
  private machinesBody(state: GameState): { head: string; content: string; foot: string } {
    const machines = state.runtime.machines;
    const running = machines.filter((m) => m.current).length;
    const queued = machines.reduce((n, m) => n + m.queue.length, 0);
    const forSale = this.handlers.buyablePrinters();
    const shop = forSale.length
      ? `<hr class="ui-sep" />
         <div class="ui-label" style="margin-bottom:9px">Buy a printer</div>
         <div class="ui-grid ui-grid--3">
           ${forSale
             .map((model) => {
               const locked = model.era > state.era;
               const afford = !locked && this.affordable(state, model.price);
               return `<button class="ui-option" data-action="buy-printer" data-value="${model.id}"
                 ${afford ? '' : 'disabled'} style="--tone:var(--primary)"
                 title="${locked ? `Nobody ships one of these to ${eraDef(state.era).name}` : ''}">
                 <div class="ui-option__head">
                   <span class="icon-chip">${icon('printer', 'ui-icon ui-icon--lg')}</span>
                   <span class="ui-title">${esc(model.name)}</span>
                 </div>
                 <span class="ui-option__desc ui-clamp-3">${esc(model.blurb)}</span>
                 <span class="ui-row__meta" style="margin:0">
                   <span class="ui-badge" title="how fast it prints">
                     ${icon('effort')}${Math.round(model.speed * 100)}%
                   </span>
                   <span class="ui-badge" title="how much filament it holds">
                     ${icon('package')}${model.capacity / 1000}kg
                   </span>
                   ${
                     locked
                       ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">
                            ${icon('clock')}era ${model.era}
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
        : `<p class="ui-desc">Nothing on the floor yet.</p>`) + shop;
    return {
      head: `<div class="modal-head">${icon('printer', 'ui-icon ui-icon--lg')}<b>The shop floor</b>
        <span class="ui-badge${running ? ' ui-badge--accent' : ''}">${running} running</span>
        <span class="ui-badge">${queued} queued</span>
      </div>`,
      content,
      foot: `<span class="ui-desc" style="font-size:10.5px">
        Jobs run on the clock, not on attendance — a 22-hour print carries on through an empty
        space — and a part goes to whichever printer has the shortest queue.
      </span>`,
    };
  }

  private machineCard(machine: MachineSnapshot, state: GameState): string {
    const projectName = (id: string) => state.runtime.projects.find((p) => p.id === id)?.name ?? '';
    const job = machine.current;
    const calLow = machine.calibration < MACHINE.calibrationWarning;
    const filamentLow = machine.consumableMax > 0 && machine.consumable < FILAMENT.lowWarning;
    const riskTone = machine.risk > 0.35 ? 'var(--destructive)' : machine.risk > 0.2 ? 'var(--warning)' : 'var(--muted-foreground)';

    const status = job
      ? `<span class="ui-badge ui-badge--accent">${icon('printer')}running</span>`
      : machine.queue.length
        ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${icon('clock')}waiting</span>`
        : `<span class="ui-badge">idle</span>`;

    const left = job
      ? `<div class="row between" style="gap:8px;margin-bottom:5px">
           <span class="ui-title" style="font-size:12.5px">${esc(job.partName)}</span>
           <span class="mono" style="font-size:10.5px;color:var(--muted-foreground)">
             ${job.progress.toFixed(1)}/${job.hoursRequired}h
           </span>
         </div>
         <p class="ui-desc" style="margin:0 0 7px;font-size:10.5px">${esc(projectName(job.projectId))}</p>
         <div class="bar"><i style="width:${((job.progress / job.hoursRequired) * 100).toFixed(1)}%"></i></div>
         <div class="row between" style="margin-top:7px">
           <span class="ui-desc" style="font-size:10.5px">failure risk</span>
           <span class="mono" style="font-size:11px;color:${riskTone}">${pct(machine.risk)}</span>
         </div>`
      : `<p class="ui-desc" style="margin:0">Nothing on it. ${
          machine.queue.length ? 'The queue starts as soon as it can.' : 'Queue a part from a project.'
        }</p>`;

    const meters = `
      <div class="meter"><label>calibration</label>${bar(machine.calibration, 1, calLow ? 'bad' : machine.calibration < 0.75 ? 'warn' : 'good')}</div>
      ${
        machine.consumableMax > 0
          ? `<div class="meter"><label>filament</label>${bar(machine.consumable, machine.consumableMax, filamentLow ? 'warn' : '')}
               <span class="mono" style="font-size:10px;color:var(--subtle-foreground)">${Math.round(machine.consumable)}g</span>
             </div>`
          : ''
      }`;

    const refill = machine.consumableMax > 0 ? this.handlers.refillCost(machine.id) : 0;
    const actions = refill
      ? `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="filament" data-id="${machine.id}"
           ${this.affordable(state, refill) ? '' : 'disabled'}>
           ${icon('package')}Fill up · ${money(refill)} · ${VERB_HOURS.filament}h
         </button>`
      : '';

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
      : `<p class="ui-desc" style="margin:0;font-size:10.5px">Queue empty.</p>`;

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
          <div class="ui-label" style="margin:0 0 7px">Now</div>
          ${left}
        </div>
        <div class="machine-card__col">
          <div class="ui-label" style="margin:0 0 7px">Condition</div>
          <div class="meters">${meters}</div>
          ${actions ? `<div style="margin-top:9px">${actions}</div>` : ''}
        </div>
      </div>
      <div class="machine-card__queue">
        <div class="ui-label" style="margin:0 0 6px">Queue · ${machine.queue.length}</div>
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
        return { text: `shelved in ${left}d`, tone: 'bad' as const };
      }
      if (project.stage === 'assembly' && partsPending(project, nowHours)) {
        // The bought bill of materials is what gates assembly (§4), not the printed parts.
        if (!project.partsOrdered) {
          return { text: `parts not ordered · ${money(project.bomCost)}`, tone: 'bad' as const };
        }
        return {
          text: `parts in ${Math.ceil(partsEta(project, nowHours) / 24)}d`,
          tone: 'warn' as const,
        };
      }
      const unprinted = project.parts.filter((part) => part.status !== 'done').length;
      if (project.stage === 'assembly' && unprinted) {
        return { text: `${unprinted} still to print`, tone: 'warn' as const };
      }
      if (!crew) return { text: 'nobody on it', tone: 'warn' as const };
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
      if (mine(project)) crew.unshift('you');
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
        <td class="num">shipped d${record.day}</td>
        ${barCell(1, 'good')}
        <td class="note">${record.hype} rep · ${pct(record.quality)}</td>
        <td class="num wide">${record.days}d</td>
        ${(() => {
          const net = record.payout - record.spent;
          return `<td class="note ${net >= 0 ? '' : 'bad'}"
            style="${net > 0 ? 'color:var(--success)' : ''}"
            title="${money(record.payout)} in, ${money(record.spent)} on parts and bounties">
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
      { key: 'all' as const, label: 'All', count: active.length + done.length },
      { key: 'on' as const, label: 'In progress', count: active.length },
      { key: 'done' as const, label: 'Done', count: done.length },
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
      head: `<div class="modal-head">${icon('clipboard', 'ui-icon ui-icon--lg')}<b>Projects</b></div>`,
      content:
        chips +
        (rows.length
          ? `<table class="rank-table">
              <thead><tr>
                <th class="space-head">Project</th><th>Stage</th><th>Progress</th>
                <th>Needs</th><th>Crew</th><th>Net</th>
              </tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table>`
          : `<p class="ui-desc">Nothing here yet. Open <b>Jobs</b> and pitch something.</p>`),
      foot: `<span class="ui-desc" style="font-size:10.5px">
          ${
            blocked
              ? `<b>${blocked}</b> of these need something from you · `
              : active.length
                ? 'Nothing is blocked · '
                : ''
          }${done.length} shipped for ${money(earned)} · anything nobody touches for
          ${SHELVE.afterIdleDays} days ends up on the shelf.
        </span>`,
    };
  }

  private renderLog(state: GameState) {
    this.setHTML(this.log, 'log', state.log
      .map(
        (entry) =>
          `<div class="entry ${entry.kind}"><time>d${entry.day} ${clock(entry.time)}</time><span>${esc(entry.text)}${
            entry.repeats ? ` <i class="repeats">×${entry.repeats}</i>` : ''
          }</span></div>`,
      )
      .join(''));
  }
}

