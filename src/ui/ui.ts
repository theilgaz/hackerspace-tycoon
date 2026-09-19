import type { GameState } from '@/game/store';
import type { MemberSnapshot } from '@/game/types';
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
} from '@/utils/constants';
import { clock, dayName, hours, money, pct } from '@/utils/format';

export interface UIHandlers {
  setSpeed(speed: number): void;
  repitch(): void;
  bounty(): void;
  bountyCost(): number;
  skipSim(): void;
  queueAll(): void;
  queuePart(id: string): void;
  moveJob(id: string, dir: -1 | 1): void;
  cancelJob(id: string): void;
  buyFilament(): void;
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

function bar(value: number, max: number, tone = ''): string {
  const ratio = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  return `<div class="bar ${tone}"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>`;
}

export class UI {
  private readonly root: HTMLElement;
  private readonly handlers: UIHandlers;
  private topbar!: HTMLElement;
  private project!: HTMLElement;
  private members!: HTMLElement;
  private printer!: HTMLElement;
  private log!: HTMLElement;
  private overlay: HTMLElement | null = null;

  constructor(root: HTMLElement, handlers: UIHandlers) {
    this.root = root;
    this.handlers = handlers;
    this.build();
    this.bind();
  }

  private build() {
    this.root.innerHTML = `
      <div class="panel" id="topbar"></div>
      <div class="panel" id="project"><h2>Project</h2><div class="body"></div></div>
      <div id="right">
        <div class="panel" id="members"><h2>The People</h2><div class="body"></div></div>
        <div class="panel" id="printer"><h2>Ender (FDM)</h2><div class="body"></div></div>
      </div>
      <div class="panel" id="log"><h2>Log</h2><div class="body"></div></div>
    `;
    this.topbar = this.root.querySelector('#topbar')!;
    this.project = this.root.querySelector('#project .body')!;
    this.members = this.root.querySelector('#members .body')!;
    this.printer = this.root.querySelector('#printer .body')!;
    this.log = this.root.querySelector('#log .body')!;
  }

