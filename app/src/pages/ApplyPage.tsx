/**
 * Membership application form for authenticated users.
 * Pre-fills name/email from Clerk. No reCAPTCHA (user is logged in).
 */

import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useState } from "react";
import { MembershipForm } from "@/components/MembershipForm";
import { useSubmitApplication } from "@/hooks/useApplications";
import { useCurrentMember } from "@/hooks/useCurrentMember";

export function ApplyPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { member } = useCurrentMember();
  const submitMutation = useSubmitApplication();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaultValues = {
    applicant_name: member?.contact?.full_name || user?.fullName || "",
    applicant_email:
      member?.contact?.email || user?.primaryEmailAddress?.emailAddress || "",
  };

  const handleSubmit = async (payload: {
    applicant_name: string;
    applicant_email: string;
    applicant_phone?: string;
    applicant_address?: string;
    membership_type: string;
    notes?: string;
    form_data: Array<{ field_key: string; label: string; field_type: string; value: string | string[] | boolean | null }>;
    recaptcha_token?: string;
  }) => {
    try {
      setSubmitError(null);
      await submitMutation.mutateAsync({
        applicant_name: payload.applicant_name,
        applicant_email: payload.applicant_email,
        applicant_phone: payload.applicant_phone,
        applicant_address: payload.applicant_address,
        membership_type: payload.membership_type,
        notes: payload.notes,
        form_data: payload.form_data,
      });
      navigate("/dashboard");
    } catch (err: any) {
      setSubmitError(err?.error?.message || err?.message || "Failed to submit. Please try again.");
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Apply for Membership</h1>
      <p className="text-gray-600 mb-8">
        Submit your application to join the club. A board member will review it.
      </p>

      <MembershipForm
        onSubmit={handleSubmit}
        defaultValues={defaultValues}
        isSubmitting={submitMutation.isPending}
        submitError={submitError}
      />
    </div>
  );
}
