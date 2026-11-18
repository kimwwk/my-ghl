"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Invoices", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/invoices") : path.startsWith(href));
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-border bg-sidebar md:w-56 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-4 px-4 py-3 md:block md:px-5 md:py-6">
          <Link href="/" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/logo" alt="Kivov Digital" className="h-7 w-auto md:h-9" />
          </Link>
          <p className="label-mono hidden pt-3 md:block">Invoices</p>
          <nav className="flex gap-1 md:mt-6 md:flex-col">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted",
                  active(n.href) && "bg-secondary text-inkdeep",
                )}
              >
                <n.icon className="size-4" />
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
