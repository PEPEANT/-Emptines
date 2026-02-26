export class WeaponSystem {
  constructor() {
    this.magazineSize = 30;
    this.defaultReserve = 150;
    this.reloadDuration = 1.25;
    this.shotCooldown = 0.1;
    this.reset();
  }

  reset() {
    this.ammo = this.magazineSize;
    this.reserve = this.defaultReserve;
    this.cooldownTimer = 0;
    this.reloadTimer = 0;
    this.reloading = false;
  }

  update(delta) {
    this.cooldownTimer = Math.max(0, this.cooldownTimer - delta);

    if (!this.reloading) {
      return;
    }

    this.reloadTimer -= delta;
    if (this.reloadTimer > 0) {
      return;
    }

    const needed = this.magazineSize - this.ammo;
    const loaded = Math.min(needed, this.reserve);
    this.ammo += loaded;
    this.reserve -= loaded;
    this.reloading = false;
    this.reloadTimer = 0;
  }

  tryShoot() {
    if (this.reloading) {
      return { success: false, reason: "reloading" };
    }

    if (this.cooldownTimer > 0) {
      return { success: false, reason: "cooldown" };
    }

    if (this.ammo <= 0) {
      this.startReload();
      return { success: false, reason: "empty" };
    }

    this.ammo -= 1;
    this.cooldownTimer = this.shotCooldown;

    if (this.ammo === 0 && this.reserve > 0) {
      this.startReload();
    }

    return { success: true };
  }

  startReload() {
    if (this.reloading || this.ammo >= this.magazineSize || this.reserve <= 0) {
      return false;
    }

    this.reloading = true;
    this.reloadTimer = this.reloadDuration;
    return true;
  }

  getState() {
    return {
      ammo: this.ammo,
      reserve: this.reserve,
      reloading: this.reloading
    };
  }
}

