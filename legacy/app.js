import * as THREE from "three";
import { inject } from '@vercel/analytics';
import {
  generateClassicApe,
  generateCyberApe,
  generateAstronautApe
} from "../voxel-art/generator.js";

// Initialize Vercel Analytics
inject();

const cube = document.querySelector("#cube");
const scene = document.querySelector("#scene");
const modeToggle = document.querySelector("#modeToggle");
const littleView = document.querySelector("#littleView");
const interiorCanvas = document.querySelector("#interiorCanvas");

// Interior state uses a world-aligned logical 4 x 4 floor. A view change or a
// face turn never rotates these coordinates: Yellow/world-down remains down.
const GRID_SIZE = 4;
// A full 4 x 4 x 4 logical cell. The initial (x, z, y) is (1, 1, 0)
// relative to Green, Orange, and Yellow respectively.
let player = { x: 1, y: 0, z: 1 };
// This cell is a real, solid part of the active chamber.  It starts in the
// Green / Orange / Yellow corner and rotates with the R/W/B cubelet.
// This is the level's only obstacle.  Like doors, it belongs to the R/W/B
// piece, rather than to whichever piece happens to be active.
let solidCell = { x: 0, y: 0, z: 0 };
let solidFaces = { left: "green", back: "orange", down: "yellow" };
// The banana is one Yellow-relative cell above the Green / Orange / Yellow
// corner obstacle: G/O/Y (0, 0, 1). It travels with that obstacle's piece.
let bananaCell = { x: 0, y: 1, z: 0 };
let bananaCollected = false;
let levelComplete = false;
const faceColors = {
  red: 0xd83a34, orange: 0xf28b24, white: 0xf7f3e7,
  yellow: 0xf2cf43, blue: 0x246fe5, green: 0x2fb56d, core: 0x16181f
};
const stickerFaceColors = {
  front: "red", back: "orange", right: "blue", left: "green", up: "white", down: "yellow"
};
const initialInteriorFaces = Object.freeze({
  front: "red", back: "orange", right: "blue", left: "green", up: "white", down: "yellow"
});

// Door coordinates are distances from the named initial colour faces
// (Green, Orange, Yellow).  Resolving them through `interiorFaces` makes the
// opening travel with its piece through every quarter turn.
const DOORS = Object.freeze([
  Object.freeze({ pieceIndex: 26, face: "orange", position: Object.freeze({ green: 3, orange: 0, yellow: 0 }) }),
  Object.freeze({ pieceIndex: 25, face: "red", position: Object.freeze({ green: 3, orange: 3, yellow: 0 }) }),
]);

const stickers = {
  front: { axis: "z", value: 1, label: "F" },
  back: { axis: "z", value: -1, label: "B" },
  right: { axis: "x", value: 1, label: "R" },
  left: { axis: "x", value: -1, label: "L" },
  up: { axis: "y", value: 1, label: "U" },
  down: { axis: "y", value: -1, label: "D" }
};

const sideVectors = {
  front: { x: 0, y: 0, z: 1 },
  back: { x: 0, y: 0, z: -1 },
  right: { x: 1, y: 0, z: 0 },
  left: { x: -1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  down: { x: 0, y: -1, z: 0 }
};

const moveConfig = {
  U: { axis: "y", layer: 1, angle: -90 },
  D: { axis: "y", layer: -1, angle: 90 },
  E: { axis: "y", layer: 0, angle: 90 },
  R: { axis: "x", layer: 1, angle: -90 },
  L: { axis: "x", layer: -1, angle: 90 },
  M: { axis: "x", layer: 0, angle: 90 },
  // Clockwise when viewed directly from the named face. F sends the active
  // R/W/B corner to bottom/front/right: Blue down, Red front, White right.
  F: { axis: "z", layer: 1, angle: -90 },
  B: { axis: "z", layer: -1, angle: 90 },
  S: { axis: "z", layer: 0, angle: 90 }
};

// Local right/up axes as each face is viewed straight on from outside the cube.
const faceFrames = {
  front: { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
  back: { right: { x: -1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } },
  right: { right: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 } },
  left: { right: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } },
  up: { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 } },
  down: { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } }
};

const history = [];
const cubelets = [];
let drag = null;
let faceDrag = null;
let rotation = { x: -24, y: -34 };
let toastTimer = 0;
let turnQueue = Promise.resolve();
let activeMove = null;
let dragPreview = null;
let littleMode = false;
let activePieceIndex = 26; // initial Red / White / Blue corner
const WHITE_BLUE_MIDDLE_INDEX = 25;
let currentSkin = "classic";

