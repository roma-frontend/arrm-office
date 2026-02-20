"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { CalendarDays, BarChart3, Settings } from "lucide-react";

const routes = [
  {
    label: "Dashboard",
    icon: CalendarDays,
    href: "/dashboard",
  },
  {
    label: "Analytics",
    icon: BarChart3,
    href: "/analytics",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden w-64 flex-col border-r bg-card p-4 lg:flex">
      <div className="mb-8 px-2 text-xl font-bold">LeaveMaster</div>
      <nav className="space-y-2">
        {routes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              pathname === route.href
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent"
            )}
          >
            <route.icon className="h-4 w-4" />
            {route.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}