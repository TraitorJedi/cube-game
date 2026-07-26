"use client";

import React, { type DragEvent, useEffect, useMemo, useState } from "react";
import {
  AXES,
  FACE_AXIS,
  FACE_SIGN,
  alignedDoorPairs,
  applyRotationRule,
  createRuntimeWorld,
  formatRotationScript,
  parseRotationScript,
  validateLevel,
  type Axis,
  type FaceColor,
  type LevelDefinitionV1,
  type LevelItem,
  type RotationRule,
  type WorldPiece,
  type WorldPosition,
} from "../../engine/level-engine";
import GameApp from "../GameApp";
import {
  createLevel,
  listLevels,
  listLevelVersions,
  saveLevelVersion,
  signOut,
  updateLevelMetadata,
  type LevelSummary,
  type LevelVersion,
} from "../level-repository";

type WorkspaceView = "world" | "interior" | "rotations" | "history";
type ItemKind = LevelItem["kind"];
const PlaytestGame = GameApp as React.ComponentType<{
  editorMode?: boolean;
  levelDefinition?: LevelDefinitionV1;
}>;

const FACE_OPTIONS: FaceColor[] = ["red", "orange", "blue", "green", "white", "yellow"];
const ITEM_OPTIONS: Array<{ kind: ItemKind; label: string; glyph: string }> = [
  { kind: "spawn", label: "Spawn", glyph: "A" },
  { kind: "obstacle", label: "Obstacle", glyph: "■" },
  { kind: "golden_banana", label: "Golden Banana", glyph: "◆" },
  { kind: "door", label: "Door", glyph: "↔" },
];

function emptyLevel(name: string): LevelDefinitionV1 {
  return {
    schemaVersion: 1,
    coordinateFrame: "orange-red_green-blue_yellow-white",
    name,
    pieces: [],
    rotationScript: "",
  };
}

function cloneLevel(level: LevelDefinitionV1): LevelDefinitionV1 {
  return structuredClone(level);
}

function parsePosition(value: string | null): WorldPosition | null {
  if (value === null) return null;
  const values = value.split(",").map((part) => Number(part.trim()));
  return values.length === 3 && values.every(Number.isInteger)
    ? (values as WorldPosition)
    : null;
}

function pieceAt(level: LevelDefinitionV1, position: WorldPosition): WorldPiece | undefined {
  return level.pieces.find((piece) => piece.position.every((value, index) => value === position[index]));
}

function newPiece(position: WorldPosition): WorldPiece {
  return {
    id: `piece-${crypto.randomUUID()}`,
    label: `Piece (${position.join(", ")})`,
    position,
    items: [],
  };
}

function itemGlyph(kind: ItemKind): string {
  return ITEM_OPTIONS.find((item) => item.kind === kind)?.glyph ?? "•";
}

