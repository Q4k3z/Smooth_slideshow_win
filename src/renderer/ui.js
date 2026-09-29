/**
 * UI Controls, Mouse Autohide, Hotkeys & Settings Modal
 */
class UIController {
  constructor(app) {
    this.app = app;
    this.idleTimer = null;
    this.idleTimeoutMs = 3000;
    this.floatingBar = document.getElementById('floating-controls');
    this.infoBadge = document.getElementById('info-badge');
    this.settingsModal = document.getElementById('settings-modal');
    this.toastEl = document.getElementById('toast');
    this.toastTimer = null;

    this.initEvents();
  }

  initEvents() {
    // Window header buttons
    document.getElementById('btn-min')?.addEventListener('click', () => {
      window.electronAPI.minimizeWindow();
    });
    document.getElementById('btn-max')?.addEventListener('click', () => {
      this.toggleFullscreen();
    });
    document.getElementById('btn-close')?.addEventListener('click', () => {
      window.electronAPI.closeWindow();
    });

    // Control buttons
    document.getElementById('btn-prev').addEventListener('click', () => this.app.prevSlide());
    document.getElementById('btn-play-pause').addEventListener('click', () => this.app.togglePlayPause());
    document.getElementById('btn-next').addEventListener('click', () => this.app.nextSlide());
    document.getElementById('btn-toggle-shuffle').addEventListener('click', () => this.app.toggleShuffle());
    document.getElementById('btn-toggle-kenburns').addEventListener('click', () => this.app.toggleKenBurns());
    document.getElementById('btn-toggle-info').addEventListener('click', () => this.app.toggleInfoBadge());
    document.getElementById('btn-change-folder').addEventListener('click', () => this.app.selectFolder());
    document.getElementById('btn-fullscreen').addEventListener('click', () => this.toggleFullscreen());
    document.getElementById('btn-settings').addEventListener('click', () => this.openSettings());

    // Sync fullscreen state from Electron window event
    window.electronAPI.onFullscreenChange?.((isFull) => {
      if (isFull) {
        document.body.classList.add('fullscreen');
      } else {
        document.body.classList.remove('fullscreen');
      }
    });

    // Settings Modal
    document.getElementById('btn-close-settings').addEventListener('click', () => this.closeSettings());
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettings();
    });

    // Settings Inputs
    document.getElementById('setting-duration').addEventListener('change', (e) => {
      this.app.slideDuration = parseInt(e.target.value, 10);
      this.app.restartSlideTimer();
    });

    document.getElementById('setting-transition-type').addEventListener('change', (e) => {
      this.app.transitionType = e.target.value;
      this.showToast(`Transition: ${e.target.options[e.target.selectedIndex].text}`);
    });

    document.getElementById('setting-transition-duration').addEventListener('change', (e) => {
      this.app.transitionDuration = parseInt(e.target.value, 10);
      this.app.updateTransitionSpeed();
    });

    const blurSlider = document.getElementById('setting-blur-intensity');
    blurSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      document.getElementById('blur-intensity-val').innerText = `${val}px`;
      this.app.setBlurIntensity(val);
    });

    document.getElementById('setting-kenburns-zoom').addEventListener('input', (e) => {
      const zoom = Number(e.target.value) / 100;
      this.app.kenBurns.maxZoom = zoom;
      document.getElementById('kenburns-zoom-val').innerText = `${zoom.toFixed(2)}x`;
      const currentLayer = this.app.activeLayer === 'A' ? this.app.layerA : this.app.layerB;
      currentLayer.fg.style.setProperty('--kb-max-zoom', zoom);
    });

    document.getElementById('setting-info-badge-toggle').addEventListener('change', (e) => {
      this.app.setInfoBadgeState(e.target.checked);
    });

    document.getElementById('setting-kenburns-toggle').addEventListener('change', (e) => {
      this.app.setKenBurnsState(e.target.checked);
    });

    document.getElementById('setting-shuffle-toggle').addEventListener('change', (e) => {
      this.app.setShuffleState(e.target.checked);
    });

    // Welcome screen folder button
    document.getElementById('btn-open-folder-welcome').addEventListener('click', () => this.app.selectFolder());

    // Drag & Drop folder support on Welcome Screen
    const welcomeScreen = document.getElementById('welcome-screen');
    welcomeScreen.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    welcomeScreen.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await this.app.loadDroppedFolder(e.dataTransfer.files[0]);
      }
    });

    // Double click stage to toggle fullscreen
    document.getElementById('slideshow-stage').addEventListener('dblclick', () => {
      this.toggleFullscreen();
    });

    // Mouse Movement / Idle autohide
    window.addEventListener('mousemove', (e) => this.resetIdleTimer(e));
    window.addEventListener('mousedown', (e) => this.resetIdleTimer(e));

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (this.settingsModal.classList.contains('hidden') === false) {
        if (e.key === 'Escape') this.closeSettings();
        if (e.key === 'Tab') {
          const controls = [...this.settingsModal.querySelectorAll('button, select, input')];
          if (e.shiftKey && document.activeElement === controls[0]) {
            e.preventDefault();
            controls[controls.length - 1].focus();
          } else if (!e.shiftKey && document.activeElement === controls[controls.length - 1]) {
            e.preventDefault();
            controls[0].focus();
          }
        }
        return;
      }
      if (e.target.closest?.('button, input, select, textarea, [contenteditable="true"]') &&
          e.key !== 'Escape' && e.key !== 'F11') return;

      switch (e.key) {
        case ' ':
          this.app.togglePlayPause();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          this.app.nextSlide();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          this.app.prevSlide();
          break;
        case 'f':
        case 'F':
        case 'F11':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'i':
        case 'I':
          this.app.toggleInfoBadge();
          break;
        case 's':
        case 'S':
          this.app.toggleShuffle();
          break;
        case 'k':
        case 'K':
          this.app.toggleKenBurns();
          break;
        case 'o':
        case 'O':
          this.app.selectFolder();
          break;
        case 'Escape':
          window.electronAPI.isFullscreen().then(isFull => {
            if (isFull) this.toggleFullscreen();
          });
          break;
      }
    });
  }

  async toggleFullscreen() {
    try {
      if (window.electronAPI && window.electronAPI.toggleFullscreen) {
        const isFull = await window.electronAPI.toggleFullscreen();
        if (isFull) {
          document.body.classList.add('fullscreen');
        } else {
          document.body.classList.remove('fullscreen');
        }
        return;
      }
    } catch (err) {
      console.warn('Electron toggleFullscreen fallback to DOM fullscreen:', err);
    }

    // Standard DOM fullscreen fallback
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      document.body.classList.add('fullscreen');
    } else {
      document.exitFullscreen().catch(() => {});
      document.body.classList.remove('fullscreen');
    }
  }

  resetIdleTimer(e) {
    document.body.classList.remove('hide-cursor');
    this.floatingBar.classList.remove('idle-hidden');
    this.infoBadge.style.opacity = '1';

    // If mouse is near top edge (<= 40px), show header temporarily
    if (e && e.clientY <= 40) {
      document.body.classList.add('show-header');
    } else {
      document.body.classList.remove('show-header');
    }

    clearTimeout(this.idleTimer);
    if (this.app.isPlaying && !this.app.isWelcomeState) {
      this.idleTimer = setTimeout(() => {
        document.body.classList.add('hide-cursor');
        this.floatingBar.classList.add('idle-hidden');
        this.infoBadge.style.opacity = '0';
        document.body.classList.remove('show-header');
      }, this.idleTimeoutMs);
    }
  }

  openSettings() {
    this.focusBeforeSettings = document.activeElement;
    this.settingsModal.classList.remove('hidden');
    this.settingsModal.setAttribute('aria-hidden', 'false');
    document.getElementById('btn-close-settings').focus();
  }

  closeSettings() {
    this.settingsModal.classList.add('hidden');
    this.settingsModal.setAttribute('aria-hidden', 'true');
    (this.focusBeforeSettings || document.getElementById('btn-settings')).focus();
  }

  showToast(msg) {
    document.getElementById('toast-message').innerText = msg;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, 3500);
  }

  updatePlayPauseUI(isPlaying) {
    const btn = document.getElementById('btn-play-pause');
    btn.innerHTML = isPlaying ? '⏸' : '▶';
    btn.title = isPlaying ? 'Pause (Space)' : 'Play (Space)';
  }

  updateShuffleUI(enabled) {
    const btn = document.getElementById('btn-toggle-shuffle');
    const chk = document.getElementById('setting-shuffle-toggle');
    btn.setAttribute('aria-pressed', String(enabled));
    if (enabled) {
      btn.classList.add('active');
      chk.checked = true;
    } else {
      btn.classList.remove('active');
      chk.checked = false;
    }
  }

  updateKenBurnsUI(enabled) {
    const btn = document.getElementById('btn-toggle-kenburns');
    const chk = document.getElementById('setting-kenburns-toggle');
    btn.setAttribute('aria-pressed', String(enabled));
    if (enabled) {
      btn.classList.add('active');
      chk.checked = true;
    } else {
      btn.classList.remove('active');
      chk.checked = false;
    }
  }

  updateInfoBadgeUI(enabled) {
    const btn = document.getElementById('btn-toggle-info');
    const chk = document.getElementById('setting-info-badge-toggle');
    btn.setAttribute('aria-pressed', String(enabled));
    if (enabled) {
      btn.classList.add('active');
      chk.checked = true;
      this.infoBadge.classList.remove('hidden');
    } else {
      btn.classList.remove('active');
      chk.checked = false;
      this.infoBadge.classList.add('hidden');
    }
  }

  updateImageInfo(filename, currentIdx, totalCount) {
    document.getElementById('info-filename').innerText = filename;
    document.getElementById('info-counter').innerText = `${currentIdx} / ${totalCount}`;
  }
}

window.UIController = UIController;
