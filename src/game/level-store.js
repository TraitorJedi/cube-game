import { TUTORIAL_LEVEL } from "../engine/tutorial-level.ts";
import { levelDefinitionToLegacyLevel } from "../engine/legacy-adapter.ts";
import {
  getAuthClaims,
  hasSupabase,
  loadDefaultLevel,
  onAuthChange,
  signIn,
  signOut,
} from "./level-repository.ts";

export { getAuthClaims, hasSupabase, onAuthChange, signIn, signOut };

export async function loadPrimaryLevel() {
  const { definition } = await loadDefaultLevel();
  return levelDefinitionToLegacyLevel(definition);
}

export async function loadRemotePrimaryLevel() {
  const loaded = await loadDefaultLevel();
  if (loaded.source !== "supabase") throw new Error("The shared Default level could not be loaded.");
  return levelDefinitionToLegacyLevel(loaded.definition);
}

export function loadLocalLevel() {
  return levelDefinitionToLegacyLevel(TUTORIAL_LEVEL);
}

export function saveLocalLevel() {
  throw new Error("Local authored levels have been replaced by immutable Supabase versions.");
}

export async function savePrimaryLevel(_level) {
  void _level;
  throw new Error("Use Save Version in the Level Editor.");
}
