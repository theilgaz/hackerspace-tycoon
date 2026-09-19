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

    this.ui = new UI(uiRoot, {
      setSpeed: (speed) => {
        if (speed === 0) store.getState().setPaused(true);
        else store.getState().setSpeed(speed);
      },
      repitch: () => this.sim.repitch(),
      bounty: () => this.sim.postBounty(),
      bountyCost: () => this.sim.bountyCost(),
      skipSim: () => this.sim.skipSimulation(),
      queueAll: () => this.sim.queueAllPending(),
      queuePart: (id) => this.sim.queuePart(id),
      moveJob: (id, dir) => this.sim.moveJob(id, dir),
      cancelJob: (id) => this.sim.cancelJob(id),
      buyFilament: () => this.sim.buyFilament(),
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

    for (const member of runtime.members) {
      if (!member.present) continue;
      const world = this.view.memberWorld(member.id);
      if (!world) continue;
      const p = this.scene.project(world);
      parts.push(`<div class="label" style="left:${p.x}px;top:${p.y}px">${member.name}</div>`);
    }

    const machine = runtime.machines[0];
    if (machine) {
      const p = this.scene.project(this.view.printerWorld());
      let text = 'idle';
      let tone = '';
      if (machine.current) {
        const left = machine.current.hoursRequired - machine.current.progress;
        text = `${machine.current.partName} · ${left.toFixed(1)}h left`;
        if (machine.risk > 0.3) tone = 'warn';
      }
      if (machine.consumable <= 0) {
        text = 'out of filament';
        tone = 'bad';
      }
      parts.push(`<div class="label ${tone}" style="left:${p.x}px;top:${p.y}px">${text}</div>`);
    }

    this.labels.innerHTML = parts.join('');
  }
}

