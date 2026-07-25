import AppShell from "@/components/AppShell";
import WarehousePageClient from "@/components/WarehousePageClient";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import {
  PRODUCT_WAREHOUSE_SELECT,
  SUPPLIER_OPTION_SELECT,
  BATCH_DELIVERY_SELECT,
} from "@/lib/supplierQueries";
import { redirect } from "next/navigation";

export default async function WarehousePage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const [{ data: products }, { data: suppliers }, { data: batches }] =
    await Promise.all([
      supabase
        .from("products")
        .select(PRODUCT_WAREHOUSE_SELECT)
        .order("name"),
      supabase
        .from("suppliers")
        .select(SUPPLIER_OPTION_SELECT)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("stock_batches")
        .select(BATCH_DELIVERY_SELECT)
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
        products={(products as any) || []}
        suppliers={(suppliers as any) || []}
        deliveryByProduct={deliveryByProduct}
      />
    </AppShell>
  );
}
