import { createClient } from "@/lib/supabase/server";
import { Profile } from "@/types/database";
import { redirect } from "next/navigation";

export async function getCurrentUser(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}

export async function requireAuth() {
  const profile = await getCurrentUser();
  if (!profile) {
    redirect("/login");
  }
  return profile;
}

export async function requireAdmin() {
  const profile = await requireAuth();
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }
  return profile;
}
