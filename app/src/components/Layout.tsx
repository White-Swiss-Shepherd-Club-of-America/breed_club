/**
 * Main app layout with navigation sidebar.
 */

import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { SignedIn, SignedOut, UserButton, SignInButton } from "@clerk/clerk-react";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { useClub } from "@/hooks/useClub";
import {
  Home,
  PawPrint,
  ClipboardCheck,
  Users,
  UserPlus,
  Settings,
  LogIn,
  BarChart3,
  HeartPulse,
  Plus,
  Menu,
  X,
  Building2,
  Vote,
  List,
} from "lucide-react";

export function Layout() {
  const { member } = useCurrentMember();
  const { data: clubData } = useClub();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiVersion, setApiVersion] = useState<string>("...");
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`${import.meta.env.VITE_API_URL ?? "/api"}/version`)
      .then((r) => r.json())
      .then((data: { version?: string }) => setApiVersion(data.version ?? "?"))
      .catch(() => setApiVersion("?"));
  }, []);

  // Close mobile sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const club = clubData?.club;
  const tierLevel = member?.tierLevel ?? 0;
  const isAdmin = !!member && (member.is_admin === true || tierLevel >= 100);
  const canApproveMembers = isAdmin || member?.can_approve_members;
  const canApproveClearances = isAdmin || member?.can_approve_clearances;
  const canManageRegistry = isAdmin || member?.can_manage_registry;

  const isMemberOrHigher = member && tierLevel >= 20;

  const navItems = [
    { to: "/", label: "Home", icon: Home, show: true },
    { to: "/registry", label: "Dog Registry", icon: PawPrint, show: !!isMemberOrHigher },
    { to: "/health/clearances", label: "My Health Clearances", icon: HeartPulse, show: !!member },
    { to: "/health-stats", label: "Health Statistics", icon: BarChart3, show: !!isMemberOrHigher },
    { to: "/directory", label: "Breeder Directory", icon: Users, show: true },
    { to: "/voting", label: "Voting", icon: Vote, show: !!isMemberOrHigher },
    { to: "/apply", label: "Apply for Membership", icon: UserPlus, show: !!member && tierLevel <= 1 },
    { to: "/settings", label: "Settings", icon: Settings, show: !!member },
  ];

  const adminItems = [
    { to: "/admin/members", label: "Members", icon: Users, show: isAdmin },
    { to: "/admin/approvals", label: "Approvals", icon: ClipboardCheck, show: canApproveClearances || canApproveMembers },
    { to: "/admin/litters", label: "Litters", icon: List, show: canApproveClearances },
    { to: "/admin/health-tests", label: "Health", icon: HeartPulse, show: isAdmin },
    { to: "/admin/organizations", label: "Organizations", icon: Building2, show: isAdmin },
    { to: "/admin/elections", label: "Elections", icon: Vote, show: isAdmin },
    { to: "/admin/settings", label: "Settings", icon: Settings, show: isAdmin },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav bar */}
      <header
        className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between"
        style={{ borderTopColor: club?.primary_color || "#655e7a", borderTopWidth: "3px" }}
      >
        <div className="flex items-center gap-3">
          <SignedIn>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden p-1 -ml-1 text-gray-600 hover:text-gray-900"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SignedIn>
          {club?.logo_url && (
            <img src={club.logo_url} alt={club.name} className="h-8 w-8 rounded" />
          )}
          <Link to="/" className="font-semibold text-lg text-gray-900">
            {club?.name || "Breed Club Manager"}
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition">
                <LogIn className="h-4 w-4" />
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <SignedIn>
          {/* Mobile backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <aside
            className={`
              fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 p-4 transition-transform duration-200 ease-in-out
              ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
              md:static md:translate-x-0 md:z-auto md:w-56 md:min-h-[calc(100vh-57px)]
            `}
          >
            {/* Mobile close button */}
            <div className="flex items-center justify-between mb-4 md:hidden">
              <span className="font-semibold text-sm text-gray-900">Menu</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 text-gray-600 hover:text-gray-900"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="space-y-1">
              {navItems
                .filter((item) => item.show)
                .map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                        isActive
                          ? "bg-gray-100 text-gray-900 font-medium"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}

              {member && (
                <>
                  <div className="border-t border-gray-200 my-3" />
                  <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Quick Actions
                  </p>
                  <Link
                    to="/dogs/register"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition bg-gray-900 text-white hover:bg-gray-800 mt-1"
                  >
                    <Plus className="h-4 w-4" />
                    Register Dog
                  </Link>
                  <Link
                    to="/health/clearances?add=1"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition text-gray-600 hover:bg-gray-50 hover:text-gray-900 mt-1"
                  >
                    <HeartPulse className="h-4 w-4" />
                    Add Health Clearance
                  </Link>
                  {isMemberOrHigher && member?.is_breeder && (
                    <Link
                      to="/litters"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition text-gray-600 hover:bg-gray-50 hover:text-gray-900 mt-1"
                    >
                      <PawPrint className="h-4 w-4" />
                      My Litters
                    </Link>
                  )}
                </>
              )}

              {(isAdmin || canApproveMembers || canApproveClearances || canManageRegistry) && (
                <>
                  <div className="border-t border-gray-200 my-3" />
                  <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Admin
                  </p>
                  {adminItems
                    .filter((item) => item.show)
                    .map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.to;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                            isActive
                              ? "bg-gray-100 text-gray-900 font-medium"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      );
                    })}
                </>
              )}
            </nav>
          </aside>
        </SignedIn>

        {/* Main content */}
        <main className="flex-1 p-6 flex flex-col min-h-[calc(100vh-57px)]">
          <div className="flex-1">
            <Outlet />
          </div>
          <footer className="mt-8 pt-2 border-t border-gray-100 text-center text-xs text-gray-400">
            app v{__APP_VERSION__} · api v{apiVersion}
          </footer>
        </main>
      </div>
    </div>
  );
}
