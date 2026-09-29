const { spawn } = require('node:child_process');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function makeBmp(width, height) {
  const rowBytes = Math.ceil(width * 3 / 4) * 4;
  const pixels = rowBytes * height;
  const buffer = Buffer.alloc(54 + pixels);
  buffer.write('BM', 0);
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixels, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = 54 + y * rowBytes + x * 3;
      buffer[offset] = x % 256;
      buffer[offset + 1] = y % 256;
      buffer[offset + 2] = (x + y) % 256;
    }
  }
  return buffer;
}

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'slideshow-render-'));
  if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) {
    throw new Error('Unsafe smoke test directory');
  }
  try {
    const bmp = makeBmp(1920, 1080);
    await Promise.all([
      fsp.writeFile(path.join(root, 'photo1.bmp'), bmp),
      fsp.writeFile(path.join(root, 'photo2.bmp'), bmp)
    ]);
    const electron = require('electron');
    const env = {
      ...process.env,
      SLIDESHOW_SMOKE: '1',
      SLIDESHOW_SMOKE_FOLDER: root
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(electron, ['--no-sandbox', '.'], {
        cwd: path.join(__dirname, '..'),
        env,
        windowsHide: true
      });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Electron smoke test timed out\n${stdout}\n${stderr}`));
      }, 30000);
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', (error) => { clearTimeout(timeout); reject(error); });
      child.on('exit', (code) => {
        clearTimeout(timeout);
        const line = stdout.split(/\r?\n/).find((item) => item.startsWith('SLIDESHOW_SMOKE_RESULT='));
        if (code !== 0 || !line) reject(new Error(`Electron exited ${code}\n${stdout}\n${stderr}`));
        else resolve(JSON.parse(line.slice('SLIDESHOW_SMOKE_RESULT='.length)));
      });
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fsp.rm(root, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
