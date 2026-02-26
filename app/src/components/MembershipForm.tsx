/**
 * Shared membership application form component.
 * Used by ApplyPage (auth), PublicApplyPage (public), and EmbedApplyPage (iframe).
 *
 * Fetches admin-configured form fields and renders them dynamically alongside
 * the base fields (name, email, phone, address, membership_type).
 */

import { useForm } from "react-hook-form";
import type { Path } from "react-hook-form";
import { usePublicFormFields } from "@/hooks/useFormFields";
import type { MembershipFormField } from "@breed-club/shared";

export type FormDataEntry = {
  field_key: string;
  label: string;
  field_type: string;
  value: string | string[] | boolean | null;
};

export type MembershipFormValues = {
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;
  applicant_address: string;
  membership_type: string;
  notes: string;
  [key: string]: string | string[] | boolean; // dynamic fields
};

interface MembershipFormProps {
  onSubmit: (payload: {
    applicant_name: string;
    applicant_email: string;
    applicant_phone?: string;
    applicant_address?: string;
    membership_type: string;
    notes?: string;
    form_data: FormDataEntry[];
    recaptcha_token?: string;
  }) => Promise<void>;
  defaultValues?: Partial<MembershipFormValues>;
  recaptchaToken?: string | null;
  isSubmitting: boolean;
  submitError?: string | null;
  submitLabel?: string;
}

