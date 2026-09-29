class SlideshowApp {
  constructor() {
    this.deck = new window.ShuffleDeck();
    this.kenBurns = new window.KenBurnsEngine();
    this.slideDuration = 5000;
    this.transitionDuration = 1500;
    this.transitionType = 'random';
    this.showInfoBadge = true;
    this.isPlaying = true;
    this.isWelcomeState = true;
    this.timer = null;
    this.cleanupTimer = null;
    this.pendingImage = null;
    this.renderRequest = 0;
    this.folderRequest = 0;

    this.layerA = {
      container: document.getElementById('slide-a'),
      bg: document.getElementById('slide-a').querySelector('.bg-blur'),
      fg: document.getElementById('slide-a').querySelector('.fg-image')
    };
    this.layerB = {
      container: document.getElementById('slide-b'),
      bg: document.getElementById('slide-b').querySelector('.bg-blur'),
      fg: document.getElementById('slide-b').querySelector('.fg-image')
    };
    this.activeLayer = 'A';
    this.ui = new window.UIController(this);
    window.electronAPI.onScanProgress?.((count) => {
      if (this.scanning) this.ui.showToast(`Scanning: ${count} images...`);
    });
  }

  getEffectiveTransition() {
    const types = ['fade', 'slide-left', 'slide-right', 'zoom-in', 'zoom-out', 'blur-fade', 'flip-3d'];
    return this.transitionType === 'random'
      ? types[Math.floor(Math.random() * types.length)]
      : this.transitionType;
  }

  async selectFolder() {
    const request = ++this.folderRequest;
    this.scanning = true;
    this.ui.showToast('Selecting and scanning image folder...');
    try {
      const images = await window.electronAPI.openFolder();
      if (request === this.folderRequest && images) await this.loadImages(images);
    } catch (error) {
      if (request === this.folderRequest) this.ui.showToast(`Failed to read folder: ${error.message}`);
    } finally {
      if (request === this.folderRequest) this.scanning = false;
    }
  }

  async loadDroppedFolder(file) {
    const request = ++this.folderRequest;
    this.scanning = true;
    this.ui.showToast('Scanning image folder...');
    try {
      const images = await window.electronAPI.scanDroppedFolder(file);
      if (request === this.folderRequest && images) await this.loadImages(images);
    } catch (error) {
      if (request === this.folderRequest) this.ui.showToast(`Failed to read folder: ${error.message}`);
    } finally {
      if (request === this.folderRequest) this.scanning = false;
    }
  }

  async loadImages(images) {
    if (!images.length) {
      this.ui.showToast('No images found in folder!');
      return;
    }

    clearTimeout(this.timer);
    clearTimeout(this.cleanupTimer);
    this.cancelPendingImage();
    this.deck.setImages(images);
    this.layerA.container.classList.remove('active');
    this.layerB.container.classList.remove('active');
    this.layerA.fg.removeAttribute('src');
    this.layerB.fg.removeAttribute('src');
    this.layerA.bg.style.backgroundImage = 'none';
    this.layerB.bg.style.backgroundImage = 'none';
    this.activeLayer = 'A';

    document.getElementById('welcome-screen').classList.add('hidden');
    document.getElementById('slideshow-stage').classList.remove('hidden');
    document.getElementById('floating-controls').classList.remove('hidden');
    document.body.classList.add('in-slideshow');
    this.ui.updateInfoBadgeUI(this.showInfoBadge);
    this.isWelcomeState = false;
    this.isPlaying = true;
    this.ui.updatePlayPauseUI(true);
    this.layerA.fg.style.animationPlayState = 'running';
    this.layerB.fg.style.animationPlayState = 'running';
    this.ui.showToast(`Found ${images.length} images.`);

    this.showNextSlide(true);
    window.electronAPI.isFullscreen()
      .then((isFull) => { if (!isFull) return this.ui.toggleFullscreen(); })
      .catch((error) => console.warn('Cannot enter fullscreen:', error));
  }

  cancelPendingImage() {
    this.renderRequest++;
    if (this.pendingImage) {
      this.pendingImage.onload = null;
      this.pendingImage.onerror = null;
      this.pendingImage.src = '';
      this.pendingImage = null;
    }
  }

  showNextSlide(isFirstRun = false) {
    const image = this.deck.getNextImage();
    if (image) this.renderSlide(image, isFirstRun);
    else this.stopForEmptyDeck();
  }

  showPrevSlide() {
    const image = this.deck.getPrevImage();
    if (image) this.renderSlide(image, false);
    else this.ui.showToast('Already at the first image!');
  }

  stopForEmptyDeck() {
    clearTimeout(this.timer);
    this.isPlaying = false;
    this.ui.updatePlayPauseUI(false);
    this.ui.showToast('No more displayable images in folder.');
  }

  renderSlide(image, isFirstRun) {
    clearTimeout(this.timer);
    this.cancelPendingImage();
    const request = this.renderRequest;
    const targetLayer = this.activeLayer === 'A' ? this.layerB : this.layerA;
    const oldLayer = this.activeLayer === 'A' ? this.layerA : this.layerB;
    const targetKey = this.activeLayer === 'A' ? 'B' : 'A';
    const transitionClasses = [
      'trans-fade', 'trans-slide-left', 'trans-slide-right', 'trans-zoom-in',
      'trans-zoom-out', 'trans-blur-fade', 'trans-flip-3d'
    ];
    targetLayer.container.classList.remove(...transitionClasses);
    targetLayer.container.classList.add(`trans-${this.getEffectiveTransition()}`);

    const loader = new Image();
    this.pendingImage = loader;
    loader.onload = () => {
      if (request !== this.renderRequest) return;
      this.pendingImage = null;
      targetLayer.bg.style.backgroundImage = `url("${image.url}")`;
      targetLayer.fg.src = image.url;
      this.kenBurns.applyTrajectory(targetLayer.fg, this.slideDuration);
      targetLayer.fg.style.animationPlayState = this.isPlaying ? 'running' : 'paused';
      targetLayer.container.style.transitionDuration = isFirstRun ? '0ms' : `${this.transitionDuration}ms`;
      oldLayer.container.style.transitionDuration = `${this.transitionDuration}ms`;
      targetLayer.container.classList.add('active');
      oldLayer.container.classList.remove('active');
      this.activeLayer = targetKey;

      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = setTimeout(() => {
        if (!oldLayer.container.classList.contains('active')) {
          oldLayer.fg.removeAttribute('src');
          oldLayer.bg.style.backgroundImage = 'none';
        }
      }, isFirstRun ? 0 : this.transitionDuration + 200);

      this.ui.updateImageInfo(image.name, this.deck.getCurrentIndex(), this.deck.getTotalCount());
      if (this.isPlaying) this.restartSlideTimer();
    };
    loader.onerror = () => {
      if (request !== this.renderRequest) return;
      this.pendingImage = null;
      this.deck.discardImage(image);
      this.ui.showToast(`Skipped broken image: ${image.name}`);
      if (this.deck.getTotalCount()) {
        this.timer = setTimeout(() => {
          if (request === this.renderRequest) this.showNextSlide(isFirstRun);
        }, 0);
      } else {
        this.stopForEmptyDeck();
      }
    };
    loader.src = image.url;
  }

  togglePlayPause() {
    if (this.isWelcomeState) return;
    this.isPlaying = !this.isPlaying;
    this.ui.updatePlayPauseUI(this.isPlaying);
    this.layerA.fg.style.animationPlayState = this.isPlaying ? 'running' : 'paused';
    this.layerB.fg.style.animationPlayState = this.isPlaying ? 'running' : 'paused';
    if (this.isPlaying) {
      this.ui.showToast('Resumed');
      if (!this.pendingImage) this.restartSlideTimer();
    } else {
      clearTimeout(this.timer);
      this.ui.showToast('Paused');
    }
  }

  nextSlide() {
    if (!this.isWelcomeState) this.showNextSlide();
  }

  prevSlide() {
    if (!this.isWelcomeState) this.showPrevSlide();
  }

  toggleShuffle() { this.setShuffleState(!this.deck.isShuffle); }
  setShuffleState(enabled) {
    this.deck.setShuffle(enabled);
    this.ui.updateShuffleUI(enabled);
    this.ui.showToast(enabled ? 'True Shuffle enabled' : 'Order playback enabled');
  }

  toggleKenBurns() { this.setKenBurnsState(!this.kenBurns.enabled); }
  setKenBurnsState(enabled) {
    this.kenBurns.enabled = enabled;
    this.ui.updateKenBurnsUI(enabled);
    this.ui.showToast(enabled ? 'Ken Burns effect enabled' : 'Ken Burns effect disabled');
    const currentLayer = this.activeLayer === 'A' ? this.layerA : this.layerB;
    if (currentLayer.fg.hasAttribute('src')) {
      this.kenBurns.applyTrajectory(currentLayer.fg, this.slideDuration);
    }
  }

  toggleInfoBadge() { this.setInfoBadgeState(!this.showInfoBadge); }
  setInfoBadgeState(enabled) {
    this.showInfoBadge = enabled;
    this.ui.updateInfoBadgeUI(enabled);
    this.ui.showToast(enabled ? 'Image info shown' : 'Image info hidden');
  }

  setBlurIntensity(px) {
    const value = Math.max(0, Math.min(80, Number(px) || 0));
    for (const layer of [this.layerA, this.layerB]) {
      layer.bg.style.filter = `blur(${value}px) brightness(0.6) saturate(1.2)`;
    }
  }

  updateTransitionSpeed() {
    for (const layer of [this.layerA, this.layerB]) {
      layer.container.style.transitionDuration = `${this.transitionDuration}ms`;
    }
  }

  restartSlideTimer() {
    clearTimeout(this.timer);
    if (this.isPlaying && !this.isWelcomeState && !this.pendingImage && this.deck.getTotalCount()) {
      this.timer = setTimeout(() => this.showNextSlide(), this.slideDuration);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new SlideshowApp();
});
