import * as THREE from "three";
import { BLOCK_TYPES, getBlockTypeBySlot } from "./BlockPalette.js";

const CENTER = new THREE.Vector2(0, 0);
const TOOL_LABELS = {
  place: "설치",
  dig: "삽",
  gun: "총"
};

export class BuildSystem {
  constructor({ world, camera, raycaster, onModeChanged = null, onStatus = null }) {
    this.world = world;
    this.camera = camera;
    this.raycaster = raycaster;
    this.onModeChanged = onModeChanged;
    this.onStatus = onStatus;

    this.toolMode = "gun";
    this.selectedSlot = 1;
    this.maxReach = 12;

    this.modeBadgeEl = document.getElementById("build-mode-badge");
    this.hotbarSlots = Array.from(document.querySelectorAll(".hotbar-slot"));
    this.renderUi();
  }

  isBuildMode() {
    return this.toolMode === "place" || this.toolMode === "dig";
  }

  isGunMode() {
    return this.toolMode === "gun";
  }

  isPlaceMode() {
    return this.toolMode === "place";
  }

  isDigMode() {
    return this.toolMode === "dig";
  }

  getToolMode() {
    return this.toolMode;
  }

  getSelectedType() {
    return getBlockTypeBySlot(this.selectedSlot);
  }

  setToolMode(mode, { silentStatus = false } = {}) {
    if (mode !== "gun" && mode !== "place" && mode !== "dig") {
      return;
    }
    if (this.toolMode === mode) {
      return;
    }

    this.toolMode = mode;
    this.renderUi();
    this.onModeChanged?.(this.toolMode);

    if (silentStatus) {
      return;
    }

    if (this.toolMode === "place") {
      this.onStatus?.("설치 모드 (좌클릭으로 블록 설치)", false, 0.9);
      return;
    }
    if (this.toolMode === "dig") {
      this.onStatus?.("삽 모드 (좌클릭으로 블록 제거)", false, 0.9);
      return;
    }

    this.onStatus?.("총 모드 (좌클릭 사격 / 우클릭 조준)", false, 0.9);
  }

  setMode(mode) {
    if (mode === "weapon") {
      this.setToolMode("gun");
      return;
    }
    if (mode === "build") {
      this.setToolMode("place");
      return;
    }
    this.setToolMode(mode);
  }

  toggleMode() {
    this.setToolMode(this.isGunMode() ? "place" : "gun");
  }

  setSlot(slot) {
    const clamped = Math.max(1, Math.min(BLOCK_TYPES.length, slot));
    if (this.selectedSlot === clamped) {
      return;
    }

    this.selectedSlot = clamped;
    this.renderUi();

    const type = this.getSelectedType();
    this.onStatus?.(`블록 선택: ${type.name}`, false, 0.45);
  }

  cycleSlot(step) {
    const total = BLOCK_TYPES.length;
    const next = ((this.selectedSlot - 1 + step + total) % total) + 1;
    this.setSlot(next);
  }

  handleWheel(event) {
    if (!this.isBuildMode()) {
      return false;
    }

    const delta = event.deltaY > 0 ? 1 : -1;
    this.cycleSlot(delta);
    return true;
  }

  handleKeyDown(event) {
    if (event.code === "KeyQ") {
      this.toggleMode();
      return true;
    }

    if (event.code === "Digit1") {
      this.setToolMode("place");
      return true;
    }
    if (event.code === "Digit2") {
      this.setToolMode("dig");
      return true;
    }
    if (event.code === "Digit3") {
      this.setToolMode("gun");
      return true;
    }

    const numpadMatch = /^Numpad([1-8])$/.exec(event.code);
    if (numpadMatch) {
      this.setSlot(Number(numpadMatch[1]));
      return true;
    }

    return false;
  }

  handlePointerAction(button, canPlace = null) {
    if (!this.isBuildMode()) {
      return false;
    }

    if (button !== 0 && button !== 2) {
      return false;
    }

    if (button === 2) {
      return true;
    }

    this.raycaster.setFromCamera(CENTER, this.camera);
    const hit = this.world.raycast(this.raycaster, this.maxReach);
    if (!hit) {
      if (this.isPlaceMode()) {
        this.onStatus?.("설치 기준 블록이 범위 안에 없습니다", true, 0.2);
      } else {
        this.onStatus?.("제거할 블록이 범위 안에 없습니다", true, 0.2);
      }
      return true;
    }

    if (this.isPlaceMode()) {
      const placed = this.world.placeAdjacent(hit, this.getSelectedType().id, canPlace);
      if (!placed) {
        this.onStatus?.("블록을 설치할 수 없습니다", true, 0.3);
      }
      return true;
    }

    if (this.isDigMode()) {
      const removed = this.world.removeFromHit(hit);
      if (!removed) {
        this.onStatus?.("블록을 제거할 수 없습니다", true, 0.3);
      }
      return true;
    }

    return false;
  }

  renderUi() {
    if (this.modeBadgeEl) {
      this.modeBadgeEl.textContent = `모드: ${TOOL_LABELS[this.toolMode]}`;
    }

    for (const slotEl of this.hotbarSlots) {
      const slotValue = Number(slotEl.dataset.slot ?? "0");
      slotEl.classList.toggle("is-selected", slotValue === this.selectedSlot);
    }
  }
}