  private bind() {
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target) return;
      const { action, value, id } = target.dataset;
      switch (action) {
        case 'speed':
          this.handlers.setSpeed(Number(value));
          break;
        case 'repitch':
          this.handlers.repitch();
          break;
        case 'bounty':
          this.handlers.bounty();
          break;
        case 'skip-sim':
          this.handlers.skipSim();
          break;
        case 'queue-all':
          this.handlers.queueAll();
          break;
        case 'queue-part':
          if (id) this.handlers.queuePart(id);
          break;
        case 'job-up':
          if (id) this.handlers.moveJob(id, -1);
          break;
        case 'job-down':
          if (id) this.handlers.moveJob(id, 1);
          break;
        case 'job-cancel':
          if (id) this.handlers.cancelJob(id);
          break;
        case 'filament':
          this.handlers.buyFilament();
          break;
      }
    });
  }

  render(state: GameState) {
    this.renderTopbar(state);
    this.renderProject(state);
    this.renderMembers(state);
    this.renderPrinter(state);
    this.renderLog(state);
    this.renderOverlay(state);
  }

  private renderTopbar(state: GameState) {
    const machine = state.runtime.machines[0];
    const filament = machine ? Math.round(machine.consumable) : 0;
    const low = filament < FILAMENT.lowWarning;
    const speedButton = (value: number, label: string) => {
      const active = value === 0 ? state.paused : !state.paused && state.speed === value;
      return `<button data-action="speed" data-value="${value}" class="tiny ${active ? 'active' : ''}">${label}</button>`;
    };
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
      <div class="stat"><b style="color:${low ? 'var(--warn)' : 'inherit'}">${filament} g</b><span>filament</span></div>
    `;
  }

  private renderProject(state: GameState) {
    const project = state.runtime.project;
    if (!project) {
      this.project.innerHTML = `<p class="muted">No active project.</p>`;
      return;
    }
    const currentIndex = STAGE_ORDER.indexOf(project.stage);
    const stageDef = STAGE_MAP[project.stage];

    const pipeline = STAGES.map((stage) => {
      const index = STAGE_ORDER.indexOf(stage.key);
      const isActive = stage.key === project.stage;
      // Fabrication and Test carry no work units, so progress alone can't mark them done.
      const resolved =
        stage.key === 'fabrication'
          ? project.parts.length > 0 && project.parts.every((p) => p.status === 'done')
          : stage.key === 'test'
            ? project.testAttempts > 0
            : project.progress[stage.key] > 0;
      const done = index < currentIndex && resolved;
      let value = '';
      if (isActive && stage.work > 0) {
        value = `${Math.floor(project.progress[stage.key])}/${stage.work}`;
      } else if (isActive && stage.key === 'fabrication') {
        const done = project.parts.filter((p) => p.status === 'done').length;
        value = `${done}/${project.parts.length}`;
      } else if (done) {
        value = '✓';
      }
      const bounty = project.bounties.includes(stage.key) ? ' 🍕' : '';
      return `<div class="stage ${isActive ? 'active' : ''} ${done ? 'done' : ''}">
        <i class="dot"></i><span class="name">${stage.label}${bounty}</span><span class="val mono">${value}</span>
      </div>`;
    }).join('');

    const signed = state.runtime.members.filter((m) => m.signedUp === project.stage);
    const signedText = signed.length
      ? signed.map((m) => m.name).join(', ')
      : '<span style="color:var(--bad)">nobody</span>';

    const bountyCost = this.handlers.bountyCost();
    const canBounty = stageDef.work > 0 && !project.bounties.includes(project.stage);

    const parts = project.parts.length
      ? `<div class="parts">
          <div class="row between" style="margin-bottom:6px">
            <span class="muted" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase">Parts</span>
            <button class="tiny" data-action="queue-all" ${project.parts.some((p) => p.status === 'pending') ? '' : 'disabled'}>Queue pending</button>
          </div>
          ${project.parts
            .map(
              (p) => `<div class="part ${p.status}">
                <span class="pname">${p.name}</span>
                ${p.attempts > 0 ? `<span class="tag" title="failed attempts">×${p.attempts}</span>` : ''}
                <span class="tag">${p.status === 'done' ? 'done' : p.status === 'queued' ? 'queued' : hours(p.hours)}</span>
                ${p.status === 'pending' ? `<button class="tiny" data-action="queue-part" data-id="${p.id}">queue</button>` : ''}
              </div>`,
            )
            .join('')}
        </div>`
      : '';

    this.project.innerHTML = `
      <div class="row between" style="margin-bottom:8px">
        <b style="font-size:14px">${project.name}</b>
        <span class="mono muted" style="font-size:11px">Q ${pct(project.quality)}</span>
      </div>
      ${pipeline}
      <p class="blurb">${stageDef.blurb}</p>
      <div class="row" style="margin-bottom:8px;font-size:11.5px">
        <span class="muted">Working on it:</span><span>${signedText}</span>
      </div>
      <div class="verbs">
        <button data-action="repitch">Re-pitch</button>
        <button data-action="bounty" ${canBounty && state.cash >= bountyCost ? '' : 'disabled'}>
          Bounty · ${money(bountyCost)}
        </button>
        ${project.stage === 'simulation' ? `<button data-action="skip-sim">Skip simulation</button>` : ''}
      </div>
      ${project.defects.length ? `<p class="blurb" style="color:var(--bad);font-style:normal;margin-top:9px">⚠ ${project.defects[project.defects.length - 1]}</p>` : ''}
      ${parts}
    `;
  }

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
          <div class="note">${m.note || '—'}</div>
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

  private renderPrinter(state: GameState) {
    const machine = state.runtime.machines[0];
    if (!machine) {
      this.printer.innerHTML = `<p class="muted">No machine.</p>`;
      return;
    }
    const calTone =
      machine.calibration < MACHINE.calibrationWarning ? 'bad' : machine.calibration < 0.75 ? 'warn' : 'good';
    const riskClass = machine.risk > 0.35 ? 'danger' : machine.risk > 0.2 ? 'hot' : '';

    const current = machine.current
      ? `<div class="row between" style="margin-bottom:4px">
           <span>${machine.current.partName}</span>
           <span class="mono muted">${machine.current.progress.toFixed(1)} / ${machine.current.hoursRequired} h</span>
         </div>
         ${bar(machine.current.progress, machine.current.hoursRequired)}
         <div class="row between" style="margin-top:6px">
           <span class="muted" style="font-size:11px">failure risk</span>
           <span class="risk ${riskClass}">${pct(machine.risk)}</span>
         </div>`
      : `<div class="queue-empty">Idle. Nothing printing.</div>`;

    const queue = machine.queue.length
      ? machine.queue
          .map(
            (job, index) => `<div class="jobline">
              <span class="mono muted" style="width:14px">${index + 1}</span>
              <span class="jname">${job.partName}</span>
              <span class="mono muted">${hours(job.hoursRequired)}</span>
              <span class="ctrl">
                <button class="tiny" data-action="job-up" data-id="${job.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="tiny" data-action="job-down" data-id="${job.id}" ${index === machine.queue.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="tiny" data-action="job-cancel" data-id="${job.id}">×</button>
              </span>
            </div>`,
          )
          .join('')
      : `<div class="queue-empty">Queue empty.</div>`;

    this.printer.innerHTML = `
      ${current}
      <div style="margin:10px 0 6px;border-top:1px solid var(--line);padding-top:8px">
        <div class="meter" style="margin-bottom:6px"><label>calibration</label>${bar(machine.calibration, 1, calTone)}</div>
        <div class="meter"><label>filament</label>${bar(machine.consumable, machine.consumableMax, machine.consumable < FILAMENT.lowWarning ? 'warn' : '')}</div>
      </div>
      <button class="tiny" data-action="filament" ${state.cash >= FILAMENT.spoolCost ? '' : 'disabled'}>
        Buy spool · ${money(FILAMENT.spoolCost)}
      </button>
      <div style="margin-top:9px;border-top:1px solid var(--line);padding-top:7px">
        <div class="muted" style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">Queue</div>
        ${queue}
      </div>
    `;
  }

  private renderLog(state: GameState) {
    this.log.innerHTML = state.log
      .map(
        (entry) =>
          `<div class="entry ${entry.kind}"><time>d${entry.day} ${clock(entry.time)}</time><span>${entry.text}</span></div>`,
      )
      .join('');
  }

  private renderOverlay(state: GameState) {
    const project = state.runtime.project;
    const shipped = project?.shipped ?? false;
    if (!shipped) {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      return;
    }
    if (this.overlay || !project) return;
    const failedPrints = project.parts.reduce((sum, p) => sum + p.attempts, 0);
    this.overlay = document.createElement('div');
    this.overlay.id = 'overlay';
    this.overlay.innerHTML = `
      <div class="card">
        <h1>${project.name} — shipped</h1>
        <p>It flies, it is documented, and somebody already asked for the STL files.</p>
        <div class="stats">
          <div><b>${state.day}</b><span>days</span></div>
          <div><b>${failedPrints}</b><span>failed prints</span></div>
          <div><b>${pct(project.quality)}</b><span>quality</span></div>
        </div>
        <p style="margin-top:14px">Vertical slice complete. Reddit, funding and the space builder
        come next (CLAUDE.md §14).</p>
      </div>
    `;
    this.root.appendChild(this.overlay);
  }
}
