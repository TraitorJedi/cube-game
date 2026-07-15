import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { GRID_SIZE, DOORS, createGameState, getActivePiece, getFloorFace, movePlayerInWorld, settlePlayer, turnCube, parseMoves, undoCube } from "./engine.js";

const { createElement: h } = React;
const STEP = 1.92;
// Palette retained from the original Cube Explorer design.
const COLORS = { red: 0xd83a34, orange: 0xf28b24, white: 0xf7f3e7, yellow: 0xf4d13d, blue: 0x246fe5, green: 0x2fb56d, core: 0x16181f };

function createCubelet(piece, materialMode) {
  const materialFaces = ["right", "left", "up", "down", "front", "back"];
  const materials = materialFaces.map((face) => {
    const color = COLORS[piece.stickers[face]] ?? COLORS.core;
    return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .045, roughness: .7, metalness: .04, transparent: materialMode === "glass", opacity: materialMode === "glass" ? .56 : 1 });
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.74, 1.74, 1.74), materials);
  mesh.position.set(piece.position.x * STEP, piece.position.y * STEP, piece.position.z * STEP);
  mesh.userData.active = piece.id === "1,1,1";
  return mesh;
}

function addInterior(scene, piece, player, activePieceId) {
  const origin = new THREE.Vector3(piece.position.x * STEP, piece.position.y * STEP, piece.position.z * STEP);
  const cell = 1.45 / GRID_SIZE;
  const floorColor = COLORS[getFloorFace(piece)] ?? COLORS.core;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.48, .08, 1.48), new THREE.MeshStandardMaterial({ color: floorColor, roughness: .9 }));
  floor.position.copy(origin).add(new THREE.Vector3(0, -.76, 0)); scene.add(floor);
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xd8bf58 });
  for (let i = 0; i <= GRID_SIZE; i++) {
    const t = -.72 + i * cell;
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(.012, .012, 1.45), lineMaterial); horizontal.position.copy(origin).add(new THREE.Vector3(t, -.70, 0)); scene.add(horizontal);
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(1.45, .012, .012), lineMaterial); vertical.position.copy(origin).add(new THREE.Vector3(0, -.70, t)); scene.add(vertical);
  }
  const walls = [
    ["left", new THREE.BoxGeometry(.06, 1.45, 1.48), new THREE.Vector3(-.77, -.05, 0)],
    ["right", new THREE.BoxGeometry(.06, 1.45, 1.48), new THREE.Vector3(.77, -.05, 0)],
    ["front", new THREE.BoxGeometry(1.48, 1.45, .06), new THREE.Vector3(0, -.05, .77)],
    ["back", new THREE.BoxGeometry(1.48, 1.45, .06), new THREE.Vector3(0, -.05, -.77)],
  ];
  const door = DOORS.find((candidate) => candidate.pieceId === activePieceId);
  walls.forEach(([face, geometry, offset]) => {
    const material = new THREE.MeshStandardMaterial({ color: COLORS[piece.stickers[face]] ?? COLORS.core, transparent: true, opacity: .66 });
    if (!door || piece.stickers[face] !== door.faceColor) {
      const wall = new THREE.Mesh(geometry, material);
      wall.position.copy(origin).add(offset); scene.add(wall);
      return;
    }
    // Build this wall from cells and deliberately omit the door's cell. This
    // is an actual opening: no mesh exists in its volume or across its face.
    const zWall = face === "front" || face === "back";
    const doorZ = face === "back" ? 0 : GRID_SIZE - 1;
    for (let row = 0; row < GRID_SIZE; row += 1) for (let column = 0; column < GRID_SIZE; column += 1) {
      const panelX = zWall ? column : (face === "left" ? 0 : GRID_SIZE - 1);
      const panelZ = zWall ? doorZ : column;
      if (panelX === door.cell.x && panelZ === door.cell.z && row === door.cell.y) continue;
      const panel = new THREE.Mesh(zWall ? new THREE.BoxGeometry(cell - .012, cell - .012, .06) : new THREE.BoxGeometry(.06, cell - .012, cell - .012), material);
      const lateral = -.72 + (column + .5) * cell;
      panel.position.copy(origin).add(zWall ? new THREE.Vector3(lateral, -.72 + (row + .5) * cell, offset.z) : new THREE.Vector3(offset.x, -.72 + (row + .5) * cell, lateral));
      scene.add(panel);
    }
    // A thin high-contrast threshold keeps the empty opening legible from the
    // isometric camera without filling it back in.
    const openingX = -.72 + (door.cell.x + .5) * cell;
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(cell * .95, .018, .06), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    threshold.position.copy(origin).add(zWall ? new THREE.Vector3(openingX, -.71, offset.z) : new THREE.Vector3(offset.x, -.71, openingX));
    scene.add(threshold);
  });
  // Grid lines start at -0.72. Add half a cell so the player is tile-centered, never on an intersection.
  const local = (value) => -.72 + (value + .5) * cell;
  const pawn = new THREE.Mesh(new THREE.BoxGeometry(cell * .68, cell * .68, cell * .68), new THREE.MeshStandardMaterial({ color: 0xf5d54d, emissive: 0xa46918, emissiveIntensity: .25 }));
  pawn.position.copy(origin).add(new THREE.Vector3(local(player.x), -.595, local(player.z))); scene.add(pawn);
}

