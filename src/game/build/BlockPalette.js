export const BLOCK_TYPES = [
  {
    id: 1,
    key: "grass",
    name: "Grass",
    texture: "/assets/graphics/world/blocks/kenney/grass.png"
  },
  {
    id: 2,
    key: "dirt",
    name: "Dirt",
    texture: "/assets/graphics/world/blocks/kenney/dirt.png"
  },
  {
    id: 3,
    key: "stone",
    name: "Stone",
    texture: "/assets/graphics/world/blocks/kenney/stone.png"
  },
  {
    id: 4,
    key: "sand",
    name: "Sand",
    texture: "/assets/graphics/world/blocks/kenney/sand.png"
  },
  {
    id: 5,
    key: "clay",
    name: "Clay",
    texture: "/assets/graphics/world/blocks/kenney/clay.png"
  },
  {
    id: 6,
    key: "brick",
    name: "Brick",
    texture: "/assets/graphics/world/blocks/kenney/brick.png"
  },
  {
    id: 7,
    key: "ice",
    name: "Ice",
    texture: "/assets/graphics/world/blocks/kenney/ice.png"
  },
  {
    id: 8,
    key: "metal",
    name: "Metal",
    texture: "/assets/graphics/world/blocks/kenney/metal.png"
  }
];

export const BLOCK_TYPE_BY_ID = new Map(BLOCK_TYPES.map((type) => [type.id, type]));

export function getBlockTypeBySlot(slot) {
  return BLOCK_TYPES[Math.max(0, Math.min(BLOCK_TYPES.length - 1, slot - 1))];
}

