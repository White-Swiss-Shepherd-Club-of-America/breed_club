/**
 * Ballot casting page — member selects answers and submits.
 */

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useElection, useCastBallot } from "@/hooks/useVoting";
import { ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";

export function ElectionVotePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: election, isLoading } = useElection(id!);
  const castBallot = useCastBallot();

  // Track selected option per question
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading || !election) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      </div>
    );
  }

  const status = election.status ?? "upcoming";
  const questions = election.questions ?? [];
  const unanswered = questions.filter((q) => !q.has_voted);
  const answered = questions.filter((q) => q.has_voted);

  // Only questions not yet voted on
  const votableQuestions = unanswered;
  const allSelected = votableQuestions.length > 0 && votableQuestions.every((q) => selections[q.id]);

  const handleSubmit = async () => {
    setError(null);
    const votes = votableQuestions
      .filter((q) => selections[q.id])
      .map((q) => ({
        question_id: q.id,
        option_id: selections[q.id],
      }));

    try {
      await castBallot.mutateAsync({ electionId: election.id, votes });
      navigate(`/voting/${election.id}/results`, { replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Failed to cast ballot. Please try again.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() => navigate("/voting")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Elections
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">{election.title}</h1>
      {election.description && (
        <p className="text-sm text-gray-500 mb-6">{election.description}</p>
      )}

      {status !== "open" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-800">
            This election is not currently open for voting.
          </p>
        </div>
      )}

      {/* Already voted questions */}
      {answered.length > 0 && (
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-3">
            You have already voted on {answered.length} question(s):
          </p>
          {answered.map((q) => (
            <div key={q.id} className="flex items-center gap-2 py-2 text-sm text-gray-500">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span>{q.title}</span>
            </div>
          ))}
        </div>
      )}

      {/* Questions to vote on */}
      {status === "open" && votableQuestions.length > 0 && (
        <div className="space-y-6">
          {votableQuestions.map((q, idx) => (
            <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-gray-400 font-mono">Q{idx + 1}</span>
                <h3 className="font-semibold text-gray-900">{q.title}</h3>
              </div>
              {q.description && (
                <p className="text-sm text-gray-500 mb-4">{q.description}</p>
              )}

              <div className="space-y-2">
                {q.options?.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      selections[q.id] === opt.id
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`question-${q.id}`}
                      value={opt.id}
                      checked={selections[q.id] === opt.id}
                      onChange={() =>
                        setSelections((prev) => ({ ...prev, [q.id]: opt.id }))
                      }
                      className="text-gray-900 focus:ring-gray-900"
                    />
                    <span className="text-sm text-gray-900">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Confirmation dialog */}
          {showConfirm ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
              <p className="font-medium text-gray-900 mb-2">Confirm your vote</p>
              <p className="text-sm text-gray-600 mb-4">
                Your vote is final and cannot be changed. Are you sure you want to submit?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleSubmit}
                  disabled={castBallot.isPending}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition"
                >
                  {castBallot.isPending ? "Submitting..." : "Yes, Submit My Vote"}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition"
                >
                  Go Back
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!allSelected}
              className="w-full px-4 py-3 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Submit Vote ({votableQuestions.filter((q) => selections[q.id]).length}/{votableQuestions.length} answered)
            </button>
          )}
        </div>
      )}

      {status === "open" && votableQuestions.length === 0 && answered.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-green-800">You have voted on all questions in this election.</p>
        </div>
      )}
    </div>
  );
}
