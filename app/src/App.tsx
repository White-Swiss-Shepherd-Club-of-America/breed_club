import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { HomePage } from "@/pages/HomePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ApplyPage } from "@/pages/ApplyPage";
import { SettingsPage as UserSettingsPage } from "@/pages/SettingsPage";
import { DirectoryPage } from "@/pages/DirectoryPage";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { MembersPage } from "@/pages/admin/MembersPage";
import { HealthTestsPage } from "@/pages/admin/HealthTestsPage";
import { ApprovalsPage } from "@/pages/admin/ApprovalsPage";
import { AdminLittersPage } from "@/pages/admin/AdminLittersPage";
import { OrganizationsPage } from "@/pages/admin/OrganizationsPage";
import { RegistryPage } from "@/pages/RegistryPage";
import { DogCreatePage } from "@/pages/DogCreatePage";
import { DogDetailPage } from "@/pages/DogDetailPage";
import { DogEditPage } from "@/pages/DogEditPage";
import { HealthPage } from "@/pages/HealthPage";
import { HealthSelectPage } from "@/pages/HealthSelectPage";
import { LittersPage } from "@/pages/LittersPage";
import { LitterCreatePage } from "@/pages/LitterCreatePage";
import { LitterDetailPage } from "@/pages/LitterDetailPage";
import { AnnouncementsPage } from "@/pages/AnnouncementsPage";
import { PublicApplyPage } from "@/pages/PublicApplyPage";
import { HealthStatsPage } from "@/pages/HealthStatsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { EmbedApplyPage } from "@/pages/EmbedApplyPage";
import { SettingsPage as AdminSettingsPage } from "@/pages/admin/SettingsPage";
import { AcceptInvitationPage } from "@/pages/AcceptInvitationPage";
import { VotingTiersPage } from "@/pages/admin/VotingTiersPage";
import { ElectionsPage } from "@/pages/admin/ElectionsPage";
import { ElectionDetailPage } from "@/pages/admin/ElectionDetailPage";
import { VotingPage } from "@/pages/VotingPage";
import { ElectionVotePage } from "@/pages/ElectionVotePage";
import { ElectionResultsPage } from "@/pages/ElectionResultsPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");
}

export function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Embed route — no Layout, no auth */}
            <Route path="/embed/apply" element={<EmbedApplyPage />} />

            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/directory" element={<DirectoryPage />} />
              <Route path="/announcements" element={<AnnouncementsPage />} />
              <Route path="/public/apply" element={<PublicApplyPage />} />
              <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
              <Route
                path="/register"
                element={
                  <ProtectedRoute>
                    <RegisterPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/apply"
                element={
                  <ProtectedRoute>
                    <ApplyPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/profile" element={<Navigate to="/settings" replace />} />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <UserSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute minLevel={100}>
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/members"
                element={
                  <ProtectedRoute minLevel={100}>
                    <MembersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/approvals"
                element={
                  <ProtectedRoute minLevel={20}>
                    <ApprovalsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/litters"
                element={
                  <ProtectedRoute minLevel={20}>
                    <AdminLittersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/health-tests"
                element={
                  <ProtectedRoute minLevel={100}>
                    <HealthTestsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/organizations"
                element={
                  <ProtectedRoute minLevel={100}>
                    <OrganizationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute minLevel={100}>
                    <AdminSettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/voting-tiers"
                element={
                  <ProtectedRoute minLevel={100}>
                    <VotingTiersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/elections"
                element={
                  <ProtectedRoute minLevel={100}>
                    <ElectionsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/elections/:id"
                element={
                  <ProtectedRoute minLevel={100}>
                    <ElectionDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/voting"
                element={
                  <ProtectedRoute minLevel={10}>
                    <VotingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/voting/:id"
                element={
                  <ProtectedRoute minLevel={10}>
                    <ElectionVotePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/voting/:id/results"
                element={
                  <ProtectedRoute minLevel={10}>
                    <ElectionResultsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/registry"
                element={
                  <ProtectedRoute minLevel={20}>
                    <RegistryPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/search" element={<Navigate to="/registry" replace />} />
              <Route
                path="/health-stats"
                element={
                  <ProtectedRoute minLevel={20}>
                    <HealthStatsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dogs/register"
                element={
                  <ProtectedRoute minLevel={1}>
                    <DogCreatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dogs/:id"
                element={
                  <ProtectedRoute minLevel={1}>
                    <DogDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dogs/:id/edit"
                element={
                  <ProtectedRoute minLevel={20} flag="can_approve_clearances">
                    <DogEditPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/health"
                element={
                  <ProtectedRoute minLevel={1}>
                    <HealthSelectPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/health/:dogId"
                element={
                  <ProtectedRoute minLevel={1}>
                    <HealthPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/litters"
                element={
                  <ProtectedRoute minLevel={10} flag="is_breeder">
                    <LittersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/litters/new"
                element={
                  <ProtectedRoute minLevel={10} flag="is_breeder">
                    <LitterCreatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/litters/:id"
                element={
                  <ProtectedRoute minLevel={10} flag="is_breeder">
                    <LitterDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
