import AppShell from "@/components/AppShell";
import UsersClient from "@/components/UsersClient";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function UsersPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at");

  return (
    <AppShell>
      <UsersClient initialUsers={users || []} />
    </AppShell>
  );
}
