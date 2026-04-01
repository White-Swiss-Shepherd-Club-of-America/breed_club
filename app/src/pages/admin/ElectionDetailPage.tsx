/**
 * Admin election detail page — view participation, results, toggle results visibility.
 */

import { useParams, useNavigate } from "react-router-dom";
import {
  useElection,
  useElectionResults,
  useElectionParticipation,
  useUpdateElection,
} from "@/hooks/useVoting";
import type { ElectionStatus } from "@breed-club/shared";
import { ArrowLeft, Eye, EyeOff, Users, BarChart3 } from "lucide-react";

const STATUS_STYLES: Record<ElectionStatus, string> = {
  upcoming: "bg-blue-100 text-blue-700",
  open: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

export function ElectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: election, isLoading } = useElection(id!);
  const status = election?.status ?? "upcoming";
  const canShowResults = status === "closed" || election?.results_visible;
  const { data: results } = useElectionResults(id!, canShowResults ?? false);
  const { data: participation } = useElectionParticipation(id!);
  const updateElection = useUpdateElection();

  const toggleResultsVisible = async () => {
    if (!election) return;
    await updateElection.mutateAsync({
      id: election.id,
      results_visible: !election.results_visible,
    });
  };

  if (isLoading || !election) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate("/admin/elections")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Elections
        </button>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{election.title}</h1>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[status]}`}>
                {status}
              </span>
            </div>
            {election.description && (
              <p className="text-sm text-gray-500">{election.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-gray-400 mt-2">
              <span>Opens: {new Date(election.starts_at).toLocaleString()}</span>
              <span>Closes: {new Date(election.ends_at).toLocaleString()}</span>
            </div>
          </div>

          <button
            onClick={toggleResultsVisible}
            disabled={updateElection.isPending}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition"
            title={election.results_visible ? "Hide results" : "Show results early"}
          >
            {election.results_visible ? (
              <>
                <EyeOff className="h-4 w-4" />
                Hide Results
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Show Results Early
              </>
            )}
          </button>
        </div>
      </div>

      {/* Questions Overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Questions</h2>
        <div className="space-y-3">
          {election.questions?.map((q, idx) => (
            <div key={q.id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-400 font-mono">Q{idx + 1}</span>
                <span className="font-medium text-gray-900">{q.title}</span>
                <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                  {q.question_type === "yes_no" ? "Yes/No" : "Multiple Choice"}
                </span>
              </div>
              {q.description && <p className="text-sm text-gray-500 ml-7">{q.description}</p>}
              <div className="ml-7 mt-1 flex flex-wrap gap-1">
                {q.options?.map((opt) => (
                  <span key={opt.id} className="px-2 py-0.5 rounded text-xs bg-gray-50 text-gray-600 border border-gray-100">
                    {opt.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Results (if available) */}
      {canShowResults && results && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Results</h2>
          </div>

          <div className="space-y-6">
            {results.questions.map((qr) => {
              const maxPoints = Math.max(...qr.options.map((o) => o.points_total), 1);
              return (
                <div key={qr.question_id}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900">{qr.title}</h3>
                    <span className="text-xs text-gray-400">
                      {qr.participation_count} voter(s) &middot; {qr.total_points} total pts
                    </span>
                  </div>

                  <div className="space-y-2">
                    {qr.options.map((opt) => {
                      const pct = qr.total_points > 0 ? (opt.points_total / qr.total_points) * 100 : 0;
                      return (
                        <div key={opt.option_id}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-700">{opt.label}</span>
                            <span className="text-gray-500">
                              {opt.vote_count} vote(s) &middot; {opt.points_total} pts ({pct.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gray-700 rounded-full transition-all duration-500"
                              style={{ width: `${(opt.points_total / maxPoints) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Participation */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Participation</h2>
          {participation && (
            <span className="text-sm text-gray-400">
              ({participation.participants.length} voter(s))
            </span>
          )}
        </div>

        {participation && participation.participants.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Voted On</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">Questions Answered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {participation.participants.map((p) => (
                  <tr key={p.member_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2 text-gray-500">{p.voted_at}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {p.questions_voted} / {participation.total_questions}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No votes cast yet.</p>
        )}
      </div>
    </div>
  );
}
