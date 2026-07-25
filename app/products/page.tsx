import AppShell from "@/components/AppShell";
import ProductsPageClient from "@/components/ProductsPageClient";
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PRODUCT_LIST_SELECT_SIMPLE,
  mapProductJoins,
} from "@/lib/supplierQueries";
import { redirect } from "next/navigation";

export default async function ProductsPage() {
  await requireAdmin();
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select(PRODUCT_LIST_SELECT_SIMPLE)
    .order("name");

  return (
    <AppShell>
      <ProductsPageClient
        profile={profile}
        initialProducts={mapProductJoins(products as any)}
      />
    </AppShell>
  );
}
