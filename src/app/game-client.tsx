"use client";

import dynamic from "next/dynamic";

const GameApp = dynamic(() => import("~/game/GameApp"), {
  ssr: false,
  loading: () => <main className="game-loading">Loading Cubesque-Ape…</main>,
});

export default function GameClient() {
  return <GameApp />;
}