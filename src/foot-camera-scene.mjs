import { Box3, DirectionalLight, Group, HemisphereLight, Matrix4, OrthographicCamera, Quaternion, Scene, Vector3 } from 'three';
import { configureRenderer } from './scene.mjs';

export function makeFootCameraScene(canvas) {
  const renderer = configureRenderer(canvas);
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, .1, 5000);
  camera.position.z = 2500;
  const shoe = new Group();
  const key = new DirectionalLight(0xfff3e9, 2.5);
  key.position.set(-1, 2, 4);
  scene.add(shoe, key, new HemisphereLight(0xf4f0ed, 0xa59a94, 1.65));
  const forward = new Vector3(), up = new Vector3(), across = new Vector3();
  const position = new Vector3(), rotation = new Quaternion(), basis = new Matrix4();
  let pair, lastSide, width, height, lastDraw, scale;

  function fitModel(side) {
    lastSide = side;
    shoe.clear();
    if (!pair) return;
    const index = side === 'left' ? 0 : 1;
    const oriented = new Group();
    oriented.rotation.y = pair.yaw;
    oriented.add(pair.models[pair.models.length === 1 ? 0 : index].clone(true));
    const bounds = new Box3().setFromObject(oriented, true);
    const center = bounds.getCenter(new Vector3());
    const length = bounds.max.z - bounds.min.z;
    if (!Number.isFinite(length) || length <= .001) throw new Error('Scan sem comprimento útil.');
    oriented.position.set(-center.x, -bounds.min.y - length * .05, -center.z);
    const normalized = new Group();
    normalized.add(oriented);
    normalized.scale.setScalar(1 / length);
    if (pair.models.length === 1 && index === 0) normalized.scale.x *= -1;
    shoe.add(normalized);
  }

  return {
    setProduct(product) {
      pair = product;
      fitModel(lastSide ?? 'right');
    },
    resize(w, h) {
      if (w === width && h === height) return;
      width = w;
      height = h;
      renderer.setSize(w, h, false);
      camera.left = -w / 2;
      camera.right = w / 2;
      camera.top = h / 2;
      camera.bottom = -h / 2;
      camera.updateProjectionMatrix();
      lastDraw = undefined;
    },
    draw(target, time) {
      if (!pair || !target) {
        if (lastDraw !== undefined) renderer.clear();
        lastDraw = undefined;
        return;
      }
      const { heel, toe, side, depth, ankle } = target;
      if (side !== lastSide) {
        fitModel(side);
        lastDraw = undefined;
      }
      const dx = toe.x - heel.x, dy = heel.y - toe.y;
      const screenLength = Math.hypot(dx, dy);
      forward.set(dx, dy, depth * screenLength);
      const fullLength = forward.length() * 1.14;
      forward.normalize();
      up.set(0, 0, 1);
      if (ankle) {
        up.set((ankle.x - heel.x) / screenLength, (heel.y - ankle.y) / screenLength, ankle.depth);
      }
      up.addScaledVector(forward, -up.dot(forward));
      if (up.lengthSq() < .01) {
        up.set(0, 0, 1);
        up.addScaledVector(forward, -up.dot(forward));
      }
      up.normalize();
      across.crossVectors(up, forward).normalize();
      rotation.setFromRotationMatrix(basis.makeBasis(across, up, forward));
      position.set(heel.x + dx * .52 - width / 2, height / 2 - (heel.y - dy * .52), 0);
      const amount = lastDraw === undefined ? 1 : 1 - Math.exp(-Math.min(time - lastDraw, 100) / 48);
      shoe.position.lerp(position, amount);
      shoe.quaternion.slerp(rotation, amount);
      scale = amount === 1 ? fullLength : scale + (fullLength - scale) * amount;
      shoe.scale.setScalar(scale);
      renderer.render(scene, camera);
      lastDraw = time;
    },
    dispose() {
      renderer.clear();
      renderer.dispose();
    },
  };
}