function createInteriorScene(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  host.append(renderer.domElement);

  const scene3d = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(7, 7, 8);
  camera.lookAt(0, -0.4, 0);
  scene3d.add(new THREE.HemisphereLight(0xffffff, 0x101419, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(4, 8, 5);
  scene3d.add(key);

  const addGridPlane = (color, position, rotation, opacity = 1) => {
    const surface = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }),
    );
    surface.position.set(...position);
    surface.rotation.set(...rotation);
    scene3d.add(surface);
    const points = [];
    for (let step = -2; step <= 2; step += 1) {
      points.push(new THREE.Vector3(-2, step, 0), new THREE.Vector3(2, step, 0));
      points.push(new THREE.Vector3(step, -2, 0), new THREE.Vector3(step, 2, 0));
    }
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0x2f2b1b, transparent: true, opacity: opacity < 1 ? 0 : 0.72 }),
    );
    grid.position.copy(surface.position);
    grid.rotation.copy(surface.rotation);
    grid.translateZ(0.012);
    scene3d.add(grid);
    surface.userData.grid = grid;
    return surface;
  };

  // Orange doorway: the floor-level cell at x=3 / y=0 / z=0 is deliberately
  // omitted. This is a real gap in the wall mesh, not a dark decal laid over
  // a solid plane. The gold outline simply keeps the opening legible.
  const addDoorWall = (side) => {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: faceColors.core, roughness: 0.82, metalness: 0.02, side: THREE.DoubleSide });
    for (let row = 0; row < GRID_SIZE; row += 1) for (let column = 0; column < GRID_SIZE; column += 1) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      if (side === "back") {
        panel.position.set(-1.5 + column, -1.5 + row, -2);
        panel.rotation.y = Math.PI;
      } else if (side === "right") {
        panel.position.set(2, -1.5 + row, -1.5 + column);
        panel.rotation.y = Math.PI / 2;
      } else if (side === "left") {
        panel.position.set(-2, -1.5 + row, -1.5 + column);
        panel.rotation.y = -Math.PI / 2;
      } else if (side === "front") {
        panel.position.set(-1.5 + column, -1.5 + row, 2);
      } else if (side === "up") {
        panel.position.set(-1.5 + column, 2, -1.5 + row);
        panel.rotation.x = Math.PI / 2;
      } else {
        panel.position.set(-1.5 + column, -2, 1.5 - row);
        panel.rotation.x = -Math.PI / 2;
      }
      panel.userData.cell = side === "left" ? { x: 0, y: row, z: column }
        : side === "right" ? { x: 3, y: row, z: column }
          : side === "front" ? { x: column, y: row, z: 3 }
            : side === "back" ? { x: column, y: row, z: 0 }
              : side === "up" ? { x: column, y: 3, z: row } : { x: column, y: 0, z: row };
      group.add(panel);
    }
    group.material = material;
    group.visible = false;
    scene3d.add(group);
    return group;
  };

  // A genuine 4×4×4 hollow chamber: Yellow floor, with Red, Blue and White inner walls.
  // The physical down direction is fixed to initial Yellow/world -Y. The
  // sticker facing it after a turn becomes this chamber floor.
  // Each plane is fixed to a world direction. Its color is taken from the
  // active R/W/B cubelet's sticker currently facing that direction.
  const chamberFaces = {
    down: addGridPlane(faceColors.yellow, [0, -2, 0], [-Math.PI / 2, 0, 0]),
    up: addGridPlane(faceColors.core, [0, 2, 0], [Math.PI / 2, 0, 0]),
    right: addGridPlane(faceColors.core, [2, 0, 0], [0, Math.PI / 2, 0]),
    left: addGridPlane(faceColors.core, [-2, 0, 0], [0, -Math.PI / 2, 0]),
    front: addGridPlane(faceColors.core, [0, 0, 2], [0, 0, 0]),
    back: addGridPlane(faceColors.core, [0, 0, -2], [0, Math.PI, 0]),
  };
  const doorWalls = Object.fromEntries(["left", "right", "front", "back", "up", "down"]
    .map((side) => [side, addDoorWall(side)]));

  // The ape occupies one logical 1 × 1 × 1 grid cell.
  const playerMesh = new THREE.Group();

  function rebuildPlayerMesh() {
    // Clear old children
    while (playerMesh.children.length > 0) {
      const child = playerMesh.children[0];
      playerMesh.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    }

    let voxels = [];
    if (currentSkin === "cyber") {
      voxels = generateCyberApe();
    } else if (currentSkin === "astronaut") {
      voxels = generateAstronautApe();
    } else {
      voxels = generateClassicApe();
    }

    const voxelSize = 1 / 64;
    const boxSize = voxelSize * 0.96;
    const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);

    const grouped = { solid: [], emissive: [], visor: [] };
    voxels.forEach(v => {
      const type = v.type || "solid";
      if (grouped[type]) grouped[type].push(v);
      else grouped.solid.push(v);
    });

    const materials = {
      solid: new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1 }),
      emissive: new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.1, emissiveIntensity: 2.5 }),
      visor: new THREE.MeshStandardMaterial({ roughness: 0.15, metalness: 0.95 })
    };

    materials.emissive.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
         varying vec3 vInstanceColor;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <color_vertex>",
        `#include <color_vertex>
         #ifdef USE_INSTANCING_COLOR
           vInstanceColor = instanceColor;
         #else
           vInstanceColor = vec3(1.0);
         #endif`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
         varying vec3 vInstanceColor;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "vec3 totalEmissiveRadiance = emissive;",
        "vec3 totalEmissiveRadiance = vInstanceColor * 2.5;"
      );
    };

    Object.keys(grouped).forEach(type => {
      const list = grouped[type];
      if (list.length === 0) return;

      const instMesh = new THREE.InstancedMesh(geometry, materials[type], list.length);
      instMesh.castShadow = true;
      instMesh.receiveShadow = true;

      const dummy = new THREE.Object3D();
      const tempColor = new THREE.Color();

      list.forEach((v, index) => {
        const tx = (v.x - 31.5) / 64;
        const ty = (v.y + 0.5) / 64;
        const tz = (v.z - 31.5) / 64;

        dummy.position.set(tx, ty, tz);
        dummy.updateMatrix();
        instMesh.setMatrixAt(index, dummy.matrix);

        tempColor.setHex(v.color);
        instMesh.setColorAt(index, tempColor);
      });

      instMesh.instanceMatrix.needsUpdate = true;
      if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;
      playerMesh.add(instMesh);
    });
  }

  rebuildPlayerMesh();
  scene3d.add(playerMesh);

  const solidMaterials = Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial({
    color: faceColors.core, roughness: 0.8, metalness: 0.02,
  }));
  const solidMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), solidMaterials);
  scene3d.add(solidMesh);
  const bananaYellow = new THREE.MeshStandardMaterial({ color: 0xf7c928, roughness: 0.58, metalness: 0.08, emissive: 0x4a2d00, emissiveIntensity: 0.35 });
  const bananaGold = new THREE.MeshStandardMaterial({ color: 0xffe57a, roughness: 0.45, metalness: 0.18, emissive: 0x6b4300, emissiveIntensity: 0.22 });
  const bananaStem = new THREE.MeshStandardMaterial({ color: 0x8a5a20, roughness: 0.8 });
  const bananaMesh = new THREE.Group();
  const bananaVoxelSize = 1 / 64;
  const bananaVoxel = new THREE.BoxGeometry(bananaVoxelSize * 0.96, bananaVoxelSize * 0.96, bananaVoxelSize * 0.96);
  const bananaVoxels = { yellow: [], gold: [], stem: [] };
  // The collectible uses the same 64³ voxel resolution as the Ape. Only the
  // voxels forming the curved fruit are populated, leaving the rest of its
  // 1 × 1 × 1 logical cell available as empty volume.
  const bananaRadius = 7;
  for (let x = -26; x <= 26; x += 1) {
    const centerY = Math.round(0.018 * x * x - 7);
    for (let y = centerY - bananaRadius; y <= centerY + bananaRadius; y += 1) for (let z = -bananaRadius; z <= bananaRadius; z += 1) {
      if ((y - centerY) ** 2 + z ** 2 > bananaRadius ** 2) continue;
      bananaVoxels[Math.abs(x) < 12 ? "gold" : "yellow"].push({ x, y, z });
    }
  }
  for (let x = 25; x <= 31; x += 1) for (let y = 7; y <= 12; y += 1) for (let z = -3; z <= 3; z += 1) {
    if (Math.abs(z) + Math.abs(y - 9) <= 4) bananaVoxels.stem.push({ x, y, z });
  }
  const bananaDummy = new THREE.Object3D();
  Object.entries(bananaVoxels).forEach(([type, voxels]) => {
    const material = type === "stem" ? bananaStem : type === "gold" ? bananaGold : bananaYellow;
    const mesh = new THREE.InstancedMesh(bananaVoxel, material, voxels.length);
    voxels.forEach((voxel, index) => {
      bananaDummy.position.set(voxel.x / 64, voxel.y / 64, voxel.z / 64);
      bananaDummy.updateMatrix();
      mesh.setMatrixAt(index, bananaDummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    bananaMesh.add(mesh);
  });
  bananaMesh.rotation.z = -0.18;
  scene3d.add(bananaMesh);
  const materialIndexForSide = { right: 0, left: 1, up: 2, down: 3, front: 4, back: 5 };
  const oppositeSide = { right: "left", left: "right", up: "down", down: "up", front: "back", back: "front" };

  const render = () => {
    const { clientWidth, clientHeight } = host;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.render(scene3d, camera);
  };
  const resizeObserver = new ResizeObserver(render);
  resizeObserver.observe(host);
  return {
    setPlayer({ x, y, z }) {
      // The group origin is at the soles of the ape, exactly on its cell floor.
      playerMesh.position.set(-1.5 + x, -2 + y, -1.5 + z);
      render();
    },
    changeSkin(newSkin) {
      currentSkin = newSkin;
      rebuildPlayerMesh();
      render();
    },
    setSolidCell(cell, faces, visible = true) {
      solidMesh.visible = visible;
      if (!visible) { render(); return; }
      solidMesh.position.set(-1.5 + cell.x, -1.5 + cell.y, -1.5 + cell.z);
      solidMaterials.forEach((material) => material.color.setHex(faceColors.core));
      // The faces visible from the room are the inward continuation of the
      // coloured outer walls occupied by this solid corner cell.
      Object.entries(faces).forEach(([outerSide, colorName]) => {
        const innerSide = oppositeSide[outerSide];
        solidMaterials[materialIndexForSide[innerSide]].color.setHex(faceColors[colorName] ?? faceColors.core);
      });
      render();
    },
    setBananaCell(cell, visible = true) {
      bananaMesh.visible = visible;
      // Set its voxel base directly on the solid's upper face. The collectible
      // still occupies the logical cell above the obstacle for gameplay.
      if (visible) bananaMesh.position.set(-1.5 + cell.x, -1.78 + cell.y, -1.5 + cell.z);
      render();
    },
    setChamber(stickerMap) {
      const activeDoor = doorForPiece(activePieceIndex);
      const activeDoorSide = activeDoor && sideForFace(activeCubelet(), activeDoor.face);
      const activeDoorCell = activeDoor && doorCell(activeDoor, activeCubelet());
      const isVisibleInteriorFace = (side) => side === "back" || side === "left" || side === "down";
      Object.entries(doorWalls).forEach(([side, wall]) => {
        // The chamber is a fixed front/right/top cutaway. A door keeps its
        // world state on those faces, but never closes the viewing aperture.
        const visible = side === activeDoorSide && isVisibleInteriorFace(side);
        wall.visible = visible;
        if (visible) {
          wall.material.color.setHex(faceColors[activeDoor.face]);
          wall.children.forEach((panel) => { panel.visible = !sameCell(panel.userData.cell, activeDoorCell); });
        }
      });
      Object.entries(chamberFaces).forEach(([side, surface]) => {
        // Before its first turn, the active corner has no outward world-down
        // sticker, so its interior floor starts Yellow. Thereafter, the
        // current world-down sticker is the floor.
        const sticker = stickerMap?.[side];
        const colorName = sticker && (faceColors[sticker] ? sticker : stickerFaceColors[sticker]);
        const color = faceColors[colorName ?? (side === "down" ? "yellow" : "core")];
        // The regular right plane stays cut away; when Red is there, the
        // segmented redDoorWall replaces it so its missing doorway cell is
        // genuinely empty rather than covered by a transparent full plane.
        const cutaway = !isVisibleInteriorFace(side) || side === activeDoorSide;
        surface.material.color.setHex(color);
        surface.material.emissive.setHex(color);
        surface.material.emissiveIntensity = 0.06;
        surface.material.transparent = cutaway;
        surface.material.opacity = cutaway ? 0 : 1;
        surface.material.depthWrite = !cutaway;
        surface.userData.grid.material.opacity = cutaway ? 0 : 0.72;
      });
      render();
    },
    render,
  };
}

const interiorScene = createInteriorScene(interiorCanvas);

function tileStep() {
  const vmin = Math.min(window.innerWidth, window.innerHeight);
  const isTiny = window.matchMedia("(max-width: 380px)").matches;
  const isSmall = window.matchMedia("(max-width: 620px)").matches;
  const isMedium = window.matchMedia("(max-width: 980px)").matches;
  const tile = isTiny
    ? Math.min(Math.max(window.innerWidth * 0.138, 32), 43)
    : isSmall
      ? Math.min(Math.max(window.innerWidth * 0.146, 35), 50)
      : isMedium
        ? Math.min(Math.max(vmin * 0.1, 44), 66)
        : Math.min(Math.max(vmin * 0.08, 42), 74);
  const gap = isSmall
    ? Math.min(Math.max(window.innerWidth * 0.012, 3), 5)
    : Math.min(Math.max(vmin * 0.007, 3), 6);
  return tile + gap;
}

function stickerCount(position) {
  return ["x", "y", "z"].filter((axis) => Math.abs(position[axis]) === 1).length;
}

function cubeletType(position) {
  return ["hidden", "center", "edge", "corner"][stickerCount(position)];
}

function stickerMarkup(face, index) {
  return `
    <div class="sticker side-${face} color-${face}">
      <span class="face-label">${stickers[face].label}</span>
      <span class="number-label">${index}</span>
    </div>
  `;
}

function renderStickers(cubelet) {
  cubelet.element.innerHTML = Object.entries(cubelet.stickers)
    .map(([side, color]) => `
      <div class="sticker side-${side} color-${color}">
        <span class="face-label">${stickers[color].label}</span>
        <span class="number-label">${cubelet.index}</span>
      </div>
    `)
    .join("");

  cubelet.element.className = `cubie ${cubeletType(cubelet.position)}${Object.values(cubelet.stickers).includes("up") ? " has-white" : ""}${cubelet.index === activePieceIndex ? " is-active-piece" : ""}`;
}

function buildCube() {
  let index = 1;

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const position = { x, y, z };
        if (stickerCount(position) === 0) continue;

        const element = document.createElement("div");
        const visibleStickers = Object.entries(stickers)
          .filter(([, sticker]) => position[sticker.axis] === sticker.value)
          .map(([face]) => face);

        element.className = `cubie ${cubeletType(position)}${visibleStickers.includes("up") ? " has-white" : ""}${index === activePieceIndex ? " is-active-piece" : ""}`;
        element.dataset.index = String(index);
        element.innerHTML = visibleStickers.map((face) => stickerMarkup(face, index)).join("");
        cube.append(element);

        cubelets.push({
          element,
          position,
          stickers: Object.fromEntries(visibleStickers.map((face) => [face, face])),
          // The hollow interior has all six color faces, even when this
          // exterior cubelet only exposes three stickers.
          interiorFaces: { ...initialInteriorFaces },
          index
        });
        index += 1;
      }
    }
  }

  renderCubelets();
}

