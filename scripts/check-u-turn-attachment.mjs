import { createGameState, getActivePiece, resolveItemCell, turnCube } from "../src/game/engine.js";

const state = {
  ...createGameState(),
  // Deliberately asymmetric cells make U and U' distinguishable.
  player: { x: 1, y: 0, z: 2 },
  solidCell: { x: 0, y: 0, z: 0 },
};

const turned = turnCube(state, "U");
const player = JSON.stringify(turned.player);
const obstacle = JSON.stringify(turned.solidCell);
const attachedItem = {
  id: "attachment-check",
  moduleId: state.activePieceId,
  kind: "golden_banana",
  faces: ["green", "yellow", "orange"],
  coordinate: ["g", "y", "o", 1, 0, 2],
  cell: { x: 1, y: 0, z: 2 },
};
const itemCell = JSON.stringify(resolveItemCell(attachedItem, getActivePiece(turned.cube, state.activePieceId)));

if (player !== JSON.stringify({ x: 1, y: 0, z: 1 })) throw new Error(`U applied the wrong player rotation: ${player}`);
if (obstacle !== JSON.stringify({ x: 3, y: 0, z: 0 })) throw new Error(`U applied the wrong obstacle rotation: ${obstacle}`);
if (itemCell !== player) throw new Error(`U detached the placed item from the Ape's rotated cell frame: ${itemCell}`);

console.log("PASS: U applies the same signed quarter-turn to the cubelet, Ape, obstacle, and placed items.");
