import { formatRotationScript, type LevelDefinitionV1, type RotationRule, type WorldPiece } from "./level-engine.ts";

const tutorialRules: RotationRule[] = [
  { id: "red", selector: { type: "layer", axis: "x", coordinate: 1 }, pivot: [1, 0, 0], axis: "x", quarterTurn: -1, triggers: [{ grab: "y", drag: "z" }, { grab: "z", drag: "y" }] },
  { id: "orange", selector: { type: "layer", axis: "x", coordinate: -1 }, pivot: [-1, 0, 0], axis: "x", quarterTurn: 1, triggers: [{ grab: "y", drag: "z" }, { grab: "z", drag: "y" }] },
  { id: "blue", selector: { type: "layer", axis: "y", coordinate: 1 }, pivot: [0, 1, 0], axis: "y", quarterTurn: -1, triggers: [{ grab: "x", drag: "z" }, { grab: "z", drag: "x" }] },
  { id: "green", selector: { type: "layer", axis: "y", coordinate: -1 }, pivot: [0, -1, 0], axis: "y", quarterTurn: 1, triggers: [{ grab: "x", drag: "z" }, { grab: "z", drag: "x" }] },
  { id: "white", selector: { type: "layer", axis: "z", coordinate: 1 }, pivot: [0, 0, 1], axis: "z", quarterTurn: -1, triggers: [{ grab: "x", drag: "y" }, { grab: "y", drag: "x" }] },
  { id: "yellow", selector: { type: "layer", axis: "z", coordinate: -1 }, pivot: [0, 0, -1], axis: "z", quarterTurn: 1, triggers: [{ grab: "x", drag: "y" }, { grab: "y", drag: "x" }] },
  { id: "middle-x", selector: { type: "layer", axis: "x", coordinate: 0 }, pivot: [0, 0, 0], axis: "x", quarterTurn: 1, triggers: [{ grab: "y", drag: "z" }, { grab: "z", drag: "y" }] },
  { id: "middle-y", selector: { type: "layer", axis: "y", coordinate: 0 }, pivot: [0, 0, 0], axis: "y", quarterTurn: 1, triggers: [{ grab: "x", drag: "z" }, { grab: "z", drag: "x" }] },
  { id: "middle-z", selector: { type: "layer", axis: "z", coordinate: 0 }, pivot: [0, 0, 0], axis: "z", quarterTurn: 1, triggers: [{ grab: "x", drag: "y" }, { grab: "y", drag: "x" }] },
];

function createTutorialPieces(): WorldPiece[] {
  const pieces: WorldPiece[] = [];
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const colors = [
          x === 1 ? ["r", "Red"] : x === -1 ? ["o", "Orange"] : null,
          z === 1 ? ["w", "White"] : z === -1 ? ["y", "Yellow"] : null,
          y === 1 ? ["b", "Blue"] : y === -1 ? ["g", "Green"] : null,
        ].filter((color): color is string[] => Boolean(color));
        pieces.push({
          id: colors.length ? colors.map((color) => color[0]).join("/") : "core",
          label: colors.length ? colors.map((color) => color[1]).join(" / ") : "Core",
          position: [x, y, z],
          items: [],
        });
      }
    }
  }

  const active = pieces.find((piece) => piece.position.join(",") === "1,1,1")!;
  active.items.push(
    { id: "spawn", kind: "spawn", cell: [1, 1, 0] },
    { id: "obstacle", kind: "obstacle", cell: [0, 0, 0] },
    { id: "banana", kind: "golden_banana", cell: [0, 0, 1] },
    { id: "door-rwb", kind: "door", cell: [0, 3, 0], face: "orange" },
  );
  const neighbor = pieces.find((piece) => piece.position.join(",") === "0,1,1")!;
  neighbor.items.push({ id: "door-wb", kind: "door", cell: [3, 3, 0], face: "red" });
  return pieces;
}

export function createTutorialLevel(): LevelDefinitionV1 {
  return {
    schemaVersion: 1,
    coordinateFrame: "orange-red_green-blue_yellow-white",
    name: "Tutorial",
    pieces: createTutorialPieces(),
    rotationScript: formatRotationScript(tutorialRules),
  };
}

export const TUTORIAL_LEVEL = createTutorialLevel();
