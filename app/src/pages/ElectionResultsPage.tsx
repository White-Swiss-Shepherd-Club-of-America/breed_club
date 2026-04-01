/**
 * Election results page — shows aggregated results after voting closes.
 */

import { useParams, useNavigate } from "react-router-dom";
import { useElection, useElectionResults } from "@/hooks/useVoting";
import { ArrowLeft, BarChart3, Lock } from "lucide-react";

export function ElectionResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: election, isLoading: electionLoading } = useElection(id!);
  const { data: results, isLoading: resultsLoading, error } = useElectionResults(id!, true);

  if (electionLoading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      </div>
    );
  }

  if (!election) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-gray-500">Election not found.</p>
      </div>
    );
  }

  const status = election.status ?? "upcoming";

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate("/voting")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Elections
      </button>

      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="h-6 w-6 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{election.title}</h1>
          {election.description && (
            <p className="text-sm text-gray-500">{election.description}</p>
          )}
        </div>
      </div>

      {/* Results not available yet */}
      {error && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Lock className="h-8 w-8 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            Results are not available yet. Voting {status === "open" ? "is still in progress" : "has not started"}.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Results will be visible after the voting period closes on{" "}
            {new Date(election.ends_at).toLocaleString()}.
          </p>
        </div>
      )}

      {/* Loading results */}
      {resultsLoading && !error && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {results.questions.map((qr) => {
            const maxPoints = Math.max(...qr.options.map((o) => o.points_total), 1);
            return (
              <div key={qr.question_id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">{qr.title}</h3>
                  <span className="text-xs text-gray-400">
                    {qr.participation_count} voter(s) &middot; {qr.total_points} total pts
                  </span>
                </div>

                <div className="space-y-3">
                  {qr.options.map((opt) => {
                    const pct = qr.total_points > 0 ? (opt.points_total / qr.total_points) * 100 : 0;
                    const isWinner = opt.points_total === maxPoints && maxPoints > 0;
                    return (
                      <div key={opt.option_id}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className={`${isWinner ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                            {opt.label}
                          </span>
                          <span className="text-gray-500 tabular-nums">
                            {opt.vote_count} vote(s) &middot; {opt.points_total} pts ({pct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              isWinner ? "bg-green-500" : "bg-gray-400"
                            }`}
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
      )}
    </div>
  );
}
