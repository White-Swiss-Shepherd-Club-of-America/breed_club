/**
 * Public membership application form — no authentication required.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createApplicationSchema } from "@breed-club/shared/validation.js";
import { useClub } from "@/hooks/useClub";
import { api, ApiRequestError } from "@/lib/api";
import type { z } from "zod";

type ApplicationForm = z.infer<typeof createApplicationSchema>;

export function PublicApplyPage() {
  const { data: clubData } = useClub();
  const club = clubData?.club;
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationForm>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: {
      membership_type: "individual",
    },
  });

  const onSubmit = async (data: ApplicationForm) => {
    try {
      setSubmitError(null);
      await api.post("/public/applications", {
        applicant_name: data.applicant_name,
        applicant_email: data.applicant_email,
        membership_type: data.membership_type,
        applicant_phone: data.applicant_phone ?? undefined,
        applicant_address: data.applicant_address ?? undefined,
        notes: data.notes ?? undefined,
      });
      setSubmitted(true);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setSubmitError("An application with this email address is already pending review.");
      } else if (error instanceof ApiRequestError) {
        setSubmitError(error.error?.message || "Failed to submit application. Please try again.");
      } else {
        setSubmitError("An unexpected error occurred. Please try again.");
      }
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Application Submitted</h1>
        <p className="text-gray-600">
          Thank you for your interest in joining {club?.name || "our club"}! A board member will
          review your application and follow up via email.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Apply for Membership
      </h1>
      <p className="text-gray-600 mb-8">
        Submit your application to join {club?.name || "the club"}. A board member will review it
        and follow up via email.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="applicant_name" className="block text-sm font-medium text-gray-700 mb-1">
            Full Name
          </label>
          <input
            {...register("applicant_name")}
            type="text"
            id="applicant_name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          {errors.applicant_name && (
            <p className="mt-1 text-sm text-red-600">{errors.applicant_name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="applicant_email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            {...register("applicant_email")}
            type="email"
            id="applicant_email"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          {errors.applicant_email && (
            <p className="mt-1 text-sm text-red-600">{errors.applicant_email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="applicant_phone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone <span className="text-gray-400">(optional)</span>
          </label>
          <input
            {...register("applicant_phone")}
            type="tel"
            id="applicant_phone"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="applicant_address" className="block text-sm font-medium text-gray-700 mb-1">
            Address <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            {...register("applicant_address")}
            id="applicant_address"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="membership_type" className="block text-sm font-medium text-gray-700 mb-1">
            Membership Type
          </label>
          <select
            {...register("membership_type")}
            id="membership_type"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          >
            <option value="individual">Individual</option>
            <option value="family">Family</option>
            <option value="associate">Associate</option>
          </select>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Tell us about yourself <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            {...register("notes")}
            id="notes"
            rows={4}
            placeholder="Why do you want to join? Do you have dogs of this breed?"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        {submitError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{submitError}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {isSubmitting ? "Submitting..." : "Submit Application"}
        </button>
      </form>
    </div>
  );
}
