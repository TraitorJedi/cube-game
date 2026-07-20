import { GRID_SIZE, createPrimaryLevel, moduleId, coordinateArrayToCell } from "./levels.js";
export { GRID_SIZE };
export const INITIAL_GRAVITY_FACE = "yellow";
export const ACTIVE_PIECE = Object.freeze({ id: "r/w/b", colors: ["red", "white", "blue"] });
export const WHITE_BLUE_MIDDLE_PIECE = Object.freeze({ id: "w/b", colors: ["white", "blue"] });
export const INITIAL_SOLID_CELL = Object.freeze({ x: 0, y: 0, z: 0 });

// Immutable piece IDs let doors travel with their cubelets. The ordered
// Green/Yellow/Orange (3,0,0) threshold uses Orange, the third axis, as its
// face and crosses into the W/B middle cubelet's paired Red threshold.
function doorMovementKey(door) {
  if (door.doorAxis === "x") return door.cell.x === 0 ? "ArrowLeft" : "ArrowRight";
  if (door.doorAxis === "z") return door.cell.z === 0 ? "ArrowUp" : "ArrowDown";
  return null;
}

function parseDoor(item) {
  const parsed = item.faces && item.axes && item.cell ? item : { ...item, ...coordinateArrayToCell(item.coordinate) };
  return { ...parsed, doorFace: parsed.doorFace ?? parsed.faces[2], doorAxis: parsed.doorAxis ?? parsed.axes[2] };
}

function normalizeDoors(items) {
  const parsed = items.map(parseDoor);
  return parsed.map((door) => {
    const target = parsed.find((candidate) => candidate.moduleId === door.targetModuleId && candidate.targetModuleId === door.moduleId);
    return { pieceId: door.moduleId, faceColor: door.doorFace, cell: door.cell, key: doorMovementKey(door), targetPieceId: door.targetModuleId, targetCell: target?.cell ?? door.cell };
  });
}

export const DOORS = Object.freeze(normalizeDoors(createPrimaryLevel().items.filter((item) => item.kind === "door")));

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
  // `stickers` only describes the visible exterior.  Chambers need the full
  // colour frame as well: a middle piece has no red sticker, for example,
  // but it still has a red interior-facing direction which must turn with it.
  return { id: moduleId({ x, y, z }), position: { x, y, z }, stickers, faceColors: { ...FACE_COLORS } };
}

export function createRubiksCube() {
  const pieces = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) pieces.push(createPiece(x, y, z));
  return pieces;
}

export function applyMove(pieces, move) {
  if (typeof move !== "string") return pieces;
  if (move.endsWith("2")) return applyMove(applyMove(pieces, move.slice(0, -1)), move.slice(0, -1));
  const inverse = move.endsWith("'");
  const config = MOVE_CONFIG[inverse ? move[0] : move];
  if (!config) return pieces;
  const angle = inverse ? -config.angle : config.angle;
  return pieces.map((piece) => {
    if (piece.position[config.axis] !== config.layer) return piece;
    const position = rotateVector(piece.position, config.axis, angle);
    const rotateFaces = (faces) => Object.fromEntries(Object.entries(faces).map(([face, color]) => [vectorToFace(rotateVector(FACE_VECTORS[face], config.axis, angle)), color]));
    return { ...piece, position, stickers: rotateFaces(piece.stickers), faceColors: rotateFaces(piece.faceColors ?? FACE_COLORS) };
  });
}

export function createGameState(level = createPrimaryLevel()) {
  const spawn = level.items.find((item) => item.kind === "spawn");
  const obstacle = level.items.find((item) => item.kind === "obstacle");
  return {
    mode: "cube", cube: createRubiksCube(), level, moves: [], history: [], material: "grid", activePieceId: spawn?.moduleId ?? ACTIVE_PIECE.id,
    // These are world-horizontal grid coordinates: x is Blue/Green (right/left)
    // and z is Red/Orange (front/back). They do not rotate with the camera.
    // y is always settled to the active chamber's world-down interior face.
    player: { ...(spawn?.cell ?? { x: 1, y: 0, z: 1 }) }, solidCell: { ...(obstacle?.cell ?? INITIAL_SOLID_CELL) },
    skin: "classic", collectedItemIds: [], levelComplete: false,
    gravity: { x: 0, y: -1, z: 0, face: INITIAL_GRAVITY_FACE },
  };
}

export function getActivePiece(pieces, activePieceId = ACTIVE_PIECE.id) {
  return pieces.find((piece) => piece.id === activePieceId);
}

export function getFloorFace(piece) {
  // Face colours are keyed by their current world direction, so the lower
  // direction identifies the active chamber's floor under Yellow gravity.
  return piece?.faceColors?.down ?? piece?.stickers.down ?? FACE_COLORS.down;
}

function faceForColor(piece, color) {
  return Object.entries(piece?.faceColors ?? FACE_COLORS).find(([, faceColor]) => faceColor === color)?.[0];
}

function cellCoordinateForFace(face, distance) {
  const near = GRID_SIZE - 1 - distance;
  if (face === "right") return { axis: "x", value: near };
  if (face === "left") return { axis: "x", value: distance };
  if (face === "up") return { axis: "y", value: near };
  if (face === "down") return { axis: "y", value: distance };
  if (face === "front") return { axis: "z", value: near };
  return { axis: "z", value: distance };
}

