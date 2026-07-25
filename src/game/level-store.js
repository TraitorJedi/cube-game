import { createClient } from "@supabase/supabase-js";
import { createPrimaryLevel, validateLevel } from "./levels.js";

const LOCAL_KEY = "cubesque-ape:primary-world";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabase = url && key ? createClient(url, key, {
  auth: {
    detectSessionInUrl: false,
    persistSession: false,
  },
}) : null;

export function loadLocalLevel() {
  try { return validateLevel(JSON.parse(localStorage.getItem(LOCAL_KEY))) } catch { return createPrimaryLevel(); }
}
export function saveLocalLevel(level) { const checked = validateLevel(level); localStorage.setItem(LOCAL_KEY, JSON.stringify(checked)); return checked; }
export function hasSupabase() { return Boolean(supabase); }

export async function getAuthClaims() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) return null;
  return { email: data.user.email, sub: data.user.id };
}

export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { getAuthClaims().then(callback).catch(() => callback(null)); });
  return () => subscription.unsubscribe();
}

export async function signIn(email, password) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadRemotePrimaryLevel() {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: level, error } = await supabase.from("levels").select("id, slug, name").eq("slug", "primary-world").single();
  if (error) throw error;
  if (!level) throw new Error("The shared primary level was not found.");
  const [{ data: modules, error: moduleError }, { data: items, error: itemError }] = await Promise.all([
    supabase.from("level_modules").select("module_id, label, position, colors").eq("level_id", level.id),
    supabase.from("level_items").select("id, module_id, kind, coordinate, target_module_id").eq("level_id", level.id),
  ]);
  if (moduleError) throw moduleError;
  if (itemError) throw itemError;
  return validateLevel({ ...level, modules: modules.map((row) => ({ id: row.module_id, label: row.label, position: row.position, colors: row.colors })), items: items.map((row) => ({ id: row.id, moduleId: row.module_id, kind: row.kind, coordinate: row.coordinate, targetModuleId: row.target_module_id })) });
}

export async function loadPrimaryLevel() {
  if (!supabase) return loadLocalLevel();
  try {
    return await loadRemotePrimaryLevel();
  } catch {
    return loadLocalLevel();
  }
}

export async function savePrimaryLevel(level) {
  const checked = saveLocalLevel(level);
  if (!supabase) return { source: "local" };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Sign in to Supabase before saving shared level changes.");
  const { data: saved, error } = await supabase.from("levels").upsert({ slug: "primary-world", name: checked.name, owner_id: auth.user.id }, { onConflict: "slug" }).select("id").single();
  if (error) throw error;
  await supabase.from("level_modules").delete().eq("level_id", saved.id);
  await supabase.from("level_items").delete().eq("level_id", saved.id);
  const { error: writeError } = await supabase.from("level_modules").insert(checked.modules.map((module) => ({ level_id: saved.id, module_id: module.id, label: module.label, position: module.position, colors: module.colors })));
  if (writeError) throw writeError;
  const { error: itemError } = await supabase.from("level_items").insert(checked.items.map((item) => ({ level_id: saved.id, id: item.id, module_id: item.moduleId, kind: item.kind, coordinate: item.coordinate, target_module_id: item.targetModuleId ?? null })));
  if (itemError) throw itemError;
  return { source: "supabase" };
}