function WorldCanvas({
  level,
  selectedPieceId,
  previewRule,
  onSelect,
  onMoveDrop,
}: {
  level: LevelDefinitionV1;
  selectedPieceId?: string;
  previewRule?: RotationRule;
  onSelect: (pieceId: string) => void;
  onMoveDrop: (pieceId: string) => void;
}) {
  const runtime = useMemo(() => {
    const world = createRuntimeWorld(level);
    return previewRule ? applyRotationRule(world, previewRule) : world;
  }, [level, previewRule]);
  const positions = new Map(runtime.pieces.map((piece) => [piece.id, piece.position]));

  return (
    <div
      className="engine-world-canvas"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const pieceId = event.dataTransfer.getData("application/x-world-piece");
        if (pieceId) onMoveDrop(pieceId);
      }}
      role="group"
      aria-label="World Piece canvas"
    >
      <div className="engine-axis engine-axis-x">X · O → R</div>
      <div className="engine-axis engine-axis-y">Y · G → B</div>
      <div className="engine-axis engine-axis-z">Z · Y → W</div>
      {level.pieces.map((piece) => {
        const position = positions.get(piece.id) ?? piece.position;
        // Swap X and Y only in the editor projection; logical world data stays x,y,z.
        const left = 50 + (position[1] - position[0]) * 8;
        const top = 48 + (position[0] + position[1]) * 4 - position[2] * 10;
        return (
          <button
            aria-label={`${piece.label} at ${position.join(", ")}`}
            className={`engine-world-piece ${piece.id === selectedPieceId ? "is-selected" : ""} ${previewRule ? "is-previewing" : ""}`}
            draggable
            key={piece.id}
            onClick={() => onSelect(piece.id)}
            onDragStart={(event) => {
              event.dataTransfer.setData("application/x-world-piece", piece.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            style={{ left: `${left}%`, top: `${top}%` }}
            type="button"
          >
            <span>{piece.label}</span>
            <code>{position.join(",")}</code>
          </button>
        );
      })}
      {level.pieces.length === 0 && (
        <div className="engine-empty-canvas">
          <strong>No World Pieces</strong>
          <span>Add one by exact position or generate a matrix.</span>
        </div>
      )}
    </div>
  );
}

function InteriorCanvas({
  piece,
  activeFloor,
  paletteKind,
  onPlace,
  onDrop,
}: {
  piece?: WorldPiece;
  activeFloor: number;
  paletteKind: ItemKind;
  onPlace: (kind: ItemKind, x: number, y: number, z: number) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>, x: number, y: number, z: number) => void;
}) {
  return (
    <div className="engine-interior-stage" aria-label={`Isometric interior, active floor ${activeFloor}`}>
      <div className="engine-interior-wall engine-interior-wall--x" aria-hidden="true"><span>X / Red</span></div>
      <div className="engine-interior-wall engine-interior-wall--y" aria-hidden="true"><span>Y / Blue</span></div>
      {[0, 1, 2, 3].map((z) => (
        <div
          aria-hidden={z === activeFloor ? undefined : true}
          aria-label={z === activeFloor ? `Active floor z equals ${z}` : undefined}
          className={`engine-isometric-floor ${z === activeFloor ? "is-active" : "is-inactive"}`}
          key={z}
          role={z === activeFloor ? "grid" : undefined}
          style={{ zIndex: z === activeFloor ? 20 : 4 + z }}
        >
          <span className="engine-floor-marker" style={{ top: `${69 - z * 11}%` }}>
            {z === activeFloor ? "ACTIVE" : "FLOOR"} · Z {z}
          </span>
          {Array.from({ length: 16 }, (_, index) => {
            const x = index % 4;
            const y = Math.floor(index / 4);
            const items = piece?.items.filter((item) => item.cell[0] === x && item.cell[1] === y && item.cell[2] === z) ?? [];
            return (
              <button
                aria-label={`Place ${paletteKind.replace("_", " ")} at ${x}, ${y}, ${z}`}
                className={items.length ? "has-items" : ""}
                disabled={z !== activeFloor || !piece}
                key={`${x}-${y}-${z}`}
                onClick={() => onPlace(paletteKind, x, y, z)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(event, x, y, z)}
                role="gridcell"
                style={{
                  left: `${50 + (y - x) * 10}%`,
                  top: `${54 + (x + y) * 5 - z * 11}%`,
                }}
                type="button"
              >
                <span className="engine-cell-items" aria-hidden="true">
                  {items.map((item) => (
                    <span className={`is-${item.kind}`} key={item.id}>{itemGlyph(item.kind)}</span>
                  ))}
                </span>
                <code>{x},{y},{z}</code>
              </button>
            );
          })}
        </div>
      ))}
      <div className="engine-interior-axis-key" aria-hidden="true">
        <span>X</span><i /> <span>Y</span><i /> <span>Z</span><i />
      </div>
      {!piece && (
        <div className="engine-interior-empty">
          <strong>Select a World Piece</strong>
          <span>Its 4 × 4 × 4 chamber will appear here.</span>
        </div>
      )}
    </div>
  );
}

function Diagnostics({ level }: { level: LevelDefinitionV1 }) {
  const diagnostics = useMemo(() => validateLevel(level), [level]);
  if (diagnostics.length === 0) return <p className="engine-valid">Ready to publish</p>;
  return (
    <div className="engine-diagnostics" aria-label="Level diagnostics">
      {diagnostics.slice(0, 8).map((diagnostic, index) => (
        <p className={`is-${diagnostic.severity}`} key={`${diagnostic.code}-${index}`}>
          <span>{diagnostic.severity === "error" ? "Error" : "Warning"}</span>
          {diagnostic.message}
        </p>
      ))}
      {diagnostics.length > 8 && <p>+ {diagnostics.length - 8} more diagnostics</p>}
    </div>
  );
}

