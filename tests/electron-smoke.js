async function run({ window, scanFolder, folder }) {
  if (!folder) throw new Error('Missing smoke test folder');
  const contents = window.webContents;
  console.log('SMOKE_STAGE=loading');
  if (contents.isLoading()) {
    await Promise.race([new Promise((resolve, reject) => {
      contents.once('did-finish-load', resolve);
      contents.once('did-fail-load', (_event, code, description) => reject(new Error(`${code}: ${description}`)));
    }), new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Page load timed out')), 8000))]);
  }

  const bridgeState = await contents.executeJavaScript(`
    (async () => ({
      available: typeof window.electronAPI?.openFolder === 'function' &&
        typeof window.electronAPI?.scanDroppedFolder === 'function',
      fullscreen: await window.electronAPI?.isFullscreen()
    }))()
  `);
  if (!bridgeState.available || typeof bridgeState.fullscreen !== 'boolean') {
    throw new Error('Preload bridge did not initialize');
  }

  console.log('SMOKE_STAGE=scanning');
  const source = { sender: contents, senderFrame: { url: 'slideshow://app/index.html' } };
  const scanStart = performance.now();
  const images = await scanFolder(source, folder);
  const scanMs = performance.now() - scanStart;
  if (!images || images.length < 2) throw new Error('Smoke scan did not find two images');

  const initialized = await contents.executeJavaScript(`
    (() => {
      if (!window.app) return false;
      document.getElementById('welcome-screen').classList.add('hidden');
      document.getElementById('slideshow-stage').classList.remove('hidden');
      window.app.deck.setShuffle(false);
      window.app.deck.setImages(${JSON.stringify(images)});
      window.app.isWelcomeState = false;
      window.app.showNextSlide(true);
      return true;
    })()
  `);
  if (!initialized) throw new Error('Slideshow did not initialize');

  console.log('SMOKE_STAGE=image');
  const imageState = await contents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const deadline = performance.now() + 10000;
      function check() {
        const image = document.querySelector('.slide-layer.active .fg-image');
        if (image?.naturalWidth) {
          resolve({ width: image.naturalWidth, height: image.naturalHeight, title: document.title });
        } else if (performance.now() > deadline) {
          reject(new Error('Image did not render'));
        } else {
          setTimeout(check, 50);
        }
      }
      check();
    })
  `);

  console.log('SMOKE_STAGE=frames');
  contents.setFrameRate(60);
  contents.startPainting();
  let paintedFrames = 0;
  const onPaint = () => { paintedFrames++; };
  contents.on('paint', onPaint);
  const durationMs = 3000;
  const transition = setTimeout(() => {
    contents.executeJavaScript('window.app.showNextSlide()').catch(() => {});
  }, 1000);
  const animation = await Promise.race([contents.executeJavaScript(`
    new Promise((resolve) => {
      const start = performance.now();
      let frames = 0;
      setTimeout(() => resolve({ frames, elapsed: performance.now() - start }), ${durationMs + 500});
      function frame() {
        frames++;
        const elapsed = performance.now() - start;
        if (elapsed >= ${durationMs}) resolve({ frames, elapsed });
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    })
  `), new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Frame measurement timed out')), 10000))]);
  clearTimeout(transition);
  contents.removeListener('paint', onPaint);
  return {
    imageCount: images.length,
    preloadBridge: bridgeState.available,
    scanMs: Math.round(scanMs),
    image: imageState,
    requestedFrameRate: contents.getFrameRate(),
    animationFrames: animation.frames,
    animationFps: Math.round(animation.frames * 1000 / animation.elapsed),
    paintedFrames,
    paintFps: Math.round(paintedFrames * 1000 / animation.elapsed),
    durationMs: Math.round(animation.elapsed),
    mode: 'offscreen'
  };
}

module.exports = { run };
