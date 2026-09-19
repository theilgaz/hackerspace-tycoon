import type { GameState } from '@/game/store';
import type {
  BacklogEntry,
  MemberSnapshot,
  MachineSnapshot,
  PlayerSnapshot,
  ProjectData,
  ProjectDef,
  StageKey,
} from '@/game/types';
import { CATALOG_MAP, catalogForEra, canBuild, missingMachines } from '@/utils/catalog';
import {
  FILAMENT,
  MACHINE,
  ROSTER,
  STAGES,
  STAGE_MAP,
  STAGE_ORDER,
  TIME,
  TRAIT_BLURB,
  TRAIT_LABEL,
  VERB_HOURS,
  eraDef,
} from '@/utils/constants';
import { clock, dayName, hours, money, pct } from '@/utils/format';

export interface UIHandlers {
  setSpeed(speed: number): void;
  setView(view: GameState['view']): void;
  pitch(defId: string, offerId?: string): void;
  workOn(projectId: string, stage: StageKey): void;
  stopWork(): void;
  calibrate(): void;
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
  slots(): { used: number; total: number };
  totalHours(): number;
}

const MEMBER_COLORS: Record<string, string> = {
  deniz: '#5ecfc0',
  ada: '#f0b429',
  kerem: '#e2725b',
};

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

