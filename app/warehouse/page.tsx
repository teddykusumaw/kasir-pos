import AppShell from "@/components/AppShell";
import WarehousePageClient from "@/components/WarehousePageClient";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function WarehousePage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [{ data: products }, { data: suppliers }, { data: batches }] =
    await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("suppliers").select("*").order("name"),
      supabase
        .from("stock_batches")
        .select("product_id, delivery_date, received_at")
        .order("delivery_date", { ascending: false }),
    ]);

  const deliveryByProduct: Record<string, string> = {};
  for (const b of batches || []) {
    const pid = b.product_id as string;
    if (deliveryByProduct[pid]) continue;
    const d = b.delivery_date || (b.received_at || "").slice(0, 10);
    if (d) deliveryByProduct[pid] = d;
  }

  return (
    <AppShell>
      <WarehousePageClient
        profile={profile}
        products={products || []}
        suppliers={suppliers || []}
        deliveryByProduct={deliveryByProduct}
      />
    </AppShell>
  );
}
