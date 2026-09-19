import { SceneManager } from '@/render/SceneManager';
import { SpaceView } from '@/render/SpaceView';
import { Simulation } from '@/systems/Simulation';
import { UI } from '@/ui/ui';
import { store } from './store';
import '@/ui/styles.css';

/** Orchestrator: owns the clock, the sim, the scene and the UI, and wires them together. */
export class Game {
  readonly sim = new Simulation();
  private readonly scene: SceneManager;
  private readonly view: SpaceView;
  private readonly ui: UI;
  private readonly labels: HTMLElement;
  private last = performance.now();

  constructor(canvas: HTMLCanvasElement, labels: HTMLElement, uiRoot: HTMLElement) {
    this.scene = new SceneManager(canvas);
    this.view = new SpaceView(this.scene.scene);
    this.labels = labels;

    const sim = this.sim;
    // Every action publishes a fresh snapshot: the game is often paused while you decide,
    // and the UI only ever reads the store (CLAUDE.md §11).
    const act = <T>(fn: () => T): T => {
      const result = fn();
      sim.publish();
      return result;
    };

    this.ui = new UI(uiRoot, {
      setSpeed: (speed) => {
        if (speed === 0) store.getState().setPaused(true);
        else store.getState().setSpeed(speed);
      },
      pitch: (defId, offerId, team) => act(() => sim.pitch(defId, offerId, team)),
      workOn: (projectId) => act(() => sim.workOn(projectId)),
      stopWork: () => act(() => sim.stopWork()),
      calibrate: () => act(() => sim.calibratePrinter()),
      invite: (projectId, memberId) => act(() => sim.inviteMember(projectId, memberId)),
      release: (projectId, memberId) => act(() => sim.releaseMember(projectId, memberId)),
      repitch: (projectId) => act(() => sim.repitch(projectId)),
      bounty: (projectId) => act(() => sim.postBounty(projectId)),
      bountyCost: (projectId) => sim.bountyCost(projectId),
      orderParts: (projectId) => act(() => sim.orderParts(projectId)),
      expedite: (projectId) => act(() => sim.expediteParts(projectId)),
      expediteCost: (projectId) => sim.expediteCostFor(projectId),
      skipSim: (projectId) => act(() => sim.skipSimulation(projectId)),
      queueAll: (projectId) => act(() => sim.queueAllPending(projectId)),
      queuePart: (projectId, partId) => act(() => sim.queuePart(projectId, partId)),
      moveJob: (machineId, jobId, dir) => act(() => sim.moveJob(machineId, jobId, dir)),
      cancelJob: (machineId, jobId) => act(() => sim.cancelJob(machineId, jobId)),
      buyFilament: () => act(() => sim.buyFilament()),
      allocation: () => sim.allocation,
      totalHours: () => sim.totalHours,
    });

    // UI reads the store and nothing else (CLAUDE.md §11).
    store.subscribe((state) => this.ui.render(state));
    this.ui.render(store.getState());

    this.bindKeys();
    requestAnimationFrame(this.loop);
  }

  private bindKeys() {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        store.getState().togglePause();
      }
      if (event.key === '1') store.getState().setSpeed(1);
      if (event.key === '2') store.getState().setSpeed(2);
      if (event.key === '3') store.getState().setSpeed(4);
    });
  }

  private loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    const state = store.getState();
    if (!state.paused) this.sim.tick(dt, state.speed);

    this.view.update(state.runtime, dt);
    this.renderLabels();
    this.scene.render();
    requestAnimationFrame(this.loop);
  };

  /** Floating HTML labels over the 3D scene — cheaper and crisper than 3D text. */
  private renderLabels() {
    const runtime = store.getState().runtime;
    const parts: string[] = [];

    const personLabel = (id: string, name: string) => {
      const world = this.view.personWorld(id);
      if (!world) return;
      const p = this.scene.project(world);
      parts.push(`<div class="label" style="left:${p.x}px;top:${p.y}px">${name}</div>`);
    };

    for (const member of runtime.members) {
      if (member.present) personLabel(member.id, member.name);
    }
    if (runtime.player?.present) personLabel('player', 'You');

    for (const machine of runtime.machines) {
      const world = this.view.machineWorld(machine.id);
      if (!world) continue;
      const p = this.scene.project(world);
      let text = 'idle';
      let tone = '';
      if (machine.current) {
        const left = machine.current.hoursRequired - machine.current.progress;
        text = `${machine.current.partName} · ${left.toFixed(1)}h left`;
        if (machine.risk > 0.3) tone = 'warn';
      }
      if (machine.consumableMax > 0 && machine.consumable <= 0) {
        text = 'out of filament';
        tone = 'bad';
      }
      parts.push(`<div class="label ${tone}" style="left:${p.x}px;top:${p.y}px">${text}</div>`);
    }

    this.labels.innerHTML = parts.join('');
  }
}