function CubeScene({ game }) {
  const host = useRef(null);
  const cameraRef = useRef();
  const sceneRef = useRef();
  const rendererRef = useRef();
  const gameRef = useRef(game);
  gameRef.current = game;
  // Show the initial Green / Orange / White back-left-top corner.
  const yaw = useRef(-2.49); const pitch = useRef(.45); const dragging = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x10130f); scene.fog = new THREE.Fog(0x10130f, 11, 25); sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(38, 1, .1, 100); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true; host.current.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xf4f1df, 0x243428, 1.35)); const light = new THREE.DirectionalLight(0xfff9e8, 2.3); light.position.set(6, 10, 8); scene.add(light); const fill = new THREE.DirectionalLight(0x4c75ae, .7); fill.position.set(-6, -3, -4); scene.add(fill);
    const resize = () => { const { clientWidth, clientHeight } = host.current; renderer.setSize(clientWidth, clientHeight, false); camera.aspect = clientWidth / clientHeight; camera.updateProjectionMatrix(); };
    const pointerDown = (event) => { dragging.current = { x: event.clientX, y: event.clientY }; };
    const pointerMove = (event) => { if (!dragging.current || gameRef.current.mode !== "cube") return; yaw.current += (event.clientX - dragging.current.x) * .01; pitch.current = Math.max(-.25, Math.min(1.2, pitch.current + (event.clientY - dragging.current.y) * .01)); dragging.current = { x: event.clientX, y: event.clientY }; render(); };
    const pointerUp = () => { dragging.current = null; };
    const render = () => {
      const current = gameRef.current;
      const activePiece = getActivePiece(current.cube, current.activePieceId);
      const distance = current.mode === "interior" ? 7.6 : 13;
      const target = current.mode === "interior" && activePiece
        ? new THREE.Vector3(activePiece.position.x * STEP, activePiece.position.y * STEP - .35, activePiece.position.z * STEP + .3)
        : new THREE.Vector3();
      // Interior mode orbits the active chamber itself, rather than continuing
      // to orbit the cube origin after that chamber has moved to a new slot.
      camera.position.copy(target).add(new THREE.Vector3(
        Math.sin(yaw.current) * Math.cos(pitch.current) * distance,
        Math.sin(pitch.current) * distance,
        Math.cos(yaw.current) * Math.cos(pitch.current) * distance,
      ));
      camera.lookAt(target); renderer.render(scene, camera);
    };
    const observer = new ResizeObserver(() => { resize(); render(); }); observer.observe(host.current); host.current.addEventListener("pointerdown", pointerDown); window.addEventListener("pointermove", pointerMove); window.addEventListener("pointerup", pointerUp); resize();
    rendererRef.current = { renderer, render };
    return () => { observer.disconnect(); host.current?.removeEventListener("pointerdown", pointerDown); window.removeEventListener("pointermove", pointerMove); window.removeEventListener("pointerup", pointerUp); renderer.dispose(); renderer.domElement.remove(); };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current; if (!scene) return;
    for (const item of [...scene.children]) if (item.userData.worldObject) scene.remove(item);
    const activePiece = getActivePiece(game.cube, game.activePieceId);
    game.cube.forEach((piece) => { const cubelet = createCubelet(piece, game.material); cubelet.userData.worldObject = true; cubelet.visible = !(game.mode === "interior" && piece.id === activePiece?.id); scene.add(cubelet); });
    if (game.mode === "interior" && activePiece) { const before = new Set(scene.children); addInterior(scene, activePiece, game.player, game.activePieceId); scene.children.filter((item) => !before.has(item)).forEach((item) => { item.userData.worldObject = true; }); }
    rendererRef.current?.render();
  }, [game]);
  return h("div", { className: "scene-host", ref: host, "aria-label": "Interactive 3D Rubik's Cube puzzle" });
}

