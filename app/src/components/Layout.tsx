/**
 * Main app layout with navigation sidebar.
 */

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
  Shield,
  LogIn,
  BookOpen,
  Search,
  BarChart3,
  HeartPulse,
  Plus,
} from "lucide-react";

export function Layout() {
  const { member } = useCurrentMember();
  const { data: clubData } = useClub();
  const location = useLocation();

  const club = clubData?.club;
  const isAdmin = member?.tier === "admin";
  const canApproveMembers = isAdmin || member?.can_approve_members;
  const canApproveClearances = isAdmin || member?.can_approve_clearances;

  const isCertificateOrHigher = member && ["certificate", "member", "admin"].includes(member.tier);
  const isMemberOrHigher = member && ["member", "admin"].includes(member.tier);

  const navItems = [
    { to: "/", label: "Home", icon: Home, show: true },
    { to: "/dashboard", label: "Dashboard", icon: Home, show: !!member },
    { to: "/registry", label: "Dog Registry", icon: PawPrint, show: !!isCertificateOrHigher },
    { to: "/search", label: "Search Dogs", icon: Search, show: !!isMemberOrHigher },
    { to: "/health-stats", label: "Health Statistics", icon: BarChart3, show: !!isMemberOrHigher },
    { to: "/directory", label: "Breeder Directory", icon: Users, show: true },
    { to: "/apply", label: "Apply for Membership", icon: UserPlus, show: !!member && member.tier === "non_member" },
    { to: "/profile", label: "Profile", icon: Settings, show: !!member },
  ];

  const adminItems = [
    { to: "/admin", label: "Admin Dashboard", icon: Shield, show: isAdmin },
    { to: "/admin/members", label: "Members", icon: Users, show: isAdmin },
    { to: "/admin/applications", label: "Applications", icon: ClipboardCheck, show: canApproveMembers },
    { to: "/admin/dogs/pending", label: "Dog Approvals", icon: PawPrint, show: canApproveClearances },
    { to: "/admin/health/pending", label: "Health Queue", icon: ClipboardCheck, show: canApproveClearances },
    { to: "/admin/health-tests", label: "Health Tests", icon: HeartPulse, show: isAdmin },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav bar */}
      <header
        className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between"
        style={{ borderTopColor: club?.primary_color || "#655e7a", borderTopWidth: "3px" }}
      >
        <div className="flex items-center gap-3">
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
          <aside className="w-56 bg-white border-r border-gray-200 min-h-[calc(100vh-57px)] p-4">
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

              {isCertificateOrHigher && (
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
                    to="/health"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition text-gray-600 hover:bg-gray-50 hover:text-gray-900 mt-1"
                  >
                    <HeartPulse className="h-4 w-4" />
                    Add Health Clearance
                  </Link>
                  {member?.is_breeder && (
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

              {(isAdmin || canApproveMembers || canApproveClearances) && (
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
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
