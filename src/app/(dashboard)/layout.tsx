import { Sidebar } from "@/components/layout/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Get actual revierId from user's session / last visited
  const revierId = "demo";

  return (
    <div className="flex h-screen w-full">
      <Sidebar revierId={revierId} />
      <main className="flex-1 flex flex-col min-w-0 relative">{children}</main>
    </div>
  );
}
