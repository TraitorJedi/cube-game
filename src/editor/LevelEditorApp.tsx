import React, { useEffect, useState } from "react";
import { createPrimaryLevel, validatePlacement } from "../levels.js";
import { loadPrimaryLevel, savePrimaryLevel, signOut } from "../level-store.js";

type LevelItem = {
  id: string;
  moduleId: string;
  kind: "obstacle" | "golden_banana" | "door" | "spawn";
  coordinate: Array<string | number>;
};

type LevelModule = {
  id: string;
  label: string;
};

type Level = {
  name: string;
  modules: LevelModule[];
  items: LevelItem[];
};

type ItemKind = LevelItem["kind"];

export default function LevelEditorApp({ email, onSignedOut }: { email: string; onSignedOut: () => void }) {
  const [level, setLevel] = useState<Level>(() => createPrimaryLevel() as Level);
  const [moduleId, setModuleId] = useState("r/w/b");
  const [kind, setKind] = useState<ItemKind>("obstacle");
  const [coordinate, setCoordinate] = useState("g,o,y,0,0,0");
  const [status, setStatus] = useState("Loading level…");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPrimaryLevel()
      .then((loaded) => {
        setLevel(loaded as Level);
        setStatus("");
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : "Unable to load the level."));
  }, []);

  const addItem = () => {
    try {
      const values = coordinate.split(",").map((value, index) => index < 3 ? value.trim().toLowerCase() : Number(value));
      const item = validatePlacement({
        id: `${kind}-${crypto.randomUUID()}`,
        moduleId,
        kind,
        coordinate: values,
      }) as LevelItem;
      if (kind === "spawn" && level.items.some((existing) => existing.kind === "spawn")) {
        throw new Error("Remove the existing spawn first.");
      }
      setLevel((current) => ({ ...current, items: [...current.items, item] }));
      setStatus("Item placed in the draft.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to place the item.");
    }
  };

  const save = async () => {
    setSaving(true);
    setStatus("");
    try {
      await savePrimaryLevel(level);
      setStatus("Level saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save the level.");
    } finally {
      setSaving(false);
    }
  };

  const logOut = async () => {
    try {
      await signOut();
      onSignedOut();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign out.");
    }
  };

  return (
    <main className="editor-workspace">
      <header className="editor-header">
        <div>
          <p className="eyebrow">Private workspace</p>
          <h1>Level editor</h1>
        </div>
        <div className="editor-session">
          <span>{email}</span>
          <button onClick={logOut} type="button">Sign out</button>
        </div>
      </header>

      <section className="editor-panel" aria-labelledby="level-name">
        <div className="editor-panel-heading">
          <div>
            <p className="eyebrow">Level design</p>
            <h2 id="level-name">{level.name}</h2>
          </div>
          <button disabled={saving} onClick={save} type="button">
            {saving ? "Saving…" : "Save level"}
          </button>
        </div>

        <div className="editor-fields">
          <label>
            World cube piece
            <select onChange={(event) => setModuleId(event.target.value)} value={moduleId}>
              {level.modules.map((module) => <option key={module.id} value={module.id}>{module.label}</option>)}
            </select>
          </label>
          <label>
            Place
            <select onChange={(event) => setKind(event.target.value as ItemKind)} value={kind}>
              {(["obstacle", "golden_banana", "door", "spawn"] as ItemKind[]).map((value) => (
                <option key={value} value={value}>{value.replace("_", " ")}</option>
              ))}
            </select>
          </label>
          <label>
            Coordinate
            <input onChange={(event) => setCoordinate(event.target.value)} value={coordinate} />
          </label>
          <button onClick={addItem} type="button">Place item</button>
        </div>

        <p className="coordinate-help">
          Values pair by position: color 1/2/3, then distance 1/2/3. For a door, color 3 selects the face and distance 3 must be 0.
        </p>
        {status && <p className="editor-status" role="status">{status}</p>}

        <div className="item-list">
          {level.items.map((item) => (
            <div className="placed-item" key={item.id}>
              <span>{item.moduleId} · {item.kind}</span>
              <code>[{item.coordinate.join(", ")}]</code>
              <button
                onClick={() => setLevel((current) => ({
                  ...current,
                  items: current.items.filter((existing) => existing.id !== item.id),
                }))}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