function baseTransform(cubelet) {
  const step = tileStep();
  const { x, y, z } = cubelet.position;
  const emphasis = cubelet.index === activePieceIndex ? " scale3d(1.12, 1.12, 1.12)" : "";
  return `translate3d(${x * step}px, ${-y * step}px, ${z * step}px)${emphasis}`;
}

function axisTransform(axis, angle) {
  return {
    x: `rotateX(${angle}deg)`,
    y: `rotateY(${angle}deg)`,
    z: `rotateZ(${angle}deg)`
  }[axis];
}

function visualAngle(axis, angle) {
  return axis === "y" ? angle : -angle;
}

function renderCubelets() {
  cubelets.forEach((cubelet) => {
    cubelet.element.style.transform = baseTransform(cubelet);
  });
}

function showToast(message) {
  // The simplified play surface deliberately has no notification chrome.
}

function applyRotation() {
  scene.style.transform = littleMode
    ? "rotateX(-32deg) rotateY(-45deg)"
    : `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
}

function touchedStickerFromElement(element) {
  const stickerElement = element?.closest?.(".sticker");
  const cubeletElement = element?.closest?.(".cubie");
  if (!stickerElement || !cubeletElement) return null;

  const side = Array.from(stickerElement.classList)
    .find((className) => className.startsWith("side-"))
    ?.replace("side-", "");
  const cubelet = cubelets.find((item) => item.element === cubeletElement);

  return side && cubelet ? { side, cubelet } : null;
}

function vectorAxis(vector) {
  return ["x", "y", "z"].find((axis) => vector[axis] !== 0);
}

function scaleVector(vector, amount) {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

function dotProduct(first, second) {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function moveForRotation(axis, layer, angle) {
  const entry = Object.entries(moveConfig).find(([, config]) => (
    config.axis === axis && config.layer === layer
  ));
  if (!entry) return null;

  const [move, config] = entry;
  return angle === config.angle ? move : `${move}'`;
}

