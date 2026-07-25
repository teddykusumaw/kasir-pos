import AppShell from "@/components/AppShell";
import SuppliersClient from "@/components/SuppliersClient";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SuppliersPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  return (
    <AppShell>
      <SuppliersClient profile={profile} />
    </AppShell>
  );
}