export default function LevelEditorApp({
  email,
  role,
  onSignedOut,
}: {
  email: string;
  role: "admin" | "creator";
  onSignedOut: () => void;
}) {
  const [levels, setLevels] = useState<LevelSummary[]>([]);
  const [levelId, setLevelId] = useState<string>();
  const [versions, setVersions] = useState<LevelVersion[]>([]);
  const [draft, setDraft] = useState<LevelDefinitionV1>();
  const [selectedPieceId, setSelectedPieceId] = useState<string>();
  const [view, setView] = useState<WorkspaceView>("world");
  const [floor, setFloor] = useState(0);
  const [paletteKind, setPaletteKind] = useState<ItemKind>("obstacle");
  const [doorFace, setDoorFace] = useState<FaceColor>("orange");
  const [status, setStatus] = useState("Loading levels…");
  const [busy, setBusy] = useState(false);
  const [playtesting, setPlaytesting] = useState(false);
  const [previewRuleId, setPreviewRuleId] = useState<string>();
  const [ruleId, setRuleId] = useState("new-move");
  const [ruleAxis, setRuleAxis] = useState<Axis>("x");
  const [ruleLayer, setRuleLayer] = useState(1);
  const [pivot, setPivot] = useState<WorldPosition>([1, 0, 0]);
  const [turn, setTurn] = useState<-1 | 1>(-1);

  const refreshLevels = async (preferId?: string) => {
    const next = await listLevels();
    setLevels(next);
    const nextId = preferId ?? levelId ?? next[0]?.id;
    if (nextId) await openLevel(nextId);
    else {
      setLevelId(undefined);
      setDraft(undefined);
      setVersions([]);
      setStatus("Create your first level.");
    }
  };

  const openLevel = async (nextLevelId: string) => {
    setBusy(true);
    setStatus("Loading version history…");
    try {
      const nextVersions = await listLevelVersions(nextLevelId);
      const summary = levels.find((level) => level.id === nextLevelId);
      setLevelId(nextLevelId);
      setVersions(nextVersions);
      setDraft(nextVersions[0]?.definition ? cloneLevel(nextVersions[0].definition) : emptyLevel(summary?.name ?? "Untitled level"));
      setSelectedPieceId(nextVersions[0]?.definition.pieces[0]?.id);
      setStatus(nextVersions.length ? `Revision ${nextVersions[0]!.revision} loaded.` : "Unsaved level created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load this level.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    listLevels()
      .then(async (next) => {
        setLevels(next);
        if (next[0]) {
          const nextVersions = await listLevelVersions(next[0].id);
          setLevelId(next[0].id);
          setVersions(nextVersions);
          setDraft(nextVersions[0]?.definition ? cloneLevel(nextVersions[0].definition) : emptyLevel(next[0].name));
          setSelectedPieceId(nextVersions[0]?.definition.pieces[0]?.id);
          setStatus(nextVersions.length ? `Revision ${nextVersions[0]!.revision} loaded.` : "Unsaved level created.");
        } else {
          setStatus("Create your first level.");
        }
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load levels."));
  }, []);

  const selectedPiece = draft?.pieces.find((piece) => piece.id === selectedPieceId);
  const parsedRules = useMemo(
    () => parseRotationScript(draft?.rotationScript ?? ""),
    [draft?.rotationScript],
  );
  const previewRule = parsedRules.rules.find((rule) => rule.id === previewRuleId);
  const pairedDoorIds = useMemo(
    () => new Set(draft ? alignedDoorPairs(draft).flat() : []),
    [draft],
  );

  const updateDraft = (updater: (level: LevelDefinitionV1) => LevelDefinitionV1) => {
    setDraft((current) => (current ? updater(current) : current));
    setStatus("Unsaved changes");
  };

  const createNewLevel = async () => {
    const name = window.prompt("Level name", "Untitled level")?.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await createLevel(name);
      setLevels((current) => [created, ...current]);
      setLevelId(created.id);
      setVersions([]);
      setDraft(emptyLevel(name));
      setSelectedPieceId(undefined);
      setStatus("New unsaved level.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create the level.");
    } finally {
      setBusy(false);
    }
  };

  const duplicateLevel = async () => {
    if (!draft) return;
    const name = window.prompt("Duplicate level as", `${draft.name} copy`)?.trim();
    if (!name) return;
    setBusy(true);
    try {
      const created = await createLevel(name);
      const duplicate = cloneLevel({ ...draft, name });
      const version = await saveLevelVersion(created.id, duplicate, `Duplicated from ${draft.name}`);
      setLevels((current) => [created, ...current]);
      setLevelId(created.id);
      setVersions([version]);
      setDraft(duplicate);
      setStatus(`Revision ${version.revision} saved.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to duplicate this level.");
    } finally {
      setBusy(false);
    }
  };

  const archiveCurrent = async () => {
    if (!levelId || !window.confirm("Archive this level? Its versions will be preserved.")) return;
    setBusy(true);
    try {
      await updateLevelMetadata(levelId, { archivedAt: new Date().toISOString() });
      setLevelId(undefined);
      setDraft(undefined);
      setVersions([]);
      await refreshLevels();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to archive this level.");
    } finally {
      setBusy(false);
    }
  };

  const saveVersion = async () => {
    if (!draft || !levelId) return;
    const note = window.prompt("Version note (optional)", "") ?? "";
    setBusy(true);
    try {
      await updateLevelMetadata(levelId, { name: draft.name });
      const version = await saveLevelVersion(levelId, draft, note);
      setVersions((current) => [version, ...current]);
      setStatus(`Revision ${version.revision} saved with ${version.diagnostics.length} diagnostic${version.diagnostics.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save this version.");
    } finally {
      setBusy(false);
    }
  };

  const addPiece = () => {
    if (!draft) return;
    const position = parsePosition(window.prompt("World position as x,y,z", "0,0,0"));
    if (!position) {
      setStatus("World Piece positions need three integer coordinates.");
      return;
    }
    if (pieceAt(draft, position)) {
      setStatus(`A World Piece already occupies (${position.join(", ")}).`);
      return;
    }
    const piece = newPiece(position);
    updateDraft((level) => ({ ...level, pieces: [...level.pieces, piece] }));
    setSelectedPieceId(piece.id);
  };

  const movePiece = (pieceId: string) => {
    if (!draft) return;
    const piece = draft.pieces.find((candidate) => candidate.id === pieceId);
    const position = parsePosition(
      window.prompt("Move World Piece to x,y,z", piece?.position.join(",") ?? "0,0,0"),
    );
    if (!position) return;
    const occupied = pieceAt(draft, position);
    if (occupied && occupied.id !== pieceId) {
      setStatus(`A World Piece already occupies (${position.join(", ")}).`);
      return;
    }
    updateDraft((level) => ({
      ...level,
      pieces: level.pieces.map((candidate) =>
        candidate.id === pieceId ? { ...candidate, position } : candidate,
      ),
    }));
  };

  const generateMatrix = () => {
    if (!draft) return;
    const xValues = window.prompt("X coordinates, comma separated", "-1,0,1");
    const yValues = window.prompt("Y coordinates, comma separated", "-1,0,1");
    const zValues = window.prompt("Z coordinates, comma separated", "-1,0,1");
    if (xValues === null || yValues === null || zValues === null) return;
    const axes = [xValues, yValues, zValues].map((value) =>
      value.split(",").map((coordinate) => Number(coordinate.trim())),
    );
    if (axes.some((values) => values.length === 0 || values.some((value) => !Number.isInteger(value)))) {
      setStatus("Matrix coordinates must be comma-separated integers.");
      return;
    }
    const additions: WorldPiece[] = [];
    for (const x of axes[0]!) {
      for (const y of axes[1]!) {
        for (const z of axes[2]!) {
          const position: WorldPosition = [x, y, z];
          if (!pieceAt(draft, position) && !pieceAt({ ...draft, pieces: additions }, position)) {
            additions.push(newPiece(position));
          }
        }
      }
    }
    updateDraft((level) => ({ ...level, pieces: [...level.pieces, ...additions] }));
    setSelectedPieceId(additions[0]?.id ?? selectedPieceId);
  };

  const removeSelectedPiece = () => {
    if (!draft || !selectedPiece) return;
    if (!window.confirm(`Remove ${selectedPiece.label} and its ${selectedPiece.items.length} items?`)) return;
    updateDraft((level) => ({
      ...level,
      pieces: level.pieces.filter((piece) => piece.id !== selectedPiece.id),
    }));
    setSelectedPieceId(draft.pieces.find((piece) => piece.id !== selectedPiece.id)?.id);
  };

  const placeItem = (kind: ItemKind, x: number, y: number, z = floor) => {
    if (!selectedPiece) {
      setStatus("Select a World Piece before placing interior items.");
      return;
    }
    let cell: [number, number, number] = [x, y, z];
    if (kind === "door") {
      const axisIndex = { x: 0, y: 1, z: 2 }[FACE_AXIS[doorFace]];
      cell = [...cell] as [number, number, number];
      cell[axisIndex] = FACE_SIGN[doorFace] === -1 ? 0 : 3;
    }
    const item: LevelItem =
      kind === "door"
        ? { id: `door-${crypto.randomUUID()}`, kind, cell, face: doorFace }
        : { id: `${kind}-${crypto.randomUUID()}`, kind, cell };
    updateDraft((level) => ({
      ...level,
      pieces: level.pieces.map((piece) => {
        if (piece.id !== selectedPiece.id) return piece;
        const items =
          kind === "spawn"
            ? piece.items.filter((existing) => existing.kind !== "spawn")
            : piece.items;
        return { ...piece, items: [...items, item] };
      }),
    }));
  };

  const onCellDrop = (event: DragEvent<HTMLButtonElement>, x: number, y: number, z = floor) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData("application/x-level-item") as ItemKind;
    if (ITEM_OPTIONS.some((item) => item.kind === kind)) placeItem(kind, x, y, z);
  };

  const removeItem = (itemId: string) => {
    if (!selectedPiece) return;
    updateDraft((level) => ({
      ...level,
      pieces: level.pieces.map((piece) =>
        piece.id === selectedPiece.id
          ? { ...piece, items: piece.items.filter((item) => item.id !== itemId) }
          : piece,
      ),
    }));
  };

  const addVisualRule = () => {
    if (!draft) return;
    const parsed = parseRotationScript(draft.rotationScript);
    const rule: RotationRule = {
      id: ruleId.trim().replace(/\s+/g, "-") || "new-move",
      selector: { type: "layer", axis: ruleAxis, coordinate: ruleLayer },
      pivot,
      axis: ruleAxis,
      quarterTurn: turn,
      triggers: AXES.filter((axis) => axis !== ruleAxis).map((axis, index, tangents) => ({
        grab: axis,
        drag: tangents[(index + 1) % tangents.length]!,
      })),
    };
    const rules = [...parsed.rules.filter((existing) => existing.id !== rule.id), rule];
    updateDraft((level) => ({ ...level, rotationScript: formatRotationScript(rules) }));
    setPreviewRuleId(rule.id);
    setView("rotations");
  };

  const deleteRule = (id: string) => {
    const rules = parsedRules.rules.filter((rule) => rule.id !== id);
    updateDraft((level) => ({ ...level, rotationScript: formatRotationScript(rules) }));
    if (previewRuleId === id) setPreviewRuleId(undefined);
  };

  const logOut = async () => {
    try {
      await signOut();
      onSignedOut();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign out.");
    }
  };

  if (playtesting && draft) {
    return (
      <main className="editor-playtest">
        <button className="editor-exit-playtest" onClick={() => setPlaytesting(false)} type="button">
          ← Return to editor
        </button>
        <PlaytestGame editorMode levelDefinition={draft} />
      </main>
    );
  }

  return (
    <main className="engine-workbench">
      <header className="engine-toolbar">
        <div>
          <p className="eyebrow">Cubesque-Ape Engine</p>
          <h1>Level Editor</h1>
        </div>
        <div className="engine-toolbar-actions">
          <span>{email}</span>
          {role === "admin" && <a href="/admin">Admin dashboard</a>}
          <button disabled={!draft} onClick={() => setPlaytesting(true)} type="button">Playtest</button>
          <button className="is-primary" disabled={busy || !draft || !levelId} onClick={saveVersion} type="button">
            {busy ? "Working…" : "Save Version"}
          </button>
          <button onClick={logOut} type="button">Sign out</button>
        </div>
      </header>

      <aside className="engine-level-rail">
        <div className="engine-rail-heading">
          <span>Levels</span>
          <button onClick={createNewLevel} type="button">＋</button>
        </div>
        <nav aria-label="Your levels">
          {levels.map((level) => (
            <button
              className={level.id === levelId ? "is-active" : ""}
              key={level.id}
              onClick={() => void openLevel(level.id)}
              type="button"
            >
              <strong>{level.name}</strong>
              <span>{level.slug}</span>
            </button>
          ))}
        </nav>
        <div className="engine-rail-actions">
          <button disabled={!draft} onClick={duplicateLevel} type="button">Duplicate</button>
          <button disabled={!levelId} onClick={archiveCurrent} type="button">Archive</button>
        </div>
      </aside>

      <section className="engine-main">
        <nav className="engine-view-tabs" aria-label="Editor views">
          {(["world", "interior", "rotations", "history"] as WorkspaceView[]).map((tab) => (
            <button className={view === tab ? "is-active" : ""} key={tab} onClick={() => setView(tab)} type="button">
              {tab}
            </button>
          ))}
        </nav>

        {!draft ? (
          <div className="engine-no-level">
            <h2>No level selected</h2>
            <button onClick={createNewLevel} type="button">Create level</button>
          </div>
        ) : view === "world" ? (
          <>
            <WorldCanvas
              level={draft}
              onMoveDrop={movePiece}
              onSelect={(pieceId) => setSelectedPieceId(pieceId)}
              previewRule={previewRule}
              selectedPieceId={selectedPieceId}
            />
            <div className="engine-canvas-actions">
              <button onClick={addPiece} type="button">Add World Piece</button>
              <button onClick={generateMatrix} type="button">Generate matrix</button>
              <button disabled={!selectedPiece} onClick={() => selectedPiece && movePiece(selectedPiece.id)} type="button">Exact position</button>
            </div>
          </>
        ) : view === "interior" ? (
          <div className="engine-interior-workspace">
            <div className="engine-item-palette">
              <h2>Place items</h2>
              {ITEM_OPTIONS.map((item) => (
                <button
                  className={paletteKind === item.kind ? "is-active" : ""}
                  draggable
                  key={item.kind}
                  onClick={() => setPaletteKind(item.kind)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/x-level-item", item.kind);
                    setPaletteKind(item.kind);
                  }}
                  type="button"
                >
                  <span>{item.glyph}</span>{item.label}
                </button>
              ))}
              <div className="engine-floor-picker">
                <span>Active floor</span>
                <div aria-label="Active interior floor" role="group">
                  {[3, 2, 1, 0].map((value) => (
                    <button
                      aria-pressed={floor === value}
                      className={floor === value ? "is-active" : ""}
                      key={value}
                      onClick={() => setFloor(value)}
                      type="button"
                    >
                      <strong>{value}</strong><small>Z = {value}</small>
                    </button>
                  ))}
                </div>
              </div>
              {paletteKind === "door" && (
                <label>
                  Door face
                  <select onChange={(event) => setDoorFace(event.target.value as FaceColor)} value={doorFace}>
                    {FACE_OPTIONS.map((face) => <option key={face}>{face}</option>)}
                  </select>
                </label>
              )}
            </div>
            <InteriorCanvas
              activeFloor={floor}
              onDrop={onCellDrop}
              onPlace={placeItem}
              paletteKind={paletteKind}
              piece={selectedPiece}
            />
            <div className="engine-interior-items">
              <h2>{selectedPiece?.label ?? "Select a World Piece"}</h2>
              {selectedPiece?.items.map((item) => (
                <div key={item.id}>
                  <span>{itemGlyph(item.kind)} {item.kind.replace("_", " ")}</span>
                  <code>[{item.cell.join(",")}]{"face" in item ? ` · ${item.face}` : ""}</code>
                  {"face" in item && (
                    <em className={pairedDoorIds.has(item.id) ? "is-paired" : "is-unpaired"}>
                      {pairedDoorIds.has(item.id) ? "Aligned" : "Needs matching neighbor"}
                    </em>
                  )}
                  <button onClick={() => removeItem(item.id)} type="button">Remove</button>
                </div>
              ))}
            </div>
          </div>
        ) : view === "rotations" ? (
          <div className="engine-rotation-workspace">
            <WorldCanvas
              level={draft}
              onMoveDrop={movePiece}
              onSelect={setSelectedPieceId}
              previewRule={previewRule}
              selectedPieceId={selectedPieceId}
            />
            <div className="engine-rule-builder">
              <h2>Rotation rules</h2>
              <label>Move ID<input onChange={(event) => setRuleId(event.target.value)} value={ruleId} /></label>
              <div className="engine-inline-fields">
                <label>Axis<select onChange={(event) => setRuleAxis(event.target.value as Axis)} value={ruleAxis}>{AXES.map((axis) => <option key={axis}>{axis}</option>)}</select></label>
                <label>Layer<input onChange={(event) => setRuleLayer(Number(event.target.value))} type="number" value={ruleLayer} /></label>
                <label>Turn<select onChange={(event) => setTurn(Number(event.target.value) as -1 | 1)} value={turn}><option value={-1}>-90°</option><option value={1}>+90°</option></select></label>
              </div>
              <label>
                Pivot x, y, z
                <input
                  onChange={(event) => {
                    const parsed = event.target.value.split(",").map(Number);
                    if (parsed.length === 3 && parsed.every((value) => Number.isInteger(value * 2))) setPivot(parsed as WorldPosition);
                  }}
                  value={pivot.join(",")}
                />
              </label>
              <button className="is-primary" onClick={addVisualRule} type="button">Add or replace rule</button>
              <div className="engine-rule-list">
                {parsedRules.rules.map((rule) => (
                  <div key={rule.id}>
                    <button onClick={() => setPreviewRuleId(previewRuleId === rule.id ? undefined : rule.id)} type="button">
                      <strong>{rule.id}</strong>
                      <span>{rule.axis} · {rule.quarterTurn * 90}°</span>
                    </button>
                    <button aria-label={`Delete ${rule.id}`} onClick={() => deleteRule(rule.id)} type="button">×</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="engine-dsl-editor">
              <div><h2>Cube DSL</h2><span>{parsedRules.diagnostics.length} parser issues</span></div>
              <textarea
                aria-label="Rotation script"
                onChange={(event) => updateDraft((level) => ({ ...level, rotationScript: event.target.value }))}
                spellCheck={false}
                value={draft.rotationScript}
              />
              {parsedRules.diagnostics.map((diagnostic, index) => (
                <p key={`${diagnostic.code}-${index}`}>Line {diagnostic.line ?? "?"}: {diagnostic.message}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="engine-history">
            <h2>Immutable versions</h2>
            <p>Restoring a revision only replaces your working draft. Save again to create a new revision.</p>
            {versions.map((version) => (
              <article key={version.id}>
                <div>
                  <strong>Revision {version.revision}</strong>
                  <time>{new Date(version.createdAt).toLocaleString()}</time>
                </div>
                <p>{version.note || "No version note"}</p>
                <span>{version.diagnostics.filter((item) => item.severity === "error").length} errors</span>
                <button onClick={() => {
                  setDraft(cloneLevel(version.definition));
                  setSelectedPieceId(version.definition.pieces[0]?.id);
                  setStatus(`Revision ${version.revision} restored into the draft.`);
                }} type="button">Restore to draft</button>
              </article>
            ))}
          </div>
        )}
      </section>

      <aside className="engine-inspector">
        {draft && (
          <>
            <label>
              Level name
              <input onChange={(event) => updateDraft((level) => ({ ...level, name: event.target.value }))} value={draft.name} />
            </label>
            <div className="engine-inspector-heading">
              <span>World Pieces</span>
              <strong>{draft.pieces.length}</strong>
            </div>
            <div className="engine-piece-list">
              {draft.pieces.map((piece) => (
                <button className={piece.id === selectedPieceId ? "is-active" : ""} key={piece.id} onClick={() => setSelectedPieceId(piece.id)} type="button">
                  <span>{piece.label}</span><code>{piece.position.join(",")}</code>
                </button>
              ))}
            </div>
            {selectedPiece && (
              <div className="engine-selected-piece">
                <label>
                  Piece label
                  <input onChange={(event) => updateDraft((level) => ({
                    ...level,
                    pieces: level.pieces.map((piece) => piece.id === selectedPiece.id ? { ...piece, label: event.target.value } : piece),
                  }))} value={selectedPiece.label} />
                </label>
                <button onClick={() => setView("interior")} type="button">Edit 4×4×4 interior</button>
                <button className="is-danger" onClick={removeSelectedPiece} type="button">Remove piece</button>
              </div>
            )}
            <Diagnostics level={draft} />
          </>
        )}
        <p className="engine-status" role="status">{status}</p>
      </aside>
    </main>
  );
}
