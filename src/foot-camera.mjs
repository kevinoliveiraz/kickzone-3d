import { collection } from './collection.mjs';
import { makeFootCameraScene } from './foot-camera-scene.mjs';
import { readFootwear } from './footwear.mjs';
import { createCloseTracking } from './foot-tracking.mjs';

const modelRoot = new URL('assets/pose/', document.baseURI);
const footLandmarks = [
  { side: 'left', indices: [27, 29, 31] },
  { side: 'right', indices: [28, 30, 32] },
];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const inFrame = point => point && point.x >= .015 && point.x <= .985 && point.y >= .015 && point.y <= .985;

async function loadDetector() {
  const { FilesetResolver, PoseLandmarker } = await import(new URL('vision_bundle.mjs', modelRoot).href);
  const files = await FilesetResolver.forVisionTasks(new URL('wasm', modelRoot).href);
  return PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: new URL('pose_landmarker_lite.task', modelRoot).href },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: .45,
    minTrackingConfidence: .45,
  });
}

function findFoot(result, frame, preferredSide) {
  const points = result.landmarks[0];
  if (!points) return;
  const world = result.worldLandmarks[0];
  const candidates = [];
  for (const { side, indices } of footLandmarks) {
    const [ankle, heel, toe] = indices.map(index => points[index]);
    if (![ankle, heel, toe].every(inFrame)) continue;
    const quality = Math.min(...[ankle, heel, toe].map(point => point.visibility ?? 0));
    if (quality < .51 || Math.hypot((toe.x - heel.x) * frame.width, (toe.y - heel.y) * frame.height) < 15) continue;
    const [a, h, t] = indices.map(index => world?.[index]);
    const length = h && t ? Math.hypot(t.x - h.x, t.y - h.y) : 0;
    const depth = length > .025 ? clamp((h.z - t.z) / length, -1.5, 1.5) : 0;
    const ankleDepth = length > .025 && a ? clamp((h.z - a.z) / length, -1, 1) : .2;
    candidates.push({
      heel, toe, side, depth, ankle: { ...ankle, depth: ankleDepth },
      score: quality + (preferredSide === side ? .22 : 0),
    });
  }
  return candidates.sort((a, b) => b.score - a.score)[0];
}

function cameraError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    return 'Permita o acesso à câmera nas configurações do navegador e tente de novo.';
  }
  if (error.name === 'NotFoundError') return 'Nenhuma câmera foi encontrada neste dispositivo.';
  if (error.name === 'NotReadableError') return 'A câmera está ocupada. Feche o app que está usando a câmera e tente de novo.';
  return 'Não foi possível iniciar a câmera. Tente de novo.';
}

