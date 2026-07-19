export const GRID_SIZE = 4;

const AXIS_COLORS = {
  x: { negative: "green", positive: "blue" },
  y: { negative: "yellow", positive: "white" },
  z: { negative: "orange", positive: "red" },
};

const COLOR_AXIS = Object.freeze({ green: "x", blue: "x", yellow: "y", white: "y", orange: "z", red: "z" });

export const COLOR_SHORT = Object.freeze({ red: "r", orange: "o", white: "w", yellow: "y", blue: "b", green: "g" });
export const COLOR_LONG = Object.freeze(Object.fromEntries(Object.entries(COLOR_SHORT).map(([long, short]) => [short, long])));

export function moduleColors(position) {
  const colors = [];
  if (position.z) colors.push(position.z > 0 ? "red" : "orange");
  if (position.y) colors.push(position.y > 0 ? "white" : "yellow");
  if (position.x) colors.push(position.x > 0 ? "blue" : "green");
  return colors;
}

export function moduleId(position) {
  const colors = moduleColors(position);
  return colors.length ? colors.map((color) => COLOR_SHORT[color]).join("/") : "core";
}

export function moduleLabel(position) {
  const colors = moduleColors(position);
  return colors.length ? colors.map((color) => color[0].toUpperCase() + color.slice(1)).join(" / ") : "Core";
}

export function createModules() {
  const modules = [];
  for (let x = -1; x <= 1; x += 1) for (let y = -1; y <= 1; y += 1) for (let z = -1; z <= 1; z += 1) {
    const position = { x, y, z };
    modules.push({ id: moduleId(position), label: moduleLabel(position), position, colors: moduleColors(position) });
  }
  return modules;
}

export function coordinateArrayToCell(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length !== 6) throw new Error("Coordinates must be an array of six values: [face, face, face, x, y, z].");
  const [a, b, c, x, y, z] = coordinate;
  const faces = [a, b, c].map((face) => COLOR_LONG[face] ?? face);
  const values = [x, y, z];
  if (new Set(faces).size !== 3 || !faces.every((face) => Object.hasOwn(COLOR_SHORT, face))) throw new Error("The first three coordinate values must be three distinct cube-face colors.");
  if (!values.every((value) => Number.isInteger(value) && value >= 0 && value < GRID_SIZE)) throw new Error("Grid values must be whole numbers from 0 through 3.");
  const cell = { x: 0, y: 0, z: 0 };
  const axes = [];
  const assigned = new Set();
  for (let index = 0; index < 3; index += 1) {
    const color = faces[index]; const value = values[index];
    const axis = COLOR_AXIS[color];
    if (assigned.has(axis)) throw new Error("Coordinates need one color from each opposite-face pair.");
    assigned.add(axis);
    axes.push(axis);
    cell[axis] = color === AXIS_COLORS[axis].negative ? value : GRID_SIZE - 1 - value;
  }
  if (assigned.size !== 3) throw new Error("Coordinates need one color from each opposite-face pair.");
  return { faces, axes, cell };
}

export function validatePlacement(placement) {
  const { faces, axes, cell } = coordinateArrayToCell(placement.coordinate);
  if (!['obstacle', 'golden_banana', 'door', 'spawn'].includes(placement.kind)) throw new Error("Unknown placeable item.");
  if (placement.kind === "door") {
    if (placement.coordinate[5] !== 0) throw new Error("A door's third distance must be 0; the third color selects its face.");
  }
  return { ...placement, coordinate: [...placement.coordinate], faces, axes, cell, ...(placement.kind === "door" ? { doorFace: faces[2], doorAxis: axes[2] } : {}) };
}

export function validateLevel(level) {
  if (!level?.modules || level.modules.length !== 27) throw new Error("A level must contain all 27 world cube modules.");
  const ids = new Set(level.modules.map((module) => module.id));
  if (ids.size !== 27) throw new Error("World module IDs must be unique.");
  const items = level.items.map(validatePlacement);
  if (items.filter((item) => item.kind === "spawn").length !== 1) throw new Error("Every level requires exactly one spawn point.");
  const occupied = new Set();
  for (const item of items) {
    if (!ids.has(item.moduleId)) throw new Error(`Unknown module: ${item.moduleId}`);
    if (item.kind !== "door") {
      const key = `${item.moduleId}:${item.cell.x},${item.cell.y},${item.cell.z}`;
      if (occupied.has(key)) throw new Error("Only one non-door item may occupy a grid cell.");
      occupied.add(key);
    }
  }
  return { ...level, items };
}

export function createPrimaryLevel() {
  return validateLevel({
    id: "primary-world", slug: "primary-world", name: "Primary World", modules: createModules(),
    // The live puzzle's initial content is preserved, expressed as requested
    // six-value face-relative coordinates.
    items: [
      { id: "spawn", moduleId: "r/w/b", kind: "spawn", coordinate: ["g", "o", "y", 1, 1, 0] },
      { id: "obstacle", moduleId: "r/w/b", kind: "obstacle", coordinate: ["g", "o", "y", 0, 0, 0] },
      { id: "banana", moduleId: "r/w/b", kind: "golden_banana", coordinate: ["g", "o", "y", 0, 0, 1] },
      { id: "door-rwb", moduleId: "r/w/b", kind: "door", coordinate: ["g", "y", "o", 3, 0, 0], targetModuleId: "w/b" },
      { id: "door-wb", moduleId: "w/b", kind: "door", coordinate: ["g", "y", "r", 3, 0, 0], targetModuleId: "r/w/b" },
    ],
  });
}
