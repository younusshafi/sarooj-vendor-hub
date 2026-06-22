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
  ClipboardList,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
  badge?: boolean;
  dot?: "blue" | "amber";
  search?: Record<string, unknown>;
};

/* ── Top-level items ── */
const TOP_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: Home, exact: true },
  { to: "/prs", label: "PR Tracker", icon: ClipboardList, dot: "amber" },
];

/* RFQ group children (unified tracker, filtered by type) */
const RFQ_CHILDREN: NavItem[] = [
  { to: "/rfq", label: "Materials RFQs", icon: FileText, search: { type: "materials" } },
  { to: "/rfq", label: "Subcontractor RFQs", icon: FileText, search: { type: "subcontractor" } },
];

/* Vendor group children */
const VENDOR_CHILDREN: NavItem[] = [
  { to: "/vendors", label: "Vendor List", icon: Building2 },
  { to: "/pending", label: "Pending Registrations", icon: Inbox, badge: true },
  { to: "/invite", label: "Invite Vendor", icon: UserPlus },
  { to: "/outreach", label: "Outreach", icon: Mail },
];

/* ── Bottom items ── */
const BOTTOM_NAV: NavItem[] = [
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
  const currentSearch = useRouterState({
    select: (s) => s.location.search as Record<string, unknown>,
  });
  const currentType = typeof currentSearch.type === "string" ? currentSearch.type : "";
  const { data: pendingCount = 0 } = usePendingCount();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  const vendorGroupActive = VENDOR_CHILDREN.some((c) => isActive(c.to, c.exact));
  const [vendorOpen, setVendorOpen] = useState(vendorGroupActive);

  const rfqGroupActive = path === "/rfq" || path.startsWith("/rfq/");
  const [rfqOpen, setRfqOpen] = useState(rfqGroupActive);

  /* Shared link renderer for flat nav items */
  function NavLink({ item }: { item: NavItem }) {
    const Icon = item.icon;
    const active = item.search
      ? isActive(item.to, item.exact) && currentType === (item.search.type as string)
      : isActive(item.to, item.exact);
    return (
      <Link
        to={item.to}
        search={item.search}
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
  }

  const sidebarContent = (
    <>
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--sidebar-accent)" }}
          />
          <span className="font-display text-[18px] text-white">Sarooj Procurement</span>
        </div>
        {user?.email && (
          <p className="mt-2 text-xs" style={{ color: "var(--sidebar-border)" }}>
            {user.email}
          </p>
        )}
      </div>
      <nav className="flex-1 px-2">
        {/* Top-level: Dashboard, PR Tracker, RFQ */}
        {TOP_NAV.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}

        {/* RFQ group: unified tracker filtered by type */}
        <Collapsible open={rfqOpen || rfqGroupActive} onOpenChange={setRfqOpen}>
          <CollapsibleTrigger asChild>
            <button
              className="group mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: rfqGroupActive ? "var(--sidebar-primary)" : "transparent",
                color: rfqGroupActive ? "white" : "var(--sidebar-foreground)",
              }}
              onMouseEnter={(e) => {
                if (!rfqGroupActive)
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                if (!rfqGroupActive) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span className="flex items-center gap-3">
                <FileText className="h-4 w-4" />
                RFQ
              </span>
              <ChevronRight
                className="h-3.5 w-3.5 transition-transform duration-200"
                style={{
                  transform: rfqOpen || rfqGroupActive ? "rotate(90deg)" : "rotate(0deg)",
                  opacity: 0.6,
                }}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-3 border-l border-white/10 pl-2">
              {RFQ_CHILDREN.map((item) => (
                <NavLink key={item.label} item={item} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Collapsible Vendors group */}
        <Collapsible open={vendorOpen || vendorGroupActive} onOpenChange={setVendorOpen}>
          <CollapsibleTrigger asChild>
            <button
              className="group mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: vendorGroupActive ? "var(--sidebar-primary)" : "transparent",
                color: vendorGroupActive ? "white" : "var(--sidebar-foreground)",
              }}
              onMouseEnter={(e) => {
                if (!vendorGroupActive)
                  e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                if (!vendorGroupActive) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <span className="flex items-center gap-3">
                <Building2 className="h-4 w-4" />
                Vendors
              </span>
              <span className="flex items-center gap-2">
                {!(vendorOpen || vendorGroupActive) && pendingCount > 0 && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: vendorGroupActive
                        ? "rgba(255,255,255,0.2)"
                        : "var(--sidebar-primary)",
                      color: "white",
                    }}
                  >
                    {pendingCount}
                  </span>
                )}
                <ChevronRight
                  className="h-3.5 w-3.5 transition-transform duration-200"
                  style={{
                    transform: vendorOpen || vendorGroupActive ? "rotate(90deg)" : "rotate(0deg)",
                    opacity: 0.6,
                  }}
                />
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-3 border-l border-white/10 pl-2">
              {VENDOR_CHILDREN.map((item) => (
                <NavLink key={item.to} item={item} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Bottom: Categories, Settings */}
        {BOTTOM_NAV.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}
      </nav>
      <div className="p-3 space-y-2">
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
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--sidebar-accent)" }}
          />
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
