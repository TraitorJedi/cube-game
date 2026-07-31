export const INTERIOR_SIZE = 4 as const;

export type Axis = "x" | "y" | "z";
export type FaceColor = "red" | "orange" | "blue" | "green" | "white" | "yellow";
export type WorldPosition = [number, number, number];
export type InteriorCell = [number, number, number];
export type QuarterTurn = -1 | 1;

export const AXES: readonly Axis[] = ["x", "y", "z"];
export const FACE_FRAME = {
  x: { negative: "orange", positive: "red" },
  y: { negative: "green", positive: "blue" },
  z: { negative: "yellow", positive: "white" },
} as const satisfies Record<Axis, { negative: FaceColor; positive: FaceColor }>;

export const FACE_AXIS: Record<FaceColor, Axis> = {
  red: "x",
  orange: "x",
  blue: "y",
  green: "y",
  white: "z",
  yellow: "z",
};

export const FACE_SIGN: Record<FaceColor, -1 | 1> = {
  red: 1,
  orange: -1,
  blue: 1,
  green: -1,
  white: 1,
  yellow: -1,
};

export interface BaseItem {
  id: string;
  cell: InteriorCell;
}

export interface SpawnItem extends BaseItem {
  kind: "spawn";
}

export interface ObstacleItem extends BaseItem {
  kind: "obstacle";
}

export interface GoldenBananaItem extends BaseItem {
  kind: "golden_banana";
}

export interface DoorItem extends BaseItem {
  kind: "door";
  face: FaceColor;
}

export type LevelItem = SpawnItem | ObstacleItem | GoldenBananaItem | DoorItem;

export interface WorldPiece {
  id: string;
  label: string;
  position: WorldPosition;
  items: LevelItem[];
}

export interface LayerSelector {
  type: "layer";
  axis: Axis;
  coordinate: number;
}

export interface PieceSelector {
  type: "pieces";
  pieceIds: string[];
}

export type RotationSelector = LayerSelector | PieceSelector;

export interface RotationGesture {
  grab: Axis;
  drag: Axis;
}

export interface RotationRule {
  id: string;
  selector: RotationSelector;
  pivot: WorldPosition;
  axis: Axis;
  quarterTurn: QuarterTurn;
  triggers: RotationGesture[];
}

export interface LevelDefinitionV1 {
  schemaVersion: 1;
  coordinateFrame: "orange-red_green-blue_yellow-white";
  name: string;
  pieces: WorldPiece[];
  rotationScript: string;
}

export interface Diagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  line?: number;
}

export interface ParsedRotationScript {
  rules: RotationRule[];
  diagnostics: Diagnostic[];
}

export interface RuntimePiece {
  id: string;
  position: WorldPosition;
  /**
   * The three columns map local x/y/z to logical world x/y/z. Values remain
   * signed unit axes because all gameplay rotations are discrete quarter turns.
   */
  orientation: [WorldPosition, WorldPosition, WorldPosition];
}

export interface RuntimeWorld {
  pieces: RuntimePiece[];
}

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
const IDENTITY_ORIENTATION: RuntimePiece["orientation"] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

function isAxis(value: string): value is Axis {
  return value === "x" || value === "y" || value === "z";
}

