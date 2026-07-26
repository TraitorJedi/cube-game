"use client";

import {
  hasValidationErrors,
  validateLevel,
  type Diagnostic,
  type LevelDefinitionV1,
} from "../engine/level-engine";
import { TUTORIAL_LEVEL } from "../engine/tutorial-level";
import { hasSupabase, supabase } from "./supabase-client";

export interface AuthClaims {
  email?: string;
  sub: string;
  role: "admin" | "creator";
}

export interface LevelSummary {
  id: string;
  slug: string;
  name: string;
  ownerId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LevelVersion {
  id: string;
  levelId: string;
  revision: number;
  definition: LevelDefinitionV1;
  diagnostics: Diagnostic[];
  note: string;
  createdBy: string | null;
  createdAt: string;
}

function requireClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "untitled-level"
  );
}

function assertDefinition(value: unknown): LevelDefinitionV1 {
  const level = value as LevelDefinitionV1;
  if (
    !level ||
    level.schemaVersion !== 1 ||
    level.coordinateFrame !== "orange-red_green-blue_yellow-white" ||
    !Array.isArray(level.pieces) ||
    typeof level.rotationScript !== "string"
  ) {
    throw new Error("The saved level uses an unsupported schema.");
  }
  return level;
}

export async function getAuthClaims(): Promise<AuthClaims | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) return null;
  return {
    email: data.user.email,
    sub: data.user.id,
    role: data.user.app_metadata.role === "admin" ? "admin" : "creator",
  };
}

export function onAuthChange(callback: (claims: AuthClaims | null) => void): () => void {
  if (!supabase) return () => undefined;
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => {
    void getAuthClaims()
      .then(callback)
      .catch(() => callback(null));
  });
  return () => subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<void> {
  const client = requireClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadDefaultLevel(): Promise<{
  definition: LevelDefinitionV1;
  versionId: string | null;
  source: "supabase" | "fallback";
}> {
  if (!supabase) return { definition: TUTORIAL_LEVEL, versionId: null, source: "fallback" };
  try {
    const { data: config, error: configError } = await supabase
      .from("app_config")
      .select("default_level_version_id")
      .eq("id", "game")
      .single();
    if (configError || !config?.default_level_version_id) throw configError ?? new Error("No Default level.");
    const { data: version, error: versionError } = await supabase
      .from("level_versions")
      .select("id, definition")
      .eq("id", config.default_level_version_id)
      .single();
    if (versionError || !version) throw versionError ?? new Error("Default level version was not found.");
    const definition = assertDefinition(version.definition);
    if (hasValidationErrors(definition)) throw new Error("The Default level is invalid.");
    return { definition, versionId: version.id, source: "supabase" };
  } catch {
    return { definition: TUTORIAL_LEVEL, versionId: null, source: "fallback" };
  }
}

export async function listLevels(includeArchived = false): Promise<LevelSummary[]> {
  const client = requireClient();
  let query = client
    .from("levels")
    .select("id, slug, name, owner_id, archived_at, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    ownerId: row.owner_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createLevel(name: string): Promise<LevelSummary> {
  const client = requireClient();
  const claims = await getAuthClaims();
  if (!claims) throw new Error("Sign in before creating a level.");
  const slugBase = slugify(name);
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await client
    .from("levels")
    .insert({ name: name.trim() || "Untitled level", slug, owner_id: claims.sub })
    .select("id, slug, name, owner_id, archived_at, created_at, updated_at")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    ownerId: data.owner_id,
    archivedAt: data.archived_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateLevelMetadata(
  id: string,
  patch: { name?: string; archivedAt?: string | null },
): Promise<void> {
  const client = requireClient();
  const payload: Record<string, string | null> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim() || "Untitled level";
  if (patch.archivedAt !== undefined) payload.archived_at = patch.archivedAt;
  payload.updated_at = new Date().toISOString();
  const { error } = await client.from("levels").update(payload).eq("id", id);
  if (error) throw error;
}

export async function saveLevelVersion(
  levelId: string,
  definition: LevelDefinitionV1,
  note = "",
): Promise<LevelVersion> {
  const client = requireClient();
  const claims = await getAuthClaims();
  if (!claims) throw new Error("Sign in before saving a version.");
  const diagnostics = validateLevel(definition);
  const { data, error } = await client
    .from("level_versions")
    .insert({
      level_id: levelId,
      definition,
      diagnostics,
      note: note.trim(),
      created_by: claims.sub,
    })
    .select("id, level_id, revision, definition, diagnostics, note, created_by, created_at")
    .single();
  if (error) throw error;
  return mapVersion(data);
}

function mapVersion(row: {
  id: string;
  level_id: string;
  revision: number;
  definition: unknown;
  diagnostics: unknown;
  note: string | null;
  created_by: string | null;
  created_at: string;
}): LevelVersion {
  return {
    id: row.id,
    levelId: row.level_id,
    revision: row.revision,
    definition: assertDefinition(row.definition),
    diagnostics: Array.isArray(row.diagnostics) ? (row.diagnostics as Diagnostic[]) : [],
    note: row.note ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listLevelVersions(levelId: string): Promise<LevelVersion[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("level_versions")
    .select("id, level_id, revision, definition, diagnostics, note, created_by, created_at")
    .eq("level_id", levelId)
    .order("revision", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapVersion);
}

export async function getDefaultVersionId(): Promise<string | null> {
  const client = requireClient();
  const { data, error } = await client
    .from("app_config")
    .select("default_level_version_id")
    .eq("id", "game")
    .single();
  if (error) throw error;
  return data.default_level_version_id ?? null;
}

export async function setDefaultVersion(version: LevelVersion): Promise<void> {
  if (version.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new Error("Fix this version's validation errors before making it Default.");
  }
  const client = requireClient();
  const claims = await getAuthClaims();
  if (claims?.role !== "admin") throw new Error("Only an admin can change the Default level.");
  const currentDiagnostics = validateLevel(version.definition);
  if (currentDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new Error("This version no longer passes the current validator.");
  }
  const { error } = await client
    .from("app_config")
    .update({
      default_level_version_id: version.id,
      updated_by: claims.sub,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "game");
  if (error) throw error;
}

export { hasSupabase };
