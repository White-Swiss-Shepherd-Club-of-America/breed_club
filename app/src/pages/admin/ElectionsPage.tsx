/**
 * Admin page for managing elections.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useElections,
  useCreateElection,
  useDeleteElection,
} from "@/hooks/useVoting";
import type { Election, ElectionStatus } from "@breed-club/shared";
import { Plus, Trash2, Eye, X } from "lucide-react";

const STATUS_STYLES: Record<ElectionStatus, string> = {
  upcoming: "bg-blue-100 text-blue-700",
  open: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

interface QuestionInput {
  title: string;
  description: string;
  question_type: "yes_no" | "multiple_choice";
  sort_order: number;
  options: { label: string; sort_order: number }[];
}

function CreateElectionForm({
  onSave,
  onCancel,
  isPending,
}: {
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [questions, setQuestions] = useState<QuestionInput[]>([
    { title: "", description: "", question_type: "yes_no", sort_order: 0, options: [] },
  ]);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      { title: "", description: "", question_type: "yes_no", sort_order: questions.length, options: [] },
    ]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, updates: Partial<QuestionInput>) => {
    const updated = [...questions];
    updated[idx] = { ...updated[idx], ...updates };
    // When switching to multiple_choice, ensure at least 2 options
    if (updates.question_type === "multiple_choice" && updated[idx].options.length < 2) {
      updated[idx].options = [
        { label: "", sort_order: 0 },
        { label: "", sort_order: 1 },
      ];
    }
    setQuestions(updated);
  };

  const addOption = (qIdx: number) => {
    const updated = [...questions];
    updated[qIdx].options.push({ label: "", sort_order: updated[qIdx].options.length });
    setQuestions(updated);
  };

  const removeOption = (qIdx: number, oIdx: number) => {
    const updated = [...questions];
    updated[qIdx].options = updated[qIdx].options.filter((_, i) => i !== oIdx);
    setQuestions(updated);
  };

  const updateOption = (qIdx: number, oIdx: number, label: string) => {
    const updated = [...questions];
    updated[qIdx].options[oIdx].label = label;
    setQuestions(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title,
      description: description || null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      questions: questions.map((q) => ({
        title: q.title,
        description: q.description || null,
        question_type: q.question_type,
        sort_order: q.sort_order,
        options: q.question_type === "multiple_choice" ? q.options : undefined,
      })),
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">New Election</h3>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
          <X className="h-5 w-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="e.g. 2026 Board Election"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              placeholder="Optional description..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Voting Opens</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Voting Closes</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        {/* Questions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900">Questions</h4>
            <button
              type="button"
              onClick={addQuestion}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Question
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((q, qIdx) => (
              <div key={qIdx} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={q.title}
                          onChange={(e) => updateQuestion(qIdx, { title: e.target.value })}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          placeholder="Question text"
                        />
                      </div>
                      <select
                        value={q.question_type}
                        onChange={(e) =>
                          updateQuestion(qIdx, { question_type: e.target.value as "yes_no" | "multiple_choice" })
                        }
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      >
                        <option value="yes_no">Yes / No</option>
                        <option value="multiple_choice">Multiple Choice</option>
                      </select>
                    </div>

                    <input
                      type="text"
                      value={q.description}
                      onChange={(e) => updateQuestion(qIdx, { description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      placeholder="Description (optional)"
                    />

                    {q.question_type === "multiple_choice" && (
                      <div className="space-y-2 pl-4 border-l-2 border-gray-100">
                        <p className="text-xs text-gray-500 font-medium">Options</p>
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={opt.label}
                              onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                              required
                              className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                              placeholder={`Option ${oIdx + 1}`}
                            />
                            {q.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => removeOption(qIdx, oIdx)}
                                className="p-1 text-gray-400 hover:text-red-500"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addOption(qIdx)}
                          className="text-xs text-gray-500 hover:text-gray-700 transition"
                        >
                          + Add option
                        </button>
                      </div>
                    )}
                  </div>

                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(qIdx)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {isPending ? "Creating..." : "Create Election"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function ElectionsPage() {
  const { data: electionsList, isLoading } = useElections();
  const createElection = useCreateElection();
  const deleteElection = useDeleteElection();
  const navigate = useNavigate();

  const [showForm, setShowForm] = useState(false);

  const handleCreate = async (data: Record<string, unknown>) => {
    await createElection.mutateAsync(data);
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this election? This cannot be undone.")) return;
    await deleteElection.mutateAsync(id);
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      </div>
    );
  }

  const elections = electionsList ?? [];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Elections</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage voting elections.</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition"
          >
            <Plus className="h-4 w-4" />
            New Election
          </button>
        )}
      </div>

      {showForm && (
        <CreateElectionForm
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          isPending={createElection.isPending}
        />
      )}

      {elections.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No elections created yet.</p>
        </div>
      )}

      {elections.length > 0 && (
        <div className="space-y-3">
          {elections.map((election: Election) => {
            const status = election.status ?? "upcoming";
            return (
              <div
                key={election.id}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-gray-900">{election.title}</h3>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLES[status]}`}>
                        {status}
                      </span>
                    </div>
                    {election.description && (
                      <p className="text-sm text-gray-500 mb-2">{election.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span>Opens: {new Date(election.starts_at).toLocaleString()}</span>
                      <span>Closes: {new Date(election.ends_at).toLocaleString()}</span>
                      <span>{election.questions?.length ?? 0} question(s)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigate(`/admin/elections/${election.id}`)}
                      className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    {status === "upcoming" && (
                      <button
                        onClick={() => handleDelete(election.id)}
                        disabled={deleteElection.isPending}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
