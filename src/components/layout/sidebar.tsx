"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Map,
  FileText,
  Eye,
  Users,
  ClipboardList,
  PlayCircle,
  Calendar,
  Settings,
} from "lucide-react";
import { RevierSwitcher } from "./revier-switcher";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  section?: string;
};

const navItems: NavItem[] = [
  { label: "Revierkarte", href: "", icon: Map, section: "Revier" },
  { label: "Streckenbuch", href: "/strecke", icon: FileText, badge: 12 },
  { label: "Beobachtungen", href: "/beobachtungen", icon: Eye, badge: 5 },
  { label: "Jagdgäste", href: "/gaeste", icon: Users },
  { label: "Jagderlaubnisse", href: "/jes", icon: ClipboardList, badge: 4 },
  { label: "Drückjagd", href: "/drueckjagd", icon: PlayCircle },
  {
    label: "Jagdkalender",
    href: "/kalender",
    icon: Calendar,
    section: "Verwaltung",
  },
  { label: "Einstellungen", href: "/settings", icon: Settings },
];

export function Sidebar({ revierId }: { revierId: string }) {
  const pathname = usePathname();
  const basePath = `/revier/${revierId}`;

  return (
    <aside className="flex w-[240px] flex-col flex-shrink-0 bg-ra-green-900 text-white z-10">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-3.5 border-b border-white/8">
        <div className="w-8 h-8 rounded-lg bg-ra-green-500 flex items-center justify-center text-base">
          🌲
        </div>
        <div className="text-[17px] font-bold tracking-tight">
          Revier<span className="text-ra-green-500">App</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-px px-2 pt-1">
        {navItems.map((item) => {
          const fullHref = `${basePath}${item.href}`;
          const isActive =
            item.href === ""
              ? pathname === basePath || pathname === `${basePath}/`
              : pathname.startsWith(fullHref);

          return (
            <div key={item.label}>
              {item.section && (
                <div className="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  {item.section}
                </div>
              )}
              <Link
                href={fullHref}
                className={`flex items-center gap-2.5 px-3 py-[9px] rounded-lg text-[13px] font-medium transition-all duration-100 select-none ${
                  isActive
                    ? "bg-ra-green-500/18 text-white"
                    : "text-white/55 hover:bg-white/[0.06] hover:text-white/85"
                }`}
              >
                <item.icon
                  className={`w-[18px] h-[18px] flex-shrink-0 ${
                    isActive ? "opacity-100 text-ra-green-500" : "opacity-60"
                  }`}
                />
                {item.label}
                {item.badge != null && (
                  <span className="ml-auto bg-ra-green-600 text-[10px] px-[7px] py-0.5 rounded-[10px] font-semibold">
                    {item.badge}
                  </span>
                )}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Revier Switcher */}
      <RevierSwitcher />
    </aside>
  );
}
