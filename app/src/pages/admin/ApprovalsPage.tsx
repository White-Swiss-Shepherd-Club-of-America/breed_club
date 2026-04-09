/**
 * Consolidated approvals page — tabs for Applications, Dogs, Health, Transfers.
 */

import { useState } from "react";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { ApplicationsPanel } from "./ApplicationsPage";
import { DogQueuePanel } from "./DogQueuePage";
import { HealthQueuePanel } from "./HealthQueuePage";
import { TransferQueuePanel } from "./TransferQueuePage";
import { LitterQueuePanel } from "./LitterQueuePage";

type Tab = "applications" | "dogs" | "health" | "litters" | "transfers";

const TAB_DEFS: { key: Tab; label: string; permission: "members" | "clearances" }[] = [
  { key: "applications", label: "Applications", permission: "members" },
  { key: "dogs", label: "Dogs", permission: "clearances" },
  { key: "health", label: "Health", permission: "clearances" },
  { key: "litters", label: "Litters", permission: "clearances" },
  { key: "transfers", label: "Transfers", permission: "clearances" },
];

export function ApprovalsPage() {
  const { member } = useCurrentMember();
  const isAdmin = member?.is_admin === true || (member?.tierLevel ?? 0) >= 100;
  const canApproveMembers = isAdmin || member?.can_approve_members;
  const canApproveClearances = isAdmin || member?.can_approve_clearances;

  const visibleTabs = TAB_DEFS.filter((t) =>
    t.permission === "members" ? canApproveMembers : canApproveClearances
  );

  const [tab, setTab] = useState<Tab>(visibleTabs[0]?.key ?? "applications");

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Approvals</h1>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "applications" && <ApplicationsPanel />}
      {tab === "dogs" && <DogQueuePanel />}
      {tab === "health" && <HealthQueuePanel />}
      {tab === "litters" && <LitterQueuePanel />}
      {tab === "transfers" && <TransferQueuePanel />}
    </div>
  );
}
