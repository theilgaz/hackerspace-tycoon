import * as THREE from 'three';
import type { MachineType, RuntimeSnapshot } from '@/game/types';
import {
  GRID,
  STATIONS,
  STATION_MAP,
  amenityPlacement,
  amenityTileFree,
  stationTileFree,
  type StationDef,
} from '@/machines/layout';
import { amenityDef, type AmenityDef } from '@/utils/amenities';
import { MACHINE } from '@/utils/constants';
import { iconDataUrl, type IconName } from '@/ui/icons';

const TILE = 1;

/** Tile coordinates → world. The grid is centred on the origin. */
/** One palette per lease, indexed by era (index 0 is unused so `era` reads directly). */
const ERA_TONE = [
  { floorLight: '#626b7c', floorDark: '#58606f', wall: '#3d4551' },
  { floorLight: '#626b7c', floorDark: '#58606f', wall: '#3d4551' }, // the garage: cold concrete
  { floorLight: '#6f6a63', floorDark: '#635e58', wall: '#4a4741' }, // Unit 4B: painted, warmer
  { floorLight: '#8a8c90', floorDark: '#7e8085', wall: '#565c66' }, // the warehouse: poured floor
];

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

/**
 * Paints the badge and the name onto a canvas for the wall sign. **This is the one texture
 * in the room**, and it is a deliberate exception to §11's "no textures": letterforms are
 * the single thing flat-shaded boxes cannot do, and a hackerspace with its name on the wall
 * is what every one of them actually looks like.
 *
 * Two details worth keeping. Letter spacing is applied a character at a time rather than
 * through `ctx.letterSpacing`, which is recent enough that it would silently do nothing on
 * an older engine — and a sign that quietly loses its spacing is worse than one that never
 * had any. And the badge is an `<img>`, so it **arrives after the text**: its box is
 * measured and reserved up front, which is what stops the layout jumping when it lands.
 */
