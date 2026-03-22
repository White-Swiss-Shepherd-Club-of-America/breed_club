/**
 * User settings page with tabbed interface.
 * - Profile tab: contact info
 * - Breeder Preferences tab (if is_breeder): kennel, logo, banner, colors, pup status
 */

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateContactSchema, updateBreederPrefsSchema } from "@breed-club/shared/validation.js";
import { useCurrentMember, useUpdateProfile, useUpdateBreederPrefs } from "@/hooks/useCurrentMember";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/api";
import type { z } from "zod";

type ProfileForm = z.infer<typeof updateContactSchema>;
type BreederForm = z.infer<typeof updateBreederPrefsSchema>;

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent";

function getImageUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = import.meta.env.VITE_API_URL ?? "/api";
  if (key.startsWith("logos/")) return `${base}/uploads/logo/${key}`;
  if (key.startsWith("banners/")) return `${base}/uploads/banner/${key}`;
  return `${base}/uploads/photo/${key}`;
}

/**
 * Center-crop and resize an image file to target dimensions.
 * Returns a new File with the resized image (JPEG).
 */
function resizeImage(file: File, targetWidth: number, targetHeight: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const targetRatio = targetWidth / targetHeight;
      const srcRatio = img.width / img.height;

      // Center-crop to match target aspect ratio
      let cropWidth = img.width;
      let cropHeight = img.height;
      let cropX = 0;
      let cropY = 0;

      if (srcRatio > targetRatio) {
        // Source is wider — crop sides
        cropWidth = img.height * targetRatio;
        cropX = (img.width - cropWidth) / 2;
      } else {
        // Source is taller — crop top/bottom
        cropHeight = img.width / targetRatio;
        cropY = (img.height - cropHeight) / 2;
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Canvas toBlob failed"));
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.9
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

function ProfileTab() {
  const { member } = useCurrentMember();
  const updateMutation = useUpdateProfile();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(updateContactSchema),
    defaultValues: {
      full_name: member?.contact?.full_name || "",
      email: member?.contact?.email || "",
      phone: member?.contact?.phone || "",
      city: member?.contact?.city || "",
      state: member?.contact?.state || "",
      country: member?.contact?.country || "",
    },
  });

  const onSubmit = async (data: ProfileForm) => {
    await updateMutation.mutateAsync(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
          Full Name
        </label>
        <input {...register("full_name")} type="text" id="full_name" className={inputClass} />
        {errors.full_name && <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input {...register("email")} type="email" id="email" className={inputClass} />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <input {...register("phone")} type="tel" id="phone" className={inputClass} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
          <input {...register("city")} type="text" id="city" className={inputClass} />
        </div>
        <div>
          <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">State</label>
          <input {...register("state")} type="text" id="state" className={inputClass} />
        </div>
        <div>
          <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
          <input {...register("country")} type="text" id="country" maxLength={2} placeholder="US" className={inputClass} />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !isDirty}
        className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition"
      >
        {isSubmitting ? "Saving..." : "Save Changes"}
      </button>

      {updateMutation.isSuccess && <p className="text-sm text-green-600">Profile updated successfully.</p>}
      {updateMutation.isError && <p className="text-sm text-red-600">Failed to update. Please try again.</p>}
    </form>
  );
}

function BreederPrefsTab() {
  const { member } = useCurrentMember();
  const { getToken } = useAuth();
  const updateMutation = useUpdateBreederPrefs();
  const [logoPreview, setLogoPreview] = useState<string | null>(getImageUrl(member?.logo_url));
  const [bannerPreview, setBannerPreview] = useState<string | null>(getImageUrl(member?.banner_url));
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const [bannerDims, setBannerDims] = useState<{ width: number; height: number }>({ width: 390, height: 219 });

  useEffect(() => {
    api.get<{ club: { banner_width: number; banner_height: number } }>("/public/club")
      .then((r) => setBannerDims({ width: r.club.banner_width, height: r.club.banner_height }))
      .catch(() => {/* defaults are fine */});
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BreederForm>({
    resolver: zodResolver(updateBreederPrefsSchema),
    defaultValues: {
      kennel_name: member?.contact?.kennel_name ?? "",
      website_url: member?.contact?.website_url ?? "",
      logo_url: member?.logo_url ?? undefined,
      banner_url: member?.banner_url ?? undefined,
      primary_color: member?.primary_color ?? "#655e7a",
      accent_color: member?.accent_color ?? "#ffffff",
      pup_status: member?.pup_status ?? "none",
      pup_expected_date: member?.pup_expected_date ?? undefined,
      show_in_directory: member?.show_in_directory ?? true,
    },
  });

  const pupStatus = watch("pup_status");
  const primaryColor = watch("primary_color");
  const accentColor = watch("accent_color");

  const handleImageUpload = async (file: File, type: "logo" | "banner") => {
    setUploading(type);
    try {
      const token = await getToken();
      const uploadFile = type === "banner"
        ? await resizeImage(file, bannerDims.width, bannerDims.height)
        : file;
      const result = await api.upload<{ key: string }>(`/uploads/${type}`, uploadFile, { token });
      setValue(type === "logo" ? "logo_url" : "banner_url", result.key, { shouldDirty: true });
      const url = getImageUrl(result.key);
      if (type === "logo") setLogoPreview(url);
      else setBannerPreview(url);
    } catch {
      // upload failed silently — user can retry
    } finally {
      setUploading(null);
    }
  };

  const onSubmit = async (data: BreederForm) => {
    await updateMutation.mutateAsync(data as Record<string, unknown>);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Kennel Name & Website */}
      <div>
        <label htmlFor="kennel_name" className="block text-sm font-medium text-gray-700 mb-1">
          Kennel Name <span className="text-gray-400">(optional)</span>
        </label>
        <input {...register("kennel_name")} type="text" id="kennel_name" className={inputClass} />
      </div>

      <div>
        <label htmlFor="website_url" className="block text-sm font-medium text-gray-700 mb-1">
          Website <span className="text-gray-400">(optional)</span>
        </label>
        <input {...register("website_url")} type="url" id="website_url" placeholder="https://example.com" className={inputClass} />
        {errors.website_url && <p className="mt-1 text-sm text-red-600">{errors.website_url.message}</p>}
      </div>

      {/* Logo Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
        <div className="flex items-center gap-4">
          {logoPreview ? (
            <img src={logoPreview} alt="Logo" className="w-20 h-20 object-cover rounded-lg border border-gray-200" />
          ) : (
            <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">
              No logo
            </div>
          )}
          <div>
            <label className="cursor-pointer px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 inline-block">
              {uploading === "logo" ? "Uploading..." : "Choose File"}
              <input
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                disabled={uploading === "logo"}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, "logo");
                }}
              />
            </label>
            <p className="mt-1 text-xs text-gray-400">JPEG or PNG, max 2MB</p>
          </div>
        </div>
      </div>

      {/* Banner Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Banner Image</label>
        {bannerPreview ? (
          <img src={bannerPreview} alt="Banner" className="w-full h-32 object-cover rounded-lg border border-gray-200 mb-2" />
        ) : (
          <div className="w-full h-32 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm mb-2">
            No banner
          </div>
        )}
        <label className="cursor-pointer px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 inline-block">
          {uploading === "banner" ? "Uploading..." : "Choose File"}
          <input
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            disabled={uploading === "banner"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(file, "banner");
            }}
          />
        </label>
        <p className="mt-1 text-xs text-gray-400">JPEG or PNG, max 5MB. Image will be cropped to {bannerDims.width}&times;{bannerDims.height}px.</p>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="primary_color" className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={primaryColor || "#655e7a"}
              onChange={(e) => setValue("primary_color", e.target.value, { shouldDirty: true })}
              className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
            />
            <input
              {...register("primary_color")}
              type="text"
              id="primary_color"
              placeholder="#655e7a"
              className={inputClass}
            />
          </div>
          {errors.primary_color && <p className="mt-1 text-sm text-red-600">{errors.primary_color.message}</p>}
        </div>
        <div>
          <label htmlFor="accent_color" className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={accentColor || "#ffffff"}
              onChange={(e) => setValue("accent_color", e.target.value, { shouldDirty: true })}
              className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
            />
            <input
              {...register("accent_color")}
              type="text"
              id="accent_color"
              placeholder="#ffffff"
              className={inputClass}
            />
          </div>
          {errors.accent_color && <p className="mt-1 text-sm text-red-600">{errors.accent_color.message}</p>}
        </div>
      </div>

      {/* Pup Status */}
      <div>
        <label htmlFor="pup_status" className="block text-sm font-medium text-gray-700 mb-1">Pup Availability</label>
        <select {...register("pup_status")} id="pup_status" className={inputClass}>
          <option value="none">None</option>
          <option value="available">Pups Available</option>
          <option value="expected">Pups Expected</option>
        </select>
      </div>

      {pupStatus === "expected" && (
        <div>
          <label htmlFor="pup_expected_date" className="block text-sm font-medium text-gray-700 mb-1">
            Expected Date
          </label>
          <input {...register("pup_expected_date")} type="date" id="pup_expected_date" className={inputClass} />
          {errors.pup_expected_date && <p className="mt-1 text-sm text-red-600">{errors.pup_expected_date.message}</p>}
        </div>
      )}

      {/* Directory visibility */}
      <div className="border-t border-gray-200 pt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            {...register("show_in_directory")}
            type="checkbox"
            className="rounded h-4 w-4"
          />
          <div>
            <span className="text-sm font-medium text-gray-700">Show in Breeder Directory</span>
            <p className="text-xs text-gray-400">When enabled, your kennel will appear in the public breeder directory.</p>
          </div>
        </label>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !isDirty}
        className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition"
      >
        {isSubmitting ? "Saving..." : "Save Breeder Preferences"}
      </button>

      {updateMutation.isSuccess && <p className="text-sm text-green-600">Breeder preferences saved.</p>}
      {updateMutation.isError && <p className="text-sm text-red-600">Failed to save. Please try again.</p>}
    </form>
  );
}

export function SettingsPage() {
  const { member } = useCurrentMember();
  const isBreeder = member?.is_breeder;
  const [tab, setTab] = useState<"profile" | "breeder">("profile");

  if (!member) return null;

  // Non-breeders get profile form directly, no tabs
  if (!isBreeder) {
    return (
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
        <ProfileTab />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab("profile")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "profile"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Profile
        </button>
        <button
          onClick={() => setTab("breeder")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            tab === "breeder"
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Breeder Preferences
        </button>
      </div>

      {tab === "profile" ? <ProfileTab /> : <BreederPrefsTab />}
    </div>
  );
}
