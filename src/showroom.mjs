import { collection } from './collection.mjs';
import { featuredIndex, frameLayout, makeVitrine } from './scene.mjs';
import { createFittingRoom } from './fitting.mjs';
import { createFootCamera } from './foot-camera.mjs';

const $ = selector => document.querySelector(selector);
const stage = $('#showroom');
const world = $('.world');
const canvas = $('#scene');
const list = $('.products');
const standIn = $('.stand-in');
const modelName = $('#model-name');
const galleryTitle = $('#gallery-title');
const galleryHeading = $('.gallery-heading');
const productHeading = $('.product-heading');
const focusUI = $('.focus-ui');
const toggle = $('#gallery-toggle');
const angles = $('#angles');
const dragGuide = $('#drag-guide');
const status = $('#render-status');
const mobile = matchMedia('(max-width: 740px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const angleButtons = [...angles.querySelectorAll('[data-angle]')];
const still = index => 'assets/scans/' + collection[index].id + '.webp';
const presets = { side: [.006, -.205], top: [Math.PI / 2 - .11, 0], sole: [-Math.PI / 2 - .11, 0] };

let active = featuredIndex;
let gallery = mobile.matches;
let pitch = 0;
let yaw = 0;
let drag;
let view;
let canRotate = false;
let renderingAvailable = true;

const fitting = createFittingRoom({
  onCamera: product => footCamera.open(product),
  onOpen() {
    view?.pause();
    stage.hidden = true;
    toggle.querySelector('span').textContent = 'VITRINE';
    toggle.setAttribute('aria-pressed', 'false');
  },
  onClose() {
    stage.hidden = false;
    updateMode();
    if (!view && !gallery && renderingAvailable) start();
  },
});
const footCamera = createFootCamera({
  onOpen() {
    view?.pause();
    fitting.showPreview(false);
  },
  onClose() {
    if (fitting.isOpen()) fitting.showPreview(true);
    else if (!gallery) layout();
  },
});
$('#fitting-open').setAttribute('aria-expanded', 'false');
$('#fitting-open').addEventListener('click', () => fitting.open());
$('#try-on').addEventListener('click', () => fitting.open(collection[active]));
$('#camera-try-on').addEventListener('click', () => footCamera.open(collection[active]));

const cards = collection.map((product, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'product';
  button.style.setProperty('--pair', product.accent);
  button.style.setProperty('--delay', index * 32 + 'ms');
  button.setAttribute('aria-label', 'Ver ' + product.name);
  button.innerHTML = '<img alt="" loading="lazy"><span class="product-label"><span>' + product.code
    + '</span><span class="product-text"><strong>' + product.name
    + '</strong><small>' + product.brand + '</small></span><span aria-hidden="true">↗</span></span>';
  button.querySelector('img').src = still(index);
  button.addEventListener('click', () => select(index, true));
  return button;
});
list.append(...cards);

const dockButtons = collection.map((product, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mono';
  button.textContent = product.code;
  button.setAttribute('aria-label', product.name);
  button.addEventListener('click', () => select(index, gallery));
  return button;
});
$('.editions').append(...dockButtons);

const creditList = $('.scan-credits');
for (const product of collection) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = product.source;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = product.name + ' · ' + product.author;
  item.append(link);
  creditList.append(item);
}

function layout() {
  if (gallery || stage.hidden || !view || footCamera.isOpen()) return;
  const frame = frameLayout(world.clientWidth, world.clientHeight, mobile.matches);
  view.layout(frame, active);
}

function setAngle(name) {
  if (name) [pitch, yaw] = presets[name];
  view?.rotate(pitch, yaw);
  angleButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.angle === name));
  });
}

