const radius = 4;
const search = 9;
const spacing = 9;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function texture(frame, x, y) {
  const { pixels, width } = frame;
  let xx = 0, xy = 0, yy = 0;
  for (let row = -2; row <= 2; row++) {
    for (let col = -2; col <= 2; col++) {
      const i = (y + row) * width + x + col;
      const dx = pixels[i + 1] - pixels[i - 1];
      const dy = pixels[i + width] - pixels[i - width];
      xx += dx * dx;
      xy += dx * dy;
      yy += dy * dy;
    }
  }
  return (xx * yy - xy * xy) / (xx + yy + 1);
}

function features(frame, heel, toe) {
  const { width, height } = frame;
  const length = distance(heel, toe);
  const dx = (toe.x - heel.x) / length;
  const dy = (toe.y - heel.y) / length;
  const candidates = [];
  for (let y = radius + 1; y < height - radius - 1; y += 3) {
    for (let x = radius + 1; x < width - radius - 1; x += 3) {
      const along = (x - heel.x) * dx + (y - heel.y) * dy;
      const across = -(x - heel.x) * dy + (y - heel.y) * dx;
      if (along < 0 || along > length || Math.abs(across) > length * .17) continue;
      const score = texture(frame, x, y);
      if (score > 40) candidates.push({ x, y, score });
    }
  }
  const result = [];
  candidates.sort((a, b) => b.score - a.score);
  for (const point of candidates) {
    if (result.some(other => distance(other, point) < spacing)) continue;
    result.push(point);
    if (result.length === 16) break;
  }
  return result;
}

// Search for each small patch and check that it also matches in the reverse direction.
function matchPatch(before, after, point, range) {
  const { width, height } = before;
  let best;
  let bestError = Infinity;
  const first = point.y * width + point.x;
  const template = [];
  for (let row = -radius; row <= radius; row += 2) {
    for (let col = -radius; col <= radius; col += 2) {
      template.push(before.pixels[first + row * width + col] - before.pixels[first]);
    }
  }
  for (let y = Math.max(radius, point.y - range); y <= Math.min(height - radius - 1, point.y + range); y++) {
    for (let x = Math.max(radius, point.x - range); x <= Math.min(width - radius - 1, point.x + range); x++) {
      const center = y * width + x;
      const light = after.pixels[center];
      let error = 0, i = 0;
      for (let row = -radius; row <= radius; row += 2) {
        for (let col = -radius; col <= radius; col += 2) {
          error += Math.abs(template[i++] - (after.pixels[center + row * width + col] - light));
        }
        if (error >= bestError) break;
      }
      if (error < bestError) {
        bestError = error;
        best = { x, y };
      }
    }
  }
  return bestError < template.length * 18 ? best : undefined;
}

function transform(a, b, center, next, point) {
  const x = point.x - center.x;
  const y = point.y - center.y;
  return { x: next.x + a * x - b * y, y: next.y + b * x + a * y };
}

function similarity(matches, length) {
  let inliers = [];
  for (let i = 0; i < matches.length; i++) {
    const [p, q] = matches[i];
    for (let j = i + 1; j < matches.length; j++) {
      const [r, s] = matches[j];
      const x = r.x - p.x, y = r.y - p.y;
      const u = s.x - q.x, v = s.y - q.y;
      const size = x * x + y * y;
      if (size < (length * .22) ** 2) continue;
      const a = (x * u + y * v) / size;
      const b = (x * v - y * u) / size;
      const scale = Math.hypot(a, b);
      if (scale < .80 || scale > 1.24 || Math.abs(Math.atan2(b, a)) > .32) continue;
      const agreeing = matches.filter(([from, to]) => distance(transform(a, b, p, q, from), to) <= 2.8);
      if (agreeing.length > inliers.length) inliers = agreeing;
    }
  }
  if (inliers.length < Math.max(3, Math.ceil(matches.length * .55))) return;
  const center = index => ({
    x: inliers.reduce((sum, pair) => sum + pair[index].x, 0) / inliers.length,
    y: inliers.reduce((sum, pair) => sum + pair[index].y, 0) / inliers.length,
  });
  const before = center(0), after = center(1);
  let dot = 0, cross = 0, sum = 0;
  for (const [p, q] of inliers) {
    const x = p.x - before.x, y = p.y - before.y;
    const u = q.x - after.x, v = q.y - after.y;
    dot += x * u + y * v;
    cross += x * v - y * u;
    sum += x * x + y * y;
  }
  if (sum < (length * .20) ** 2) return;
  return { apply: point => transform(dot / sum, cross / sum, before, after, point), inliers };
}

export function createCloseTracking(frame, heel, toe) {
  if (distance(heel, toe) < 29) return;
  const previous = { ...frame, pixels: frame.pixels.slice() };
  let points = features(frame, heel, toe);
  if (points.length < 4) return;

  return {
    update(current, elapsed) {
      if (current.width !== previous.width || current.height !== previous.height) return;
      const matches = [];
      const range = elapsed > 70 ? search * 2 : search;
      for (const point of points) {
        const next = matchPatch(previous, current, point, range);
        if (!next) continue;
        const back = matchPatch(current, previous, next, range);
        if (back && distance(point, back) <= 2) matches.push([point, next]);
      }
      const movement = similarity(matches, distance(heel, toe));
      if (!movement) return;
      heel = movement.apply(heel);
      toe = movement.apply(toe);
      const visible = [heel, toe].every(({ x, y }) => x >= 0 && x < current.width && y >= 0 && y < current.height);
      if (!visible || distance(heel, toe) < 23) return;
      points = movement.inliers.map(pair => pair[1]);
      if (points.length < 10) {
        for (const candidate of features(current, heel, toe)) {
          if (points.every(point => distance(point, candidate) >= spacing)) points.push(candidate);
          if (points.length >= 16) break;
        }
      }
      previous.pixels.set(current.pixels);
      return { heel, toe };
    },
  };
}
