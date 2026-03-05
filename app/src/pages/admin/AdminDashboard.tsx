/**
 * Admin dashboard — overview with queue counts.
 */

import { Link } from "react-router-dom";
import { useApplicationQueue } from "@/hooks/useApplications";
import { useAdminMembers } from "@/hooks/useAdmin";
import { Users, ClipboardCheck, Settings, Heart, Dog, ArrowRightLeft, Shield } from "lucide-react";

export function AdminDashboard() {
  const { data: appQueue } = useApplicationQueue("submitted");
  const { data: membersData } = useAdminMembers();

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link
          to="/admin/members"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
        >
          <Users className="h-8 w-8 text-gray-400 mb-3" />
          <h3 className="font-semibold text-gray-900">Members</h3>
          <p className="mt-1 text-2xl font-bold text-gray-700">
            {membersData?.meta?.total ?? "—"}
          </p>
          <p className="text-sm text-gray-500">Total members</p>
        </Link>

        <Link
          to="/admin/applications"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
        >
          <ClipboardCheck className="h-8 w-8 text-gray-400 mb-3" />
          <h3 className="font-semibold text-gray-900">Applications</h3>
          <p className="mt-1 text-2xl font-bold text-yellow-600">
            {appQueue?.meta?.total ?? "—"}
          </p>
          <p className="text-sm text-gray-500">Pending review</p>
        </Link>

        <Link
          to="/admin/cert-versions"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
        >
          <Shield className="h-8 w-8 text-blue-400 mb-3" />
          <h3 className="font-semibold text-gray-900">Cert Versions</h3>
          <p className="mt-1 text-sm text-gray-500">
            Health testing standard versions
          </p>
        </Link>
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-4">Approval Queues</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/admin/dogs/pending"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
        >
          <Dog className="h-8 w-8 text-purple-400 mb-3" />
          <h3 className="font-semibold text-gray-900">Pending Dogs</h3>
          <p className="text-sm text-gray-500">Review and approve dog registrations</p>
        </Link>

        <Link
          to="/admin/health/pending"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
        >
          <Heart className="h-8 w-8 text-red-400 mb-3" />
          <h3 className="font-semibold text-gray-900">Health Clearances</h3>
          <p className="text-sm text-gray-500">Verify submitted health clearances</p>
        </Link>

        <Link
          to="/admin/transfers/pending"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
        >
          <ArrowRightLeft className="h-8 w-8 text-orange-400 mb-3" />
          <h3 className="font-semibold text-gray-900">Ownership Transfers</h3>
          <p className="text-sm text-gray-500">Review pending ownership transfers</p>
        </Link>
      </div>
    </div>
  );
}