function gestureMoveForTouch(side, position, dx, dy) {
  const frame = faceFrames[side];
  const normal = sideVectors[side];
  if (!frame || !normal) return null;

  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const rotationAxis = horizontal ? frame.up : frame.right;
  const axis = vectorAxis(rotationAxis);
  const dragDirection = horizontal
    ? scaleVector(frame.right, dx >= 0 ? 1 : -1)
    : scaleVector(frame.up, dy >= 0 ? -1 : 1);

  // Choose the quarter-turn that carries this face's normal in the drag direction.
  // This keeps back, left, top, and bottom gestures relative to the touched face.
  const positiveNormal = rotatePosition(normal, axis, 90);
  const negativeNormal = rotatePosition(normal, axis, -90);
  let angle = dotProduct(positiveNormal, dragDirection) > dotProduct(negativeNormal, dragDirection)
    ? 90
    : -90;

  // The white center is viewed from above in the default perspective, so its
  // middle-ring response needs the opposite turn to follow the pointer.
  const isWhiteCenter = side === "up"
    && position.x === 0
    && position.y === 1
    && position.z === 0;
  if (isWhiteCenter) angle *= -1;

  return moveForRotation(axis, position[axis], angle);
}

function dragSetupForTouch(side, position, horizontal) {
  const move = gestureMoveForTouch(
    side,
    position,
    horizontal ? 1 : 0,
    horizontal ? 0 : 1
  );
  const details = moveDetails(move);
  if (!move || !details) return null;

  return {
    move,
    horizontal,
    axis: details.axis,
    layer: details.layer,
    positiveAngle: details.angle
  };
}

