import * as THREE from 'three';
import { caseLocale } from '@/i18n';
import type { BuyItem, MachineType, RuntimeSnapshot, Seat } from '@/game/types';
import {
  CHAIR_REACH,
  DOOR,
  GRID,
  STATIONS,
  STATION_MAP,
  amenityPlacement,
  amenityTileFree,
  wallColumn,
  wallColumnFree,
  footprint,
  stationFits,
  type StationDef,
} from '@/machines/layout';
import { FURNITURE_MAP } from '@/utils/furniture';
import { amenityDef, type AmenityDef } from '@/utils/amenities';
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

/** How far forward of a seat's centre somebody sits, so the chair back stays behind them. */
const SIT_FORWARD = 0.08;

/**
 * A screen on a station (§4d): the code on a desk's monitors, the trace on a scope, the
 * lesson at the Learning Station. **It is on while somebody works in the chair it serves,
 * and asleep otherwise** — a room of glowing editors at three in the morning read as a room
 * somebody forgot to leave. A bouncing screensaver on every empty desk was tried and was
 * tiring to look at; an empty desk's screen is simply dark.
 */
interface ScreenRig {
  /** The chairs it serves, as x along its station's own frame; each at `CHAIR_REACH`. */
  chairs: number[];
  /** What shows while somebody works at it. */
  live: THREE.Object3D[];
  /** The panel, dark when the screen is asleep, and what it wears when it is not. */
  panel?: THREE.Mesh;
  panelOn?: THREE.Material | THREE.Material[];
  glow?: THREE.Object3D;
  on?: boolean;
}

const SCREEN_OFF = new THREE.MeshStandardMaterial({ color: '#050607', flatShading: true });

