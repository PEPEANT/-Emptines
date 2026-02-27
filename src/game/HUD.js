const THREAT_LABELS = ["", "낮음", "주의", "높음", "위험", "극한"];

function setText(el, value) {
  if (el) {
    const nextValue = String(value);
    if (el.textContent !== nextValue) {
      el.textContent = nextValue;
    }
  }
}

function toggleClass(el, className, enabled) {
  if (el) {
    el.classList.toggle(className, enabled);
  }
}

export class HUD {
  constructor() {
    this.healthEl = document.getElementById("hud-health");
    this.scoreEl = document.getElementById("hud-score");
    this.ammoEl = document.getElementById("hud-ammo");
    this.reserveEl = document.getElementById("hud-reserve");
    this.statusEl = document.getElementById("hud-status");

    this.healthBarEl = document.getElementById("hud-health-bar");
    this.killsEl = document.getElementById("hud-kills");
    this.enemiesEl = document.getElementById("hud-enemies");
    this.capturesEl = document.getElementById("hud-captures");
    this.controlEl = document.getElementById("hud-control");
    this.objectiveEl = document.getElementById("hud-objective");
    this.threatEl = document.getElementById("hud-threat");
    this.streakEl = document.getElementById("hud-streak");

    this.crosshairEl = document.getElementById("crosshair");
    this.hitmarkerEl = document.getElementById("hitmarker");
    this.damageOverlayEl = document.getElementById("damage-overlay");

    this.startOverlayEl = document.getElementById("start-overlay");
    this.pauseOverlayEl = document.getElementById("pause-overlay");
    this.gameOverOverlayEl = document.getElementById("gameover-overlay");
    this.finalScoreEl = document.getElementById("final-score");
    this.deconstructOverlayEl = document.getElementById("deconstruct-overlay");
    this.deconstructTitleEl = document.getElementById("deconstruct-phase-title");
    this.deconstructTextEl = document.getElementById("deconstruct-phase-text");

    this.statusTimer = 0;
    this.damageOverlayTimeout = null;
    this.hitmarkerTimeout = null;
    this.lastHealthBarWidth = "";
    this.lastHealthBarColor = "";
  }

  update(delta, state) {
    setText(this.healthEl, `${state.health}`);
    setText(this.scoreEl, `${state.score}`);
    setText(this.ammoEl, `${state.ammo}`);
    setText(this.reserveEl, `${state.reserve}`);
    setText(this.killsEl, `${state.kills ?? 0}`);
    setText(this.enemiesEl, `${state.enemyCount ?? 0}`);
    setText(this.capturesEl, `${state.captures ?? 0}`);

    const controlPercent = Math.max(0, Math.min(100, Number(state.controlPercent ?? 0)));
    const controlOwner = state.controlOwner ?? "neutral";
    const controlText = controlOwner === "alpha" ? `확보 ${controlPercent}%` : `${controlPercent}%`;
    setText(this.controlEl, controlText);

    setText(this.objectiveEl, `${state.objectiveText ?? "목표: 적 깃발을 확보하세요"}`);

    const hp = Math.max(0, Math.min(100, state.health));
    if (this.healthBarEl) {
      const width = `${hp}%`;
      if (this.lastHealthBarWidth !== width) {
        this.healthBarEl.style.width = width;
        this.lastHealthBarWidth = width;
      }
      let nextColor = "var(--ui-ok)";
      if (hp <= 25) {
        nextColor = "#ff4444";
      } else if (hp <= 50) {
        nextColor = "var(--ui-alert)";
      }
      if (this.lastHealthBarColor !== nextColor) {
        this.healthBarEl.style.background = nextColor;
        this.lastHealthBarColor = nextColor;
      }
    }

    const threat = Math.min(5, Math.floor((state.score ?? 0) / 500) + 1);
    setText(this.threatEl, `위협 단계 ${THREAT_LABELS[threat]}`);

    if (state.reloading) {
      setText(this.statusEl, "재장전 중...");
      this.statusEl?.classList.add("is-alert");
    } else if (this.statusTimer <= 0) {
      setText(this.statusEl, "전투 중");
      this.statusEl?.classList.remove("is-alert");
    }

    this.statusTimer = Math.max(0, this.statusTimer - delta);
  }

  setStatus(text, isAlert = false, duration = 0.5) {
    setText(this.statusEl, text);
    toggleClass(this.statusEl, "is-alert", isAlert);
    this.statusTimer = duration;
  }

  setKillStreak(streak) {
    if (streak >= 3) {
      setText(this.streakEl, `${streak}연속 처치`);
    } else {
      setText(this.streakEl, "");
    }
  }

  showStartOverlay(visible) {
    toggleClass(this.startOverlayEl, "show", visible);
  }

  showPauseOverlay(visible) {
    toggleClass(this.pauseOverlayEl, "show", visible);
  }

  showGameOver(score) {
    setText(this.finalScoreEl, `${score}`);
    this.gameOverOverlayEl?.classList.add("show");
  }

  showDeconstructOverlay(visible, title = "", text = "") {
    if (this.deconstructTitleEl && title) {
      setText(this.deconstructTitleEl, title);
    }
    if (this.deconstructTextEl && text) {
      setText(this.deconstructTextEl, text);
    }
    toggleClass(this.deconstructOverlayEl, "show", visible);
  }

  hideGameOver() {
    this.gameOverOverlayEl?.classList.remove("show");
  }

  pulseCrosshair() {
    if (!this.crosshairEl) {
      return;
    }
    this.crosshairEl.classList.remove("pulse");
    this.crosshairEl.offsetWidth;
    this.crosshairEl.classList.add("pulse");
  }

  pulseHitmarker() {
    if (!this.hitmarkerEl) {
      return;
    }
    this.hitmarkerEl.classList.remove("show");
    this.hitmarkerEl.offsetWidth;
    this.hitmarkerEl.classList.add("show");

    if (this.hitmarkerTimeout !== null) {
      window.clearTimeout(this.hitmarkerTimeout);
    }
    this.hitmarkerTimeout = window.setTimeout(() => {
      this.hitmarkerEl?.classList.remove("show");
      this.hitmarkerTimeout = null;
    }, 160);
  }

  flashDamage() {
    if (!this.damageOverlayEl) {
      return;
    }
    this.damageOverlayEl.classList.remove("show");
    this.damageOverlayEl.offsetWidth;
    this.damageOverlayEl.classList.add("show");

    if (this.damageOverlayTimeout !== null) {
      window.clearTimeout(this.damageOverlayTimeout);
    }
    this.damageOverlayTimeout = window.setTimeout(() => {
      this.damageOverlayEl?.classList.remove("show");
      this.damageOverlayTimeout = null;
    }, 120);
  }
}
