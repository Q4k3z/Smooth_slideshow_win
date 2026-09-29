/**
 * Ken Burns Motion Trajectory Controller
 */
class KenBurnsEngine {
  constructor() {
    this.enabled = true;
    this.maxZoom = 1.2;
    this.lastTrajectory = -1;
  }

  applyTrajectory(imageElement, durationMs) {
    if (!imageElement) return;

    // Remove existing animation classes
    imageElement.classList.remove('kb-traj-0', 'kb-traj-1', 'kb-traj-2', 'kb-traj-3', 'kb-disabled');

    if (!this.enabled) {
      imageElement.classList.add('kb-disabled');
      return;
    }

    // Select random trajectory (avoiding duplicate trajectory on consecutive slides)
    let traj = Math.floor(Math.random() * 4);
    if (traj === this.lastTrajectory) {
      traj = (traj + 1) % 4;
    }
    this.lastTrajectory = traj;

    // Set duration custom property in CSS (add 1s buffer so keyframe doesn't snap before slide transition)
    const animDurationSec = (durationMs + 1000) / 1000;
    imageElement.style.setProperty('--kb-duration', `${animDurationSec}s`);
    imageElement.style.setProperty('--kb-max-zoom', this.maxZoom);

    // Force reflow to restart CSS animation cleanly
    void imageElement.offsetWidth;

    imageElement.classList.add(`kb-traj-${traj}`);
  }
}

window.KenBurnsEngine = KenBurnsEngine;
