import AppShell from "@/components/AppShell";
import ReportsTabs from "@/components/ReportsTabs";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ReportsPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  return (
    <AppShell>
      <ReportsTabs profile={profile} />
    </AppShell>
  );
}
