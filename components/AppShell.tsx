import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "./Sidebar";

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentUser();
  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar profile={profile} />
      <main className="flex-1 ml-64 p-6 lg:p-8">{children}</main>
    </div>
  );
}