export function MembershipForm({
  onSubmit,
  defaultValues,
  recaptchaToken,
  isSubmitting,
  submitError,
  submitLabel = "Submit Application",
}: MembershipFormProps) {
  const { data: fieldsData, isLoading: fieldsLoading } = usePublicFormFields();
  const dynamicFields = fieldsData?.data ?? [];

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<MembershipFormValues>({
    defaultValues: {
      applicant_name: "",
      applicant_email: "",
      applicant_phone: "",
      applicant_address: "",
      membership_type: "individual",
      notes: "",
      ...defaultValues,
    },
  });

  const handleFormSubmit = async (values: MembershipFormValues) => {
    // Build form_data array from dynamic fields
    const form_data: FormDataEntry[] = dynamicFields.map((field) => {
      const rawValue = values[field.field_key];
      let value: string | string[] | boolean | null = null;

      if (field.field_type === "checkbox" && !field.options?.length) {
        value = rawValue === true || rawValue === "true";
      } else if (Array.isArray(rawValue)) {
        value = rawValue;
      } else {
        value = (rawValue as string) || null;
      }

      return {
        field_key: field.field_key,
        label: field.label,
        field_type: field.field_type,
        value,
      };
    });

    await onSubmit({
      applicant_name: values.applicant_name,
      applicant_email: values.applicant_email,
      applicant_phone: values.applicant_phone || undefined,
      applicant_address: values.applicant_address || undefined,
      membership_type: values.membership_type,
      notes: values.notes || undefined,
      form_data,
      recaptcha_token: recaptchaToken ?? undefined,
    });
  };

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent";

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Base fields */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Full Name <span className="text-red-500">*</span>
        </label>
        <input
          {...register("applicant_name", { required: "Full name is required" })}
          type="text"
          className={inputClass}
        />
        {errors.applicant_name && (
          <p className="mt-1 text-sm text-red-600">{errors.applicant_name.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email <span className="text-red-500">*</span>
        </label>
        <input
          {...register("applicant_email", {
            required: "Email is required",
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email address" },
          })}
          type="email"
          className={inputClass}
        />
        {errors.applicant_email && (
          <p className="mt-1 text-sm text-red-600">{errors.applicant_email.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Phone <span className="text-gray-400">(optional)</span>
        </label>
        <input {...register("applicant_phone")} type="tel" className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Address <span className="text-gray-400">(optional)</span>
        </label>
        <textarea {...register("applicant_address")} rows={2} className={inputClass} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Membership Type <span className="text-red-500">*</span>
        </label>
        <select {...register("membership_type", { required: true })} className={inputClass}>
          <option value="individual">Individual</option>
          <option value="family">Family</option>
          <option value="associate">Associate</option>
        </select>
      </div>

      {/* Dynamic fields */}
      {!fieldsLoading &&
        dynamicFields.map((field) => (
          <DynamicField
            key={field.field_key}
            field={field}
            register={register}
            errors={errors}
            watch={watch}
            setValue={setValue}
            inputClass={inputClass}
          />
        ))}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tell us about yourself <span className="text-gray-400">(optional)</span>
        </label>
        <textarea
          {...register("notes")}
          rows={4}
          placeholder="Why do you want to join? Do you own dogs of this breed?"
          className={inputClass}
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
        {isSubmitting ? "Submitting…" : submitLabel}
      </button>
    </form>
  );
}

// ─── Dynamic field renderer ───────────────────────────────────────────────────

interface DynamicFieldProps {
  field: MembershipFormField;
  register: ReturnType<typeof useForm<MembershipFormValues>>["register"];
  errors: ReturnType<typeof useForm<MembershipFormValues>>["formState"]["errors"];
  watch: ReturnType<typeof useForm<MembershipFormValues>>["watch"];
  setValue: ReturnType<typeof useForm<MembershipFormValues>>["setValue"];
  inputClass: string;
}

function DynamicField({
  field,
  register,
  errors,
  watch,
  setValue,
  inputClass,
}: DynamicFieldProps) {
  const fieldName = field.field_key as Path<MembershipFormValues>;
  const error = errors[fieldName];
  const validation = field.required ? { required: `${field.label} is required` } : {};

  const label = (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {field.label}
      {field.required ? (
        <span className="text-red-500 ml-0.5">*</span>
      ) : (
        <span className="text-gray-400 ml-1">(optional)</span>
      )}
    </label>
  );

  const helpText = field.description && (
    <p className="mt-1 text-xs text-gray-500">{field.description}</p>
  );

  const errorMsg = error && (
    <p className="mt-1 text-sm text-red-600">{String(error.message)}</p>
  );

  if (field.field_type === "textarea") {
    return (
      <div>
        {label}
        <textarea {...register(fieldName, validation)} rows={3} className={inputClass} />
        {helpText}
        {errorMsg}
      </div>
    );
  }

  if (field.field_type === "select" && field.options?.length) {
    return (
      <div>
        {label}
        <select {...register(fieldName, validation)} className={inputClass}>
          <option value="">Select…</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {helpText}
        {errorMsg}
      </div>
    );
  }

  if (field.field_type === "radio" && field.options?.length) {
    return (
      <div>
        {label}
        <div className="space-y-1 mt-1">
          {field.options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                {...register(fieldName, validation)}
                type="radio"
                value={opt}
                className="text-gray-900"
              />
              {opt}
            </label>
          ))}
        </div>
        {helpText}
        {errorMsg}
      </div>
    );
  }

  if (field.field_type === "checkbox") {
    // Multi-select checkboxes when options defined, single boolean otherwise
    if (field.options?.length) {
      const watched = watch(fieldName) as string[] | undefined;
      const selected = Array.isArray(watched) ? watched : [];
      return (
        <div>
          {label}
          <div className="space-y-1 mt-1">
            {field.options.map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, opt]
                      : selected.filter((s) => s !== opt);
                    setValue(fieldName, next as any);
                  }}
                  className="text-gray-900"
                />
                {opt}
              </label>
            ))}
          </div>
          {helpText}
          {errorMsg}
        </div>
      );
    }

    return (
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input {...register(fieldName, validation)} type="checkbox" className="text-gray-900" />
          {field.label}
          {field.required && <span className="text-red-500">*</span>}
        </label>
        {helpText}
        {errorMsg}
      </div>
    );
  }

  // Default: text, email, phone, url, number, date
  const inputType =
    field.field_type === "email"
      ? "email"
      : field.field_type === "phone"
      ? "tel"
      : field.field_type === "number"
      ? "number"
      : field.field_type === "date"
      ? "date"
      : "text";

  const extraValidation =
    field.field_type === "email"
      ? {
          ...validation,
          pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email address" },
        }
      : validation;

  return (
    <div>
      {label}
      <input {...register(fieldName, extraValidation)} type={inputType} className={inputClass} />
      {helpText}
      {errorMsg}
    </div>
  );
}