function turnNotation(axis, layer, angle) {
  const entry = Object.entries(moveConfig).find(([, config]) => (
    config.axis === axis && config.layer === layer
  ));
  if (!entry) return null;

  const [move, config] = entry;
  const turns = Math.round(angle / config.angle);
  const normalized = ((turns % 4) + 4) % 4;
  if (normalized === 0) return null;
  if (normalized === 1) return move;
  if (normalized === 2) return `${move}2`;
  return `${move}'`;
}

function setSlicePreview(preview, angle, animated = false, duration = 0) {
  const turn = axisTransform(preview.axis, visualAngle(preview.axis, angle));
  preview.affected.forEach((cubelet) => {
    cubelet.element.classList.add("is-turning");
    cubelet.element.style.transition = animated
      ? `transform ${duration}ms cubic-bezier(0.2, 0.78, 0.2, 1), opacity 200ms ease`
      : "none";
    cubelet.element.style.transform = `${turn} ${baseTransform(cubelet)}`;
  });
  preview.angle = angle;
  dragPreview = {
    axis: preview.axis,
    layer: preview.layer,
    angle: Math.round(angle * 10) / 10,
    targetAngle: preview.targetAngle ?? null
  };
}

function clearSlicePreview(preview) {
  preview.affected.forEach((cubelet) => {
    cubelet.element.style.transition = "none";
    cubelet.element.classList.remove("is-turning");
  });
  renderCubelets();
  cube.offsetHeight;
  preview.affected.forEach((cubelet) => {
    cubelet.element.style.transition = "";
  });
  dragPreview = null;
}

function finishFaceDrag(preview, targetAngle) {
  const move = turnNotation(preview.axis, preview.layer, targetAngle);
  const remaining = Math.abs(targetAngle - preview.angle);
  const duration = Math.max(110, Math.min(320, 110 + remaining * 1.8));

  preview.targetAngle = targetAngle;
  activeMove = move || "snap-back";
  setSlicePreview(preview, targetAngle, true, duration);
  if (move) showToast(`Twist ${move}`);

  setTimeout(() => {
    if (targetAngle !== 0) {
      const activePieceTurned = preview.affected.some((cubelet) => cubelet.index === activePieceIndex);
      preview.affected.forEach((cubelet) => {
        cubelet.position = rotatePosition(cubelet.position, preview.axis, targetAngle);
        cubelet.stickers = rotateStickerSides(cubelet.stickers, preview.axis, targetAngle);
        cubelet.interiorFaces = rotateStickerSides(cubelet.interiorFaces, preview.axis, targetAngle);
        renderStickers(cubelet);
      });
      if (preview.affected.some((cubelet) => cubelet.index === 26)) rotateObstacleWithPiece(preview.axis, targetAngle);
      if (activePieceTurned) rotatePlayerWithActivePiece(preview.axis, targetAngle);
      history.push(move);
    }
    clearSlicePreview(preview);
    if (littleMode) renderInterior();
    activeMove = null;
  }, duration);
}

