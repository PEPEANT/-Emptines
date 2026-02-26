export class HUD {
  constructor() {
    this.healthEl = document.getElementById("hud-health");
    this.scoreEl = document.getElementById("hud-score");
    this.ammoEl = document.getElementById("hud-ammo");
    this.reserveEl = document.getElementById("hud-reserve");
    this.statusEl = document.getElementById("hud-status");

    this.crosshairEl = document.getElementById("crosshair");
    this.hitmarkerEl = document.getElementById("hitmarker");
    this.damageOverlayEl = document.getElementById("damage-overlay");

    this.startOverlayEl = document.getElementById("start-overlay");
    this.pauseOverlayEl = document.getElementById("pause-overlay");
    this.gameOverOverlayEl = document.getElementById("gameover-overlay");
    this.finalScoreEl = document.getElementById("final-score");

    this.statusTimer = 0;
    this.damageOverlayTimeout = null;
    this.hitmarkerTimeout = null;
  }

  update(delta, state) {
    this.healthEl.textContent = `${state.health}`;
    this.scoreEl.textContent = `${state.score}`;
    this.ammoEl.textContent = `${state.ammo}`;
    this.reserveEl.textContent = `${state.reserve}`;

    if (state.reloading) {
      this.statusEl.textContent = "재장전 중...";
      this.statusEl.classList.add("is-alert");
    } else if (this.statusTimer <= 0) {
      this.statusEl.textContent = "전투 중";
      this.statusEl.classList.remove("is-alert");
    }

    this.statusTimer = Math.max(0, this.statusTimer - delta);
  }

  setStatus(text, isAlert = false, duration = 0.5) {
    this.statusEl.textContent = text;
    this.statusEl.classList.toggle("is-alert", isAlert);
    this.statusTimer = duration;
  }

  showStartOverlay(visible) {
    this.startOverlayEl.classList.toggle("show", visible);
  }

  showPauseOverlay(visible) {
    this.pauseOverlayEl.classList.toggle("show", visible);
  }

  showGameOver(score) {
    this.finalScoreEl.textContent = `${score}`;
    this.gameOverOverlayEl.classList.add("show");
  }

  hideGameOver() {
    this.gameOverOverlayEl.classList.remove("show");
  }

  pulseCrosshair() {
    this.crosshairEl.classList.remove("pulse");
    this.crosshairEl.offsetWidth;
    this.crosshairEl.classList.add("pulse");
  }

  pulseHitmarker() {
    this.hitmarkerEl.classList.remove("show");
    this.hitmarkerEl.offsetWidth;
    this.hitmarkerEl.classList.add("show");

    if (this.hitmarkerTimeout !== null) {
      window.clearTimeout(this.hitmarkerTimeout);
    }
    this.hitmarkerTimeout = window.setTimeout(() => {
      this.hitmarkerEl.classList.remove("show");
      this.hitmarkerTimeout = null;
    }, 160);
  }

  flashDamage() {
    this.damageOverlayEl.classList.remove("show");
    this.damageOverlayEl.offsetWidth;
    this.damageOverlayEl.classList.add("show");

    if (this.damageOverlayTimeout !== null) {
      window.clearTimeout(this.damageOverlayTimeout);
    }
    this.damageOverlayTimeout = window.setTimeout(() => {
      this.damageOverlayEl.classList.remove("show");
      this.damageOverlayTimeout = null;
    }, 120);
  }
}