const CATEGORY_LABEL: Record<ProjectDef['category'], string> = {
  electronics: 'electronics',
  mechanical: 'mechanical',
  tool: 'tool',
  civic: 'civic',
};

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
  private topbar!: HTMLElement;
  private left!: HTMLElement;
  private leftTabs!: HTMLElement;
  private you!: HTMLElement;
  private members!: HTMLElement;
  private machines!: HTMLElement;
  private log!: HTMLElement;

  constructor(root: HTMLElement, handlers: UIHandlers) {
    this.root = root;
    this.handlers = handlers;
    this.build();
    this.bind();
  }

  private build() {
    this.root.innerHTML = `
      <div class="panel" id="topbar"></div>
      <div class="panel" id="left">
        <div class="tabs" id="left-tabs"></div>
        <div class="body"></div>
      </div>
      <div id="right">
        <div class="panel" id="you"><h2>You</h2><div class="body"></div></div>
        <div class="panel" id="members"><h2>The People</h2><div class="body"></div></div>
        <div class="panel" id="machines"><h2>Machines</h2><div class="body"></div></div>
      </div>
      <div class="panel" id="log"><h2>Log</h2><div class="body"></div></div>
    `;
    this.topbar = this.root.querySelector('#topbar')!;
    this.leftTabs = this.root.querySelector('#left-tabs')!;
    this.left = this.root.querySelector('#left .body')!;
    this.you = this.root.querySelector('#you .body')!;
    this.members = this.root.querySelector('#members .body')!;
    this.machines = this.root.querySelector('#machines .body')!;
    this.log = this.root.querySelector('#log .body')!;
  }

  private bind() {
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      const { action, value, id, id2, stage } = target.dataset;
      const h = this.handlers;
      switch (action) {
        case 'speed':
          h.setSpeed(Number(value));
          break;
        case 'view':
          h.setView(value as GameState['view']);
          break;
        case 'pitch':
          if (id) h.pitch(id, id2);
          break;
        case 'work':
          if (id && stage) h.workOn(id, stage as StageKey);
          break;
        case 'stop-work':
          h.stopWork();
          break;
        case 'calibrate':
          h.calibrate();
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

  render(state: GameState) {
    this.renderTopbar(state);
    this.renderTabs(state);
    if (state.view === 'projects') this.renderProjects(state);
    else this.renderBacklog(state);
    this.renderYou(state);
    this.renderMembers(state);
    this.renderMachines(state);
    this.renderLog(state);
  }

  // --- top bar --------------------------------------------------------------

  private renderTopbar(state: GameState) {
    const speedButton = (value: number, label: string) => {
      const active = value === 0 ? state.paused : !state.paused && state.speed === value;
      return `<button data-action="speed" data-value="${value}" class="tiny ${active ? 'active' : ''}">${label}</button>`;
    };
    const slots = this.handlers.slots();
    const era = eraDef(state.era);
    this.topbar.innerHTML = `
      <div class="stat">
        <b class="clock">${clock(state.simTime)}</b>
        <span class="day">${dayName(state.day)} · day ${state.day}</span>
      </div>
      <div class="sep"></div>
      <div class="speeds">
        ${speedButton(0, '❙❙')}
        ${TIME.speeds.map((s) => speedButton(s, `${s}×`)).join('')}
      </div>
      <div class="sep"></div>
      <div class="stat"><b>${money(state.cash)}</b><span>cash</span></div>
      <div class="stat"><b>${slots.used}/${slots.total}</b><span>projects</span></div>
      <div class="stat"><b>${state.shippedCount}</b><span>shipped</span></div>
      <div class="stat"><b>${era.name}</b><span>era ${state.era}</span></div>
    `;
  }

  private renderTabs(state: GameState) {
    const offers = state.backlog.length;
    this.leftTabs.innerHTML = `
      <button data-action="view" data-value="projects" class="${state.view === 'projects' ? 'active' : ''}">
        Projects
      </button>
      <button data-action="view" data-value="backlog" class="${state.view === 'backlog' ? 'active' : ''}">
        Backlog${offers ? ` <i class="pip">${offers}</i>` : ''}
      </button>
    `;
  }

  // --- active projects ------------------------------------------------------

  private renderProjects(state: GameState) {
    const projects = state.runtime.projects;
    if (!projects.length) {
      this.left.innerHTML = `
        <p class="empty">Nothing on the bench.</p>
        <p class="blurb">Open the backlog and pitch something. It costs ${VERB_HOURS.pitch}h of your day
        to write a pitch up properly.</p>
      `;
      return;
    }
    this.left.innerHTML = projects.map((p) => this.projectCard(p, state)).join('');
  }

  private projectCard(project: ProjectData, state: GameState): string {
    const player = state.runtime.player;
    const currentIndex = STAGE_ORDER.indexOf(project.stage);
    const stageDef = STAGE_MAP[project.stage];
    const nowHours = this.handlers.totalHours();

    const pipeline = STAGES.map((stage) => {
      const index = STAGE_ORDER.indexOf(stage.key);
      const isActive = stage.key === project.stage;
      const resolved =
        stage.key === 'fabrication'
          ? project.parts.length > 0 && project.parts.every((p) => p.status === 'done')
          : stage.key === 'test'
            ? project.testAttempts > 0
            : project.progress[stage.key] > 0;
      const done = index < currentIndex && resolved;
      let value = '';
      if (isActive && project.required[stage.key] > 0) {
        value = `${Math.floor(project.progress[stage.key])}/${project.required[stage.key]}`;
      } else if (isActive && stage.key === 'fabrication') {
        value = `${project.parts.filter((p) => p.status === 'done').length}/${project.parts.length}`;
      } else if (done) {
        value = '✓';
      }
      const bounty = project.bounties.includes(stage.key) ? ' 🍕' : '';
      return `<div class="stage ${isActive ? 'active' : ''} ${done ? 'done' : ''}">
        <i class="dot"></i><span class="name">${stage.label}${bounty}</span><span class="val mono">${value}</span>
      </div>`;
    }).join('');

    const signed = state.runtime.members.filter(
      (m) => m.signedUp?.projectId === project.id && m.signedUp.stage === project.stage,
    );
    const playerOn = player?.task?.projectId === project.id;
    const who = [...signed.map((m) => m.name), ...(playerOn ? ['you'] : [])];
    const whoText = who.length ? who.join(', ') : '<span style="color:var(--bad)">nobody</span>';

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
      workButton = `<button class="tiny primary" data-action="work" data-id="${project.id}" data-stage="${project.stage}">
        Work on ${stageDef.label}
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
      <div class="row between" style="margin-bottom:6px">
        <b style="font-size:13.5px">${esc(project.name)}</b>
        <span class="mono muted" style="font-size:11px">Q ${pct(project.quality)}</span>
      </div>
      <div class="row wrap" style="gap:5px;margin-bottom:7px">
        <span class="chip">${CATEGORY_LABEL[project.category]}</span>
        ${project.hypeMultiplier > 1 ? `<span class="chip hot">🔥 ×${project.hypeMultiplier}</span>` : ''}
        ${project.sponsorCash ? `<span class="chip cash">sponsored</span>` : ''}
      </div>
      ${pipeline}
      <p class="blurb">${stageDef.blurb}</p>
      ${sourcing}
      <div class="row" style="margin-bottom:7px;font-size:11.5px">
        <span class="muted">On it:</span><span>${whoText}</span>
      </div>
      <div class="verbs">
        ${workButton}
        <button class="tiny" data-action="repitch" data-id="${project.id}"
          ${afford('repitch') && project.required[project.stage] > 0 ? '' : 'disabled'}>
          Re-pitch ${VERB_HOURS.repitch}h
        </button>
        <button class="tiny" data-action="bounty" data-id="${project.id}"
          ${canBounty && state.cash >= bountyCost && afford('bounty') ? '' : 'disabled'}>
          Bounty ${money(bountyCost)}
        </button>
        ${project.stage === 'simulation' ? `<button class="tiny" data-action="skip-sim" data-id="${project.id}">Skip sim</button>` : ''}
      </div>
      ${project.defects.length ? `<p class="defect">⚠ ${esc(project.defects[project.defects.length - 1])}</p>` : ''}
      ${parts}
    </div>`;
  }

  // --- backlog --------------------------------------------------------------

  private renderBacklog(state: GameState) {
    const slots = this.handlers.slots();
    const full = slots.used >= slots.total;
    const hoursLeft = state.runtime.player?.hoursLeft ?? 0;
    const canPitch = !full && hoursLeft >= VERB_HOURS.pitch;
    const activeDefs = new Set(state.runtime.projects.map((p) => p.defId));

    const offerCard = (entry: BacklogEntry) => {
      const def = CATALOG_MAP[entry.defId];
      const badge = SOURCE_BADGE[entry.source];
      const proposer = entry.proposerId ? ROSTER.find((r) => r.id === entry.proposerId)?.name : null;
      const daysLeft = entry.expiresOnDay ? entry.expiresOnDay - state.day : null;
      const buildable = canBuild(def, state.ownedMachines);
      return `<div class="offer ${badge.cls}">
        <div class="row between">
          <b>${esc(def.name)}</b>
          <span class="chip ${badge.cls}">${badge.label}</span>
        </div>
        <p class="blurb">${esc(def.blurb)}</p>
        <div class="offer-meta">
          ${proposer ? `<span>👤 ${proposer} will take a stage</span>` : ''}
          ${entry.sponsorCash ? `<span class="good">💰 ${money(entry.sponsorCash)} up front</span>` : ''}
          ${entry.hypeMultiplier ? `<span class="hot">🔥 ×${entry.hypeMultiplier} hype while it lasts</span>` : ''}
          ${daysLeft !== null ? `<span class="${daysLeft <= 3 ? 'bad' : ''}">expires in ${daysLeft}d</span>` : ''}
        </div>
        ${this.defStats(def)}
        <button class="tiny primary" data-action="pitch" data-id="${def.id}" data-id2="${entry.id}"
          ${canPitch && buildable && !activeDefs.has(def.id) ? '' : 'disabled'}>
          Pitch · ${VERB_HOURS.pitch}h
        </button>
      </div>`;
    };

    const catalogCard = (def: ProjectDef) => {
      const missing = missingMachines(def, state.ownedMachines);
      const active = activeDefs.has(def.id);
      return `<div class="offer ${missing.length ? 'locked' : ''}">
        <div class="row between">
          <b>${esc(def.name)}</b>
          <span class="chip">${CATEGORY_LABEL[def.category]}</span>
        </div>
        <p class="blurb">${esc(def.blurb)}</p>
        ${this.defStats(def)}
        ${
          missing.length
            ? `<div class="locked-note">needs ${missing.join(', ')}</div>`
            : `<button class="tiny" data-action="pitch" data-id="${def.id}" ${canPitch && !active ? '' : 'disabled'}>
                 Pitch · ${VERB_HOURS.pitch}h
               </button>`
        }
      </div>`;
    };

    const offers = state.backlog.map(offerCard).join('');
    const catalog = catalogForEra(state.era)
      .filter((def) => !state.backlog.some((e) => e.defId === def.id))
      .map(catalogCard)
      .join('');

    this.left.innerHTML = `
      ${full ? `<p class="warn-note">All ${slots.total} project slot(s) in use. Ship something first.</p>` : ''}
      ${hoursLeft < VERB_HOURS.pitch ? `<p class="warn-note">No hours left today to write a pitch.</p>` : ''}
      ${offers ? `<div class="section">Offers</div>${offers}` : ''}
      <div class="section">Catalog · era ${state.era}</div>
      ${catalog}
    `;
  }

  private defStats(def: ProjectDef): string {
    const printHours = def.parts.reduce((sum, p) => sum + p.hours, 0);
    const workUnits = STAGE_ORDER.reduce((sum, key) => sum + (def.work[key] ?? STAGE_MAP[key].work), 0);
    return `<div class="stats-row mono">
      <span title="hand work units">✋ ${workUnits}</span>
      <span title="machine hours">🖨 ${printHours.toFixed(0)}h</span>
      <span title="bill of materials">📦 ${money(def.bomCost)} · ${def.leadDays}d</span>
      ${def.payout ? `<span title="payout" class="good">${money(def.payout)}</span>` : `<span class="muted">you keep it</span>`}
    </div>`;
  }

  // --- you ------------------------------------------------------------------

  private renderYou(state: GameState) {
    const p: PlayerSnapshot | null = state.runtime.player;
    if (!p) {
      this.you.innerHTML = '';
      return;
    }
    const task = p.task ? state.runtime.projects.find((x) => x.id === p.task!.projectId) : null;
    const hoursTone = p.hoursLeft <= 1 ? 'bad' : p.hoursLeft <= 2.5 ? 'warn' : '';
    const energyTone = p.burntOut ? 'bad' : p.energy < 55 ? 'warn' : 'good';
    return void (this.you.innerHTML = `
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
        task ? `${esc(task.name)} · ${STAGE_MAP[p.task!.stage].label.toLowerCase()}` : esc(p.note || 'idle')
      }</div>
      <div class="verbs" style="margin-top:7px">
        ${p.task || p.activity === 'babysitting' ? `<button class="tiny" data-action="stop-work">Stop</button>` : ''}
        <button class="tiny" data-action="calibrate">Calibrate printer</button>
      </div>
    `);
  }

  // --- members --------------------------------------------------------------

  private renderMembers(state: GameState) {
    this.members.innerHTML = state.runtime.members
      .map((m) => {
        const data = ROSTER.find((r) => r.id === m.id)!;
        const color = MEMBER_COLORS[m.id] ?? '#9aa7b8';
        const interestTone = m.interest < 0.4 ? 'bad' : m.interest < 0.7 ? 'warn' : '';
        const energyTone = m.energy < 25 ? 'bad' : m.energy < 50 ? 'warn' : 'good';
        return `<div class="member ${m.present ? '' : 'away'}">
          <div class="head">
            <i class="swatch" style="background:${color}"></i>
            <span class="mname">${m.name}</span>
            <span class="state">${ACTIVITY_LABEL[m.activity]}</span>
          </div>
          <div class="note">${esc(m.note || '—')}</div>
          <div class="meters">
            <div class="meter"><label>interest</label>${bar(m.interest, 1.2, interestTone)}</div>
            <div class="meter"><label>energy</label>${bar(m.energy, 100, energyTone)}</div>
            <div class="meter"><label>commit</label><span class="mono">${data.commitment} h/wk</span></div>
          </div>
          <div class="traits">
            ${data.traits.map((t) => `<span class="trait" title="${TRAIT_BLURB[t]}">${TRAIT_LABEL[t]}</span>`).join('')}
          </div>
        </div>`;
      })
      .join('');
  }

  // --- machines -------------------------------------------------------------

  private renderMachines(state: GameState) {
    if (!state.runtime.machines.length) {
      this.machines.innerHTML = `<p class="muted">No machines.</p>`;
      return;
    }
    this.machines.innerHTML = state.runtime.machines
      .map((m) => this.machineCard(m, state))
      .join('<div class="rule"></div>');
  }

  private machineCard(machine: MachineSnapshot, state: GameState): string {
    const projectName = (id: string) => state.runtime.projects.find((p) => p.id === id)?.name ?? '';
    const calTone =
      machine.calibration < MACHINE.calibrationWarning ? 'bad' : machine.calibration < 0.75 ? 'warn' : 'good';
    const riskClass = machine.risk > 0.35 ? 'danger' : machine.risk > 0.2 ? 'hot' : '';

    const current = machine.current
      ? `<div class="row between" style="margin-bottom:4px">
           <span>${esc(machine.current.partName)}</span>
           <span class="mono muted">${machine.current.progress.toFixed(1)}/${machine.current.hoursRequired}h</span>
         </div>
         <div class="muted" style="font-size:10.5px;margin-bottom:4px">${esc(projectName(machine.current.projectId))}</div>
         ${bar(machine.current.progress, machine.current.hoursRequired)}
         <div class="row between" style="margin-top:6px">
           <span class="muted" style="font-size:11px">failure risk</span>
           <span class="risk ${riskClass}">${pct(machine.risk)}</span>
         </div>`
      : `<div class="queue-empty">Idle.</div>`;

    const queue = machine.queue.length
      ? machine.queue
          .map(
            (job, index) => `<div class="jobline">
              <span class="mono muted" style="width:12px">${index + 1}</span>
              <span class="jname">${esc(job.partName)}</span>
              <span class="mono muted">${hours(job.hoursRequired)}</span>
              <span class="ctrl">
                <button class="tiny" data-action="job-up" data-id="${machine.id}" data-id2="${job.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="tiny" data-action="job-down" data-id="${machine.id}" data-id2="${job.id}" ${index === machine.queue.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="tiny" data-action="job-cancel" data-id="${machine.id}" data-id2="${job.id}">×</button>
              </span>
            </div>`,
          )
          .join('')
      : `<div class="queue-empty">Queue empty.</div>`;

    const filamentRow =
      machine.consumableMax > 0
        ? `<div class="meter"><label>filament</label>${bar(machine.consumable, machine.consumableMax, machine.consumable < FILAMENT.lowWarning ? 'warn' : '')}</div>
           <button class="tiny" style="margin-top:6px" data-action="filament" ${state.cash >= FILAMENT.spoolCost ? '' : 'disabled'}>
             Buy spool · ${money(FILAMENT.spoolCost)} · ${VERB_HOURS.filament}h
           </button>`
        : '';

    return `<div class="machine">
      <div class="section" style="margin-bottom:5px">${esc(machine.label)}</div>
      ${current}
      <div class="meters" style="margin:8px 0 0 0">
        <div class="meter"><label>calibration</label>${bar(machine.calibration, 1, calTone)}</div>
        ${filamentRow}
      </div>
      <div style="margin-top:8px">
        <div class="section" style="margin-bottom:4px">Queue</div>
        ${queue}
      </div>
    </div>`;
  }

  private renderLog(state: GameState) {
    this.log.innerHTML = state.log
      .map(
        (entry) =>
          `<div class="entry ${entry.kind}"><time>d${entry.day} ${clock(entry.time)}</time><span>${esc(entry.text)}</span></div>`,
      )
      .join('');
  }
}

function partsWait(project: ProjectData, nowHours: number): number {
  if (!project.partsOrdered) return project.leadDays * 24;
  return Math.max(0, project.partsArriveAt - nowHours);
}
