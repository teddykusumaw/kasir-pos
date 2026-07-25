import AppShell from "@/components/AppShell";
import ProductsClient from "@/components/ProductsClient";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProductsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .order("name");

  return (
    <AppShell>
      <ProductsClient initialProducts={products || []} />
    </AppShell>
  );
}
