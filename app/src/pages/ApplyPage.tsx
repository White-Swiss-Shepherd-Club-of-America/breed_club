/**
 * Membership application form.
 */

import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createApplicationSchema } from "@breed-club/shared/validation.js";
import { useSubmitApplication } from "@/hooks/useApplications";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import type { z } from "zod";

type ApplicationForm = z.infer<typeof createApplicationSchema>;

export function ApplyPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { member } = useCurrentMember();
  const submitMutation = useSubmitApplication();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplicationForm>({
    resolver: zodResolver(createApplicationSchema),
    defaultValues: {
      applicant_name: member?.contact?.full_name || user?.fullName || "",
      applicant_email: member?.contact?.email || user?.primaryEmailAddress?.emailAddress || "",
      membership_type: "individual",
    },
  });

  const onSubmit = async (data: ApplicationForm) => {
    // Strip null values to match API expected types
    await submitMutation.mutateAsync({
      applicant_name: data.applicant_name,
      applicant_email: data.applicant_email,
      membership_type: data.membership_type,
      applicant_phone: data.applicant_phone ?? undefined,
      applicant_address: data.applicant_address ?? undefined,
      notes: data.notes ?? undefined,
    });
    navigate("/dashboard");
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Apply for Membership</h1>
      <p className="text-gray-600 mb-8">
        Submit your application to join the club. A board member will review it.
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {isSubmitting ? "Submitting..." : "Submit Application"}
        </button>

        {submitMutation.isError && (
          <p className="text-sm text-red-600">
            {(submitMutation.error as any)?.message || "Failed to submit. Please try again."}
          </p>
        )}
      </form>
    </div>
  );
}