function parseNumber(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isHalfStep(value: number): boolean {
  return Number.isInteger(value * 2);
}

function cleanDslLine(line: string): string {
  return line.replace(/#.*$/, "").trim();
}

export function formatRotationScript(rules: RotationRule[]): string {
  return rules
    .map((rule) => {
      const selector =
        rule.selector.type === "layer"
          ? `select ${rule.selector.axis} = ${rule.selector.coordinate}`
          : `select pieces (${rule.selector.pieceIds.join(", ")})`;
      const triggers = rule.triggers.map(
        (trigger) => `  trigger grab ${trigger.grab} drag ${trigger.drag}`,
      );
      return [
        `move ${rule.id} {`,
        `  ${selector}`,
        `  pivot (${rule.pivot.join(", ")})`,
        `  rotate ${rule.axis} by ${rule.quarterTurn * 90}`,
        ...triggers,
        "}",
      ].join("\n");
    })
    .join("\n\n");
}

export function parseRotationScript(source: string): ParsedRotationScript {
  const diagnostics: Diagnostic[] = [];
  const rules: RotationRule[] = [];
  const lines = source.split(/\r?\n/);
  let current:
    | {
        id: string;
        line: number;
        selector?: RotationSelector;
        pivot?: WorldPosition;
        axis?: Axis;
        quarterTurn?: QuarterTurn;
        triggers: RotationGesture[];
      }
    | undefined;

  const fail = (line: number, code: string, message: string) =>
    diagnostics.push({ severity: "error", code, message, line });

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = cleanDslLine(lines[index] ?? "");
    if (!line) continue;

    const start = line.match(/^move\s+([a-zA-Z][\w-]*)\s*\{$/);
    if (start) {
      if (current) fail(lineNumber, "nested_move", "Close the current move before starting another.");
      current = { id: start[1]!, line: lineNumber, triggers: [] };
      continue;
    }

    if (line === "}") {
      if (!current) {
        fail(lineNumber, "unexpected_close", "This closing brace has no matching move.");
        continue;
      }
      if (!current.selector) fail(current.line, "missing_selector", `Move ${current.id} needs a selector.`);
      if (!current.pivot) fail(current.line, "missing_pivot", `Move ${current.id} needs a pivot.`);
      if (!current.axis || !current.quarterTurn) {
        fail(current.line, "missing_rotation", `Move ${current.id} needs a ±90 degree rotation.`);
      }
      if (current.triggers.length === 0) {
        fail(current.line, "missing_trigger", `Move ${current.id} needs at least one grab/drag trigger.`);
      }
      if (current.selector && current.pivot && current.axis && current.quarterTurn) {
        rules.push({
          id: current.id,
          selector: current.selector,
          pivot: current.pivot,
          axis: current.axis,
          quarterTurn: current.quarterTurn,
          triggers: current.triggers,
        });
      }
      current = undefined;
      continue;
    }

    if (!current) {
      fail(lineNumber, "outside_move", "Rotation statements must be inside a move block.");
      continue;
    }

    const layer = line.match(/^select\s+([xyz])\s*=\s*(-?\d+(?:\.5)?)$/);
    if (layer && isAxis(layer[1]!)) {
      const coordinate = parseNumber(layer[2]!);
      if (coordinate === null || !Number.isInteger(coordinate)) {
        fail(lineNumber, "invalid_layer", "Layer coordinates must be integers.");
      } else {
        current.selector = { type: "layer", axis: layer[1], coordinate };
      }
      continue;
    }

    const pieces = line.match(/^select\s+pieces\s*\(([^)]*)\)$/);
    if (pieces) {
      const pieceIds = pieces[1]!
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (pieceIds.length === 0) fail(lineNumber, "empty_piece_set", "Select at least one piece.");
      else current.selector = { type: "pieces", pieceIds };
      continue;
    }

    const pivot = line.match(
      /^pivot\s*\(\s*(-?\d+(?:\.5)?)\s*,\s*(-?\d+(?:\.5)?)\s*,\s*(-?\d+(?:\.5)?)\s*\)$/,
    );
    if (pivot) {
      const values = pivot.slice(1).map(Number);
      if (!values.every(isHalfStep)) {
        fail(lineNumber, "invalid_pivot", "Pivot coordinates must use integer or half-integer values.");
      } else {
        current.pivot = values as WorldPosition;
      }
      continue;
    }

    const rotate = line.match(/^rotate\s+([xyz])\s+by\s+(-?90)$/);
    if (rotate && isAxis(rotate[1]!)) {
      current.axis = rotate[1];
      current.quarterTurn = Number(rotate[2]) === 90 ? 1 : -1;
      continue;
    }

    const trigger = line.match(/^trigger\s+grab\s+([xyz])\s+drag\s+([xyz])$/);
    if (trigger && isAxis(trigger[1]!) && isAxis(trigger[2]!)) {
      if (trigger[1] === trigger[2]) {
        fail(lineNumber, "invalid_trigger", "Grab and drag axes must differ.");
      } else {
        current.triggers.push({ grab: trigger[1], drag: trigger[2] });
      }
      continue;
    }

    fail(lineNumber, "unknown_statement", `Unknown rotation statement: ${line}`);
  }

  if (current) fail(current.line, "unclosed_move", `Move ${current.id} is missing its closing brace.`);
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) {
      diagnostics.push({
        severity: "error",
        code: "duplicate_move",
        message: `Move ID ${rule.id} is duplicated.`,
      });
    }
    ids.add(rule.id);
  }
  return { rules, diagnostics };
}

