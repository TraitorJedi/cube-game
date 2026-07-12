const cube = document.querySelector("#cube");
const scene = document.querySelector("#scene");
const toast = document.querySelector("#toast");
const commandInput = document.querySelector("#commandInput");
const runCommand = document.querySelector("#runCommand");
const disclosure = document.querySelector("#disclosure");
const disclosureClose = document.querySelector("#disclosureClose");
const disclosureReopen = document.querySelector("#disclosureReopen");

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
  F: { axis: "z", layer: 1, angle: 90 },
  B: { axis: "z", layer: -1, angle: -90 },
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
let demoTimer = 0;
let turnQueue = Promise.resolve();
let activeMove = null;
let dragPreview = null;

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

  cubelet.element.className = `cubie ${cubeletType(cubelet.position)}${Object.values(cubelet.stickers).includes("up") ? " has-white" : ""}`;
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

        element.className = `cubie ${cubeletType(position)}${visibleStickers.includes("up") ? " has-white" : ""}`;
        element.dataset.index = String(index);
        element.innerHTML = visibleStickers.map((face) => stickerMarkup(face, index)).join("");
        cube.append(element);

        cubelets.push({
          element,
          position,
          stickers: Object.fromEntries(visibleStickers.map((face) => [face, face])),
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
  return `translate3d(${x * step}px, ${-y * step}px, ${z * step}px)`;
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
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1700);
}

function applyRotation() {
  scene.style.transform = `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`;
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
      preview.affected.forEach((cubelet) => {
        cubelet.position = rotatePosition(cubelet.position, preview.axis, targetAngle);
        cubelet.stickers = rotateStickerSides(cubelet.stickers, preview.axis, targetAngle);
        renderStickers(cubelet);
      });
      history.push(move);
    }
    clearSlicePreview(preview);
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
        cubelet.element.style.transition = "none";
        cubelet.element.classList.remove("is-turning");
        renderStickers(cubelet);
      });
      renderCubelets();
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

function setActive(button, groupSelector, active = true) {
  document.querySelectorAll(groupSelector).forEach((item) => item.classList.remove("is-active"));
  if (active) button.classList.add("is-active");
}

function shuffle() {
  const moves = ["U", "D", "L", "R", "F", "B", "U'", "R'", "F'", "L'"];
  const sequence = Array.from({ length: 16 }, () => moves[Math.floor(Math.random() * moves.length)]);
  commandInput.value = sequence.join(" ");
  runMoves(sequence);
}

function undo() {
  const last = history.pop();
  if (!last) {
    showToast("Nothing to undo yet");
    return;
  }

  const inverse = last.includes("'") ? last.replace("'", "") : `${last}'`;
  animateMove(inverse, false);
}

function realign() {
  rotation = { x: -24, y: -34 };
  applyRotation();
  scene.classList.remove("auto");
  showToast("Realigned");
}

function toggleDemo(button) {
  const running = Boolean(demoTimer);
  clearInterval(demoTimer);
  demoTimer = 0;
  button.classList.toggle("is-active", !running);

  if (running) {
    showToast("Demo paused");
    return;
  }

  const demo = ["R", "U", "R'", "U'", "F", "R", "F'"];
  let index = 0;
  demoTimer = setInterval(() => {
    runMoves([demo[index % demo.length]]);
    index += 1;
  }, 620);
  showToast("Demo running");
}

document.querySelectorAll("[data-style]").forEach((button) => {
  button.addEventListener("click", () => {
    const style = button.dataset.style;
    document.body.classList.toggle("glass", style === "glass");
    setActive(button, "[data-style]");
  });
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const active = !button.classList.contains("is-active");
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("is-active"));
    document.body.removeAttribute("data-filter");

    if (active) {
      button.classList.add("is-active");
      document.body.dataset.filter = button.dataset.filter;
    }
  });
});

document.querySelectorAll("[data-label]").forEach((button) => {
  button.addEventListener("click", () => {
    const label = button.dataset.label;
    const className = `show-${label}`;
    document.body.classList.toggle(className);
    button.classList.toggle("is-active", document.body.classList.contains(className));
  });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "rotate") {
      scene.classList.toggle("auto");
      button.classList.toggle("is-active", scene.classList.contains("auto"));
    }
    if (action === "realign") realign();
    if (action === "shuffle") shuffle();
    if (action === "undo") undo();
    if (action === "demo") toggleDemo(button);
  });
});

document.querySelectorAll("[data-move]").forEach((button) => {
  button.addEventListener("click", () => runMoves([button.dataset.move]));
});

function closeDisclosure() {
  disclosure.classList.remove("is-open");
}

function openDisclosure() {
  disclosure.classList.add("is-open");
  disclosureClose.focus();
}

disclosureClose.addEventListener("click", closeDisclosure);
disclosureReopen.addEventListener("click", openDisclosure);
disclosure.addEventListener("click", (event) => {
  if (event.target === disclosure) closeDisclosure();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDisclosure();
});

runCommand.addEventListener("click", () => runMoves(commandInput.value));
commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") runMoves(commandInput.value);
});

document.querySelector(".scene-shell").addEventListener("pointerdown", (event) => {
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

window.cube = {
  twist(sequence) {
    return runMoves(sequence);
  },
  inspect() {
    return {
      cubelets: cubelets.map(({ index, position }) => ({ index, ...position })),
      moves: history.slice()
    };
  },
  gesture(side, position, dx, dy) {
    return gestureMoveForTouch(side, position, dx, dy);
  },
  realign,
  shuffle
};

window.render_game_to_text = () => JSON.stringify({
  coordinateSystem: "Cube coordinates: +x right, +y up, +z front; face gestures use local horizontal/vertical axes.",
  viewRotation: { ...rotation },
  activeMove,
  dragPreview,
  moves: history.slice(),
  cubelets: cubelets.map(({ index, position, stickers: cubeletStickers }) => ({
    index,
    position: { ...position },
    stickers: { ...cubeletStickers }
  }))
});

// This UI has no simulation loop; expose a no-op step hook for deterministic
// browser tooling without interrupting in-progress CSS turn animations.
window.advanceTime = () => window.render_game_to_text();

buildCube();
showToast("Drag the cube or run a twist");
