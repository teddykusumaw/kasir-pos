import AppShell from "@/components/AppShell";
import WarehousePageClient from "@/components/WarehousePageClient";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function WarehousePage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .order("name");

  return (
    <AppShell>
      <WarehousePageClient profile={profile} products={products || []} />
    </AppShell>
  );
}
