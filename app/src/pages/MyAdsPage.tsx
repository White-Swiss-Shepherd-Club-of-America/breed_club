/**
 * Breeder-facing litter ad management page.
 *
 * Allows breeders to create, edit, submit, and delete their ads.
 */

import { useState } from "react";
import { useMyAds, useCreateAd, useUpdateAd, useSubmitAd, useDeleteAd } from "@/hooks/useAds";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/api";
import { Plus, Pencil, Trash2, Send, X, ImagePlus } from "lucide-react";
import type { LitterAd } from "@breed-club/shared";

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm";

const STATUS_BADGES: Record<string, { label: string; classes: string }> = {
  draft: { label: "Draft", classes: "bg-gray-100 text-gray-600" },
  submitted: { label: "Submitted", classes: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Approved", classes: "bg-green-100 text-green-700" },
  active: { label: "Active", classes: "bg-green-100 text-green-700" },
  revision_requested: { label: "Revision Requested", classes: "bg-orange-100 text-orange-700" },
  expired: { label: "Expired", classes: "bg-red-100 text-red-600" },
  archived: { label: "Archived", classes: "bg-red-100 text-red-600" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_BADGES[status] ?? { label: status, classes: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

type FormState = {
  title: string;
  description: string;
  image_url: string;
  contact_url: string;
};

const emptyForm = (): FormState => ({
  title: "",
  description: "",
  image_url: "",
  contact_url: "",
});

function AdForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormState;
  onSave: (data: FormState) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const { getToken } = useAuth();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const token = await getToken();
      const result = await api.upload<{ key: string }>("/uploads/photo", file, { token });
      const apiBase = import.meta.env.VITE_API_URL || "/api";
      setForm((s) => ({ ...s, image_url: `${apiBase}/uploads/photo/${result.key}` }));
    } catch {
      setError("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await onSave(form);
    } catch (err: any) {
      setError(err?.error?.message || err?.message || "Failed to save ad");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            required
            maxLength={255}
            placeholder="e.g. Planned Spring Litter - Champion Sire x Champion Dam"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            rows={4}
            maxLength={5000}
            placeholder="Tell potential buyers about this litter..."
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ad Image</label>
          {form.image_url && (
            <div className="mb-2 relative inline-block">
              <img src={form.image_url} alt="Ad preview" className="rounded-lg max-h-48 border border-gray-200" />
              <button
                type="button"
                onClick={() => setForm((s) => ({ ...s, image_url: "" }))}
                className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow border border-gray-200 hover:bg-red-50"
              >
                <X className="h-3 w-3 text-red-500" />
              </button>
            </div>
          )}
          <label className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
            <ImagePlus className="h-4 w-4" />
            {uploading ? "Uploading..." : form.image_url ? "Replace Image" : "Upload Image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contact URL</label>
          <input
            type="url"
            value={form.contact_url}
            onChange={(e) => setForm((s) => ({ ...s, contact_url: e.target.value }))}
            placeholder="https://yourkennel.com/contact (falls back to your kennel URL)"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-400">
            Where should interested buyers go? If blank, your kennel website URL is used.
          </p>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="flex gap-2 mt-6">
        <button
          type="submit"
          disabled={saving || uploading}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function MyAdsPage() {
  const { data, isLoading } = useMyAds();
  const createAd = useCreateAd();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const ads = data?.data ?? [];

  const handleCreate = async (form: FormState) => {
    await createAd.mutateAsync({
      title: form.title,
      description: form.description || null,
      image_url: form.image_url || null,
      contact_url: form.contact_url || null,
    });
    setShowCreate(false);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Litter Ads</h1>
        {!showCreate && !editingId && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" /> New Ad
          </button>
        )}
      </div>

      {showCreate && (
        <AdForm
          initial={emptyForm()}
          onSave={handleCreate}
          onCancel={() => setShowCreate(false)}
          saving={createAd.isPending}
        />
      )}

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {!isLoading && ads.length === 0 && !showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500 mb-2">You don't have any ads yet.</p>
          <p className="text-sm text-gray-400">
            Create an ad to advertise a planned or available litter on the club's website.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {ads.map((ad) => (
          <AdCard
            key={ad.id}
            ad={ad}
            isEditing={editingId === ad.id}
            onStartEdit={() => setEditingId(ad.id)}
            onStopEdit={() => setEditingId(null)}
          />
        ))}
      </div>
    </div>
  );
}

function AdCard({
  ad,
  isEditing,
  onStartEdit,
  onStopEdit,
}: {
  ad: LitterAd;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
}) {
  const updateAd = useUpdateAd(ad.id);
  const submitAd = useSubmitAd(ad.id);
  const deleteAd = useDeleteAd(ad.id);
  const [error, setError] = useState<string | null>(null);

  const canEdit = ["draft", "revision_requested"].includes(ad.status);
  const canSubmit = ["draft", "revision_requested"].includes(ad.status);
  const canDelete = ["draft", "archived", "revision_requested"].includes(ad.status);

  const handleUpdate = async (form: FormState) => {
    await updateAd.mutateAsync({
      title: form.title,
      description: form.description || null,
      image_url: form.image_url || null,
      contact_url: form.contact_url || null,
    });
    onStopEdit();
  };

  const handleSubmit = async () => {
    setError(null);
    try {
      await submitAd.mutateAsync();
    } catch (err: any) {
      setError(err?.error?.message || err?.message || "Failed to submit");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this ad?")) return;
    setError(null);
    try {
      await deleteAd.mutateAsync();
    } catch (err: any) {
      setError(err?.error?.message || err?.message || "Failed to delete");
    }
  };

  if (isEditing) {
    return (
      <AdForm
        initial={{
          title: ad.title,
          description: ad.description ?? "",
          image_url: ad.image_url ?? "",
          contact_url: ad.contact_url ?? "",
        }}
        onSave={handleUpdate}
        onCancel={onStopEdit}
        saving={updateAd.isPending}
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex">
        {ad.image_url && (
          <img
            src={ad.image_url}
            alt={ad.title}
            className="w-32 h-32 object-cover flex-shrink-0"
          />
        )}
        <div className="flex-1 p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{ad.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={ad.status} />
                {ad.status === "active" && ad.expires_at && (
                  <span className="text-xs text-gray-400">
                    Expires {new Date(ad.expires_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canEdit && (
                <button
                  onClick={onStartEdit}
                  className="p-1.5 text-gray-400 hover:text-gray-700 rounded"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={handleDelete}
                  disabled={deleteAd.isPending}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {ad.description && (
            <p className="mt-2 text-sm text-gray-600 line-clamp-2">{ad.description}</p>
          )}

          {ad.status === "revision_requested" && ad.revision_notes && (
            <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-sm text-orange-700">
              <strong>Revision requested:</strong> {ad.revision_notes}
            </div>
          )}

          {ad.status === "active" && (
            <div className="mt-2 flex gap-4 text-xs text-gray-400">
              <span>{ad.impression_count} impressions</span>
              <span>{ad.click_count} clicks</span>
            </div>
          )}

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={submitAd.isPending}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {submitAd.isPending ? "Submitting..." : "Submit for Review"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