export function createFootCamera({ onOpen, onClose }) {
  const dialog = document.querySelector('#foot-camera');
  const $ = id => dialog.querySelector('#foot-camera-' + id);
  const stage = $('stage'), video = $('video'), canvas = $('model');
  const startPanel = $('start-panel'), startButton = $('start'), actions = $('actions');
  const status = $('status'), select = $('shoe'), side = $('side');
  const markButton = $('mark'), heelDot = $('heel');
  const capture = document.createElement('canvas');
  const context = capture.getContext('2d', { willReadFrequently: true });
  for (const product of collection) select.add(new Option(product.name, product.id));

  let stream, scene, detector, opening, detection;
  let productTicket = 0, session = 0, animation;
  let tracker, firstMark, mode, track, trackTime, previousSide;
  let crosshair = { x: .5, y: .5 };
  let lastVideo, lastDetection, cameraWidth, cameraHeight, gray;
  let modelState;

  function message(text) {
    if (status.textContent !== text) status.textContent = text;
  }

  function frame() {
    const w = stage.clientWidth, h = stage.clientHeight;
    const ratio = Math.min(w / video.videoWidth, h / video.videoHeight);
    const width = video.videoWidth * ratio, height = video.videoHeight * ratio;
    return { width, height, x: (w - width) / 2, y: (h - height) / 2, w, h };
  }

  function project(point, bounds) {
    return { x: bounds.x + point.x * bounds.width, y: bounds.y + point.y * bounds.height };
  }

  function displayMark(element, point, bounds) {
    const position = project(point, bounds);
    element.style.left = position.x + 'px';
    element.style.top = position.y + 'px';
  }

  function clearTracking() {
    tracker = firstMark = track = trackTime = previousSide = undefined;
    heelDot.hidden = true;
  }

  function setMode(next) {
    clearTracking();
    mode = next;
    markButton.hidden = next !== 'mark';
    $('side-label').hidden = next === 'auto';
    $('auto').hidden = next === 'auto' || detection === 'unavailable';
    $('calibrate').textContent = next === 'auto' ? 'Marcar pé' : 'Remarcar pé';
    if (next === 'mark') {
      crosshair = { x: .5, y: .5 };
      markButton.setAttribute('aria-label', 'Marcar calcanhar. Use as setas para mover a mira.');
      markButton.focus();
    }
  }

  function loadSelected() {
    const product = collection.find(item => item.id === select.value);
    $('image').src = 'assets/scans/' + product.id + '.webp';
    if (!scene) return;
    const current = ++productTicket;
    modelState = 'loading';
    scene.setProduct(undefined);
    readFootwear(product).then(pair => {
      if (current !== productTicket) return;
      scene.setProduct(pair);
      modelState = 'ready';
    }).catch(() => {
      if (current === productTicket) modelState = 'error';
    });
  }

  function captureFrame(grayscale) {
    const ratio = Math.min(1, (grayscale ? 300 : 416) / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.round(video.videoWidth * ratio), height = Math.round(video.videoHeight * ratio);
    if (capture.width !== width || capture.height !== height) {
      capture.width = width;
      capture.height = height;
      gray = undefined;
    }
    context.drawImage(video, 0, 0, width, height);
    if (!grayscale) return;
    const pixels = gray ??= new Uint8Array(width * height);
    const { data } = context.getImageData(0, 0, width, height);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
    }
    return { width, height, pixels };
  }

  function mark(point) {
    if (!inFrame(point)) return;
    if (!firstMark) {
      firstMark = point;
      delete stage.dataset.markError;
      markButton.setAttribute('aria-label', 'Marcar ponta do pé. Use as setas para mover a mira.');
      return;
    }
    const current = captureFrame(true);
    const pixels = point => ({ x: point.x * current.width, y: point.y * current.height });
    tracker = createCloseTracking(current, pixels(firstMark), pixels(point));
    if (!tracker) {
      clearTracking();
      markButton.setAttribute('aria-label', 'Marcar calcanhar. Use as setas para mover a mira.');
      stage.dataset.markError = 'true';
      return;
    }
    track = { heel: firstMark, toe: point, side: side.value, depth: 0 };
    trackTime = performance.now();
    mode = 'manual';
    heelDot.hidden = markButton.hidden = true;
    $('calibrate').focus();
  }

  function updateTracking(now, bounds) {
    if (video.currentTime === lastVideo || now - lastDetection < (mode === 'auto' ? 80 : 32)) return;
    lastVideo = video.currentTime;
    lastDetection = now;
    if (mode === 'auto' && detector) {
      try {
        captureFrame(false);
        const target = findFoot(detector.detectForVideo(capture, now), bounds, previousSide);
        if (!target) return;
        track = target;
        trackTime = now;
        previousSide = target.side;
      } catch (error) {
        detector.close();
        detector = undefined;
        detection = 'unavailable';
        clearTracking();
        console.warn('Rastreamento automático indisponível.', error);
      }
    }
    if (mode === 'manual' && tracker) {
      const current = captureFrame(true);
      const target = tracker.update(current, now - trackTime);
      if (!target) {
        if (now - trackTime > 420) clearTracking();
        return;
      }
      const normalize = point => ({ x: point.x / current.width, y: point.y / current.height });
      track = { heel: normalize(target.heel), toe: normalize(target.toe), side: side.value, depth: 0 };
      trackTime = now;
    }
  }

  function render(now) {
    if (!stream) return;
    animation = requestAnimationFrame(render);
    if (video.readyState < 2 || !video.videoWidth) return;
    if (cameraWidth !== video.videoWidth || cameraHeight !== video.videoHeight) {
      cameraWidth = video.videoWidth;
      cameraHeight = video.videoHeight;
      if (mode === 'manual' || mode === 'mark') clearTracking();
    }
    const bounds = frame();
    if (!bounds.w || !bounds.h) return;
    scene.resize(bounds.w, bounds.h);
    updateTracking(now, bounds);
    const found = track && now - trackTime < 240;
    const visible = found && modelState === 'ready';
    stage.dataset.state = visible ? 'tracking' : mode === 'mark' ? 'marking' : 'searching';
    if (mode === 'mark') {
      displayMark($('crosshair'), crosshair, bounds);
      heelDot.hidden = !firstMark;
      if (firstMark) displayMark(heelDot, firstMark, bounds);
    }
    const anchor = visible ? {
      ...track,
      heel: project(track.heel, bounds),
      toe: project(track.toe, bounds),
      ankle: track.ankle && { ...project(track.ankle, bounds), depth: track.ankle.depth },
    } : undefined;
    scene.draw(anchor, now);
    if (modelState === 'error') message('Este scan não abriu. Selecione outro tênis ou reative a câmera para tentar de novo.');
    else if (mode === 'mark' && firstMark) message('Agora toque na ponta do pé.');
    else if (mode === 'mark' && stage.dataset.markError) message('Aproxime o pé, melhore a luz e toque de novo no calcanhar.');
    else if (mode === 'mark') message('Aponte de cima para um pé e toque no calcanhar.');
    else if (modelState === 'loading') message('Carregando o tênis 3D…');
    else if (found) message('Tênis no pé. Mova devagar para ver o encaixe.');
    else if (mode === 'manual') message('Perdi o pé de vista. Toque em Remarcar pé para continuar.');
    else if (detection === 'loading') message('Preparando a detecção automática…');
    else if (detection === 'unavailable') message('Use Marcar pé para posicionar o tênis com dois toques.');
    else message('Mostre o pé inteiro e parte da perna. Para uma visão de perto, toque em Marcar pé.');
  }

  function stop(text = 'A imagem fica no seu dispositivo.') {
    session++;
    productTicket++;
    opening = undefined;
    cancelAnimationFrame(animation);
    stream?.getTracks().forEach(track => track.stop());
    stream = undefined;
    video.srcObject = null;
    detector?.close();
    detector = undefined;
    scene?.dispose();
    scene = undefined;
    clearTracking();
    cameraWidth = cameraHeight = undefined;
    lastVideo = -1;
    lastDetection = 0;
    startPanel.hidden = false;
    startButton.disabled = false;
    actions.hidden = markButton.hidden = true;
    stage.dataset.state = 'idle';
    message(text);
  }

  async function start() {
    if (opening || stream) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      message('Abra o site por HTTPS no celular para liberar a câmera.');
      return;
    }
    const current = ++session;
    opening = current;
    startButton.disabled = true;
    message('Aguardando a permissão da câmera…');
    try {
      const received = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 640 } },
      });
      if (current !== session || !dialog.open) {
        received.getTracks().forEach(track => track.stop());
        return;
      }
      stream = received;
      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (current === session) stop('A câmera foi interrompida. Toque em Ativar câmera para voltar.');
        }, { once: true });
      }
      video.srcObject = stream;
      await video.play();
      if (current !== session) return;
    } catch (error) {
      if (current === session) stop(cameraError(error));
      return;
    }
    try {
      scene = makeFootCameraScene(canvas);
    } catch {
      stop('O navegador não conseguiu abrir a prévia 3D da câmera.');
      return;
    }
    opening = undefined;
    loadSelected();
    actions.hidden = false;
    detection = location.protocol === 'file:' ? 'unavailable' : 'loading';
    setMode('auto');
    startPanel.hidden = true;
    $('calibrate').focus();
    animation = requestAnimationFrame(render);
    if (detection !== 'loading') return;
    try {
      const loaded = await loadDetector();
      if (current === session) {
        detector = loaded;
        detection = 'ready';
      } else loaded.close();
    } catch (error) {
      if (current !== session) return;
      detection = 'unavailable';
      $('auto').hidden = true;
      console.warn('Não foi possível carregar o rastreamento automático.', error);
    }
  }

  startButton.addEventListener('click', start);
  function close() {
    stop();
    dialog.close();
  }
  $('close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  $('stop').addEventListener('click', () => {
    stop();
    startButton.focus();
  });
  $('calibrate').addEventListener('click', () => {
    delete stage.dataset.markError;
    setMode('mark');
  });
  $('auto').addEventListener('click', () => {
    setMode('auto');
    $('calibrate').focus();
  });
  markButton.addEventListener('click', event => {
    if (!event.detail) {
      mark(crosshair);
      return;
    }
    const bounds = frame();
    const area = stage.getBoundingClientRect();
    mark({ x: (event.clientX - area.left - bounds.x) / bounds.width, y: (event.clientY - area.top - bounds.y) / bounds.height });
  });
  markButton.addEventListener('keydown', event => {
    const move = { ArrowUp: [0, -.02], ArrowDown: [0, .02], ArrowLeft: [-.02, 0], ArrowRight: [.02, 0] }[event.key];
    if (!move) return;
    event.preventDefault();
    crosshair = { x: clamp(crosshair.x + move[0], .025, .975), y: clamp(crosshair.y + move[1], .025, .975) };
  });
  side.addEventListener('change', () => { if (track) track.side = side.value; });
  select.addEventListener('change', loadSelected);
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    if (stream || opening) stop();
    onClose();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    stop('A prévia 3D foi interrompida. Toque em Ativar câmera para tentar de novo.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (stream || opening)) stop('Câmera pausada. Toque em Ativar câmera para voltar.');
  });
  window.addEventListener('pagehide', () => stop());

  return {
    isOpen: () => dialog.open,
    open(product) {
      if (dialog.open) return;
      select.value = product.id;
      loadSelected();
      dialog.showModal();
      onOpen();
    },
  };
}
