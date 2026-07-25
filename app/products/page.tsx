import AppShell from "@/components/AppShell";
import ProductsPageClient from "@/components/ProductsPageClient";
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProductsPage() {
  await requireAdmin();
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("*, suppliers(id, name), product_categories(id, name)")
    .order("name");

  const mapped = (products || []).map((p: any) => ({
    ...p,
    supplier: p.suppliers || null,
    category_rel: p.product_categories || null,
    category: p.category || p.product_categories?.name || null,
  }));

  return (
    <AppShell>
      <ProductsPageClient profile={profile} initialProducts={mapped} />
    </AppShell>
  );
}