/** A colour a little darker (negative) or lighter — trousers under a shirt. */
function shade(color: string, amount: number): string {
  return `#${new THREE.Color(color).offsetHSL(0, 0, amount * 0.5).getHexString()}`;
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
/**
 * The Learning Station's screen: a course playing in a video player — the lesson on a
 * whiteboard with the teacher in the corner, the red progress bar, the title and channel
 * under it, and a column of next videos. Painted once and shared by every station, since
 * the room never needs two different lessons and a texture per station is one more thing
 * to dispose of.
 */
let courseScreen: THREE.CanvasTexture | null = null;
function courseTexture(): THREE.CanvasTexture {
  if (courseScreen) return courseScreen;
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0f0f0f';
  ctx.fillRect(0, 0, 320, 192);
  // The video: a whiteboard with a circuit being explained.
  const vx = 10, vy = 10, vw = 212, vh = 120;
  ctx.fillStyle = '#eef1f5';
  ctx.fillRect(vx, vy, vw, vh);
  ctx.strokeStyle = '#2f6fb0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(26, 50); ctx.lineTo(70, 50); ctx.lineTo(70, 90); ctx.lineTo(120, 90);
  ctx.moveTo(90, 50); ctx.lineTo(140, 50);
  ctx.stroke();
  // A resistor's zigzag and a capacitor's plates.
  ctx.beginPath();
  ctx.moveTo(120, 90); for (let i = 0; i < 6; i += 1) ctx.lineTo(126 + i * 6, i % 2 ? 84 : 96); ctx.lineTo(166, 90);
  ctx.stroke();
  ctx.strokeStyle = '#d0453c';
  ctx.beginPath(); ctx.moveTo(140, 40); ctx.lineTo(140, 60); ctx.moveTo(148, 40); ctx.lineTo(148, 60); ctx.stroke();
  ctx.fillStyle = '#1f242c';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('V = I × R', 30, 30);
  // The teacher, in the corner of the frame.
  ctx.fillStyle = '#e0a36b';
  ctx.beginPath(); ctx.arc(196, 84, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3f7ea8';
  ctx.beginPath(); ctx.ellipse(196, 124, 22, 26, 0, Math.PI, 0); ctx.fill();
  // The player's bar: red progress, the scrubber, a play button.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(vx, vy + vh - 16, vw, 16);
  ctx.fillStyle = '#5c5c5c';
  ctx.fillRect(vx + 6, vy + vh - 19, vw - 12, 3);
  ctx.fillStyle = '#ff0033';
  ctx.fillRect(vx + 6, vy + vh - 19, (vw - 12) * 0.42, 3);
  ctx.beginPath(); ctx.arc(vx + 6 + (vw - 12) * 0.42, vy + vh - 17.5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(vx + 8, vy + vh - 12); ctx.lineTo(vx + 8, vy + vh - 4); ctx.lineTo(vx + 15, vy + vh - 8); ctx.closePath(); ctx.fill();
  // Title, channel and a red subscribe pill under the video.
  ctx.fillStyle = '#f1f1f1';
  ctx.fillRect(vx, 140, 170, 8);
  ctx.fillStyle = '#c58ef0';
  ctx.beginPath(); ctx.arc(vx + 8, 166, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(vx + 22, 160, 70, 5);
  ctx.fillRect(vx + 22, 170, 44, 4);
  ctx.fillStyle = '#ff0033';
  ctx.beginPath(); ctx.roundRect(vx + 150, 158, 50, 16, 8); ctx.fill();
  // Up next.
  const thumbs = ['#e0b83a', '#3ddc84', '#5aa9f0', '#e5484d'];
  thumbs.forEach((colour, i) => {
    const y = 10 + i * 44;
    ctx.fillStyle = colour;
    ctx.fillRect(232, y, 38, 26);
    ctx.fillStyle = '#d6d6d6';
    ctx.fillRect(274, y + 3, 38, 4);
    ctx.fillStyle = '#7a7a7a';
    ctx.fillRect(274, y + 12, 28, 3);
  });
  courseScreen = new THREE.CanvasTexture(canvas);
  courseScreen.colorSpace = THREE.SRGBColorSpace;
  return courseScreen;
}

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
  /** The machine's own group, and the height of its bed — where the print grows from. */
  root?: THREE.Group;
  bedTop?: number;
  /** What is on the bed right now, and the job it belongs to. */
  part?: THREE.Object3D;
  partKey?: string;
}

/** A small stable hash, so the same job always prints the same thing. */
function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Filament colours a print can come out in. */
const PRINT_COLOURS = ['#e2725b', '#5aa9f0', '#f0b429', '#8fd88f', '#e8ecf2', '#c58ef0', '#f08fa4', '#3a3f4a'];

/**
 * Something to print (§5): a box, a vase, a lamp shade, a hex organiser, a gear — picked by
 * the job so it stays the same thing all the way up. Built one unit tall with its base at
 * zero; the caller scales it to the height the print has reached.
 */
function printedThing(key: string): THREE.Object3D {
  const h = hashOf(key);
  const colour = PRINT_COLOURS[h % PRINT_COLOURS.length];
  const material = new THREE.MeshStandardMaterial({ color: colour, flatShading: true, roughness: 0.7 });
  let geometry: THREE.BufferGeometry;
  switch ((h >>> 3) % 6) {
    case 0:
      geometry = new THREE.BoxGeometry(0.22, 1, 0.16);
      break;
    case 1: {
      // A vase: a lathe profile, narrow at the neck.
      const profile = [0, 0.2, 0.45, 0.7, 0.85, 1].map((y, i) => new THREE.Vector2([0.06, 0.1, 0.11, 0.08, 0.05, 0.065][i], y));
      geometry = new THREE.LatheGeometry(profile, 14);
      break;
    }
    case 2:
      geometry = new THREE.CylinderGeometry(0.09, 0.07, 1, 16);
      break;
    case 3:
      geometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);
      break;
    case 4:
      geometry = new THREE.ConeGeometry(0.12, 1, 14, 1, true);
      break;
    default:
      geometry = new THREE.CylinderGeometry(0.13, 0.13, 1, 10);
  }
  if (!(geometry instanceof THREE.LatheGeometry)) geometry.translate(0, 0.5, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
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
  /** Build mode: the tiles the held catalogue item could go on, and its see-through preview. */
  private buyMarks: THREE.Object3D[] = [];
  private buyMarksKey = '';
  private ghost: THREE.Object3D | null = null;
  private ghostKey = '';
  private ghostLegal = true;

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

    // The door first: the sign paints the badge onto its glass.
    this.buildDoor(h);
    this.buildSign(h);
  }

  /** The front door's swinging leaf, opened by whoever is standing at it. */
  private doorLeaf: THREE.Object3D | null = null;
  /** Its glass, with the space's badge on it once there is one. */
  private doorPane: THREE.Mesh | null = null;
  private doorPaneKey = '';

  /**
   * The space's badge on the door's glass, in dark grey — the same mark as on the wall, but
   * the badge's own colour disappeared into the frosted glass. The icon is an image, so it
   * lands a moment later; the key stops a late one painting over a newer badge.
   */
  private paintDoorPane() {
    const pane = this.doorPane;
    const badge = this.signBadge;
    const key = badge ?? '';
    if (!pane || key === this.doorPaneKey) return;
    this.doorPaneKey = key;
    const material = pane.material as THREE.MeshStandardMaterial;
    if (!badge) {
      material.map?.dispose();
      material.map = null;
      material.color.set('#cfe3f0');
      material.emissive.set('#3a5566');
      material.needsUpdate = true;
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 128;
    const img = new Image();
    img.onload = () => {
      if (this.doorPaneKey !== key || this.doorPane !== pane) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Frosted glass with the badge on it. The texture carries the colour, so the material
      // goes white — tinted glass and a glow on top washed the mark out.
      ctx.fillStyle = '#c3d9e6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const size = 108;
      ctx.drawImage(img, (canvas.width - size) / 2, (canvas.height - size) / 2, size, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      material.map?.dispose();
      material.map = texture;
      material.color.set('#ffffff');
      material.emissive.set('#1a2530');
      material.needsUpdate = true;
    };
    // Dark grey, whatever the badge's own colour: a pale or mid-tone mark vanished into the
    // frosted glass, and a dark one reads on it every time.
    img.src = iconDataUrl(badge, '#23282f', 128, 2.8);
  }

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
    this.doorPane = pane;
    this.doorPaneKey = '';
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
    // The door's glass carries the badge whether or not there is a name to paint.
    this.paintDoorPane();
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
      // A dark screen wears the shared off material; give it its own back before disposing,
      // or every other screen that is off loses theirs.
      object.traverse((child) => {
        const rig = child.userData.screen as ScreenRig | undefined;
        if (rig?.panel && rig.panelOn) rig.panel.material = rig.panelOn;
      });
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
        model: def.id,
      });
    }
    const def = amenityDef(id);
    return def ? this.buildProp(def) : null;
  }

  /**
   * Build mode's placement (§7b): a dot on every tile the held item could go on, and a
   * see-through copy of it on the tile under the cursor — tinted red where it cannot go.
   * Nothing here is paid for; the click asks first. The dots are recomputed only when the
   * item or the room changes, because each one is a trial placement with a flood fill.
   */
  setBuying(
    item: BuyItem | null,
    tile: { x: number; y: number } | null,
    yaw: number,
    legal: (x: number, y: number) => boolean,
  ) {
    const room = `${STATIONS.map((s) => `${s.tile.x},${s.tile.y}`).join(';')}|${this.amenityKey}|${GRID.width}`;
    const marksKey = item ? `${item.kind}:${item.id}|${room}` : '';
    if (marksKey !== this.buyMarksKey) {
      this.buyMarksKey = marksKey;
      this.clearMarks(this.buyMarks);
      this.buyMarks = [];
      if (item) {
        const wall = item.kind === 'amenity' && amenityDef(item.id)?.mount === 'wall';
        const geo = new THREE.BoxGeometry(TILE * 0.2, 0.02, TILE * 0.2);
        for (let y = 0; y < GRID.height; y += 1) {
          for (let x = 0; x < GRID.width; x += 1) {
            if (wall ? y !== 0 : !legal(x, y)) continue;
            const mark = new THREE.Mesh(geo.clone(), new THREE.MeshStandardMaterial({
              color: '#5ecfc0', flatShading: true, transparent: true, opacity: 0.55,
              emissive: new THREE.Color('#2f8f84'), emissiveIntensity: 0.6,
            }));
            mark.position.copy(toWorld(x, wall ? -0.35 : y, 0.014));
            this.group.add(mark);
            this.buyMarks.push(mark);
          }
        }
      }
    }

    const key = item ? `${item.kind}:${item.id}` : '';
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      if (this.ghost) {
        this.group.remove(this.ghost);
        this.ghost = null;
      }
      const model = item ? this.previewModel(key) : null;
      if (model) {
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.castShadow = false;
          child.material = [child.material].flat().map((m: THREE.Material) => {
            const copy = m.clone() as THREE.MeshStandardMaterial;
            copy.transparent = true;
            copy.opacity = 0.55;
            copy.depthWrite = false;
            copy.userData.base = copy.color?.clone();
            return copy;
          });
          if ((child.material as THREE.Material[]).length === 1) child.material = (child.material as THREE.Material[])[0];
        });
        this.ghost = model;
        this.group.add(model);
      }
    }
    if (!this.ghost) return;
    this.ghost.visible = !!tile;
    if (!tile) return;
    const wallItem = item?.kind === 'amenity' && amenityDef(item.id)?.mount === 'wall';
    const at = toWorld(tile.x, wallItem ? -0.35 : tile.y);
    this.ghost.position.set(at.x, wallItem ? 1.3 : 0.02, at.z);
    this.ghost.rotation.y = wallItem ? 0 : (yaw * Math.PI) / 2;
    const ok = legal(tile.x, tile.y);
    if (ok !== this.ghostLegal) {
      this.ghostLegal = ok;
      this.ghost.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        for (const m of [child.material].flat() as THREE.MeshStandardMaterial[]) {
          const base = m.userData.base as THREE.Color | undefined;
          if (!base || !m.color) continue;
          m.color.copy(ok ? base : base.clone().lerp(new THREE.Color('#e5484d'), 0.7));
        }
      });
    }
  }

  private clearMarks(marks: THREE.Object3D[]) {
    for (const mark of marks) {
      this.group.remove(mark);
      (mark as THREE.Mesh).geometry.dispose();
      ((mark as THREE.Mesh).material as THREE.Material).dispose();
    }
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
    // The furniture variants (§4d) draw as themselves; a plain one falls through to its kind.
    switch (def.model) {
      case 'long-bench':
        return this.buildLongBench();
      case 'maker-bench':
        return this.buildMakerBench();
      case 'solder-bench':
        return this.buildMakerStation();
      case 'meeting-corner':
        return this.buildMeetingCorner();
      case 'assembly-bench':
        return this.buildAssemblyBench();
    }
    switch (def.type) {
      case 'fdm':
        return def.model && def.model !== 'a1-mini' ? this.buildCabinetPrinter(def.id, def.model) : this.buildPrinter(def.id);
      case 'cnc':
        return this.buildCnc(def.id);
      case 'reflow':
        return this.buildReflow();
      case 'cad-desk':
        return this.buildDesk();
      case 'assembly':
        return this.buildTable('#b07d4a');
      case 'bench':
        // A bench from before the variants, or a save that named one that is gone: the
        // Maker Station is the one-seat hardware bench now.
        return this.buildMakerStation();
      case 'lounge':
        return this.buildLounge(def.span ?? 1);
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

  /**
   * Every station screen to its state (`ScreenRig`): on for whoever is working in a chair it
   * serves, asleep otherwise. A rig is found once per station node and kept on it; only a
   * change of state touches the scene.
   */
  private updateScreens(runtime: RuntimeSnapshot) {
    const everyone = [...runtime.members, ...(runtime.player ? [runtime.player] : [])];
    const working = everyone
      .filter((p) => p.present && p.activity === 'working' && p.seat && !p.seat.stand)
      .map((p) => toWorld(p.seat!.x, p.seat!.y));
    const at = new THREE.Vector3();
    for (const node of this.stationNodes.values()) {
      let rigs = node.userData.screens as { rig: ScreenRig; holder: THREE.Object3D }[] | undefined;
      if (!rigs) {
        rigs = [];
        node.traverse((child) => {
          if (child.userData.screen) rigs!.push({ rig: child.userData.screen as ScreenRig, holder: child });
        });
        node.userData.screens = rigs;
      }
      if (!rigs.length) continue;
      node.updateMatrixWorld();
      const model = node.children[0];
      for (const { rig } of rigs) {
        const on = rig.chairs.some((x) => {
          model.localToWorld(at.set(x, 0, CHAIR_REACH));
          return working.some((w) => Math.hypot(w.x - at.x, w.z - at.z) < 0.3);
        });
        if (on !== rig.on) {
          rig.on = on;
          for (const part of rig.live) part.visible = on;
          if (rig.panel && rig.panelOn) rig.panel.material = on ? rig.panelOn : SCREEN_OFF;
          if (rig.glow) rig.glow.visible = on;
        }
      }
    }
  }

  /** Status light + progress bar: the at-a-glance machine readout. */
  private addReadout(g: THREE.Group, id: string, height: number, head?: THREE.Object3D, bedTop?: number) {
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

    this.machineVisuals.set(id, { light, bar, head, root: g, bedTop });
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

    this.addReadout(g, id, 1.42, head, 0.275);
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
    this.addReadout(g, id, h + 0.18, head, 0.22);
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
  private buildDesk(): THREE.Group {
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
    // Two screens the width of the desk between them, angled in toward the chair.
    g.add(this.monitor(-0.23, 0.46, 0.2, 0, 0));
    g.add(this.monitor(0.24, 0.46, -0.2, 3, 0));
    g.add(this.keyboard(0, 0.34));
    g.add(this.chair(0, CHAIR_REACH));
    return g;
  }

  /** A desk top on four legs, `width` across and `depth` deep, at desk height. */
  private deskTop(width: number, depth: number, tone = '#9c7048'): THREE.Group {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, depth), mat(tone));
    top.position.y = 0.62;
    top.castShadow = true;
    g.add(top);
    const lx = width / 2 - 0.05;
    const lz = depth / 2 - 0.08;
    for (const [sx, sz] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), mat('#4c5360'));
      leg.position.set(sx, 0.31, sz);
      g.add(leg);
    }
    return g;
  }

  /**
   * A hacker's screen: a thin dark bezel, a near-black panel with a few lines of lit code on
   * it, and a soft backlight halo. `seed` shifts which lines and which halo, so a bench of six
   * is not one screen copied six times. Faces +z, the user's side, like everything else.
   */
  private monitor(x: number, width: number, turn = 0, seed = 0, chairX = x): THREE.Group {
    const g = new THREE.Group();
    const h = width * 0.6;
    const face = new THREE.Group();
    face.position.set(0, 0.84 + width * 0.12, 0);
    face.rotation.x = -0.1;
    g.add(face);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(width, h, 0.03), mat('#15181d'));
    bezel.castShadow = true;
    face.add(bezel);
    this.screenFace(face, width, h, seed, chairX, 0.016);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.16, 0.028), mat('#2b313b'));
    neck.position.set(0, 0.74, -0.03);
    g.add(neck);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.09), mat('#2b313b'));
    foot.position.set(0, 0.667, -0.02);
    g.add(foot);
    g.position.set(x, 0, -0.17);
    g.rotation.y = turn;
    return g;
  }

  /**
   * What is on a screen, onto the front of `face` at depth `z`: a near-black panel, a few
   * lines of lit code, a soft backlight halo behind — and the `ScreenRig` that switches it
   * with the chair it serves. Shared by the monitors and the laptop, so they sleep alike.
   */
  private screenFace(face: THREE.Group, width: number, h: number, seed: number, chairX: number, z: number, halo = true) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.024, h - 0.024, 0.004),
      new THREE.MeshStandardMaterial({ color: '#08161b', emissive: '#062028', flatShading: true }),
    );
    panel.position.z = z;
    face.add(panel);
    // Code: indent, length, colour — an editor.
    const CODE: [number, number, string][] = [
      [0, 0.55, '#5ecfc0'], [0.1, 0.42, '#c58ef0'], [0.1, 0.62, '#3ddc84'], [0.2, 0.3, '#f0b429'],
      [0.2, 0.48, '#3ddc84'], [0.1, 0.22, '#c58ef0'], [0, 0.35, '#5ecfc0'], [0.1, 0.5, '#3ddc84'],
    ];
    const inner = width - 0.06;
    const rows = 6;
    const step = (h - 0.07) / (rows - 1);
    const code = new THREE.Group();
    face.add(code);
    for (let i = 0; i < rows; i += 1) {
      const [indent, length, colour] = CODE[(i + seed) % CODE.length];
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(inner * length, 0.011, 0.003),
        new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 0.85, flatShading: true }),
      );
      line.position.set(-inner / 2 + inner * indent + (inner * length) / 2, h / 2 - 0.035 - i * step, z + 0.003);
      code.add(line);
    }
    let glow: THREE.Mesh | undefined;
    if (halo) {
      const tone = ['#5ecfc0', '#c58ef0', '#5aa9f0'][seed % 3];
      glow = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.03, h + 0.03, 0.004),
        new THREE.MeshStandardMaterial({ color: tone, emissive: tone, emissiveIntensity: 0.45, transparent: true, opacity: 0.55, flatShading: true }),
      );
      glow.position.z = -0.019;
      face.add(glow);
    }
    face.userData.screen = { chairs: [chairX], live: [code], panel, panelOn: panel.material, glow } satisfies ScreenRig;
  }

  /**
   * A MacBook Pro, open: a space-grey base with a black keyboard well and a trackpad, and
   * the lid tipped back on its hinge with the screen in a thin black bezel. The one seat on
   * the Long Hacker Bench that brought its own machine.
   */
  private laptop(x: number, seed: number, chairX = x): THREE.Group {
    const g = new THREE.Group();
    const aluminium = mat('#9da3ab');
    const top = 0.66;
    const w = 0.36;
    const d = 0.25;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.014, d), aluminium);
    base.position.set(0, top + 0.007, 0);
    base.castShadow = true;
    g.add(base);
    const keys = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.003, 0.1), mat('#1b1e23'));
    keys.position.set(0, top + 0.015, -0.03);
    g.add(keys);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.002, 0.075), mat('#b4b9c0'));
    pad.position.set(0, top + 0.015, 0.07);
    g.add(pad);
    // The lid, hinged at the back edge of the base and tipped back past upright.
    const hinge = new THREE.Group();
    hinge.position.set(0, top + 0.014, -d / 2);
    hinge.rotation.x = -0.28;
    g.add(hinge);
    const h = 0.23;
    const face = new THREE.Group();
    face.position.set(0, h / 2, 0);
    hinge.add(face);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), aluminium);
    lid.castShadow = true;
    face.add(lid);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.01, h - 0.01, 0.002), mat('#0b0c0e'));
    bezel.position.z = 0.006;
    face.add(bezel);
    this.screenFace(face, w - 0.02, h - 0.02, seed, chairX, 0.008, false);
    g.position.set(x, 0, 0.02);
    return g;
  }

  /** A keyboard with a strip of underglow along its front edge. */
  private keyboard(x: number, width: number, glow = '#5ecfc0'): THREE.Group {
    const g = new THREE.Group();
    const keys = new THREE.Mesh(new THREE.BoxGeometry(width, 0.025, 0.1), mat('#1f242c'));
    keys.position.set(x, 0.675, 0.1);
    g.add(keys);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.006, 0.01),
      new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.8, flatShading: true }),
    );
    strip.position.set(x, 0.666, 0.152);
    g.add(strip);
    return g;
  }

  /** Long Hacker Bench: one long desk across two tiles, a screen a seat — one of them a MacBook — and three chairs. */
  private buildLongBench(): THREE.Group {
    const g = this.deskTop(1.9, 0.6, '#8a6a4a');
    [-0.6, 0, 0.6].forEach((x, i) => {
      // One screen a seat, and the middle seat brought its own MacBook.
      if (i === 1) {
        g.add(this.laptop(x, i * 2));
      } else {
        g.add(this.monitor(x, 0.44, 0, i * 2, x));
        g.add(this.keyboard(x, 0.3, ['#5ecfc0', '#c58ef0', '#5aa9f0'][i]));
      }
      g.add(this.chair(x, CHAIR_REACH));
    });
    // The cables everybody means to tidy.
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.06), mat('#1f242c'));
    tray.position.set(0, 0.5, -0.22);
    g.add(tray);
    return g;
  }

  /**
   * Long Maker Bench: the Maker Station three wide. Cutting mats, two irons, a meter and a
   * parts cabinet on the top, a pegboard of hung tools behind, three stools — spread by
   * `seatPosition` like the hacker bench.
   */
  private buildMakerBench(): THREE.Group {
    const g = this.deskTop(1.9, 0.6, '#b98a5a');
    const top = 0.66;
    for (const x of [-0.6, 0, 0.6]) {
      const cutMat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.01, 0.3), mat('#2f7a8a'));
      cutMat.position.set(x, top + 0.005, 0.08);
      g.add(cutMat);
      g.add(this.chair(x, CHAIR_REACH, 0, '#6aa89a'));
    }
    // Two soldering stations, a meter, and the drawers of small parts nobody sorts.
    for (const x of [-0.62, 0.02]) g.add(this.solderIron(x, top));
    const meter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.13), mat('#e0b83a'));
    meter.position.set(0.28, top + 0.01, -0.12);
    g.add(meter);
    g.add(this.partsDrawers(0.72, top));
    g.add(this.benchLamp(-0.3, top));
    g.add(this.pegboard(1.76, top));
    return g;
  }

  /**
   * Maker Station: one seat of hands-on work — a proper iron, a four-channel scope, a fume
   * arm over the board, and the same pegboard as the long bench, one tile wide. It is the
   * garage's own bench and the only one-seat hardware bench on the shelf.
   */
  private buildMakerStation(): THREE.Group {
    const g = this.deskTop(0.96, 0.62, '#b98a5a');
    const top = 0.66;
    const cutMat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.3), mat('#2f7a8a'));
    cutMat.position.set(-0.05, top + 0.005, 0.08);
    g.add(cutMat);
    const scope = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.18), mat('#d6d9de'));
    scope.position.set(0.26, top + 0.09, -0.16);
    g.add(scope);
    // The scope's screen: a trace while somebody probes a board, dark while nobody does.
    const screen = new THREE.Group();
    screen.position.set(0.24, top + 0.1, -0.065);
    g.add(screen);
    const trace = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.1, 0.01),
      new THREE.MeshStandardMaterial({ color: '#0d2b1c', emissive: '#3ddc84', emissiveIntensity: 0.5, flatShading: true }),
    );
    screen.add(trace);
    screen.userData.screen = { chairs: [0], live: [trace] } satisfies ScreenRig;
    g.add(this.solderIron(-0.3, top));
    // The fume arm reaching over the work.
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6), mat('#c9d1dd'));
    post.position.set(-0.4, top + 0.15, -0.22);
    g.add(post);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6), mat('#c9d1dd'));
    arm.rotation.x = Math.PI / 2.6;
    arm.position.set(-0.4, top + 0.3, -0.1);
    g.add(arm);
    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.07, 10), mat('#2b313b'));
    hood.position.set(-0.4, top + 0.28, 0.04);
    g.add(hood);
    g.add(this.pegboard(0.9, top));
    g.add(this.chair(0, CHAIR_REACH, 0, '#6aa89a'));
    return g;
  }

  /** An iron in its stand: the base unit and the holder leaning off it. */
  private solderIron(x: number, top: number): THREE.Group {
    const g = new THREE.Group();
    const station = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.12), mat('#2b313b'));
    station.position.set(x, top + 0.035, -0.18);
    g.add(station);
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.1, 6), mat('#c9d1dd'));
    holder.rotation.z = 0.5;
    holder.position.set(x + 0.1, top + 0.06, -0.18);
    g.add(holder);
    return g;
  }

  /** A small-parts cabinet, three rows of coloured drawer fronts. */
  private partsDrawers(x: number, top: number): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.14), mat('#d6d9de'));
    body.position.set(x, top + 0.1, -0.2);
    g.add(body);
    for (let row = 0; row < 3; row += 1) {
      for (const dx of [-0.07, 0.07]) {
        const front = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.01), mat(['#e5484d', '#3f7ea8', '#e0b83a'][row]));
        front.position.set(x + dx, top + 0.04 + row * 0.06, -0.128);
        g.add(front);
      }
    }
    return g;
  }

  /** A bench lamp on an arm, head tipped over the work. */
  private benchLamp(x: number, top: number): THREE.Group {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), mat('#e8e8e8'));
    post.position.set(x, top + 0.17, -0.22);
    g.add(post);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 10, 1, true), mat('#e8e8e8'));
    head.rotation.x = Math.PI * 0.8;
    head.position.set(x, top + 0.34, -0.13);
    g.add(head);
    return g;
  }

  /**
   * The pegboard every makerspace has: a pale board on two posts off a bench's back edge,
   * pitted with holes, a warm strip under it, and tools hung on it — as many as `width`
   * holds, in the order a real wall fills up: screwdrivers, pliers, a wrench, a hammer, then
   * rolls of tape and solder. **The tools face whoever works there**; from behind it is the
   * bare board with its holes. Both faces were dressed once, and a bench seen from behind
   * then looked as if it faced the wrong way.
   */
  private pegboard(width: number, top: number): THREE.Group {
    const board = new THREE.Group();
    board.position.set(0, 0, -0.34);
    const half = width / 2;
    for (const x of [-half - 0.02, half + 0.02]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.05), mat('#4c5360'));
      post.position.set(x, top + 0.47, 0);
      board.add(post);
    }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.66, 0.03), mat('#e6ddc8'));
    panel.position.set(0, 1.2, 0);
    panel.castShadow = true;
    board.add(panel);

    const side = new THREE.Group();
    board.add(side);
    const cols = Math.max(6, Math.round(width / 0.1));
    const holes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.014, 0.004), mat('#8a8272'), cols * 6);
    const place = new THREE.Object3D();
    let n = 0;
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        place.position.set(-half + 0.05 + col * ((width - 0.1) / (cols - 1)), 0.92 + row * 0.1, 0.017);
        place.updateMatrix();
        holes.setMatrixAt(n++, place.matrix);
      }
    }
    side.add(holes);
    // The back: the same holes, nothing hung on them. Tools face whoever works there.
    const backHoles = holes.clone();
    backHoles.position.z = -0.034;
    board.add(backHoles);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.06, 0.02, 0.03),
      new THREE.MeshStandardMaterial({ color: '#ffe2a8', emissive: '#ffcf70', emissiveIntensity: 0.6, flatShading: true }),
    );
    strip.position.set(0, 0.86, 0.02);
    side.add(strip);

    // Tools left to right until the board is full. Each takes its width of board.
    const face = 0.035;
    type Hang = { w: number; draw: (x: number) => void };
    const screwdriver = (colour: string): Hang => ({
      w: 0.09,
      draw: (x) => {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 6), mat(colour));
        handle.position.set(x, 1.38, face);
        side.add(handle);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.13, 5), mat('#c9d1dd'));
        shaft.position.set(x, 1.265, face);
        side.add(shaft);
      },
    });
    const pliers: Hang = {
      w: 0.12,
      draw: (x) => {
        for (const lean of [-0.14, 0.14]) {
          const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.22, 0.012), mat(lean < 0 ? '#c9d1dd' : '#e5484d'));
          jaw.rotation.z = lean;
          jaw.position.set(x + lean * 0.12, 1.26, face);
          side.add(jaw);
        }
      },
    };
    const wrench: Hang = {
      w: 0.14,
      draw: (x) => {
        const shank = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.012), mat('#aab3bf'));
        shank.position.set(x, 1.25, face);
        side.add(shank);
        const head = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 10, Math.PI * 1.5), mat('#aab3bf'));
        head.position.set(x, 1.4, face);
        side.add(head);
      },
    };
    const hammer: Hang = {
      w: 0.18,
      draw: (x) => {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.26, 0.018), mat('#a67c52'));
        handle.position.set(x, 1.22, face);
        side.add(handle);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.04), mat('#3a3f4a'));
        head.position.set(x, 1.37, face);
        side.add(head);
      },
    };
    const roll = (colour: string): Hang => ({
      w: 0.15,
      draw: (x) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.022, 6, 12), mat(colour));
        ring.position.set(x, 1.34, face + 0.01);
        side.add(ring);
      },
    });
    const wall: Hang[] = [
      screwdriver('#e5484d'), screwdriver('#e0b83a'), screwdriver('#3f7ea8'), pliers, wrench,
      screwdriver('#4caf6a'), pliers, hammer, roll('#f2f2f2'), roll('#2b313b'), roll('#c9d1dd'),
    ];
    let x = -half + 0.09;
    for (const tool of wall) {
      if (x + tool.w / 2 > half - 0.05) break;
      tool.draw(x + tool.w / 2 - 0.045);
      x += tool.w;
    }
    return board;
  }

  /**
   * Meeting Corner: a three-seat sofa along the back, three armchairs along the front, a low
   * table between them and a whiteboard on wheels at the end. Seats match `seatPosition`:
   * across `-0.62, 0, 0.62`, half a tile either side of the middle.
   */
  private buildMeetingCorner(): THREE.Group {
    const g = new THREE.Group();
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.4), mat('#a67c52'));
    table.position.y = 0.36;
    table.castShadow = true;
    g.add(table);
    for (const x of [-0.66, 0.66]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.3), mat('#4c5360'));
      leg.position.set(x, 0.17, 0);
      g.add(leg);
    }
    const papers = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.2), mat('#e8ecf2'));
    papers.position.set(-0.2, 0.395, 0.02);
    papers.rotation.y = 0.3;
    g.add(papers);
    // The sofa along the back.
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.26, 0.42), mat('#3f6f8f'));
    seat.position.set(0, 0.24, -0.62);
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.44, 0.14), mat('#355f7a'));
    back.position.set(0, 0.5, -0.8);
    back.castShadow = true;
    g.add(back);
    // Three armchairs along the front, backs to the room.
    for (const x of [-0.62, 0, 0.62]) {
      const chair = new THREE.Group();
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.4), mat('#c46a4a'));
      cushion.position.y = 0.22;
      cushion.castShadow = true;
      chair.add(cushion);
      const rest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.1), mat('#a8573b'));
      rest.position.set(0, 0.45, 0.17);
      chair.add(rest);
      chair.position.set(x, 0, 0.64);
      g.add(chair);
    }
    // A whiteboard on wheels at the end, turned toward the table.
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.62), mat('#f3f4f6'));
    board.position.set(1.08, 0.86, 0);
    g.add(board);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), mat('#8a929e'));
    legs.position.set(1.08, 0.3, 0);
    g.add(legs);
    return g;
  }

  /**
   * The Learning Station: a desk with a big screen of course material, a shelf of manuals
   * behind it and two chairs — it seats two, and it has to read as a classroom at iso scale.
   */
  /**
   * Learning Station: the same desk as the rest of the room, two chairs, and a wide screen
   * playing a course — a lesson on a whiteboard in a video player, the progress bar red.
   * A pair of headphones in front of each seat, the course manuals stacked at one end, and
   * a notebook with a pen, because nobody learns a skill by watching alone.
   */
  private buildLearning(): THREE.Group {
    const g = this.deskTop(0.96, 0.62, '#8a6a8f');
    const top = 0.66;
    // The screen, on a stand, facing the chairs.
    const face = new THREE.Group();
    face.position.set(0, top + 0.3, -0.14);
    face.rotation.x = -0.08;
    g.add(face);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.46, 0.03), mat('#15181d'));
    bezel.castShadow = true;
    face.add(bezel);
    const video = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.42),
      new THREE.MeshBasicMaterial({ map: courseTexture(), toneMapped: false }),
    );
    video.position.z = 0.017;
    face.add(video);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.77, 0.49, 0.004),
      new THREE.MeshStandardMaterial({ color: '#a98bf0', emissive: '#a98bf0', emissiveIntensity: 0.45, transparent: true, opacity: 0.5, flatShading: true }),
    );
    glow.position.z = -0.019;
    face.add(glow);
    // The lesson plays while somebody sits at either chair.
    face.userData.screen = { chairs: [-0.24, 0.24], live: [video], glow } satisfies ScreenRig;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.04), mat('#2b313b'));
    neck.position.set(0, top + 0.1, -0.16);
    g.add(neck);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.14), mat('#2b313b'));
    foot.position.set(0, top + 0.01, -0.16);
    g.add(foot);
    // A pair of headphones in front of each seat, and a chair behind them.
    for (const [x, tone] of [[-0.24, '#e5484d'], [0.24, '#3f7ea8']] as const) {
      g.add(this.headphones(x, top, tone));
      g.add(this.chair(x, CHAIR_REACH, 0, '#4a3f66'));
    }
    // The course manuals, stacked at one end; a notebook and a pen at the other.
    ['#c0584a', '#e0c36a', '#4f6f52'].forEach((colour, i) => {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.15), mat(colour));
      book.position.set(0.37, top + 0.018 + i * 0.036, -0.18);
      book.rotation.y = (i - 1) * 0.12;
      g.add(book);
    });
    const notebook = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.11), mat('#f2eee6'));
    notebook.position.set(-0.36, top + 0.006, -0.16);
    notebook.rotation.y = 0.2;
    g.add(notebook);
    const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), mat('#2b313b'));
    pen.rotation.z = Math.PI / 2;
    pen.rotation.y = 0.5;
    pen.position.set(-0.34, top + 0.018, -0.15);
    g.add(pen);
    return g;
  }

  /** Over-ear headphones lying on the desk: a band over two cups, and a cable trailing off. */
  private headphones(x: number, top: number, tone: string): THREE.Group {
    const h = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 14, Math.PI), mat('#1f242c'));
    band.rotation.x = -Math.PI / 2;
    band.position.y = 0.035;
    h.add(band);
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.035, 12), mat(tone));
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * 0.075, 0.035, 0);
      h.add(cup);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12), mat('#2b313b'));
      pad.rotation.z = Math.PI / 2;
      pad.position.set(side * 0.058, 0.035, 0);
      h.add(pad);
    }
    const cable = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.16), mat('#1f242c'));
    cable.position.set(0.09, 0.004, 0.09);
    cable.rotation.y = 0.4;
    h.add(cable);
    h.position.set(x, top, 0.1);
    return h;
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

  /**
   * Assembly Bench: three tiles of butcher block at standing height, a shelf of parts bins
   * under it, a vise clamped at each end, and a build in progress down the middle — a frame,
   * a motor, a wheel. No stools: its crew of twelve works on their feet, both sides.
   */
  private buildAssemblyBench(): THREE.Group {
    const g = new THREE.Group();
    const length = 2.82;
    const height = 0.78;
    const top = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, 0.96), mat('#c08a52'));
    top.position.y = height;
    top.castShadow = true;
    top.receiveShadow = true;
    g.add(top);
    // Six legs and a shelf between them, with a row of parts bins on it.
    for (const x of [-1.34, 0, 1.34]) {
      for (const z of [-0.4, 0.4]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, height, 0.08), mat('#4c5360'));
        leg.position.set(x, height / 2, z);
        g.add(leg);
      }
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(length - 0.12, 0.04, 0.8), mat('#5b626e'));
    shelf.position.y = 0.2;
    g.add(shelf);
    [-1.05, -0.62, -0.19, 0.24, 0.67, 1.1].forEach((x, i) => {
      const bin = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.26), mat(['#e5484d', '#3f7ea8', '#e0b83a'][i % 3]));
      bin.position.set(x, 0.29, i % 2 ? 0.18 : -0.18);
      g.add(bin);
    });
    const surface = height + 0.05;
    // A vise at each end.
    for (const x of [-1.22, 1.22]) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.16), mat('#3f7ea8'));
      body.position.set(x, surface + 0.06, 0.3);
      g.add(body);
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.04), mat('#8d98a8'));
      jaw.position.set(x, surface + 0.12, 0.4);
      g.add(jaw);
    }
    // The build: a square frame of tube, a motor beside it, a wheel lying flat.
    const tube = mat('#c9d1dd');
    for (const [x, z, w, d] of [[-0.3, -0.2, 0.7, 0.05], [-0.3, 0.2, 0.7, 0.05], [-0.63, 0, 0.05, 0.4], [0.03, 0, 0.05, 0.4]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), tube);
      rail.position.set(x, surface + 0.03, z);
      g.add(rail);
    }
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 12), mat('#2b313b'));
    motor.rotation.z = Math.PI / 2;
    motor.position.set(0.42, surface + 0.1, -0.12);
    g.add(motor);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), mat('#1f242c'));
    wheel.position.set(0.86, surface + 0.03, 0.12);
    g.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10), mat('#8d98a8'));
    hub.position.set(0.86, surface + 0.05, 0.12);
    g.add(hub);
    // A drill left where somebody put it down.
    const drill = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.07), mat('#e0b83a'));
    drill.position.set(-0.86, surface + 0.04, -0.28);
    drill.rotation.y = 0.5;
    g.add(drill);
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

  /**
   * The Sofa & Kettle — the space's first comfort, and it grows with the lease: a deep
   * two-seater with the kettle on its arm in the garage; from Unit 4B a three-seater across
   * two tiles with a side table, the kettle and a stack of tea glasses; a rug under it all
   * from the warehouse. The front (+z) is the side people sit on.
   */
  private buildLounge(span = 1): THREE.Group {
    const g = new THREE.Group();
    const era = this.era;
    const fabric = '#a2564c';
    const dark = '#8f4a41';
    const table = span > 1 ? 0.46 : 0;
    const width = span * 0.98 - table - (span > 1 ? 0.08 : 0);
    const cx = -table / 2 - (span > 1 ? 0.04 : 0);
    const depth = 0.78;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(width, 0.28, depth), mat(fabric));
    seat.position.set(cx, 0.2, 0.02);
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, 0.2), mat(dark));
    back.position.set(cx, 0.58, -0.3);
    back.castShadow = true;
    g.add(back);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.26, depth), mat(dark));
      arm.position.set(cx + side * (width / 2 - 0.07), 0.47, 0.02);
      arm.castShadow = true;
      g.add(arm);
    }
    const seats = span > 1 ? 3 : 2;
    const inner = width - 0.28;
    for (let i = 0; i < seats; i += 1) {
      const x = cx - inner / 2 + (inner / seats) * (i + 0.5);
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(inner / seats - 0.04, 0.1, depth - 0.24), mat('#b8695d'));
      cushion.position.set(x, 0.39, 0.08);
      g.add(cushion);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(inner / seats - 0.1, 0.24, 0.1), mat('#c97c6d'));
      pillow.position.set(x, 0.55, -0.16);
      pillow.rotation.x = -0.2;
      g.add(pillow);
    }
    for (const x of [cx - width / 2 + 0.06, cx + width / 2 - 0.06]) {
      for (const z of [-0.32, 0.36]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mat('#3a2e26'));
        foot.position.set(x, 0.03, z);
        g.add(foot);
      }
    }
    const kettle = (x: number, y: number, z: number) => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 10), mat('#cbd3de'));
      pot.position.set(x, y + 0.09, z);
      g.add(pot);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat('#2a2f38'));
      lid.position.set(x, y + 0.2, z);
      g.add(lid);
      const spout = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.1), mat('#cbd3de'));
      spout.position.set(x, y + 0.12, z + 0.11);
      spout.rotation.x = -0.6;
      g.add(spout);
    };
    if (span > 1) {
      // A side table at the end of the sofa: the kettle, and tea glasses on a tray.
      const tx = cx + width / 2 + 0.04 + table / 2;
      const top = new THREE.Mesh(new THREE.BoxGeometry(table, 0.05, 0.56), mat('#6b4a33'));
      top.position.set(tx, 0.5, 0);
      top.castShadow = true;
      g.add(top);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(table - 0.08, 0.48, 0.48), mat('#57402f'));
      legs.position.set(tx, 0.24, 0);
      g.add(legs);
      kettle(tx - 0.08, 0.525, -0.1);
      const tray = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 12), mat('#c9a44a'));
      tray.position.set(tx + 0.06, 0.532, 0.12);
      g.add(tray);
      for (const [gx, gz] of [[0, 0.04], [0.06, -0.04], [-0.06, -0.04]]) {
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.08, 8), mat('#b5402a', { transparent: true, opacity: 0.85 }));
        glass.position.set(tx + 0.06 + gx, 0.58, 0.12 + gz);
        g.add(glass);
      }
    } else {
      // In the garage the kettle lives on the arm, because there is nowhere else.
      kettle(cx + width / 2 - 0.07, 0.6, 0.12);
    }
    if (era >= 3) {
      const rug = new THREE.Mesh(new THREE.BoxGeometry(span * 0.98 + 0.2, 0.01, 1.1), mat('#5d6b8a'));
      rug.position.set(0, 0.005, 0.18);
      g.add(rug);
    }
    return g;
  }


  private buildPerson(id: string, isPlayer: boolean): THREE.Group {
    const g = new THREE.Group();
    const color = isPlayer ? PLAYER_COLOR : (MEMBER_COLORS[id] ?? personColor(id));
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.56, 7), mat(color));
    body.name = 'body';
    body.position.y = 0.28;
    body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat('#e8c9a6'));
    head.name = 'head';
    head.position.y = 0.72;
    head.castShadow = true;
    g.add(head);
    // Legs, only shown sitting: thighs out along the seat, shins down to the floor. Without
    // them a seated person is a cone sunk into the sofa.
    const legs = new THREE.Group();
    legs.name = 'legs';
    for (const x of [-0.08, 0.08]) {
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.28), mat(shade(color, -0.25)));
      thigh.position.set(x, 0.045, 0.14);
      legs.add(thigh);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1, 0.09), mat(shade(color, -0.35)));
      shin.name = 'shin';
      shin.position.set(x, 0, 0.27);
      legs.add(shin);
    }
    legs.visible = false;
    g.add(legs);
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
    if (seat?.stand) {
      this.pose(node, null);
      // On their feet at a comfort — the end of the table-tennis table, the fridge — and
      // facing it. Table tennis gets a rally's worth of bob and sway.
      const look = toWorld(seat.look.x, seat.look.y);
      node.rotation.y = Math.atan2(look.x - world.x, look.z - world.z) + Math.sin(this.elapsed * 6 + world.x) * 0.1;
      node.position.y = Math.abs(Math.sin(this.elapsed * 5 + world.z)) * 0.03;
      return;
    }
    if (seat) {
      // Sitting: on the seat at its own height, turned to face the table or the screen.
      const look = toWorld(seat.look.x, seat.look.y);
      node.rotation.y = Math.atan2(look.x - world.x, look.z - world.z) +
        (activity === 'working' ? Math.sin(this.elapsed * 2.5 + world.x) * 0.12 : 0);
      this.pose(node, seat.height ?? 0.39);
      return;
    }
    this.pose(node, null);
    node.position.y = activity === 'walking' ? Math.abs(Math.sin(this.elapsed * 9)) * 0.07 : 0;
    node.rotation.y = activity === 'working' ? Math.sin(this.elapsed * 2.5) * 0.18 : 0;
  }

  /**
   * Standing, or sitting on a seat `height` above the floor: a shorter body resting on the
   * seat, thighs along it and shins down to the floor. The node itself is lifted to the
   * seat, so a sofa and a desk chair both read as somebody sitting on something.
   */
  private pose(node: THREE.Object3D, height: number | null) {
    const body = node.getObjectByName('body');
    const head = node.getObjectByName('head');
    const legs = node.getObjectByName('legs');
    if (!body || !head || !legs) return;
    if (height === null) {
      body.scale.set(1, 1, 1);
      body.position.set(0, 0.28, 0);
      head.position.set(0, 0.72, 0);
      legs.visible = false;
      return;
    }
    // A little forward of the seat's middle, toward whatever they face: centred on it, the
    // body filled the chair and its back came out through their shoulders.
    body.scale.set(0.8, 0.62, 0.8);
    body.position.set(0, 0.175, SIT_FORWARD);
    head.position.set(0, 0.5, SIT_FORWARD);
    legs.position.z = SIT_FORWARD;
    legs.visible = true;
    for (const shin of legs.children.filter((c) => c.name === 'shin')) {
      shin.scale.y = Math.max(0.05, height);
      shin.position.y = -height / 2 + 0.04;
    }
    node.position.y = height;
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
    // Something hung on the wall moves along the wall: a mark per free column, on the
    // floor right under the back wall, which is where the eye already is.
    if (amenityDef(this.placing)?.mount === 'wall') {
      const geo = new THREE.BoxGeometry(TILE * 0.5, 0.02, TILE * 0.12);
      for (let x = 0; x < GRID.width; x += 1) {
        if (!wallColumnFree(x, this.placing)) continue;
        const mark = new THREE.Mesh(
          geo.clone(),
          new THREE.MeshStandardMaterial({
            color: '#5ecfc0',
            flatShading: true,
            transparent: true,
            opacity: 0.6,
            emissive: new THREE.Color('#2f8f84'),
            emissiveIntensity: 0.6,
          }),
        );
        mark.position.copy(toWorld(x, -0.35, 0.014));
        this.group.add(mark);
        this.placingMarks.push(mark);
      }
      return;
    }
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
    // **Clear of the wall, and clear of the panels.** The wall's face is at +0.09 and the
    // acoustic panels (a backdrop) stand proud of it to +0.125; the neon's dark board sat in
    // the same few millimetres as both and flickered between them. Everything else hangs
    // in front of the panels.
    node.position.z = back.z + (def.shape === 'acoustics' ? 0.1 : 0.17);
    // Where along the wall is the layout's call now (`wallColumn`) — the player can move it,
    // and the layout keeps two things off one nail. Only the height is the item's own.
    node.position.x = toWorld(wallColumn(def.id) ?? (GRID.width - 1) / 2, 0).x;
    node.position.y = def.shape === 'ac' ? 1.34 : def.shape === 'acoustics' ? 1.16 : 1.42;
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
      case 'console':
        return this.propConsole(def.tone);
      case 'tv':
        return this.propTv(def.tone);
      case 'espresso':
        return this.propEspresso(def.tone);
      case 'nappod':
        return this.propNapPod(def.tone);
      case 'mate':
        return this.propMate(def.tone);
      case 'teamaker':
        return this.propTeaMaker(def.tone);
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

  /** A screen that glows, for the console corner and the wall TV alike. */
  private screen(w: number, h: number, glow = '#3a7bd5'): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.03),
      new THREE.MeshStandardMaterial({
        color: '#9fd0ff',
        flatShading: true,
        emissive: new THREE.Color(glow),
        emissiveIntensity: 0.85,
      }),
    );
  }

  /** A low media unit, a telly on it, the console beside it and two pads on the floor. */
  /**
   * The PlayStation Corner: a low TV unit with a big screen at the back of the tile and two
   * gaming chairs at the front, far enough apart for two people to sit in them — the break
   * logic seats players at `x ±0.26, z 0.3` (see `AMENITIES`), so the chairs are built
   * round those points with the backs behind them.
   */
  private propConsole(tone: string): THREE.Group {
    const g = new THREE.Group();
    const unit = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 0.36), mat('#2a2f38'));
    unit.position.set(0, 0.15, -0.3);
    unit.castShadow = true;
    g.add(unit);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.58, 0.05), mat('#111317'));
    bezel.position.set(0, 0.62, -0.4);
    bezel.castShadow = true;
    g.add(bezel);
    // Off until somebody plays: a dark panel, and the game is drawn onto it (`updateConsoles`).
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.52, 0.03), mat('#0c0e12'));
    glass.name = 'consoleGlass';
    glass.position.set(0, 0.62, -0.37);
    g.add(glass);
    // The console itself: white shell, dark band, stood on its end the way everybody does.
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.24), mat('#eef0f3'));
    shell.position.set(0.38, 0.45, -0.28);
    g.add(shell);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.25), mat('#15171c'));
    band.position.set(0.38, 0.45, -0.28);
    g.add(band);
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.02, 0.02),
      new THREE.MeshStandardMaterial({ color: tone, emissive: new THREE.Color(tone), emissiveIntensity: 1 }),
    );
    lamp.position.set(0.38, 0.31, -0.15);
    g.add(lamp);
    for (const x of [-0.26, 0.26]) {
      const chair = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.34), mat('#1d2027'));
      seat.position.set(0, 0.25, 0);
      seat.castShadow = true;
      chair.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.08), mat('#1d2027'));
      back.position.set(0, 0.52, 0.2);
      back.rotation.x = 0.15;
      back.castShadow = true;
      chair.add(back);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.48, 0.085), mat(tone));
      trim.position.set(0, 0.53, 0.2);
      trim.rotation.x = 0.15;
      chair.add(trim);
      for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.26), mat('#2c313a'));
        arm.position.set(side * 0.19, 0.38, 0.02);
        chair.add(arm);
      }
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.2, 8), mat('#3a414d'));
      base.position.set(0, 0.1, 0);
      chair.add(base);
      chair.position.set(x, 0, 0.3);
      g.add(chair);
    }
    return g;
  }


  /** Eighty-five inches, flat to the wall. */
  private propTv(tone: string): THREE.Group {
    const g = new THREE.Group();
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.86, 0.06), mat(tone));
    bezel.castShadow = true;
    g.add(bezel);
    const glass = this.screen(1.42, 0.78, '#2f6fb0');
    glass.position.z = 0.03;
    g.add(glass);
    return g;
  }

  /** A counter, a proper machine on it, a grinder beside it and a stack of cups. */
  private propEspresso(tone: string): THREE.Group {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.86, 0.5), mat(tone));
    counter.position.y = 0.43;
    counter.castShadow = true;
    g.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.04, 0.54), mat('#d9dde2'));
    top.position.y = 0.88;
    g.add(top);
    const machine = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), mat('#b9c0c8'));
    machine.position.set(-0.16, 1.05, -0.04);
    g.add(machine);
    const group = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8), mat('#2a2f38'));
    group.position.set(-0.16, 0.96, 0.14);
    g.add(group);
    const grinder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.32, 10), mat('#2a2f38'));
    grinder.position.set(0.24, 1.06, -0.06);
    g.add(grinder);
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.12, 10), mat('#6b4a33'));
    hopper.position.set(0.24, 1.28, -0.06);
    g.add(hopper);
    for (let i = 0; i < 3; i += 1) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.06, 8), mat('#f2f3f5'));
      cup.position.set(0.36, 0.93 + i * 0.062, 0.14);
      g.add(cup);
    }
    return g;
  }

  /**
   * The Club-Mate fridge: half the drinks fridge, bottles behind the glass, and MATE across
   * the top. **The lettering is a canvas texture** — the second one in the game after the
   * wall sign (§11), for the same reason: letters are the one thing boxes cannot draw, and
   * a Mate fridge without the word on it is just a small yellow fridge.
   */
  /**
   * The Club-Mate fridge, the way the shops have them: a tall glass-door display fridge in
   * a black frame with orange side panels, a lit MATE header, shelves of amber bottles you
   * can see through the glass, and a stack of yellow crates beside it.
   *
   * **The cabinet is a shell, not a box.** A solid body with the glass in front of it hid
   * every bottle behind black, and its top sat in the same plane as the header's and
   * flickered. Back, sides and a plinth, with the header sitting on top of the sides.
   */
  private propMate(tone: string): THREE.Group {
    const g = new THREE.Group();
    const orange = '#ec7424';
    const black = '#16181d';
    const w = 0.5;
    const h = 1.46;
    const d = 0.46;
    const head = 0.2; // the lit header across the top
    const body = h - head;
    const plinth = 0.1;
    const wall = 0.03;
    const fx = -0.16; // the fridge stands left of centre, the crates to its right
    const piece = (sx: number, sy: number, sz: number, x: number, y: number, z: number, colour: string) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat(colour));
      mesh.position.set(fx + x, y, z);
      mesh.castShadow = true;
      g.add(mesh);
      return mesh;
    };
    piece(w, body, wall, 0, body / 2, -d / 2 + wall / 2, black); // back
    for (const side of [-1, 1]) {
      piece(wall, body, d, side * (w / 2 - wall / 2), body / 2, 0, black);
      // Orange panel on the outside, and the round badge on it.
      piece(0.012, body - plinth - 0.1, d - 0.06, side * (w / 2 + 0.006), plinth + (body - plinth) / 2, 0, orange);
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.014, 14), mat('#1f2a44'));
      badge.rotation.z = Math.PI / 2;
      badge.position.set(fx + side * (w / 2 + 0.014), body - 0.2, 0);
      g.add(badge);
    }
    piece(w, plinth, d, 0, plinth / 2, 0, black); // plinth
    // Lit from inside: a warm back panel, and bottles on shelves in front of it.
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(w - wall * 2, body - plinth, 0.01),
      new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: new THREE.Color('#ffe1a8'), emissiveIntensity: 0.55, flatShading: true }),
    );
    glow.position.set(fx, plinth + (body - plinth) / 2, -d / 2 + wall + 0.006);
    g.add(glow);
    const shelves = 4;
    const pitch = (body - plinth - 0.04) / shelves;
    for (let i = 0; i < shelves; i += 1) {
      const y = plinth + 0.02 + i * pitch;
      piece(w - wall * 2, 0.012, d - wall - 0.04, 0, y, 0.01, '#9aa3ad');
      for (const [x, z] of [[-0.15, 0.08], [-0.075, 0.08], [0, 0.08], [0.075, 0.08], [0.15, 0.08], [-0.11, -0.06], [0.04, -0.06]]) {
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.031, 0.17, 7), mat('#c07a18'));
        bottle.position.set(fx + x, y + 0.092, z);
        g.add(bottle);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.05, 6), mat('#c07a18'));
        neck.position.set(fx + x, y + 0.2, z);
        g.add(neck);
        const label = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.06, 7), mat('#f3efe4'));
        label.position.set(fx + x, y + 0.075, z);
        g.add(label);
      }
    }
    // The glass door, barely there, and its handle.
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.02, body - plinth, 0.012),
      new THREE.MeshStandardMaterial({ color: '#d8eef5', transparent: true, opacity: 0.12, flatShading: true, depthWrite: false }),
    );
    glass.position.set(fx, plinth + (body - plinth) / 2, d / 2);
    g.add(glass);
    piece(0.025, 0.5, 0.03, w / 2 - 0.06, body / 2 + 0.05, d / 2 + 0.03, '#c9d1dd');
    // The lit header on top of the cabinet: orange all round, MATE across the front.
    const logo = new THREE.MeshStandardMaterial({
      map: this.mateTexture(tone),
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.3,
      emissiveMap: this.mateTexture(tone),
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(w, head, d), [
      mat(orange), mat(orange), mat(orange), mat('#1a1c21'), logo, mat(orange),
    ]);
    sign.position.set(fx, body + head / 2, 0);
    sign.castShadow = true;
    g.add(sign);
    // Two yellow crates of bottles, stacked.
    for (let i = 0; i < 2; i += 1) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.4), mat(tone));
      crate.position.set(0.3, 0.11 + i * 0.23, 0.02);
      crate.castShadow = true;
      g.add(crate);
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.012), mat('#b88a00'));
      slot.position.set(0.3, 0.16 + i * 0.23, 0.225);
      g.add(slot);
    }
    for (const [x, z] of [[-0.08, -0.12], [0, -0.12], [0.08, -0.12], [-0.08, 0], [0, 0], [0.08, 0], [-0.08, 0.12], [0, 0.12], [0.08, 0.12]]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.07, 6), mat('#b8761a'));
      cap.position.set(0.3 + x, 0.5, 0.02 + z);
      g.add(cap);
    }
    return g;
  }

  /**
   * A Turkish tea maker on a small counter: the red hexagonal boiler with a gauge, a tap
   * and a drip tray, two stainless pots side by side on top, and tulip glasses on saucers.
   */
  private propTeaMaker(tone: string): THREE.Group {
    const g = new THREE.Group();
    const steel = '#d3d9e0';
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.5, 0.5), mat('#3b4250'));
    counter.position.y = 0.25;
    counter.castShadow = true;
    g.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.04, 0.54), mat('#e6e8ea'));
    top.position.y = 0.52;
    g.add(top);
    const bx = -0.1;
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.46, 6), mat(tone));
    boiler.position.set(bx, 0.79, -0.02);
    boiler.rotation.y = Math.PI / 6;
    boiler.castShadow = true;
    g.add(boiler);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.025, 6), mat('#b9c0c8'));
    plate.position.set(bx, 1.03, -0.02);
    plate.rotation.y = Math.PI / 6;
    g.add(plate);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.14), mat('#1b1d22'));
    tray.position.set(bx, 0.555, 0.2);
    g.add(tray);
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12), mat('#f1f1ee'));
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(bx - 0.05, 0.9, 0.172);
    g.add(gauge);
    const tap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.07), mat(steel));
    tap.position.set(bx - 0.05, 0.72, 0.2);
    g.add(tap);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.03), mat('#1b1d22'));
    handle.position.set(bx - 0.05, 0.79, 0.21);
    g.add(handle);
    for (const [y, colour] of [[0.86, '#8a2a22'], [0.8, '#2f7a3a']] as [number, string][]) {
      const light = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 8), mat(colour, { emissive: colour, emissiveIntensity: 0.6 }));
      light.rotation.x = Math.PI / 2;
      light.position.set(bx + 0.08, y, 0.172);
      g.add(light);
    }
    // Two pots side by side: a squat body, a domed lid with a black knob, a curved spout.
    for (const [px, turn] of [[-0.09, 0.4], [0.09, -0.4]]) {
      const pot = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.13, 12), mat(steel));
      body.position.y = 0.065;
      pot.add(body);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(steel));
      lid.position.y = 0.13;
      pot.add(lid);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), mat('#15171c'));
      knob.position.y = 0.225;
      pot.add(knob);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.13, 6), mat(steel));
      spout.position.set(0, 0.09, 0.1);
      spout.rotation.x = 0.9;
      pot.add(spout);
      pot.position.set(bx + px, 1.045, -0.02);
      pot.rotation.y = turn;
      g.add(pot);
    }
    // Tulip glasses of tea on saucers.
    for (const [x, z] of [[0.24, 0.1], [0.32, -0.06], [0.2, -0.12]]) {
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 12), mat('#f3f1ec'));
      saucer.position.set(x, 0.545, z);
      g.add(saucer);
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.02, 0.085, 8),
        mat('#a3301c', { transparent: true, opacity: 0.85 }),
      );
      glass.position.set(x, 0.595, z);
      g.add(glass);
    }
    return g;
  }

  private mateCanvas: THREE.CanvasTexture | null = null;

  /**
   * MATE across the header, dark on orange. Big enough to read when you zoom in — about
   * two thirds of the header's height — but inside a header a fifth of the fridge tall,
   * not the billboard the first fridge carried.
   */
  private mateTexture(_tone: string): THREE.CanvasTexture {
    if (this.mateCanvas) return this.mateCanvas;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 104;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ec7424';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1f2a44';
    ctx.font = "900 70px \"Arial Black\", Helvetica, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('MATE', canvas.width / 2, canvas.height / 2 + 4, canvas.width - 24);
    this.mateCanvas = new THREE.CanvasTexture(canvas);
    this.mateCanvas.colorSpace = THREE.SRGBColorSpace;
    this.mateCanvas.anisotropy = 8;
    return this.mateCanvas;
  }


  /** A white egg on a plinth with a dark mouth, which is all a nap pod is. */
  private propNapPod(tone: string): THREE.Group {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.6), mat('#3a414d'));
    base.position.y = 0.09;
    base.castShadow = true;
    g.add(base);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 10), mat(tone));
    shell.scale.set(1, 0.72, 0.68);
    shell.position.y = 0.52;
    shell.castShadow = true;
    g.add(shell);
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat('#15171c'));
    mouth.scale.set(1, 0.6, 0.4);
    mouth.position.set(0, 0.5, 0.2);
    g.add(mouth);
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.02, 0.02),
      new THREE.MeshStandardMaterial({ color: '#7fb2f0', emissive: new THREE.Color('#2b5fa8'), emissiveIntensity: 1 }),
    );
    glow.position.set(0, 0.26, 0.29);
    g.add(glow);
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
    // Between games: two bats lying on the table and a ball beside them. They are hidden
    // while a rally is on, because the players are holding them (`updateRallies`).
    const kit = new THREE.Group();
    kit.name = 'restingKit';
    ([[0.28, 0.14, 0.6, '#c0392b'], [0.34, -0.12, -0.9, '#1d2027']] as const).forEach(([x, z, yaw, rubber]) => {
      const bat = this.makeBat(rubber);
      bat.rotation.set(-Math.PI / 2, yaw, 0, 'YXZ');
      bat.position.set(x, 0.762, z);
      kit.add(bat);
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), mat('#f4f1ea'));
    ball.position.set(0.14, 0.782, 0.02);
    kit.add(ball);
    g.add(kit);
    return g;
  }

  /** A table-tennis bat: a round blade in its rubber colour on a wooden grip, standing up. */
  private makeBat(rubber: string): THREE.Group {
    const bat = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.016, 14), mat(rubber));
    blade.rotation.x = Math.PI / 2;
    blade.position.y = 0.09;
    bat.add(blade);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.025), mat('#a67c52'));
    bat.add(grip);
    return bat;
  }

  /**
   * The aquarium: a tank on a cabinet, sand, a couple of rocks, weed that sways, a small
   * wreck on its side, fish that swim end to end and turn, and bubbles off a stone in the
   * corner. It moves through `userData.tick` (see `update`), so the fish are part of the
   * model — a thumbnail simply catches them mid-swim.
   */
  private propAquarium(tone: string): THREE.Group {
    const g = new THREE.Group();
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.5, 0.42), mat('#3a3027'));
    stand.position.y = 0.25;
    stand.castShadow = true;
    g.add(stand);
    // An open frame rather than a lid: the camera looks down into the room, and a solid top
    // hid half of what is in the tank. A light bar along the back does the lid's job.
    for (const [w, d, x, z] of [[0.76, 0.03, 0, 0.195], [0.76, 0.03, 0, -0.195], [0.03, 0.42, 0.365, 0], [0.03, 0.42, -0.365, 0]]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), mat('#2d333d'));
      rim.position.set(x, 0.965, z);
      g.add(rim);
    }
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.03, 0.06),
      new THREE.MeshStandardMaterial({ color: '#dff4ff', emissive: '#bfe8ff', emissiveIntensity: 0.7, flatShading: true }),
    );
    light.position.set(0, 0.985, -0.15);
    g.add(light);
    // Inside first, water last: the water is see-through, so it has to be drawn after what
    // is in it, and it writes no depth so the fish behind its front face still show.
    const sand = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.36), mat('#c8b48a'));
    sand.position.y = 0.535;
    g.add(sand);
    for (const [x, z, r, colour] of [[-0.24, -0.08, 0.055, '#6b7280'], [-0.17, 0.02, 0.035, '#8a8f99'], [0.26, -0.1, 0.045, '#5d6470']] as [number, number, number, string][]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat(colour));
      rock.position.set(x, 0.56 + r * 0.5, z);
      rock.rotation.set(x * 7, z * 9, 0);
      g.add(rock);
    }
    // The wreck: a hull on its side, a broken mast, two portholes. Small, like the real ones.
    const wreck = new THREE.Group();
    wreck.position.set(0.1, 0.585, -0.08);
    wreck.rotation.set(0, -0.5, 0.35);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.08), mat('#6b4a2e'));
    wreck.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.07, 4), mat('#6b4a2e'));
    bow.rotation.z = -Math.PI / 2;
    bow.position.x = 0.13;
    wreck.add(bow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 5), mat('#4a3322'));
    mast.position.set(-0.02, 0.07, 0);
    mast.rotation.z = 0.3;
    wreck.add(mast);
    for (const px of [-0.05, 0.03]) {
      const porthole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.005, 8), mat('#d9b25a'));
      porthole.rotation.x = Math.PI / 2;
      porthole.position.set(px, 0.005, 0.042);
      wreck.add(porthole);
    }
    g.add(wreck);
    // Weed along the back, swaying from the root.
    const weed: THREE.Object3D[] = [];
    for (const [x, z, h, colour] of [[-0.3, -0.13, 0.26, '#3f8f4a'], [-0.08, -0.14, 0.2, '#56a85c'], [0.3, -0.12, 0.3, '#3f8f4a'], [0.22, 0.1, 0.16, '#6bbf5e']] as [number, number, number, string][]) {
      const root = new THREE.Group();
      root.position.set(x, 0.56, z);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.025, h, 0.012), mat(colour));
      blade.position.y = h / 2;
      root.add(blade);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.02, h * 0.6, 0.01), mat(colour));
      leaf.position.set(0.02, h * 0.35, 0);
      leaf.rotation.z = -0.35;
      root.add(leaf);
      g.add(root);
      weed.push(root);
    }
    // Fish: a body, a tail and a fin each; they swim along x and turn at the glass.
    const fish = (colour: string) => {
      const f = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(colour));
      body.scale.set(1.5, 0.9, 0.6);
      f.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.045, 4), mat(colour));
      tail.rotation.z = Math.PI / 2;
      tail.position.x = -0.065;
      f.add(tail);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.006, 5, 4), mat('#111111'));
      eye.position.set(0.035, 0.008, 0.018);
      f.add(eye);
      g.add(f);
      return { node: f, tail };
    };
    const school = [
      { ...fish('#f0b429'), y: 0.72, z: 0.05, speed: 0.55, phase: 0 },
      { ...fish('#e2725b'), y: 0.82, z: -0.04, speed: 0.4, phase: 2.1 },
      { ...fish('#f08fa4'), y: 0.65, z: 0.1, speed: 0.7, phase: 4.2 },
      { ...fish('#5aa9f0'), y: 0.77, z: 0.0, speed: 0.48, phase: 1.1 },
    ];
    // Bubbles off an airstone in the back corner, rising and starting again at the bottom.
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.025, 8), mat('#9aa3ad'));
    stone.position.set(-0.29, 0.575, 0.1);
    g.add(stone);
    const bubbleMat = new THREE.MeshStandardMaterial({ color: '#e8f7ff', emissive: '#9fdcff', emissiveIntensity: 0.4, flatShading: true });
    const bubbles = Array.from({ length: 7 }, (_, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.009 + (i % 3) * 0.003, 6, 4), bubbleMat);
      g.add(b);
      return b;
    });
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.44, 0.38),
      new THREE.MeshStandardMaterial({
        color: tone,
        flatShading: true,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        emissive: new THREE.Color(tone),
        emissiveIntensity: 0.3,
      }),
    );
    water.position.y = 0.73;
    water.renderOrder = 1;
    g.add(water);

    g.userData.tick = (t: number) => {
      for (const f of school) {
        const s = Math.sin(t * f.speed + f.phase);
        f.node.position.set(s * 0.26, f.y + Math.sin(t * 1.3 + f.phase) * 0.015, f.z);
        // Facing where it is going: the derivative of the sine says which way that is.
        f.node.rotation.y = Math.cos(t * f.speed + f.phase) >= 0 ? 0 : Math.PI;
        f.tail.rotation.y = Math.sin(t * 12 + f.phase) * 0.5;
      }
      weed.forEach((root, i) => {
        root.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.12;
        root.rotation.x = Math.sin(t * 0.7 + i) * 0.06;
      });
      bubbles.forEach((b, i) => {
        const rise = (t * 0.22 + i / bubbles.length) % 1;
        b.position.set(-0.29 + Math.sin(t * 3 + i * 2) * 0.012, 0.6 + rise * 0.33, 0.1);
      });
    };
    g.userData.tick(0);
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

  /**
   * The lava lamp: a stool, a metal base, a tinted glass and, inside it, three blobs of wax
   * rising and falling out of step — stretched on the way, round at the turn — over a pool
   * that never leaves the bottom. Moves through `userData.tick` (see `update`).
   */
  private propLava(tone: string): THREE.Group {
    const g = new THREE.Group();
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 10), mat('#3b4250'));
    stool.position.y = 0.21;
    g.add(stool);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.1, 10), mat('#aab3c0'));
    base.position.y = 0.47;
    g.add(base);
    const wax = new THREE.MeshStandardMaterial({ color: '#ffd23d', emissive: new THREE.Color('#ffb020'), emissiveIntensity: 0.9, flatShading: true });
    const pool = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), wax);
    pool.scale.set(1, 0.45, 1);
    pool.position.y = 0.525;
    g.add(pool);
    const blobs = [0.034, 0.027, 0.022].map((r) => {
      const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), wax);
      g.add(blob);
      return blob;
    });
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.08, 0.3, 12),
      new THREE.MeshStandardMaterial({
        color: tone,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        emissive: new THREE.Color(tone),
        emissiveIntensity: 0.55,
      }),
    );
    glass.position.y = 0.67;
    glass.renderOrder = 1;
    g.add(glass);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.06, 10), mat('#aab3c0'));
    cap.position.y = 0.85;
    g.add(cap);

    g.userData.tick = (t: number) => {
      blobs.forEach((blob, i) => {
        // Slow, and out of step: a lava lamp is never in a hurry and never in time.
        const phase = t * (0.35 + i * 0.07) + i * 2.3;
        const height = (Math.sin(phase) + 1) / 2;
        const moving = Math.abs(Math.cos(phase));
        blob.position.set(Math.sin(t * 0.25 + i * 1.9) * 0.012, 0.56 + height * 0.22, Math.cos(t * 0.2 + i) * 0.01);
        blob.scale.set(1 - moving * 0.18, 1 + moving * 0.35, 1 - moving * 0.18);
      });
    };
    g.userData.tick(0);
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
    // The rallies and the placing preview went with the rest of the room.
    this.rallies.clear();
    this.buyMarks = [];
    this.buyMarksKey = '';
    this.ghost = null;
    this.ghostKey = '';
    this.buildAmenities();
    this.markPlaceable();
    this.syncStations();
    return true;
  }

  update(runtime: RuntimeSnapshot, dt: number) {
    this.elapsed += dt;
    this.syncStations();
    this.updateScreens(runtime);

    // Props that move on their own — fish, lava — carry a `userData.tick` and are handed
    // the clock here. A prop animates itself; the view only keeps time.
    for (const node of this.amenityNodes.values()) {
      node.traverse((child) => (child.userData.tick as ((t: number) => void) | undefined)?.(this.elapsed));
    }

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
      this.placePerson(m.id, false, m.present, m.seat ?? m.spot ?? m.pos, m.activity, m.seat);
    }
    if (runtime.player) {
      const p = runtime.player;
      this.placePerson('player', true, p.present, p.seat ?? p.spot ?? p.pos, p.activity, p.seat);
    }

    this.updateRallies(runtime);
    this.updateHeld(runtime);
    this.updateConsoles(runtime);

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
        // The thing being printed grows up to meet the nozzle, a layer at a time.
        if (visual.root && visual.bedTop !== undefined) {
          const key = job ? `${machine.id}:${job.partName}:${job.hoursRequired}` : '';
          if (key !== visual.partKey) {
            if (visual.part) visual.root.remove(visual.part);
            visual.part = key ? printedThing(key) : undefined;
            visual.partKey = key;
            if (visual.part) {
              visual.part.position.set(0, visual.bedTop, -0.02);
              visual.root.add(visual.part);
            }
          }
          if (visual.part) {
            const top = visual.head.position.y - 0.05;
            visual.part.scale.y = Math.max(0.005, top - visual.bedTop);
          }
        }
      }
    }
  }

  /**
   * Table tennis (§7b): a bat floating in front of each player and a ball going between
   * them — off one bat, a bounce on the far half, onto the other bat, and back. The bat
   * swings as the ball arrives. Built when a game starts and taken down when it ends.
   */
  private rallies = new Map<string, { group: THREE.Group; ball: THREE.Mesh; bats: THREE.Group[] }>();

  private updateRallies(runtime: RuntimeSnapshot) {
    const live = new Set<string>();
    for (const game of runtime.games ?? []) {
      const [a, b] = game.players.map((id) => this.people.get(id));
      if (!a || !b || !a.visible || !b.visible) continue;
      live.add(game.amenityId);
      let rally = this.rallies.get(game.amenityId);
      if (!rally) {
        const group = new THREE.Group();
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 12, 10),
          new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffe9c2', emissiveIntensity: 0.6, flatShading: true }),
        );
        group.add(ball);
        const bats = [0, 1].map((i) => {
          const bat = this.makeBat(i ? '#1d2027' : '#c0392b');
          group.add(bat);
          return bat;
        });
        this.group.add(group);
        rally = { group, ball, bats };
        this.rallies.set(game.amenityId, rally);
      }
      // Each bat hangs in front of its player, at table height plus a little.
      const ends = [a, b].map((p, i) => {
        const other = i ? a : b;
        const dir = new THREE.Vector3().subVectors(other.position, p.position).setY(0).normalize();
        return p.position.clone().addScaledVector(dir, 0.28).setY(0.9);
      });
      const period = 0.9; // seconds per crossing
      const phase = (this.elapsed / period) % 2;
      const going = phase < 1; // a → b, then b → a
      const u = going ? phase : phase - 1;
      const from = going ? ends[0] : ends[1];
      const to = going ? ends[1] : ends[0];
      // Off the bat, down onto the far half at 65% of the way, up onto the other bat.
      const bounceAt = 0.65;
      const table = 0.78;
      const pos = new THREE.Vector3().lerpVectors(from, to, u);
      if (u < bounceAt) {
        const k = u / bounceAt;
        pos.y = THREE.MathUtils.lerp(from.y, table, k) + Math.sin(k * Math.PI) * 0.22;
      } else {
        const k = (u - bounceAt) / (1 - bounceAt);
        pos.y = THREE.MathUtils.lerp(table, to.y, k) + Math.sin(k * Math.PI) * 0.12;
      }
      rally.ball.position.copy(pos);
      rally.bats.forEach((bat, i) => {
        bat.position.copy(ends[i]);
        const facing = ends[1 - i].clone().sub(ends[i]);
        bat.rotation.y = Math.atan2(facing.x, facing.z);
        // The swing: this bat is hit when the ball arrives at it.
        const arriving = (i === 1) === going ? u : 0;
        bat.rotation.x = -0.3 + Math.sin(Math.min(1, arriving * 1.2) * Math.PI) * 0.7 * (arriving > 0.8 ? 1 : 0.2);
        bat.position.y = ends[i].y + Math.sin(this.elapsed * 3 + i) * 0.02;
      });
    }
    // The bats on the table are the ones in the players' hands.
    for (const [id, node] of this.amenityNodes) {
      const kit = node.getObjectByName('restingKit');
      if (kit) kit.visible = !live.has(id);
    }
    for (const [id, rally] of this.rallies) {
      if (live.has(id)) continue;
      this.group.remove(rally.group);
      this.rallies.delete(id);
    }
  }

  /**
   * What somebody has in their hands at a comfort: a pad on the PlayStation, a bottle at the
   * Mate fridge. People have no arms, so it floats where the hands would be — the table
   * tennis bats do the same and read fine at this distance.
   */
  private held = new Map<string, { kind: HeldKind; prop: THREE.Group }>();

  private updateHeld(runtime: RuntimeSnapshot) {
    const wanted = new Map<string, HeldKind>();
    for (const m of runtime.members) {
      if (!m.present || !m.using) continue;
      const shape = amenityDef(m.using)?.shape;
      const kind: HeldKind | null = shape === 'console' ? 'pad' : shape === 'mate' ? 'bottle' : null;
      if (kind) wanted.set(m.id, kind);
    }
    for (const [id, item] of this.held) {
      if (wanted.get(id) === item.kind) continue;
      item.prop.removeFromParent();
      this.held.delete(id);
    }
    for (const [id, kind] of wanted) {
      const node = this.people.get(id);
      if (!node) continue;
      let item = this.held.get(id);
      if (!item) {
        item = { kind, prop: kind === 'pad' ? this.makePad() : this.makeBottle() };
        // A touch over life size, or it is a speck at the room's zoom.
        item.prop.scale.setScalar(kind === 'pad' ? 1.3 : 1.45);
        node.add(item.prop);
        this.held.set(id, item);
      }
      const t = this.elapsed + (id.length % 5);
      if (kind === 'pad') {
        // Held in the lap, in front of the body, thumbs going.
        item.prop.position.set(Math.sin(t * 7) * 0.012, 0.3, SIT_FORWARD + 0.18);
        item.prop.rotation.set(-0.55 + Math.sin(t * 9) * 0.05, 0, Math.sin(t * 3) * 0.08);
      } else {
        // In the hand at the side — they face the fridge, so in front of them it would be
        // hidden behind their back — and now and then up to the mouth for a swig.
        const cycle = t % 4.5;
        const swig = cycle > 3.3 ? Math.sin(((cycle - 3.3) / 1.2) * Math.PI) : 0;
        // The hand nearer the camera, which looks from +x+z: whichever side of the body that
        // is depends on which way they are facing.
        const side = Math.cos(node.rotation.y) - Math.sin(node.rotation.y) >= 0 ? 1 : -1;
        item.prop.position.set(side * (0.25 - swig * 0.09), 0.3 + swig * 0.36, 0.03 + swig * 0.08);
        item.prop.rotation.set(-swig * 1.2, 0, -0.15 * side);
      }
    }
  }

  /** A game pad: a dark body, two grips, and the light bar in the front. */
  private makePad(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.07), mat('#23262d'));
    g.add(body);
    for (const side of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.07), mat('#23262d'));
      grip.position.set(side * 0.065, -0.005, 0.035);
      grip.rotation.y = side * 0.35;
      g.add(grip);
    }
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.012, 0.012),
      new THREE.MeshStandardMaterial({ color: '#5aa9ff', emissive: new THREE.Color('#3b82f6'), emissiveIntensity: 1.2 }),
    );
    light.position.set(0, 0.012, -0.036);
    g.add(light);
    return g;
  }

  /** A Club-Mate: an amber bottle, the yellow label, a blue cap. */
  private makeBottle(): THREE.Group {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.13, 10), mat('#7a4712'));
    glass.position.y = 0.065;
    g.add(glass);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.05, 10), mat('#f2c230'));
    label.position.y = 0.06;
    g.add(label);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.028, 0.06, 10), mat('#7a4712'));
    neck.position.y = 0.16;
    g.add(neck);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.012, 10), mat('#1f4fa0'));
    cap.position.y = 0.196;
    g.add(cap);
    return g;
  }

  /**
   * The console's screen. While somebody is playing it shows a game — racing, football,
   * basketball or a fighter, picked at random each time somebody sits down to an empty
   * console — drawn on a small canvas; nobody on it, and it goes back to the blue glow.
   */
  private screens = new Map<
    string,
    { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; playing: THREE.Material; idle: THREE.Material | THREE.Material[]; game: ConsoleGame; drawn: number }
  >();

  private updateConsoles(runtime: RuntimeSnapshot) {
    const inUse = new Set(runtime.members.filter((m) => m.present && m.using).map((m) => m.using!));
    for (const [id, node] of this.amenityNodes) {
      if (amenityDef(id)?.shape !== 'console') continue;
      const glass = node.getObjectByName('consoleGlass') as THREE.Mesh | undefined;
      if (!glass) continue;
      let screen = this.screens.get(id);
      if (!inUse.has(id)) {
        if (screen) {
          glass.material = screen.idle;
          screen.tex.dispose();
          screen.playing.dispose();
          this.screens.delete(id);
        }
        continue;
      }
      if (!screen) {
        const canvas = document.createElement('canvas');
        canvas.width = 192;
        canvas.height = 108;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const playing = new THREE.MeshBasicMaterial({ map: tex });
        const game = CONSOLE_GAMES[Math.floor(Math.random() * CONSOLE_GAMES.length)];
        screen = { canvas, tex, playing, idle: glass.material, game, drawn: -1 };
        glass.material = playing;
        this.screens.set(id, screen);
      }
      // Twenty frames a second is plenty for a picture this size.
      if (this.elapsed - screen.drawn < 0.05) continue;
      screen.drawn = this.elapsed;
      const ctx = screen.canvas.getContext('2d');
      if (!ctx) continue;
      drawConsoleGame(ctx, screen.game, this.elapsed);
      screen.tex.needsUpdate = true;
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

type HeldKind = 'pad' | 'bottle';
type ConsoleGame = 'racing' | 'football' | 'basketball' | 'fighting';
const CONSOLE_GAMES: ConsoleGame[] = ['racing', 'football', 'basketball', 'fighting'];

/** One frame of whatever is on the console, on a 192×108 canvas. */
function drawConsoleGame(ctx: CanvasRenderingContext2D, game: ConsoleGame, t: number) {
  const W = 192;
  const H = 108;
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  const dot = (x: number, y: number, r: number, c: string) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  ctx.font = 'bold 9px monospace';
  if (game === 'racing') {
    // Sky, grass, a road running to the horizon with the dashes rushing at you.
    const sky = ctx.createLinearGradient(0, 0, 0, 44);
    sky.addColorStop(0, '#1b3b7a');
    sky.addColorStop(1, '#f59e6b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, 44);
    rect(0, 44, W, H - 44, '#2f7d3a');
    ctx.fillStyle = '#44464d';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 8, 44);
    ctx.lineTo(W / 2 + 8, 44);
    ctx.lineTo(W + 30, H);
    ctx.lineTo(-30, H);
    ctx.fill();
    for (let i = 0; i < 6; i += 1) {
      const k = ((i + (t * 2.2) % 1) / 6) ** 2;
      const y = 44 + k * (H - 44);
      rect(W / 2 - 1 - k * 2, y, 2 + k * 4, 2 + k * 8, '#f4f1ea');
    }
    const sway = Math.sin(t * 1.7) * 26;
    rect(W / 2 - 16 + sway, 82, 32, 14, '#d23b3b');
    rect(W / 2 - 12 + sway, 78, 24, 6, '#8e2222');
    const rival = Math.sin(t * 1.1 + 2) * 14;
    rect(W / 2 - 6 + rival, 56, 12, 6, '#3b6fd2');
    ctx.fillStyle = '#fff';
    ctx.fillText(`LAP 2/3  ${String(Math.floor(t * 7) % 60).padStart(2, '0')}"`, 6, 12);
  } else if (game === 'football') {
    // A pitch in stripes, the lines, two sides chasing a ball.
    for (let i = 0; i < 8; i += 1) rect(i * 24, 0, 24, H, i % 2 ? '#2e8b3e' : '#33994a');
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(6, 8, W - 12, H - 16);
    ctx.beginPath();
    ctx.moveTo(W / 2, 8);
    ctx.lineTo(W / 2, H - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(6, H / 2 - 18, 18, 36);
    ctx.strokeRect(W - 24, H / 2 - 18, 18, 36);
    const bx = W / 2 + Math.sin(t * 0.9) * 70;
    const by = H / 2 + Math.sin(t * 1.6) * 30;
    for (let i = 0; i < 3; i += 1) {
      dot(bx - 14 - i * 16 + Math.sin(t * 3 + i) * 4, by + (i - 1) * 16, 4, '#e53935');
      dot(bx + 14 + i * 16 + Math.cos(t * 3 + i) * 4, by - (i - 1) * 14, 4, '#1e63d6');
    }
    dot(bx, by, 2.6, '#ffffff');
    rect(W / 2 - 22, 0, 44, 11, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = '#fff';
    ctx.fillText('1 - 0', W / 2 - 13, 9);
  } else if (game === 'basketball') {
    // A wooden court, the key, a hoop, and a shot that goes in every time.
    rect(0, 0, W, H, '#c8894a');
    for (let i = 0; i < 12; i += 1) rect(0, i * 9, W, 1, 'rgba(90,50,20,0.25)');
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(W - 60, 30, 60, 48);
    ctx.beginPath();
    ctx.arc(W - 60, 54, 24, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.stroke();
    rect(W - 16, 26, 3, 30, '#e9edf2');
    ctx.strokeStyle = '#e8572a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(W - 24, 42, 8, 2.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    const k = (t * 0.6) % 1;
    const sx = 40 + k * (W - 64 - 40);
    // From the shooter's hands at y 70 to the rim at y 42, over an arc.
    const sy = 70 - Math.sin(k * Math.PI) * 50 - k * 28;
    dot(sx, sy, 5, '#e8572a');
    dot(36 + Math.sin(t * 2) * 3, 78, 6, '#7e57c2');
    dot(W - 70 + Math.cos(t * 2) * 5, 70, 6, '#2e7d32');
    rect(4, 3, 52, 11, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = '#fff';
    ctx.fillText(`HOME ${48 + Math.floor(t / 1.7) * 2 % 40}`, 7, 11);
  } else {
    // A sunset stage, two fighters trading blows, and the health bars that say who is winning.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#3b1d5e');
    sky.addColorStop(0.6, '#e2604a');
    sky.addColorStop(1, '#f2b25c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    rect(0, 88, W, 20, '#3a2a2a');
    const gap = 30 + Math.sin(t * 1.3) * 16;
    const mid = W / 2 + Math.sin(t * 0.7) * 20;
    const fighter = (x: number, colour: string, facing: number, punch: number) => {
      rect(x - 7, 58, 14, 24, colour);
      dot(x, 50, 7, '#f0c8a0');
      rect(x - 6, 82, 5, 8, '#222');
      rect(x + 1, 82, 5, 8, '#222');
      rect(facing > 0 ? x + 6 : x - 6 - 8 - punch, 62, 8 + punch, 4, '#f0c8a0');
    };
    fighter(mid - gap, '#1e63d6', 1, Math.max(0, Math.sin(t * 6)) * 12);
    fighter(mid + gap, '#d23b3b', -1, Math.max(0, Math.sin(t * 6 + 2)) * 12);
    const hpA = 0.35 + 0.6 * ((Math.sin(t * 0.3) + 1) / 2);
    const hpB = 0.3 + 0.6 * ((Math.cos(t * 0.37) + 1) / 2);
    rect(6, 6, 76, 7, '#4a1010');
    rect(6, 6, 76 * hpA, 7, '#f2c230');
    rect(W - 82, 6, 76, 7, '#4a1010');
    rect(W - 82 + 76 * (1 - hpB), 6, 76 * hpB, 7, '#f2c230');
    ctx.fillStyle = '#fff';
    ctx.fillText('KO?', W / 2 - 9, 13);
  }
}

