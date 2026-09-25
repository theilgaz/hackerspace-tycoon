import * as THREE from 'three';

import { GRID } from '@/machines/layout';

/**
 * How far back to stand so the whole floor is in shot. The room is drawn isometrically, so
 * its on-screen size grows with `width + height` rather than with either alone.
 */
function fitFrustum(aspect: number): number {
  // Calibrated off the garage: a 6x8 floor (span 7) frames correctly at 7.2, so the whole
  // room fits at about span x 1.05. Narrow windows need more still, since the frustum is
  // expressed vertically and the room is wider than it is tall on screen.
  const span = (GRID.width + GRID.height) * 0.5;
  const widen = aspect < 1.5 ? 1.5 / Math.max(aspect, 0.8) : 1;
  return THREE.MathUtils.clamp(span * 1.05 * widen, 5, 26);
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Orthographic isometric rig with pan/zoom. No character control (CLAUDE.md §11). */
/** How much light is left with everybody gone home: enough to see the room by. */
const NIGHT_LIGHT = 0.16;

export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;

  private frustum = 7.2;
  /** Whether the player has zoomed themselves; after that the camera stops second-guessing. */
  private zoomTouched = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private target = new THREE.Vector3(0, 0, 0);
  private dragging = false;
  private last = { x: 0, y: 0 };
  private readonly canvas: HTMLCanvasElement;
  /** Where the canvas sits on the page, re-read on every resize — it is fixed, so it only moves then. */
  private rect = { left: 0, top: 0, width: 1, height: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.background = new THREE.Color('#161a20');
    this.scene.fog = new THREE.Fog('#161a20', 34, 70);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camera.position.set(18, 18, 18);
    this.camera.lookAt(this.target);

    this.addLights();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // Inside an iframe (itch.io) the page can change size without the window saying so —
    // going fullscreen, the embed settling after load — so watch the canvas itself too.
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bindControls(canvas);
  }

  /** The room's lights and what each gives at full brightness, so they can be dimmed. */
  private lights: { light: THREE.Light; full: number }[] = [];
  /** 1 with the lights on, down to `NIGHT_LIGHT` with everybody gone home. */
  private lit = 1;

  private addLights() {
    const sky = new THREE.HemisphereLight('#d6e8ff', '#3a2f22', 1.15);
    this.scene.add(sky);

    const key = new THREE.DirectionalLight('#fff4e2', 1.7);
    key.position.set(12, 20, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 16;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 60;
    key.shadow.bias = -0.0009;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight('#8fb6ff', 0.45);
    fill.position.set(-10, 8, -6);
    this.scene.add(fill);
    this.lights = [sky, key, fill].map((light) => ({ light, full: light.intensity }));
  }

  /**
   * The lights go off when the last person leaves and come back on with the first one in
   * the morning. Eased over a second or so, like a room whose strip lights take a moment.
   * What glows on its own — a screen, the Mate sign, a status lamp — keeps glowing.
   */
  setLit(on: boolean, dt: number) {
    const target = on ? 1 : NIGHT_LIGHT;
    if (Math.abs(this.lit - target) < 0.001) return;
    this.lit += (target - this.lit) * Math.min(1, dt * 3);
    for (const { light, full } of this.lights) light.intensity = full * this.lit;
  }

  private bindControls(canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', (e) => {
      this.dragging = false;
      canvas.releasePointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const height = this.canvas.clientHeight || window.innerHeight;
      const dx = (e.clientX - this.last.x) / height;
      const dy = (e.clientY - this.last.y) / height;
      this.last = { x: e.clientX, y: e.clientY };
      // Screen-space drag mapped onto the ground plane of an iso view.
      const scale = this.frustum * 2;
      this.target.x -= (dx + dy) * scale * 0.7;
      this.target.z -= (dy - dx) * scale * 0.7;
      this.updateCamera();
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomTouched = true;
        this.frustum = THREE.MathUtils.clamp(this.frustum + e.deltaY * 0.012, 5, 26);
        this.resize();
      },
      { passive: false },
    );
  }

  private updateCamera() {
    this.camera.position.set(this.target.x + 18, 18, this.target.z + 18);
    this.camera.lookAt(this.target);
  }

  /**
   * **Everything is measured off the canvas, never the window.** The two agree on a plain
   * page and nowhere else: on itch.io the game is in an iframe, and a canvas that is not
   * the window's size put the room in one place and its hover and name labels in another.
   */
  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    if (!width || !height) return;
    const r = this.canvas.getBoundingClientRect();
    this.rect = { left: r.left, top: r.top, width: r.width || width, height: r.height || height };
    const aspect = width / height;
    // A bigger lease needs a wider shot. Only until the player touches the wheel, though —
    // after that the framing is theirs and the camera stops having opinions about it.
    if (!this.zoomTouched) this.frustum = fitFrustum(aspect);
    this.camera.left = -this.frustum * aspect;
    this.camera.right = this.frustum * aspect;
    this.camera.top = this.frustum;
    this.camera.bottom = -this.frustum;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.updateCamera();
  }

  /** Which of `objects` the cursor is over, if any. Returns the ancestor's stationId. */
  /** A pointer position in client pixels → normalised device coordinates on the canvas. */
  private aim(clientX: number, clientY: number) {
    const r = this.rect;
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  pick(clientX: number, clientY: number, objects: THREE.Object3D[]): string | null {
    this.aim(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(objects, true)[0];
    if (!hit) return null;
    let node: THREE.Object3D | null = hit.object;
    while (node && !node.userData.pickId) node = node.parent;
    return (node?.userData.pickId as string) ?? null;
  }

  /**
   * Where on the floor the cursor is, as a grid tile. Used to drop a comfort somewhere:
   * the floor is a few hundred separate meshes, so it is raycast against the ground plane
   * rather than against the tiles themselves.
   */
  pickTile(clientX: number, clientY: number): { x: number; y: number } | null {
    this.aim(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(GROUND, point)) return null;
    // The inverse of `toWorld`: the grid is centred on the origin.
    const x = Math.round(point.x + (GRID.width - 1) / 2);
    const y = Math.round(point.z + (GRID.height - 1) / 2);
    if (x < 0 || y < 0 || x >= GRID.width || y >= GRID.height) return null;
    return { x, y };
  }

  /** World position → CSS pixel position, for HTML labels over the scene. */
  project(world: THREE.Vector3): { x: number; y: number } {
    const v = world.clone().project(this.camera);
    const r = this.rect;
    return {
      x: r.left + (v.x * 0.5 + 0.5) * r.width,
      y: r.top + (-v.y * 0.5 + 0.5) * r.height,
    };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
