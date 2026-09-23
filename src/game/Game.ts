import { SceneManager } from '@/render/SceneManager';
import { t } from '@/i18n';
import { SpaceView } from '@/render/SpaceView';
import { Thumbnails } from '@/render/Thumbnails';
import { furnitureFits } from '@/machines/layout';
import { Simulation } from '@/systems/Simulation';
import { UI } from '@/ui/ui';
import { store } from './store';
import { STATIONS, STATION_MAP, amenityPlacement, yawOf } from '@/machines/layout';
import { pct } from '@/utils/format';
import type { MachineType } from './types';
import { amenityDef } from '@/utils/amenities';
import { runDevCommand } from '@/systems/DevConsole';
import type { IconName } from '@/ui/icons';

/** What a station is for, shown when you point at one that has no queue of its own. */
const STATION_ROLE: Partial<Record<MachineType, string>> = {
  'cad-desk': 'modelling and write-ups',
  bench: 'soldering and electronics',
  assembly: 'putting it together',
  lounge: 'rest and arguing',
  'table-small': 'kickoffs for up to four',
  'table-large': 'kickoffs for up to ten',
  drybox: 'keeps the filament dry',
  reflow: 'SMD assembly',
  learning: 'training, one level at a time',
};
import { LOGOS } from '@/utils/rivals';
import { clearSave, readSave, writeSave, SAVE_VERSION, type SaveFile } from '@/systems/SaveGame';
import { eraDef } from '@/utils/constants';
import { applyLocale } from '@/i18n/preference';
import '@/ui/styles.css';