export function pieceMatchesSelector(piece: RuntimePiece, selector: RotationSelector): boolean {
  if (selector.type === "pieces") return selector.pieceIds.includes(piece.id);
  return piece.position[AXIS_INDEX[selector.axis]] === selector.coordinate;
}

export function rotateVector(
  vector: WorldPosition,
  axis: Axis,
  quarterTurn: QuarterTurn,
): WorldPosition {
  const [x, y, z] = vector;
  if (axis === "x") return quarterTurn === 1 ? [x, -z, y] : [x, z, -y];
  if (axis === "y") return quarterTurn === 1 ? [z, y, -x] : [-z, y, x];
  return quarterTurn === 1 ? [-y, x, z] : [y, -x, z];
}

function add(a: WorldPosition, b: WorldPosition): WorldPosition {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subtract(a: WorldPosition, b: WorldPosition): WorldPosition {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function roundedPosition(position: WorldPosition): WorldPosition {
  return position.map((value) => Math.round(value * 1e9) / 1e9) as WorldPosition;
}

export function createRuntimeWorld(level: LevelDefinitionV1): RuntimeWorld {
  return {
    pieces: level.pieces.map((piece) => ({
      id: piece.id,
      position: [...piece.position],
      orientation: IDENTITY_ORIENTATION.map((axis) => [...axis]) as RuntimePiece["orientation"],
    })),
  };
}

export function applyRotationRule(
  world: RuntimeWorld,
  rule: RotationRule,
  direction: QuarterTurn = 1,
): RuntimeWorld {
  const turn = (rule.quarterTurn * direction) as QuarterTurn;
  const pieces = world.pieces.map((piece) => {
    if (!pieceMatchesSelector(piece, rule.selector)) return piece;
    const offset = subtract(piece.position, rule.pivot);
    return {
      ...piece,
      position: roundedPosition(add(rule.pivot, rotateVector(offset, rule.axis, turn))),
      orientation: piece.orientation.map((basis) =>
        rotateVector(basis, rule.axis, turn),
      ) as RuntimePiece["orientation"],
    };
  });
  return { pieces };
}

export function matchRotationGesture(
  rules: RotationRule[],
  piece: RuntimePiece,
  grab: Axis,
  drag: Axis,
): RotationRule | undefined {
  return rules.find(
    (rule) =>
      pieceMatchesSelector(piece, rule.selector) &&
      rule.triggers.some((trigger) => trigger.grab === grab && trigger.drag === drag),
  );
}

export function localVectorToWorld(
  orientation: RuntimePiece["orientation"],
  vector: WorldPosition,
): WorldPosition {
  return [
    orientation[0][0] * vector[0] +
      orientation[1][0] * vector[1] +
      orientation[2][0] * vector[2],
    orientation[0][1] * vector[0] +
      orientation[1][1] * vector[1] +
      orientation[2][1] * vector[2],
    orientation[0][2] * vector[0] +
      orientation[1][2] * vector[1] +
      orientation[2][2] * vector[2],
  ];
}

export function faceNormal(face: FaceColor): WorldPosition {
  const vector: WorldPosition = [0, 0, 0];
  vector[AXIS_INDEX[FACE_AXIS[face]]] = FACE_SIGN[face];
  return vector;
}

function doorApertureCenter(
  piece: RuntimePiece,
  door: DoorItem,
): { center: WorldPosition; normal: WorldPosition } {
  const local = door.cell.map((value) => (value + 0.5) / INTERIOR_SIZE - 0.5) as WorldPosition;
  const axisIndex = AXIS_INDEX[FACE_AXIS[door.face]];
  local[axisIndex] = FACE_SIGN[door.face] * 0.5;
  const normal = localVectorToWorld(piece.orientation, faceNormal(door.face));
  return {
    center: add(piece.position, localVectorToWorld(piece.orientation, local)),
    normal,
  };
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-8;
}

export function doorsAlign(
  sourcePiece: RuntimePiece,
  sourceDoor: DoorItem,
  targetPiece: RuntimePiece,
  targetDoor: DoorItem,
): boolean {
  const source = doorApertureCenter(sourcePiece, sourceDoor);
  const target = doorApertureCenter(targetPiece, targetDoor);
  const neighbor = subtract(targetPiece.position, sourcePiece.position);
  return (
    source.normal.every((value, index) => value === -target.normal[index]!) &&
    neighbor.every((value, index) => value === source.normal[index]) &&
    source.center.every((value, index) => near(value, target.center[index]!))
  );
}

export function alignedDoorPairs(
  level: LevelDefinitionV1,
  world: RuntimeWorld = createRuntimeWorld(level),
): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let sourceIndex = 0; sourceIndex < level.pieces.length; sourceIndex += 1) {
    const sourceDefinition = level.pieces[sourceIndex]!;
    const sourceRuntime = world.pieces.find((piece) => piece.id === sourceDefinition.id);
    if (!sourceRuntime) continue;
    for (const sourceDoor of sourceDefinition.items.filter(
      (item): item is DoorItem => item.kind === "door",
    )) {
      for (let targetIndex = sourceIndex + 1; targetIndex < level.pieces.length; targetIndex += 1) {
        const targetDefinition = level.pieces[targetIndex]!;
        const targetRuntime = world.pieces.find((piece) => piece.id === targetDefinition.id);
        if (!targetRuntime) continue;
        for (const targetDoor of targetDefinition.items.filter(
          (item): item is DoorItem => item.kind === "door",
        )) {
          if (doorsAlign(sourceRuntime, sourceDoor, targetRuntime, targetDoor)) {
            pairs.push([sourceDoor.id, targetDoor.id]);
          }
        }
      }
    }
  }
  return pairs;
}

