export const GRID_SIZE = 4;
export const INITIAL_GRAVITY_FACE = "yellow";
export const ACTIVE_PIECE = Object.freeze({ id: "1,1,1", colors: ["red", "white", "blue"] });
export const INITIAL_SOLID_CELL = Object.freeze({ x: 0, y: 0, z: 0 });

export const FACE_COLORS = Object.freeze({
  front: "red", back: "orange", right: "blue", left: "green", up: "white", down: "yellow",
});

const FACE_VECTORS = Object.freeze({
  front: { x: 0, y: 0, z: 1 }, back: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 }, left: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, down: { x: 0, y: -1, z: 0 },
});

export const MOVE_CONFIG = Object.freeze({
  U: { axis: "y", layer: 1, angle: -90 }, D: { axis: "y", layer: -1, angle: 90 },
  R: { axis: "x", layer: 1, angle: -90 }, L: { axis: "x", layer: -1, angle: 90 },
  // Clockwise is viewed while looking directly at the named outer face. In
  // particular, F sends the initial R/W/B corner to bottom/front/right:
  // White -> right, Red -> front, Blue -> down.
  F: { axis: "z", layer: 1, angle: -90 }, B: { axis: "z", layer: -1, angle: 90 },
  M: { axis: "x", layer: 0, angle: 90 }, E: { axis: "y", layer: 0, angle: 90 }, S: { axis: "z", layer: 0, angle: 90 },
});

function vectorToFace({ x, y, z }) {
  return Object.entries(FACE_VECTORS).find(([, vector]) => vector.x === x && vector.y === y && vector.z === z)?.[0];
}

function rotateVector(vector, axis, angle) {
  const { x, y, z } = vector;
  if (axis === "x") return angle === 90 ? { x, y: -z, z: y } : { x, y: z, z: -y };
  if (axis === "y") return angle === 90 ? { x: z, y, z: -x } : { x: -z, y, z: x };
  return angle === 90 ? { x: -y, y: x, z } : { x: y, y: -x, z };
}

function createPiece(x, y, z) {
  const stickers = {};
  if (z === 1) stickers.front = FACE_COLORS.front;
  if (z === -1) stickers.back = FACE_COLORS.back;
  if (x === 1) stickers.right = FACE_COLORS.right;
  if (x === -1) stickers.left = FACE_COLORS.left;
  if (y === 1) stickers.up = FACE_COLORS.up;
  if (y === -1) stickers.down = FACE_COLORS.down;
  return { id: `${x},${y},${z}`, position: { x, y, z }, stickers };
}

export function createRubiksCube() {
  const pieces = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) pieces.push(createPiece(x, y, z));
  return pieces;
}

export function applyMove(pieces, move) {
  if (move.endsWith("2")) return applyMove(applyMove(pieces, move.slice(0, -1)), move.slice(0, -1));
  const inverse = move.endsWith("'");
  const config = MOVE_CONFIG[inverse ? move[0] : move];
  if (!config) return pieces;
  const angle = inverse ? -config.angle : config.angle;
  return pieces.map((piece) => {
    if (piece.position[config.axis] !== config.layer) return piece;
    const position = rotateVector(piece.position, config.axis, angle);
    const stickers = Object.fromEntries(Object.entries(piece.stickers).map(([face, color]) => [vectorToFace(rotateVector(FACE_VECTORS[face], config.axis, angle)), color]));
    return { ...piece, position, stickers };
  });
}

export function createGameState() {
  return {
    mode: "cube", cube: createRubiksCube(), moves: [], history: [], material: "grid", activePiece: ACTIVE_PIECE,
    // These are world-horizontal grid coordinates: x is Blue/Green (right/left)
    // and z is Red/Orange (front/back). They do not rotate with the camera.
    // y is always settled to the active chamber's world-down interior face.
    player: { x: 1, y: 0, z: 1 }, solidCell: { ...INITIAL_SOLID_CELL },
    gravity: { x: 0, y: -1, z: 0, face: INITIAL_GRAVITY_FACE },
  };
}

export function getActivePiece(pieces) {
  return pieces.find((piece) => piece.id === ACTIVE_PIECE.id);
}

export function getFloorFace(piece) {
  // Stickers are keyed by their current world direction, so the lower-facing
  // sticker identifies the active chamber's interior floor under Yellow gravity.
  return piece?.stickers.down ?? null;
}

export function turnCube(state, move) {
  const cube = applyMove(state.cube, move);
  const config = MOVE_CONFIG[move.replace(/[2']/g, "")];
  const active = getActivePiece(state.cube);
  const activeTurns = config && active?.position[config.axis] === config.layer;
  const angle = move.endsWith("'") ? -config?.angle : config?.angle;
  const turns = move.endsWith("2") ? 2 : 1;
  let player = state.player;
  let solidCell = state.solidCell;
  if (activeTurns) {
    for (let turn = 0; turn < turns; turn += 1) {
      player = rotateInteriorCell(player, config.axis, angle);
      solidCell = rotateInteriorCell(solidCell, config.axis, angle);
    }
    player = settlePlayer(player, solidCell);
  }
  return { ...state, cube, player, solidCell, moves: [...state.moves, move].slice(-16), history: [...state.history, move] };
}

export function parseMoves(input) {
  return input.replace(/[(),;]/g, " ").split(/\s+/).flatMap((chunk) => chunk.match(/[FBRLUDMESfbrludmes]['2]?/g) ?? []).map((move) => move[0].toUpperCase() + move.slice(1));
}

export function undoCube(state) {
  const last = state.history.at(-1);
  if (!last) return state;
  const inverse = last.endsWith("2") ? last : last.endsWith("'") ? last.slice(0, -1) : `${last}'`;
  return { ...state, cube: applyMove(state.cube, inverse), player: settlePlayer(state.player), history: state.history.slice(0, -1), moves: [...state.moves, inverse].slice(-16) };
}

export function movePlayer(player, key, solidCell = INITIAL_SOLID_CELL) {
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!delta) return player;
  const x = Math.max(0, Math.min(GRID_SIZE - 1, player.x + delta[0]));
  const z = Math.max(0, Math.min(GRID_SIZE - 1, player.z + delta[1]));
  const floor = floorHeightAt(x, z, solidCell);
  return floor <= player.y ? { x, y: floor, z } : player;
}

function rotateInteriorCell(cell, axis, angle) {
  const turns = ((angle / 90) % 4 + 4) % 4;
  let next = cell;
  for (let turn = 0; turn < turns; turn += 1) {
    const { x, y, z } = next;
    if (axis === "x") next = { x, y: GRID_SIZE - 1 - z, z: y };
    if (axis === "y") next = { x: z, y, z: GRID_SIZE - 1 - x };
    if (axis === "z") next = { x: GRID_SIZE - 1 - y, y: x, z };
  }
  return next;
}

export function floorHeightAt(x, z, solidCell = INITIAL_SOLID_CELL) {
  return solidCell.x === x && solidCell.z === z ? solidCell.y + 1 : 0;
}

export function settlePlayer(player, solidCell = INITIAL_SOLID_CELL) { return { ...player, y: floorHeightAt(player.x, player.z, solidCell) }; }
