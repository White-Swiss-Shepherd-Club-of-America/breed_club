/**
 * Profile page — edit contact details.
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateContactSchema } from "@breed-club/shared/validation.js";
import { useCurrentMember, useUpdateProfile } from "@/hooks/useCurrentMember";
import type { z } from "zod";

type ProfileForm = z.infer<typeof updateContactSchema>;

export function ProfilePage() {
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
      kennel_name: member?.contact?.kennel_name || "",
      email: member?.contact?.email || "",
      phone: member?.contact?.phone || "",
      city: member?.contact?.city || "",
      state: member?.contact?.state || "",
      country: member?.contact?.country || "",
      website_url: member?.contact?.website_url || "",
    },
  });

  const onSubmit = async (data: ProfileForm) => {
    await updateMutation.mutateAsync(data);
  };

  if (!member) return null;

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Profile</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
            Full Name
          </label>
          <input
            {...register("full_name")}
            type="text"
            id="full_name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          {errors.full_name && (
            <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="kennel_name" className="block text-sm font-medium text-gray-700 mb-1">
            Kennel Name <span className="text-gray-400">(optional)</span>
          </label>
          <input
            {...register("kennel_name")}
            type="text"
            id="kennel_name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            {...register("email")}
            type="email"
            id="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone
          </label>
          <input
            {...register("phone")}
            type="tel"
            id="phone"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="website_url" className="block text-sm font-medium text-gray-700 mb-1">
            Website <span className="text-gray-400">(optional)</span>
          </label>
          <input
            {...register("website_url")}
            type="url"
            id="website_url"
            placeholder="https://example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          {errors.website_url && (
            <p className="mt-1 text-sm text-red-600">{errors.website_url.message}</p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
              City
            </label>
            <input
              {...register("city")}
              type="text"
              id="city"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <input
              {...register("state")}
              type="text"
              id="state"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-gray-700 mb-1">
              Country
            </label>
            <input
              {...register("country")}
              type="text"
              id="country"
              maxLength={2}
              placeholder="US"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </button>

        {updateMutation.isSuccess && (
          <p className="text-sm text-green-600">Profile updated successfully.</p>
        )}
        {updateMutation.isError && (
          <p className="text-sm text-red-600">Failed to update. Please try again.</p>
        )}
      </form>
    </div>
  );
}
