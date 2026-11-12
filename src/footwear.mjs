import { Float32BufferAttribute, Group, Mesh, Vector3 } from 'three';
import { loadScan } from './scan-model.mjs';

const mirroredToe = new Set(['chuck-taylor', 'air-presto']);
const footwear = new Map();

// The React Presto file has two shoes, separated across the scan's Z axis.
function splitReactPair(scan) {
  const halves = [new Group(), new Group()];
  const point = new Vector3();
  scan.updateMatrixWorld(true);
  scan.traverse(mesh => {
    if (!mesh.isMesh) return;
    const { geometry } = mesh;
    const positions = geometry.getAttribute('position');
    const triangles = geometry.index?.array ?? Array.from({ length: positions.count }, (_, index) => index);
    const sides = [[], []];
    for (let i = 0; i < triangles.length; i += 3) {
      const [a, b, c] = [triangles[i], triangles[i + 1], triangles[i + 2]];
      let z = 0;
      for (const vertex of [a, b, c]) z += point.fromBufferAttribute(positions, vertex).applyMatrix4(mesh.matrixWorld).z;
      sides[z < 0 ? 0 : 1].push(a, b, c);
    }
    sides.forEach((indices, index) => {
      if (!indices.length) return;
      const indexed = geometry.clone().setIndex(indices);
      const half = indexed.toNonIndexed();
      // Meshopt scans may store positions and normals in normalized integers.
      // Use floats before baking world coordinates into the split meshes.
      for (const name of ['position', 'normal']) {
        const attribute = half.getAttribute(name);
        if (!attribute) continue;
        const floats = new Float32Array(attribute.count * 3);
        for (let vertex = 0; vertex < attribute.count; vertex++) {
          point.fromBufferAttribute(attribute, vertex).toArray(floats, vertex * 3);
        }
        half.setAttribute(name, new Float32BufferAttribute(floats, 3));
      }
      half.applyMatrix4(mesh.matrixWorld);
      indexed.dispose();
      halves[index].add(new Mesh(half, mesh.material));
    });
  });
  return halves;
}

export function readFootwear(product) {
  if (!footwear.has(product.id)) {
    footwear.set(product.id, loadScan(product).then(scan => ({
      models: product.id === 'react-presto' ? splitReactPair(scan) : [scan],
      yaw: mirroredToe.has(product.id) ? Math.PI / 2 : -Math.PI / 2,
    })).catch(error => {
      footwear.delete(product.id);
      throw error;
    }));
  }
  return footwear.get(product.id);
}