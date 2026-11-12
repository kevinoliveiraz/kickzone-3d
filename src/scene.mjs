import {
  BoxGeometry, CanvasTexture, DirectionalLight, Group, HemisphereLight, MathUtils,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, NeutralToneMapping,
  OrthographicCamera, PlaneGeometry, PMREMGenerator, Scene, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { collection } from './collection.mjs';
import { loadScan } from './scan-model.mjs';

export const featuredIndex = 0;
const cameraRise = 1.68;
const cameraDistance = 14;
export function frameLayout(width, height, mobile) {
  const ppu = Math.min(width / (mobile ? 3.83 : 4.95), height / (mobile ? 3.08 : 2.54));
  return { width, height, ppu, mobile };
}

export function configureRenderer(canvas) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
  renderer.setClearColor(0, 0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  return renderer;
}

export function lightScene(scene, renderer) {
  const studio = new RoomEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio, .048).texture;
  scene.environmentIntensity = .69;
  studio.dispose();
  pmrem.dispose();

  const ambient = new HemisphereLight(0xe4eaff, 0x816657, 1.05);
  const key = new DirectionalLight(0xf6f4ff, 1.92);
  const rim = new DirectionalLight(0xffaf69, 1.56);
  const side = new DirectionalLight(0xd7e8ff, .85);
  key.position.set(-3.5, 7, 6);
  rim.position.set(2, 4, -6);
  side.position.set(5, 1.7, 5);
  scene.add(ambient, key, rim, side);
}

export function contactTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const paint = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
  paint.addColorStop(0, 'rgba(12,5,1,.88)');
  paint.addColorStop(.56, 'rgba(12,5,1,.42)');
  paint.addColorStop(1, 'rgba(12,5,1,0)');
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 128, 128);
  return new CanvasTexture(canvas);
}

function makeStage() {
  const base = new BoxGeometry(3.63, .052, 1.12);
  const top = new BoxGeometry(3.6, .010, 1.10);
  const strip = new BoxGeometry(3.54, .012, .015);
  const edge = new BoxGeometry(3.6, .006, .018);
  const stone = new MeshStandardMaterial({ color: 0x3e312d, metalness: .31, roughness: .41 });
  const surface = new MeshStandardMaterial({ color: 0x584b45, roughness: .41, metalness: .26 });
  const brass = new MeshStandardMaterial({ color: 0x8d6856, metalness: .43, roughness: .42 });
  const shadowGeometry = new PlaneGeometry(3.32, 1.38);
  const shadowMaterial = new MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false });
  return () => {
    const shelf = new Group();
    const block = new Mesh(base, stone);
    const plate = new Mesh(top, surface);
    const lip = new Mesh(edge, brass);
    const light = new Mesh(strip, new MeshStandardMaterial({
      color: 0xf66e36, emissive: 0xff5f21, emissiveIntensity: .35, roughness: .45,
    }));
    block.position.y = -.029;
    plate.position.y = -.002;
    lip.position.set(0, -.009, .566);
    light.position.set(0, -.044, .567);
    const shadow = new Mesh(shadowGeometry, shadowMaterial);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, .009, .01);
    shelf.add(block, plate, lip, light, shadow);
    return { shelf, light };
  };
}

