// Verify the portable build in environments where electron-builder cannot download
// its Windows helpers. Uses the user's existing electron-builder cache.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function main() {
  const cache = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache');
  const nsisCache = path.join(cache, 'nsis-3.0.4.1');
  const resourceArchive = path.join(
    cache, 'nsis-resources-3.4.1', 'nsis-resources-3.4.1.7z'
  );
  const nsisFolder = (await fsp.readdir(nsisCache, { withFileTypes: true }))
    .find((entry) => entry.isDirectory() && entry.name.startsWith('nsis-3.0.4.1-'));
  if (!nsisFolder) throw new Error('Cached NSIS binary not found');
  const resourceSize = (await fsp.stat(resourceArchive)).size;

  const server = http.createServer((request, response) => {
    if (request.url !== '/nsis-resources-3.4.1.7z') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': resourceSize
    });
    fs.createReadStream(resourceArchive).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const projectRoot = path.join(__dirname, '..');
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        path.join(projectRoot, 'node_modules', 'electron-builder', 'cli.js'),
        '--win', 'portable'
      ], {
        cwd: projectRoot,
        env: {
          ...process.env,
          ELECTRON_BUILDER_CACHE: path.join(projectRoot, '.cache', 'electron-builder'),
          ELECTRON_BUILDER_NSIS_DIR: path.join(nsisCache, nsisFolder.name),
          ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL: `http://127.0.0.1:${port}`
        }
      });
      child.stdout.pipe(process.stdout);
      child.stderr.pipe(process.stderr);
      child.on('error', reject);
      child.on('exit', resolve);
    });
    if (code !== 0) throw new Error(`electron-builder exited with code ${code}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