export function legacyCoordinateToCell(coordinate: Array<string | number>): InteriorCell {
  if (coordinate.length !== 6) throw new Error("Legacy coordinates require six values.");
  const faces = coordinate.slice(0, 3).map((face) => String(face).toLowerCase());
  const distances = coordinate.slice(3).map(Number);
  const shortFaces: Record<string, FaceColor> = {
    r: "red",
    o: "orange",
    b: "blue",
    g: "green",
    w: "white",
    y: "yellow",
  };
  const cell: InteriorCell = [0, 0, 0];
  const assigned = new Set<Axis>();
  for (let index = 0; index < 3; index += 1) {
    const face = shortFaces[faces[index]!] ?? (faces[index] as FaceColor);
    const axis = FACE_AXIS[face];
    const distance = distances[index]!;
    if (!axis || assigned.has(axis) || !Number.isInteger(distance) || distance < 0 || distance > 3) {
      throw new Error("Legacy coordinates need one valid color and distance for every axis.");
    }
    assigned.add(axis);
    cell[AXIS_INDEX[axis]] = FACE_SIGN[face] === -1 ? distance : 3 - distance;
  }
  if (assigned.size !== 3) throw new Error("Legacy coordinates must cover all three axes.");
  return cell;
}

function positionKey(position: WorldPosition): string {
  return position.join(",");
}

