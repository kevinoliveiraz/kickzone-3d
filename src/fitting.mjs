import { collection } from './collection.mjs';
import { makeFittingScene } from './fitting-scene.mjs';

const looks = [
  { id: 'hoodie', name: 'Moletom', detail: 'Roxo e bermuda jeans', top: '#5c456b', bottom: '#527a99' },
  { id: 'casual', name: 'Camiseta', detail: 'Areia e jeans', top: '#a38065', bottom: '#547c96' },
  { id: 'punk', name: 'Punk', detail: 'Preto e jeans', top: '#262524', bottom: '#526e89' },
  { id: 'formal', name: 'Alfaiataria', detail: 'Terno escuro', top: '#343541', bottom: '#272932' },
  { id: 'woman', name: 'Casual leve', detail: 'Branco e laranja', top: '#e8dfd7', bottom: '#ae5b31' },
];
const faces = [
  ['casual', 'Cabelo curto'], ['hoodie', 'Cabelo penteado'], ['punk', 'Moicano'],
  ['formal', 'Risca lateral'], ['woman', 'Cabelo longo'],
];
const skins = [
  ['Muito clara', '#ebbd9e'], ['Clara', '#dba37c'], ['Média', '#b77d56'],
  ['Morena', '#925b3c'], ['Escura', '#6e422c'], ['Muito escura', '#482b21'],
];
const hairs = [
  ['Preto', '#231c1c'], ['Castanho', '#4e3025'], ['Loiro', '#bd925d'],
  ['Ruivo', '#8a3c28'], ['Grisalho', '#a19b98'],
];
const key = 'kickzone-avatar-v1';
const still = product => 'assets/scans/' + product.id + '.webp';

function loadSettings() {
  const defaults = { name: '', look: 'hoodie', face: 'casual', build: 'regular', skin: skins[2][1], hair: hairs[0][1], shoe: collection[0].id };
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (!stored) return defaults;
    if (typeof stored.name === 'string') defaults.name = stored.name.slice(0, 28);
    if (looks.some(look => look.id === stored.look)) defaults.look = stored.look;
    if (faces.some(([id]) => id === stored.face)) defaults.face = stored.face;
    if (['slim', 'regular', 'broad'].includes(stored.build)) defaults.build = stored.build;
    if (skins.some(([, color]) => color === stored.skin)) defaults.skin = stored.skin;
    if (hairs.some(([, color]) => color === stored.hair)) defaults.hair = stored.hair;
    if (collection.some(product => product.id === stored.shoe)) defaults.shoe = stored.shoe;
  } catch {
    return defaults;
  }
  return defaults;
}