// Placement coordinates stay attached to their named colour faces.  Resolve
// them only when a chamber is rendered or interacted with, using that
// cubelet's current orientation.
export function resolveItemCell(item, piece) {
  if (!item?.faces || !Array.isArray(item.coordinate)) return item?.cell;
  return item.faces.reduce((cell, color, index) => {
    const face = faceForColor(piece, color);
    if (!face) return cell;
    const { axis, value } = cellCoordinateForFace(face, item.coordinate[index + 3]);
    cell[axis] = value;
    return cell;
  }, { x: 0, y: 0, z: 0 });
}

function doorMovementKeyForFace(face) {
  if (face === "left") return "ArrowLeft";
  if (face === "right") return "ArrowRight";
  if (face === "back") return "ArrowUp";
  if (face === "front") return "ArrowDown";
  return null;
}

export function turnCube(state, move) {
  const cube = applyMove(state.cube, move);
  const config = MOVE_CONFIG[move.replace(/[2']/g, "")];
  const active = getActivePiece(state.cube, state.activePieceId);
  const activeTurns = config && active?.position[config.axis] === config.layer;
  const obstacle = state.level?.items.find((item) => item.kind === "obstacle");
  const obstaclePiece = obstacle && getActivePiece(state.cube, obstacle.moduleId);
  const obstacleTurns = config && obstaclePiece?.position[config.axis] === config.layer;
  const angle = move.endsWith("'") ? -config?.angle : config?.angle;
  const turns = move.endsWith("2") ? 2 : 1;
  let player = state.player;
  let solidCell = state.solidCell;
  for (let turn = 0; turn < turns; turn += 1) {
    if (activeTurns) player = rotateInteriorCell(player, config.axis, angle);
    if (obstacleTurns) solidCell = rotateInteriorCell(solidCell, config.axis, angle);
  }
  if (activeTurns) player = settlePlayer(player, obstacle?.moduleId === state.activePieceId ? solidCell : null);
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
  if (isSolidAt(x, player.y, z, solidCell)) return player;
  const floor = floorHeightAt(x, z, solidCell, player.y);
  return floor <= player.y ? { x, y: floor, z } : player;
}

export function getDoor(pieceId, player, key) {
  return DOORS.find((door) => door.pieceId === pieceId && door.key === key && door.cell.x === player.x && door.cell.y === player.y && door.cell.z === player.z);
}

export function movePlayerInWorld(state, key) {
  const sourcePiece = getActivePiece(state.cube, state.activePieceId);
  const sourceDoors = (state.level?.items ?? []).filter((item) => item.kind === "door" && item.moduleId === state.activePieceId).map(parseDoor);
  const door = sourceDoors.find((candidate) => {
    const cell = resolveItemCell(candidate, sourcePiece);
    const face = faceForColor(sourcePiece, candidate.doorFace);
    return doorMovementKeyForFace(face) === key && cell.x === state.player.x && cell.y === state.player.y && cell.z === state.player.z;
  });
  const targetDoor = door && (state.level?.items ?? []).filter((item) => item.kind === "door").map(parseDoor).find((candidate) => candidate.moduleId === door.targetModuleId && candidate.targetModuleId === door.moduleId);
  const targetPiece = targetDoor && getActivePiece(state.cube, targetDoor.moduleId);
  const activeHasObstacle = state.level?.items.some((item) => item.kind === "obstacle" && item.moduleId === state.activePieceId);
  const next = door
    ? { ...state, activePieceId: door.targetModuleId, player: resolveItemCell(targetDoor, targetPiece) }
    : { ...state, player: movePlayer(state.player, key, activeHasObstacle ? state.solidCell : null) };
  const banana = next.level.items.find((item) => item.kind === "golden_banana" && item.moduleId === next.activePieceId && item.cell.x === next.player.x && item.cell.y === next.player.y && item.cell.z === next.player.z);
  return banana && !next.collectedItemIds.includes(banana.id)
    ? { ...next, collectedItemIds: [...next.collectedItemIds, banana.id], levelComplete: true }
    : next;
}

function rotateInteriorCell(cell, axis, angle) {
  const turns = ((angle / 90) % 4 + 4) % 4;
  let next = cell;
  for (let turn = 0; turn < turns; turn += 1) {
    const { x, y, z } = next;
    // These are the 0..3 cell equivalents of rotateVector's +90-degree
    // transforms. Keeping the handedness identical prevents a visible U turn
    // from applying U' to the Ape and obstacle inside the moving cubelet.
    if (axis === "x") next = { x, y: GRID_SIZE - 1 - z, z: y };
    if (axis === "y") next = { x: z, y, z: GRID_SIZE - 1 - x };
    if (axis === "z") next = { x: GRID_SIZE - 1 - y, y: x, z };
  }
  return next;
}

export function isSolidAt(x, y, z, solidCell = INITIAL_SOLID_CELL) {
  return Boolean(solidCell) && solidCell.x === x && solidCell.y === y && solidCell.z === z;
}

export function floorHeightAt(x, z, solidCell = INITIAL_SOLID_CELL, fallingFromY = GRID_SIZE - 1) {
  return solidCell && solidCell.x === x && solidCell.z === z && solidCell.y <= fallingFromY ? solidCell.y + 1 : 0;
}

export function settlePlayer(player, solidCell = INITIAL_SOLID_CELL) { return { ...player, y: floorHeightAt(player.x, player.z, solidCell, player.y) }; }
