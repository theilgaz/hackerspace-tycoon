import * as THREE from 'three';

/** Orthographic isometric rig with pan/zoom. No character control (CLAUDE.md §11). */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;

  private frustum = 7.2;
  private target = new THREE.Vector3(0, 0, 0);
  private dragging = false;
  private last = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
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
    this.bindControls(canvas);
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight('#d6e8ff', '#3a2f22', 1.15));

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
      const dx = (e.clientX - this.last.x) / window.innerHeight;
      const dy = (e.clientY - this.last.y) / window.innerHeight;
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
        this.frustum = THREE.MathUtils.clamp(this.frustum + e.deltaY * 0.012, 5, 22);
        this.resize();
      },
      { passive: false },
    );
  }

  private updateCamera() {
    this.camera.position.set(this.target.x + 18, 18, this.target.z + 18);
    this.camera.lookAt(this.target);
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    this.camera.left = -this.frustum * aspect;
    this.camera.right = this.frustum * aspect;
    this.camera.top = this.frustum;
    this.camera.bottom = -this.frustum;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.updateCamera();
  }

  /** World position → CSS pixel position, for HTML labels over the scene. */
  project(world: THREE.Vector3): { x: number; y: number } {
    const v = world.clone().project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