export function createFittingRoom({ onOpen, onClose, onCamera }) {
  const room = document.querySelector('#fitting-room');
  const $ = selector => room.querySelector(selector);
  const stage = $('.fitting-stage');
  const canvas = $('#fitting-canvas');
  const status = $('#fitting-status');
  const entry = document.querySelector('#fitting-open');
  const tabs = [...room.querySelectorAll('[role="tab"]')];
  const viewButtons = [...room.querySelectorAll('[data-view]')];
  const turnButtons = [...room.querySelectorAll('[data-turn]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const settings = loadSettings();
  let scene;
  let pending;
  let focusBack;
  let drag;
  let revision = 0;
  let currentShoe;

  const store = () => {
    try { localStorage.setItem(key, JSON.stringify(settings)); }
    catch { /* The editor also works with browser storage disabled. */ }
  };

  const makeButton = (className, handler) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.addEventListener('click', handler);
    return button;
  };
  const lookButtons = looks.map(look => {
    const button = makeButton('look-choice', () => changeAppearance('look', look.id));
    button.style.setProperty('--fit-top', look.top);
    button.style.setProperty('--fit-bottom', look.bottom);
    button.innerHTML = '<span class="look-chip" aria-hidden="true"></span><span><strong>' + look.name
      + '</strong><small>' + look.detail + '</small></span><span class="look-mark" aria-hidden="true">✓</span>';
    return button;
  });
  $('#fit-looks').append(...lookButtons);
  const shoeButtons = collection.map(product => {
    const button = makeButton('shoe-choice', () => selectShoe(product.id));
    button.innerHTML = '<img alt="" loading="lazy"><strong>' + product.name + '</strong><small>' + product.brand + '</small>';
    button.querySelector('img').src = still(product);
    return button;
  });
  $('#fit-shoes').append(...shoeButtons);
  const name = $('#avatar-name');
  const face = $('#avatar-face');
  const build = $('#avatar-build');
  for (const [id, label] of faces) face.add(new Option(label, id));
  name.value = settings.name;
  face.value = settings.face;
  build.value = settings.build;

  function swatches(field, options) {
    const buttons = options.map(([label, color]) => {
      const button = makeButton('', () => changeAppearance(field, color));
      button.style.setProperty('--fit-swatch', color);
      button.setAttribute('aria-label', (field === 'skin' ? 'Pele ' : 'Cabelo ') + label.toLowerCase());
      button.title = label;
      return button;
    });
    $(field === 'skin' ? '#avatar-skins' : '#avatar-hairs').append(...buttons);
    return buttons;
  }
  const skinButtons = swatches('skin', skins);
  const hairButtons = swatches('hair', hairs);

  function refresh() {
    $('#fitting-caption').textContent = settings.name.trim() || 'Meu avatar';
    lookButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(looks[index].id === settings.look)));
    skinButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(skins[index][1] === settings.skin)));
    hairButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(hairs[index][1] === settings.hair)));
    shoeButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(collection[index].id === settings.shoe)));
    const product = collection.find(item => item.id === settings.shoe);
    $('#fitting-shoe-image').src = still(product);
    $('#fitting-shoe-name').textContent = product.name;
  }

  function changeAppearance(field, value) {
    settings[field] = value;
    refresh();
    if (field !== 'name') scene?.setCharacter(settings);
    store();
  }

  async function selectShoe(id) {
    settings.shoe = id;
    refresh();
    store();
    if (!scene || currentShoe === id) return;
    currentShoe = id;
    const request = ++revision;
    status.textContent = 'Calçando o tênis…';
    try {
      await scene.setProduct(collection.find(product => product.id === id));
      if (request === revision) status.textContent = '';
    } catch (error) {
      if (request !== revision) return;
      currentShoe = undefined;
      status.textContent = 'Não foi possível calçar este tênis. Selecione o modelo para tentar de novo.';
      console.warn('Scan indisponível no provador.', error);
    }
  }

  function activateTab(tab, focus = false) {
    for (const button of tabs) {
      const active = button === tab;
      button.tabIndex = active ? 0 : -1;
      button.setAttribute('aria-selected', String(active));
      $('#' + button.getAttribute('aria-controls')).hidden = !active;
    }
    if (focus) tab.focus();
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const destinations = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 };
      if (!(event.key in destinations)) return;
      event.preventDefault();
      activateTab(tabs[destinations[event.key]], true);
    });
  }
  $('#fitting-change-shoe').addEventListener('click', () => activateTab($('#tab-shoes'), true));
  $('#fitting-camera-open').addEventListener('click', () => {
    onCamera(collection.find(product => product.id === settings.shoe));
  });
  $('#fitting-back').addEventListener('click', () => close());
  name.addEventListener('input', () => changeAppearance('name', name.value));
  face.addEventListener('change', () => changeAppearance('face', face.value));
  build.addEventListener('change', () => changeAppearance('build', build.value));
  for (const button of turnButtons) button.addEventListener('click', () => scene?.turn(Number(button.dataset.turn) * Math.PI / 6));
  for (const button of viewButtons) button.addEventListener('click', () => {
    viewButtons.forEach(view => view.setAttribute('aria-pressed', String(view === button)));
    scene?.zoom(button.dataset.view === 'feet');
  });
  canvas.addEventListener('pointerdown', event => {
    if (!scene || event.button !== 0 || drag) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX };
  });
  canvas.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    scene.turn((event.clientX - drag.x) * .014);
    drag.x = event.clientX;
  });
  canvas.addEventListener('lostpointercapture', () => { drag = undefined; });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    scene?.show(false);
    status.textContent = 'A prévia 3D foi interrompida. Reabra a página para tentar de novo.';
  });

  const layout = () => {
    if (!room.hidden) scene?.resize(stage.clientWidth, stage.clientHeight);
  };
  new ResizeObserver(layout).observe(stage);
  reducedMotion.addEventListener('change', layout);

  async function open(product) {
    if (!room.hidden) return;
    focusBack = document.activeElement;
    if (product) settings.shoe = product.id;
    onOpen();
    room.hidden = false;
    entry.setAttribute('aria-expanded', 'true');
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('#fitting-title').focus({ preventScroll: true });
    refresh();
    try {
      if (!scene) {
        status.textContent = 'Preparando o avatar…';
        pending ||= makeFittingScene(canvas, reducedMotion);
        scene = await pending;
        pending = undefined;
      }
      if (room.hidden) return;
      layout();
      scene.setCharacter(settings);
      scene.zoom($('[data-view="feet"]').getAttribute('aria-pressed') === 'true');
      scene.show(true);
      if (currentShoe === settings.shoe) status.textContent = '';
      await selectShoe(settings.shoe);
    } catch (error) {
      pending = undefined;
      status.textContent = 'Prévia 3D indisponível neste navegador.';
      console.warn('Provador indisponível.', error);
    }
  }

  function close(restoreFocus = true) {
    if (room.hidden) return;
    room.hidden = true;
    entry.setAttribute('aria-expanded', 'false');
    scene?.show(false);
    onClose();
    if (restoreFocus) focusBack?.focus();
  }

  refresh();
  return { open, close, isOpen: () => !room.hidden, showPreview: visible => scene?.show(visible && !room.hidden) };
}