function parseMoves(input) {
  return input
    .replace(/[(),;]/g, " ")
    .split(/\s+/)
    .flatMap((chunk) => chunk.match(/[FBRLUDMESfbrludmes]['2]?/g) || [])
    .map((move) => move[0].toUpperCase() + move.slice(1));
}

function rotatePosition(position, axis, angle) {
  const turns = ((angle / 90) % 4 + 4) % 4;
  let next = { ...position };

  for (let index = 0; index < turns; index += 1) {
    const { x, y, z } = next;
    if (axis === "x") next = { x, y: -z, z: y };
    if (axis === "y") next = { x: z, y, z: -x };
    if (axis === "z") next = { x: -y, y: x, z };
  }

  return next;
}

function sideFromVector(vector) {
  return Object.entries(sideVectors).find(([, side]) => (
    side.x === vector.x && side.y === vector.y && side.z === vector.z
  ))?.[0];
}

function rotateStickerSides(stickerMap, axis, angle) {
  return Object.fromEntries(
    Object.entries(stickerMap).map(([side, color]) => {
      const nextSide = sideFromVector(rotatePosition(sideVectors[side], axis, angle));
      return [nextSide, color];
    })
  );
}

function moveDetails(move) {
  const baseMove = move[0].toUpperCase();
  const config = moveConfig[baseMove];
  if (!config) return null;

  const inverted = move.includes("'");
  const doubleTurn = move.includes("2");
  const multiplier = (inverted ? -1 : 1) * (doubleTurn ? 2 : 1);

  return {
    ...config,
    angle: config.angle * multiplier
  };
}

function animateMove(move, record = true) {
  const details = moveDetails(move);
  if (!details) return Promise.resolve();

  const { axis, layer, angle } = details;
  const affected = cubelets.filter((cubelet) => cubelet.position[axis] === layer);
  const activePieceTurned = affected.some((cubelet) => cubelet.index === activePieceIndex);
  const turn = axisTransform(axis, visualAngle(axis, angle));

  affected.forEach((cubelet) => {
    cubelet.element.classList.add("is-turning");
    cubelet.element.style.transform = `${turn} ${baseTransform(cubelet)}`;
  });

  if (record) history.push(move);
  activeMove = move;
  showToast(`Twist ${move}`);

  return new Promise((resolve) => {
    setTimeout(() => {
      affected.forEach((cubelet) => {
        cubelet.position = rotatePosition(cubelet.position, axis, angle);
        cubelet.stickers = rotateStickerSides(cubelet.stickers, axis, angle);
        cubelet.interiorFaces = rotateStickerSides(cubelet.interiorFaces, axis, angle);
        cubelet.element.style.transition = "none";
        cubelet.element.classList.remove("is-turning");
        renderStickers(cubelet);
      });
      if (affected.some((cubelet) => cubelet.index === 26)) rotateObstacleWithPiece(axis, angle);
      if (activePieceTurned) rotatePlayerWithActivePiece(axis, angle);
      renderCubelets();
      if (littleMode) renderInterior();
      cube.offsetHeight;
      affected.forEach((cubelet) => {
        cubelet.element.style.transition = "";
      });
      activeMove = null;
      resolve();
    }, 440);
  });
}

function runMoves(sequence, record = true) {
  const moves = Array.isArray(sequence) ? sequence : parseMoves(sequence);
  if (!moves.length) {
    showToast("Try moves like R U R' U'");
    return turnQueue;
  }

  turnQueue = turnQueue.then(async () => {
    for (const move of moves) {
      await animateMove(move, record);
    }
  });
  return turnQueue;
}

function renderInterior() {
  interiorScene.setChamber(activeCubelet()?.interiorFaces);
  interiorScene.setSolidCell(solidCell, solidFaces, activePieceIndex === 26);
  interiorScene.setBananaCell(bananaCell, activePieceIndex === 26 && !bananaCollected);
  interiorScene.setPlayer(player);
}

function activeCubelet() {
  return cubelets.find((cubelet) => cubelet.index === activePieceIndex);
}

function setActivePiece(index) {
  activePieceIndex = index;
  cubelets.forEach(renderStickers);
  renderCubelets();
}

function activeInteriorFloorFace() {
  // `down` is the immutable world -Y direction, not the current camera view.
  // Interior faces are stored as colour names, while exterior stickers use
  // side names (for example, `right` means Blue).
  const face = activeCubelet()?.interiorFaces?.down ?? activeCubelet()?.stickers.down;
  return stickerFaceColors[face] ?? face ?? "yellow";
}

function rotatePlayerWithActivePiece(axis, angle) {
  // Rotate the complete 4 x 4 x 4 cells about the chamber centre. Once the
  // turn finishes, world-down settles the player onto the lowest floor at
  // that lateral location, including the rotating solid corner cell.
  const turns = ((angle / 90) % 4 + 4) % 4;
  for (let turn = 0; turn < turns; turn += 1) {
    player = rotateInteriorCell(player, axis);
  }
  player = settlePlayerOnFloor(player);
}

function rotateInteriorCell(cell, axis) {
  const { x, y, z } = cell;
  if (axis === "x") return { x, y: GRID_SIZE - 1 - z, z: y };
  if (axis === "y") return { x: z, y, z: GRID_SIZE - 1 - x };
  return { x: GRID_SIZE - 1 - y, y: x, z };
}

function isSolidAt(x, y, z) {
  return solidCell.x === x && solidCell.y === y && solidCell.z === z;
}

function rotateObstacleWithPiece(axis, angle) {
  const turns = ((angle / 90) % 4 + 4) % 4;
  for (let turn = 0; turn < turns; turn += 1) {
    solidCell = rotateInteriorCell(solidCell, axis);
    bananaCell = rotateInteriorCell(bananaCell, axis);
    solidFaces = rotateStickerSides(solidFaces, axis, 90);
  }
}

function floorHeightAt(x, z, fallingFromY) {
  // A solid only becomes a floor when it is below (or at collision height
  // with) the player. A cube hanging above the player leaves the floor open,
  // so the player can walk underneath it.
  return solidCell.x === x && solidCell.z === z && solidCell.y <= fallingFromY
    ? solidCell.y + 1
    : 0;
}

function settlePlayerOnFloor(cell) {
  return { ...cell, y: activePieceIndex === 26 ? floorHeightAt(cell.x, cell.z, cell.y) : 0 };
}

function describePlayerWorldCell() {
  // `left`, `back`, and `down` are the three faces which define the occupied
  // world cell. Their colours change with the R/W/B piece's orientation.
  const faces = activeCubelet()?.interiorFaces ?? initialInteriorFaces;
  return {
    relativeTo: [faces.left, faces.back, faces.down],
    position: [player.x, player.z, player.y],
    floor: activeInteriorFloorFace()
  };
}

function sideForFace(piece, face) {
  return Object.entries(piece?.interiorFaces ?? initialInteriorFaces)
    .find(([, color]) => color === face)?.[0];
}

function doorCell(door, piece = cubelets.find((cubelet) => cubelet.index === door.pieceIndex)) {
  const cell = { x: 0, y: 0, z: 0 };
  const assign = (face, distance) => {
    const side = sideForFace(piece, face);
    if (side === "left") cell.x = distance;
    if (side === "right") cell.x = GRID_SIZE - 1 - distance;
    if (side === "back") cell.z = distance;
    if (side === "front") cell.z = GRID_SIZE - 1 - distance;
    if (side === "down") cell.y = distance;
    if (side === "up") cell.y = GRID_SIZE - 1 - distance;
  };
  assign("green", door.position.green);
  assign("orange", door.position.orange);
  assign("yellow", door.position.yellow);
  return cell;
}

function doorForPiece(pieceIndex) {
  return DOORS.find((door) => door.pieceIndex === pieceIndex);
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

function keyForDoorSide(side) {
  return { left: "ArrowLeft", right: "ArrowRight", back: "ArrowUp", front: "ArrowDown" }[side];
}

function doorsTouch(door, target) {
  const sourcePiece = cubelets.find((cubelet) => cubelet.index === door.pieceIndex);
  const targetPiece = cubelets.find((cubelet) => cubelet.index === target.pieceIndex);
  const sourceSide = sideForFace(sourcePiece, door.face);
  const targetSide = sideForFace(targetPiece, target.face);
  const vector = sideVectors[sourceSide];
  const opposite = sideVectors[targetSide];
  return vector && opposite && vector.x === -opposite.x && vector.y === -opposite.y && vector.z === -opposite.z
    && targetPiece.position.x - sourcePiece.position.x === vector.x
    && targetPiece.position.y - sourcePiece.position.y === vector.y
    && targetPiece.position.z - sourcePiece.position.z === vector.z;
}

function movePlayer(key) {
  if (levelComplete) return;
  const door = doorForPiece(activePieceIndex);
  const targetDoor = DOORS.find((candidate) => candidate !== door);
  const activePiece = activeCubelet();
  if (door && targetDoor && sameCell(player, doorCell(door, activePiece))
    && key === keyForDoorSide(sideForFace(activePiece, door.face)) && doorsTouch(door, targetDoor)) {
    setActivePiece(targetDoor.pieceIndex);
    player = doorCell(targetDoor);
    showToast("Passed through door");
    renderInterior();
    return;
  }
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!delta) return;
  const x = Math.max(0, Math.min(GRID_SIZE - 1, player.x + delta[0]));
  const z = Math.max(0, Math.min(GRID_SIZE - 1, player.z + delta[1]));
  // The player may move below a suspended block. It is blocked only by a
  // block occupying the same logical cell at the target lateral position.
  if (activePieceIndex === 26 && isSolidAt(x, player.y, z)) return;
  const targetFloor = activePieceIndex === 26 ? floorHeightAt(x, z, player.y) : 0;
  // Lateral moves can drop to a lower floor.  A one-cell raised floor cannot
  // be climbed yet, and its occupied cell therefore blocks the player.
  if (targetFloor <= player.y) player = { x, z, y: targetFloor };
  collectBananaIfReached();
  renderInterior();
}

function collectBananaIfReached() {
  if (bananaCollected || activePieceIndex !== 26 || !sameCell(player, bananaCell)) return;
  bananaCollected = true;
  levelComplete = true;
  renderInterior();
  victoryModal.removeAttribute("hidden");
  victoryModal.querySelector("#victoryContinue").focus();
}

document.addEventListener("keydown", (event) => {
  if (littleMode && event.key.startsWith("Arrow")) {
    event.preventDefault();
    movePlayer(event.key);
  }
});

document.querySelectorAll("[data-player-move]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    if (!littleMode) return;
    event.preventDefault();
    movePlayer(button.dataset.playerMove);
  });
});

