import AppShell from "@/components/AppShell";
import DashboardClient from "@/components/DashboardClient";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const profile = await getCurrentUser();
  const supabase = await createClient();

  // Low stock products
  const { data: lowStock } = await supabase
    .from("products")
    .select("*")
    .filter("stock", "lte", "min_stock")
    .order("stock", { ascending: true })
    .limit(10);

  // Today's sales summary
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: todaySales } = await supabase
    .from("sales")
    .select("total")
    .gte("created_at", today.toISOString());

  const todayTotal = todaySales?.reduce((sum, s) => sum + Number(s.total), 0) || 0;
  const todayCount = todaySales?.length || 0;

  // Total products
  const { count: productCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  // Total stock value
  const { data: allProducts } = await supabase
    .from("products")
    .select("stock, cost");
  const stockValue =
    allProducts?.reduce((sum, p) => sum + p.stock * Number(p.cost), 0) || 0;

  return (
    <AppShell>
      <DashboardClient
        profile={profile!}
        lowStock={lowStock || []}
        todayTotal={todayTotal}
        todayCount={todayCount}
        productCount={productCount || 0}
        stockValue={stockValue}
      />
    </AppShell>
  );
}
