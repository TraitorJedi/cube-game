"use client";

import React, { type FormEvent, lazy, Suspense, useEffect, useState } from "react";
import { getAuthClaims, hasSupabase, onAuthChange, signIn } from "../level-store.js";

type AuthClaims = {
  email?: string;
  sub?: string;
};

const LevelEditorApp = lazy(() => import("./LevelEditorApp"));

function LoginScreen({ onSignedIn }: { onSignedIn: (claims: AuthClaims) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");
    try {
      await signIn(email, password);
      const claims = await getAuthClaims();
      if (!claims) throw new Error("Sign-in completed without a valid session.");
      onSignedIn(claims);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="editor-auth">
      <section className="editor-auth-card" aria-labelledby="editor-login-title">
        <p className="eyebrow">Private workspace</p>
        <h1 id="editor-login-title">Level editor</h1>
        <p className="editor-auth-copy">Sign in with the account created by the administrator.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              autoComplete="username"
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button disabled={submitting} type="submit">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
          {status && <p className="editor-auth-status" role="alert">{status}</p>}
        </form>
      </section>
    </main>
  );
}

export default function EditorRoute() {
  const [claims, setClaims] = useState<AuthClaims | null>(null);
  const [checking, setChecking] = useState(() => hasSupabase());

  useEffect(() => {
    if (!hasSupabase()) return;

    getAuthClaims()
      .then(setClaims)
      .catch(() => setClaims(null))
      .finally(() => setChecking(false));
    return onAuthChange((nextClaims: AuthClaims | null) => {
      setClaims(nextClaims);
      setChecking(false);
    });
  }, []);

  if (!hasSupabase()) {
    return (
      <main className="editor-auth">
        <section className="editor-auth-card" role="alert">
          <p className="eyebrow">Configuration required</p>
          <h1>Level editor unavailable</h1>
          <p className="editor-auth-copy">Supabase environment variables are required to use this private module.</p>
        </section>
      </main>
    );
  }

  if (checking) return <main className="editor-loading">Checking session…</main>;
  if (!claims) return <LoginScreen onSignedIn={setClaims} />;

  return (
    <Suspense fallback={<main className="editor-loading">Loading editor…</main>}>
      <LevelEditorApp email={claims.email ?? "Signed-in user"} onSignedOut={() => setClaims(null)} />
    </Suspense>
  );
}
