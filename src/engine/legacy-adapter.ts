import {
  FACE_AXIS,
  FACE_SIGN,
  levelBounds,
  parseRotationScript,
  pieceColors,
  type Axis,
  type DoorItem,
  type FaceColor,
  type InteriorCell,
  type LevelDefinitionV1,
  type WorldPosition,
} from "./level-engine.ts";

const SHORT: Record<FaceColor, string> = {
  red: "r",
  orange: "o",
  blue: "b",
  green: "g",
  white: "w",
  yellow: "y",
};

const OLD_AXIS: Record<Axis, "x" | "y" | "z"> = { x: "z", y: "x", z: "y" };

function toOldPosition([x, y, z]: WorldPosition) {
  return { x: y, y: z, z: x };
}

function toOldCell([x, y, z]: InteriorCell) {
  return { x: y, y: z, z: x };
}

function coordinateForCell(cell: InteriorCell, door?: DoorItem): Array<string | number> {
  const faceOrder: FaceColor[] = ["green", "yellow", "orange"];
  if (door) {
    const otherFaces = faceOrder.filter((face) => FACE_AXIS[face] !== FACE_AXIS[door.face]);
    faceOrder.splice(0, faceOrder.length, ...otherFaces, door.face);
  }
  return [
    ...faceOrder.map((face) => SHORT[face]),
    ...faceOrder.map((face) => {
      const axisIndex = { x: 0, y: 1, z: 2 }[FACE_AXIS[face]];
      const value = cell[axisIndex]!;
      return FACE_SIGN[face] === -1 ? value : 3 - value;
    }),
  ];
}

export function levelDefinitionToLegacyLevel(level: LevelDefinitionV1) {
  const bounds = levelBounds(level.pieces);
  const parsed = parseRotationScript(level.rotationScript);
  return {
    id: "versioned-level",
    slug: "versioned-level",
    name: level.name,
    definition: level,
    modules: level.pieces.map((piece) => ({
      id: piece.id,
      label: piece.label,
      position: toOldPosition(piece.position),
      logicalPosition: [...piece.position],
      colors: pieceColors(piece.position, bounds),
    })),
    items: level.pieces.flatMap((piece) =>
      piece.items.map((item) => {
        const door = item.kind === "door" ? item : undefined;
        const faces = door
          ? ["green", "yellow", door.face].filter(
              (face, index, all) =>
                all.findIndex((candidate) => FACE_AXIS[candidate as FaceColor] === FACE_AXIS[face as FaceColor]) === index,
            )
          : ["green", "yellow", "orange"];
        return {
          id: item.id,
          moduleId: piece.id,
          kind: item.kind,
          coordinate: coordinateForCell(item.cell, door),
          cell: toOldCell(item.cell),
          faces,
          ...(door
            ? {
                doorFace: door.face,
                doorAxis: OLD_AXIS[FACE_AXIS[door.face]],
              }
            : {}),
        };
      }),
    ),
    rotationRules: parsed.rules.map((rule) => ({
      ...rule,
      sceneAxis: OLD_AXIS[rule.axis],
      scenePivot: toOldPosition(rule.pivot),
      sceneSelector:
        rule.selector.type === "layer"
          ? {
              type: "layer",
              axis: OLD_AXIS[rule.selector.axis],
              coordinate: rule.selector.coordinate,
            }
          : rule.selector,
      angle: rule.quarterTurn * 90,
    })),
  };
}
