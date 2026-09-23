import * as THREE from 'three';
import { caseLocale } from '@/i18n';
import type { MachineType, RuntimeSnapshot, Seat } from '@/game/types';
import {
  DOOR,
  GRID,
  STATIONS,
  STATION_MAP,
  amenityPlacement,
  amenityTileFree,
  footprint,
  stationFits,
  type StationDef,
} from '@/machines/layout';
import { FURNITURE_MAP } from '@/utils/furniture';
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
  { floorLight: '#7d7771', floorDark: '#716b65', wall: '#6b4a3f' }, // the old factory: brick and old boards
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
  'table-small': '#c9a26b',
  'table-large': '#c9a26b',
  learning: '#9b7fe0',
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
  // The player names the place in their own language: a Turkish name uppercases i to İ.
  const text = name.trim().toLocaleUpperCase(caseLocale());
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
    this.buildDoor(h);
  }

  /** The front door's swinging leaf, opened by whoever is standing at it. */
  private doorLeaf: THREE.Object3D | null = null;

  /**
   * The way in (§10). Everybody arrives and leaves through the same tile, so it gets a real
   * door on the left wall: a frame, a leaf that swings open when somebody is on the
   * threshold, a lamp over it and a mat in front. A room people simply appear in reads as a
   * stage; one they walk into reads as a building.
   */
  private buildDoor(wallHeight: number) {
    const at = toWorld(-0.6, DOOR.y);
    const face = at.x + 0.1;
    const frame = mat('#2b313b');
    const g = new THREE.Group();
    for (const dz of [-0.42, 0.42]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.42, 0.08), frame);
      post.position.set(face, 0.71, at.z + dz);
      g.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.92), frame);
    lintel.position.set(face, 1.45, at.z);
    g.add(lintel);
    // The leaf hinges on its far edge, so it swings into the room.
    const hinge = new THREE.Group();
    hinge.position.set(face + 0.02, 0, at.z - 0.38);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.36, 0.76), mat('#7a5638'));
    leaf.position.set(0, 0.68, 0.38);
    leaf.castShadow = true;
    hinge.add(leaf);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.12), mat('#cbd3de'));
    handle.position.set(0.05, 0.72, 0.64);
    hinge.add(handle);
    const pane = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.32, 0.4),
      new THREE.MeshStandardMaterial({ color: '#cfe3f0', emissive: '#3a5566', flatShading: true }),
    );
    pane.position.set(0.03, 1.08, 0.38);
    hinge.add(pane);
    g.add(hinge);
    this.doorLeaf = hinge;
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.06, 0.22),
      new THREE.MeshStandardMaterial({ color: '#ffe3a1', emissive: '#c99a3a', emissiveIntensity: 0.9 }),
    );
    lamp.position.set(face + 0.06, Math.min(wallHeight - 0.15, 1.62), at.z);
    g.add(lamp);
    const doormat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.8), mat('#4a3a2e'));
    doormat.position.copy(toWorld(DOOR.x, DOOR.y, 0.01));
    g.add(doormat);
    this.group.add(g);
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
      // A two-tile table sits across both of its tiles, and its bay runs the same way.
      const tiles = footprint(def);
      const cx = tiles.reduce((sum, t) => sum + t.x, 0) / tiles.length;
      const cy = tiles.reduce((sum, t) => sum + t.y, 0) / tiles.length;
      zone.rotation.y = yaw;
      zone.scale.x = tiles.length;
      zone.position.copy(toWorld(cx + dx * 0.5, cy + dy * 0.5, 0.012));
      node.rotation.y = yaw;
      node.position.copy(toWorld(cx, cy));
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

  /**
   * A fresh copy of a buyable thing's model, for the Build panel's thumbnails. `furniture:`
   * keys are stations, `amenity:` keys are comforts and decor — the same builders the room
   * uses, so the picture on the card is the thing that turns up.
   */
  previewModel(key: string): THREE.Object3D | null {
    const [kind, id] = key.split(':');
    if (kind === 'printer') {
      const node = id === 'a1-mini' ? this.buildPrinter(`preview-${id}`) : this.buildCabinetPrinter(`preview-${id}`, id);
      // A preview has no readout to keep; do not leave a handle to a model nobody draws.
      this.machineVisuals.delete(`preview-${id}`);
      return node;
    }
    if (kind === 'furniture') {
      const def = FURNITURE_MAP[id];
      if (!def) return null;
      return this.buildStation({
        id: `preview-${id}`,
        type: def.type,
        label: def.name,
        tile: { x: 0, y: 0 },
        stand: { x: 0, y: 1 },
        span: def.span,
      });
    }
    const def = amenityDef(id);
    return def ? this.buildProp(def) : null;
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
        return def.model && def.model !== 'a1-mini' ? this.buildCabinetPrinter(def.id, def.model) : this.buildPrinter(def.id);
      case 'cnc':
        return this.buildCnc(def.id);
      case 'reflow':
        return this.buildReflow();
      case 'cad-desk':
        return this.buildDesk('#3f7ea8');
      case 'assembly':
        return this.buildTable('#b07d4a');
      case 'bench':
        return this.buildHardware();
      case 'lounge':
        return this.buildLounge();
      case 'table-small':
        return this.buildProjectTable(1);
      case 'table-large':
        return this.buildProjectTable(2);
      case 'learning':
        return this.buildLearning();
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

  /**
   * Every printer past the A1 is an enclosed machine, and they grow with the price: the P2S
   * a little larger than the A1's open frame, the X1C larger again, the H2S the biggest box
   * on the floor. A cabinet reads as "serious kit" from across the room, which is the point
   * of spending ₺33,000 on one.
   */
  private buildCabinetPrinter(id: string, model: string): THREE.Group {
    // They grow with the price, and the H2S is a proper step up rather than a slightly
    // taller X1C: nearly the whole tile, and a head taller than anything else on the wall.
    const size = { p2s: [0.74, 0.9, 0.72], x1c: [0.8, 1.0, 0.78], h2s: [0.97, 1.4, 0.95] }[model] ??
      [0.74, 0.9, 0.72];
    const [w, h, d] = size;
    // P2S black, X1C silver, H2S space grey.
    const trim = { p2s: '#16191e', x1c: '#dfe3e8', h2s: '#5d636d' }[model] ?? '#16191e';
    const g = new THREE.Group();
    const frame = mat(trim);
    // The shell: a base, a lid and four corner posts, so the glass reads as panels in a frame.
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), frame);
    base.position.y = 0.07;
    base.castShadow = true;
    g.add(base);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), frame);
    lid.position.y = h - 0.04;
    lid.castShadow = true;
    g.add(lid);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - 0.2, 0.05), frame);
      post.position.set((sx * (w - 0.05)) / 2, h / 2, (sz * (d - 0.05)) / 2);
      g.add(post);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, h - 0.2, 0.03), mat('#2b313b'));
    back.position.set(0, h / 2, -(d - 0.06) / 2);
    g.add(back);
    // Smoked glass on the front and sides.
    const glass = new THREE.MeshStandardMaterial({
      color: '#9fb4c8',
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0.1,
      depthWrite: false,
    });
    const front = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, h - 0.2, 0.02), glass);
    front.position.set(0, h / 2, (d - 0.04) / 2);
    g.add(front);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.02, h - 0.2, d - 0.06), glass);
      side.position.set((sx * (w - 0.04)) / 2, h / 2, 0);
      g.add(side);
    }
    // Inside: the bed and a moving toolhead, visible through the glass.
    const bed = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.04, d * 0.65), mat('#1f242c'));
    bed.position.set(0, 0.2, 0);
    g.add(bed);
    const head = new THREE.Group();
    head.add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.05, 0.08), mat('#6f7b8c')));
    const hotend = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.13), mat('#d94f3d'));
    hotend.position.y = -0.1;
    head.add(hotend);
    head.position.set(0, h * 0.62, 0);
    head.userData.travel = [0.3, h - 0.2, h * 0.62];
    g.add(head);
    // A small screen on the front of the base, lit.
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.02),
      new THREE.MeshStandardMaterial({ color: '#5ecfc0', emissive: '#1f7a6d', flatShading: true }),
    );
    panel.position.set(w * 0.28, 0.08, d / 2 + 0.01);
    g.add(panel);
    this.addReadout(g, id, h + 0.18, head);
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

  /**
   * The Software Station: two screens, a keyboard and a chair on the user's side. It has to
   * read as *a place one person sits* at iso scale, because one person is all it seats (§4d).
   */
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
    for (const [sx, turn] of [[-0.2, 0.2], [0.22, -0.2]] as [number, number][]) {
      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.26, 0.035),
        new THREE.MeshStandardMaterial({ color: screenColor, emissive: '#12384d', flatShading: true }),
      );
      screen.position.set(sx, 0.86, -0.17);
      screen.rotation.set(-0.1, turn, 0);
      g.add(screen);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.05), mat('#2b313b'));
      stand.position.set(sx, 0.72, -0.19);
      g.add(stand);
    }
    const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.11), mat('#2b313b'));
    keyboard.position.set(0, 0.675, 0.1);
    g.add(keyboard);
    g.add(this.chair(0, 0.52));
    return g;
  }

  /**
   * The Learning Station: a desk with a big screen of course material, a shelf of manuals
   * behind it and two chairs — it seats two, and it has to read as a classroom at iso scale.
   */
  private buildLearning(): THREE.Group {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.07, 0.56), mat('#6f5a8f'));
    top.position.y = 0.6;
    top.castShadow = true;
    g.add(top);
    for (const [sx, sz] of [[-0.4, -0.2], [0.4, -0.2], [-0.4, 0.2], [0.4, 0.2]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.06), mat('#4c5360'));
      leg.position.set(sx, 0.3, sz);
      g.add(leg);
    }
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.4, 0.04),
      new THREE.MeshStandardMaterial({ color: '#b7a3ef', emissive: '#3b2a6b', flatShading: true }),
    );
    screen.position.set(0, 0.9, -0.2);
    screen.rotation.x = -0.08;
    g.add(screen);
    const books = ['#c0584a', '#3f7ea8', '#e0c36a', '#4f6f52'];
    books.forEach((colour, i) => {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.16), mat(colour));
      book.position.set(0.28 + i * 0.065, 0.735, 0.05);
      g.add(book);
    });
    g.add(this.chair(-0.22, 0.52, 0, '#4a3f66'));
    g.add(this.chair(0.22, 0.52, 0, '#4a3f66'));
    return g;
  }

  /** A task chair, placed on the user's side (+z) of whatever it belongs to. */
  private chair(x: number, z: number, turn = 0, tone = '#343b47'): THREE.Group {
    const c = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), mat(tone));
    seat.position.y = 0.36;
    seat.castShadow = true;
    c.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.05), mat(tone));
    back.position.set(0, 0.54, 0.14);
    c.add(back);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.33, 0.05), mat('#1f242c'));
    post.position.y = 0.17;
    c.add(post);
    c.position.set(x, 0, z);
    c.rotation.y = turn;
    return c;
  }

  /**
   * The Hardware Station: an iron, a scope, a bench supply and the fume extractor nobody
   * switches on. Electronics assembly happens here now, one pair of hands at a time.
   */
  private buildHardware(): THREE.Group {
    const g = this.buildTable('#8a6f52', true);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.18), mat('#d6d9de'));
    scope.position.set(-0.24, 0.74, -0.2);
    g.add(scope);
    const trace = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.1, 0.01),
      new THREE.MeshStandardMaterial({ color: '#7ac74f', emissive: '#2f6b1f', flatShading: true }),
    );
    trace.position.set(-0.27, 0.75, -0.105);
    g.add(trace);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), mat('#8d98a8'));
    arm.position.set(0.36, 0.84, -0.22);
    arm.rotation.z = 0.35;
    g.add(arm);
    const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.08, 8), mat('#f0b429'));
    hood.position.set(0.3, 1.0, -0.18);
    g.add(hood);
    g.add(this.chair(0, 0.52, 0, '#3a3f4a'));
    return g;
  }

  /**
   * A project table (§4d): a square top with four chairs, or a long one with ten. Nothing
   * is built here — this is where a crew sits down together and agrees what they are
   * building, and the chairs are what make that legible from the iso camera.
   */
  private buildProjectTable(span: number): THREE.Group {
    const g = new THREE.Group();
    const length = span === 1 ? 0.8 : 1.84;
    const top = new THREE.Mesh(new THREE.BoxGeometry(length, 0.07, 0.8), mat('#c9a26b'));
    top.position.y = 0.58;
    top.castShadow = true;
    top.receiveShadow = true;
    g.add(top);
    const legX = length / 2 - 0.08;
    for (const [sx, sz] of [[-legX, -0.32], [legX, -0.32], [-legX, 0.32], [legX, 0.32]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.58, 0.07), mat('#4c5360'));
      leg.position.set(sx, 0.29, sz);
      g.add(leg);
    }
    // Paper on the table: a plan being argued over.
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.01, 0.24), mat('#e8ecf2'));
    sheet.position.set(-0.08, 0.62, 0.02);
    sheet.rotation.y = 0.2;
    g.add(sheet);
    const laptop = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.18), mat('#2b313b'));
    laptop.position.set(0.18 * span, 0.625, -0.08);
    g.add(laptop);
    // Chairs pulled up on every side, pointing in.
    const chairs = span === 1
      ? [[0, 0.62, 0], [0, -0.62, Math.PI], [0.62, 0, Math.PI / 2], [-0.62, 0, -Math.PI / 2]]
      : [
          ...[-0.68, -0.23, 0.23, 0.68].map((x) => [x, 0.62, 0]),
          ...[-0.68, -0.23, 0.23, 0.68].map((x) => [x, -0.62, Math.PI]),
          [1.16, 0, Math.PI / 2],
          [-1.16, 0, -Math.PI / 2],
        ];
    for (const [x, z, turn] of chairs) g.add(this.chair(x, z, turn, '#5a4a3c'));
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
    seat: Seat | null = null,
  ) {
    let node = this.people.get(id);
    if (!node) {
      node = this.buildPerson(id, isPlayer);
      this.people.set(id, node);
    }
    const arriving = !node.visible;
    node.visible = present;
    if (!present) return;
    const world = toWorld(pos.x, pos.y);
    // Eased rather than snapped, so somebody sitting down slides into the chair instead of
    // teleporting from the stand tile to their seat — except on the way in the door, where
    // easing would slide them in from wherever they were standing yesterday.
    const ease = arriving ? 1 : 0.25;
    node.position.x += (world.x - node.position.x) * ease;
    node.position.z += (world.z - node.position.z) * ease;
    if (seat) {
      // Sitting: lowered into the chair and turned to face the table or the screen.
      const look = toWorld(seat.look.x, seat.look.y);
      node.rotation.y = Math.atan2(look.x - world.x, look.z - world.z) +
        (activity === 'working' ? Math.sin(this.elapsed * 2.5 + world.x) * 0.12 : 0);
      node.position.y = -0.1;
      return;
    }
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
          ? stationFits(this.placing, { x, y })
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

  /**
   * Wall-mounted kit hangs off the back wall, which is the one the camera reads across. The
   * air conditioning has its corner and the acoustic panels the middle; everything else —
   * the neon, the whiteboard, the print — takes the next spot along from the left, in the
   * order it was bought, so two things never hang on the same nail.
   */
  private placeOnWall(node: THREE.Object3D, def: AmenityDef) {
    const back = toWorld((GRID.width - 1) / 2, -0.6);
    node.position.z = back.z + 0.1;
    if (def.shape === 'ac') {
      node.position.x = toWorld(GRID.width - 1.4, 0).x;
      node.position.y = 1.34;
      return;
    }
    if (def.shape === 'acoustics') {
      node.position.x = back.x;
      node.position.y = 1.16;
      return;
    }
    const hung = this.amenityIds.filter((id) => {
      const other = amenityDef(id);
      return other?.mount === 'wall' && other.shape !== 'ac' && other.shape !== 'acoustics';
    });
    const index = Math.max(0, hung.indexOf(def.id));
    const spots = [0.6, 2.6, 4.6, 1.6, 3.6];
    node.position.x = toWorld(Math.min(GRID.width - 2, spots[index % spots.length]), 0).x;
    node.position.y = 1.42;
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
      case 'plant':
        return this.propPlant(def.tone);
      case 'tree':
        return this.propTree(def.tone);
      case 'duck':
        return this.propDuck(def.tone);
      case 'tux':
        return this.propTux();
      case 'bookshelf':
        return this.propBookshelf(def.tone);
      case 'beanbag':
        return this.propBeanbags(def.tone);
      case 'rack':
        return this.propRack(def.tone);
      case 'neon':
        return this.propNeon(def.tone);
      case 'whiteboard':
        return this.propWhiteboard();
      case 'poster':
        return this.propPoster(def.tone);
      case 'terminal':
        return this.propTerminal(def.tone);
      case 'lava':
        return this.propLava(def.tone);
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

  // --- Decor (§4d) ----------------------------------------------------------

  private pot(radius: number, height: number, tone = '#b4653f'): THREE.Mesh {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.78, height, 10), mat(tone));
    pot.position.y = height / 2;
    pot.castShadow = true;
    return pot;
  }

  private propPlant(tone: string): THREE.Group {
    const g = new THREE.Group();
    g.add(this.pot(0.17, 0.3));
    // Big split leaves fanning out of the pot, each a flat tilted slab.
    const leaf = mat(tone);
    for (let i = 0; i < 7; i += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.34), leaf);
      const angle = (i / 7) * Math.PI * 2;
      blade.position.set(Math.sin(angle) * 0.13, 0.52 + (i % 3) * 0.1, Math.cos(angle) * 0.13);
      blade.rotation.set(-0.6 * Math.cos(angle), angle, 0.6 * Math.sin(angle) * 0.2);
      blade.castShadow = true;
      g.add(blade);
    }
    return g;
  }

  private propTree(tone: string): THREE.Group {
    const g = new THREE.Group();
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.44), mat('#6b4a33'));
    tub.position.y = 0.17;
    tub.castShadow = true;
    g.add(tub);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.9, 6), mat('#6f5a44'));
    trunk.position.y = 0.72;
    g.add(trunk);
    const leaves = mat(tone);
    for (const [x, y, z, r] of [
      [0, 1.28, 0, 0.3],
      [0.18, 1.12, 0.08, 0.22],
      [-0.16, 1.16, -0.06, 0.22],
      [0.04, 1.02, -0.18, 0.18],
    ]) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaves);
      crown.position.set(x, y, z);
      crown.castShadow = true;
      g.add(crown);
    }
    return g;
  }

  private propDuck(tone: string): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(tone));
    body.scale.set(1.15, 0.8, 1);
    body.position.y = 0.24;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat(tone));
    head.position.set(0, 0.56, 0.12);
    head.castShadow = true;
    g.add(head);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.14), mat('#e2725b'));
    beak.position.set(0, 0.53, 0.3);
    g.add(beak);
    for (const sx of [-0.08, 0.08]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), mat('#1f242c'));
      eye.position.set(sx, 0.61, 0.26);
      g.add(eye);
    }
    return g;
  }

  private propTux(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat('#1f2329'));
    body.scale.set(1, 1.35, 0.9);
    body.position.y = 0.34;
    body.castShadow = true;
    g.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat('#eef1f5'));
    belly.scale.set(0.85, 1.2, 0.5);
    belly.position.set(0, 0.3, 0.12);
    g.add(belly);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat('#1f2329'));
    head.position.set(0, 0.72, 0.02);
    head.castShadow = true;
    g.add(head);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), mat('#f0b429'));
    beak.position.set(0, 0.69, 0.17);
    g.add(beak);
    for (const sx of [-0.09, 0.09]) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.12), mat('#f0b429'));
      foot.position.set(sx, 0.015, 0.1);
      g.add(foot);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), mat('#ffffff'));
      eye.position.set(sx * 0.6, 0.76, 0.14);
      g.add(eye);
    }
    return g;
  }

  private propBookshelf(tone: string): THREE.Group {
    const g = new THREE.Group();
    const frame = mat(tone);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.84, 1.3, 0.05), frame);
    back.position.set(0, 0.65, -0.14);
    back.castShadow = true;
    g.add(back);
    for (const sx of [-0.4, 0.4]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.3, 0.32), frame);
      side.position.set(sx, 0.65, 0);
      g.add(side);
    }
    const colours = ['#c0584a', '#3f7ea8', '#e0c36a', '#4f6f52', '#d6d9de', '#8a5a3c', '#c58ef0'];
    [0.04, 0.44, 0.84, 1.24].forEach((y, row) => {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.03, 0.3), frame);
      shelf.position.set(0, y, 0);
      g.add(shelf);
      if (row === 3) return;
      let x = -0.34;
      let i = row * 3;
      while (x < 0.32) {
        const w = 0.05 + ((i * 7) % 4) * 0.012;
        const h = 0.24 + ((i * 5) % 3) * 0.04;
        const book = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.22), mat(colours[i % colours.length]));
        book.position.set(x + w / 2, y + 0.015 + h / 2, 0.02);
        g.add(book);
        x += w + 0.012;
        i += 1;
      }
    });
    return g;
  }

  private propBeanbags(tone: string): THREE.Group {
    const g = new THREE.Group();
    for (const [x, z, colour] of [[-0.2, 0.04, tone], [0.24, -0.08, '#3f7ea8']] as [number, number, string][]) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(colour));
      bag.scale.set(1, 0.62, 1);
      bag.position.set(x, 0.16, z);
      bag.castShadow = true;
      g.add(bag);
      const dent = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(colour));
      dent.scale.set(1, 0.45, 1);
      dent.position.set(x, 0.3, z - 0.1);
      g.add(dent);
    }
    return g;
  }

  private propRack(tone: string): THREE.Group {
    const g = new THREE.Group();
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.4, 0.56), mat('#23272f'));
    cabinet.position.y = 0.7;
    cabinet.castShadow = true;
    g.add(cabinet);
    for (let i = 0; i < 6; i += 1) {
      const unit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.02), mat('#343b47'));
      unit.position.set(0, 0.26 + i * 0.18, 0.285);
      g.add(unit);
      // Blinkenlights: a couple of LEDs per unit, lit from inside.
      for (const [lx, colour] of [[-0.18, tone], [-0.12, i % 2 ? '#7ac74f' : tone], [0.16, '#f0b429']] as [number, string][]) {
        const led = new THREE.Mesh(
          new THREE.BoxGeometry(0.025, 0.025, 0.02),
          new THREE.MeshStandardMaterial({ color: colour, emissive: new THREE.Color(colour), emissiveIntensity: 0.9 }),
        );
        led.position.set(lx, 0.26 + i * 0.18, 0.3);
        g.add(led);
      }
    }
    return g;
  }

  /** `</>` in pink tubing: three bent strokes of emissive box, which is all a neon sign is. */
  private propNeon(tone: string): THREE.Group {
    const g = new THREE.Group();
    const glow = new THREE.MeshStandardMaterial({
      color: tone,
      emissive: new THREE.Color(tone),
      emissiveIntensity: 1.2,
      flatShading: true,
    });
    const stroke = (x: number, y: number, length: number, angle: number) => {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(length, 0.045, 0.045), glow);
      tube.position.set(x, y, 0.02);
      tube.rotation.z = angle;
      g.add(tube);
    };
    stroke(-0.42, 0.09, 0.26, 0.62);
    stroke(-0.42, -0.09, 0.26, -0.62);
    stroke(0.0, 0.0, 0.46, 1.2);
    stroke(0.42, 0.09, 0.26, -0.62);
    stroke(0.42, -0.09, 0.26, 0.62);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.02), mat('#1b1f26'));
    board.position.z = -0.02;
    g.add(board);
    return g;
  }

  private propWhiteboard(): THREE.Group {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.62, 0.03), mat('#f2f4f7'));
    g.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.68, 0.02), mat('#9aa3af'));
    frame.position.z = -0.02;
    g.add(frame);
    // Scribbles: boxes and arrows in marker colours.
    for (const [x, y, w, h, colour] of [
      [-0.38, 0.12, 0.28, 0.16, '#3f7ea8'],
      [0.02, 0.12, 0.24, 0.16, '#3f7ea8'],
      [0.36, -0.1, 0.26, 0.2, '#c0584a'],
      [-0.2, -0.16, 0.5, 0.025, '#2f6b4f'],
    ] as [number, number, number, number, string][]) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.005), mat(colour));
      mark.position.set(x, y, 0.02);
      if (h > 0.05) (mark.material as THREE.MeshStandardMaterial).opacity = 0.9;
      g.add(mark);
    }
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.06), mat('#9aa3af'));
    tray.position.set(0, -0.33, 0.04);
    g.add(tray);
    return g;
  }

  private propPoster(tone: string): THREE.Group {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.03), mat('#1f242c'));
    g.add(frame);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.72, 0.01), mat('#0f3b36'));
    paper.position.z = 0.02;
    g.add(paper);
    const trace = new THREE.MeshStandardMaterial({ color: tone, emissive: new THREE.Color(tone), emissiveIntensity: 0.4 });
    for (const [x, y, w, h] of [
      [-0.12, 0.2, 0.26, 0.02],
      [0.0, 0.08, 0.02, 0.26],
      [0.1, -0.06, 0.22, 0.02],
      [-0.14, -0.2, 0.02, 0.2],
      [0.14, 0.24, 0.02, 0.12],
    ]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), trace);
      line.position.set(x, y, 0.03);
      g.add(line);
    }
    for (const [x, y] of [[-0.12, 0.2], [0.1, -0.06], [-0.14, -0.3], [0.14, 0.3]]) {
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.01), mat('#e0c36a'));
      pad.position.set(x, y, 0.035);
      g.add(pad);
    }
    return g;
  }

  private propTerminal(tone: string): THREE.Group {
    const g = new THREE.Group();
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.46), mat('#3b4250'));
    plinth.position.y = 0.31;
    plinth.castShadow = true;
    g.add(plinth);
    const crt = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.42), mat(tone));
    crt.position.y = 0.84;
    crt.castShadow = true;
    g.add(crt);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.26, 0.02),
      new THREE.MeshStandardMaterial({ color: '#0e2a14', emissive: new THREE.Color('#2fbf5a'), emissiveIntensity: 0.55 }),
    );
    screen.position.set(0, 0.86, 0.215);
    g.add(screen);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.16), mat(tone));
    keys.position.set(0, 0.64, 0.3);
    g.add(keys);
    return g;
  }

  private propLava(tone: string): THREE.Group {
    const g = new THREE.Group();
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 10), mat('#3b4250'));
    stool.position.y = 0.21;
    g.add(stool);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.1, 10), mat('#aab3c0'));
    base.position.y = 0.47;
    g.add(base);
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 0.3, 10),
      new THREE.MeshStandardMaterial({ color: tone, transparent: true, opacity: 0.7, emissive: new THREE.Color(tone), emissiveIntensity: 0.6 }),
    );
    glass.position.y = 0.67;
    g.add(glass);
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#ffd23d', emissive: new THREE.Color('#ffb020'), emissiveIntensity: 0.8 }),
    );
    blob.position.y = 0.72;
    g.add(blob);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.06, 10), mat('#aab3c0'));
    cap.position.y = 0.85;
    g.add(cap);
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

    // The door opens for whoever is on the threshold and closes behind them.
    if (this.doorLeaf) {
      const people = [...runtime.members, ...(runtime.player ? [runtime.player] : [])];
      const near = people.some(
        (p) => p.present && Math.hypot(p.pos.x - DOOR.x, p.pos.y - DOOR.y) < 0.9,
      );
      const target = near ? -1.25 : 0;
      this.doorLeaf.rotation.y += (target - this.doorLeaf.rotation.y) * Math.min(1, dt * 6);
    }

    for (const m of runtime.members) {
      this.placePerson(m.id, false, m.present, m.seat ?? m.pos, m.activity, m.seat);
    }
    if (runtime.player) {
      const p = runtime.player;
      this.placePerson('player', true, p.present, p.seat ?? p.pos, p.activity, p.seat);
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
        // Each model says how far its head travels; a cabinet must not print through its lid.
        const [lo, hi, rest] = (visual.head.userData.travel as number[] | undefined) ?? [0.34, 0.89, 0.62];
        visual.head.position.y = job ? lo + ratio * (hi - lo) : rest;
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
