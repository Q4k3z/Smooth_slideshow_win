const fs = require('fs').promises;
const path = require('path');

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tiff', '.avif'
]);

async function scanImageFiles(root, { onProgress = () => {}, isCancelled = () => false } = {}) {
  const paths = [];
  const stack = [root];
  let lastProgress = 0;

  while (stack.length) {
    if (isCancelled()) return null;
    const currentPath = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (error) {
      if (currentPath === root) throw error;
      console.warn(`Skipping unreadable folder: ${currentPath}`, error);
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        paths.push(fullPath);
      }
    }
    if (Date.now() - lastProgress > 200) {
      onProgress(paths.length);
      lastProgress = Date.now();
    }
  }

  if (isCancelled()) return null;
  paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return paths;
}

module.exports = { scanImageFiles };