/** Orchestrator: owns the clock, the sim, the scene and the UI, and wires them together. */
export class Game {
  readonly sim = new Simulation();
  private readonly scene: SceneManager;
  private readonly view: SpaceView;
  private readonly ui: UI;
  private readonly labels: HTMLElement;
  private readonly thumbs: Thumbnails;
  private last = performance.now();
  /** Station under the cursor, for the hover label. */
  private hovered: string | null = null;
  private pointer = { x: 0, y: 0 };
  /** Where the last press landed, so a pan is not mistaken for a click. */
  private pressedAt: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, labels: HTMLElement, uiRoot: HTMLElement) {
    this.scene = new SceneManager(canvas);
    this.view = new SpaceView(this.scene.scene);
    this.labels = labels;
    this.thumbs = new Thumbnails((key) => this.view.previewModel(key));

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
      pitch: (defId, offerId, team, plan) => act(() => sim.pitch(defId, offerId, team, plan)),
      buyFurniture: (id) => act(() => sim.buyFurniture(id)),
      train: (memberId, skill) => act(() => sim.train(memberId, skill)),
      resaleOf: (id) => sim.resaleOf(id),
      sellPiece: (id) => act(() => sim.sellPiece(id)),
      trainCost: (memberId, skill) => sim.trainCost(memberId, skill),
      furnitureFits: (type, span) => this.fits(type, span),
      thumbnail: (key) => this.thumbs.get(key),
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
      buyFilament: (machineId) => act(() => sim.buyFilament(machineId)),
      refillCost: (machineId) => sim.refillCost(machineId),
      buyPrinter: (modelId) => act(() => sim.buyPrinter(modelId)),
      buyAmenity: (id) => act(() => sim.buyAmenity(id)),
      turnAmenity: () => this.turnHeld(),
      stopMoving: () => store.getState().setMoving(null),
      devCommand: (line) => runDevCommand(sim, line).lines,
      // A preference, not an action on the run: it goes straight to the store and storage.
      setLocale: (locale) => applyLocale(locale),
      sellPrinter: (machineId) => act(() => sim.sellPrinter(machineId)),
      signLease: () => act(() => sim.signLease()),
      nextLease: () => sim.nextLease(),
      resaleFor: (machineId) => sim.resaleFor(machineId),
      buyablePrinters: () => sim.buyablePrinters(),
      hire: (memberId) => act(() => sim.hire(memberId)),
      passApplicant: (memberId) => act(() => sim.passApplicant(memberId)),
      post: (projectId, subreddit, claim) => act(() => sim.post(projectId, subreddit, claim)),
      spaceSubject: () => sim.spaceSubject(),
      setRole: (memberId, role) => act(() => sim.setRole(memberId, role)),
      hireCost: (memberId) => sim.hireCost(memberId),
      begin: (name, logo, difficulty, player) => {
        const badge = LOGOS[logo] ?? LOGOS[0];
        store
          .getState()
          .begin({ name, icon: badge.icon, colour: badge.colour, player: player || undefined }, difficulty);
        // The difficulty is only known now, and it decides the size of the crew — so the
        // roster is built here rather than in the constructor.
        sim.seedRoster();
        sim.publish();
      },
      dismissCeremony: () => store.getState().setCeremony(null),
      continueRun: () => this.loadRun(),
      discardSave: () => {
        clearSave();
        this.ui.render(store.getState());
      },
      savedRun: () => readSave()?.summary ?? null,
      dismissBill: () => store.getState().setBill(null),
      letGo: (memberId) => act(() => sim.letGo(memberId)),
      previewBill: () => sim.previewBill(),
      scoreboard: () => sim.scoreboard(),
      allocation: () => sim.allocation,
      totalHours: () => sim.totalHours,
    });

    // UI reads the store and nothing else (CLAUDE.md §11).
    store.subscribe((state) => this.ui.render(state));
    this.ui.render(store.getState());

    canvas.addEventListener('pointermove', (event) => {
      this.pointer = { x: event.clientX, y: event.clientY };
    });
    // A click, not a drag: the canvas also pans on pointerdown, so a few pixels of travel
    // means the player was moving the camera and is not trying to pick anything up.
    canvas.addEventListener('pointerdown', (event) => {
      this.pressedAt = { x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener('pointerup', (event) => {
      const from = this.pressedAt;
      this.pressedAt = null;
      if (!from) return;
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > 5) return;
      this.clickRoom(event.clientX, event.clientY);
    });
    canvas.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.view.setHovered(null);
    });

    // Autosave every day, and once more on the way out of the tab.
    window.addEventListener('beforeunload', () => this.saveRun());

    this.bindKeys();
    requestAnimationFrame(this.loop);
  }

  /**
   * Would a piece of furniture fit? Asked by every Build card on every render, and the
   * answer only changes when the room does — so it is kept until something is bought,
   * moved or the lease changes.
   */
  private fitsCache = new Map<string, boolean>();
  private fitsKey = '';
  private fits(type: MachineType, span: number): boolean {
    const state = store.getState();
    const roomKey = `${STATIONS.length}|${state.amenityRev}|${state.era}|${state.amenities.length}`;
    if (roomKey !== this.fitsKey) {
      this.fitsKey = roomKey;
      this.fitsCache.clear();
    }
    const k = `${type}|${span}`;
    if (!this.fitsCache.has(k)) this.fitsCache.set(k, furnitureFits(type, span));
    return this.fitsCache.get(k)!;
  }

  /** Write the run to localStorage. Cheap enough to do once a day. */
  private saveRun() {
    const state = store.getState();
    if (!state.started) return;
    if (state.gameOver) {
      // A finished run is not something to come back to.
      clearSave();
      return;
    }
    const file: SaveFile = {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      store: state.snapshot(),
      sim: this.sim.serialise(),
      summary: {
        name: state.identity?.name ?? 'Your space',
        icon: state.identity?.icon ?? 'wrench',
        colour: state.identity?.colour ?? '#5ecfc0',
        day: state.day,
        shipped: state.shippedCount,
        reputation: state.reputation,
        cash: state.cash,
        era: eraDef(state.era).name,
      },
    };
    writeSave(file);
  }

  private loadRun() {
    const file = readSave();
    if (!file) return;
    store.getState().hydrate(file.store);
    this.sim.restore(file.sim);
    this.ui.render(store.getState());
  }

  /**
   * Rearranging the room (§7b). Anything on the floor — a bench, a printer, the sofa you
   * bought — can be picked up, dropped on a legal tile and turned. Click it to pick it up,
   * click a lit tile to set it down, click it again to turn it.
   *
   * **A station carries its stand tile with it**, which is the one thing that makes moving
   * a bench harder than moving an aquarium: the tile in front of it is not decoration, it
   * is the only place a person can stand to use it. Turning a station is therefore choosing
   * which side they stand on, and a tile with no legal side is not a place a bench can go.
   */
  private clickRoom(clientX: number, clientY: number) {
    const state = store.getState();
    if (!state.started || state.gameOver) return;
    const hit = this.scene.pick(clientX, clientY, this.view.pickables);

    // Already holding something: a click on a legal tile puts it down there, and a click
    // back on the thing itself turns it a quarter.
    if (state.moving) {
      if (hit === state.moving) {
        this.turnHeld();
        return;
      }
      // **Another piece of furniture takes over the selection.** Rearranging five things
      // used to mean pick up, drop, press Done, and start again for each one; now a click
      // on the next item simply picks that one up, and Done is only for when you finish.
      if (hit && this.movable(hit)) {
        store.getState().setMoving(hit);
        return;
      }
      const tile = this.scene.pickTile(clientX, clientY);
      if (tile && this.moveHeld(tile.x, tile.y, 0)) this.sim.publish();
      return;
    }

    if (hit && this.movable(hit)) store.getState().setMoving(hit);
  }

  /** Anything on the floor can be picked up: a station, or a floor-standing comfort you own. */
  private movable(id: string): boolean {
    if (STATION_MAP[id]) return true;
    return amenityDef(id)?.mount === 'floor' && store.getState().amenities.includes(id);
  }

  /** Put whatever is being carried on a tile, keeping the way it faces. */
  private moveHeld(x: number, y: number, turn: number): boolean {
    const id = store.getState().moving;
    if (!id) return false;
    const station = STATION_MAP[id];
    if (station) return this.sim.placeStation(id, x, y, yawOf(station) + turn);
    const place = amenityPlacement(id);
    return place ? this.sim.placeAmenity(id, x, y, place.yaw + turn) : false;
  }

  /** A quarter turn, in place. */
  private turnHeld() {
    const id = store.getState().moving;
    if (!id) return;
    const station = STATION_MAP[id];
    const at = station ? station.tile : amenityPlacement(id);
    if (!at) return;
    this.moveHeld(at.x, at.y, 1);
    this.sim.publish();
  }

  private bindKeys() {
    window.addEventListener('keydown', (event) => {
      // Never while somebody is typing. Space paused the game and swallowed the keypress,
      // so a hackerspace could not be given a name with a space in it — and 1/2/3 meant it
      // could not have a number in it either.
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? '')) {
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        store.getState().togglePause();
      }
      // Rearranging: turn what you are holding, or put it down and stop.
      if (store.getState().moving) {
        if (event.key === 'r' || event.key === 'R') {
          event.preventDefault();
          this.turnHeld();
          return;
        }
        if (event.key === 'Escape') {
          // The UI's own Escape handler runs first and unwinds any open popup; this only
          // sees the key once there is nothing left on top of the room.
          store.getState().setMoving(null);
          return;
        }
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
    if (state.started && !state.paused && !state.gameOver) {
      this.sim.tick(dt, state.speed);
      if (this.sim.dayRolled) {
        this.sim.dayRolled = false;
        this.saveRun();
      }
    }

    // A new room needs a new shot of it, so the camera reframes when the floor changes.
    if (this.view.setEra(state.era)) this.scene.resize();
    // Everything bought from the Shop stands in the room the moment it is paid for.
    this.view.setAmenities(state.amenities, state.amenityRev);
    this.view.setPlacing(state.moving);
    // The badge and the name go on the wall the moment the doors open.
    this.view.setSign(
      state.identity?.name ?? '',
      state.identity?.colour ?? '#5ecfc0',
      (state.identity?.icon as IconName | undefined) ?? null,
    );
    this.view.update(state.runtime, dt);
    const over = this.scene.pick(this.pointer.x, this.pointer.y, this.view.pickables);
    if (over !== this.hovered) {
      this.hovered = over;
      this.view.setHovered(over);
    }
    this.renderLabels();
    this.scene.render();
    requestAnimationFrame(this.loop);
  };

  /** Floating HTML labels over the 3D scene — cheaper and crisper than 3D text. */
  private renderLabels() {
    const runtime = store.getState().runtime;
    const parts: string[] = [];

    // A name, and under it their own share of the stage they are on (§4d): the stage is
    // pooled work, so the bar is what they have put in against an even split. Gold at a
    // kickoff, where everybody's share is the meeting itself.
    const personLabel = (id: string, name: string, share: number | null, kind: '' | 'meeting' | 'learning') => {
      const world = this.view.personWorld(id);
      if (!world) return;
      const p = this.scene.project(world);
      const bar =
        share === null
          ? ''
          : `<span class="share ${kind}"><i style="width:${Math.round(share * 100)}%"></i></span>`;
      parts.push(`<div class="label" style="left:${p.x}px;top:${p.y}px">${name}${bar}</div>`);
    };

    const atKickoff = (projectId: string | null) =>
      !!projectId && runtime.projects.some((x) => x.id === projectId && !x.kickedOff);
    for (const member of runtime.members) {
      if (!member.present) continue;
      // On a course, the bar is the course: how far through the level they are, in its own
      // colour so it never reads as a share of somebody's build.
      if (member.training) {
        const done = 1 - member.training.hoursLeft / Math.max(1, member.training.total);
        personLabel(member.id, member.name, Math.max(0, Math.min(1, done)), 'learning');
      } else {
        personLabel(member.id, member.name, member.share, atKickoff(member.team) ? 'meeting' : '');
      }
    }
    if (runtime.player?.present) {
      // Your own name if you gave one — the one person in the room the player picked.
      const you = store.getState().identity?.player || t('ui.you');
      personLabel('player', you.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!), runtime.player.share, atKickoff(runtime.player.project) ? 'meeting' : '');
    }

    // Machines that are doing something say so; everything else only speaks when pointed at.
    for (const machine of runtime.machines) {
      const world = this.view.machineWorld(machine.id);
      if (!world) continue;
      let text = '';
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
      if (!text) continue;
      const p = this.scene.project(world);
      parts.push(`<div class="label ${tone}" style="left:${p.x}px;top:${p.y}px">${text}</div>`);
    }

    if (this.hovered) {
      // A comfort says what it is and that it can be picked up — the only place the room
      // ever advertises that it is rearrangeable.
      const comfort = amenityDef(this.hovered);
      if (comfort) {
        const world = this.view.amenityWorld(this.hovered);
        if (world) {
          const p = this.scene.project(world);
          parts.push(
            `<div class="label label--station" style="left:${p.x}px;top:${p.y}px">
              <b>${comfort.name}</b><span>click to move · R turns it</span>
            </div>`,
          );
        }
      }
      const station = STATION_MAP[this.hovered];
      const world = this.view.stationWorldById(this.hovered);
      if (station && world) {
        const machine = runtime.machines.find((m) => m.id === this.hovered);
        const detail = machine
          ? machine.current
            ? `${pct(machine.current.progress / machine.current.hoursRequired)} · ${machine.queue.length} queued`
            : machine.queue.length
              ? `${machine.queue.length} queued`
              : 'idle'
          : STATION_ROLE[station.type] ?? '';
        const p = this.scene.project(world);
        parts.push(
          `<div class="label label--station" style="left:${p.x}px;top:${p.y}px">
            <b>${station.label}</b>${detail ? `<span>${detail}</span>` : ''}
            <span>click to move · R turns it</span>
          </div>`,
        );
      }
    }

    this.labels.innerHTML = parts.join('');
  }
}
