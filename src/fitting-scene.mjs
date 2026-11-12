import {
  Box3, Color, CylinderGeometry, Group, MathUtils, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  OrthographicCamera, PlaneGeometry, RingGeometry, Scene, Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { configureRenderer, contactTexture, lightScene } from './scene.mjs';
import { scanBytes } from './scan-model.mjs';
import { readFootwear } from './footwear.mjs';

let characterKit;

function loadCharacterKit() {
  if (!characterKit) characterKit = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'assets/character-kit.js';
    script.onerror = () => {
      script.remove();
      reject(new Error('Arquivo do avatar indisponível.'));
    };
    script.onload = () => {
      script.remove();
      const data = window.kickzoneCharacterKit;
      delete window.kickzoneCharacterKit;
      if (!data) {
        reject(new Error('O arquivo do avatar está vazio.'));
        return;
      }
      new GLTFLoader().parseAsync(scanBytes(data), '').then(({ scene }) => resolve(scene), reject);
    };
    document.head.append(script);
  }).catch(error => {
    characterKit = undefined;
    throw error;
  });
  return characterKit;
}

const hairNames = new Set(['Hair', 'Hair_Blond', 'Hair_Brown', 'Red_Dark', 'Red']);

function shoeOnFoot(model, foot, yaw, mirror) {
  const oriented = new Group();
  oriented.rotation.y = yaw;
  oriented.add(model.clone(true));
  const bounds = new Box3().setFromObject(oriented, true);
  const size = bounds.getSize(new Vector3());
  if (bounds.isEmpty() || size.z < .001) throw new Error('Scan sem comprimento útil.');
  const center = bounds.getCenter(new Vector3());
  const lengthScale = foot.length * 1.06 / size.z;
  const widthScale = Math.min(lengthScale, foot.width * 1.08 / size.x);
  const shoe = new Group();
  oriented.position.set(-center.x, -bounds.min.y, -center.z);
  shoe.scale.set(mirror ? -widthScale : widthScale, lengthScale, lengthScale);
  shoe.position.set(foot.center[0], .008, foot.center[2]);
  shoe.add(oriented);
  return shoe;
}

