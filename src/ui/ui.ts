import type { GameState } from '@/game/store';
import type {
  BacklogEntry,
  ProjectCategory,
  ScoreRow,
  MemberSnapshot,
  MachineSnapshot,
  ProjectData,
  ProjectDef,
  ClaimKey,
  ShippedRecord,
  SkillKey,
  DesignAxisId,
  StageKey,
  Identity,
  DesignChoice,
  MachineType,
  ProjectPlan,
} from '@/game/types';
import type { Ceremony, CeremonyAward, YearStanding } from '@/systems/RivalSystem';
import { ROLE_BLURB, ROLE_LABEL, SPACE_SUBJECT, type Role } from '@/game/types';
import { CATALOG_MAP, catalogForEra, missingMachines } from '@/utils/catalog';
import {
  CATEGORY_ORDER,
  categoryAffinity,
  profileOf,
  stageLabel,
  stageSkill,
  topCategories,
} from '@/utils/categories';
import {
  APPLICANTS,
  FILAMENT,
  MACHINE,
  PLAYER,
  REPEAT,
  ROSTER,
  STAGE_MAP,
  STAGE_ORDER,
  TIME,
  TRAIT_BLURB,
  TRAIN,
  TRAIT_LABEL,
  VERB_HOURS,
  eraDef,
  type EraDef,
  WEEKLY_HOURS,
} from '@/utils/constants';
import { TOUR, hasToured, rememberToured } from './tour';
import { awardsDay, clock, dayName, hours, money, pct, shortDate } from '@/utils/format';
import { LOCALES, getLocale, num, say, t, type Locale, type MessageKey, type Text } from '@/i18n';
import {
  AMENITIES,
  comfortsOf,
  effectLines,
  type AmenityDef,
} from '@/utils/amenities';
import { CLAIMS, SUBREDDITS, SUBREDDIT_MAP, tasteMatch } from '@/utils/subreddits';
import { merit, projectSubject, react, type Subject } from '@/systems/HypeSystem';
import { PRINTERS, type PrinterModel } from '@/utils/printers';
import {
  AXES,
  CATEGORY_AXES,
  SEAT_OPTIONS,
  defaultDesign,
  optionOf,
  planProject,
  optionAvailable,
  genreStars,
  designStars,
  licenceCost,
  type Licences,
  optionCost,
  optionNeeds,
  crewBest,
  qualityHype,
  qualityPay,
  qualityStars,
  teamFit,
  type DesignOption,
} from '@/utils/design';
import { demandLabel } from '@/utils/market';
import { FURNITURE, FURNITURE_MAP, furnitureSeats, type FurnitureDef } from '@/utils/furniture';
import { CATEGORY_ICON, icon, type IconName } from './icons';
import { AWARDS, LOGOS, NAME_SUGGESTIONS, RIVAL_MAP } from '@/utils/rivals';
import { DIFFICULTIES, type DifficultyKey } from '@/utils/difficulty';
import { ECONOMY } from '@/utils/economy';
import { MACHINE_LABEL, STATION_MAP } from '@/machines/layout';
import { partsEta, partsPending, projectProgress } from '@/systems/ProjectSystem';
import { SHELVE } from '@/utils/constants';

export interface UIHandlers {
  setSpeed(speed: number): void;
  pitch(defId: string, offerId: string | undefined, team: string[], plan: ProjectPlan): void;
  buyFurniture(id: string): void;
  train(memberId: string, skill: SkillKey): void;
  resaleOf(id: string): { value: number; reason: MessageKey | null };
  sellPiece(id: string): void;
  trainCost(memberId: string, skill: SkillKey): number;
  /** Could a piece of furniture go anywhere on the floor right now? */
  furnitureFits(type: MachineType, span: number): boolean;
  /** A rendered picture of a buyable thing, or null where there is no renderer. */
  thumbnail(key: string): string | null;
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
  hire(memberId: string): void;
  passApplicant(memberId: string): void;
  /** Turn an applicant down. (Declared to match the handler already wired in Game.ts.) */
  passApplicant(memberId: string): void;
  post(projectId: string, subreddit: string, claim: ClaimKey): void;
  setRole(memberId: string, role: Role | null): void;
  /** What a post about the space itself is judged on — the same one the sim will use. */
  spaceSubject(): Subject;
  hireCost(memberId: string): number;
  begin(name: string, logo: number, difficulty: DifficultyKey, player: string): void;
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

/** Everyone who could ever be in the space, starting roster plus applicants. */
const MEMBER_DATA: Record<string, (typeof ROSTER)[number]> = Object.fromEntries(
  [...ROSTER, ...APPLICANTS].map((m) => [m.id, m]),
);

const SOURCE_BADGE: Record<BacklogEntry['source'], { label: MessageKey | null; cls: string }> = {
  catalog: { label: null, cls: '' },
  member: { label: 'ui.source.member', cls: 'src-member' },
  sponsor: { label: 'ui.source.sponsor', cls: 'src-sponsor' },
  trending: { label: 'ui.source.trending', cls: 'src-trending' },
};

type NewStep = 'genre' | 'brief' | 'design' | 'crew' | 'review';
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

/**
 * Stars, as line icons with a fill. Half stars are real — a 0.63 build is three and a half —
 * and the empty ones are drawn too, so a two-star option reads as two *of five*.
 */
function starRow(value: number): string {
  const out: string[] = [];
  for (let i = 1; i <= 5; i += 1) {
    const kind = value >= i ? 'on' : value >= i - 0.5 ? 'half' : 'off';
    out.push(`<i class="star star--${kind}">${icon('star', 'ui-icon')}</i>`);
  }
  return `<span class="stars" title="${esc(t('build.stars', { value }))}">${out.join('')}</span>`;
}

/** What the market wants this week, as a badge: a trend arrow and the multiplier. */
function demandBadge(value: number): string {
  const { tone } = demandLabel(value);
  const colour = { hot: 'var(--success)', warm: 'var(--primary)', flat: 'var(--muted-foreground)', cold: 'var(--warning)' }[tone];
  return `<span class="ui-badge ui-badge--tone" style="--tone:${colour}"
    title="${esc(t('build.demand.hint'))}">
    ${icon(value >= 1 ? 'trendUp' : 'trendDown')}${t(`build.demand.${tone}` as MessageKey)} ×${num(Number(value.toFixed(2)))}
  </span>`;
}

/** One badge per thing a design option changes. Good reads green, a cost reads red. */
function optionEffects(
  option: DesignOption,
  seats: number,
  def: ProjectDef,
  axis: DesignAxisId,
  index: number,
  licences: Licences,
): string {
  const out: string[] = [];
  const badge = (text: string, good: boolean | null, title = '') =>
    `<span class="ui-badge ${good === null ? '' : 'ui-badge--tone'}" ${
      good === null ? '' : `style="--tone:var(--${good ? 'success' : 'destructive'})"`
    } title="${title}">${text}</span>`;
  const signed = (v: number) => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}`;
  const change = (v: number) => `${v > 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`;
  if (option.quality) out.push(badge(t('build.fx.quality', { value: signed(option.quality) }), option.quality > 0));
  if (option.appeal && option.appeal !== 1) {
    out.push(badge(t('build.fx.appeal', { value: change(option.appeal) }), option.appeal > 1, t('build.fx.appealHint')));
  }
  if (option.work && option.work !== 1) out.push(badge(t('build.fx.work', { value: change(option.work) }), option.work < 1));
  if (option.testRisk && option.testRisk !== 1) {
    out.push(badge(t('build.fx.testRisk', { value: change(option.testRisk) }), option.testRisk < 1));
  }
  if (option.bom && option.bom !== 1) out.push(badge(t('build.fx.parts', { value: change(option.bom) }), option.bom < 1));
  if (option.print && option.print !== 1) {
    out.push(badge(t('build.fx.printing', { value: change(option.print) }), option.print < 1));
  }
  if (option.lead) out.push(badge(t('build.fx.delivery', { days: option.lead }), false));
  // Every option has a price now, and it rises with the stars (§4c).
  // Seat licences the space already owns are not charged again (§4c), and the card says so.
  const seat = licenceCost(axis, index, seats, licences);
  const cost = optionCost(def, option) + (option.keeps ? 0 : (option.cost ?? 0)) + seat.cost;
  const text = option.keeps
    ? seat.missing
      ? t('build.fx.setUp', { cost })
      : t('build.fx.inPlace', { cost })
    : !option.perSeat
      ? t('build.fx.cost', { cost })
      : seat.missing
        ? t('build.fx.perSeat', { cost, each: option.perSeat })
        : t('build.fx.licensed', { cost, seats: seat.owned });
  out.unshift(
    `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)" title="${esc(t('build.fx.costHint'))}">${icon('coins')}${text}</span>`,
  );
  if (option.skipSim) out.push(badge(t('build.fx.noSim'), null));
  if (option.requires?.length) {
    out.push(badge(t('build.fx.needs', { machines: option.requires.map((m) => MACHINE_LABEL[m]).join(', ') }), null));
  }
  if (!out.length) out.push(badge(t('build.fx.asBrief'), null));
  return out.join('');
}

/** Where on the size curve a crew sits: under, right, generous, crowded. */
/**
 * Crew size and what it does to the plan, as **one control**. It used to be a segmented
 * picker in the corner plus this meter under it, and the meter looked like the thing to
 * press — so people pressed it and nothing happened. Now it is the picker.
 */
function fitMeter(ideal: number, seats: number, max: number): string {
  const marks = SEAT_OPTIONS.map((n) => {
    const q = teamFit(n, ideal).quality;
    const tone = q >= 0.04 ? 'good' : q <= -0.04 ? 'bad' : 'flat';
    const blocked = n > max;
    const tip = blocked
      ? t('build.np.seatBlocked', { count: n, table: FURNITURE_MAP['table-large'].name })
      : `${t('build.people', { count: n })}: ${fitLabel(n, ideal)}`;
    return `<button class="fit-cell fit-cell--${tone}" data-action="np-seats" data-value="${n}"
      aria-pressed="${n === seats}" ${blocked ? 'disabled' : ''} title="${esc(tip)}">
      ${icon('users')}<b>${n}</b></button>`;
  }).join('');
  return `<div class="fit-meter" role="group">${marks}</div>`;
}

/** A crew size's place on the curve, in words. */
function fitLabel(seats: number, ideal: number): string {
  return t(`build.fit.${teamFit(seats, ideal).key}` as MessageKey);
}

/** The six skills, in the order every table lists them. */
const SKILL_KEYS: SkillKey[] = ['software', 'electronics', 'cad', 'machining', 'welding', 'docs'];

