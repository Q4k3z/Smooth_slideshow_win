const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { scanImageFiles } = require('../scan-files');

function createDeck() {
  const context = vm.createContext({ window: {}, Math });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/scanner.js'), 'utf8'), context);
  return new context.window.ShuffleDeck();
}

function images(count) {
  return Array.from({ length: count }, (_, i) => ({ name: `image-${i}`, url: `test:${i}` }));
}

test('ordered playback follows the file list and wraps correctly', () => {
  const deck = createDeck();
  const list = images(3);
  deck.setShuffle(false);
  deck.setImages(list);
  assert.deepEqual(
    [deck.getNextImage(), deck.getNextImage(), deck.getNextImage(), deck.getNextImage()],
    [list[0], list[1], list[2], list[0]]
  );
});

test('shuffle plays each image once per cycle and avoids a duplicate at wrap', () => {
  const deck = createDeck();
  const list = images(20);
  deck.setImages(list);
  const firstCycle = Array.from({ length: 20 }, () => deck.getNextImage());
  assert.equal(new Set(firstCycle).size, 20);
  assert.notEqual(deck.getNextImage(), firstCycle[19]);
});

test('changing shuffle keeps history and does not replay consumed images in the cycle', () => {
  const deck = createDeck();
  const list = images(4);
  deck.setShuffle(false);
  deck.setImages(list);
  assert.equal(deck.getNextImage(), list[0]);
  assert.equal(deck.getNextImage(), list[1]);
  deck.setShuffle(true);
  assert.equal(deck.getPrevImage(), list[0]);
  assert.equal(deck.getNextImage(), list[1]);
  const remaining = [deck.getNextImage(), deck.getNextImage()];
  assert.deepEqual(new Set(remaining), new Set([list[2], list[3]]));
});

test('history stays bounded and bad images can be removed', () => {
  const deck = createDeck();
  const list = images(2);
  deck.setImages(list);
  for (let i = 0; i < 600; i++) deck.getNextImage();
  assert.equal(deck.historyStack.length, 500);
  deck.discardImage(list[0]);
  assert.equal(deck.getTotalCount(), 1);
  assert.ok(deck.historyStack.every((image) => image !== list[0]));
});

test('scanner sorts images, ignores non-images and does not follow directory links', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'slideshow-test-'));
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  try {
    await fsp.mkdir(path.join(root, 'sub'));
    await Promise.all([
      fsp.writeFile(path.join(root, 'image10.jpg'), ''),
      fsp.writeFile(path.join(root, 'image2.jpg'), ''),
      fsp.writeFile(path.join(root, 'notes.txt'), ''),
      fsp.writeFile(path.join(root, 'sub', 'image1.PNG'), '')
    ]);
    const result = await scanImageFiles(root);
    assert.deepEqual(result.map((item) => path.relative(root, item)), [
      'image2.jpg', 'image10.jpg', path.join('sub', 'image1.PNG')
    ]);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

function createAppHarness() {
  const loaders = [];
  const timers = [];
  const makeClassList = () => {
    const values = new Set();
    return {
      add: (...items) => items.forEach((item) => values.add(item)),
      remove: (...items) => items.forEach((item) => values.delete(item)),
      contains: (item) => values.has(item)
    };
  };
  const makeLayer = () => {
    const fg = {
      src: '',
      classList: makeClassList(),
      style: { setProperty() {} },
      removeAttribute() { this.src = ''; },
      hasAttribute() { return Boolean(this.src); }
    };
    const bg = { style: { backgroundImage: '' } };
    return { classList: makeClassList(), style: {}, querySelector: (selector) => selector === '.fg-image' ? fg : bg };
  };
  const elements = new Map([
    ['slide-a', makeLayer()], ['slide-b', makeLayer()]
  ]);
  for (const id of ['welcome-screen', 'slideshow-stage', 'floating-controls']) {
    elements.set(id, { classList: makeClassList() });
  }
  const ui = {
    showToast() {}, updatePlayPauseUI() {}, updateInfoBadgeUI() {},
    updateImageInfo() {}, toggleFullscreen() { return Promise.resolve(); }
  };
  const window = {
    ShuffleDeck: createDeck().constructor,
    KenBurnsEngine: class { applyTrajectory() {} },
    UIController: class { constructor() { return ui; } },
    electronAPI: { isFullscreen: async () => true }
  };
  const document = {
    body: { classList: makeClassList() },
    getElementById: (id) => elements.get(id),
    addEventListener() {}
  };
  class FakeImage {
    constructor() { loaders.push(this); }
    set src(value) { this._src = value; }
    get src() { return this._src; }
  }
  const context = vm.createContext({
    window, document, Image: FakeImage, console,
    setTimeout: (fn, delay) => {
      const timer = { fn, delay, active: true };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => { if (timer) timer.active = false; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8'), context);
  return { app: new (vm.runInContext('SlideshowApp', context))(), loaders, timers, ui };
}

test('stale image loads cannot replace a newer slide', () => {
  const { app, loaders } = createAppHarness();
  app.deck.setShuffle(false);
  app.deck.setImages(images(2));
  app.isWelcomeState = false;
  app.showNextSlide(true);
  const staleOnload = loaders[0].onload;
  app.showNextSlide();
  staleOnload();
  assert.equal(app.activeLayer, 'A');
  loaders[1].onload();
  assert.equal(app.activeLayer, 'B');
  assert.equal(app.layerB.fg.src, 'test:1');
});

test('all corrupt images stop playback instead of retrying forever', () => {
  const { app, loaders, timers } = createAppHarness();
  app.deck.setShuffle(false);
  app.deck.setImages(images(2));
  app.isWelcomeState = false;
  app.showNextSlide(true);
  loaders[0].onerror();
  const retry = timers.find((timer) => timer.active && timer.delay === 0);
  assert.ok(retry);
  retry.fn();
  loaders[1].onerror();
  assert.equal(app.deck.getTotalCount(), 0);
  assert.equal(app.isPlaying, false);
  assert.equal(timers.filter((timer) => timer.active && timer.delay === 0).length, 0);
});

test('pause freezes the current image and resume schedules the next image', () => {
  const { app, loaders, timers } = createAppHarness();
  app.deck.setShuffle(false);
  app.deck.setImages(images(2));
  app.isWelcomeState = false;
  app.showNextSlide(true);
  loaders[0].onload();
  app.togglePlayPause();
  assert.equal(app.layerB.fg.style.animationPlayState, 'paused');
  assert.equal(app.layerB.fg.src, 'test:0');
  app.togglePlayPause();
  assert.equal(app.layerB.fg.style.animationPlayState, 'running');
  assert.equal(app.layerB.fg.src, 'test:0');
  assert.ok(timers.some((timer) => timer.active && timer.delay === app.slideDuration));
});
