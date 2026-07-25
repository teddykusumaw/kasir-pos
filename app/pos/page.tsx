import AppShell from "@/components/AppShell";
import POSClient from "@/components/POSClient";
import { getCurrentUser } from "@/lib/auth";

export default async function POSPage() {
  const profile = await getCurrentUser();

  return (
    <AppShell>
      <POSClient profile={profile!} />
    </AppShell>
  );
}