function makePlatform(scene) {
  const pedestal = new Mesh(
    new CylinderGeometry(.82, .85, .11, 80),
    new MeshStandardMaterial({ color: 0x4a3c33, roughness: .62, metalness: .35 }),
  );
  pedestal.position.y = -.056;
  const rim = new Mesh(new RingGeometry(.795, .802, 80), new MeshBasicMaterial({ color: 0xe1885b }));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = .001;
  const shadow = new Mesh(new PlaneGeometry(1.16, .8), new MeshBasicMaterial({
    map: contactTexture(), transparent: true, depthWrite: false, opacity: .68,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .003;
  scene.add(pedestal, rim, shadow);
}

export async function makeFittingScene(canvas, reducedMotion) {
  const kit = await loadCharacterKit();
  const renderer = configureRenderer(canvas);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, .01, 30);
  const avatar = new Group();
  const clothing = new Group();
  const shoes = new Group();
  avatar.add(clothing, shoes);
  scene.add(avatar);
  lightScene(scene, renderer);
  makePlatform(scene);

  const materials = [];
  const sockGeometry = new CylinderGeometry(.041, .045, 1, 14);
  const sockMaterial = new MeshStandardMaterial({ color: 0x414044, roughness: .9 });
  let feet = [];
  let footwear;
  let ticket = 0;
  let rotation = .32;
  let zoom = 0;
  let targetZoom = 0;
  let frame;
  let lastTime;
  let enabled = false;
  let width = 0;
  let height = 0;

  function draw(time) {
    frame = undefined;
    if (!enabled || !width || !height) return;
    const dt = lastTime ? Math.min((time - lastTime) / 1000, .08) : 1 / 60;
    lastTime = time;
    const damp = (a, b) => reducedMotion.matches || Math.abs(a - b) < .003 ? b : MathUtils.damp(a, b, 13, dt);
    avatar.rotation.y = damp(avatar.rotation.y, rotation);
    zoom = damp(zoom, targetZoom);
    const aspect = width / height;
    const viewHeight = MathUtils.lerp(Math.max(2.46, 1.5 / aspect), Math.max(.70, .83 / aspect), zoom);
    const target = MathUtils.lerp(.91, .18, zoom);
    camera.left = -viewHeight * aspect / 2;
    camera.right = -camera.left;
    camera.top = viewHeight / 2;
    camera.bottom = -camera.top;
    camera.position.set(0, target + MathUtils.lerp(.55, 1.65, zoom), 5);
    camera.lookAt(0, target, 0);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    if (avatar.rotation.y !== rotation || zoom !== targetZoom) invalidate();
    else lastTime = undefined;
  }

  function invalidate() {
    if (enabled && frame === undefined) frame = requestAnimationFrame(draw);
  }

  function fitShoes() {
    shoes.clear();
    if (footwear) {
      const shoeMeshes = feet.map((foot, index) => shoeOnFoot(
        footwear.models[footwear.models.length === 1 ? 0 : index], foot, footwear.yaw,
        footwear.models.length === 1 && index === 0,
      ));
      shoes.add(...shoeMeshes);
    }
    invalidate();
  }

  function addPart(part, skin, hair) {
    const copy = part.clone(true);
    copy.traverse(mesh => {
      if (!mesh.isMesh) return;
      const material = mesh.material.clone();
      if (material.name === 'Skin') material.color.copy(skin);
      if (material.name === 'Skin_Darker') material.color.copy(skin).multiplyScalar(.77);
      if (part.name.endsWith('_head') && hairNames.has(material.name)) material.color.copy(hair);
      materials.push(material);
      mesh.material = material;
    });
    clothing.add(copy);
    return copy;
  }

  return {
    resize(nextWidth, nextHeight) {
      if (!nextWidth || !nextHeight) return;
      width = nextWidth;
      height = nextHeight;
      renderer.setSize(width, height, false);
      invalidate();
    },
    setCharacter(settings) {
      clothing.clear();
      materials.splice(0).forEach(material => material.dispose());
      const outfit = kit.getObjectByName(settings.look);
      const head = kit.getObjectByName(settings.face);
      const skin = new Color(settings.skin);
      const hair = new Color(settings.hair);
      const legs = addPart(outfit.getObjectByName(settings.look + '_legs'), skin, hair);
      addPart(outfit.getObjectByName(settings.look + '_body'), skin, hair);
      const face = addPart(head.getObjectByName(settings.face + '_head'), skin, hair);
      face.position.fromArray(outfit.userData.neck).sub(new Vector3().fromArray(head.userData.neck));
      feet = outfit.userData.feet;
      const cuff = new Box3().setFromObject(legs, true).min.y;
      for (const foot of feet) {
        const sock = new Mesh(sockGeometry, sockMaterial);
        const sockHeight = Math.max(.065, cuff + .018);
        sock.scale.y = sockHeight;
        sock.position.set(foot.center[0], .026 + sockHeight / 2, foot.center[2] - foot.length * .24);
        clothing.add(sock);
      }
      avatar.scale.x = { slim: .9, regular: 1, broad: 1.12 }[settings.build];
      fitShoes();
    },
    async setProduct(product) {
      const request = ++ticket;
      footwear = undefined;
      fitShoes();
      const model = await readFootwear(product);
      if (request === ticket) {
        footwear = model;
        fitShoes();
      }
    },
    turn(delta) {
      rotation += delta;
      invalidate();
    },
    zoom(inOnFeet) {
      targetZoom = inOnFeet ? 1 : 0;
      invalidate();
    },
    show(visible) {
      enabled = visible;
      if (!visible) {
        cancelAnimationFrame(frame);
        frame = lastTime = undefined;
      }
      invalidate();
    },
  };
}
