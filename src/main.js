import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { generateClassicApe, generateCyberApe, generateAstronautApe } from "../voxel-art/generator.js";
import { GRID_SIZE, FACE_COLORS, MOVE_CONFIG, createGameState, getActivePiece, getFloorFace, movePlayerInWorld, resolveItemCell, turnCube } from "./engine.js";
import { loadPrimaryLevel } from "./level-store.js";

const { createElement: h } = React;
const STEP = 1.92;
const CUBE_FRAME_HALF_EXTENT = 3.05;
const MOBILE_FRAME_FILL = .96;
const TUTORIAL_STORAGE_KEY = "cubesque-ape:tutorial-complete:v1";
// Palette retained from the original Cube Explorer design.
const COLORS = { red: 0xd83a34, orange: 0xf28b24, white: 0xf7f3e7, yellow: 0xf4d13d, blue: 0x246fe5, green: 0x2fb56d, core: 0x16181f };

// Face-local gesture frames deliberately live outside the camera. A horizontal
// drag means the same thing on every visible sticker, even after orbiting.
const FACE_VECTORS = { front: { x: 0, y: 0, z: 1 }, back: { x: 0, y: 0, z: -1 }, right: { x: 1, y: 0, z: 0 }, left: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, down: { x: 0, y: -1, z: 0 } };
const FACE_FRAMES = { front: { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } }, back: { right: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } }, right: { right: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } }, left: { right: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } }, up: { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 } }, down: { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } } };
const MATERIAL_FACE = ["right", "left", "up", "down", "front", "back"];
const OPPOSITE_SIDE = { right: "left", left: "right", up: "down", down: "up", front: "back", back: "front" };
const OPPOSITE_COLOR = { blue: "green", green: "blue", white: "yellow", yellow: "white", red: "orange", orange: "red" };

function interiorFaceColor(piece, side) {
  return piece.faceColors?.[side] ?? piece.stickers[side] ?? OPPOSITE_COLOR[piece.stickers[OPPOSITE_SIDE[side]]] ?? FACE_COLORS[side];
}

function rotateVector(vector, axis, angle) { const { x, y, z } = vector; if (axis === "x") return angle === 90 ? { x, y: -z, z: y } : { x, y: z, z: -y }; if (axis === "y") return angle === 90 ? { x: z, y, z: -x } : { x: -z, y, z: x }; return angle === 90 ? { x: -y, y: x, z } : { x: y, y: -x, z }; }
function axisOf(vector) { return ["x", "y", "z"].find((axis) => vector[axis] !== 0); }
function dot(first, second) { return first.x * second.x + first.y * second.y + first.z * second.z; }
function gestureMove(side, position, dx, dy) {
  const frame = FACE_FRAMES[side]; const normal = FACE_VECTORS[side]; if (!frame || !normal) return null;
  const horizontal = Math.abs(dx) >= Math.abs(dy); const axis = axisOf(horizontal ? frame.up : frame.right);
  // Select the slice orientation from the positive screen direction only.
  // The signed pointer distance is applied later while previewing the turn.
  // Including the drag sign here as well makes both left/right (and up/down)
  // rotate in the same visual direction because the two negatives cancel.
  const direction = horizontal ? frame.right : { x: -frame.up.x, y: -frame.up.y, z: -frame.up.z };
  let angle = dot(rotateVector(normal, axis, 90), direction) > dot(rotateVector(normal, axis, -90), direction) ? 90 : -90;
  if (side === "up" && position.x === 0 && position.y === 1 && position.z === 0) angle *= -1;
  const entry = Object.entries(MOVE_CONFIG).find(([, config]) => config.axis === axis && config.layer === position[axis]);
  if (!entry) return null;
  const [base, config] = entry; const move = angle === config.angle ? base : `${base}'`;
  return { move, axis, layer: position[axis], horizontal, previewSign: (move.endsWith("'") ? -config.angle : config.angle) / 90 };
}

function roundedRectShape(size, radius) {
  const half = size / 2; const shape = new THREE.Shape();
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half); shape.quadraticCurveTo(half, -half, half, -half + radius);
  shape.lineTo(half, half - radius); shape.quadraticCurveTo(half, half, half - radius, half);
  shape.lineTo(-half + radius, half); shape.quadraticCurveTo(-half, half, -half, half - radius);
  shape.lineTo(-half, -half + radius); shape.quadraticCurveTo(-half, -half, -half + radius, -half);
  return shape;
}

function positionFace(object, side, depth) {
  if (side === "front") object.position.z = depth;
  if (side === "back") { object.position.z = -depth; object.rotation.y = Math.PI; }
  if (side === "right") { object.position.x = depth; object.rotation.y = Math.PI / 2; }
  if (side === "left") { object.position.x = -depth; object.rotation.y = -Math.PI / 2; }
  if (side === "up") { object.position.y = depth; object.rotation.x = -Math.PI / 2; }
  if (side === "down") { object.position.y = -depth; object.rotation.x = Math.PI / 2; }
}

function addRoundedSticker(mesh, piece, side, materialMode) {
  const color = COLORS[piece.stickers[side]] ?? COLORS.core;
  const panel = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(1.735, .135), 12), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: materialMode === "glass", opacity: materialMode === "glass" ? .56 : 1 }));
  positionFace(panel, side, .876);
  panel.userData = { piece, side };
  mesh.add(panel);

  const points = roundedRectShape(1.32, .09).getPoints(24).map((point) => new THREE.Vector3(point.x, point.y, 0));
  const inset = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .16 }));
  positionFace(inset, side, .879);
  mesh.add(inset);
}

