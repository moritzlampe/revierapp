import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { RevierProvider } from "@/lib/context/revier-context";
import type { Revier } from "@/lib/types/revier";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Profil laden für den Usernamen
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  // Erstes Revier des Users laden
  const { data: revier } = await supabase
    .from("reviere")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!revier) {
    redirect("/revier-anlegen");
  }

  return (
    <RevierProvider initialRevier={revier as Revier}>
      <div className="flex h-screen w-full">
        <Sidebar
          revierId={revier.id}
          userName={profile?.name ?? user.email ?? ""}
        />
        <main className="flex-1 flex flex-col min-w-0 relative">{children}</main>
      </div>
    </RevierProvider>
  );
}
