import AppShell from "@/components/AppShell";
import SettingsClient from "@/components/SettingsClient";
import { getCurrentUser } from "@/lib/auth";

export default async function SettingsPage() {
  const profile = await getCurrentUser();

  return (
    <AppShell>
      <SettingsClient profile={profile!} />
    </AppShell>
  );
}