function addActiveStickerBorder(mesh, side) {
  /* Superseded square-border stub kept out of the render path.

  const outer = roundedRectShape(1.9, .19); const innerPoints = roundedRectShape(1. সাত?);
  */
  const outerBorder = roundedRectShape(1.9, .19);
  const innerPoints = roundedRectShape(1.69, .105).getPoints(28).reverse();
  outerBorder.holes.push(new THREE.Path(innerPoints));
  // The legacy CSS treatment is one substantial yellow border plus a soft
  // box-shadow. Keep one luminous silhouette here and let bloom create the
  // halo; a separate oversized line reads as nested wireframes at corners.
  const border = new THREE.Mesh(new THREE.ShapeGeometry(outerBorder, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(3.1, 2.15, .32), toneMapped: false, side: THREE.DoubleSide }));
  positionFace(border, side, .886); border.renderOrder = 3; border.raycast = () => {};
  mesh.add(border);
}

function createCubelet(piece, materialMode, isActive) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.74, 1.74, 1.74), new THREE.MeshBasicMaterial({ color: COLORS.core }));
  mesh.position.set(piece.position.x * STEP, piece.position.y * STEP, piece.position.z * STEP);
  Object.keys(piece.stickers).forEach((side) => addRoundedSticker(mesh, piece, side, materialMode));
  if (isActive) {
    mesh.scale.setScalar(1.12);
    Object.keys(piece.stickers).forEach((side) => addActiveStickerBorder(mesh, side));
  }
  mesh.userData.piece = piece;
  return mesh;
}

function legacyCubePixelSize() {
  const vmin = Math.min(window.innerWidth, window.innerHeight);
  const isTiny = window.matchMedia("(max-width: 380px)").matches;
  const isSmall = window.matchMedia("(max-width: 620px)").matches;
  const isMedium = window.matchMedia("(max-width: 980px)").matches;
  const tile = isTiny ? Math.min(Math.max(window.innerWidth * .138, 32), 43)
    : isSmall ? Math.min(Math.max(window.innerWidth * .146, 35), 50)
      : isMedium ? Math.min(Math.max(vmin * .1, 44), 66)
        : Math.min(Math.max(vmin * .08, 42), 74);
  const gap = isSmall ? Math.min(Math.max(window.innerWidth * .012, 3), 5) : Math.min(Math.max(vmin * .007, 3), 6);
  return (tile + gap) * 3;
}

function mobileOverviewDistance(width, height, viewYaw, viewPitch) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const tangent = Math.tan(THREE.MathUtils.degToRad(38 / 2));
  const sinYaw = Math.sin(viewYaw), cosYaw = Math.cos(viewYaw);
  const sinPitch = Math.sin(viewPitch), cosPitch = Math.cos(viewPitch);
  let distance = 0;

  // Fit a padded bound around all eight World Cube corners into the current
  // perspective frustum. Using the projected silhouette instead of a fixed
  // sphere lets each phone orientation zoom closer without clipping a side.
  for (const x of [-CUBE_FRAME_HALF_EXTENT, CUBE_FRAME_HALF_EXTENT]) {
    for (const y of [-CUBE_FRAME_HALF_EXTENT, CUBE_FRAME_HALF_EXTENT]) {
      for (const z of [-CUBE_FRAME_HALF_EXTENT, CUBE_FRAME_HALF_EXTENT]) {
        const cameraX = x * cosYaw - z * sinYaw;
        const cameraY = -x * sinYaw * sinPitch + y * cosPitch - z * cosYaw * sinPitch;
        const depthOffset = -x * sinYaw * cosPitch - y * sinPitch - z * cosYaw * cosPitch;
        const horizontalFit = Math.abs(cameraX) / (tangent * aspect * MOBILE_FRAME_FILL) - depthOffset;
        const verticalFit = Math.abs(cameraY) / (tangent * MOBILE_FRAME_FILL) - depthOffset;
        distance = Math.max(distance, horizontalFit, verticalFit);
      }
    }
  }

  return distance;
}

// Same release curve as app.js's `.cubie` transform transition:
// cubic-bezier(.2, .78, .2, 1).
function legacyTurnEase(progress) {
  const sample = (t, a, b) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  let low = 0; let high = 1;
  for (let index = 0; index < 16; index += 1) {
    const t = (low + high) / 2;
    if (sample(t, .2, .2) < progress) low = t; else high = t;
  }
  return sample((low + high) / 2, .78, 1);
}

