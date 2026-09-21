import * as THREE from 'three';
import type { MachineType, RuntimeSnapshot } from '@/game/types';
import { GRID, STATIONS, type StationDef } from '@/machines/layout';
import { MACHINE } from '@/utils/constants';

const TILE = 1;

/** Tile coordinates → world. The grid is centred on the origin. */
export function toWorld(x: number, y: number, height = 0): THREE.Vector3 {
  return new THREE.Vector3(
    (x - (GRID.width - 1) / 2) * TILE,
    height,
    (y - (GRID.height - 1) / 2) * TILE,
  );
}

const MEMBER_COLORS: Record<string, string> = {
  deniz: '#5ecfc0',
  ada: '#f0b429',
  kerem: '#e2725b',
};
const PLAYER_COLOR = '#dfe6f0';

/** One accent per station type — used for the painted floor zone and the hover ring. */
const STATION_TONE: Record<string, string> = {
  fdm: '#5ecfc0',
  cnc: '#d9a441',
  reflow: '#e2725b',
  drybox: '#7fb2f0',
  'cad-desk': '#5aa9f0',
  bench: '#f0b429',
  assembly: '#b07d4a',
  lounge: '#a2564c',
};

/** Stable colour for recruits, matching the dot the UI shows. */
function personColor(id: string): string {
  const palette = ['#7fb2f0', '#c58ef0', '#8fd88f', '#f08fa4', '#e0c36a', '#6fd0e0', '#d49a6a'];
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.88,
    metalness: 0.02,
    ...opts,
  });
}

interface MachineVisual {
  light: THREE.Mesh;
  bar: THREE.Mesh;
  head?: THREE.Object3D;
}

/**
 * Builds the space and keeps it in sync with the sim snapshot. Clean low-poly,
 * flat-shaded, no textures — machine state must be legible at a glance (CLAUDE.md §11).
 */