function isValidCell(cell: InteriorCell): boolean {
  return cell.every((value) => Number.isInteger(value) && value >= 0 && value < INTERIOR_SIZE);
}

export function validateLevel(level: LevelDefinitionV1): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const parsed = parseRotationScript(level.rotationScript);
  diagnostics.push(...parsed.diagnostics);

  if (level.schemaVersion !== 1) {
    diagnostics.push({ severity: "error", code: "schema_version", message: "Unsupported level schema." });
  }
  if (!level.name.trim()) {
    diagnostics.push({ severity: "error", code: "level_name", message: "Give the level a name." });
  }
  if (level.pieces.length === 0) {
    diagnostics.push({ severity: "error", code: "no_pieces", message: "Add at least one World Piece." });
  }

  const ids = new Set<string>();
  const positions = new Set<string>();
  const itemIds = new Set<string>();
  let spawnCount = 0;
  let bananaCount = 0;
  for (const [pieceIndex, piece] of level.pieces.entries()) {
    const path = `pieces.${pieceIndex}`;
    if (ids.has(piece.id)) {
      diagnostics.push({ severity: "error", code: "duplicate_piece_id", message: `Piece ID ${piece.id} is duplicated.`, path });
    }
    ids.add(piece.id);
    if (!piece.position.every(Number.isInteger)) {
      diagnostics.push({ severity: "error", code: "piece_position", message: "World Piece coordinates must be integers.", path });
    }
    const key = positionKey(piece.position);
    if (positions.has(key)) {
      diagnostics.push({ severity: "error", code: "duplicate_position", message: `More than one piece occupies (${key}).`, path });
    }
    positions.add(key);
    const occupied = new Set<string>();
    const doors = new Set<string>();
    for (const [itemIndex, item] of piece.items.entries()) {
      const itemPath = `${path}.items.${itemIndex}`;
      if (itemIds.has(item.id)) {
        diagnostics.push({ severity: "error", code: "duplicate_item_id", message: `Item ID ${item.id} is duplicated.`, path: itemPath });
      }
      itemIds.add(item.id);
      if (!isValidCell(item.cell)) {
        diagnostics.push({ severity: "error", code: "item_cell", message: "Interior coordinates must be whole numbers from 0 through 3.", path: itemPath });
      }
      if (item.kind === "spawn") spawnCount += 1;
      if (item.kind === "golden_banana") bananaCount += 1;
      if (item.kind !== "door") {
        const cellKey = item.cell.join(",");
        if (occupied.has(cellKey)) {
          diagnostics.push({ severity: "error", code: "occupied_cell", message: `Two solid items occupy [${cellKey}].`, path: itemPath });
        }
        occupied.add(cellKey);
      } else {
        const boundary = FACE_SIGN[item.face] === -1 ? 0 : INTERIOR_SIZE - 1;
        if (item.cell[AXIS_INDEX[FACE_AXIS[item.face]]] !== boundary) {
          diagnostics.push({ severity: "error", code: "door_boundary", message: `${item.face} doors must sit on that face's boundary.`, path: itemPath });
        }
        const doorKey = `${item.face}:${item.cell.join(",")}`;
        if (doors.has(doorKey)) {
          diagnostics.push({ severity: "error", code: "duplicate_door", message: "This face and cell already has a door.", path: itemPath });
        }
        doors.add(doorKey);
      }
    }
  }

  if (spawnCount !== 1) {
    diagnostics.push({ severity: "error", code: "spawn_count", message: "A publishable level requires exactly one Spawn." });
  }
  if (bananaCount === 0) {
    diagnostics.push({ severity: "error", code: "banana_count", message: "A publishable level requires at least one Golden Banana." });
  }

  const runtime = createRuntimeWorld(level);
  for (const rule of parsed.rules) {
    if (rule.selector.type === "pieces") {
      for (const pieceId of rule.selector.pieceIds) {
        if (!ids.has(pieceId)) {
          diagnostics.push({ severity: "error", code: "unknown_rule_piece", message: `Move ${rule.id} selects unknown piece ${pieceId}.` });
        }
      }
    }
    if (!rule.pivot.every(isHalfStep)) {
      diagnostics.push({ severity: "error", code: "rule_pivot", message: `Move ${rule.id} has an invalid pivot.` });
    }
    const selected = runtime.pieces.filter((piece) => pieceMatchesSelector(piece, rule.selector));
    if (selected.length === 0) {
      diagnostics.push({ severity: "error", code: "empty_rule", message: `Move ${rule.id} selects no pieces.` });
      continue;
    }
    const turned = applyRotationRule(runtime, rule);
    const turnedPositions = new Set<string>();
    for (const piece of turned.pieces) {
      if (!piece.position.every(Number.isInteger)) {
        diagnostics.push({ severity: "error", code: "off_grid_rotation", message: `Move ${rule.id} sends ${piece.id} off the integer grid.` });
      }
      const key = positionKey(piece.position);
      if (turnedPositions.has(key)) {
        diagnostics.push({ severity: "error", code: "rotation_collision", message: `Move ${rule.id} causes pieces to collide at (${key}).` });
      }
      turnedPositions.add(key);
    }
  }

  const pairedDoorIds = new Set(alignedDoorPairs(level).flat());
  for (const piece of level.pieces) {
    for (const item of piece.items) {
      if (item.kind === "door" && !pairedDoorIds.has(item.id)) {
        diagnostics.push({
          severity: "error",
          code: "unmatched_door",
          message: `Door ${item.id} has no aligned door on the touching neighbor.`,
        });
      }
    }
  }
  return diagnostics;
}