function paintSign(
  name: string,
  colour: string,
  badge: IconName | null,
  onBadge: () => void,
): { texture: THREE.CanvasTexture; aspect: number } {
  const text = name.trim().toUpperCase();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Measure first, then size the canvas to the text: a fixed canvas either crops a long
  // name or stretches a short one across half the wall.
  const size = 84;
  const font = (px: number) => `600 ${px}px 'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace`;
  const spacing = size * 0.16;
  const widthOf = (px: number) => {
    ctx.font = font(px);
    let w = 0;
    for (const ch of text) w += ctx.measureText(ch).width + spacing;
    return Math.max(1, w - spacing);
  };

  // Long names shrink rather than run off the end of the wall.
  const maxText = 1500;
  const px = widthOf(size) > maxText ? Math.max(38, Math.floor(size * (maxText / widthOf(size)))) : size;
  const textWidth = widthOf(px);

  // Sized against the cap height rather than the line: a lucide glyph carries padding
  // inside its own 24px box, so a badge set to the height of the letters reads smaller
  // than them.
  const badgeSize = badge ? px * 1.45 : 0;
  const badgeGap = badge ? px * 0.46 : 0;
  const padX = px * 0.5;
  canvas.width = Math.ceil(padX * 2 + badgeSize + badgeGap + textWidth);
  canvas.height = Math.ceil(px * 2.1);

  ctx.font = font(px);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const baseline = px * 1.1;
  const textLeft = padX + badgeSize + badgeGap;

  let cursor = textLeft;
  ctx.fillStyle = colour;
  for (const ch of text) {
    ctx.fillText(ch, cursor, baseline);
    cursor += ctx.measureText(ch).width + spacing;
  }

  // A rule under the whole mark, badge included, the way a painted sign is finished. It is
  // what ties the two halves together rather than leaving a logo standing next to a word.
  const ruleY = baseline + px * 0.36;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(padX, ruleY, badgeSize + badgeGap + textWidth, Math.max(2, px * 0.055));
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  if (badge) {
    const img = new Image();
    img.onload = () => {
      // Optically centred on the letters rather than on the canvas: the cap height is the
      // line the eye reads along, and the descender space below it is not part of the word.
      ctx.drawImage(img, padX, baseline - px * 0.74 - (badgeSize - px * 0.74) / 2, badgeSize, badgeSize);
      texture.needsUpdate = true;
      onBadge();
    };
    img.src = iconDataUrl(badge, colour, 256, 2.1); // a hair heavier: it is read across a room
  }

  return { texture, aspect: canvas.width / canvas.height };
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
  /** Which lease the room is currently painted as. */
  private era = 1;
  private stationNodes = new Map<string, THREE.Group>();
  private stationZones = new Map<string, THREE.Mesh>();
  private hovered: string | null = null;
  private elapsed = 0;
  /** The name painted on the left wall, and what it is painted in. */
  private signName = '';
  private signColour = '#5ecfc0';
  private signBadge: IconName | null = null;
  private sign: THREE.Mesh | null = null;
  /** Bumped on every repaint, so a badge that loads late cannot draw onto a stale sign. */
  private signToken = 0;
  /** Comforts bought from the Shop, in the order they were bought (§7b). */
  private amenityIds: string[] = [];
  private amenityKey = '';
  private amenityNodes = new Map<string, THREE.Object3D>();
  /** The comfort being moved, and the tiles it is allowed to go on. */
  private placing: string | null = null;
  private placingMarks: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.buildFloor();
    this.buildWalls();
    this.syncStations();
  }

  /**
   * Each lease looks like itself. A move you paid ₺18,000 for should be visible the moment
   * it happens, so the floor and the walls change with the era: a cold concrete garage, a
   * warmer painted unit, then the pale poured floor of a proper warehouse.
   */
  private buildFloor() {
    const tone = ERA_TONE[this.era];
    const light = mat(tone.floorLight);
    const dark = mat(tone.floorDark);
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
    const wallMat = mat(ERA_TONE[this.era].wall);
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

    this.buildSign(h);
  }

  /**
   * The space's name, painted on the long left wall. It goes there rather than on the back
   * wall because the back wall is where the kit lives — the left wall is the one big blank
   * face the camera looks straight at, and it is still blank in the warehouse.
   */
  private buildSign(wallHeight = 1.8) {
    if (this.sign) {
      this.group.remove(this.sign);
      (this.sign.material as THREE.MeshStandardMaterial).map?.dispose();
      (this.sign.material as THREE.Material).dispose();
      this.sign.geometry.dispose();
      this.sign = null;
    }
    if (!this.signName.trim()) return;

    this.signToken += 1;
    const token = this.signToken;
    const { texture, aspect } = paintSign(this.signName, this.signColour, this.signBadge, () => {
      if (token !== this.signToken) texture.dispose();
    });
    // **Sized by the wall it is on, not by a fixed cap height.** A fixed height made a long
    // name a thin strip across a fifth of the wall — the letters have to grow or shrink so
    // that a one-word name and a four-word one both take up about half the wall. The cap
    // stops a short name turning into a billboard.
    const wallLength = GRID.height * TILE + 0.3;
    let height = Math.min(0.62, Math.max(0.3, (wallLength * 0.66) / aspect));
    let width = height * aspect;
    if (width > wallLength * 0.78) {
      width = wallLength * 0.78;
      height = width / aspect;
    }

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        roughness: 1,
        metalness: 0,
        // Paint, not a lightbox: lit like the wall it is on, with just enough emission that
        // it stays readable in the corner the key light never reaches.
        emissive: new THREE.Color(this.signColour),
        emissiveMap: texture,
        emissiveIntensity: 0.55,
        depthWrite: false,
      }),
    );
    // A plane faces +z; a quarter turn puts it against the inside face of the wall, with
    // its own left-to-right running up the room, which is the direction the wall recedes in.
    mesh.rotation.y = Math.PI / 2;
    mesh.position.copy(toWorld(-0.6, (GRID.height - 1) / 2));
    mesh.position.x += 0.1;
    mesh.position.y = wallHeight * 0.64;
    this.group.add(mesh);
    this.sign = mesh;
  }

  /** Called every frame by `Game`; repaints only when the mark itself changes. */
  setSign(name: string, colour: string, badge: IconName | null) {
    if (name === this.signName && colour === this.signColour && badge === this.signBadge) return;
    this.signName = name;
    this.signColour = colour;
    this.signBadge = badge;
    this.buildSign();
  }

  /** Stations can appear mid-game when a tool project ships, and go again when one is sold. */
  private syncStations() {
    // This only ever added: selling a printer took it out of the layout and the sim, but its
    // model stayed on the floor for good, still lit and still hoverable.
    for (const id of [...this.builtStations]) {
      if (!STATIONS.some((s) => s.id === id)) this.removeStationNode(id);
    }
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
      this.group.add(zone);

      const node = new THREE.Group();
      node.add(this.buildStation(def));
      node.userData.stationId = def.id;
      node.userData.pickId = def.id;
      this.group.add(node);
      this.stationNodes.set(def.id, node);
      this.stationZones.set(def.id, zone);
    }
    this.syncStationPlaces();
  }

  /**
   * Put every station where the room says it is. Split out from building them because a
   * station can now be **moved** as well as installed: rebuilding the model to shift it one
   * tile would throw away the machine's readout handles and the hover state with it.
   */
  private syncStationPlaces() {
    for (const def of STATIONS) {
      const node = this.stationNodes.get(def.id);
      const zone = this.stationZones.get(def.id);
      if (!node || !zone) continue;
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
      node.rotation.y = yaw;
      node.position.copy(toWorld(def.tile.x, def.tile.y));
      node.position.y = def.id === this.placing ? 0.16 : 0;
    }
  }

  private removeStationNode(id: string) {
    for (const object of [this.stationNodes.get(id), this.stationZones.get(id)]) {
      if (!object) continue;
      this.group.remove(object);
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        for (const material of [child.material].flat()) material.dispose();
      });
    }
    this.stationNodes.delete(id);
    this.stationZones.delete(id);
    this.machineVisuals.delete(id);
    this.builtStations.delete(id);
    if (this.hovered === id) this.hovered = null;
  }

  /** Where a comfort is standing, for the hover label above it. */
  amenityWorld(id: string): THREE.Vector3 | null {
    const node = this.amenityNodes.get(id);
    return node ? node.position.clone().setY(node.position.y + 0.95) : null;
  }

  /** Objects the camera can pick against for hover and for picking something up. */
  get pickables(): THREE.Object3D[] {
    return [...this.stationNodes.values(), ...this.amenityNodes.values()];
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

  // -------------------------------------------------------------------------
  // The Shop's comforts (§7b)
  // -------------------------------------------------------------------------

  /**
   * Called every frame by `Game`; rebuilds only when the arrangement actually changes. The
   * revision counter is in the key as well as the ids, so moving something rebuilds without
   * the caller having to hash a map of tiles sixty times a second.
   */
  setAmenities(ids: string[], rev: number) {
    const key = `${rev}:${ids.join(',')}`;
    if (key === this.amenityKey) return;
    this.amenityKey = key;
    this.amenityIds = [...ids];
    this.buildAmenities();
    this.syncStationPlaces();
    if (this.placing) this.markPlaceable();
  }

  /**
   * Enter or leave move mode. While something is selected it lifts off the floor and every
   * tile it could stand on is lit — **the legal tiles have to be visible before the click**,
   * or moving furniture is a guessing game with an invisible rulebook.
   */
  setPlacing(id: string | null) {
    if (id === this.placing) return;
    this.placing = id;
    this.markPlaceable();
    this.liftPlacing();
    this.syncStationPlaces();
  }

  /**
   * Lift whatever is being carried. **It has to add to the height the item already had**,
   * not set it: writing `position.y` outright dropped the air conditioning unit off the
   * wall and half into the floor, because a wall-mounted node's height *is* its mounting.
   */
  private liftPlacing() {
    for (const [id, node] of this.amenityNodes) {
      const base = (node.userData.baseY as number) ?? 0;
      node.position.y = base + (id === this.placing ? 0.16 : 0);
    }
  }

  private markPlaceable() {
    for (const mark of this.placingMarks) {
      this.group.remove(mark);
      (mark as THREE.Mesh).geometry.dispose();
      ((mark as THREE.Mesh).material as THREE.Material).dispose();
    }
    this.placingMarks = [];
    if (!this.placing) return;
    // A dot per tile, not a plate. Filling every legal tile with a translucent square
    // washed the whole floor teal — which says "the room is highlighted", not "these are
    // the tiles". A small marker reads as a placement grid and leaves the floor alone.
    const geo = new THREE.BoxGeometry(TILE * 0.2, 0.02, TILE * 0.2);
    for (let y = 0; y < GRID.height; y += 1) {
      for (let x = 0; x < GRID.width; x += 1) {
        // A station and a sofa have different rules about where they may stand — a bench
        // also needs a free tile in front of it — so the marker asks whichever applies.
        const legal = STATION_MAP[this.placing]
          ? stationTileFree({ x, y }, this.placing)
          : amenityTileFree({ x, y }, this.placing);
        if (!legal) continue;
        const mark = new THREE.Mesh(
          geo.clone(),
          new THREE.MeshStandardMaterial({
            color: '#5ecfc0',
            flatShading: true,
            transparent: true,
            opacity: 0.55,
            emissive: new THREE.Color('#2f8f84'),
            emissiveIntensity: 0.6,
          }),
        );
        mark.position.copy(toWorld(x, y, 0.014));
        this.group.add(mark);
        this.placingMarks.push(mark);
      }
    }
  }

  /**
   * Everything the space has bought for the people in it. **A comfort you cannot see is a
   * number in a panel**, and the whole reason the shop is worth building is that ₺22,000 of
   * arcade cabinet should be standing in the room the moment it is paid for.
   */
  private buildAmenities() {
    for (const node of this.amenityNodes.values()) {
      this.group.remove(node);
      node.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        for (const material of [child.material].flat()) material.dispose();
      });
    }
    this.amenityNodes.clear();

    for (const id of this.amenityIds) {
      const def = amenityDef(id);
      if (!def) continue;
      const node = new THREE.Group();
      node.add(this.buildProp(def));
      node.userData.pickId = id;

      if (def.mount === 'wall') {
        this.placeOnWall(node, def);
      } else {
        // The room owns where things stand — the player's tile if they moved it, the next
        // derived slot if they have not.
        const place = amenityPlacement(id);
        if (!place) continue; // more comforts than the room has floor; it waits for a lease
        node.position.copy(toWorld(place.x, place.y));
        // **They start facing the camera, and that is not the same as facing into the
        // room.** An isometric camera only ever sees the +x and +z faces, so a fridge turned
        // to look up the room — which is what a station's stand tile would ask for —
        // presents its back and becomes a dark box. Nobody operates these, so their facing
        // is a matter of taste, which is exactly why the player turns them by hand.
        node.rotation.y = (place.yaw * Math.PI) / 2;
      }
      node.userData.baseY = node.position.y;
      this.group.add(node);
      this.amenityNodes.set(id, node);
    }
    this.liftPlacing();
  }

  /** Wall-mounted kit hangs off the back wall, which is the one the camera reads across. */
  private placeOnWall(node: THREE.Object3D, def: AmenityDef) {
    const back = toWorld((GRID.width - 1) / 2, -0.6);
    node.position.z = back.z + 0.1;
    if (def.shape === 'ac') {
      node.position.x = toWorld(GRID.width - 1.4, 0).x;
      node.position.y = 1.34;
    } else {
      node.position.x = back.x;
      node.position.y = 1.16;
    }
  }

  private buildProp(def: AmenityDef): THREE.Object3D {
    switch (def.shape) {
      case 'coffee':
        return this.propCoffee(def.tone);
      case 'water':
        return this.propWater(def.tone);
      case 'couch':
        return this.propCouch(def.tone);
      case 'fridge':
        return this.propFridge(def.tone);
      case 'ac':
        return this.propAirCon(def.tone);
      case 'pingpong':
        return this.propPingPong(def.tone);
      case 'aquarium':
        return this.propAquarium(def.tone);
      case 'arcade':
        return this.propArcade(def.tone);
      default:
        return this.propAcoustics(def.tone);
    }
  }

  private propCoffee(tone: string): THREE.Group {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.42, 0.5), mat('#3b4250'));
    counter.position.y = 0.21;
    counter.castShadow = true;
    g.add(counter);
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.32), mat(tone));
    machine.position.set(-0.14, 0.62, 0);
    machine.castShadow = true;
    g.add(machine);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), mat('#c9d1dd'));
    spout.position.set(-0.14, 0.47, 0.2);
    g.add(spout);
    for (const sx of [0.16, 0.3]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.1, 8), mat('#e8ecf2'));
      cup.position.set(sx, 0.47, 0.06);
      g.add(cup);
    }
    return g;
  }

  private propWater(tone: string): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.86, 0.36), mat('#dfe4ec'));
    body.position.y = 0.43;
    body.castShadow = true;
    g.add(body);
    const bottle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.19, 0.42, 10),
      new THREE.MeshStandardMaterial({
        color: tone,
        flatShading: true,
        transparent: true,
        opacity: 0.72,
      }),
    );
    bottle.position.y = 1.08;
    g.add(bottle);
    const tap = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.1), mat('#5a6270'));
    tap.position.set(0, 0.6, 0.2);
    g.add(tap);
    return g;
  }

  private propCouch(tone: string): THREE.Group {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.26, 0.56), mat(tone));
    seat.position.set(0, 0.25, 0.04);
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.42, 0.16), mat(tone));
    back.position.set(0, 0.42, -0.22);
    back.castShadow = true;
    g.add(back);
    for (const sx of [-0.42, 0.42]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.56), mat(tone));
      arm.position.set(sx, 0.44, 0.04);
      g.add(arm);
    }
    for (const sx of [-0.3, 0.3]) {
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.42), mat('#6f8f72'));
      cushion.position.set(sx, 0.42, 0.06);
      g.add(cushion);
    }
    return g;
  }

  private propFridge(tone: string): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.3, 0.54), mat('#2d333d'));
    body.position.y = 0.65;
    body.castShadow = true;
    g.add(body);
    // The glass door, lit from inside: the one thing in the room that looks like a shop.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 1.02, 0.06),
      new THREE.MeshStandardMaterial({
        color: tone,
        flatShading: true,
        transparent: true,
        opacity: 0.62,
        emissive: new THREE.Color(tone),
        emissiveIntensity: 0.5,
      }),
    );
    door.position.set(0, 0.72, 0.28);
    g.add(door);
    for (const y of [0.44, 0.76, 1.08]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.4), mat('#4d5663'));
      shelf.position.set(0, y, 0.06);
      g.add(shelf);
    }
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), mat('#aab3c0'));
    handle.position.set(0.21, 0.72, 0.31);
    g.add(handle);
    return g;
  }

  private propAirCon(tone: string): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 0.22), mat(tone));
    body.castShadow = true;
    g.add(body);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.05), mat('#8f98a5'));
    vent.position.set(0, -0.09, 0.11);
    g.add(vent);
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#7ac74f', emissive: '#2f6b1f', flatShading: true }),
    );
    light.position.set(0.38, 0.02, 0.12);
    g.add(light);
    return g;
  }

  private propPingPong(tone: string): THREE.Group {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.06, 0.68), mat(tone));
    top.position.y = 0.72;
    top.castShadow = true;
    g.add(top);
    const line = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.01, 0.03), mat('#e8ecf2'));
    line.position.y = 0.756;
    g.add(line);
    const net = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.14, 0.72), mat('#cdd4de'));
    net.position.y = 0.8;
    g.add(net);
    for (const sx of [-0.46, 0.46]) {
      for (const sz of [-0.26, 0.26]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), mat('#4a525e'));
        leg.position.set(sx, 0.35, sz);
        g.add(leg);
      }
    }
    const bat = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.12), mat('#b4453a'));
    bat.position.set(0.3, 0.77, 0.18);
    bat.rotation.y = 0.5;
    g.add(bat);
    return g;
  }

  private propAquarium(tone: string): THREE.Group {
    const g = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.5, 0.42), mat('#3a3027'));
    stand.position.y = 0.25;
    stand.castShadow = true;
    g.add(stand);
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.44, 0.38),
      new THREE.MeshStandardMaterial({
        color: tone,
        flatShading: true,
        transparent: true,
        opacity: 0.45,
        emissive: new THREE.Color(tone),
        emissiveIntensity: 0.35,
      }),
    );
    water.position.y = 0.73;
    g.add(water);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.05, 0.42), mat('#2d333d'));
    lid.position.y = 0.97;
    g.add(lid);
    for (const [fx, fy, colour] of [
      [-0.16, 0.7, '#f0b429'],
      [0.12, 0.8, '#e2725b'],
      [0.2, 0.64, '#f08fa4'],
    ] as [number, number, string][]) {
      const fish = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.03), mat(colour));
      fish.position.set(fx, fy, 0.06);
      g.add(fish);
    }
    return g;
  }

  private propArcade(tone: string): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.62), mat('#22262e'));
    body.position.y = 0.75;
    body.castShadow = true;
    g.add(body);
    const side = mat(tone);
    for (const sx of [-0.31, 0.31]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.44, 0.58), side);
      panel.position.set(sx, 0.75, 0);
      g.add(panel);
    }
    // The screen, tipped back the way a cabinet's is, and the only light source in the room
    // that is there purely for fun.
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.4, 0.04),
      new THREE.MeshStandardMaterial({
        color: '#7fd8ff',
        flatShading: true,
        emissive: new THREE.Color('#2b6fa8'),
        emissiveIntensity: 0.9,
      }),
    );
    screen.position.set(0, 1.08, 0.3);
    screen.rotation.x = -0.28;
    g.add(screen);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.06, 0.26), mat('#3a4250'));
    panel.position.set(0, 0.86, 0.36);
    panel.rotation.x = 0.34;
    g.add(panel);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), mat('#d94f3d'));
    stick.position.set(-0.12, 0.93, 0.36);
    g.add(stick);
    for (const sx of [0.04, 0.14]) {
      const button = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 8), mat('#f0b429'));
      button.position.set(sx, 0.9, 0.36);
      g.add(button);
    }
    const marquee = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.18, 0.06),
      new THREE.MeshStandardMaterial({
        color: tone,
        flatShading: true,
        emissive: new THREE.Color(tone),
        emissiveIntensity: 0.6,
      }),
    );
    marquee.position.set(0, 1.4, 0.3);
    g.add(marquee);
    return g;
  }

  private propAcoustics(tone: string): THREE.Group {
    const g = new THREE.Group();
    // A run of panels across the back wall, staggered, the way they actually get put up.
    const span = Math.max(3, Math.floor(GRID.width * 0.7));
    for (let i = 0; i < span; i += 1) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.46, 0.05),
        mat(i % 2 === 0 ? tone : '#4a4f5a'),
      );
      panel.position.set((i - (span - 1) / 2) * 0.54, i % 2 === 0 ? 0 : -0.3, 0);
      g.add(panel);
    }
    return g;
  }

  /**
   * A new lease is a new room: the floor is a different size and a different colour, and
   * every bench has been carried to a new wall. Cheaper to throw the room away and build it
   * again than to work out what moved — it happens twice in a run.
   */
  setEra(era: number): boolean {
    const next = Math.min(ERA_TONE.length - 1, Math.max(1, era));
    if (next === this.era) return false;
    this.era = next;

    for (const child of [...this.group.children]) this.group.remove(child);
    this.sign = null; // the whole room went with the children; `buildWalls` paints a new one
    this.builtStations.clear();
    this.stationNodes.clear();
    this.stationZones.clear();
    this.people.clear();
    this.buildFloor();
    this.buildWalls();
    // The comforts came in the van too, and their slots are derived from the new grid.
    this.amenityNodes.clear();
    this.placingMarks = [];
    this.buildAmenities();
    this.markPlaceable();
    this.syncStations();
    return true;
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