function App() {
  const [game, setGame] = useState(createGameState);
  const [command, setCommand] = useState("R U R' U'");
  useEffect(() => { const onKey = (event) => { if (game.mode !== "interior" || !event.key.startsWith("Arrow")) return; event.preventDefault(); setGame((current) => movePlayerInWorld(current, event.key)); }; window.addEventListener("keydown", onKey, { passive: false }); return () => window.removeEventListener("keydown", onKey); }, [game.mode]);
  useEffect(() => { window.render_game_to_text = () => { const activePiece = getActivePiece(game.cube, game.activePieceId); return JSON.stringify({ mode: game.mode, material: game.material, activePiece: game.activePieceId === "1,1,1" ? "R/W/B" : "W/B middle", activePosition: activePiece?.position, floor: getFloorFace(activePiece), player: game.player, doors: DOORS.filter((door) => door.pieceId === game.activePieceId).map((door) => ({ face: door.faceColor, cell: door.cell, faceCell: door.faceCell })), axes: "x Blue/Green right/left; z Red/Orange front/back; y White/Yellow up/down", gravity: "Yellow (world -Y)", moves: game.moves, grid: "4x4" }); }; window.advanceTime = () => {}; }, [game]);
  const setMode = (mode) => setGame((current) => ({ ...current, mode, player: settlePlayer(current.player) }));
  const turn = (move) => setGame((current) => current.mode === "cube" ? turnCube(current, move) : current);
  const runCommand = () => setGame((current) => parseMoves(command).reduce((next, move) => turnCube(next, move), current));
  const shuffle = () => { const tokens = ["U", "D", "L", "R", "F", "B", "U'", "D'", "L'", "R'", "F'", "B'"]; const sequence = Array.from({ length: 12 }, () => tokens[Math.floor(Math.random() * tokens.length)]); setGame((current) => sequence.reduce((next, move) => turnCube(next, move), current)); };
  const moves = ["U", "D", "L", "R", "F", "B", "M", "E", "S"];
  const cubePanel = h("section", { className: "cube-panel", "aria-label": "Cube Explorer controls" }, h("p", { className: "eyebrow" }, "Cube Explorer"), h("h1", null, "I am the cube."), h("p", { className: "lede" }, "Twist faces, move center rings, and inspect the puzzle's logic."), h("div", { className: "command" }, h("span", null, "cube.twist("), h("input", { value: command, onChange: (event) => setCommand(event.target.value), "aria-label": "Twist notation" }), h("span", null, ")"), h("button", { type: "button", onClick: runCommand }, "Run")), h("aside", { className: "cube-toolbar", "aria-label": "Cube settings" }, h("div", null, h("h2", null, "Styles"), ["grid", "glass"].map((style) => h("button", { key: style, type: "button", className: `chip ${game.material === style ? "is-active" : ""}`, onClick: () => setGame((current) => ({ ...current, material: style })) }, style))), h("div", null, h("h2", null, "Actions"), h("button", { type: "button", className: "chip", onClick: () => setGame(undoCube) }, "Undo"), h("button", { type: "button", className: "chip", onClick: shuffle }, "Shuffle"), h("button", { type: "button", className: "chip", onClick: () => setGame(createGameState) }, "Reset"))), h("div", { className: "face-controls", "aria-label": "Face and center-ring turns" }, moves.flatMap((move) => [h("button", { key: move, type: "button", onClick: () => turn(move) }, move), h("button", { key: `${move}'`, type: "button", onClick: () => turn(`${move}'`) }, `${move}'`)])));
  const activePiece = getActivePiece(game.cube, game.activePieceId);
  const floor = getFloorFace(activePiece);
  return h("main", { className: "app" }, game.mode === "cube" ? cubePanel : h("div", { className: "brand" }, h("p", { className: "eyebrow" }, "Cube / Interior"), h("h1", null, "A puzzle engine begins here."), h("p", null, "Navigate a single cell through the living core of a Rubik's Cube.")), h("div", { className: "hud" }, h("p", null, "Active chamber"), h("strong", null, "Red / White / Blue"), h("p", null, `Floor: ${floor ?? "core"} · Gravity: Yellow`)), h(CubeScene, { game }), h("div", { className: "mode-switch", "aria-label": "Interaction mode" }, h("button", { type: "button", "aria-pressed": game.mode === "cube", onClick: () => setMode("cube") }, "Cube mode"), h("button", { type: "button", "aria-pressed": game.mode === "interior", onClick: () => setMode("interior") }, "Enter chamber")), h("div", { className: "instructions" }, game.mode === "interior" ? h(React.Fragment, null, h("kbd", null, "Arrow keys"), " move on the 4 x 4 world-aligned floor.") : "Drag empty space to orbit. Click a face-turn control or run cube notation."));
}

createRoot(document.getElementById("root")).render(h(App));