function updateMode() {
  const product = collection[active];
  stage.dataset.mode = gallery ? 'gallery' : 'focus';
  list.hidden = galleryHeading.hidden = !gallery;
  productHeading.hidden = focusUI.hidden = standIn.hidden = gallery;
  if (gallery) {
    view?.pause();
    angles.hidden = dragGuide.hidden = true;
    status.textContent = 'ACERVO / 10 SCANS';
  }
  toggle.setAttribute('aria-pressed', String(gallery));
  toggle.querySelector('span').textContent = gallery ? 'EM DESTAQUE' : 'VITRINE';
  dockButtons.forEach((button, index) => {
    if (index === active && !gallery) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  if (!gallery) {
    modelName.textContent = product.name;
    $('#edition-code').textContent = product.code;
    $('#model-tone').textContent = product.brand + ' / ' + product.tone;
    $('#model-description').textContent = product.description;
    $('#model-credit').textContent = 'Scan: ' + product.author;
    $('#model-credit').href = product.source;
    standIn.src = still(active);
  }
  layout();
}

function focusScene(element) {
  element.focus({ preventScroll: true });
  if (world.getBoundingClientRect().top < 0) {
    window.scrollTo({ top: 0, behavior: reduced.matches ? 'instant' : 'smooth' });
  }
}

function select(index, focus = false) {
  const changed = gallery || index !== active;
  active = index;
  gallery = false;
  drag = undefined;
  if (changed) {
    updateMode();
    reflectScan(renderingAvailable ? 'loading' : 'error');
  }
  if (!view && renderingAvailable) start();
  setAngle('side');
  if (focus) focusScene(modelName);
}

function showGallery(focus) {
  gallery = true;
  drag = undefined;
  updateMode();
  if (focus) focusScene(focus);
}

function step(direction) {
  select((active + direction + collection.length) % collection.length);
}

toggle.addEventListener('click', () => {
  if (fitting.isOpen()) {
    fitting.close(false);
    showGallery(galleryTitle);
    return;
  }
  if (gallery) select(active, true);
  else showGallery(galleryTitle);
});
$('.brand').addEventListener('click', () => {
  fitting.close(false);
  select(featuredIndex, true);
});
document.querySelectorAll('[data-step]').forEach(button => {
  button.addEventListener('click', () => step(Number(button.dataset.step)));
});
angleButtons.forEach(button => button.addEventListener('click', () => setAngle(button.dataset.angle)));
document.addEventListener('keydown', event => {
  if (footCamera.isOpen()) return;
  if (fitting.isOpen()) {
    if (event.key === 'Escape') fitting.close();
    return;
  }
  if (gallery || event.altKey || event.metaKey || event.ctrlKey) return;
  if (event.key === 'Escape') {
    showGallery(cards[active]);
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  }
});

canvas.addEventListener('pointerdown', event => {
  if (gallery || !canRotate || drag || event.button !== 0) return;
  canvas.setPointerCapture(event.pointerId);
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointermove', event => {
  if (drag?.id !== event.pointerId) return;
  yaw += (event.clientX - drag.x) * .0105;
  pitch = Math.min(1.8, Math.max(-1.8, pitch + (event.clientY - drag.y) * .009));
  drag.x = event.clientX;
  drag.y = event.clientY;
  setAngle();
});
canvas.addEventListener('lostpointercapture', () => { drag = undefined; });

function reflectScan(state) {
  if (gallery) return;
  canRotate = state === 'ready';
  angles.hidden = dragGuide.hidden = !canRotate;
  stage.classList.toggle('is-live', canRotate);
  status.textContent = canRotate ? '3D INTERATIVO' : state === 'error' ? 'VISTA EM IMAGEM' : 'PREPARANDO SCAN';
}

function enablePhotos() {
  view = undefined;
  renderingAvailable = false;
  stage.classList.add('fallback');
  reflectScan('error');
}

function start() {
  try {
    view = makeVitrine(canvas, reduced, state => {
      if (view) reflectScan(state);
    });
    canvas.addEventListener('webglcontextlost', enablePhotos, { once: true });
    layout();
    setAngle('side');
  } catch (error) {
    console.warn('Visualização em 3D indisponível.', error);
    enablePhotos();
  }
}

updateMode();
new ResizeObserver(layout).observe(world);
reduced.addEventListener('change', layout);
if (!gallery) requestAnimationFrame(() => {
  if (!view && !gallery && renderingAvailable && !fitting.isOpen() && !footCamera.isOpen()) start();
});