function createLegacyBackground() {
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 1024;
  const context = canvas.getContext("2d");
  const base = context.createLinearGradient(0, 0, 1024, 1024); base.addColorStop(0, "#090a0d"); base.addColorStop(.52, "#16181f"); base.addColorStop(1, "#0c0d11"); context.fillStyle = base; context.fillRect(0, 0, 1024, 1024);
  const glow = context.createRadialGradient(716, 205, 0, 716, 205, 360); glow.addColorStop(0, "rgba(67,217,184,.17)"); glow.addColorStop(1, "rgba(67,217,184,0)"); context.fillStyle = glow; context.fillRect(0, 0, 1024, 1024);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

function voxelGroup(voxels, scale = 1) {
  const group = new THREE.Group(); const voxelSize = scale / 64; const geometry = new THREE.BoxGeometry(voxelSize * .96, voxelSize * .96, voxelSize * .96); const buckets = new Map();
  voxels.forEach((voxel) => { const key = `${voxel.color}:${voxel.type ?? "solid"}`; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(voxel); });
  for (const [key, items] of buckets) { const [color, type] = key.split(":"); const material = new THREE.MeshStandardMaterial({ color: Number(color), roughness: type === "visor" ? .15 : type === "emissive" ? .2 : .8, metalness: type === "visor" ? .95 : .1, emissive: type === "emissive" ? Number(color) : 0x000000, emissiveIntensity: type === "emissive" ? 2.5 : 0 }); const mesh = new THREE.InstancedMesh(geometry, material, items.length); const dummy = new THREE.Object3D(); items.forEach((voxel, index) => { dummy.position.set((voxel.x - 31.5) * voxelSize, (voxel.y + .5) * voxelSize, (voxel.z - 31.5) * voxelSize); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); mesh.setColorAt(index, new THREE.Color(voxel.color)); }); mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; group.add(mesh); }
  return group;
}

function createVoxelApe(skin) { return voxelGroup(skin === "cyber" ? generateCyberApe() : skin === "astronaut" ? generateAstronautApe() : generateClassicApe()); }

function createVoxelBanana() {
  const voxels = []; const radius = 7;
  for (let x = -26; x <= 26; x += 1) {
    const centerY = Math.round(.018 * x * x - 7);
    for (let y = centerY - radius; y <= centerY + radius; y += 1) for (let z = -radius; z <= radius; z += 1) {
      if ((y - centerY) ** 2 + z ** 2 <= radius ** 2) voxels.push({ x: x + 31.5, y, z: z + 31.5, color: Math.abs(x) < 12 ? 0xffe57a : 0xf7c928 });
    }
  }
  for (let x = 25; x <= 31; x += 1) for (let y = 7; y <= 12; y += 1) for (let z = -3; z <= 3; z += 1) if (Math.abs(z) + Math.abs(y - 9) <= 4) voxels.push({ x: x + 31.5, y, z: z + 31.5, color: 0x8a5a20 });
  const group = voxelGroup(voxels); group.rotation.z = -.18; return group;
}

function positionInteriorPlayer(pawn, piece, player) {
  const local = (value) => -1.5 + value;
  pawn.position.set(
    piece.position.x * STEP + local(player.x),
    piece.position.y * STEP - 2 + player.y,
    piece.position.z * STEP + local(player.z),
  );
}

function disposeObjectTree(object) {
  object.traverse((child) => {
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    materials.forEach((material) => material.dispose());
  });
}

function addInterior(scene, piece, player, activePieceId, level, solidCell) {
  const origin = new THREE.Vector3(piece.position.x * STEP, piece.position.y * STEP, piece.position.z * STEP);
  const cell = 1;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x101419, .85));
  const items = level.items.filter((item) => item.moduleId === activePieceId).map((item) => ({ ...item, cell: resolveItemCell(item, piece) }));
  const door = items.find((item) => item.kind === "door");
  const doorColor = door?.doorFace ?? door?.faces?.[2];
  const doorWorldFace = doorColor ? MATERIAL_FACE.find((face) => interiorFaceColor(piece, face) === doorColor) : null;
  const visibleFaces = new Set(["back", "left", "down"]);
  const planeConfig = {
    down: [[0, -2, 0], [-Math.PI / 2, 0, 0]], up: [[0, 2, 0], [Math.PI / 2, 0, 0]],
    left: [[-2, 0, 0], [0, -Math.PI / 2, 0]], right: [[2, 0, 0], [0, Math.PI / 2, 0]],
    back: [[0, 0, -2], [0, Math.PI, 0]], front: [[0, 0, 2], [0, 0, 0]],
  };
  const points = [];
  for (let step = -2; step <= 2; step += 1) points.push(new THREE.Vector3(-2, step, 0), new THREE.Vector3(2, step, 0), new THREE.Vector3(step, -2, 0), new THREE.Vector3(step, 2, 0));
  Object.entries(planeConfig).forEach(([face, [position, rotation]]) => {
    if (!visibleFaces.has(face) || face === doorWorldFace) return;
    const color = COLORS[interiorFaceColor(piece, face)] ?? COLORS.core;
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: .02, side: THREE.DoubleSide, emissive: color, emissiveIntensity: .06 }));
    surface.position.copy(origin).add(new THREE.Vector3(...position)); surface.rotation.set(...rotation); scene.add(surface);
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x2f2b1b, transparent: true, opacity: .72 }));
    grid.position.copy(surface.position); grid.rotation.copy(surface.rotation); grid.translateZ(.012); scene.add(grid);
  });
  if (door && door.cell && visibleFaces.has(doorWorldFace)) {
    const color = COLORS[doorColor] ?? COLORS.core; const material = new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: .02, side: THREE.DoubleSide });
    const zWall = doorWorldFace === "front" || doorWorldFace === "back";
    const xWall = doorWorldFace === "left" || doorWorldFace === "right";
    const horizontalWall = doorWorldFace === "up" || doorWorldFace === "down";
    const wallOffset = doorWorldFace === "back" || doorWorldFace === "left" || doorWorldFace === "down" ? -2 : 2;
    for (let row = 0; row < GRID_SIZE; row += 1) for (let column = 0; column < GRID_SIZE; column += 1) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material); const lateral = -1.5 + column;
      const panelCell = zWall
        ? { x: column, y: row, z: doorWorldFace === "back" ? 0 : GRID_SIZE - 1 }
        : xWall
          ? { x: doorWorldFace === "left" ? 0 : GRID_SIZE - 1, y: row, z: column }
          : { x: column, y: doorWorldFace === "down" ? 0 : GRID_SIZE - 1, z: row };
      if (panelCell.x === door.cell.x && panelCell.y === door.cell.y && panelCell.z === door.cell.z) continue;
      if (zWall) { panel.position.copy(origin).add(new THREE.Vector3(lateral, -1.5 + row, wallOffset)); panel.rotation.y = doorWorldFace === "back" ? Math.PI : 0; }
      else if (xWall) { panel.position.copy(origin).add(new THREE.Vector3(wallOffset, -1.5 + row, lateral)); panel.rotation.y = doorWorldFace === "left" ? -Math.PI / 2 : Math.PI / 2; }
      else { panel.position.copy(origin).add(new THREE.Vector3(lateral, wallOffset, -1.5 + row)); panel.rotation.x = doorWorldFace === "down" ? -Math.PI / 2 : Math.PI / 2; }
      scene.add(panel);
    }
    if (horizontalWall) {
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(.94, .94)),
        new THREE.LineBasicMaterial({ color: 0xffd34d }),
      );
      outline.position.copy(origin).add(new THREE.Vector3(-1.5 + door.cell.x, wallOffset + (doorWorldFace === "down" ? .012 : -.012), -1.5 + door.cell.z));
      outline.rotation.x = Math.PI / 2;
      scene.add(outline);
    } else {
      const threshold = new THREE.Mesh(new THREE.BoxGeometry(zWall ? .95 : .06, .018, zWall ? .06 : .95), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
      threshold.position.copy(origin).add(zWall ? new THREE.Vector3(-1.5 + door.cell.x, -1.99, wallOffset) : new THREE.Vector3(wallOffset, -1.99, -1.5 + door.cell.z)); scene.add(threshold);
    }
  }
  const local = (value) => -1.5 + value;
  const pawn = createVoxelApe(level.skin ?? "classic");
  positionInteriorPlayer(pawn, piece, player); scene.add(pawn);
  items.filter((item) => item.kind !== "door" && item.kind !== "spawn").forEach((item) => {
    if (item.kind === "golden_banana" && level.collectedItemIds?.includes(item.id)) return;
    const isBanana = item.kind === "golden_banana";
    const displayCell = isBanana ? item.cell : solidCell ?? item.cell;
    const mesh = isBanana ? createVoxelBanana() : new THREE.Mesh(new THREE.BoxGeometry(cell, cell, cell), MATERIAL_FACE.map((face) => new THREE.MeshStandardMaterial({ color: COLORS[interiorFaceColor(piece, OPPOSITE_SIDE[face])] ?? COLORS.core, roughness: .8, metalness: .02 })));
    mesh.position.copy(origin).add(new THREE.Vector3(local(displayCell.x), isBanana ? -1.78 + displayCell.y : -1.5 + displayCell.y, local(displayCell.z))); scene.add(mesh);
  });
  return pawn;
}