/** How many of a piece of furniture the space owns, from the runtime's own counts. */
function ownedFurniture(state: GameState, def: FurnitureDef): number {
  if (def.type === 'table-small' || def.type === 'table-large') {
    return state.runtime.tables.filter((t) => t.type === def.type).length;
  }
  return Math.round((state.runtime.seats[def.type] ?? 0) / furnitureSeats(def));
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
  private lastState: GameState | null = null;
  /** The first-run tour, while it is running: which step, and whether it paused the clock. */
  private tour: { step: number; paused: boolean } | null = null;
  private tourRing!: HTMLElement;
  private tourCard!: HTMLElement;
  /** Last HTML written per section, so unchanged sections keep their DOM nodes. */
  private htmlCache = new Map<string, string>();

  /** Which build-menu panel is open, if any. */
  private openModal:
    | 'new' | 'people' | 'ranking' | 'machines' | 'projects' | 'reddit' | 'build' | null = null;

  /** Which shelf of the Build panel is open. */
  private buildTab: 'workspace' | 'printers' | 'comfort' | 'decor' = 'workspace';

  /** Which group of projects is on screen. Falls through when the chosen one is empty. */
  private projectsTab: 'all' | 'on' | 'done' = 'all';
  /** The project whose detail is open in the Projects panel, running or shipped. */
  private projectDetail: string | null = null;

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

  /**
   * Whether the log is folded. It used to share the right column with a roster, and started
   * folded to give that room; the roster is gone (People has it), so the log opens.
   */
  private folded: { log: boolean } = { log: false };

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
    /** Your own name. Left empty, you are "You". */
    player: '',
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

  /** The New Project wizard (§4d). Survives re-renders; reset each time it is opened. */
  private np: {
    step: NewStep;
    genre: ProjectCategory | 'offers' | null;
    defId: string | null;
    offerId: string | null;
    design: DesignChoice;
    seats: number;
    crew: Set<string>;
    /** A crew the player has edited is never re-suggested over (§4c). */
    crewTouched: boolean;
  } = this.freshWizard();

  private freshWizard() {
    return {
      step: 'genre' as NewStep,
      genre: null,
      defId: null,
      offerId: null,
      design: {},
      seats: 1,
      crew: new Set<string>(),
      crewTouched: false,
    };
  }

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
      </div>

      <div class="panel" id="moving"></div>
      <div class="panel" id="devconsole"></div>
      <div id="bottombar"></div>
      <div id="modal"></div>
      <div id="start"></div>
      <div id="tour-ring"></div>
      <div id="tour-card"></div>
    `;
    this.tourRing = this.root.querySelector('#tour-ring')!;
    this.tourCard = this.root.querySelector('#tour-card')!;
    // The ring follows its target, and a resized window moves every target.
    window.addEventListener('resize', () => this.rerender());
    this.topbar = this.root.querySelector('#topbar')!;
    this.clockPanel = this.root.querySelector('#clockpanel')!;
    this.bottombar = this.root.querySelector('#bottombar')!;
    this.movingEl = this.root.querySelector('#moving')!;
    this.devEl = this.root.querySelector('#devconsole')!;
    this.modal = this.root.querySelector('#modal')!;
    this.startEl = this.root.querySelector('#start')!;
    this.left = this.root.querySelector('#left .body')!;
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
      if ((target.id !== 'space-name' && target.id !== 'player-name') || event.key !== 'Enter') return;
      event.preventDefault();
      const name = this.nameField().trim();
      if (name) this.handlers.begin(name, this.start.logo, this.start.difficulty, this.playerField());
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
        case 'tour-start':
          this.startTour();
          break;
        case 'tour-next':
          this.advanceTour();
          break;
        case 'tour-skip':
          this.endTour();
          break;
        case 'noop':
          break;
        case 'new-open':
          this.openModal = 'new';
          this.np = this.freshWizard();
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
          const key = value as 'log';
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
          this.projectDetail = null;
          this.rerender();
          break;
        case 'project-detail':
          this.projectDetail = id || null;
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
          this.start.player = this.playerField();
          h.setLocale(value as Locale);
          break;
        case 'logo':
          this.start.name = this.nameField();
          this.start.player = this.playerField();
          this.start.logo = Number(value);
          this.rerender();
          break;
        case 'difficulty':
          this.start.name = this.nameField();
          this.start.player = this.playerField();
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
          h.begin(name, this.start.logo, this.start.difficulty, this.playerField());
          // Somebody who has never played gets shown round; everybody else gets the game.
          if (!hasToured()) this.startTour();
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
          if (id) h.hire(id);
          this.rerender();
          break;
        case 'train':
          if (id && value) h.train(id, value as SkillKey);
          this.rerender();
          break;
        case 'hire-all':
          for (const applicant of [...(this.lastState?.applicants ?? [])]) h.hire(applicant);
          this.rerender();
          break;
        case 'pass-applicant':
          if (id) h.passApplicant(id);
          this.rerender();
          break;
        case 'np-back': {
          const order: NewStep[] = ['genre', 'brief', 'crew', 'design', 'review'];
          this.np.step = order[Math.max(0, order.indexOf(this.np.step) - 1)];
          this.rerender();
          break;
        }
        case 'np-step':
          // Breadcrumb: a step you have already completed is a way back to it.
          this.np.step = value as NewStep;
          this.rerender();
          break;
        case 'np-genre':
          this.np.genre = value === 'offers' ? 'offers' : (value as ProjectCategory);
          this.np.step = 'brief';
          this.rerender();
          break;
        case 'np-brief':
          if (id && this.lastState) this.npChooseBrief(id, id2 || null, this.lastState);
          // The crew comes before the design (§4c): what they can do decides what is on offer.
          this.np.step = 'crew';
          this.rerender();
          break;
        case 'np-option':
          if (value) this.np.design = { ...this.np.design, [value]: Number(id) };
          this.rerender();
          break;
        case 'np-seats':
          this.np.seats = Number(value) || 1;
          if (this.lastState) this.npSuggestCrew(this.lastState);
          if (this.lastState) this.npFitDesign(this.lastState);
          this.rerender();
          break;
        case 'np-crew': {
          if (!id) break;
          if (this.np.crew.has(id)) this.np.crew.delete(id);
          else if (this.np.crew.size < this.np.seats) this.np.crew.add(id);
          // From here the crew is the player's, not a suggestion.
          this.np.crewTouched = true;
          if (this.lastState) this.npFitDesign(this.lastState);
          this.rerender();
          break;
        }
        case 'np-next':
          if (this.np.step === 'crew') {
            this.np.step = 'design';
            if (this.lastState) this.npFitDesign(this.lastState);
          } else if (this.np.step === 'design') {
            this.np.step = 'review';
          }
          this.rerender();
          break;
        case 'np-start': {
          const def = this.npDef();
          if (!def) break;
          h.pitch(def.id, this.np.offerId ?? undefined, [...this.np.crew], this.npPlan());
          this.openModal = null;
          this.np = this.freshWizard();
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
        case 'sell-held':
          if (id) h.sellPiece(id);
          this.rerender();
          break;
        case 'done-moving':
          h.stopMoving();
          this.rerender();
          break;
        case 'build-open':
          this.openModal = 'build';
          this.rerender();
          break;
        case 'build-tab':
          this.buildTab = (value as 'workspace' | 'printers' | 'comfort' | 'decor') ?? 'workspace';
          this.rerender();
          break;
        case 'buy-furniture':
          if (value) h.buyFurniture(value);
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

  /** Your own name, as typed; empty means "You". Read live for the same reason as the space's. */
  private playerField(): string {
    const input = this.root.querySelector<HTMLInputElement>('#player-name');
    return (input ? input.value : this.start.player).trim();
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
      this.renderTour(state);
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
    this.renderLog(state);
    this.renderBottomBar(state);
    this.renderMoving(state);
    this.renderDev();
    this.renderModal(state);
    this.renderTour(state);
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
    // The build menu is translated now, so it takes the page's language — which is what
    // lets Turkish casing rules uppercase its labels correctly.
    this.bottombar.removeAttribute('lang');
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
       ${(() => {
         // Sell straight from the room — the only place you can see how full it has got.
         const sale = this.handlers.resaleOf(id);
         return sale.reason
           ? `<span class="ui-desc moving-note">${esc(t(sale.reason))}</span>`
           : `<button class="ui-btn ui-btn--danger ui-btn--sm" data-action="sell-held" data-id="${id}"
               title="${esc(t('build.sell.button', { value: sale.value }))}">
               ${icon('coins')}${t('build.sell.button', { value: sale.value })}
             </button>`;
       })()}
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
          <div class="start-player">
            <label class="ui-label" for="player-name">${t('ui.start.playerLabel')}</label>
            <input id="player-name" class="start-player__input" maxlength="20"
              placeholder="${esc(t('ui.you'))}" autocomplete="off" spellcheck="false"
              value="${esc(this.start.player)}" />
          </div>
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

  // --- The first-run tour (§11) ----------------------------------------------

  private startTour() {
    const state = this.lastState;
    // The clock stops while somebody is being shown round, and starts again when they
    // are done — unless it was already stopped, in which case it stays that way.
    const paused = !!state && !state.paused;
    if (paused) this.handlers.setSpeed(0);
    this.tour = { step: 0, paused };
    this.rerender();
  }

  private advanceTour() {
    if (!this.tour) return;
    this.tour.step += 1;
    if (this.tour.step >= TOUR.length) this.endTour();
    else this.rerender();
  }

  private endTour() {
    if (!this.tour) return;
    const resume = this.tour.paused;
    this.tour = null;
    rememberToured();
    if (resume && this.lastState) this.handlers.setSpeed(this.lastState.speed || 1);
    this.rerender();
  }

  /**
   * A ring round the thing being explained and a card beside it. The card is the only part
   * that takes a click; the ring lets presses through, so a Do step's target stays usable.
   * A Do step moves on by itself the moment the game sees it done.
   */
  private renderTour(state: GameState) {
    const hide = () => {
      this.tourRing.style.display = 'none';
      this.tourCard.style.display = 'none';
    };
    if (!this.tour || !state.started || state.gameOver) return hide();
    let step = TOUR[this.tour.step];
    const ctx = { state, openModal: this.openModal };
    // Closed the wizard without starting anything: back to the step that opens it.
    if (step?.id === 'wizard' && this.openModal !== 'new' && !state.runtime.projects.length) {
      this.tour.step = TOUR.findIndex((x) => x.id === 'new');
      step = TOUR[this.tour.step];
    }
    // A Do step that is already done (the player got there first) is skipped over.
    while (step?.done?.(ctx)) {
      this.tour.step += 1;
      step = TOUR[this.tour.step];
    }
    if (!step) {
      this.endTour();
      return hide();
    }
    const last = this.tour.step === TOUR.length - 1;
    const name = state.identity?.name ?? t('ui.top.yourSpace');
    this.setHTML(
      this.tourCard,
      'tour',
      `<div class="tour-head">
        <span class="icon-chip" style="--tone:var(--primary)">${icon(step.done ? 'sparkles' : 'lightbulb')}</span>
        <b class="ui-title">${t(step.title as 'tour.welcome.title', { name })}</b>
        <span class="tour-count">${this.tour.step + 1}/${TOUR.length}</span>
      </div>
      <p class="ui-desc">${t(step.body as 'tour.welcome.body', { name })}</p>
      <div class="tour-foot">
        <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="tour-skip">${last ? '' : t('tour.skip')}</button>
        ${
          step.done
            ? `<span class="tour-waiting">${icon('clock')}${t('tour.yourMove')}</span>`
            : `<button class="ui-btn ui-btn--primary ui-btn--sm" data-action="${last ? 'tour-skip' : 'tour-next'}">
                ${last ? t('tour.finish') : t('tour.next')}${icon('chevronRight')}
              </button>`
        }
      </div>`,
    );
    this.tourCard.style.display = 'block';
    const card = this.tourCard.getBoundingClientRect();
    const target = step.target ? this.root.querySelector<HTMLElement>(step.target) : null;
    const rect = target?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (value: number, max: number) => Math.max(12, Math.min(max - 12, value));
    if (!rect || rect.width === 0) {
      this.tourRing.style.display = 'none';
      this.tourCard.style.left = `${(vw - card.width) / 2}px`;
      this.tourCard.style.top = `${(vh - card.height) / 2}px`;
      return;
    }
    const pad = 6;
    Object.assign(this.tourRing.style, {
      display: 'block',
      left: `${rect.left - pad}px`,
      top: `${rect.top - pad}px`,
      width: `${rect.width + pad * 2}px`,
      height: `${rect.height + pad * 2}px`,
    });
    let left = rect.left + rect.width / 2 - card.width / 2;
    let top = rect.bottom + 14;
    if (step.place === 'above') top = rect.top - card.height - 14;
    if (step.place === 'right') {
      left = rect.right + 14;
      top = rect.top;
    }
    if (step.place === 'corner') {
      left = 16;
      top = vh - card.height - 110;
    }
    this.tourCard.style.left = `${clamp(left, vw - card.width)}px`;
    this.tourCard.style.top = `${clamp(top, vh - card.height)}px`;
  }

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
    // In the black green, under water red, exactly nothing plain.
    const cashTone = state.cash > 0 ? 'good' : state.cash < 0 ? 'bad' : 'flat';
    const next = this.handlers.previewBill();
    const era = eraDef(state.era);
    const target = Number.isFinite(era.repToAdvance) ? era.repToAdvance : null;
    const lease = this.handlers.nextLease();
    /**
     * The top bar is four groups, not eight boxes: who you are, what you have, how far the
     * name has got, and what is on. **Cash is one number**: a projection of the next bill
     * under it read as a second balance, and nobody could say which one they had. The
     * statement is where the month is explained.
     */
    this.setHTML(this.topbar, 'topbar', `
      <div class="tb-group tb-identity">
        <span class="icon-chip" style="--tone:${state.identity?.colour ?? 'var(--primary)'};width:30px;height:30px">
          ${icon((state.identity?.icon ?? 'wrench') as IconName)}
        </span>
        <div class="tb-text">
          <b class="tb-name">${esc(state.identity?.name ?? t('ui.top.yourSpace'))}</b>
          <span class="tb-sub">${esc(era.name)}</span>
        </div>
        ${
          lease?.ready
            ? `<button class="ui-btn ${lease.afford ? 'ui-btn--primary' : 'ui-btn--outline'} ui-btn--sm"
                data-action="sign-lease" ${lease.afford ? '' : 'disabled'}
                title="${esc(t('ui.top.leaseHint', { space: lease.def.name }))}">
                ${icon('building')}${esc(t('ui.top.moveTo', { space: lease.def.name }))} · ${money(lease.def.moveCost)}
              </button>`
            : ''
        }
      </div>
      <div class="tb-group" title="${esc(t('build.top.cashHint', { days: next.dueInDays }))}">
        <span class="tb-icon">${icon('coins')}</span>
        <div class="tb-text">
          <b class="tb-value cash cash--${cashTone}">${money(state.cash)}</b>
          <span class="tb-sub">${t('ui.stat.cash')}</span>
        </div>
      </div>
      <div class="tb-group" title="${esc(t('ui.top.reputationHint'))}">
        <span class="tb-icon">${icon('flame')}</span>
        <div class="tb-text">
          <b class="tb-value">${num(state.reputation)}${target ? `<small>/${num(target)}</small>` : ''}</b>
          ${
            target
              ? `<span class="tb-meter"><i style="width:${Math.min(100, (state.reputation / target) * 100).toFixed(1)}%"></i></span>`
              : `<span class="tb-sub">${t('ui.stat.reputation')}</span>`
          }
        </div>
      </div>
      <div class="tb-group" title="${esc(t('ui.top.allocatedHint'))}">
        <span class="tb-icon">${icon('clipboard')}</span>
        <div class="tb-text">
          <b class="tb-value">${t('build.top.projects', { count: state.runtime.projects.length })}</b>
          <span class="tb-sub">${t('build.top.busy', { used: allocation.used, total: allocation.total })} · ${t('build.top.shipped', { count: state.shippedCount })}</span>
        </div>
      </div>
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
      <button class="lang-toggle" data-action="tour-start" title="${esc(t('tour.replayHint'))}">${icon('lightbulb')}</button>
    `);
  }

  /**
   * The build menu. Shop, Events and the space builder land here in later phases
   * (CLAUDE.md §14). Machines sits here rather than in a permanent sidebar: a queue you
   * only touch a few times a day does not earn a third of the right-hand column.
   */
  private renderBottomBar(state: GameState) {
    const offers = state.backlog.length;
    // People standing about because every seat of their kind is taken — the Build panel's
    // reason to exist, said from across the room.
    const seatQueue = Object.values(state.runtime.waitingFor).reduce((n, v) => n + (v ?? 0), 0);
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
      // The bar's one call to action, so it reads as a button rather than a tab: starting
      // something is the verb every other panel in the game is downstream of.
      `<button class="bar-item bar-item--cta ${this.openModal === 'new' ? 'active' : ''}" data-action="new-open"
         title="${esc(t('build.bar.newHint'))}">
         ${icon('plus', 'ui-icon bar-icon')}
         <span class="bar-label">${t('build.bar.new')}</span>
         ${offers ? `<i class="pip">${offers}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'projects' ? 'active' : ''}" data-action="projects-open"
         title="${esc(t('build.bar.projectsHint'))}">
         ${icon('clipboard', 'ui-icon bar-icon')}
         <span class="bar-label">${t('build.bar.projects')}</span>
         ${state.runtime.projects.length ? `<i class="pip">${state.runtime.projects.length}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'ranking' ? 'active' : ''}" data-action="ranking-open"
         title="${esc(t('build.bar.rankingHint'))}">
         ${icon('flame', 'ui-icon bar-icon')}
         <span class="bar-label">${t('build.bar.ranking')}</span>
       </button>
       <button class="bar-item ${this.openModal === 'machines' ? 'active' : ''} ${needsHand ? 'bar-item--alert' : ''}"
         data-action="machines-open"
         title="${esc(t(needsHand ? 'build.bar.machinesAlert' : 'build.bar.machinesHint'))}">
         ${icon('printer', 'ui-icon bar-icon')}
         <span class="bar-label">${t('build.bar.machines')}</span>
         ${jobs ? `<i class="pip">${jobs}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'people' ? 'active' : ''} ${state.applicants.length ? 'bar-item--news' : ''}"
         data-action="people-open"
         title="${esc(state.applicants.length ? t('build.bar.peopleWaiting', { count: state.applicants.length }) : t('build.bar.peopleHint'))}">
         ${icon('users', 'ui-icon bar-icon')}
         <span class="bar-label">${t('build.bar.people')}</span>
         ${state.applicants.length ? `<i class="pip">${state.applicants.length}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'build' ? 'active' : ''} ${seatQueue ? 'bar-item--alert' : ''}"
         data-action="build-open"
         title="${esc(seatQueue ? t('build.bar.buildQueue', { count: seatQueue }) : t('build.bar.buildHint'))}">
         ${icon('hammer', 'ui-icon bar-icon')}
         <span class="bar-label">${t('build.bar.build')}</span>
         ${seatQueue ? `<i class="pip">${seatQueue}</i>` : ''}
       </button>
       <button class="bar-item ${this.openModal === 'reddit' ? 'active' : ''}" data-action="reddit-open"
         title="${esc(t('build.bar.socialsHint'))}">
         ${icon('flame', 'ui-icon bar-icon')}
         <span class="bar-label">${t('build.bar.socials')}</span>
         ${state.hype >= 1 ? `<i class="pip">${Math.round(state.hype)}</i>` : ''}
       </button>`,
    );
  }

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
              aria-pressed="${this.rankTab === 'trophies'}">
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
    if (!years.length) return this.trophyPreview(state);

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
  /**
   * The trophy room before there are any trophies: what the night gives out and when. A
   * first season with the room locked meant the awards arrived as a surprise on day 90,
   * and the categories are the whole reason to care about the other columns in the table.
   */
  private trophyPreview(state: GameState): string {
    const night = awardsDay(state.day);
    const rows = AWARDS.map(
      (award) => `<div class="award-preview">
        <span class="space-dot" style="--tone:var(--gold)">${icon('trophy')}</span>
        <span class="award-preview__text">
          <b>${esc(award.label)}</b>
          <span>${esc(award.blurb)}</span>
        </span>
        <span class="ui-badge" title="${esc(t('build.trophy.repHint'))}">+${num(award.reputation)} ${t('ui.stat.reputation')}</span>
      </div>`,
    ).join('');
    return `<div class="trophy-summary">
        <span class="space-dot" style="--tone:var(--gold)">${icon('trophy')}</span>
        ${t('build.trophy.firstNight', {
          date: `<b>${shortDate(night)}</b>`,
          days: `<b>${Math.max(0, night - state.day)}</b>`,
          count: AWARDS.length,
        })}
      </div>
      <div class="award-previews">${rows}</div>`;
  }

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
            <th class="space-head">${t('ui.trophy.winnerYear', { year: active.year })}</th>
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
      // record reads "no table was recorded" as a fault, when it is simply not awards night yet.
      const season = state.runtime.season;
      const days = Math.max(0, season.length - season.dayOfYear);
      const when = days === 0 ? t('ui.chart.today') : t('ui.chart.inDays', { days });
      return `<p class="ui-desc">${
        state.ceremonies.length ? t('ui.chart.noTable', { when }) : t('ui.chart.empty', { when })
      }</p>`;
    }

    // A strip of finishes, not a chart. The line chart spent a panel's width on two or three
    // points, repeated its year labels whenever two nights fell in one calendar year, and its
    // slope said less than the numbers did. One chip per awards night: the place, big; the
    // year under it; gold for a win.
    const chips = points
      .map(
        // One night a year, so the year *is* the night; "night 1" said the same thing twice.
        (p) => `<span class="finish-chip ${p.stand.rank === 1 ? 'finish-chip--gold' : ''}"
          title="${esc(t('ui.chart.point', { year: p.year, place: ordinal(p.stand.rank), field: p.field, reputation: num(p.stand.reputation) }))}">
          <b>${ordinal(p.stand.rank)}</b>
          <small>${p.year}</small>
        </span>`,
      )
      .join('');
    return `<div class="finish-strip" style="--tone:${colour}">${chips}</div>`;
  }

  /** The monthly books, as an event you have to look at. */
  /**
   * The monthly statement (§7a), laid out as the one sum it is: **income − costs = the
   * month**, and opening balance plus the month is where you stand now. Money in and money
   * out are two groups with their own totals, so nothing has to be added up in your head.
   */
  private renderBill(state: GameState): boolean {
    const bill = state.bill;
    if (!bill) return false;
    const signed = (amount: number) => `${amount < 0 ? '−' : '+'}${money(Math.abs(amount))}`;
    const line = (l: { label: Text; detail: Text; amount: number }) => `
      <div class="bill-line">
        <span class="bill-label">${esc(say(l.label))}<i>${esc(say(l.detail))}</i></span>
        <span class="mono bill-amount ${l.amount < 0 ? 'out' : l.amount > 0 ? 'in' : ''}">${signed(l.amount)}</span>
      </div>`;
    const incomeTotal = bill.income.reduce((sum, l) => sum + l.amount, 0);
    const costTotal = bill.costs.reduce((sum, l) => sum + l.amount, 0);
    const opening = bill.opening ?? bill.balanceBefore;
    const net = bill.opening === undefined ? bill.balanceAfter - bill.balanceBefore : bill.total;
    const group = (title: string, lines: string, total: number, tone: 'in' | 'out') => `
      <section class="bill-group">
        <div class="bill-group-head">
          <span class="ui-label">${title}</span>
          <span class="mono bill-amount ${total ? tone : ''}">${signed(total)}</span>
        </div>
        ${lines}
      </section>`;
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
            <div class="bill-sum">
              <div><span>${t('build.bill.income')}</span><b class="mono in">${signed(incomeTotal)}</b></div>
              <i>−</i>
              <div><span>${t('build.bill.costs')}</span><b class="mono out">${money(Math.abs(costTotal))}</b></div>
              <i>=</i>
              <div class="bill-sum-net"><span>${t('ui.bill.onTheMonth')}</span><b class="mono ${net < 0 ? 'out' : 'in'}">${signed(net)}</b></div>
            </div>
            ${group(t('build.bill.income'), bill.income.map(line).join(''), incomeTotal, 'in')}
            ${group(t('build.bill.costs'), bill.costs.map(line).join(''), costTotal, 'out')}
            <div class="bill-balance">
              <span>${t('build.bill.opened')} <b class="mono">${money(opening)}</b></span>
              <span class="mono ${net < 0 ? 'out' : 'in'}">${signed(net)}</span>
              <span>${t('build.bill.now')} <b class="mono cash cash--${bill.balanceAfter < 0 ? 'bad' : 'good'}">${money(bill.balanceAfter)}</b></span>
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

  /** Which panel shell is standing, and which of its views; see `renderModal`. */
  private modalShell = '';
  private modalSection = '';

  private renderModal(state: GameState) {
    if (this.renderBill(state) || this.renderCeremony(state)) {
      this.modalShell = '';
      return;
    }
    if (this.openModal === null) {
      this.modalShell = '';
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
                : this.openModal === 'build'
                  ? this.buildBody(state)
                  : this.newProjectBody(state);
    const classes = [
      this.openModal === 'machines' ||
      this.openModal === 'projects' ||
      this.openModal === 'people' ||
      this.openModal === 'build'
        ? 'modal--fit'
        : '',
      this.openModal === 'projects' || this.openModal === 'people' || this.openModal === 'build'
        ? 'modal--wide'
        : this.openModal === 'new'
          ? 'modal--wizard'
          : '',
    ].join(' ');
    /**
     * **The shell is built once and only its insides change.** Rebuilding the whole modal at
     * 5 Hz replaced the scrolling element every time, so a panel with a running printer in
     * it snapped back to the top the moment you scrolled — and a purchase in Build jumped
     * the list under the cursor. The body element now stays put, and so does its scroll.
     */
    const shell = `${this.openModal}|${classes}`;
    if (this.modalShell !== shell || !this.modal.querySelector('.modal-body')) {
      this.modalShell = shell;
      this.htmlCache.set('modal', `shell:${shell}`);
      for (const key of ['m-head', 'm-body', 'm-foot']) this.htmlCache.delete(key);
      this.modal.innerHTML = `<div class="modal-backdrop" data-action="jobs-close">
        <div class="modal ${classes}" data-action="noop">
          <header></header>
          <div class="modal-body"></div>
          <footer></footer>
        </div>
      </div>`;
    }
    const headEl = this.modal.querySelector<HTMLElement>('.modal > header')!;
    const bodyEl = this.modal.querySelector<HTMLElement>('.modal-body')!;
    const footEl = this.modal.querySelector<HTMLElement>('.modal > footer')!;
    this.setHTML(
      headEl,
      'm-head',
      `${body.head}
       <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="jobs-close">
         ${icon('x')}${t('ui.close')}
       </button>`,
    );
    this.setHTML(bodyEl, 'm-body', body.content);
    this.setHTML(footEl, 'm-foot', body.foot);
    // A different view of the panel — a wizard step, another tab — starts at the top.
    const section = [
      this.openModal,
      this.np.step,
      this.buildTab,
      this.projectsTab,
      this.projectDetail,
      this.peopleTab,
      this.rankTab,
    ].join('|');
    if (section !== this.modalSection) {
      this.modalSection = section;
      bodyEl.scrollTop = 0;
    }
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

    /**
     * Two panes, one decision each (§6): **what** on the left, **where** on the right —
     * with the claim above the rooms because it changes every number in them. The rooms are
     * sorted by what they would actually give, so the answer to "where should this go" is
     * the first row rather than a grid of eight to compare by eye.
     */
    const subjectList = subjects
      .map((x) => {
        const done = postedToday(x.id);
        return `<button class="social-subject ${x.id === chosen.id ? 'on' : ''}" data-action="reddit-project"
          data-id="${x.id}" ${done ? 'disabled' : ''}
          title="${esc(done ? t('ui.social.postedToday') : t('ui.social.meritHint', { merit: pct(x.sub.merit) }))}">
          <span class="social-subject__name">${esc(x.label)}</span>
          <span class="social-subject__meter"><i style="width:${Math.round(x.sub.merit * 100)}%"></i></span>
          <span class="social-subject__val">${done ? icon('check') : pct(x.sub.merit)}</span>
        </button>`;
      })
      .join('');

    const claimChips = `<div class="ui-segmented social-claims">
      ${CLAIMS.map(
        (claim) => `<button data-action="reddit-claim" data-value="${claim.key}"
          aria-pressed="${claim.key === this.reddit.claim}" title="${esc(claim.blurb)}">
          ${esc(claim.label)}
        </button>`,
      ).join('')}
    </div>`;

    const blocked = postedToday(chosen.id);
    const can = !blocked && hoursLeft >= VERB_HOURS.post;
    const previews = SUBREDDITS.map((room) => {
      const already = state.posts.filter((p) => p.projectId === chosen.id && p.subreddit === room.id).length;
      return { room, preview: react(chosen.sub, room, this.reddit.claim, already), fit: tasteMatch(chosen.sub.tags, room) };
    }).sort((a, b) => b.preview.upvotes - a.preview.upvotes);
    const top = previews.find((x) => !x.preview.burned)?.room.id;
    const rooms = previews
      .map(({ room, preview, fit }) => {
        const bad = preview.burned;
        return `<div class="social-room ${bad ? 'bad' : ''}" title="${esc(room.blurb)}">
          <span class="social-room__icon">${icon(room.icon, 'ui-icon')}</span>
          <span class="social-room__name"><span class="social-room__label">${esc(room.name)}</span>${
            room.id === top ? `<span class="social-best">${t('build.social.best')}</span>` : ''
          }</span>
          <span class="social-room__fit" title="${esc(t('ui.social.tasteHint'))}"><i style="width:${Math.round(fit * 100)}%"></i></span>
          <span class="social-room__votes">${bad ? t('ui.social.theyTurn') : `${icon('arrowUp')}${num(preview.upvotes)}`}</span>
          <button class="ui-btn ${bad ? 'ui-btn--outline' : room.id === top ? 'ui-btn--primary' : 'ui-btn--outline'} ui-btn--sm"
            data-action="reddit-post" data-value="${room.id}" ${can ? '' : 'disabled'}>${t('build.social.post')}</button>
        </div>`;
      })
      .join('');

    const feed = state.posts.length
      ? [...state.posts]
          .reverse()
          .slice(0, 5)
          .map(
            (post) => `<div class="social-post ${post.burned ? 'bad' : ''}" title="${esc(post.comment)}">
              <span class="social-post__votes">${post.burned ? '−' : icon('arrowUp')}${num(post.upvotes)}</span>
              <span class="social-post__what">${esc(post.projectName)}</span>
              <span class="social-post__where">${esc(SUBREDDIT_MAP[post.subreddit]?.name ?? post.subreddit)} · ${t('ui.top.day', { day: post.day })}</span>
            </div>`,
          )
          .join('')
      : `<p class="ui-desc" style="margin:0">${t('ui.social.nothingYet')}</p>`;

    return {
      head: `<div class="modal-head">${icon('flame', 'ui-icon ui-icon--lg')}<b>${t('ui.social.title')}</b>
        <span class="ui-badge ui-badge--tone" style="--tone:var(--primary)"
          title="${esc(t('ui.social.hypeHint'))}">
          ${t('ui.social.hype', { hype: Math.round(state.hype) })}
        </span></div>`,
      content: `<div class="social">
        <div class="social-left">
          <div class="ui-label">${t('ui.social.about')}</div>
          <div class="social-subjects">${subjectList}</div>
          <div class="ui-label" style="margin-top:14px">${t('ui.social.cameBack')}</div>
          <div class="social-feed">${feed}</div>
        </div>
        <div class="social-right">
          <span class="ui-label">${t('ui.social.howLoud')}</span>
          ${claimChips}
          <div class="ui-label" style="margin-top:12px">
            ${blocked ? t('ui.social.blocked') : t('ui.social.pickRoom')}
          </div>
          <div class="social-rooms">${rooms}</div>
        </div>
      </div>`,
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
    /**
     * What they love, as a line. What they can *do* is the matrix beside it — a column per
     * skill, so "who is our best welder" is read down one column rather than hunted for in
     * six wrapped lists.
     */
    const loveCell = (id: string) => {
      const data = MEMBER_DATA[id];
      return `<td class="note">${topCategories(data?.passions ?? {}, 2)
        .map(({ category }) => profileOf(category).label)
        .join(' · ')}</td>`;
    };
    /**
     * **A skill cell is the training button** (§5). Training used to be a Train button that
     * unfolded six chips under the row, which was two clicks and a second copy of numbers
     * the row already showed. Now the level you want to raise is the thing you press.
     */
    const hasStation = (state.runtime.seats.learning ?? 0) > 0;
    const skillCells = (m: MemberSnapshot) =>
      SKILL_KEYS.map((skill) => {
        const level = m.skills[skill] ?? 0;
        const pips = `<span class="pips">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= level ? 'on' : ''}"></i>`).join('')}</span>`;
        const training = m.training?.skill === skill;
        const maxed = level >= TRAIN.maxLevel;
        const cost = this.handlers.trainCost(m.id, skill);
        const why = !hasStation
          ? t('build.people.noStation')
          : m.training
            ? t('build.people.alreadyOnCourse')
            : m.team
              ? t('build.people.onCrew')
              : maxed
                ? t('build.people.maxed')
                : !this.affordable(state, cost)
                  ? t('ui.people.pastLimit', { amount: cost - state.cash - ECONOMY.overdraftLimit })
                  : '';
        const label = t(`build.skill.${skill}` as MessageKey);
        const tip = why
          ? `${label} ${level} · ${why}`
          : t('build.people.trainCell', { skill: label, from: level, to: level + 1, cost, hours: TRAIN.hoursPerLevel * (level + 1) });
        return `<td class="skill-cell">
          <button class="skill-btn ${training ? 'skill-btn--training' : ''}" data-action="train" data-id="${m.id}"
            data-value="${skill}" ${why ? 'disabled' : ''} title="${esc(tip)}">
            <b>${level}</b>${pips}${why ? '' : `<span class="skill-btn__up">${icon('plus')}</span>`}
          </button>
        </td>`;
      }).join('');

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
      const course = m.training
        ? t('build.people.onCourse', {
            skill: t(`build.skill.${m.training.skill}` as MessageKey),
            pct: pct(1 - m.training.hoursLeft / m.training.total),
          })
        : '';
      return `<tr>
        ${nameCell(m.id, m.name)}
        <td class="note ${project || course ? '' : 'warn'}">
          ${project ? esc(project.name) : course ? esc(course) : t('ui.people.nothingAllocated')}
        </td>
        ${loveCell(m.id)}
        ${skillCells(m)}
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
      const top = topCategories(data.passions ?? {}, 1)[0];
      const profile = top ? profileOf(top.category) : null;
      const cost = this.handlers.hireCost(id);
      const ok = this.affordable(state, cost) && hoursLeft >= VERB_HOURS.hire;
      const traits = (data.traits ?? [])
        .map((trait) => `<span class="ui-badge" title="${TRAIT_BLURB[trait]}">${TRAIT_LABEL[trait]}</span>`)
        .join('');
      const best = (Object.entries(data.skills) as [SkillKey, number][])
        .filter(([, level]) => level >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([skill, level]) => `${t(`build.skill.${skill}` as MessageKey)} ${level}`)
        .join(' · ');
      // A greyed-out hire with no reason reads as a broken button. Say which gate is shut.
      const blocked =
        hoursLeft < VERB_HOURS.hire
          ? esc(t('ui.people.noHours', { name: data.name, hours: hours(VERB_HOURS.hire) }))
          : !this.affordable(state, cost)
            ? esc(t('ui.people.pastLimit', { amount: cost - state.cash - ECONOMY.overdraftLimit }))
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
        ${best ? `<div class="candidate__meta">${esc(best)}</div>` : ''}
        <div class="candidate__actions">
          <button class="ui-btn ui-btn--primary ui-btn--sm" data-action="hire" data-id="${id}" ${ok ? '' : 'disabled'}
            title="${esc(t('ui.people.hireHint', { hours: WEEKLY_HOURS, dues: ECONOMY.crewDues }))}">
            ${icon('plus')}${t('build.people.takeOn')} · ${money(cost)}</button>
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
      if (role === 'host') {
        // Somebody who talks about the place well: broad taste, and the docs to show.
        const breadth = Math.min(1, Object.keys(data.passions ?? {}).length / 4);
        score = breadth * 0.55 + skill('docs') * 0.45;
        why = has('mentor') ? t('ui.fit.mentor') : breadth > 0.7 ? t('ui.fit.broad') : t('ui.fit.goodEye');
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
      if (has('mentor') && role === 'host') score *= 1.25;
      if (has('nightOwl') && role === 'printer') score *= 1.2;
      if (has('documenter') && role === 'quartermaster') score *= 1.3;
      if (has('documenter') && role === 'social') score *= 1.25;
      // Somebody who signs up and then stops turning up is nobody's keyholder.
      if (has('ghost')) score *= 0.4;
      return { score: Math.min(1, score), why };
    };

    const roleIcon: Record<Role, IconName> = {
      host: 'users',
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

    // One press for the whole queue. Each still costs its induction fee and an hour of
    // yours, and the sim stops taking people on when either runs out.
    const hireAllCost = open.reduce((sum, id) => sum + this.handlers.hireCost(id), 0);
    const hireAll = open.length > 1
      ? `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="hire-all"
          ${this.affordable(state, hireAllCost) ? '' : 'disabled'}
          title="${esc(t('build.people.hireAllHint'))}">
          ${icon('check')}${t('build.people.hireAll', { count: open.length, cost: hireAllCost })}
        </button>`
      : '';

    const waiting =
      open.length && tab !== 'open'
        ? `<div class="candidate-banner">
            ${icon('users', 'ui-icon')}
            <span>${t('ui.people.wantToJoin', { count: open.length, n: `<b>${open.length}</b>` })}
              <span class="muted">· ${open.map((a) => esc(MEMBER_DATA[a]?.name ?? a)).join(', ')}</span></span>
            ${hireAll}
            <button class="ui-btn ui-btn--primary ui-btn--sm" data-action="people-tab" data-value="open">
              ${t('ui.people.review')}
            </button>
          </div>`
        : '';

    const body =
      tab === 'open'
        ? `${hireAll ? `<div class="row" style="justify-content:flex-end;margin-bottom:10px">${hireAll}</div>` : ''}
           <div class="candidates">${open.map(candidateCard).join('')}</div>`
        : rows.length
          ? `<table class="rank-table people-table">
              <thead><tr>
                <th class="space-head">${t('ui.people.col.person')}</th><th>${t('ui.people.col.doing')}</th>
                <th>${t('build.people.col.loves')}</th>
                ${SKILL_KEYS.map((skill) => `<th class="skill-head" title="${esc(t(`build.skill.${skill}` as MessageKey))}">${t(`build.skillShort.${skill}` as MessageKey)}</th>`).join('')}
                <th>${t('ui.people.col.trait')}</th><th></th>
              </tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table>`
          : `<p class="ui-desc">${t('ui.people.empty')}</p>`;
    // Training is pressed in the table; say how, or say what is missing.
    const trainHint =
      tab !== 'open' && rows.length
        ? `<p class="ui-desc people-hint">${icon('book')}${
            hasStation ? t('build.people.trainHow') : t('build.people.trainNeedsStation', { build: `<b>${t('build.bar.build')}</b>` })
          }</p>`
        : '';

    const next = APPLICANTS.filter(
      (a) => !members.some((m) => m.id === a.id) && !open.includes(a.id),
    ).sort((a, b) => (a.repRequired ?? 0) - (b.repRequired ?? 0))[0];

    return {
      head: `<div class="modal-head">${icon('users', 'ui-icon ui-icon--lg')}<b>${t('ui.people.title')}</b></div>`,
      content:
        (members.length ? jobs + `<hr class="ui-sep" />` : '') + waiting + chips + body + trainHint,
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

  // --- + New Project: design a build, then crew it (§4d) ---------------------

  /**
   * The New Project wizard. It replaced the Jobs board, which handed the player a finished
   * recipe — every number behind a project had already been decided, so the only choice
   * left was which name to click. Five steps now, and three of them are decisions:
   *
   *   Genre → Brief → **Design → Crew → Review**
   *
   * The brief is still the catalogue (what the market is asking for, and what it pays), but
   * how it is built, and by how many, is the player's. The review screen is the whole plan
   * worked out by the same `planProject` the sim builds from, so what it promises is what
   * the build carries.
   */
  private newProjectBody(state: GameState): { head: string; content: string; foot: string } {
    const steps: { key: NewStep; label: string }[] = (
      ['genre', 'brief', 'crew', 'design', 'review'] as NewStep[]
    ).map((key) => ({ key, label: t(`build.np.step.${key}` as MessageKey) }));
    const current = steps.findIndex((x) => x.key === this.np.step);
    const trail = steps
      .map((x, index) => {
        const tone = index === current ? 'now' : index < current ? 'done' : '';
        const inner = `<i>${tone === 'done' ? icon('check', 'ui-icon step-check') : index + 1}</i>${x.label}`;
        // Only a completed step is a destination; the current one is where you are and the
        // ones ahead do not exist yet (§4c).
        return tone === 'done'
          ? `<button class="step done" data-action="np-step" data-value="${x.key}"
               title="${esc(t('build.np.backTo', { step: x.label }))}">${inner}</button>`
          : `<span class="step ${tone}" data-step="${x.key}">${inner}</span>`;
      })
      .join(`<span class="step-sep">${icon('chevronRight', 'ui-icon')}</span>`);

    const content =
      this.np.step === 'genre'
        ? this.npGenreStep(state)
        : this.np.step === 'brief'
          ? this.npBriefStep(state)
          : this.np.step === 'design'
            ? this.npDesignStep(state)
            : this.np.step === 'crew'
              ? this.npCrewStep(state)
              : this.npReviewStep(state);

    const next =
      this.np.step === 'design' || this.np.step === 'crew'
        ? `<button class="ui-btn ui-btn--primary ui-btn--sm" data-action="np-next" style="margin-left:auto">
             ${t(this.np.step === 'crew' ? 'build.np.step.design' : 'build.np.step.review')}${icon('chevronRight')}
           </button>`
        : '';
    return {
      head: `<div class="steps">${trail}</div>`,
      content,
      foot: `
        ${
          this.np.step === 'genre'
            ? ''
            : `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="np-back">
                 ${icon('arrowLeft')}${t('build.np.back')}
               </button>`
        }
        <span class="ui-desc" style="font-size:10.5px">
          ${t(
            this.np.step === 'design'
              ? 'build.np.foot.design'
              : this.np.step === 'crew'
                ? 'build.np.foot.crew'
                : 'build.np.foot.other',
          )}
        </span>
        ${next}`,
    };
  }

  private npDef(): ProjectDef | null {
    return this.np.defId ? CATALOG_MAP[this.np.defId] ?? null : null;
  }

  private npPlan(): ProjectPlan {
    return { design: { ...this.np.design }, seats: this.np.seats };
  }

  /** The biggest crew any table in the space can seat — what the size picker is capped at. */
  private maxSeats(state: GameState): number {
    return Math.max(0, ...state.runtime.tables.map((t) => t.seats));
  }

  /** The seat option closest to what the brief was scoped for, within what the tables allow. */
  private seatsFor(def: ProjectDef, state: GameState): number {
    const allowed = SEAT_OPTIONS.filter((n) => n <= Math.max(1, this.maxSeats(state)));
    return allowed.reduce((best, n) =>
      Math.abs(Math.log(n / def.teamSize)) < Math.abs(Math.log(best / def.teamSize)) ? n : best,
    allowed[0] ?? 1);
  }

  private npChooseBrief(defId: string, offerId: string | null, state: GameState) {
    const def = CATALOG_MAP[defId];
    if (!def) return;
    this.np.defId = defId;
    this.np.offerId = offerId;
    this.np.design = defaultDesign(def.category);
    this.np.seats = this.seatsFor(def, state);
    this.np.crew = new Set();
    this.np.crewTouched = false;
    this.npSuggestCrew(state);
  }

  /** Everybody free, best match for this genre first — the picker's order, and the suggestion's. */
  private rankedFree(def: ProjectDef, state: GameState) {
    return state.runtime.members
      .filter((m) => !m.team)
      .map((m) => ({ m, match: categoryAffinity(MEMBER_DATA[m.id]?.passions ?? {}, def.category) }))
      .sort((a, b) => b.match - a.match);
  }

  /**
   * Open the crew step on the obvious answer: the proposer if there is one, then the best
   * matches up to the seats. A crew the player has touched is never suggested over (§4c) —
   * stepping back and forth must not undo a hand-picked crew.
   */
  private npSuggestCrew(state: GameState) {
    const def = this.npDef();
    if (!def) return;
    const free = new Set(state.runtime.members.filter((m) => !m.team).map((m) => m.id));
    const crew = new Set([...this.np.crew].filter((id) => free.has(id)));
    const proposer = this.npProposer(state);
    if (proposer && free.has(proposer)) crew.add(proposer);
    if (!this.np.crewTouched) {
      for (const { m } of this.rankedFree(def, state)) {
        if (crew.size >= this.np.seats) break;
        crew.add(m.id);
      }
    }
    // Fewer seats than people ticked: the weakest matches give theirs up first.
    const order = this.rankedFree(def, state).map((r) => r.m.id);
    while (crew.size > this.np.seats) {
      const drop = [...crew]
        .filter((id) => id !== proposer)
        .sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];
      if (!drop) break;
      crew.delete(drop);
    }
    this.np.crew = crew;
  }

  private npProposer(state: GameState): string | null {
    const offer = this.np.offerId ? state.backlog.find((e) => e.id === this.np.offerId) : null;
    return offer?.proposerId ?? null;
  }

  /** Step 1: what kind of work — and what the market thinks of it this week. */
  private npGenreStep(state: GameState): string {
    const available = this.availableDefs(state);
    const tiles = CATEGORY_ORDER.map((category) => {
      const count = available.filter((def) => def.category === category).length;
      const profile = profileOf(category);
      return `<button class="ui-option" data-action="np-genre" data-value="${category}"
        ${count ? '' : 'disabled'}>
        <div class="ui-option__head">
          <span class="icon-chip" style="--tone:${profile.accent}">${icon(CATEGORY_ICON[category], 'ui-icon ui-icon--lg')}</span>
          <span class="ui-title">${profileOf(category).label}</span>
          <span class="ui-badge">${count || '—'}</span>
        </div>
        <span class="ui-option__desc ui-clamp-2">${esc(profileOf(category).blurb)}</span>
        ${demandBadge(state.market[category] ?? 1)}
      </button>`;
    }).join('');

    const offers = state.backlog.length;
    return `
      ${
        offers
          ? `<button class="ui-row offers-row" data-action="np-genre" data-value="offers">
              <span class="icon-chip" style="--tone:var(--primary)">${icon('mail', 'ui-icon ui-icon--lg')}</span>
              <span class="ui-row__main">
                <span class="ui-title">${t('build.np.offers')}</span>
                <p class="ui-desc" style="margin:3px 0 0">${t('build.np.offersHint')}</p>
              </span>
              <span class="ui-badge ui-badge--accent">${t('build.np.offersWaiting', { count: offers })}</span>
              <span class="ui-row__chevron">${icon('chevronRight')}</span>
            </button>
            <hr class="ui-sep" />`
          : ''
      }
      <div class="ui-grid ui-grid--3">${tiles}</div>
    `;
  }

  /** Step 2: the brief — what somebody wants built, and what it is worth to them. */
  private npBriefStep(state: GameState): string {
    if (this.np.genre === 'offers') {
      return `<div class="ui-label" style="margin-bottom:9px">${t('build.np.offers')}</div>
        ${state.backlog.map((entry) => this.briefRow(CATALOG_MAP[entry.defId], state, entry)).join('')}`;
    }
    const category = this.np.genre as ProjectCategory;
    const defs = this.availableDefs(state)
      .filter((def) => def.category === category)
      .sort((a, b) => a.teamSize - b.teamSize || a.payout - b.payout);
    return `
      <div class="row between" style="gap:10px;margin-bottom:11px">
        <span class="ui-label">${t('build.np.asking')}</span>
        <span class="row" style="gap:6px">${categoryChip(category)}${demandBadge(state.market[category] ?? 1)}</span>
      </div>
      ${defs.length ? defs.map((def) => this.briefRow(def, state)).join('') : `<p class="ui-desc">${t('build.np.nothingInGenre')}</p>`}`;
  }

  private briefRow(def: ProjectDef, state: GameState, entry?: BacklogEntry): string {
    const badge = entry ? SOURCE_BADGE[entry.source] : null;
    const missing = missingMachines(def, state.ownedMachines);
    const profile = profileOf(def.category);
    const printHours = def.parts.reduce((sum, part) => sum + part.hours, 0);
    return `<button class="ui-row" data-action="np-brief"
      data-id="${def.id}" data-id2="${entry?.id ?? ''}" ${missing.length ? 'disabled' : ''}>
      <span class="icon-chip" style="--tone:${profile.accent}">${icon(CATEGORY_ICON[def.category], 'ui-icon ui-icon--lg')}</span>
      <span class="ui-row__main">
        <span class="row between" style="gap:8px">
          <span class="ui-title">${esc(def.name)}</span>
          ${badge?.label ? `<span class="ui-badge ui-badge--accent">${t(badge.label)}</span>` : ''}
        </span>
        <p class="ui-desc ui-clamp-2" style="margin:4px 0 0">${esc(def.blurb)}</p>
        <span class="ui-row__meta">
          ${tierBadge(def.tier)}
          <span class="ui-badge ui-badge--tone" style="--tone:var(--primary)" title="${esc(t('build.np.scopedForHint'))}">
            ${icon('users')}${t('build.np.scopedFor', { count: def.teamSize })}
          </span>
          ${
            def.payout
              ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)" title="${esc(t('build.np.payoutHint'))}">${icon('coins')}${money(def.payout)}</span>`
              : `<span class="ui-badge">${icon('coins')}${t('build.np.keepIt')}</span>`
          }
          <span class="ui-badge" title="${esc(t('build.np.hypeHint'))}">${icon('flame')}${num(def.hype)}</span>
          <span class="ui-badge" title="${esc(t('build.np.machineTimeHint'))}">${icon('printer')}${printHours ? hours(printHours) : t('build.np.none')}</span>
          <span class="ui-badge" title="${esc(t('build.np.bomHint'))}">
            ${icon('package')}${def.bomCost ? `${money(def.bomCost)} · ${t('build.days', { days: def.leadDays })}` : t('build.np.none')}
          </span>
        </span>
        ${entry ? this.offerMeta(entry, state) : ''}
        ${
          missing.length
            ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning);margin-top:6px"
                 title="${esc(t('build.np.needsHint'))}">
                 ${icon('printer')}${t('build.np.needs', { machines: missing.map((m) => MACHINE_LABEL[m]).join(' + ') })}
               </span>`
            : ''
        }
      </span>
      <span class="ui-row__chevron">${icon('chevronRight')}</span>
    </button>`;
  }

  /** Step 3: how it gets built. Three decisions, each a one-, three- or five-star option. */
  /** Skills of the crew picked on the step before — what the design options are gated on. */
  private npCrewSkills(state: GameState): { skills: Record<SkillKey, number> }[] {
    return [...this.np.crew]
      .map((id) => state.runtime.members.find((m) => m.id === id))
      .filter((m): m is MemberSnapshot => !!m)
      .map((m) => ({ skills: m.skills }));
  }

  /** Drop any choice the crew can no longer back to the best it can (§4c). */
  private npFitDesign(state: GameState) {
    const def = this.npDef();
    if (!def) return;
    const crew = this.npCrewSkills(state);
    const design = { ...this.np.design };
    for (const axis of CATEGORY_AXES[def.category]) {
      let index = Math.round(design[axis] ?? 1);
      while (index > 0 && !optionAvailable(axis, index, crew)) index -= 1;
      design[axis] = index;
    }
    // Then what the space can pay for: the design budget is spent at the pitch, so a plan
    // the overdraft cannot cover is not a plan (§7a). Cheapen the dearest axis first.
    const tooling = () => planProject(def, { design, seats: this.np.seats }, state.ownedMachines, state.licences).tooling;
    for (const axis of CATEGORY_AXES[def.category]) {
      while ((design[axis] ?? 1) > 0 && !this.affordable(state, tooling())) design[axis] = (design[axis] ?? 1) - 1;
    }
    this.np.design = design;
  }

  /** What the design budget would be with one axis switched to another option. */
  private npToolingWith(def: ProjectDef, state: GameState, axis: DesignAxisId, index: number): number {
    const design = { ...this.np.design, [axis]: index };
    return planProject(def, { design, seats: this.np.seats }, state.ownedMachines, state.licences).tooling;
  }

  /** Step 4: how it gets built — three decisions, and the crew decides what is on offer. */
  private npDesignStep(state: GameState): string {
    const def = this.npDef();
    if (!def) return `<p class="empty">${t('build.np.pickBrief')}</p>`;
    const crew = this.npCrewSkills(state);
    const axes = CATEGORY_AXES[def.category];
    const sections = axes
      .map((axisId) => {
        const axis = AXES[axisId];
        const chosen = Math.round(this.np.design[axisId] ?? 1);
        const best = crewBest(crew, axis.skill);
        const skillName = t(`build.skill.${axis.skill}` as MessageKey);
        const cards = axis.options
          .map((option, index) => {
            const missing = (option.requires ?? []).filter((m) => !state.ownedMachines.includes(m));
            const skilled = optionAvailable(axisId, index, crew);
            const on = index === chosen;
            // Unaffordable is locked too, and says so here rather than at the pitch: the
            // wizard used to let a plan through that the overdraft could not pay for, and the
            // refusal arrived afterwards as a log line (§7a).
            const tooling = this.npToolingWith(def, state, axisId, index);
            const pricey = !this.affordable(state, tooling);
            const locked = missing.length > 0 || !skilled || pricey;
            const why = missing.length
              ? t('build.np.needsMachine', { machines: missing.map((m) => MACHINE_LABEL[m]).join(' + ') })
              : !skilled
                ? t('build.np.needsSkill', { skill: skillName, level: optionNeeds(option) })
                : pricey
                  ? t('build.np.cantAfford', { cost: tooling })
                  : '';
            return `<button class="ui-option design-option ${on ? 'ui-option--on' : ''} ${locked ? 'design-option--locked' : ''}"
              data-action="np-option" data-value="${axisId}" data-id="${index}"
              aria-pressed="${on}" ${locked ? 'disabled' : ''} title="${esc(why)}">
              <span class="row between" style="width:100%">
                <span class="ui-title">${esc(option.label)}</span>
                ${starRow(option.stars)}
              </span>
              <span class="ui-option__desc ui-clamp-3">${esc(option.blurb)}</span>
              <span class="ui-row__meta" style="margin:0">${optionEffects(option, this.np.seats, def, axisId, index, state.licences)}</span>
              ${
                locked
                  ? `<span class="design-lock">${icon('x')}${esc(why)}</span>`
                  : ''
              }
            </button>`;
          })
          .join('');
        return `<div class="design-axis">
          <div class="design-axis__head">
            <span class="ui-label">${esc(axis.label)}</span>
            <span class="ui-desc">${esc(axis.question)}</span>
            <span class="ui-badge" style="margin-left:auto" title="${esc(t('build.np.crewBestHint'))}">
              ${t('build.np.crewBest', { skill: skillName, level: best })}
            </span>
          </div>
          <div class="ui-grid ui-grid--3">${cards}</div>
        </div>`;
      })
      .join('');
    return `${this.npHeader(def)}${sections}`;
  }

  /** The brief being designed, as a line at the top of each step after it. */
  private npHeader(def: ProjectDef): string {
    const profile = profileOf(def.category);
    return `<div class="row" style="gap:11px;margin-bottom:12px">
      <span class="icon-chip" style="--tone:${profile.accent};width:36px;height:36px">
        ${icon(CATEGORY_ICON[def.category], 'ui-icon ui-icon--lg')}
      </span>
      <div style="flex:1;min-width:0">
        <div class="row between" style="gap:8px">
          <span class="ui-title" style="font-size:15px">${esc(def.name)}</span>
          ${categoryChip(def.category)}
        </div>
        <p class="ui-desc ui-clamp-2" style="margin:2px 0 0">${esc(def.blurb)}</p>
      </div>
    </div>`;
  }

  /** Step 3: how many seats, and who is asked to fill them. */
  private npCrewStep(state: GameState): string {
    const def = this.npDef();
    if (!def) return `<p class="empty">${t('build.np.pickBrief')}</p>`;
    const max = this.maxSeats(state);
    const fit = teamFit(this.np.seats, def.teamSize);

    const fitTone = fit.quality >= 0.04 ? 'var(--success)' : fit.quality <= -0.04 ? 'var(--destructive)' : 'var(--muted-foreground)';
    const fitCard = `<div class="ui-card fit-card">
      <div class="row between" style="gap:10px">
        <span class="ui-label">${t('build.np.crewSize')}</span>
        <span class="ui-badge ui-badge--tone" style="--tone:${fitTone}" title="${esc(t('build.np.fitQualityHint'))}">
          ${icon('star')}${t('build.np.fitQuality', { value: `${fit.quality >= 0 ? '+' : '−'}${Math.round(Math.abs(fit.quality) * 100)}` })}
        </span>
      </div>
      ${fitMeter(def.teamSize, this.np.seats, max)}
      <p class="ui-desc" style="margin:8px 0 0"><b>${t('build.people', { count: this.np.seats })} · ${fitLabel(this.np.seats, def.teamSize)}.</b>
        ${t('build.np.fitExplain', { count: def.teamSize })}</p>
    </div>`;

    const free = this.rankedFree(def, state);
    const proposer = this.npProposer(state);
    const axes = CATEGORY_AXES[def.category];
    const picker = free.length
      ? `<div class="ui-card" style="padding:11px;margin-top:10px">
          <div class="row between" style="margin-bottom:8px;gap:10px">
            <span class="ui-label" data-crew="${this.np.crew.size}/${this.np.seats}">${t('build.np.ask', { picked: this.np.crew.size, seats: this.np.seats })}</span>
            <span class="ui-desc" style="font-size:10.5px;margin:0">${t('build.np.starsLegend', {
              axes: axes.map((axis) => AXES[axis].label).join(' · '),
            })}</span>
          </div>
          <div class="crew-grid">
            ${free
              .slice(0, 15)
              .map(({ m, match }) => {
                const on = this.np.crew.has(m.id);
                const locked = m.id === proposer;
                const full = !on && this.np.crew.size >= this.np.seats;
                // What this person would let the crew choose on each of the three decisions:
                // the star figure is the average, the tooltip is the breakdown.
                const rating = genreStars(m.skills, def.category);
                const breakdown = rating.axes
                  .map((a) => `${AXES[a.axis].label} ${'★'.repeat(a.stars)} (${t(`build.skill.${a.skill}` as MessageKey)} ${a.level})`)
                  .join('\n');
                const tip = locked
                  ? t('build.np.proposerLocked')
                  : `${t('build.np.match', { genre: profileOf(def.category).label, match: pct(match) })}${m.present ? '' : ` · ${t('build.np.notIn')}`}\n${breakdown}`;
                return `<button class="crew-pick" aria-pressed="${on}" ${full || locked ? 'disabled' : ''}
                  data-action="np-crew" data-id="${m.id}" title="${esc(tip)}">
                  <span class="crew-pick__name">${icon(on ? 'check' : 'plus')}${esc(m.name)}</span>
                  <span class="crew-pick__meta">
                    ${starRow(rating.stars)}
                    <span class="crew-pick__axes">${rating.axes.map((a) => `<i class="axis-dot axis-dot--${a.stars}">${a.stars}</i>`).join('')}</span>
                    <span class="mono">${pct(match)}</span>
                  </span>
                </button>`;
              })
              .join('')}
          </div>
        </div>`
      : `<div class="ui-card" style="padding:11px;margin-top:10px">
          <p class="ui-desc" style="margin:0">${t('build.np.everyoneBusy')}</p>
        </div>`;

    return `${this.npHeader(def)}
      ${fitCard}
      ${picker}
      ${
        max < 5
          ? `<p class="ui-desc" style="margin:10px 0 0;font-size:10.5px">${icon('table')} ${t('build.np.largeHint', {
              table: `<b>${esc(FURNITURE_MAP['table-large'].name)}</b>`,
              build: `<b>${t('build.bar.build')}</b>`,
            })}</p>`
          : ''
      }`;
  }

  /** Step 5: everything the plan works out to, and the button. */
  private npReviewStep(state: GameState): string {
    const def = this.npDef();
    if (!def) return `<p class="empty">${t('build.np.pickBrief')}</p>`;
    const entry = this.np.offerId ? state.backlog.find((e) => e.id === this.np.offerId) : undefined;
    const plan = this.npPlan();
    const summary = planProject(def, plan, state.ownedMachines, state.licences);
    const crew = [...this.np.crew]
      .map((id) => state.runtime.members.find((m) => m.id === id))
      .filter((m): m is MemberSnapshot => !!m);

    // What the crew's craft is likely to be, from the skill the design stage leans on.
    const skill = stageSkill(def.category, 'cad');
    const craft = crew.length && skill
      ? crew.reduce((sum, m) => sum + (MEMBER_DATA[m.id]?.skills[skill] ?? 2), 0) / crew.length / 5
      : 0.5;
    const team = teamFit(Math.max(1, crew.length || plan.seats), def.teamSize);
    const quality = Math.max(0.05, Math.min(1, craft + summary.designQuality + team.quality));
    const demand = state.market[def.category] ?? 1;
    const built = state.shipped.filter((r) => r.defId === def.id).length;
    const novelty = Math.max(REPEAT.floor, REPEAT.falloff ** built);
    const payout = Math.round(def.payout * novelty * demand * summary.appeal * qualityPay(quality));
    const hype = Math.round(def.hype * (entry?.hypeMultiplier ?? 1) * novelty * Math.sqrt(summary.appeal) * qualityHype(quality));
    const cost = summary.bomCost + summary.tooling;
    const handWork = STAGE_ORDER.reduce((sum, key) => sum + summary.work[key], 0);
    const machineHours = summary.parts.reduce((sum, part) => sum + part.hours, 0);

    const table = state.runtime.tables
      .filter((t) => t.seats >= plan.seats)
      .sort((a, b) => Number(!!a.projectId) - Number(!!b.projectId) || a.seats - b.seats)[0];
    const tableLine = esc(
      table
        ? t(table.projectId ? 'build.review.tableBusy' : 'build.review.tableFree', { table: table.label })
        : t('build.review.noTable'),
    );

    const stat = (label: string, value: string, hint = '') =>
      `<div class="review-stat" title="${esc(hint)}"><span class="ui-label">${label}</span><span class="review-stat__value">${value}</span></div>`;

    const designLines = CATEGORY_AXES[def.category]
      .map((axisId) => {
        const option = optionOf(axisId, plan.design);
        return `<div class="breakdown-row"><span>${esc(AXES[axisId].label)}</span>
          <span class="row" style="gap:6px"><span class="mono">${esc(option.label)}</span>${starRow(option.stars)}</span></div>`;
      })
      .join('');

    // The design budget is paid at the pitch and refused past the overdraft, so a plan it
    // cannot cover must not reach a Start button that looks like it will work.
    const broke = summary.tooling > 0 && !this.affordable(state, summary.tooling);
    const blocked = summary.missing.length > 0 || plan.seats > this.maxSeats(state) || broke;
    return `${this.npHeader(def)}
      <div class="review-grid">
        ${stat(t('build.review.quality'), `${starRow(qualityStars(quality))}<span class="mono">${pct(quality)}</span>`, t('build.review.qualityHint'))}
        ${stat(t('build.review.market'), demandBadge(demand), t('build.review.marketHint'))}
        ${stat(t('build.review.pays'), `<span class="mono">~${money(payout)}</span>`, t('build.review.paysHint'))}
        ${stat(t('build.review.reputation'), `<span class="mono">~${num(hype)}</span>`, t('build.review.reputationHint'))}
      </div>
      ${entry ? this.offerMeta(entry, state) : ''}
      <div class="breakdown" style="margin-top:12px">
        <div>
          <div class="ui-label" style="margin-bottom:6px">${t('build.review.design')}</div>
          ${designLines}
          <div class="breakdown-row"><span>${t('build.review.crew')}</span><span class="mono">${num(plan.seats)} · ${esc(fitLabel(Math.max(1, crew.length || plan.seats), def.teamSize))}</span></div>
          <div class="breakdown-row"><span>${t('build.review.kickoff')}</span><span class="mono">${tableLine}</span></div>
        </div>
        <div>
          <div class="ui-label" style="margin-bottom:6px">${t('build.review.commitment')}</div>
          <div class="breakdown-row"><span>${t('build.review.handWork')}</span><span class="mono">${num(handWork)}</span></div>
          <div class="breakdown-row"><span>${t('build.review.machineTime')}</span><span class="mono">${machineHours ? hours(machineHours) : t('build.np.none')}</span></div>
          <div class="breakdown-row"><span>${t('build.review.parts')}</span><span class="mono">${summary.bomCost ? `${money(summary.bomCost)} · ${t('build.days', { days: summary.leadDays })}` : t('build.np.none')}</span></div>
          <div class="breakdown-row"><span>${t('build.review.licences')}</span><span class="mono">${summary.tooling ? money(summary.tooling) : t('build.np.none')}</span></div>
          <div class="breakdown-row"><span>${t('build.review.testRisk')}</span><span class="mono">×${num(Number(summary.testRisk.toFixed(2)))}${summary.skipSim ? ` · ${t('build.review.noSim')}` : ''}</span></div>
        </div>
      </div>
      <p class="ui-desc" style="margin:10px 0 0">
        ${esc(crew.length ? t('build.review.asking', { names: crew.map((m) => m.name).join(', ') }) : t('build.review.nobodyAsked'))}
        ${this.npProposer(state) ? esc(t('build.review.proposerSigns')) : ''}
      </p>
      <button class="ui-btn ui-btn--primary ui-btn--lg pitch-cta" data-action="np-start" ${blocked ? 'disabled' : ''}>
        ${esc(t('build.review.start', { project: def.name }))}${cost ? ` · ${money(cost)}` : ''}
      </button>
      ${
        broke
          ? `<p class="defect" style="margin:7px 0 0;text-align:center">
               ${icon('coins')} ${t('build.review.cantStart', { cost: summary.tooling, floor: ECONOMY.overdraftLimit })}
             </p>`
          : cost > 0
          ? `<p class="ui-desc" style="margin:7px 0 0;text-align:center;font-size:10.5px">
               ${t('build.review.leaves', { cash: state.cash - cost })}${this.affordable(state, cost) ? '' : ` — ${t('build.review.pastOverdraft')}`}
             </p>`
          : ''
      }`;
  }

  /** Projects the space could start right now: era-visible and not already running. */
  private availableDefs(state: GameState): ProjectDef[] {
    // Kit you do not own no longer hides a project — the card says what it needs instead.
    const active = new Set(state.runtime.projects.map((p) => p.defId));
    return catalogForEra(state.era).filter((def) => !active.has(def.id));
  }

  private offerMeta(entry: BacklogEntry, state: GameState): string {
    const proposer = entry.proposerId ? MEMBER_DATA[entry.proposerId]?.name : null;
    const daysLeft = entry.expiresOnDay ? entry.expiresOnDay - state.day : null;
    const bits = [
      proposer ? `<span class="ui-badge">${icon('users')}${esc(t('build.offer.proposer', { member: proposer }))}</span>` : '',
      entry.sponsorCash
        ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)">${icon('coins')}${t('build.offer.upFront', { cash: entry.sponsorCash })}</span>`
        : '',
      entry.hypeMultiplier
        ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${icon('flame')}${t('build.offer.hype', { multiplier: entry.hypeMultiplier })}</span>`
        : '',
      daysLeft !== null
        ? `<span class="ui-badge ${daysLeft <= 3 ? 'ui-badge--tone' : ''}" ${daysLeft <= 3 ? 'style="--tone:var(--destructive)"' : ''}>${icon('clock')}${t('build.offer.daysLeft', { days: daysLeft })}</span>`
        : '',
    ].filter(Boolean);
    return bits.length ? `<span class="ui-row__meta">${bits.join('')}</span>` : '';
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
    const training = this.trainingBlock(state);
    if (!projects.length) {
      this.setHTML(this.left, 'left', `
        <p class="empty">${t('ui.bench.empty')}</p>
        <p class="blurb">${t('ui.bench.emptyHint', { jobs: `<b>${t('build.bar.new')}</b>` })}</p>
        ${training}
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
      projects.map((p) => this.projectCard(p, state, p.id === open)).join('') + training,
    );
  }

  /**
   * Who is on a course, under the builds — a course has a percentage the way a project
   * does, so it belongs on the bench. **Absent when nobody is training**: a heading over
   * nothing is a permanent reminder of a feature, not information.
   */
  private trainingBlock(state: GameState): string {
    const learners = state.runtime.members.filter((m) => m.training);
    if (!learners.length) return '';
    return `<div class="bench-training">
      <div class="ui-label" style="margin-bottom:6px">${icon('book')}${t('build.bench.training')}</div>
      ${learners
        .map((m) => {
          const course = m.training!;
          const share = 1 - course.hoursLeft / Math.max(1, course.total);
          const level = m.skills[course.skill] ?? 0;
          return `<div class="trainee" title="${esc(t('build.bench.trainingHint', { hours: hours(course.hoursLeft) }))}${m.present ? '' : ` · ${esc(t('ui.bench.notInToday'))}`}">
            <span class="row between" style="gap:8px">
              <span class="trainee__name ${m.present ? '' : 'off'}">${esc(m.name)}</span>
              <span class="trainee__what">${t('build.bench.trainingLine', {
                skill: t(`build.skill.${course.skill}` as MessageKey),
                from: level,
                to: level + 1,
              })}</span>
              <span class="mono trainee__pct">${pct(share)}</span>
            </span>
            <span class="bar" style="margin-top:4px"><i style="width:${(share * 100).toFixed(1)}%"></i></span>
          </div>`;
        })
        .join('')}
    </div>`;
  }

  /**
   * Why a kickoff is not happening, if it is not (§4d). Worst first: a crew that can never
   * meet, then somebody not in, then no table free. Null when it is under way — or done.
   */
  private kickoffStatus(project: ProjectData, state: GameState): { text: string; tone: 'bad' | 'warn' | '' } | null {
    if (project.kickedOff || project.required.concept <= 0) return null;
    const crew = project.team
      .map((id) => state.runtime.members.find((m) => m.id === id))
      .filter((m): m is MemberSnapshot => !!m);
    const playerOn = state.runtime.player?.project === project.id;
    if (!crew.length && !playerOn) return null; // "nobody on it" says this already
    // You on top of a full table: say it the moment it happens, and say it is not a stall.
    if (playerOn && crew.length) {
      const booked = project.tableId ? state.runtime.tables.find((x) => x.id === project.tableId) : null;
      const seats = booked ? booked.seats : Math.max(0, ...state.runtime.tables.map((x) => x.seats));
      if (seats <= crew.length) {
        return {
          text: t('build.kick.noChairForYou', { seats, table: FURNITURE_MAP['table-large'].name }),
          tone: 'warn',
        };
      }
    }
    const away = crew.filter((m) => !m.present);
    if (away.length) {
      return { text: t('build.kick.notIn', { names: away.map((m) => m.name).join(', ') }), tone: 'warn' };
    }
    if (!project.tableId) return { text: t('build.kick.noTable'), tone: 'warn' };
    const table = state.runtime.tables.find((x) => x.id === project.tableId);
    return { text: t('build.kick.at', { table: table?.label ?? t('build.kick.theTable') }), tone: '' };
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
    // Only the stages this build actually goes through. A software build has no parts, so
    // its "build pipeline" never ran and never will; a skipped simulation is a decision
    // made at the pitch; and iterating only exists once a test has failed.
    const hasParts = (CATALOG_MAP[project.defId]?.parts.length ?? project.parts.length) > 0;
    const applies = (key: StageKey) =>
      key === 'fabrication'
        ? hasParts
        : key === 'simulation'
          ? !project.simulationSkipped && project.required.simulation > 0
          : key === 'iterate'
            ? project.stage === 'iterate' || project.progress.iterate > 0
            : true;
    const strip = STAGE_ORDER.filter(applies).map((key) => {
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
    const kickoff = this.kickoffStatus(project, state);
    const stop = shelving
      ? { text: t('ui.stop.shelvedIn', { days: SHELVE.afterIdleDays - project.idleDays }), tone: 'bad' }
      : kickoff?.tone
        ? kickoff
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
        ${
          // One rating for the build: the three design choices, averaged (§4c). Quality —
          // what the crew is actually making of it — is in the tooltip and on the detail.
          project.design && Object.keys(project.design).length
            ? `<span class="ui-badge" title="${esc(
                `${t('build.bench.rating')}\n${CATEGORY_AXES[project.category]
                  .map((axis) => `${AXES[axis].label}: ${optionOf(axis, project.design).label} ${'★'.repeat(optionOf(axis, project.design).stars)}`)
                  .join('\n')}\n${t('ui.bench.qualityHint')}: ${pct(project.quality)}`,
              )}">${starRow(designStars(project.category, project.design))}</span>`
            : `<span class="ui-badge" title="${esc(t('ui.bench.qualityHint'))}">
                ${starRow(qualityStars(project.quality))}${pct(project.quality)}
              </span>`
        }
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
      ${
        kickoff
          ? `<div class="kickoff-line ${kickoff.tone}">${icon('table')}<span>${esc(kickoff.text)}</span>
               <span class="kickoff-line__hint">${
                 kickoff.tone === 'bad' ? t('build.kick.hintBounty') : t('build.kick.hintEveryone')
               }</span></div>`
          : ''
      }

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

  // --- machines -------------------------------------------------------------

  /** The shop floor: every machine, what it is chewing on, and what is behind it. */
  // --- Build: the room itself (§4d, §7b) -----------------------------------

  /**
   * Everything that stands in the room, on three shelves. **Workspace** is where work
   * happens — project tables and workstations, one person to a seat, so it is also where a
   * queue gets fixed. **Comforts** is the Shop as it was: kit for the people. **Decor** is
   * the small stuff that makes it somewhere you would want to be.
   *
   * Every card carries a picture of the thing, rendered from the same model that stands in
   * the room — a list of names is a spreadsheet, and this is a shop.
   */
  private buildBody(state: GameState): { head: string; content: string; foot: string } {
    const waiting = Object.values(state.runtime.waitingFor).reduce((n, v) => n + (v ?? 0), 0);
    const tabs = [
      { key: 'workspace' as const, label: t('build.panel.workspace'), count: FURNITURE.length },
      { key: 'printers' as const, label: t('build.panel.printers'), count: PRINTERS.length },
      { key: 'comfort' as const, label: t('build.panel.comfort'), count: AMENITIES.filter((a) => a.group !== 'decor').length },
      { key: 'decor' as const, label: t('build.panel.decor'), count: AMENITIES.filter((a) => a.group === 'decor').length },
    ];
    const chips = `<div class="ui-segmented" style="margin-bottom:12px">
      ${tabs
        .map(
          (t) => `<button data-action="build-tab" data-value="${t.key}" aria-pressed="${t.key === this.buildTab}">
            ${t.label}<span class="seg-count">${t.count}</span>
          </button>`,
        )
        .join('')}
    </div>`;

    const content =
      this.buildTab === 'workspace'
        ? this.workspaceShelf(state)
        : this.buildTab === 'printers'
          ? this.printerShelf(state)
          : this.buildTab === 'comfort'
          ? this.comfortShelf(state)
          : this.decorShelf(state);

    return {
      head: `<div class="modal-head">${icon('hammer', 'ui-icon ui-icon--lg')}<b>${t('build.panel.title')}</b>
        ${
          waiting
            ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${t('build.panel.queue', { count: waiting })}</span>`
            : ''
        }
      </div>`,
      content: chips + content,
      foot: `<span class="ui-desc" style="font-size:10.5px">${t('build.panel.foot')}</span>`,
    };
  }

  private workspaceShelf(state: GameState): string {
    const seats = state.runtime.seats;
    const wait = state.runtime.waitingFor;
    const line = (type: MachineType, label: MessageKey) => {
      const queue = wait[type] ?? 0;
      return `<span class="ui-badge ${queue ? 'ui-badge--tone' : ''}" ${queue ? 'style="--tone:var(--warning)"' : ''}
        title="${esc(queue ? t('build.seats.waitingHint', { count: queue }) : t('build.seats.hint'))}">
        ${t(label as 'build.seats.software', { count: seats[type] ?? 0 })}${queue ? ` · ${t('build.seats.waiting', { count: queue })}` : ''}
      </span>`;
    };
    const tables = state.runtime.tables;
    const summary = `<div class="ui-row" style="margin-bottom:12px;cursor:default">
      <span class="icon-chip" style="--tone:var(--primary)">${icon('users', 'ui-icon ui-icon--lg')}</span>
      <div class="ui-row__main">
        <b class="ui-title">${t('build.seats.title')}</b>
        <span class="ui-row__meta" style="margin-top:4px">
          ${line('cad-desk', 'build.seats.software')}
          ${line('bench', 'build.seats.hardware')}
          ${line('assembly', 'build.seats.assembly')}
          <span class="ui-badge" title="${esc(t('build.seats.tablesHint'))}">
            ${icon('table')}${t('build.seats.tables', { count: tables.length, used: tables.filter((x) => x.projectId).length })}
          </span>
        </span>
      </div>
    </div>`;
    const cards = FURNITURE.map((def) => this.furnitureCard(def, state)).join('');
    return `${summary}<div class="ui-grid ui-grid--3">${cards}</div>`;
  }

  private furnitureCard(def: FurnitureDef, state: GameState): string {
    const owned = ownedFurniture(state, def);
    const locked = def.era > state.era;
    const afford = this.affordable(state, def.price);
    const room = this.handlers.furnitureFits(def.type, def.span);
    const queue = state.runtime.waitingFor[def.type] ?? 0;
    const buyable = !locked && afford && room;
    return `<button class="ui-option build-card ${owned ? 'build-card--owned' : ''}" data-action="buy-furniture" data-value="${def.id}"
      ${buyable ? '' : 'disabled'}
      title="${esc(locked ? t('build.card.comesWith', { era: eraDef(def.era).name }) : !room ? t('build.card.noRoomHint') : !afford ? t('build.card.notEnough') : t('build.card.price', { price: def.price }))}">
      ${this.thumb(`furniture:${def.id}`, def.icon)}
      <div class="ui-option__head">
        <span class="ui-title">${esc(def.name)}</span>
        ${owned ? `<span class="build-owned">${icon('check')}${t('build.card.ownedN', { count: owned })}</span>` : ''}
      </div>
      <span class="ui-option__desc ui-clamp-2">${esc(def.blurb)}</span>
      <span class="ui-row__meta" style="margin:0">
        <span class="ui-badge">${icon('users')}${t('build.card.seats', { count: furnitureSeats(def) })}</span>
        <span class="ui-badge">${esc(def.use)}</span>
        ${queue ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${t('build.seats.waiting', { count: queue })}</span>` : ''}
      </span>
      <span class="ui-row__meta" style="margin:0">
        <span class="ui-badge ui-badge--tone" style="--tone:var(--${afford ? 'success' : 'destructive'})">
          ${icon('coins')}${money(def.price)}
        </span>
        ${!room && !locked ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${t('build.card.noRoom')}</span>` : ''}
      </span>
    </button>`;
  }

  /**
   * Printers, on their own shelf (§4d) — bought here rather than from the Machines panel,
   * which is for watching what is on the floor. Every model is listed, the ones the lease
   * does not allow yet included: a machine you cannot see is one you cannot plan for.
   */
  private printerShelf(state: GameState): string {
    const room = this.handlers.buyablePrinters().length > 0;
    const cards = PRINTERS.map((model) => {
        const owned = state.runtime.machines.filter((m) => m.label === model.name).length;
        const locked = model.era > state.era;
        const afford = this.affordable(state, model.price);
        const ok = !locked && afford && room;
        return `<button class="ui-option build-card ${owned ? 'build-card--owned' : ''}" data-action="buy-printer"
          data-value="${model.id}" ${ok ? '' : 'disabled'}
          title="${esc(locked ? t('build.card.comesWith', { era: eraDef(model.era).name }) : !room ? t('build.card.noRoomHint') : !afford ? t('build.card.notEnough') : t('build.card.price', { price: model.price }))}">
          ${this.thumb(`printer:${model.id}`, 'printer')}
          <div class="ui-option__head">
            <span class="ui-title">${esc(model.name)}</span>
            ${owned ? `<span class="build-owned">${icon('check')}${t('build.card.ownedN', { count: owned })}</span>` : ''}
          </div>
          <span class="ui-option__desc ui-clamp-2">${esc(model.blurb)}</span>
          <span class="ui-row__meta" style="margin:0">
            <span class="ui-badge" title="${esc(t('ui.machines.speedHint'))}">${icon('effort')}${Math.round(model.speed * 100)}%</span>
            <span class="ui-badge" title="${esc(t('ui.machines.capacityHint'))}">${icon('package')}${t('ui.machines.kg', { kg: model.capacity / 1000 })}</span>
            <span class="ui-badge">${t('build.printer.fails', { pct: `×${model.reliability.toFixed(2)}` })}</span>
          </span>
          <span class="ui-row__meta" style="margin:0">
            <span class="ui-badge ui-badge--tone" style="--tone:var(--${afford ? 'success' : 'destructive'})">${icon('coins')}${money(model.price)}</span>
            ${locked ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${icon('clock')}${t('build.card.era', { era: model.era })}</span>` : ''}
            ${!room && !locked ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${t('build.card.noRoom')}</span>` : ''}
          </span>
        </button>`;
      })
      .join('');
    return `<p class="ui-desc" style="margin:0 0 11px">${t('build.printer.intro')}</p>
      <div class="ui-grid ui-grid--3">${cards}</div>`;
  }

  /**
   * The comforts, grouped by the lease that unlocks them. **The grouping is the point**: it
   * is the one screen that says out loud what signing the next lease gets you (§7b).
   */
  private comfortShelf(state: GameState): string {
    const owned = state.amenities;
    const comforts = comfortsOf(owned);
    const pctOf = (value: number) => `${value > 1 ? '+' : '−'}${Math.round(Math.abs(value - 1) * 100)}%`;
    const summary = owned.length
      ? `<div class="ui-row" style="margin-bottom:12px;cursor:default">
          <span class="icon-chip" style="--tone:var(--success)">${icon('users', 'ui-icon ui-icon--lg')}</span>
          <div class="ui-row__main">
            <b class="ui-title">${t('build.comfort.title')}</b>
            <span class="ui-row__meta" style="margin-top:4px">
              <span class="ui-badge ui-badge--accent" title="${esc(t('build.comfort.moodHint'))}">
                ${icon('effort')}${t('build.effect.mood', { value: num(Number(comforts.mood.toFixed(1))) })}
              </span>
              ${comforts.focus !== 1 ? `<span class="ui-badge">${t('build.effect.focus', { value: pctOf(comforts.focus) })}</span>` : ''}
              ${comforts.rest !== 1 ? `<span class="ui-badge">${t('build.effect.rest', { value: pctOf(comforts.rest) })}</span>` : ''}
              ${comforts.fatigue !== 1 ? `<span class="ui-badge">${t('build.effect.fatigue', { value: pctOf(comforts.fatigue) })}</span>` : ''}
              ${comforts.drift !== 1 ? `<span class="ui-badge">${t('build.effect.drift', { value: pctOf(comforts.drift) })}</span>` : ''}
              ${comforts.draw !== 1 ? `<span class="ui-badge">${t('build.effect.draw', { value: pctOf(comforts.draw) })}</span>` : ''}
            </span>
          </div>
          <span class="ui-badge ui-badge--tone" style="--tone:var(--warning)" title="${esc(t('build.card.perMonthHint'))}">
            ${icon('coins')}${t('build.card.perMonth', { upkeep: comforts.upkeep })}
          </span>
        </div>`
      : '';
    const groups = [1, 2, 3, 4]
      .map((era) => {
        const items = AMENITIES.filter((a) => a.era === era && a.group !== 'decor');
        if (!items.length) return '';
        const locked = era > state.era;
        return `<div class="ui-label" style="margin:${era === 1 ? 0 : 16}px 0 9px">
            ${esc(eraDef(era).name)}
            ${locked ? `<span class="ui-badge" style="margin-left:7px">${icon('clock')}${t('build.card.notYours')}</span>` : ''}
          </div>
          <div class="ui-grid ui-grid--3">${items.map((a) => this.amenityCard(a, state)).join('')}</div>`;
      })
      .join('');
    return summary + groups;
  }

  /** The small stuff. Cheap, mostly free to run, and all of it through the same mood curve. */
  private decorShelf(state: GameState): string {
    const items = AMENITIES.filter((a) => a.group === 'decor');
    return `<p class="ui-desc" style="margin:0 0 11px">${t('build.decor.intro')}</p>
      <div class="ui-grid ui-grid--3">${items.map((a) => this.amenityCard(a, state)).join('')}</div>`;
  }

  /** A picture of the thing, or its icon while there is no renderer to draw one. */
  private thumb(key: string, fallback: IconName): string {
    const src = this.handlers.thumbnail(key);
    return `<span class="build-thumb">${
      src ? `<img src="${src}" alt="" draggable="false" />` : icon(fallback, 'ui-icon build-thumb__icon')
    }</span>`;
  }

  private amenityCard(def: AmenityDef, state: GameState): string {
    const owned = state.amenities.includes(def.id);
    const locked = def.era > state.era;
    const afford = this.affordable(state, def.price);
    const buyable = !owned && !locked && afford;
    return `<button class="ui-option build-card ${owned ? 'build-card--owned' : ''}" data-action="buy-amenity"
      data-value="${def.id}" ${buyable ? '' : 'disabled'}
      title="${esc(
        owned
          ? t('build.card.alreadyIn')
          : locked
            ? t('build.card.comesWith', { era: eraDef(def.era).name })
            : afford
              ? def.upkeep
                ? t('build.card.priceUpkeep', { price: def.price, upkeep: def.upkeep })
                : t('build.card.price', { price: def.price })
              : t('build.card.notEnough'),
      )}">
      ${this.thumb(`amenity:${def.id}`, def.icon)}
      <div class="ui-option__head">
        <span class="ui-title">${esc(def.name)}</span>
        ${owned ? `<span class="build-owned">${icon('check')}${t('build.card.owned')}</span>` : ''}
      </div>
      <span class="ui-option__desc ui-clamp-2">${esc(def.blurb)}</span>
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
            ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--warning)">${icon('clock')}${t('build.card.era', { era: def.era })}</span>`
            : ''
        }
        ${
          def.upkeep
            ? `<span class="ui-badge" title="${esc(t('build.card.perMonthHint'))}">${t('build.card.perMonth', { upkeep: def.upkeep })}</span>`
            : ''
        }
      </span>
    </button>`;
  }

  private machinesBody(state: GameState): { head: string; content: string; foot: string } {
    const machines = state.runtime.machines;
    const running = machines.filter((m) => m.current).length;
    const queued = machines.reduce((n, m) => n + m.queue.length, 0);
    // Buying printers moved to Build (§4d): this panel is for what is on the floor.
    const shop = `<p class="ui-desc" style="margin:12px 0 0">${t('build.machines.buyInBuild', {
      build: `<b>${t('build.bar.build')}</b>`,
    })}</p>`;

    /**
     * **A printer is a row, not a card** — the panel used to spend a 700-pixel card on each
     * one, with three labelled boxes of which two were mostly empty. Four printers on the
     * wall is a comparison (which is idle, which is out of filament), and comparison is a
     * table's job (§11). The queue hangs under its printer only when there is one.
     */
    const content =
      (machines.length
        ? `<table class="rank-table machine-table">
            <thead><tr>
              <th class="space-head">${t('build.machines.col.printer')}</th>
              <th>${t('ui.machine.now')}</th>
              <th>${t('ui.machine.calibration')}</th>
              <th>${t('ui.machine.filament')}</th>
              <th></th>
            </tr></thead>
            <tbody>${machines.map((m) => this.machineRow(m, state)).join('')}</tbody>
          </table>`
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

  private machineRow(machine: MachineSnapshot, state: GameState): string {
    const projectName = (id: string) => state.runtime.projects.find((p) => p.id === id)?.name ?? '';
    const job = machine.current;
    const calLow = machine.calibration < MACHINE.calibrationWarning;
    const filamentLow = machine.consumableMax > 0 && machine.consumable < FILAMENT.lowWarning;
    const riskTone = machine.risk > 0.35 ? 'bad' : machine.risk > 0.2 ? 'warn' : '';

    const now = job
      ? `<div class="mrow-job" title="${esc(`${projectName(job.projectId)} · ${t('ui.machine.risk')} ${pct(machine.risk)}`)}">
           <span class="mrow-job__name">${esc(job.partName)}</span>
           <span class="bar ${riskTone}"><i style="width:${((job.progress / job.hoursRequired) * 100).toFixed(1)}%"></i></span>
           <span class="mono">${t('ui.machine.progress', { done: job.progress, total: job.hoursRequired })}</span>
         </div>`
      : `<span class="note ${machine.queue.length ? 'warn' : ''}">${
          machine.queue.length ? t('ui.machine.waiting') : t('ui.activity.idle')
        }</span>`;

    const refill = machine.consumableMax > 0 ? this.handlers.refillCost(machine.id) : 0;
    const resale = this.handlers.resaleFor(machine.id);
    // Icon buttons with the price in the tooltip: three verbs on a row, not three labels.
    const actions = [
      refill
        ? `<button class="ui-btn ${filamentLow ? 'ui-btn--primary' : 'ui-btn--ghost'} ui-btn--sm" data-action="filament" data-id="${machine.id}"
             ${this.affordable(state, refill) ? '' : 'disabled'} title="${esc(t('ui.machine.fill', { cost: refill }))}">
             ${icon('package')}</button>`
        : '',
      machine.calibration < 0.99
        ? `<button class="ui-btn ${calLow ? 'ui-btn--primary' : 'ui-btn--ghost'} ui-btn--sm" data-action="calibrate"
             title="${esc(`${t('ui.machine.level')} · ${t('ui.machine.levelHint')}`)}">${icon('cog')}</button>`
        : '',
      resale
        ? `<button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="sell-printer" data-id="${machine.id}"
             title="${esc(`${t('ui.machine.sell', { value: resale })} · ${t('ui.machine.sellHint')}`)}">${icon('coins')}</button>`
        : '',
    ].join('');

    const queue = machine.queue
      .map(
        (item, index) => `<tr class="mrow-queue"><td colspan="5">
          <div class="queue-row">
            <span class="queue-no">${index + 1}</span>
            <span class="queue-name">${esc(item.partName)}</span>
            <span class="mono queue-hours">${hours(item.hoursRequired)}</span>
            <span class="queue-ctrl">
              <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="job-up" data-id="${machine.id}" data-id2="${item.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
              <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="job-down" data-id="${machine.id}" data-id2="${item.id}" ${index === machine.queue.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="job-cancel" data-id="${machine.id}" data-id2="${item.id}">${icon('x')}</button>
            </span>
          </div>
        </td></tr>`,
      )
      .join('');

    return `<tr class="${calLow || filamentLow ? 'needs-hand' : ''}">
      <td class="space-cell">
        <span class="space-dot" style="--tone:${job ? 'var(--primary)' : 'var(--muted-foreground)'}">${icon('printer')}</span>
        <span class="space-name">${esc(machine.label)}</span>
        ${machine.queue.length ? `<span class="ui-badge" title="${esc(t('ui.machine.queue', { n: machine.queue.length }))}">+${machine.queue.length}</span>` : ''}
      </td>
      <td class="mrow-now">${now}</td>
      <td class="mrow-meter">${bar(machine.calibration, 1, calLow ? 'bad' : machine.calibration < 0.75 ? 'warn' : '')}</td>
      <td class="mrow-meter">${
        machine.consumableMax > 0
          ? `${bar(machine.consumable, machine.consumableMax, filamentLow ? 'warn' : '')}
             <span class="mono">${num(Math.round(machine.consumable))}g</span>`
          : '—'
      }</td>
      <td class="mrow-actions">${actions}</td>
    </tr>${queue}`;
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
      const kickoff = this.kickoffStatus(project, state);
      if (kickoff?.tone) return { text: kickoff.text, tone: kickoff.tone };
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
      return `<tr class="row-link" data-action="project-detail" data-id="${project.id}">
        ${nameCell(project.category, project.name)}
        <td class="num">${stageLabel(project.category, project.stage)}</td>
        ${barCell(overall.ratio, stop?.tone ?? '')}
        <td class="note ${stop?.tone ?? ''}">${stop ? esc(stop.text) : '—'}</td>
        <td class="num">—</td>
        <td class="chev">${icon('chevronRight')}</td>
      </tr>`;
    };

    const doneRow = (record: ShippedRecord) => `<tr class="row-link" data-action="project-detail" data-id="${record.id}">
        ${nameCell(record.category, record.name)}
        <td class="num">${t('ui.projects.shippedOn', { day: record.day })}</td>
        ${barCell(1, 'good')}
        <td class="note">${t('ui.projects.rep', { rep: record.hype })} · ${pct(record.quality)}</td>
        ${(() => {
          const net = record.payout - record.spent;
          return `<td class="note ${net >= 0 ? '' : 'bad'}"
            style="${net > 0 ? 'color:var(--success)' : ''}"
            title="${esc(t('ui.projects.netHint', { payout: record.payout, spent: record.spent }))}">
            ${net >= 0 ? '' : '−'}${money(Math.abs(net))}
          </td>`;
        })()}
        <td class="chev">${icon('chevronRight')}</td>
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
    const head = `<div class="modal-head">${icon('clipboard', 'ui-icon ui-icon--lg')}<b>${t('ui.projects.title')}</b></div>`;

    // A drill-in replaces the list, like a space on the Ranking panel: the crumb goes back.
    const detailActive = this.projectDetail ? active.find((p) => p.id === this.projectDetail) : undefined;
    const detailDone = this.projectDetail ? done.find((r) => r.id === this.projectDetail) : undefined;
    if (detailActive || detailDone) {
      return {
        head,
        content: this.projectDetailBody(state, detailActive, detailDone, detailActive ? stopFor(detailActive) : null),
        foot: `<span class="ui-desc" style="font-size:10.5px">${t('build.detail.foot')}</span>`,
      };
    }
    this.projectDetail = null;

    return {
      head,
      content:
        chips +
        (rows.length
          ? `<table class="rank-table">
              <thead><tr>
                <th class="space-head">${t('ui.projects.col.project')}</th><th>${t('ui.projects.col.stage')}</th>
                <th>${t('ui.projects.col.progress')}</th><th>${t('ui.projects.col.needs')}</th>
                <th>${t('ui.projects.col.net')}</th><th></th>
              </tr></thead>
              <tbody>${rows.join('')}</tbody>
            </table>`
          : `<p class="ui-desc">${t('ui.projects.empty', { jobs: `<b>${t('build.bar.new')}</b>` })}</p>`),
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

  /**
   * One project, all of it (§4e): who made it and how much of it each of them made, what
   * the design was, and — once it has shipped — how the payout was reached. The table is
   * for comparing builds; this is for reading one.
   */
  private projectDetailBody(
    state: GameState,
    project: ProjectData | undefined,
    record: ShippedRecord | undefined,
    stop: { text: string; tone: string } | null,
  ): string {
    const name = project?.name ?? record!.name;
    const category = project?.category ?? record!.category;
    const design = project?.design ?? record?.design;
    const quality = project?.quality ?? record!.quality;
    const profile = profileOf(category);
    const you = state.identity?.player || t('ui.space.you');

    // Who made it. A running build is read from its live effort; a shipped one from the
    // record, which kept the names in case somebody has since left.
    const crew: { id: string; name: string; share: number }[] = (() => {
      if (record?.crew) return record.crew;
      if (!project) return [];
      const effort = { ...(project.effort ?? {}) };
      for (const id of project.team) effort[id] ??= 0;
      if (state.runtime.player?.project === project.id) effort.player ??= 0;
      const total = Object.values(effort).reduce((sum, v) => sum + v, 0);
      return Object.entries(effort)
        .map(([id, work]) => ({
          id,
          name: id === 'player' ? you : (state.runtime.members.find((m) => m.id === id)?.name ?? MEMBER_DATA[id]?.name ?? id),
          share: total > 0 ? work / total : 0,
        }))
        .sort((a, b) => b.share - a.share);
    })();
    const onTeam = new Set(project?.team ?? []);
    const crewRows = crew.length
      ? crew
          .map((c) => {
            const left = project && c.id !== 'player' && !onTeam.has(c.id);
            return `<tr>
              <td class="space-cell"><span class="space-name">${esc(c.id === 'player' ? you : c.name)}</span>
                ${c.id === 'player' ? `<span class="ui-badge">${t('ui.space.you')}</span>` : ''}
                ${left ? `<span class="ui-badge" title="${esc(t('build.detail.leftHint'))}">${t('build.detail.left')}</span>` : ''}</td>
              <td style="width:55%"><span class="cell-bar">
                <span class="bar"><i style="width:${(c.share * 100).toFixed(1)}%"></i></span>
                <span class="mono" style="font-size:10.5px;color:var(--muted-foreground)">${pct(c.share)}</span>
              </span></td>
            </tr>`;
          })
          .join('')
      : `<tr><td colspan="2" class="ui-desc">${t('build.detail.noCrew')}</td></tr>`;

    const stat = (label: string, value: string, hint = '') =>
      `<div class="review-stat" title="${esc(hint)}"><span class="ui-label">${label}</span><span class="review-stat__value">${value}</span></div>`;
    const rating = design && Object.keys(design).length ? designStars(category, design) : null;

    const stats = record
      ? `${stat(t('build.review.quality'), `${starRow(qualityStars(quality))}<span class="mono">${pct(quality)}</span>`)}
         ${stat(t('ui.stat.reputation'), `<span class="mono">+${num(record.hype)}</span>`)}
         ${stat(t('build.detail.net'), `<span class="mono cash cash--${record.payout - record.spent >= 0 ? 'good' : 'bad'}">${record.payout - record.spent >= 0 ? '' : '−'}${money(Math.abs(record.payout - record.spent))}</span>`, t('ui.projects.netHint', { payout: record.payout, spent: record.spent }))}
         ${stat(t('build.detail.took'), `<span class="mono">${t('ui.days.short', { days: record.days })}</span>`, t('ui.projects.shippedOn', { day: record.day }))}`
      : `${stat(t('build.review.quality'), `${starRow(qualityStars(quality))}<span class="mono">${pct(quality)}</span>`)}
         ${stat(t('ui.projects.col.stage'), `<span class="mono">${esc(stageLabel(category, project!.stage))}</span>`)}
         ${stat(t('ui.projects.col.progress'), `<span class="mono">${Math.round(projectProgress(project!).ratio * 100)}%</span>`)}
         ${stat(t('build.detail.spent'), `<span class="mono">${money(Math.round(project!.spent))}</span>`)}`;

    const designRows = design
      ? CATEGORY_AXES[category]
          .map((axisId) => {
            const option = optionOf(axisId, design);
            return `<div class="breakdown-row"><span>${esc(AXES[axisId].label)}</span>
              <span class="row" style="gap:6px"><span class="mono">${esc(option.label)}</span>${starRow(option.stars)}</span></div>`;
          })
          .join('')
      : '';

    // How the money was reached, as the multiplication it is.
    const pay = record?.pay;
    const payRows = pay
      ? [
          [t('build.detail.pay.base'), money(pay.base)],
          [t('build.detail.pay.market'), `×${pay.market.toFixed(2)}`],
          [t('build.detail.pay.appeal'), `×${pay.appeal.toFixed(2)}`],
          [t('build.detail.pay.quality'), `×${pay.quality.toFixed(2)}`],
          [t('build.detail.pay.novelty'), `×${pay.novelty.toFixed(2)}`],
          [t('build.detail.pay.paid'), money(record!.payout)],
          [t('build.detail.spent'), `−${money(record!.spent)}`],
        ]
          .map(([label, value], index) => `<div class="breakdown-row ${index === 5 ? 'breakdown-row--total' : ''}"><span>${label}</span><span class="mono">${value}</span></div>`)
          .join('')
      : '';

    const facts = record
      ? [
          t('ui.projects.shippedOn', { day: record.day }),
          t('build.detail.tests', { count: record.testAttempts }),
          record.failedPrints ? t('build.detail.failedPrints', { count: record.failedPrints }) : '',
        ]
      : [
          stop?.text ?? '',
          project!.testAttempts ? t('build.detail.tests', { count: project!.testAttempts }) : '',
        ];

    return `<div class="trophy-bar">
        <div class="trophy-scope">
          <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="project-detail" data-id="">${t('ui.projects.title')}</button>
          <span class="step-sep">›</span>
          <b>${esc(name)}</b>
        </div>
      </div>
      <div class="row" style="gap:11px;margin-bottom:12px">
        <span class="icon-chip" style="--tone:${profile.accent};width:36px;height:36px">
          ${icon(CATEGORY_ICON[category], 'ui-icon ui-icon--lg')}
        </span>
        <div style="flex:1;min-width:0">
          <div class="row" style="gap:8px">
            <span class="ui-title" style="font-size:15px">${esc(name)}</span>
            ${rating !== null ? `<span title="${esc(t('build.bench.rating'))}">${starRow(rating)}</span>` : ''}
            <span style="margin-left:auto">${categoryChip(category)}</span>
          </div>
          <p class="ui-desc" style="margin:2px 0 0">${facts.filter(Boolean).map(esc).join(' · ')}</p>
        </div>
      </div>
      <div class="review-grid">${stats}</div>
      <div class="detail-grid">
        <section>
          <div class="ui-label" style="margin:14px 0 6px">${t('build.detail.whoMadeIt')}</div>
          <table class="rank-table detail-crew"><tbody>${crewRows}</tbody></table>
        </section>
        <section>
          ${designRows ? `<div class="ui-label" style="margin:14px 0 6px">${t('build.detail.design')}</div>${designRows}` : ''}
          ${payRows ? `<div class="ui-label" style="margin:14px 0 6px">${t('build.detail.pay')}</div>${payRows}` : ''}
        </section>
      </div>`;
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

