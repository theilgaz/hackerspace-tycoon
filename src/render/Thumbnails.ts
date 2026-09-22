import * as THREE from 'three';

/**
 * Pictures for the Build panel (§4d), rendered from the same models that stand in the room.
 *
 * A card with a name and an icon is a spreadsheet row; a card with the thing on it is a
 * shop. Rendering the real model rather than drawing a separate icon set means the picture
 * cannot drift from what turns up when you pay for it.
 *
 * One small offscreen renderer, lit and angled like the room's own camera, and every
 * picture is drawn once and cached as a data URL — the panel re-renders at 5 Hz and must
 * never touch WebGL to do it.
 */
export class Thumbnails {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private cache = new Map<string, string | null>();
  private readonly size = 168;

  constructor(private readonly build: (key: string) => THREE.Object3D | null) {
    this.scene.add(new THREE.HemisphereLight('#d6e8ff', '#3a2f22', 1.25));
    const key = new THREE.DirectionalLight('#fff4e2', 1.8);
    key.position.set(6, 10, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#8fb6ff', 0.5);
    fill.position.set(-6, 4, -3);
    this.scene.add(fill);
  }

  get(key: string): string | null {
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    const url = this.draw(key);
    this.cache.set(key, url);
    return url;
  }

  private draw(key: string): string | null {
    const model = this.build(key);
    if (!model) return null;
    try {
      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(1);
        this.renderer.setSize(this.size, this.size, false);
        this.renderer.setClearColor(0x000000, 0);
      }
      this.scene.add(model);
      // Frame it: the same iso angle as the room, fitted to the model's own bounds so a
      // lava lamp and a ten-seat table both fill their card.
      const box = new THREE.Box3().setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const r = Math.max(0.35, sphere.radius) * 1.08;
      this.camera.left = -r;
      this.camera.right = r;
      this.camera.top = r;
      this.camera.bottom = -r;
      this.camera.position.set(centre.x + 10, centre.y + 10, centre.z + 10);
      this.camera.lookAt(centre);
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL('image/png');
      this.scene.remove(model);
      model.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        child.geometry.dispose();
        for (const material of [child.material].flat()) material.dispose();
      });
      return url;
    } catch {
      // No WebGL (a headless check, a locked-down browser): the card falls back to its icon.
      return null;
    }
  }
}
