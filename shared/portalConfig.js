export const DEFAULT_PORTAL_TARGET_URL = "https://singularity-ox.onrender.com/?v=0.2";
export const DEFAULT_A_ZONE_PORTAL_TARGET_URL = "https://reclaim-fps.onrender.com/";
export const DEFAULT_HALL_PORTAL_TARGET_URL =
  "https://performance-i3w5.onrender.com/performance/?host=0&room=event01&from=emptines";

export const PORTAL_DISPLAY_KEYS = Object.freeze(["portal1", "portal2", "hall"]);

export const PORTAL_DISPLAY_DEFAULTS = Object.freeze({
  portal1: Object.freeze({
    mode: "text",
    title: "OX 퀴즈 대회",
    line2: "포탈 1 링크는 패널에서 변경",
    line3: ""
  }),
  portal2: Object.freeze({
    mode: "text",
    title: "포탈 2",
    line2: "포탈 2 링크는 패널에서 변경",
    line3: ""
  }),
  hall: Object.freeze({
    mode: "time",
    title: "공연장",
    line2: "",
    line3: ""
  })
});

export const ROOM_ZONE_IDS = Object.freeze(["lobby", "fps", "ox"]);

export const ROOM_ZONE_PORTAL_OBJECT_ID_BY_ZONE = Object.freeze({
  fps: "portal_fps",
  ox: "portal_ox",
  hall: "portal_hall"
});

export function getPortalDisplayDefaults(rawPortalKey, fallbackKey = "portal1") {
  const portalKey = String(rawPortalKey ?? "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PORTAL_DISPLAY_DEFAULTS, portalKey)) {
    return PORTAL_DISPLAY_DEFAULTS[portalKey];
  }

  const normalizedFallbackKey = String(fallbackKey ?? "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PORTAL_DISPLAY_DEFAULTS, normalizedFallbackKey)) {
    return PORTAL_DISPLAY_DEFAULTS[normalizedFallbackKey];
  }

  return PORTAL_DISPLAY_DEFAULTS.portal1;
}