function CubeScene({ game, onTurn }) {
  const host = useRef(null);
  const cameraRef = useRef();
  const sceneRef = useRef();
  const rendererRef = useRef();
  const pawnRef = useRef();
  const gameRef = useRef(game);
  gameRef.current = game;
  const previousMode = useRef(game.mode);
  const onTurnRef = useRef(onTurn); onTurnRef.current = onTurn;
  // Match legacy app.js: the overview begins on the Red / Blue / White
  // front-right-top presentation (CSS rotateX(-24deg) rotateY(-34deg)).
  const yaw = useRef(.65); const pitch = useRef(.45); const dragging = useRef(null); const turnAnimation = useRef(false);

  useEffect(() => {
    const scene = new THREE.Scene(); scene.background = createLegacyBackground(); sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    const mobileRender = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobileRender ? 1.5 : 2));
    renderer.setClearAlpha(0); renderer.shadowMap.enabled = true; host.current.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xf4f1df, 0x243428, 1.35)); const light = new THREE.DirectionalLight(0xfff9e8, 2.3); light.position.set(6, 10, 8); scene.add(light); const fill = new THREE.DirectionalLight(0x4c75ae, .7); fill.position.set(-6, -3, -4); scene.add(fill);
    // EffectComposer renders through off-screen targets, so the renderer's
    // default-framebuffer antialiasing does not cover sticker silhouettes or
    // inset lines. Multisample the composer's source before bloom to retain the
    // legacy CSS cube's softly antialiased edges without blurring sticker color.
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    renderTarget.samples = 4;
    const composer = new EffectComposer(renderer, renderTarget); composer.addPass(new RenderPass(scene, camera));
    // Approximate the legacy 24px gold box-shadow: a bright core with a wide,
    // soft falloff. The threshold remains above normal sticker luminance.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.02, .58, 1.75); composer.addPass(bloom);
    const resize = () => {
      // React can detach the host while ResizeObserver still has a queued
      // notification. Do not let a teardown-time callback touch a null node.
      if (!host.current) return;
      const { clientWidth, clientHeight } = host.current;
      renderer.setSize(clientWidth, clientHeight, false); composer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight; camera.updateProjectionMatrix();
    };
    const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2();
    const hitSticker = (event) => {
      const rect = renderer.domElement.getBoundingClientRect(); pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1); raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find((candidate) => candidate.object.userData.piece && candidate.object.userData.side);
      return hit ? { piece: hit.object.userData.piece, side: hit.object.userData.side } : null;
    };
    const previewTransform = (preview, angle) => {
      const radians = THREE.MathUtils.degToRad(angle); const rotation = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(preview.axis === "x" ? 1 : 0, preview.axis === "y" ? 1 : 0, preview.axis === "z" ? 1 : 0), radians);
      preview.meshes.forEach(({ mesh, position, quaternion }) => { mesh.position.copy(position).applyMatrix4(rotation); mesh.quaternion.copy(quaternion).premultiply(new THREE.Quaternion().setFromRotationMatrix(rotation)); }); preview.angle = angle; render();
    };
    const pointerDown = (event) => {
      if (gameRef.current.mode !== "cube" || turnAnimation.current) return;
      const hit = hitSticker(event); host.current.setPointerCapture?.(event.pointerId);
      dragging.current = hit ? { kind: "face", hit, startX: event.clientX, startY: event.clientY, startTime: performance.now(), setup: null } : { kind: "orbit", x: event.clientX, y: event.clientY };
    };
    const pointerMove = (event) => {
      const drag = dragging.current; if (!drag || gameRef.current.mode !== "cube") return;
      if (drag.kind === "orbit") { yaw.current += (event.clientX - drag.x) * .01; pitch.current = Math.max(-.25, Math.min(1.2, pitch.current + (event.clientY - drag.y) * .01)); drag.x = event.clientX; drag.y = event.clientY; render(); return; }
      const dx = event.clientX - drag.startX; const dy = event.clientY - drag.startY;
      if (!drag.setup && Math.hypot(dx, dy) > 6) {
        const setup = gestureMove(drag.hit.side, drag.hit.piece.position, dx, dy);
        if (!setup) return;
        const meshes = scene.children.filter((child) => child.userData.piece?.position[setup.axis] === setup.layer).map((mesh) => ({ mesh, position: mesh.position.clone(), quaternion: mesh.quaternion.clone() }));
        drag.setup = { ...setup, meshes, angle: 0 };
      }
      if (drag.setup) {
        const distance = drag.setup.horizontal ? dx : dy;
        const angle = distance / legacyCubePixelSize() * 1.3 * 180 / Math.PI * drag.setup.previewSign;
        previewTransform(drag.setup, THREE.MathUtils.clamp(angle, -225, 225));
      }
    };
    const pointerUp = (event) => {
      const drag = dragging.current; dragging.current = null; if (!drag?.setup) return;
      const distance = drag.setup.horizontal ? event.clientX - drag.startX : event.clientY - drag.startY; const speed = Math.abs(distance) / Math.max(1, performance.now() - drag.startTime);
      let target = Math.round(drag.setup.angle / 90) * 90;
      if (speed > .3 && Math.abs(drag.setup.angle) > 4) target = drag.setup.angle > 0 ? Math.ceil(drag.setup.angle / 90) * 90 : Math.floor(drag.setup.angle / 90) * 90;
      target = THREE.MathUtils.clamp(target, -180, 180);
      const effectiveAngle = (drag.setup.move.endsWith("'") ? -MOVE_CONFIG[drag.setup.move[0]].angle : MOVE_CONFIG[drag.setup.move].angle); const turns = Math.round(target / effectiveAngle);
      const move = turns === 0 ? null : Math.abs(turns) === 2 ? `${drag.setup.move.replace("'", "")}2` : turns > 0 ? drag.setup.move : drag.setup.move.endsWith("'") ? drag.setup.move[0] : `${drag.setup.move}'`;
      const duration = Math.max(110, Math.min(320, 110 + Math.abs(target - drag.setup.angle) * 1.8)); const start = performance.now(); const from = drag.setup.angle; turnAnimation.current = true;
      const finish = () => {
        // Snapping a short/slow drag back to zero is a valid gesture, not a
        // cube move. Passing null into the model used to throw and unmount
        // the entire React tree, leaving the WebGL scene blank.
        if (move) onTurnRef.current?.(move);
        turnAnimation.current = false;
      };
      const animate = (now) => { const progress = Math.min(1, (now - start) / duration); previewTransform(drag.setup, from + (target - from) * legacyTurnEase(progress)); if (progress < 1) requestAnimationFrame(animate); else finish(); };
      requestAnimationFrame(animate);
    };
    const render = () => {
      const current = gameRef.current;
      const activePiece = getActivePiece(current.cube, current.activePieceId);
      // The legacy chamber rendered into an 88vmin square nested in the full
      // stage. Its equivalent framing in this full-viewport canvas needs a
      // little more camera distance to retain the same calm margin.
      const { clientWidth = 1, clientHeight = 1 } = host.current ?? {};
      // Mobile uses the current projected silhouette for a near-fullscreen
      // contain fit. Wider desktop layouts retain the established framing.
      const overviewDistance = clientWidth <= 900
        ? mobileOverviewDistance(clientWidth, clientHeight, yaw.current, pitch.current)
        : 17.5 * Math.max(1, clientHeight / Math.max(1, clientWidth));
      const distance = current.mode === "interior" ? 14.6 : overviewDistance;
      const target = current.mode === "interior" && activePiece
        ? new THREE.Vector3(activePiece.position.x * STEP, activePiece.position.y * STEP - .4, activePiece.position.z * STEP)
        : new THREE.Vector3();
      // Interior mode orbits the active chamber itself, rather than continuing
      // to orbit the cube origin after that chamber has moved to a new slot.
      camera.position.copy(target).add(new THREE.Vector3(
        Math.sin(yaw.current) * Math.cos(pitch.current) * distance,
        Math.sin(pitch.current) * distance,
        Math.cos(yaw.current) * Math.cos(pitch.current) * distance,
      ));
      const targetFov = current.mode === "interior" ? 35 : 38;
      if (camera.fov !== targetFov) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
      camera.lookAt(target);
      // The active-piece bloom exists only in Cube mode. Rendering the
      // chamber directly avoids a multisampled half-float target plus the
      // bloom passes after every one-cell player movement.
      if (current.mode === "interior") renderer.render(scene, camera);
      else composer.render();
    };
    const observer = new ResizeObserver(() => { resize(); render(); }); observer.observe(host.current); host.current.addEventListener("pointerdown", pointerDown); window.addEventListener("pointermove", pointerMove); window.addEventListener("pointerup", pointerUp); window.addEventListener("pointercancel", pointerUp); resize();
    rendererRef.current = { renderer, render };
    return () => { observer.disconnect(); host.current?.removeEventListener("pointerdown", pointerDown); window.removeEventListener("pointermove", pointerMove); window.removeEventListener("pointerup", pointerUp); window.removeEventListener("pointercancel", pointerUp); scene.background?.dispose?.(); scene.children.forEach(disposeObjectTree); composer.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return;
    // Match the legacy Little-cube transition: entering the active chamber
    // always settles the presentation to the same readable isometric pose,
    // instead of inheriting an arbitrary overview drag angle.
    if (game.mode === "interior" && previousMode.current !== "interior") {
      yaw.current = Math.atan2(7, 8);
      pitch.current = Math.asin(7 / Math.sqrt(162));
    }
    previousMode.current = game.mode;
    pawnRef.current = null;
    for (const item of [...scene.children]) if (item.userData.worldObject) {
      scene.remove(item);
      disposeObjectTree(item);
    }
    const activePiece = getActivePiece(game.cube, game.activePieceId);
    if (game.mode === "cube") {
      game.cube.forEach((piece) => { const cubelet = createCubelet(piece, game.material, piece.id === game.activePieceId); cubelet.userData.worldObject = true; scene.add(cubelet); });
    } else if (activePiece) {
      const before = new Set(scene.children);
      pawnRef.current = addInterior(scene, activePiece, game.player, game.activePieceId, { ...game.level, skin: game.skin, collectedItemIds: game.collectedItemIds }, game.solidCell);
      scene.children.filter((item) => !before.has(item)).forEach((item) => { item.userData.worldObject = true; });
    }
    rendererRef.current?.render();
  }, [game.mode, game.cube, game.activePieceId, game.level, game.material, game.skin, game.solidCell, game.collectedItemIds]);

  useEffect(() => {
    if (game.mode !== "interior" || !pawnRef.current) return;
    const activePiece = getActivePiece(game.cube, game.activePieceId);
    if (!activePiece) return;
    positionInteriorPlayer(pawnRef.current, activePiece, game.player);
    rendererRef.current?.render();
  }, [game.player, game.mode, game.cube, game.activePieceId]);
  return h("div", { className: "scene-host", ref: host, "aria-label": "Interactive 3D Rubik's Cube puzzle" });
}