export function hasValidationErrors(level: LevelDefinitionV1): boolean {
  return validateLevel(level).some((diagnostic) => diagnostic.severity === "error");
}

export function worldToScene([x, y, z]: WorldPosition): WorldPosition {
  return [y, z, x];
}

const COLOR_SHORT: Record<FaceColor, string> = {
  red: "r",
  orange: "o",
  blue: "b",
  green: "g",
  white: "w",
  yellow: "y",
};

export function pieceColors(
  position: WorldPosition,
  bounds: { min: WorldPosition; max: WorldPosition },
): FaceColor[] {
  const colors: FaceColor[] = [];
  if (position[0] === bounds.max[0]) colors.push("red");
  else if (position[0] === bounds.min[0]) colors.push("orange");
  if (position[2] === bounds.max[2]) colors.push("white");
  else if (position[2] === bounds.min[2]) colors.push("yellow");
  if (position[1] === bounds.max[1]) colors.push("blue");
  else if (position[1] === bounds.min[1]) colors.push("green");
  return colors;
}

export function levelBounds(pieces: WorldPiece[]): { min: WorldPosition; max: WorldPosition } {
  if (pieces.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  return {
    min: AXES.map((_, index) => Math.min(...pieces.map((piece) => piece.position[index]!))) as WorldPosition,
    max: AXES.map((_, index) => Math.max(...pieces.map((piece) => piece.position[index]!))) as WorldPosition,
  };
}

export function createPiece(position: WorldPosition, existing: WorldPiece[] = []): WorldPiece {
  const temporary = [...existing, { id: "", label: "", position, items: [] }];
  const colors = pieceColors(position, levelBounds(temporary));
  const idBase = colors.length ? colors.map((color) => COLOR_SHORT[color]).join("/") : "core";
  let id = idBase;
  let suffix = 2;
  while (existing.some((piece) => piece.id === id)) id = `${idBase}-${suffix++}`;
  return {
    id,
    label: colors.length ? colors.map((color) => color[0]!.toUpperCase() + color.slice(1)).join(" / ") : `Piece ${position.join(",")}`,
    position: [...position],
    items: [],
  };
}

