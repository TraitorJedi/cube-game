import type { Metadata } from "next";
import AdminRoute from "~/game/admin/AdminRoute";

export const metadata: Metadata = {
  title: "Admin dashboard | Cubesque-Ape",
};

export default function AdminPage() {
  return <AdminRoute />;
}

