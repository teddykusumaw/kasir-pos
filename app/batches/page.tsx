import AppShell from "@/components/AppShell";
import BatchesClient from "@/components/BatchesClient";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function BatchesPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  return (
    <AppShell>
      <BatchesClient profile={profile} />
    </AppShell>
  );
}
