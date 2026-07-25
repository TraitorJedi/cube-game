import type { Metadata } from "next";

import EditorRoute from "~/game/editor/EditorRoute";

export const metadata: Metadata = {
  title: "Level editor | Cubesque-Ape",
};

export default function EditorPage() {
  return <EditorRoute />;
}