/**
 * Member voting page — list elections grouped by status.
 */

import { useNavigate } from "react-router-dom";
import { useElections } from "@/hooks/useVoting";
import type { Election, ElectionStatus } from "@breed-club/shared";
import { Vote, BarChart3, Clock, CheckCircle2 } from "lucide-react";

const STATUS_STYLES: Record<ElectionStatus, string> = {
  upcoming: "bg-blue-100 text-blue-700",
  open: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

function ElectionCard({ election }: { election: Election }) {
  const navigate = useNavigate();
  const status = election.status ?? "upcoming";
  const allVoted = election.questions?.every((q) => q.has_voted) ?? false;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:border-gray-300 transition">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="font-semibold text-gray-900">{election.title}</h3>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[status]}`}>
              {status}
            </span>
          </div>
          {election.description && (
            <p className="text-sm text-gray-500 mb-3">{election.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>Opens: {new Date(election.starts_at).toLocaleString()}</span>
            <span>Closes: {new Date(election.ends_at).toLocaleString()}</span>
            <span>{election.questions?.length ?? 0} question(s)</span>
          </div>
        </div>

        <div className="ml-4">
          {status === "open" && !allVoted && (
            <button
              onClick={() => navigate(`/voting/${election.id}`)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition"
            >
              <Vote className="h-4 w-4" />
              Vote Now
            </button>
          )}
          {status === "open" && allVoted && (
            <span className="flex items-center gap-1 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Voted
            </span>
          )}
          {status === "closed" && (
            <button
              onClick={() => navigate(`/voting/${election.id}/results`)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              <BarChart3 className="h-4 w-4" />
              Results
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function VotingPage() {
  const { data: elections, isLoading } = useElections();

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      </div>
    );
  }

  const all = elections ?? [];
  const open = all.filter((e: Election) => e.status === "open");
  const upcoming = all.filter((e: Election) => e.status === "upcoming");
  const closed = all.filter((e: Election) => e.status === "closed");

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Voting</h1>

      {all.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Clock className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No elections available at this time.</p>
        </div>
      )}

      {open.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-green-700 uppercase tracking-wider mb-3">
            Open for Voting
          </h2>
          <div className="space-y-3">
            {open.map((e: Election) => (
              <ElectionCard key={e.id} election={e} />
            ))}
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-blue-700 uppercase tracking-wider mb-3">
            Upcoming
          </h2>
          <div className="space-y-3">
            {upcoming.map((e: Election) => (
              <ElectionCard key={e.id} election={e} />
            ))}
          </div>
        </div>
      )}

      {closed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Closed
          </h2>
          <div className="space-y-3">
            {closed.map((e: Election) => (
              <ElectionCard key={e.id} election={e} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
