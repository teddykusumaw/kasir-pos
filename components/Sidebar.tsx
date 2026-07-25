"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  FileText,
  Users,
  LogOut,
  Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/types/database";
import { cn } from "@/lib/utils";

interface SidebarProps {
  profile: Profile;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "cashier"] },
  { href: "/pos", label: "Kasir / POS", icon: ShoppingCart, roles: ["admin", "cashier"] },
  { href: "/products", label: "Produk", icon: Package, roles: ["admin"] },
  { href: "/warehouse", label: "Warehouse", icon: Warehouse, roles: ["admin", "cashier"] },
  { href: "/reports", label: "Laporan", icon: FileText, roles: ["admin", "cashier"] },
  { href: "/users", label: "Pengguna", icon: Users, roles: ["admin"] },
  { href: "/settings", label: "Pengaturan", icon: Settings, roles: ["admin", "cashier"] },
];

export default function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const filteredNav = navItems.filter((item) =>
    item.roles.includes(profile.role)
  );

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-slate-900 text-white flex flex-col">
      <div className="p-5 border-b border-slate-700">
        <h1 className="text-xl font-bold tracking-tight">Kasir POS</h1>
        <p className="text-xs text-slate-400 mt-1">Sistem Kasir & Warehouse</p>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <div className="mb-3 px-2">
          <p className="text-sm font-medium truncate">{profile.full_name}</p>
          <p className="text-xs text-slate-400 capitalize">{profile.role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors"
        >
          <LogOut size={18} />
          Keluar
        </button>
      </div>
    </aside>
  );
}
