"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  getAuthClaims,
  getDefaultVersionId,
  hasSupabase,
  listLevels,
  listLevelVersions,
  setDefaultVersion,
  signOut,
  type AuthClaims,
  type LevelSummary,
  type LevelVersion,
} from "../level-repository";

export default function AdminRoute() {
  const [claims, setClaims] = useState<AuthClaims | null | undefined>(() =>
    hasSupabase() ? undefined : null,
  );
  const [levels, setLevels] = useState<LevelSummary[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<string>();
  const [versions, setVersions] = useState<LevelVersion[]>([]);
  const [defaultVersionId, setDefaultVersionId] = useState<string | null>(null);
  const [status, setStatus] = useState(() =>
    hasSupabase() ? "Checking admin access…" : "Supabase is not configured.",
  );
  const [busy, setBusy] = useState(false);

  const selectLevel = async (levelId: string) => {
    setSelectedLevelId(levelId);
    setBusy(true);
    try {
      setVersions(await listLevelVersions(levelId));
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load versions.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!hasSupabase()) return;
    getAuthClaims()
      .then(async (nextClaims) => {
        setClaims(nextClaims);
        if (nextClaims?.role !== "admin") {
          setStatus("This dashboard requires an admin account.");
          return;
        }
        const [nextLevels, nextDefault] = await Promise.all([
          listLevels(true),
          getDefaultVersionId(),
        ]);
        setLevels(nextLevels);
        setDefaultVersionId(nextDefault);
        if (nextLevels[0]) {
          setSelectedLevelId(nextLevels[0].id);
          setVersions(await listLevelVersions(nextLevels[0].id));
        }
        setStatus("");
      })
      .catch((error) => {
        setClaims(null);
        setStatus(error instanceof Error ? error.message : "Unable to load the admin dashboard.");
      });
  }, []);

  if (claims === undefined) return <main className="editor-loading">Checking admin access…</main>;
  if (!claims || claims.role !== "admin") {
    return (
      <main className="editor-auth">
        <section className="editor-auth-card">
          <p className="eyebrow">Restricted workspace</p>
          <h1>Admin dashboard</h1>
          <p className="editor-auth-copy">{status}</p>
          <a className="admin-login-link" href="/editor">Sign in through the Level Editor</a>
        </section>
      </main>
    );
  }

  const selected = levels.find((level) => level.id === selectedLevelId);
  return (
    <main className="admin-dashboard">
      <header>
        <div>
          <p className="eyebrow">Publishing control</p>
          <h1>Default Level</h1>
        </div>
        <nav>
          <Link href="/editor">Level Editor</Link>
          <Link href="/">Open game</Link>
          <button onClick={() => void signOut().then(() => setClaims(null))} type="button">Sign out</button>
        </nav>
      </header>
      <aside>
        <h2>All levels</h2>
        {levels.map((level) => (
          <button className={selectedLevelId === level.id ? "is-active" : ""} key={level.id} onClick={() => void selectLevel(level.id)} type="button">
            <strong>{level.name}</strong>
            <span>{level.archivedAt ? "Archived" : "Active"} · {level.slug}</span>
          </button>
        ))}
      </aside>
      <section>
        <div className="admin-section-heading">
          <div>
            <span>Version history</span>
            <h2>{selected?.name ?? "Select a level"}</h2>
          </div>
          <p>{versions.length} immutable revisions</p>
        </div>
        <div className="admin-version-list">
          {versions.map((version) => {
            const errors = version.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
            const isDefault = version.id === defaultVersionId;
            return (
              <article className={isDefault ? "is-default" : ""} key={version.id}>
                <div>
                  <span>Revision {version.revision}</span>
                  <h3>{version.definition.name}</h3>
                  <time>{new Date(version.createdAt).toLocaleString()}</time>
                </div>
                <dl>
                  <div><dt>Pieces</dt><dd>{version.definition.pieces.length}</dd></div>
                  <div><dt>Rules</dt><dd>{version.definition.rotationScript.match(/^move /gm)?.length ?? 0}</dd></div>
                  <div><dt>Errors</dt><dd>{errors.length}</dd></div>
                </dl>
                <p>{version.note || "No version note"}</p>
                <button
                  className={isDefault ? "is-current" : ""}
                  disabled={busy || isDefault || errors.length > 0}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await setDefaultVersion(version);
                      setDefaultVersionId(version.id);
                      setStatus(`Revision ${version.revision} is now the public Default.`);
                    } catch (error) {
                      setStatus(error instanceof Error ? error.message : "Unable to change the Default.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  type="button"
                >
                  {isDefault ? "Current Default" : errors.length ? "Fix errors first" : "Set as Default"}
                </button>
              </article>
            );
          })}
        </div>
        {status && <p className="admin-status" role="status">{status}</p>}
      </section>
    </main>
  );
}