// Settings Window Toggle and Close Handlers
const settingsToggle = document.querySelector("#settingsToggle");
const settingsModal = document.querySelector("#settingsModal");
const settingsClose = document.querySelector("#settingsClose");
const settingsBackdrop = document.querySelector("#settingsBackdrop");
const victoryModal = document.querySelector("#victoryModal");
const victoryContinue = document.querySelector("#victoryContinue");

if (settingsToggle && settingsModal) {
  settingsToggle.addEventListener("click", () => {
    const isHidden = settingsModal.hasAttribute("hidden");
    if (isHidden) {
      settingsModal.removeAttribute("hidden");
      settingsModal.setAttribute("aria-hidden", "false");
    } else {
      settingsModal.setAttribute("hidden", "");
      settingsModal.setAttribute("aria-hidden", "true");
    }
  });
}

const closeSettings = () => {
  if (settingsModal) {
    settingsModal.setAttribute("hidden", "");
    settingsModal.setAttribute("aria-hidden", "true");
  }
};

if (settingsClose) settingsClose.addEventListener("click", closeSettings);
if (settingsBackdrop) settingsBackdrop.addEventListener("click", closeSettings);
if (victoryContinue) victoryContinue.addEventListener("click", () => window.location.reload());

// Skin Cards Selection Event Handlers
document.querySelectorAll(".skin-card").forEach((card) => {
  card.addEventListener("click", () => {
    const skinName = card.dataset.skin;
    if (currentSkin === skinName) return;

    document.querySelectorAll(".skin-card").forEach((c) => c.classList.remove("active"));
    card.classList.add("active");

    interiorScene.changeSkin(skinName);
  });
});

