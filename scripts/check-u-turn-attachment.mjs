import { createGameState, turnCube } from "../src/game/engine.js";

const state = {
  ...createGameState(),
  // Deliberately asymmetric cells make U and U' distinguishable.
  player: { x: 1, y: 0, z: 2 },
  solidCell: { x: 0, y: 0, z: 0 },
};

const turned = turnCube(state, "U");
const player = JSON.stringify(turned.player);
const obstacle = JSON.stringify(turned.solidCell);

if (player !== JSON.stringify({ x: 1, y: 0, z: 1 })) throw new Error(`U applied the wrong player rotation: ${player}`);
if (obstacle !== JSON.stringify({ x: 3, y: 0, z: 0 })) throw new Error(`U applied the wrong obstacle rotation: ${obstacle}`);

console.log("PASS: U applies the same signed quarter-turn to the cubelet, Ape, and obstacle.");
