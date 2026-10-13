"use client";
import clsx from "clsx";
import { Award, BarChart3, Briefcase, FileText, LayoutDashboard, LogOut, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { User } from "@/types";
import { Spinner } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", Icon: Briefcase },
  { href: "/candidates", label: "Candidates", Icon: Users },
  { href: "/shortlisted", label: "Shortlisted", Icon: Award },
  { href: "/reports", label: "Reports", Icon: FileText },
  { href: "/compare", label: "Compare", Icon: BarChart3 },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!user) return <Spinner label="Checking your session..." />;

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
  };

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-4">
          <div className="text-base font-bold text-slate-900">ResumeVerify</div>
          <div className="text-xs text-slate-500">Evidence-based screening</div>
        </div>
        <nav className="flex-1 space-y-0.5 px-2" aria-label="Main">
          {NAV.map(({ href, label, Icon }) => {
            const active = href === "/" ? path === "/" : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={clsx("flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium", active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100")}>
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <div className="truncate px-2 text-sm font-medium text-slate-800">{user.name}</div>
          <div className="truncate px-2 text-xs text-slate-500">{user.email}</div>
          <button onClick={logout} className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
