const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const { scanImageFiles } = require('../scan-files');

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'slideshow-perf-'));
  if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    throw new Error('Unsafe performance directory');
  }
  try {
    const folders = Array.from({ length: 100 }, (_, i) => path.join(root, `folder-${i}`));
    await Promise.all(folders.map((folder) => fsp.mkdir(folder)));
    for (const folder of folders) {
      const writes = Array.from({ length: 100 }, (_, i) =>
        fsp.writeFile(path.join(folder, `photo-${i}.jpg`), ''));
      await Promise.all(writes);
    }

    const scanTimes = [];
    let files;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      files = await scanImageFiles(root);
      scanTimes.push(Math.round(performance.now() - start));
    }

    const context = vm.createContext({ window: {}, Math });
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '../src/renderer/scanner.js'), 'utf8'),
      context
    );
    const deck = new context.window.ShuffleDeck();
    const imageList = files.map((file, index) => ({ name: path.basename(file), url: String(index) }));
    const deckStart = performance.now();
    deck.setImages(imageList);
    for (let i = 0; i < 20000; i++) deck.getNextImage();
    const deckMs = Math.round(performance.now() - deckStart);

    console.log(JSON.stringify({
      fileCount: files.length,
      scanTimesMs: scanTimes,
      medianScanMs: [...scanTimes].sort((a, b) => a - b)[1],
      twoShuffleCyclesMs: deckMs,
      boundedHistory: deck.historyStack.length
    }, null, 2));
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