modeToggle.addEventListener("click", () => {
  if (!littleMode) {
    littleMode = true;
    document.body.classList.add("little-mode");
    littleView.hidden = false;
    modeToggle.textContent = "Big cube";
    modeToggle.setAttribute("aria-pressed", "true");
    renderInterior();
    applyRotation();
    window.setTimeout(() => {
      if (littleMode) littleView.classList.add("is-visible");
    }, 520);
    return;
  }
  littleView.classList.remove("is-visible");
  littleMode = false;
  document.body.classList.remove("little-mode");
  modeToggle.textContent = "Little cube";
  modeToggle.setAttribute("aria-pressed", "false");
  applyRotation();
  window.setTimeout(() => { if (!littleMode) littleView.hidden = true; }, 520);
});

document.querySelector(".scene-shell").addEventListener("pointerdown", (event) => {
  if (littleMode) return;
  event.preventDefault();
  if (activeMove) return;
  event.currentTarget.setPointerCapture(event.pointerId);
  scene.classList.remove("auto");

  const touchedSticker = touchedStickerFromElement(event.target);
  if (touchedSticker) {
    faceDrag = {
      side: touchedSticker.side,
      position: { ...touchedSticker.cubelet.position },
      x: event.clientX,
      y: event.clientY,
      startTime: performance.now(),
      setup: null
    };
    drag = null;
    return;
  }

  drag = {
    x: event.clientX,
    y: event.clientY,
    startX: rotation.x,
    startY: rotation.y
  };
  scene.classList.add("is-dragging");
  faceDrag = null;
});

document.querySelector(".scene-shell").addEventListener("pointermove", (event) => {
  if (faceDrag) {
    const dx = event.clientX - faceDrag.x;
    const dy = event.clientY - faceDrag.y;
    if (!faceDrag.setup && Math.hypot(dx, dy) > 6) {
      const setup = dragSetupForTouch(
        faceDrag.side,
        faceDrag.position,
        Math.abs(dx) >= Math.abs(dy)
      );
      if (setup) {
        faceDrag.setup = {
          ...setup,
          angle: 0,
          targetAngle: null,
          affected: cubelets.filter((cubelet) => cubelet.position[setup.axis] === setup.layer)
        };
      }
    }
    if (faceDrag.setup) {
      const delta = faceDrag.setup.horizontal ? dx : dy;
      const cubeSize = tileStep() * 3;
      const angle = delta / cubeSize * 1.3 * 180 / Math.PI
        * (faceDrag.setup.positiveAngle / 90);
      setSlicePreview(faceDrag.setup, Math.max(-225, Math.min(225, angle)));
    }
    return;
  }

  if (!drag) return;
  rotation = {
    x: Math.max(-80, Math.min(80, drag.startX - (event.clientY - drag.y) * 0.24)),
    y: drag.startY + (event.clientX - drag.x) * 0.3
  };
  applyRotation();
});

function endPointerGesture(event) {
  if (faceDrag?.setup) {
    const preview = faceDrag.setup;
    const elapsed = Math.max(1, performance.now() - faceDrag.startTime);
    const dragDistance = preview.horizontal
      ? event.clientX - faceDrag.x
      : event.clientY - faceDrag.y;
    const speed = Math.abs(dragDistance) / elapsed;
    let targetAngle = Math.round(preview.angle / 90) * 90;

    // Like the reference cube, a quick flick commits in the flick direction
    // even if the slice has not crossed the halfway point yet.
    if (speed > 0.3 && Math.abs(preview.angle) > 4) {
      targetAngle = preview.angle > 0
        ? Math.ceil(preview.angle / 90) * 90
        : Math.floor(preview.angle / 90) * 90;
    }
    targetAngle = Math.max(-180, Math.min(180, targetAngle));
    finishFaceDrag(preview, targetAngle);
  }
  drag = null;
  faceDrag = null;
  scene.classList.remove("is-dragging");
}

document.querySelector(".scene-shell").addEventListener("pointerup", endPointerGesture);
document.querySelector(".scene-shell").addEventListener("pointercancel", endPointerGesture);

window.addEventListener("resize", renderCubelets);
window.addEventListener("resize", applyRotation);

buildCube();
showToast("Drag the cube to turn it");