function fullscreenElement() {
  return document.fullscreenElement ?? document.webkitFullscreenElement;
}

function fullscreenDisplayMode() {
  return Boolean(
    fullscreenElement()
    || window.matchMedia("(display-mode: fullscreen)").matches
    || window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true
  );
}

function mobileTutorialViewport() {
  return window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
}

function landscapeViewport() {
  return window.innerWidth > window.innerHeight;
}

async function requestGameFullscreen() {
  const root = document.documentElement;
  const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
  if (!request) return false;
  try {
    await request({ navigationUI: "hide" });
  } catch {
    await request();
  }
  return true;
}

function FullscreenControl({ className = "" }) {
  const root = document.documentElement;
  const request = root.requestFullscreen?.bind(root) ?? root.webkitRequestFullscreen?.bind(root);
  const exit = document.exitFullscreen?.bind(document) ?? document.webkitExitFullscreen?.bind(document);
  const supported = Boolean(request && exit);
  const [active, setActive] = useState(Boolean(fullscreenElement()));
  useEffect(() => {
    if (!supported) return undefined;
    const update = () => setActive(Boolean(fullscreenElement()));
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, [supported]);
  if (!supported) return null;
  const toggle = async () => {
    if (fullscreenElement()) {
      await exit();
      return;
    }
    try {
      await request({ navigationUI: "hide" });
    } catch {
      await request();
    }
  };
  return h("button", { className, type: "button", onClick: toggle, "aria-pressed": active }, active ? "Exit fullscreen" : "Fullscreen");
}

function MobileTutorialGate({ active, onReady }) {
  const [state, setState] = useState(() => ({
    landscape: landscapeViewport(),
    fullscreen: fullscreenDisplayMode(),
  }));
  const [error, setError] = useState("");
  const fullscreenSupported = Boolean(document.documentElement.requestFullscreen ?? document.documentElement.webkitRequestFullscreen);

  useEffect(() => {
    if (!active) return undefined;
    const update = () => setState({ landscape: landscapeViewport(), fullscreen: fullscreenDisplayMode() });
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    update();
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, [active]);

  useEffect(() => {
    if (active && state.landscape && state.fullscreen) onReady();
  }, [active, state.landscape, state.fullscreen, onReady]);

  if (!active) return null;
  const needsRotation = !state.landscape;
  const enterFullscreen = async () => {
    setError("");
    try {
      const requested = await requestGameFullscreen();
      if (!requested) setError("Fullscreen is not available in this browser.");
      setState({ landscape: landscapeViewport(), fullscreen: fullscreenDisplayMode() });
    } catch {
      setError("Fullscreen was not enabled. Tap the button to try again.");
    }
  };

  return h("section", { className: "tutorial-preflight", role: "dialog", "aria-modal": true, "aria-labelledby": "tutorial-preflight-title" },
    h("div", { className: `tutorial-preflight-device ${needsRotation ? "is-portrait" : "is-landscape"}`, "aria-hidden": true },
      h("span", { className: "tutorial-preflight-screen" }),
      h("span", { className: "tutorial-preflight-home" })),
    h("p", { className: "tutorial-preflight-kicker" }, "Before we begin"),
    h("h1", { id: "tutorial-preflight-title" }, needsRotation ? "Turn your device sideways." : fullscreenSupported ? "Enter fullscreen to play." : "Play in landscape."),
    h("p", { className: "tutorial-preflight-copy" }, needsRotation
      ? "Cubesque-Ape uses landscape mode so the World Cube and tutorial stay clear and playable."
      : fullscreenSupported
        ? "Fullscreen keeps the cube large, the controls reachable, and accidental browser gestures out of the puzzle."
        : "This browser cannot enter fullscreen. You can still play in landscape mode."),
    !needsRotation && fullscreenSupported && h("button", { className: "tutorial-preflight-action", type: "button", onClick: enterFullscreen, autoFocus: true }, "Enter fullscreen"),
    !needsRotation && !fullscreenSupported && h("button", { className: "tutorial-preflight-action", type: "button", onClick: onReady, autoFocus: true }, "Continue without fullscreen"),
    needsRotation && h("p", { className: "tutorial-preflight-status", role: "status" }, "Waiting for landscape mode…"),
    error && h("p", { className: "tutorial-preflight-error", role: "alert" }, error));
}

function SkinControl({ skin, onChange }) {
  return h("label", { className: "skin-control" }, "Ape suit", h("select", { value: skin, onChange: (event) => onChange(event.target.value) }, h("option", { value: "classic" }, "Classic Retro"), h("option", { value: "cyber" }, "Cyber Mecha"), h("option", { value: "astronaut" }, "Astronaut")));
}

const TUTORIAL_STEPS = [
  {
    focus: "world",
    eyebrow: "The big picture",
    title: "This is the World Cube.",
    body: "The full puzzle is a 3 × 3 × 3 world made from 27 connected cube pieces.",
  },
  {
    focus: "active",
    eyebrow: "Your location",
    title: "The gold piece is active.",
    body: "It is the cube piece containing you—the Player Ape. Its glow follows you through the world.",
  },
  {
    focus: "control",
    eyebrow: "Look inside",
    title: "Open the active piece.",
    body: "Press the highlighted “Little cube” button to zoom into the room where your Ape is standing.",
  },
  {
    focus: "interior",
    eyebrow: "Inside a cube piece",
    title: "Every room has a 4 × 4 grid.",
    body: "Use the arrow keys—or the on-screen arrows—to move one cell at a time. Find doors, avoid obstacles, and reach the Golden Banana.",
  },
];

function TutorialOverlay({ step, onNext, onSkip, onFinish }) {
  const cardRef = useRef(null);
  if (step === null || step < 0) return null;
  const content = TUTORIAL_STEPS[step];
  const waitsForModeButton = step === 2;
  const trapFocus = (event) => {
    if (waitsForModeButton || event.key !== "Tab") return;
    const focusable = [...cardRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return h("section", { className: `tutorial-overlay tutorial-step-${step + 1}`, "aria-label": "Game tutorial", "aria-live": "polite" },
    h("div", { className: `tutorial-focus tutorial-focus--${content.focus}`, "aria-hidden": true }),
    h("div", { ref: cardRef, className: "tutorial-card", role: "dialog", "aria-modal": !waitsForModeButton, "aria-labelledby": "tutorial-title", onKeyDown: trapFocus },
      h("div", { className: "tutorial-progress", "aria-label": `Tutorial step ${step + 1} of ${TUTORIAL_STEPS.length}` },
        TUTORIAL_STEPS.map((_, index) => h("span", { key: index, className: index === step ? "is-current" : index < step ? "is-complete" : "" }))),
      h("p", { className: "tutorial-eyebrow" }, `${String(step + 1).padStart(2, "0")} / 04 · ${content.eyebrow}`),
      h("h2", { id: "tutorial-title" }, content.title),
      h("p", { className: "tutorial-copy" }, content.body),
      h("div", { className: "tutorial-actions" },
        h("button", { className: "tutorial-skip", type: "button", onClick: onSkip }, "Skip tour"),
        waitsForModeButton
          ? h("span", { className: "tutorial-hint" }, "Waiting for your click…")
          : h("button", { className: "tutorial-next", type: "button", autoFocus: true, onClick: step === TUTORIAL_STEPS.length - 1 ? onFinish : onNext }, step === TUTORIAL_STEPS.length - 1 ? "Start exploring" : "Next"))));
}

function LegacyGameShell({ game, setGame, settingsOpen, setSettingsOpen, setMode, turn, tutorialStep, setTutorialStep, completeTutorial, replayTutorial }) {
  const tutorialTargetsModeButton = tutorialStep === 2;
  const toggleMode = () => {
    const nextMode = game.mode === "cube" ? "interior" : "cube";
    setMode(nextMode);
    if (tutorialTargetsModeButton && nextMode === "interior") setTutorialStep(3);
  };
  return h("main", { className: "stage", "aria-label": "Cubesque-Ape isometric cube puzzle" },
    h("p", { className: "game-brand" }, "Cubesque-Ape"), h("div", { className: "scene-shell" }, h(CubeScene, { game, onTurn: turn })),
    h("button", { className: "settings-toggle", type: "button", "aria-label": "Open Settings", onClick: () => setSettingsOpen(true) }, "⚙"),
    h(FullscreenControl, { className: "fullscreen-toggle" }),
    h("div", { className: "settings-modal", hidden: !settingsOpen, "aria-hidden": !settingsOpen }, h("div", { className: "settings-backdrop", onClick: () => setSettingsOpen(false) }), h("div", { className: "settings-content" }, h("div", { className: "settings-header" }, h("h2", null, "Settings"), h("button", { className: "settings-close", type: "button", onClick: () => setSettingsOpen(false) }, "×")), h("div", { className: "settings-body" }, h("div", { className: "settings-section" }, h("h3", null, "Select Ape Suit"), h("div", { className: "skin-cards-list" }, [["classic", "Classic Retro", "Organic brown fur with visible eyes, no red tie."], ["cyber", "Cyber Mecha", "Glow reactor chest plate, left mecha arm, and visor."], ["astronaut", "Astronaut Suit", "Spacesuit with oxygen tanks and gold visor flipped up."]].map(([skin, title, description]) => h("button", { type: "button", key: skin, className: `skin-card ${game.skin === skin ? "active" : ""}`, onClick: () => setGame((current) => ({ ...current, skin })) }, h("span", { className: "skin-card-header" }, title), h("span", { className: "skin-card-desc" }, description))))), h("div", { className: "settings-section settings-actions" }, h("button", { type: "button", onClick: replayTutorial }, "Replay tutorial"))))),
    game.levelComplete && h("div", { className: "victory-modal", role: "dialog", "aria-modal": true }, h("div", { className: "victory-backdrop" }), h("div", { className: "victory-content" }, h("p", { className: "victory-kicker" }, "Golden banana collected"), h("h2", null, "Congrats, you have beat the level!"), h("button", { className: "victory-continue", type: "button", autoFocus: true, onClick: () => setGame(createGameState(game.level)) }, "Continue"))),
    h("button", { className: `mode-toggle ${tutorialTargetsModeButton ? "tutorial-mode-target" : ""}`, type: "button", "aria-pressed": game.mode === "interior", onClick: toggleMode }, game.mode === "cube" ? "Little cube" : "Big cube"),
    game.mode === "interior" && h("nav", { className: "touch-move-controls", "aria-label": "Move the Ape" }, [["ArrowUp", "touch-move-up", "▲"], ["ArrowLeft", "touch-move-left", "◀"], ["ArrowRight", "touch-move-right", "▶"], ["ArrowDown", "touch-move-down", "▼"]].map(([key, className, icon]) => h("button", { key, type: "button", className: `touch-move ${className}`, onClick: () => setGame((current) => movePlayerInWorld(current, key)) }, icon))),
    h(MobileTutorialGate, { active: tutorialStep === -1, onReady: () => setTutorialStep(0) }),
    h(TutorialOverlay, { step: tutorialStep, onNext: () => setTutorialStep((current) => current + 1), onSkip: completeTutorial, onFinish: completeTutorial })
  );
}

function App() {
  const [game, setGame] = useState(createGameState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(() => {
    try { return window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === "complete" ? null : mobileTutorialViewport() ? -1 : 0; }
    catch { return mobileTutorialViewport() ? -1 : 0; }
  });
  useEffect(() => {
    loadPrimaryLevel().then((level) => setGame(createGameState(level))).catch(() => {});
  }, []);
  useEffect(() => { const onKey = (event) => { if (game.mode !== "interior" || !event.key.startsWith("Arrow")) return; event.preventDefault(); setGame((current) => movePlayerInWorld(current, event.key)); }; window.addEventListener("keydown", onKey, { passive: false }); return () => window.removeEventListener("keydown", onKey); }, [game.mode]);
  // A view-mode change does not alter world state. Player settling happens at
  // cube-turn boundaries, where the active chamber's own obstacles are known.
  const setMode = (mode) => setGame((current) => ({ ...current, mode }));
  const turn = (move) => setGame((current) => current.mode === "cube" && typeof move === "string" ? turnCube(current, move) : current);
  const completeTutorial = () => {
    try { window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "complete"); } catch {}
    setTutorialStep(null);
  };
  const replayTutorial = () => {
    setSettingsOpen(false);
    setGame((current) => ({ ...current, mode: "cube" }));
    setTutorialStep(mobileTutorialViewport() && !fullscreenDisplayMode() ? -1 : 0);
  };
  return h(LegacyGameShell, { game, setGame, settingsOpen, setSettingsOpen, setMode, turn, tutorialStep, setTutorialStep, completeTutorial, replayTutorial });
}

const root = createRoot(document.getElementById("root"));
if (window.location.pathname === "/editor" || window.location.pathname.startsWith("/editor/")) {
  import("./editor/EditorRoute.tsx")
    .then(({ default: EditorRoute }) => root.render(h(EditorRoute)))
    .catch(() => root.render(h("main", { className: "editor-error", role: "alert" }, "The editor could not be loaded.")));
} else {
  root.render(h(App));
}
