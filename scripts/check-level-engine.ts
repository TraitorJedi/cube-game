import assert from "node:assert/strict";
import {
  alignedDoorPairs,
  applyRotationRule,
  createPiece,
  createRuntimeWorld,
  formatRotationScript,
  legacyCoordinateToCell,
  parseRotationScript,
  validateLevel,
  type LevelDefinitionV1,
  type RotationRule,
  type WorldPiece,
} from "../src/engine/level-engine.ts";
import { createTutorialLevel } from "../src/engine/tutorial-level.ts";
import { levelDefinitionToLegacyLevel } from "../src/engine/legacy-adapter.ts";
import { resolveItemCell } from "../src/game/engine.js";

const tutorial = createTutorialLevel();
const legacyTutorial = levelDefinitionToLegacyLevel(tutorial);
const active = tutorial.pieces.find((piece) => piece.id === "r/w/b");
assert.deepEqual(active?.position, [1, 1, 1]);
assert.deepEqual(
  tutorial.pieces.find((piece) => piece.position.join(",") === "1,-1,-1")?.label,
  "Red / Yellow / Green",
);
assert.deepEqual(legacyCoordinateToCell(["g", "w", "o", 3, 3, 0]), [0, 3, 0]);
assert.deepEqual(legacyCoordinateToCell(["g", "y", "r", 3, 0, 0]), [3, 3, 0]);
assert.deepEqual(alignedDoorPairs(tutorial).flat().sort(), ["door-rwb", "door-wb"]);
assert.equal(validateLevel(tutorial).filter((item) => item.severity === "error").length, 0);
assert.deepEqual(
  legacyTutorial.items.find((item) => item.kind === "obstacle")?.faces,
  ["green", "yellow", "orange"],
);
const legacyObstacle = legacyTutorial.items.find((item) => item.kind === "obstacle")!;
assert.deepEqual(
  resolveItemCell(legacyObstacle, {
    faceColors: {
      front: "blue",
      back: "green",
      right: "orange",
      left: "red",
      up: "white",
      down: "yellow",
    },
    stickers: {},
  }),
  { x: 3, y: 0, z: 0 },
  "An obstacle at 0 from Orange must stay 3 cells away from Red after Red rotates to the left wall.",
);

const parsed = parseRotationScript(tutorial.rotationScript);
assert.equal(parsed.diagnostics.length, 0);
assert.equal(formatRotationScript(parsed.rules), tutorial.rotationScript);

const pieces: WorldPiece[] = [];
for (let x = 0; x <= 1; x += 1) {
  for (let y = 0; y <= 1; y += 1) {
    for (let z = 0; z <= 1; z += 1) pieces.push(createPiece([x, y, z], pieces));
  }
}
pieces[0]!.items.push({ id: "spawn-2", kind: "spawn", cell: [1, 1, 0] });
pieces[1]!.items.push({ id: "banana-2", kind: "golden_banana", cell: [2, 2, 0] });
const rule: RotationRule = {
  id: "test-red",
  selector: { type: "layer", axis: "x", coordinate: 1 },
  pivot: [1, 0.5, 0.5],
  axis: "x",
  quarterTurn: -1,
  triggers: [{ grab: "y", drag: "z" }, { grab: "z", drag: "y" }],
};
const twoByTwo: LevelDefinitionV1 = {
  schemaVersion: 1,
  coordinateFrame: "orange-red_green-blue_yellow-white",
  name: "Test-only 2x2",
  pieces,
  rotationScript: formatRotationScript([rule]),
};
assert.equal(validateLevel(twoByTwo).filter((item) => !["unmatched_door"].includes(item.code)).length, 0);
let world = createRuntimeWorld(twoByTwo);
const initial = structuredClone(world);
for (let turn = 0; turn < 4; turn += 1) world = applyRotationRule(world, rule);
assert.deepEqual(world, initial);

console.log("Level engine checks passed: coordinate frame, DSL, doors, and test-only 2x2 rotations.");
