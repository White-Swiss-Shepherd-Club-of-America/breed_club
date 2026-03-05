import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { HomePage } from "@/pages/HomePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ApplyPage } from "@/pages/ApplyPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { DirectoryPage } from "@/pages/DirectoryPage";
import { AdminDashboard } from "@/pages/admin/AdminDashboard";
import { MembersPage } from "@/pages/admin/MembersPage";
import { HealthTestsPage } from "@/pages/admin/HealthTestsPage";
import { ApprovalsPage } from "@/pages/admin/ApprovalsPage";
import { OrganizationsPage } from "@/pages/admin/OrganizationsPage";
import { RegistryPage } from "@/pages/RegistryPage";
import { DogCreatePage } from "@/pages/DogCreatePage";
import { DogDetailPage } from "@/pages/DogDetailPage";
import { DogEditPage } from "@/pages/DogEditPage";
import { HealthPage } from "@/pages/HealthPage";
import { HealthSelectPage } from "@/pages/HealthSelectPage";
import { LittersPage } from "@/pages/LittersPage";
import { LitterDetailPage } from "@/pages/LitterDetailPage";
import { AnnouncementsPage } from "@/pages/AnnouncementsPage";
import { PublicApplyPage } from "@/pages/PublicApplyPage";
import { HealthStatsPage } from "@/pages/HealthStatsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { EmbedApplyPage } from "@/pages/EmbedApplyPage";
import { SettingsPage } from "@/pages/admin/SettingsPage";

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
              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute minTier="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/members"
                element={
                  <ProtectedRoute minTier="admin">
                    <MembersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/approvals"
                element={
                  <ProtectedRoute minTier="member">
                    <ApprovalsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/health-tests"
                element={
                  <ProtectedRoute minTier="admin">
                    <HealthTestsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/organizations"
                element={
                  <ProtectedRoute minTier="admin">
                    <OrganizationsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute minTier="admin">
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/registry"
                element={
                  <ProtectedRoute minTier="member">
                    <RegistryPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/search" element={<Navigate to="/registry" replace />} />
              <Route
                path="/health-stats"
                element={
                  <ProtectedRoute minTier="member">
                    <HealthStatsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dogs/register"
                element={
                  <ProtectedRoute minTier="certificate">
                    <DogCreatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dogs/:id"
                element={
                  <ProtectedRoute minTier="certificate">
                    <DogDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dogs/:id/edit"
                element={
                  <ProtectedRoute minTier="member" flag="can_approve_clearances">
                    <DogEditPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/health"
                element={
                  <ProtectedRoute minTier="certificate">
                    <HealthSelectPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/health/:dogId"
                element={
                  <ProtectedRoute minTier="certificate">
                    <HealthPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/litters"
                element={
                  <ProtectedRoute minTier="certificate" flag="is_breeder">
                    <LittersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/litters/:id"
                element={
                  <ProtectedRoute minTier="certificate" flag="is_breeder">
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
