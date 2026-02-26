function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildClipPool(url, size, baseVolume) {
  const pool = [];
  for (let i = 0; i < size; i += 1) {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = baseVolume;
    pool.push(audio);
  }

  return {
    pool,
    index: 0,
    baseVolume
  };
}

function safeResetAudio(audio) {
  try {
    audio.pause();
  } catch {}
  try {
    audio.currentTime = 0;
  } catch {}
}

function safePlayAudio(audio) {
  try {
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export class SoundSystem {
  constructor() {
    this.enabled = typeof Audio !== "undefined";
    this.unlocked = false;
    this.clips = new Map();

    if (!this.enabled) {
      return;
    }

    this.clips.set(
      "shot",
      buildClipPool("/assets/audio/weapons/gunshot_0.mp3", 10, 0.42)
    );
    this.clips.set(
      "reload",
      buildClipPool("/assets/audio/weapons/gun_reload_lock_or_click_sound.mp3", 4, 0.5)
    );
    this.clips.set(
      "dry",
      buildClipPool("/assets/audio/weapons/gun_reload_lock_or_click_sound.mp3", 3, 0.24)
    );
  }

  unlock() {
    if (!this.enabled || this.unlocked) {
      return;
    }
    this.unlocked = true;

    for (const clip of this.clips.values()) {
      const audio = clip.pool[0];
      if (!audio) {
        continue;
      }

      const previousVolume = audio.volume;
      audio.volume = 0;
      safeResetAudio(audio);
      const playPromise = audio.play?.();

      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            safeResetAudio(audio);
            audio.volume = previousVolume;
          })
          .catch(() => {
            audio.volume = previousVolume;
          });
      } else {
        safeResetAudio(audio);
        audio.volume = previousVolume;
      }
    }
  }

  play(name, options = {}) {
    if (!this.enabled) {
      return;
    }

    const clip = this.clips.get(name);
    if (!clip || clip.pool.length === 0) {
      return;
    }

    const audio = clip.pool[clip.index];
    clip.index = (clip.index + 1) % clip.pool.length;

    const gain = options.gain ?? 1;
    const rateJitter = Math.max(0, options.rateJitter ?? 0);
    const rate = 1 + (Math.random() * 2 - 1) * rateJitter;

    safeResetAudio(audio);
    audio.volume = clamp(clip.baseVolume * gain, 0, 1);
    audio.playbackRate = clamp(rate, 0.5, 2);
    safePlayAudio(audio);
  }
}
