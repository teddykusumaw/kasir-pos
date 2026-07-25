import AppShell from "@/components/AppShell";
import PurchasesClient from "@/components/PurchasesClient";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PurchasesPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  return (
    <AppShell>
      <PurchasesClient profile={profile} />
    </AppShell>
  );
}
