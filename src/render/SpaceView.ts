import * as THREE from 'three';
import type { RuntimeSnapshot } from '@/game/types';
import { GRID, STATIONS } from '@/machines/layout';
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

function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.88,
    metalness: 0.02,
    ...opts,
  });
}

/**
 * Builds the garage and keeps it in sync with the sim snapshot. Clean low-poly,
 * flat-shaded, no textures — machine state must be legible at a glance (CLAUDE.md §11).
 */
export class SpaceView {
  readonly group = new THREE.Group();
  private members = new Map<string, THREE.Group>();
  private printerLight!: THREE.Mesh;
  private printerBar!: THREE.Mesh;
  private printerHead!: THREE.Object3D;
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.buildFloor();
    this.buildWalls();
    this.buildStations();
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
    // Back wall (y = -1) and left wall (x = -1), so the iso view stays open.
    const back = new THREE.Mesh(new THREE.BoxGeometry(GRID.width * TILE + 0.3, h, 0.18), wallMat);
    back.position.copy(toWorld((GRID.width - 1) / 2, -0.6, h / 2));
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

  private buildStations() {
    for (const def of STATIONS) {
      const node = new THREE.Group();
      node.position.copy(toWorld(def.tile.x, def.tile.y));
      switch (def.type) {
        case 'fdm':
          node.add(this.buildPrinter());
          break;
        case 'cad-desk':
          node.add(this.buildDesk('#3f7ea8'));
          break;
        case 'assembly':
          node.add(this.buildTable('#b07d4a'));
          break;
        case 'bench':
          node.add(this.buildTable('#8a6f52', true));
          break;
        case 'lounge':
          node.add(this.buildLounge());
          break;
      }
      this.group.add(node);
    }
  }

  private buildPrinter(): THREE.Group {
    const g = new THREE.Group();

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.8), mat('#2b313b'));
    base.position.y = 0.11;
    base.castShadow = true;
    g.add(base);

    // Open frame — two uprights and a crossbar reads as a printer from any angle.
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

    // Gantry + hotend: animates while a job runs.
    const head = new THREE.Group();
    const gantry = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.1), mat('#6f7b8c'));
    head.add(gantry);
    const hotend = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), mat('#d94f3d'));
    hotend.position.y = -0.11;
    head.add(hotend);
    head.position.set(0, 0.62, -0.3);
    this.printerHead = head;
    g.add(head);

    const bed = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.05, 0.6), mat('#1f242c'));
    bed.position.set(0, 0.25, -0.02);
    bed.receiveShadow = true;
    g.add(bed);

    // Status light — the at-a-glance state readout.
    this.printerLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#5a636f', emissive: '#000000', flatShading: true }),
    );
    this.printerLight.position.set(0.3, 0.3, 0.34);
    g.add(this.printerLight);

    // Progress bar floating above the machine.
    const barBack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.04), mat('#252b34'));
    barBack.position.set(0, 1.42, -0.3);
    g.add(barBack);
    this.printerBar = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.05, 0.06),
      new THREE.MeshStandardMaterial({ color: '#5ecfc0', flatShading: true, emissive: '#1d5f57' }),
    );
    this.printerBar.scale.x = 0;
    this.printerBar.position.set(-0.4, 1.42, -0.3);
    g.add(this.printerBar);

    return g;
  }

  private buildDesk(screenColor: string): THREE.Group {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.08, 0.6), mat('#9c7048'));
    top.position.y = 0.62;
    top.castShadow = true;
    g.add(top);
    for (const [sx, sz] of [
      [-0.38, -0.22],
      [0.38, -0.22],
      [-0.38, 0.22],
      [0.38, 0.22],
    ]) {
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
    for (const [sx, sz] of [
      [-0.39, -0.24],
      [0.39, -0.24],
      [-0.39, 0.24],
      [0.39, 0.24],
    ]) {
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

  private buildMember(id: string): THREE.Group {
    const g = new THREE.Group();
    const color = MEMBER_COLORS[id] ?? '#9aa7b8';
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.56, 7), mat(color));
    body.position.y = 0.28;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat('#e8c9a6'));
    head.position.y = 0.72;
    head.castShadow = true;
    g.add(head);
    this.group.add(g);
    return g;
  }

  update(runtime: RuntimeSnapshot, dt: number) {
    this.elapsed += dt;

    for (const m of runtime.members) {
      let node = this.members.get(m.id);
      if (!node) {
        node = this.buildMember(m.id);
        this.members.set(m.id, node);
      }
      node.visible = m.present;
      if (!m.present) continue;
      const world = toWorld(m.pos.x, m.pos.y);
      node.position.x = world.x;
      node.position.z = world.z;
      // A little bob while walking, a little sway while working.
      const walking = m.activity === 'walking';
      node.position.y = walking ? Math.abs(Math.sin(this.elapsed * 9)) * 0.07 : 0;
      node.rotation.y = m.activity === 'working' ? Math.sin(this.elapsed * 2.5) * 0.18 : 0;
    }

    const printer = runtime.machines.find((m) => m.type === 'fdm');
    if (printer && this.printerLight) {
      const light = this.printerLight.material as THREE.MeshStandardMaterial;
      let color = '#5a636f';
      let emissive = '#000000';
      if (printer.running) {
        color = '#5ecfc0';
        emissive = '#1f7a6d';
      }
      if (printer.calibration < MACHINE.calibrationWarning) {
        color = '#f0b429';
        emissive = '#6b4d05';
      }
      if (printer.consumable <= 0) {
        color = '#d94f3d';
        emissive = '#6d1f16';
      }
      light.color.set(color);
      light.emissive.set(emissive);

      const job = printer.current;
      const ratio = job ? job.progress / job.hoursRequired : 0;
      this.printerBar.scale.x = Math.max(0.001, ratio * 0.8);
      this.printerBar.position.x = -0.4 + (ratio * 0.8) / 2;
      const bar = this.printerBar.material as THREE.MeshStandardMaterial;
      bar.color.set(printer.risk > 0.3 ? '#f0b429' : '#5ecfc0');
      this.printerBar.visible = !!job;

      if (this.printerHead) {
        this.printerHead.position.y = job
          ? 0.34 + ratio * 0.55
          : 0.62;
        this.printerHead.position.x = job ? Math.sin(this.elapsed * 6) * 0.12 : 0;
      }
    }
  }

  memberWorld(id: string): THREE.Vector3 | null {
    const node = this.members.get(id);
    if (!node || !node.visible) return null;
    return new THREE.Vector3(node.position.x, 1.05, node.position.z);
  }

  printerWorld(): THREE.Vector3 {
    const def = STATIONS.find((s) => s.type === 'fdm')!;
    return toWorld(def.tile.x, def.tile.y, 1.75);
  }
}
