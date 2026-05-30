import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  Building2,
  Inbox,
  Mail,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  UserPlus,
  FileText,
  Tags,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";

type NavItem = {
  to?: string;
  href?: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
  badge?: boolean;
  dot?: "blue" | "amber";
};

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: Home, exact: true },
  { to: "/vendors", label: "Vendors", icon: Building2 },
  { to: "/pending", label: "Pending Registrations", icon: Inbox, badge: true },
  { to: "/invite", label: "Invite Vendor", icon: UserPlus },
  { to: "/outreach", label: "Outreach", icon: Mail },
  { to: "/rfq", label: "RFQ - Supplies", icon: FileText, dot: "blue" },
  { href: "https://sarooj-procurement-subcontractors.vercel.app/", label: "RFQ Subcontractors", icon: FileText },
  { to: "/categories", label: "Categories", icon: Tags },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

function usePendingCount() {
  return useQuery({
    queryKey: ["pending-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("vendors")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending_review");
      return count ?? 0;
    },
    refetchInterval: 30000,
  });
}

export function AppSidebar() {
  const { user } = useAuth();
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: pendingCount = 0 } = usePendingCount();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  const sidebarContent = (
    <>
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--sidebar-primary)" }}
          />
          <span className="font-display text-[18px] text-white">Sarooj Procurement</span>
        </div>
        {user?.email && (
          <p className="mt-2 text-xs" style={{ color: "var(--sidebar-foreground)" }}>
            {user.email}
          </p>
        )}
      </div>
      <nav className="flex-1 px-2">
        {NAV.map((item) => {
          const Icon = item.icon;

          if (item.href) {
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="group mb-1 flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--sidebar-foreground)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </a>
            );
          }

          const active = isActive(item.to!, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to as string}
              onClick={() => setMobileOpen(false)}
              className="group mb-1 flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: active ? "var(--sidebar-primary)" : "transparent",
                color: active ? "white" : "var(--sidebar-foreground)",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span className="flex items-center gap-3">
                <Icon className="h-4 w-4" />
                {item.label}
                {item.dot === "blue" && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#60A5FA" }} />
                )}
                {item.dot === "amber" && (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
                )}
              </span>
              {item.badge && pendingCount > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: active ? "rgba(255,255,255,0.2)" : "var(--sidebar-primary)",
                    color: "white",
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
          style={{ color: "var(--sidebar-foreground)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div
        className="flex h-14 items-center justify-between px-4 md:hidden"
        style={{ backgroundColor: "var(--sidebar)" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--sidebar-primary)" }} />
          <span className="font-display text-base text-white">Sarooj Procurement</span>
        </div>
        <button onClick={() => setMobileOpen((o) => !o)} className="text-white">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-x-0 top-14 bottom-0 z-40 flex flex-col md:hidden"
          style={{ backgroundColor: "var(--sidebar)" }}
        >
          {sidebarContent}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 hidden w-60 flex-col md:flex"
        style={{ backgroundColor: "var(--sidebar)" }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}