import { Box3, Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const scans = new Map();

export function scanBytes(encoded) {
  const data = atob(encoded);
  const bytes = new Uint8Array(data.length);
  for (let index = 0; index < data.length; index++) bytes[index] = data.charCodeAt(index);
  return bytes.buffer;
}

export async function orientScan(bytes, rotation = [0, 0, 0]) {
  const { scene } = await loader.parseAsync(bytes, '');
  const excluded = [];
  scene.traverse(object => {
    if (object.isCamera || object.isLight) excluded.push(object);
  });
  excluded.forEach(object => object.removeFromParent());

  const rotated = new Group();
  rotated.rotation.set(...rotation);
  rotated.add(scene);
  const bounds = new Box3().setFromObject(rotated, true);
  const dimensions = bounds.getSize(new Vector3());
  if (bounds.isEmpty() || !dimensions.x || !dimensions.y) throw new Error('Scan sem malha visível');
  const center = bounds.getCenter(new Vector3());
  const scale = Math.min(3.25 / dimensions.x, 1.83 / dimensions.y);
  rotated.scale.setScalar(scale);
  rotated.position.set(-center.x * scale, -bounds.min.y * scale - .783, -center.z * scale);
  return rotated;
}

function readScan(product) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'assets/scans/' + product.id + '.js';
    script.onload = () => {
      script.remove();
      const encoded = window.kickzoneScans?.[product.id];
      if (!encoded) {
        reject(new Error('Arquivo vazio: ' + product.id));
        return;
      }
      delete window.kickzoneScans[product.id];
      orientScan(scanBytes(encoded), product.rotation).then(resolve, reject);
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('Arquivo indisponível: ' + product.id));
    };
    document.head.append(script);
  });
}

export async function loadScan(product) {
  if (!scans.has(product.id)) {
    scans.set(product.id, readScan(product).catch(error => {
      scans.delete(product.id);
      throw error;
    }));
  }
  return (await scans.get(product.id)).clone(true);
}