export class SpaceView {
  readonly group = new THREE.Group();
  private people = new Map<string, THREE.Group>();
  private machineVisuals = new Map<string, MachineVisual>();
  private builtStations = new Set<string>();
  private stationNodes = new Map<string, THREE.Group>();
  private stationZones = new Map<string, THREE.Mesh>();
  private hovered: string | null = null;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.buildFloor();
    this.buildWalls();
    this.syncStations();
  }

  private buildFloor() {
    const light = mat('#626b7c');
    const dark = mat('#58606f');
    const geo = new THREE.BoxGeometry(TILE, 0.12, TILE);
    for (let y = 0; y < GRID.height; y += 1) {
      for (let x = 0; x < GRID.width; x += 1) {
        const tile = new THREE.Mesh(geo, (x + y) % 2 === 0 ? light : dark);
        tile.position.copy(toWorld(x, y, -0.06));
        tile.receiveShadow = true;
        this.group.add(tile);
      }
    }
  }

  private buildWalls() {
    const wallMat = mat('#3d4551');
    const h = 1.8;
    const back = new THREE.Mesh(new THREE.BoxGeometry(GRID.width * TILE + 0.3, h, 0.18), wallMat);
    back.position.copy(toWorld((GRID.width - 1) / 2, -0.6));
    back.position.y = h / 2;
    back.castShadow = true;
    back.receiveShadow = true;
    this.group.add(back);

    const left = new THREE.Mesh(new THREE.BoxGeometry(0.18, h, GRID.height * TILE + 0.3), wallMat);
    left.position.copy(toWorld(-0.6, (GRID.height - 1) / 2));
    left.position.y = h / 2;
    left.castShadow = true;
    left.receiveShadow = true;
    this.group.add(left);
  }

  /** Stations can appear mid-game when a tool project ships. */
  private syncStations() {
    for (const def of STATIONS) {
      if (this.builtStations.has(def.id)) continue;
      this.builtStations.add(def.id);
      const tone = STATION_TONE[def.type] ?? '#8a92a0';

      // A painted bay under each station, so the room reads as laid out rather than as
      // furniture dropped on a floor — and it gives the hover something to light up.
      const zone = new THREE.Mesh(
        new THREE.BoxGeometry(TILE * 0.96, 0.02, TILE * 1.94),
        new THREE.MeshStandardMaterial({ color: tone, flatShading: true, transparent: true, opacity: 0.14 }),
      );
      // Everything is modelled facing +y. Turn it toward whoever stands at it, and run the
      // bay the same way — it used to always point along -y, so a station against the left
      // wall faced away from its own user and its bay lay across its neighbour's.
      const dx = def.stand.x - def.tile.x;
      const dy = def.stand.y - def.tile.y;
      // Grid +y is world +z and a positive rotation.y turns +z toward +x, so this is the
      // angle that points the front of the model at its stand tile. The sign was inverted
      // and only the sofa could show it — every other station is symmetric enough to look
      // the same either way, which is why a bench facing its own wall went unnoticed.
      // Snapped to quarter turns: the room is drawn isometrically, so anything at 45° stops
      // reading as part of the grid and starts looking like a box lying on top of it. A
      // station may only ever face along an axis, whatever its stand tile happens to be.
      const quarter = Math.PI / 2;
      const yaw = dx || dy ? Math.round(Math.atan2(dx, dy) / quarter) * quarter : 0;
      zone.rotation.y = yaw;
      zone.position.copy(toWorld(def.tile.x + dx * 0.5, def.tile.y + dy * 0.5, 0.012));
      this.group.add(zone);

      const node = new THREE.Group();
      node.position.copy(toWorld(def.tile.x, def.tile.y));
      node.rotation.y = yaw;
      node.add(this.buildStation(def));
      node.userData.stationId = def.id;
      this.group.add(node);
      this.stationNodes.set(def.id, node);
      this.stationZones.set(def.id, zone);
    }
  }

  /** Objects the camera can pick against for hover. */
  get pickables(): THREE.Object3D[] {
    return [...this.stationNodes.values()];
  }

  /** Light the bay under whichever station the cursor is over. */
  setHovered(id: string | null) {
    if (this.hovered === id) return;
    this.hovered = id;
    for (const [key, zone] of this.stationZones) {
      const material = zone.material as THREE.MeshStandardMaterial;
      material.opacity = key === id ? 0.42 : 0.14;
    }
  }

  stationWorldById(id: string): THREE.Vector3 | null {
    const def = STATIONS.find((s) => s.id === id);
    return def ? toWorld(def.tile.x, def.tile.y, 1.35) : null;
  }

  private buildStation(def: StationDef): THREE.Object3D {
    switch (def.type) {
      case 'fdm':
        return this.buildPrinter(def.id);
      case 'cnc':
        return this.buildCnc(def.id);
      case 'reflow':
        return this.buildReflow();
      case 'cad-desk':
        return this.buildDesk('#3f7ea8');
      case 'assembly':
        return this.buildTable('#b07d4a');
      case 'bench':
        return this.buildTable('#8a6f52', true);
      case 'lounge':
        return this.buildLounge();
      default:
        return this.buildTable('#7d8390');
    }
  }

  /** Status light + progress bar: the at-a-glance machine readout. */
  private addReadout(g: THREE.Group, id: string, height: number, head?: THREE.Object3D) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#5a636f', emissive: '#000000', flatShading: true }),
    );
    light.position.set(0.3, 0.3, 0.34);
    g.add(light);

    const barBack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.04), mat('#252b34'));
    barBack.position.set(0, height, -0.3);
    g.add(barBack);

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.05, 0.06),
      new THREE.MeshStandardMaterial({ color: '#5ecfc0', flatShading: true, emissive: '#1d5f57' }),
    );
    bar.scale.x = 0;
    bar.position.set(-0.4, height, -0.3);
    g.add(bar);

    this.machineVisuals.set(id, { light, bar, head });
  }

  private buildPrinter(id: string): THREE.Group {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.8), mat('#2b313b'));
    base.position.y = 0.11;
    base.castShadow = true;
    g.add(base);

    const post = mat('#8d98a8');
    for (const sx of [-0.33, 0.33]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95, 0.07), post);
      upright.position.set(sx, 0.7, -0.3);
      upright.castShadow = true;
      g.add(upright);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.07, 0.07), post);
    cross.position.set(0, 1.12, -0.3);
    g.add(cross);

    const head = new THREE.Group();
    head.add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.1), mat('#6f7b8c')));
    const hotend = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), mat('#d94f3d'));
    hotend.position.y = -0.11;
    head.add(hotend);
    head.position.set(0, 0.62, -0.3);
    g.add(head);

    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.6), mat('#1f242c'));
    bed.position.set(0, 0.25, -0.02);
    bed.receiveShadow = true;
    g.add(bed);

    this.addReadout(g, id, 1.42, head);
    return g;
  }

  private buildCnc(id: string): THREE.Group {
    const g = new THREE.Group();
    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.3, 0.8), mat('#4a515e'));
    bed.position.y = 0.15;
    bed.castShadow = true;
    g.add(bed);
    const rail = mat('#99a4b4');
    for (const sx of [-0.4, 0.4]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.09), rail);
      post.position.set(sx, 0.6, -0.2);
      g.add(post);
    }
    const head = new THREE.Group();
    head.add(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 0.12), rail));
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.26, 8), mat('#d9a441'));
    spindle.position.y = -0.16;
    head.add(spindle);
    head.position.set(0, 0.86, -0.2);
    g.add(head);
    this.addReadout(g, id, 1.14, head);
    return g;
  }

  private buildReflow(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.66), mat('#5c4b45'));
    body.position.y = 0.25;
    body.castShadow = true;
    g.add(body);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.34, 0.05),
      new THREE.MeshStandardMaterial({ color: '#2a2220', emissive: '#48200c', flatShading: true }),
    );
    door.position.set(0, 0.27, 0.34);
    g.add(door);
    return g;
  }

  private buildDesk(screenColor: string): THREE.Group {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.6), mat('#9c7048'));
    top.position.y = 0.62;
    top.castShadow = true;
    g.add(top);
    for (const [sx, sz] of [[-0.38, -0.22], [0.38, -0.22], [-0.38, 0.22], [0.38, 0.22]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), mat('#4c5360'));
      leg.position.set(sx, 0.31, sz);
      g.add(leg);
    }
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.36, 0.04),
      new THREE.MeshStandardMaterial({ color: screenColor, emissive: '#12384d', flatShading: true }),
    );
    screen.position.set(0, 0.86, -0.18);
    screen.rotation.x = -0.12;
    g.add(screen);
    return g;
  }

  private buildTable(color: string, withTools = false): THREE.Group {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.09, 0.66), mat(color));
    top.position.y = 0.6;
    top.castShadow = true;
    g.add(top);
    for (const [sx, sz] of [[-0.39, -0.24], [0.39, -0.24], [-0.39, 0.24], [0.39, 0.24]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), mat('#4c5360'));
      leg.position.set(sx, 0.3, sz);
      g.add(leg);
    }
    if (withTools) {
      const iron = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.07), mat('#d94f3d'));
      iron.position.set(-0.18, 0.69, 0.06);
      iron.rotation.y = 0.4;
      g.add(iron);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.2), mat('#3f7ea8'));
      box.position.set(0.26, 0.73, -0.08);
      g.add(box);
    }
    return g;
  }

  private buildLounge(): THREE.Group {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.24, 0.62), mat('#a2564c'));
    seat.position.y = 0.3;
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 0.16), mat('#8f4a41'));
    back.position.set(0, 0.55, -0.24);
    g.add(back);
    const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), mat('#cbd3de'));
    kettle.position.set(0.42, 0.52, 0.22);
    g.add(kettle);
    return g;
  }

  private buildPerson(id: string, isPlayer: boolean): THREE.Group {
    const g = new THREE.Group();
    const color = isPlayer ? PLAYER_COLOR : (MEMBER_COLORS[id] ?? personColor(id));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.56, 7), mat(color));
    body.position.y = 0.28;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat('#e8c9a6'));
    head.position.y = 0.72;
    head.castShadow = true;
    g.add(head);
    if (isPlayer) {
      // A ring so you can always find yourself in the room.
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.035, 6, 20),
        new THREE.MeshStandardMaterial({ color: '#f0b429', emissive: '#5a3f08', flatShading: true }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03;
      g.add(ring);
    }
    this.group.add(g);
    return g;
  }

  private placePerson(
    id: string,
    isPlayer: boolean,
    present: boolean,
    pos: { x: number; y: number },
    activity: string,
  ) {
    let node = this.people.get(id);
    if (!node) {
      node = this.buildPerson(id, isPlayer);
      this.people.set(id, node);
    }
    node.visible = present;
    if (!present) return;
    const world = toWorld(pos.x, pos.y);
    node.position.x = world.x;
    node.position.z = world.z;
    node.position.y = activity === 'walking' ? Math.abs(Math.sin(this.elapsed * 9)) * 0.07 : 0;
    node.rotation.y = activity === 'working' ? Math.sin(this.elapsed * 2.5) * 0.18 : 0;
  }

  update(runtime: RuntimeSnapshot, dt: number) {
    this.elapsed += dt;
    this.syncStations();

    for (const m of runtime.members) {
      this.placePerson(m.id, false, m.present, m.pos, m.activity);
    }
    if (runtime.player) {
      this.placePerson('player', true, runtime.player.present, runtime.player.pos, runtime.player.activity);
    }

    for (const machine of runtime.machines) {
      const visual = this.machineVisuals.get(machine.id);
      if (!visual) continue;

      const light = visual.light.material as THREE.MeshStandardMaterial;
      let color = '#5a636f';
      let emissive = '#000000';
      if (machine.running) {
        color = '#5ecfc0';
        emissive = '#1f7a6d';
      }
      if (machine.calibration < MACHINE.calibrationWarning) {
        color = '#f0b429';
        emissive = '#6b4d05';
      }
      if (machine.consumableMax > 0 && machine.consumable <= 0) {
        color = '#d94f3d';
        emissive = '#6d1f16';
      }
      light.color.set(color);
      light.emissive.set(emissive);

      const job = machine.current;
      const ratio = job ? job.progress / job.hoursRequired : 0;
      visual.bar.scale.x = Math.max(0.001, ratio * 0.8);
      visual.bar.position.x = -0.4 + (ratio * 0.8) / 2;
      (visual.bar.material as THREE.MeshStandardMaterial).color.set(machine.risk > 0.3 ? '#f0b429' : '#5ecfc0');
      visual.bar.visible = !!job;

      if (visual.head) {
        visual.head.position.y = job ? 0.34 + ratio * 0.55 : 0.62;
        visual.head.position.x = job ? Math.sin(this.elapsed * 6) * 0.12 : 0;
      }
    }
  }

  personWorld(id: string): THREE.Vector3 | null {
    const node = this.people.get(id);
    if (!node || !node.visible) return null;
    return new THREE.Vector3(node.position.x, 1.05, node.position.z);
  }

  stationWorld(type: MachineType): THREE.Vector3 | null {
    const def = STATIONS.find((s) => s.type === type);
    return def ? toWorld(def.tile.x, def.tile.y, 1.75) : null;
  }

  machineWorld(id: string): THREE.Vector3 | null {
    const def = STATIONS.find((s) => s.id === id);
    return def ? toWorld(def.tile.x, def.tile.y, 1.75) : null;
  }
}
