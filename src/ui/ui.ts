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
} from '@/game/types';
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
  WORKDAY,
  eraDef,
  weeklyHoursFor,
} from '@/utils/constants';
import { clock, dayName, hours, money, pct } from '@/utils/format';
import { CATEGORY_ICON, icon, type IconName } from './icons';
import { LOGOS, NAME_SUGGESTIONS, RIVAL_MAP } from '@/utils/rivals';
import { DIFFICULTIES, type DifficultyKey } from '@/utils/difficulty';
import { ECONOMY } from '@/utils/economy';
import { projectProgress } from '@/systems/ProjectSystem';
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
  buyFilament(): void;
  hire(memberId: string, employment: Employment): void;
  hireCost(memberId: string, employment: Employment): number;
  canHireFullTime(memberId: string): boolean;
  begin(name: string, logo: number, difficulty: DifficultyKey): void;
  dismissCeremony(): void;
  dismissBill(): void;
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
function shiftSpan(member: MemberSnapshot): string {
  const span =
    member.employment === 'full-time'
      ? WORKDAY.shifts['full-time']
      : member.shift === 'afternoon'
        ? WORKDAY.shifts.afternoon
        : WORKDAY.shifts.morning;
  return `${String(span.start).padStart(2, '0')}:00-${String(span.end).padStart(2, '0')}:00`;
}

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
  private lastState: GameState | null = null;
  /** Last HTML written per section, so unchanged sections keep their DOM nodes. */
  private htmlCache = new Map<string, string>();

  /** Which build-menu panel is open, if any. */
  private openModal: 'jobs' | 'people' | 'ranking' | 'machines' | 'projects' | null = null;
  /** Start screen state; the sim is not running yet so nothing clobbers it. */
  private start = {
    // Pre-named and pre-badged: an empty form with a dead CTA is a worse first frame
    // than a suggestion you can shuffle or type straight over (the field is selected).
    name: NAME_SUGGESTIONS[Math.floor(Math.random() * NAME_SUGGESTIONS.length)] ?? '',
    logo: Math.floor(Math.random() * LOGOS.length),
    difficulty: 'normal' as DifficultyKey,
  };
  /** The name box is focused once, not on every re-render of the start screen. */
  private startFocused = false;
  /** Which column the leaderboard is sorted by. */
  private rankSort: { key: RankKey; dir: 1 | -1 } = { key: 'reputation', dir: -1 };

  /** The Jobs wizard: pick a genre, choose the build, crew it up. */
  private jobs: {
    open: boolean;
    step: JobStep;
    source: ProjectCategory | 'offers' | null;
    size: SizeFilter;
    defId: string | null;
    offerId: string | null;
  } = { open: false, step: 'category', source: null, size: 'any', defId: null, offerId: null };

  /**
   * Write HTML only when it actually differs. Replacing innerHTML destroys nodes, which
   * cancels in-flight clicks and drops hover/tooltips — and the clock alone would
   * otherwise rebuild every panel sixty times a second.
   */
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
        <div class="panel" id="log"><h2>Log</h2><div class="body"></div></div>
        <div class="panel" id="you"><h2>You</h2><div class="body"></div></div>
        <div class="panel" id="members"><h2>The People</h2><div class="body"></div></div>
      </div>
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
        case 'shuffle-name': {
          const pool = NAME_SUGGESTIONS.filter((n) => n !== this.nameField());
          this.start.name = pool[Math.floor(Math.random() * pool.length)] ?? NAME_SUGGESTIONS[0];
          this.rerender();
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
          this.jobs.source = value === 'offers' ? 'offers' : (value as ProjectCategory);
          this.jobs.size = 'any';
          this.jobs.step = 'project';
          this.rerender();
          break;
        case 'jobs-size':
          // Narrows the list in place; it is a filter, not a step.
          this.jobs.size = value as SizeFilter;
          this.rerender();
          break;
        case 'jobs-project':
          this.jobs.defId = id ?? null;
          this.jobs.offerId = id2 || null;
          this.jobs.step = 'crew';
          this.rerender();
          break;
        case 'pitch': {
          if (!id) break;
          const draft = [...(this.draftTeams.get(id) ?? [])];
          h.pitch(id, id2 || undefined, draft);
          this.draftTeams.delete(id);
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
          h.buyFilament();
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
    const name = this.start.name;
    const badge = LOGOS[this.start.logo];
    this.setHTML(
      this.startEl,
      'start',
      `<div class="start-backdrop">
        <div class="start-card">
          <header class="start-brand">
            <span class="icon-chip start-badge" style="--tone:${badge.colour}">
              ${icon(badge.icon, 'ui-icon')}
            </span>
            <div class="start-brand__text">
              <div class="ui-label">A new hackerspace</div>
              <h1 id="start-title" class="${name ? '' : 'is-empty'}">${esc(name) || 'Name it'}</h1>
            </div>
          </header>
          <p class="ui-desc start-intro">
            Two of you, one printer, and a landlord. Everything else you will have to talk
            people into.
          </p>

          <section class="start-section">
            <label class="ui-label" for="space-name">What is it called?</label>
            <div class="row" style="gap:6px">
              <input id="space-name" class="ui-input" maxlength="28" placeholder="Lehim ve Kahve"
                autocomplete="off" spellcheck="false" value="${esc(name)}" />
              <button class="ui-btn ui-btn--outline" data-action="shuffle-name"
                title="Suggest one" aria-label="Suggest a name">${icon('shuffle')}</button>
            </div>
          </section>

          <section class="start-section">
            <div class="ui-label">Pick a badge</div>
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
                return `<button class="ui-option diff-pick ${on ? 'on' : ''}" role="radio"
                  aria-checked="${on}" style="--tone:${level.accent}"
                  data-action="difficulty" data-value="${level.key}">
                  <div class="ui-option__head">
                    <span class="icon-chip pace">${meter}</span>
                    <span class="ui-title">${level.label}</span>
                    ${on ? `<span class="diff-tick">${icon('check')}</span>` : ''}
                  </div>
                  <span class="ui-option__desc ui-clamp-3">${esc(level.blurb)}</span>
                  <span class="ui-badge ui-badge--tone">${money(level.startCash)} to start</span>
                </button>`;
              }).join('')}
            </div>
            <p class="ui-desc start-note">
              Difficulty only moves the other spaces. Your own hours, costs and pipeline are
              the same at every setting.
            </p>
          </section>

          <button id="start-go" class="ui-btn ui-btn--primary ui-btn--lg ui-btn--block"
            data-action="begin" ${name.trim() ? '' : 'disabled'}>Open the doors</button>
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

  /**
   * Typing updates the title and the Open-the-doors button in place. Re-rendering on
   * every keystroke would replace the input under the caret, so this touches only the
   * two things that actually change.
   */
  private onNameTyped(input: HTMLInputElement) {
    this.start.name = input.value;
    const typed = input.value.trim();
    const title = this.root.querySelector<HTMLElement>('#start-title');
    if (title) {
      title.textContent = input.value || 'Name it';
      title.classList.toggle('is-empty', !input.value);
    }
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
        return `<div class="stat" title="Rent, wages and power against membership dues">
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
        title="Year ${season.year} · ${daysLeft} days to the awards">
        <span class="season-label">Year ${season.year}</span>
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
        <div class="modal ceremony" data-action="noop">
          <header>
            <div class="modal-head">${icon('flame', 'ui-icon ui-icon--lg')}<b>Awards night · year ${ceremony.year}</b></div>
          </header>
          <div class="modal-body">
            <p class="ui-desc" style="margin:0 0 14px">
              ${
                won
                  ? `You took <b>${won}</b> of ${ceremony.awards.length}${ceremony.reputationGained ? `, and ${ceremony.reputationGained} reputation with them` : ''}.`
                  : `Nothing for us this year. Somebody else had a better one.`
              }
            </p>
            ${ceremony.awards
              .map(
                (award) => `<div class="ui-row ${award.playerWon ? 'award-won' : ''}" style="cursor:default">
                  <span class="icon-chip" style="--tone:${award.playerWon ? 'var(--primary)' : 'var(--muted-foreground)'}">
                    ${icon(award.playerWon ? 'check' : 'users', 'ui-icon ui-icon--lg')}
                  </span>
                  <span class="ui-row__main">
                    <span class="row between" style="gap:8px">
                      <span class="ui-title">${award.category}</span>
                      <span class="ui-badge ${award.playerWon ? 'ui-badge--accent' : ''}">${esc(award.winnerName)}</span>
                    </span>
                    <p class="ui-desc" style="margin:3px 0 0">${award.blurb} — ${award.value}</p>
                  </span>
                </div>`,
              )
              .join('')}
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
        <span class="ui-badge">Year ${season.year}</span>
        <span class="ui-badge${daysLeft <= 10 ? ' ui-badge--accent' : ''}">${daysLeft}d to the awards</span>
      </div>`,
      content: `<table class="rank-table">
        <thead><tr><th></th><th class="space-head">Space</th>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>`,
      foot: `<span class="ui-desc" style="font-size:10.5px">
        <b class="award-key">◆</b> decides an award, judged on the year just gone — so a quiet year
        costs you even while you are ahead overall.
      </span>`,
    };
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
              : this.jobsBody(state);
    this.setHTML(
      this.modal,
      'modal',
      `<div class="modal-backdrop" data-action="jobs-close">
        <div class="modal ${this.openModal === 'machines' ? 'modal--fit' : ''}" data-action="noop">
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

  // --- People: who is here, and who could be ------------------------------

  private peopleBody(state: GameState): { head: string; content: string; foot: string } {
    const members = state.runtime.members;
    const hoursLeft = state.runtime.player?.hoursLeft ?? 0;

    const person = (id: string, name: string, trailing: string, note: string) => {
      const data = MEMBER_DATA[id];
      const member = members.find((m) => m.id === id);
      const top = topCategories(data?.passions ?? {}, 1)[0];
      const profile = top ? profileOf(top.category) : null;
      return `<div class="ui-row" style="cursor:default">
        <span class="icon-chip" style="--tone:${profile?.accent ?? 'var(--muted-foreground)'}">
          ${profile ? icon(CATEGORY_ICON[top!.category], 'ui-icon ui-icon--lg') : icon('users', 'ui-icon ui-icon--lg')}
        </span>
        <span class="ui-row__main">
          <span class="row between" style="gap:8px">
            <span class="ui-title">${name}</span>
            ${trailing}
          </span>
          <p class="ui-desc" style="margin:3px 0 0">${note}</p>
          <span class="ui-row__meta">
            ${
              member
                ? `<span class="ui-badge ui-badge--tone" style="--tone:${member.employment === 'full-time' ? 'var(--primary)' : 'var(--warning)'}"
                     title="${member.weeklyHours}h a week">
                     ${icon('clock')}${member.employment === 'full-time' ? 'Full-time' : `Part-time · ${member.shift}s`}
                   </span>
                   <span class="ui-badge">${shiftSpan(member)}</span>`
                : `<span class="ui-badge">${icon('clock')}wants ~${data?.commitment ?? '?'}h/wk</span>
                   <span class="ui-badge">prefers ${data?.prefers ?? 'morning'}s</span>`
            }
            ${topCategories(data?.passions ?? {})
              .map(({ category, score }) => {
                const pr = profileOf(category);
                return `<span class="ui-badge ui-badge--tone" style="--tone:${pr.accent}">
                  ${icon(CATEGORY_ICON[category])}${pr.label} ${pct(score)}</span>`;
              })
              .join('')}
            ${(data?.traits ?? []).map((t) => `<span class="ui-badge" title="${TRAIT_BLURB[t]}">${TRAIT_LABEL[t]}</span>`).join('')}
          </span>
        </span>
      </div>`;
    };

    const roster = members
      .map((m) => {
        const project = m.team ? state.runtime.projects.find((x) => x.id === m.team) : null;
        const status = `<span class="row" style="gap:5px">
          ${
            m.present
              ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)">in today</span>`
              : `<span class="ui-badge">away</span>`
          }
          <button class="ui-btn ui-btn--ghost ui-btn--sm" data-action="let-go" data-id="${m.id}"
            title="End the contract — ${money(ECONOMY.wage[m.employment])} a month off the wage bill">
            Let go
          </button>
        </span>`;
        return person(m.id, m.name, status, project ? `On ${esc(project.name)}` : 'Unallocated');
      })
      .join('');

    const open = state.applicants
      .map((id) => {
        const data = MEMBER_DATA[id];
        if (!data) return '';
        const canFull = this.handlers.canHireFullTime(id);
        const offer = (employment: Employment, label: string) => {
          const cost = this.handlers.hireCost(id, employment);
          const ok = state.cash >= cost && hoursLeft >= VERB_HOURS.hire;
          return `<button class="ui-btn ${employment === 'full-time' ? 'ui-btn--primary' : 'ui-btn--outline'} ui-btn--sm"
            data-action="hire" data-id="${id}" data-value="${employment}" ${ok ? '' : 'disabled'}
            title="${weeklyHoursFor(employment)}h a week">
            ${label} · ${money(cost)}
          </button>`;
        };
        const buttons = `<span class="row" style="gap:5px">
          ${offer('part-time', 'Part-time')}
          ${canFull ? offer('full-time', 'Full-time') : ''}
        </span>`;
        return person(
          id,
          data.name,
          buttons,
          canFull ? 'Interested in joining' : 'Has a day job — part-time only',
        );
      })
      .join('');

    const next = APPLICANTS.filter(
      (a) => !members.some((m) => m.id === a.id) && !state.applicants.includes(a.id),
    ).sort((a, b) => (a.repRequired ?? 0) - (b.repRequired ?? 0))[0];

    return {
      head: `<div class="modal-head">${icon('users', 'ui-icon ui-icon--lg')}<b>People</b></div>`,
      content: `
        <div class="ui-label" style="margin-bottom:9px">Your people · ${members.length}</div>
        ${roster}
        <hr class="ui-sep" />
        <div class="ui-label" style="margin-bottom:9px">Interested · ${state.applicants.length}</div>
        ${open || `<p class="ui-desc">Nobody right now. Ship something and word gets around.</p>`}
      `,
      foot: next
        ? `<span class="ui-desc" style="font-size:10.5px">
             Wages ${money(members.reduce((sum, m) => sum + ECONOMY.wage[m.employment], 0))} a month ·
             next along: <b>${next.name}</b> at ${next.repRequired} reputation — you have ${state.reputation}.
           </span>`
        : `<span class="ui-desc" style="font-size:10.5px">Everybody in town knows about you now.</span>`,
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

    return `
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

  private jobCard(def: ProjectDef, state: GameState, entry?: BacklogEntry): string {
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

  private renderProjects(state: GameState) {
    const projects = state.runtime.projects;
    if (!projects.length) {
      this.setHTML(this.left, 'left', `
        <p class="empty">Nothing on the bench.</p>
        <p class="blurb">Open <b>Jobs</b> at the bottom of the screen and pitch something.</p>
      `);
      return;
    }
    this.setHTML(this.left, 'left', projects.map((p) => this.projectCard(p, state)).join(''));
  }

  private projectCard(project: ProjectData, state: GameState): string {
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
    const waitingParts = project.stage === 'assembly' && partsWait(project, nowHours) > 0;
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
    const waiting = partsWait(project, nowHours);
    let sourcing = '';
    if (!project.partsOrdered) {
      const affordable = state.cash >= project.bomCost;
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
        <button class="tiny" data-action="expedite" data-id="${project.id}" ${state.cash >= cost ? '' : 'disabled'}>
          Expedite ${money(cost)}
        </button>
      </div>`;
    }

    // --- your involvement ---------------------------------------------------
    const handStage = stageDef.skill !== null || project.required[project.stage] > 0;
    const blockedAssembly = project.stage === 'assembly' && waiting > 0;
    let workButton = '';
    if (playerOn) {
      workButton = `<button class="tiny" data-action="stop-work">Stop working</button>`;
    } else if (handStage && !blockedAssembly && project.required[project.stage] > 0) {
      workButton = `<button class="tiny primary" data-action="work" data-id="${project.id}">
        Work on ${stageName}
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
            <button class="tiny" data-action="queue-all" data-id="${project.id}"
              ${project.parts.some((p) => p.status === 'pending') ? '' : 'disabled'}>Queue pending</button>
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

    return `<div class="project">
      <div class="row between" style="gap:8px;margin-bottom:6px">
        <span class="ui-title" style="flex:1;min-width:0">${esc(project.name)}</span>
        <span class="mono" style="font-size:10.5px;color:var(--subtle-foreground)">Q ${pct(project.quality)}</span>
      </div>
      <div class="row wrap" style="gap:5px;margin-bottom:8px">
        ${categoryChip(project.category)}
        ${(() => {
          const def = CATALOG_MAP[project.defId];
          return def ? tierBadge(def.tier) : '';
        })()}
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

      <div class="proj-progress">
        <div class="bar"><i style="width:${(overall.ratio * 100).toFixed(1)}%"></i></div>
        <span class="mono proj-pct">${Math.round(overall.ratio * 100)}%</span>
      </div>
      <div class="pipe">${strip}</div>
      <div class="proj-now">
        <span class="caret">›</span>
        <span class="proj-now__stage">${stageName}</span>
        <span class="mono proj-now__val">${statusLine}</span>
      </div>

      ${sourcing}
      ${teamBlock}
      <div class="verbs">
        ${workButton}
        <button class="ui-btn ui-btn--outline ui-btn--sm" data-action="repitch" data-id="${project.id}"
          ${afford('repitch') && project.required[project.stage] > 0 ? '' : 'disabled'}>
          Re-pitch ${VERB_HOURS.repitch}h
        </button>
        <button class="ui-btn ui-btn--outline ui-btn--sm" data-action="bounty" data-id="${project.id}"
          ${canBounty && state.cash >= bountyCost && afford('bounty') ? '' : 'disabled'}>
          Bounty ${money(bountyCost)}
        </button>
        ${project.stage === 'simulation' ? `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="skip-sim" data-id="${project.id}">Skip sim</button>` : ''}
      </div>
      ${
        project.idleDays >= SHELVE.warnAfterIdleDays
          ? `<p class="defect">${icon('clock')} Untouched for ${project.idleDays} days — shelved in
             ${SHELVE.afterIdleDays - project.idleDays}.</p>`
          : ''
      }
      ${project.defects.length ? `<p class="defect">${esc(project.defects[project.defects.length - 1])}</p>` : ''}
      ${parts}
    </div>`;
  }

  // --- backlog --------------------------------------------------------------

  /** Pick the crew before you commit — they are asked the moment you pitch (§3b). */
  private draftPicker(def: ProjectDef, state: GameState): string {
    const picked = this.draftTeams.get(def.id) ?? new Set<string>();
    const free = state.runtime.members
      .filter((m) => !m.team)
      .map((m) => ({ m, match: categoryAffinity(MEMBER_DATA[m.id]?.passions ?? {}, def.category) }))
      .sort((a, b) => b.match - a.match);

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
        <span class="muted" style="font-size:10.5px">of ${p.hoursToday.toFixed(1)}h today</span>
      </div>
      ${bar(p.hoursLeft, p.hoursToday, hoursTone)}
      <div class="meters" style="margin:8px 0 0 0">
        <div class="meter"><label>energy</label>${bar(p.energy, 100, energyTone)}</div>
      </div>
      ${p.burntOut ? `<p class="defect" style="margin-top:7px">⚠ You are running on fumes. Tomorrow will be shorter.</p>` : ''}
      <div class="note" style="margin:7px 0 0 0">${
        task && p.stage
          ? `${esc(task.name)} · ${stageLabel(task.category, p.stage).toLowerCase()}`
          : esc(p.note || 'idle')
      }</div>
      <div class="verbs" style="margin-top:7px">
        ${p.project || p.activity === 'babysitting' ? `<button class="tiny" data-action="stop-work">Stop</button>` : ''}
        <button class="tiny" data-action="calibrate">Calibrate printer</button>
      </div>
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
    const content = machines.length
      ? `<div class="ui-grid machine-grid">
          ${machines.map((m) => this.machineCard(m, state)).join('')}
        </div>`
      : `<p class="ui-desc">Nothing on the floor yet.</p>`;
    return {
      head: `<div class="modal-head">${icon('printer', 'ui-icon ui-icon--lg')}<b>The shop floor</b>
        <span class="ui-badge${running ? ' ui-badge--accent' : ''}">${running} running</span>
        <span class="ui-badge">${queued} queued</span>
      </div>`,
      content,
      foot: `<span class="ui-desc" style="font-size:10.5px">
        Jobs run on the clock, not on attendance — a 22-hour print carries on through an empty space.
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

    const actions = machine.consumableMax > 0
      ? `<button class="ui-btn ui-btn--outline ui-btn--sm" data-action="filament"
           ${state.cash >= FILAMENT.spoolCost ? '' : 'disabled'}>
           ${icon('package')}Buy spool · ${money(FILAMENT.spoolCost)} · ${VERB_HOURS.filament}h
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

  private projectsBody(state: GameState): { head: string; content: string; foot: string } {
    const active = state.runtime.projects;
    const onIt = active.filter(
      (p) => p.team.length > 0 || state.runtime.player?.project === p.id,
    );
    const waiting = active.filter(
      (p) => p.team.length === 0 && state.runtime.player?.project !== p.id,
    );
    const done = [...state.shipped].reverse();

    const activeRow = (project: ProjectData) => {
      const def = CATALOG_MAP[project.defId];
      const overall = projectProgress(project);
      const crew = project.team
        .map((id) => state.runtime.members.find((m) => m.id === id)?.name)
        .filter(Boolean);
      if (state.runtime.player?.project === project.id) crew.unshift('you');
      const profile = profileOf(project.category);
      return `<div class="ui-row" style="cursor:default">
        <span class="icon-chip" style="--tone:${profile.accent}">${icon(CATEGORY_ICON[project.category], 'ui-icon ui-icon--lg')}</span>
        <span class="ui-row__main">
          <span class="row between" style="gap:8px">
            <span class="ui-title">${esc(project.name)}</span>
            <span class="mono" style="font-size:11px;color:var(--muted-foreground)">${Math.round(overall.ratio * 100)}%</span>
          </span>
          <div class="bar" style="margin:6px 0 7px"><i style="width:${(overall.ratio * 100).toFixed(1)}%"></i></div>
          <span class="ui-row__meta">
            <span class="ui-badge ui-badge--tone" style="--tone:${profile.accent}">
              ${stageLabel(project.category, project.stage)}
            </span>
            ${def ? tierBadge(def.tier) : ''}
            <span class="ui-badge">${icon('users')}${crew.length ? esc(crew.join(', ')) : 'nobody'}</span>
            ${
              project.idleDays >= SHELVE.warnAfterIdleDays
                ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--destructive)">${icon('clock')}shelved in ${SHELVE.afterIdleDays - project.idleDays}d</span>`
                : ''
            }
          </span>
        </span>
      </div>`;
    };

    const doneRow = (record: (typeof done)[number]) => {
      const profile = profileOf(record.category);
      return `<div class="ui-row" style="cursor:default">
        <span class="icon-chip" style="--tone:${profile.accent}">${icon(CATEGORY_ICON[record.category], 'ui-icon ui-icon--lg')}</span>
        <span class="ui-row__main">
          <span class="row between" style="gap:8px">
            <span class="ui-title">${esc(record.name)}</span>
            <span class="ui-badge ui-badge--tone" style="--tone:var(--success)">${icon('check')}day ${record.day}</span>
          </span>
          <span class="ui-row__meta" style="margin-top:6px">
            <span class="ui-badge">${icon('clock')}${record.days}d</span>
            <span class="ui-badge">Q ${pct(record.quality)}</span>
            <span class="ui-badge">${icon('flame')}${record.hype} rep</span>
            ${record.payout ? `<span class="ui-badge ui-badge--tone" style="--tone:var(--success)">${icon('coins')}${money(record.payout)}</span>` : ''}
            ${record.failedPrints ? `<span class="ui-badge">${icon('printer')}${record.failedPrints} failed</span>` : ''}
            ${record.testAttempts > 1 ? `<span class="ui-badge">${record.testAttempts} tests</span>` : ''}
          </span>
        </span>
      </div>`;
    };

    const section = (label: string, count: number, body: string, empty: string) =>
      `<div class="ui-label" style="margin-bottom:9px">${label} · ${count}</div>
       ${count ? body : `<p class="ui-desc" style="margin-bottom:4px">${empty}</p>`}`;

    return {
      head: `<div class="modal-head">${icon('clipboard', 'ui-icon ui-icon--lg')}<b>Projects</b>
        <span class="ui-badge">${onIt.length} on</span>
        <span class="ui-badge">${waiting.length} waiting</span>
        <span class="ui-badge ui-badge--accent">${done.length} done</span>
      </div>`,
      content: `
        ${section('In progress', onIt.length, onIt.map(activeRow).join(''), 'Nobody is working on anything.')}
        <hr class="ui-sep" />
        ${section('Waiting for hands', waiting.length, waiting.map(activeRow).join(''), 'Everything started has somebody on it.')}
        <hr class="ui-sep" />
        ${section('Done', done.length, done.map(doneRow).join(''), 'Nothing shipped yet.')}
      `,
      foot: `<span class="ui-desc" style="font-size:10.5px">
        Anything nobody touches for ${SHELVE.afterIdleDays} days ends up on the shelf, and the money
        spent on its parts goes with it.
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

function partsWait(project: ProjectData, nowHours: number): number {
  if (!project.partsOrdered) return project.leadDays * 24;
  return Math.max(0, project.partsArriveAt - nowHours);
}