export function makeVitrine(canvas, reduced, onStatus) {
  const renderer = configureRenderer(canvas);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 70);
  camera.position.set(0, cameraRise, cameraDistance);
  camera.lookAt(0, 0, 0);
  lightScene(scene, renderer);

  const makeShelf = makeStage();
  const exhibits = collection.map(() => {
    const shoe = new Group();
    shoe.rotation.order = 'YXZ';
    const { shelf, light } = makeShelf();
    scene.add(shelf, shoe);
    return { shoe, shelf, light, target: null, state: 'idle' };
  });

  let frame = 0;
  let previousTime = 0;
  let lastLayout;
  let lastWidth = 0;
  let lastHeight = 0;
  let initialized = false;
  let paused = false;
  let active = featuredIndex;
  let pitch = 0;
  let yaw = -.17;
  let lastStatus = '';

  function prepare(index) {
    const exhibit = exhibits[index];
    if (exhibit.state !== 'idle') return;
    exhibit.state = 'loading';
    loadScan(collection[index]).then(model => {
      exhibit.shoe.add(model);
      exhibit.state = 'ready';
    }, error => {
      console.warn('Não foi possível abrir o scan', collection[index].name, error);
      exhibit.state = 'error';
    }).finally(invalidate);
  }

  function updateTargets() {
    const { width, ppu, mobile } = lastLayout;
    exhibits.forEach((exhibit, index) => {
      const offset = (index - active + collection.length + 2) % collection.length - 2;
      const side = offset !== 0;
      const shelfScale = side ? .71 : 1;
      const shelfY = (mobile ? -.45 : -.798) - (side ? .065 : 0);
      exhibit.target = {
        x: offset * width / ppu * (mobile ? .95 : .592),
        y: shelfY + .788 * shelfScale + .018,
        shelfY, scale: shelfScale,
        pitch: side ? .027 : pitch,
        yaw: side ? (offset < 0 ? -.25 : .28) : yaw,
        light: side ? .38 : 2.3,
        visible: mobile ? !side : Math.abs(offset) <= 1,
      };
    });
  }

  function render(time) {
    frame = 0;
    if (paused) return;
    const dt = previousTime ? Math.min((time - previousTime) / 1000, .5) : 1 / 45;
    previousTime = time;
    let unsettled = false;
    const immediate = !initialized || reduced.matches;
    const approach = (current, target, speed = 11) => {
      if (immediate || Math.abs(current - target) < .0025) return target;
      unsettled = true;
      return MathUtils.damp(current, target, speed, dt);
    };
    exhibits.forEach(({ shoe, shelf, light, target }) => {
      const { x, y, shelfY, scale, pitch, yaw, light: glow, visible } = target;
      const size = approach(shoe.scale.x, visible ? scale : .001, 13);
      shoe.scale.setScalar(size);
      shoe.visible = shelf.visible = size > .045;
      shoe.position.x = approach(shoe.position.x, x);
      shoe.position.y = approach(shoe.position.y, y);
      shoe.rotation.x = approach(shoe.rotation.x, pitch, 15);
      const yawDelta = Math.atan2(Math.sin(yaw - shoe.rotation.y), Math.cos(yaw - shoe.rotation.y));
      shoe.rotation.y = approach(shoe.rotation.y, shoe.rotation.y + yawDelta, 15);
      shelf.scale.setScalar(size);
      shelf.position.set(shoe.position.x, approach(shelf.position.y, shelfY, 13), 0);
      light.material.emissiveIntensity = approach(light.material.emissiveIntensity, glow, 14);
    });
    renderer.render(scene, camera);
    const status = exhibits[active].state;
    if (status !== lastStatus) {
      lastStatus = status;
      onStatus(status);
    }
    initialized = true;
    if (unsettled) invalidate();
    else previousTime = 0;
  }

  function invalidate() {
    if (!paused && !frame) frame = requestAnimationFrame(render);
  }

  return {
    layout(layout, selected) {
      paused = false;
      lastLayout = layout;
      if (active !== selected) lastStatus = '';
      active = selected;
      const { width, height, ppu } = layout;
      if (width !== lastWidth || height !== lastHeight) {
        renderer.setSize(width, height, false);
        lastWidth = width;
        lastHeight = height;
      }
      camera.left = -width / (2 * ppu);
      camera.right = -camera.left;
      camera.top = height / (2 * ppu);
      camera.bottom = -camera.top;
      camera.updateProjectionMatrix();
      prepare(active);
      if (!layout.mobile) {
        prepare((active + 1) % collection.length);
        prepare((active + collection.length - 1) % collection.length);
      }
      updateTargets();
      invalidate();
    },
    pause() {
      paused = true;
      previousTime = 0;
      lastStatus = '';
    },
    rotate(nextPitch, nextYaw) {
      pitch = nextPitch;
      yaw = nextYaw;
      updateTargets();
      invalidate();
    },
  };
}

