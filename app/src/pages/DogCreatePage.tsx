/**
 * Dog registration page.
 *
 * Three-stage flow:
 *   1. "scan"   — Upload registration documents for LLM extraction (default)
 *   2. "review" — Review extracted data, resolve name conflicts, confirm
 *   3. "form"   — Full registration form, pre-filled from scan or blank
 *
 * Users can skip the scan stage at any point.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDogSchema } from "@breed-club/shared/validation.js";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft } from "lucide-react";
import { useCreateDog } from "@/hooks/useDogs";
import { useCurrentMember } from "@/hooks/useCurrentMember";
import { useClub } from "@/hooks/useClub";
import { useContacts } from "@/hooks/useContacts";
import { usePublicOrganizations } from "@/hooks/useAdmin";
import { api, ApiRequestError } from "@/lib/api";
import {
  PedigreeEditor,
  createEmptySlots,
  slotsToTree,
  type PedigreeSlotData,
} from "@/components/PedigreeEditor";
import { ScanRegistrationFlow } from "@/components/registration/ScanRegistrationFlow";
import { PedigreeScanPrompt } from "@/components/registration/PedigreeScanPrompt";
import {
  RegistrationDraftReview,
  type ResolvedRegistrationData,
} from "@/components/registration/RegistrationDraftReview";
import type { z } from "zod";
import type { Contact, Organization, RegistrationExtractionResponse, ExtractedPedigree } from "@breed-club/shared";

type DogForm = z.infer<typeof createDogSchema>;
type Stage = "scan" | "pedigree" | "review" | "form";

// ─── Contact typeahead (unchanged from original) ─────────────────────────────

function ContactTypeahead({
  value,
  onChange,
  label,
  error,
}: {
  value?: string;
  onChange: (id: string | undefined) => void;
  label: string;
  error?: string;
}) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const { data: contactsData } = useContacts(search);
  const contacts = contactsData?.data || [];
  const selectedContact = contacts.find((c) => c.id === value);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={search || selectedContact?.full_name || ""}
        onChange={(e) => {
          setSearch(e.target.value);
          setShowDropdown(true);
          if (!e.target.value) onChange(undefined);
        }}
        onFocus={() => setShowDropdown(true)}
        placeholder="Search by name, kennel, or email..."
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
      />
      {showDropdown && search && contacts.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {contacts.map((contact: Contact) => (
            <button
              type="button"
              key={contact.id}
              onClick={() => {
                onChange(contact.id);
                setSearch("");
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100"
            >
              <div className="font-medium">{contact.full_name}</div>
              {contact.kennel_name && (
                <div className="text-sm text-gray-600">{contact.kennel_name}</div>
              )}
              {contact.email && (
                <div className="text-xs text-gray-500">{contact.email}</div>
              )}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DogCreatePage() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const createMutation = useCreateDog();
  const { member } = useCurrentMember();
  const { data: orgsData } = usePublicOrganizations();
  const { data: clubData } = useClub();
  const organizations = orgsData?.data || [];

  const breedColors = clubData?.club?.breed_colors ?? [];
  const breedCoatTypes = clubData?.club?.breed_coat_types ?? [];
  const showColorField = breedColors.length !== 1;
  const showCoatTypeField = breedCoatTypes.length !== 1;

  const isAdmin = member?.is_admin === true || (member?.tierLevel ?? 0) >= 100;
  const requiresRegistration = !isAdmin;

  // ─── Stage state ──────────────────────────────────────────────────

  const [stage, setStage] = useState<Stage>("scan");

  // Extraction result (held between review and form stages)
  const [extractionResult, setExtractionResult] = useState<RegistrationExtractionResponse | null>(null);

  // Pre-fill data from the review stage
  const [preFill, setPreFill] = useState<ResolvedRegistrationData | null>(null);

  // ─── Form state ───────────────────────────────────────────────────

  const [pedigreeSlots, setPedigreeSlots] = useState<PedigreeSlotData[]>(createEmptySlots());
  const [registrations, setRegistrations] = useState<
    Array<{ organization_id: string; registration_number: string; registration_url?: string }>
  >(requiresRegistration ? [{ organization_id: "", registration_number: "" }] : []);
  const [registrationFiles, setRegistrationFiles] = useState<Map<number, File>>(new Map());
  const [uploading, setUploading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fallbackBanner, setFallbackBanner] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DogForm>({
    resolver: zodResolver(createDogSchema),
    defaultValues: { is_public: false },
  });

  const watchedCoatType = watch("coat_type");

  // ─── Scan stage handlers ──────────────────────────────────────────

  const handleScanSuccess = (result: RegistrationExtractionResponse) => {
    setExtractionResult(result);
    // If no pedigree was extracted from the registration docs, prompt for one.
    const hasPedigree = result.suggested?.pedigree != null &&
      Object.values(result.suggested.pedigree).some((v) => v != null);
    setStage(hasPedigree ? "review" : "pedigree");
  };

  const handleScanFallback = (reason: string) => {
    setFallbackBanner(reason);
    setStage("form");
  };

  const handleScanSkip = () => {
    setStage("form");
  };

  // ─── Pedigree stage handlers ──────────────────────────────────────

  const handlePedigreeScanned = (pedigree: ExtractedPedigree) => {
    // Merge the pedigree into the existing extraction result
    setExtractionResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        suggested: { ...prev.suggested, pedigree },
      };
    });
    setStage("review");
  };

  const handlePedigreeSkip = () => {
    setStage("review");
  };

  // ─── Review stage handlers ────────────────────────────────────────

  const handleReviewRescan = () => {
    setExtractionResult(null);
    setPreFill(null);
    setStage("scan");
  };

  const handleReviewSkip = () => {
    setExtractionResult(null);
    setPreFill(null);
    setStage("form");
  };

  /**
   * Called by RegistrationDraftReview when the user clicks "Submit for Approval".
   * Builds pedigree slots from extracted data and submits directly — no second form.
   */
  const handleReviewSubmit = async (data: ResolvedRegistrationData) => {
    try {
      setGeneralError(null);
      setPaymentError(null);

      // Build pedigree slots from extracted pedigree tree (if present)
      let slots = createEmptySlots();
      if (data.pedigree) {
        const slotKeys = [
          "sire", "dam",
          "sire_sire", "sire_dam", "dam_sire", "dam_dam",
          "sire_sire_sire", "sire_sire_dam", "sire_dam_sire", "sire_dam_dam",
          "dam_sire_sire", "dam_sire_dam", "dam_dam_sire", "dam_dam_dam",
        ] as const;
        slotKeys.forEach((key, i) => {
          const ancestor = data.pedigree![key];
          if (ancestor?.registered_name) {
            slots[i] = {
              ref: { registered_name: ancestor.registered_name },
              displayName: ancestor.registered_name,
              isFromAncestor: false,
              sex: (i % 2 === 0 ? "male" : "female") as "male" | "female",
            };
          }
        });
      } else if (data.sire_name || data.dam_name) {
        if (data.sire_name) {
          slots[0] = { ref: { registered_name: data.sire_name }, displayName: data.sire_name, isFromAncestor: false, sex: "male" };
        }
        if (data.dam_name) {
          slots[1] = { ref: { registered_name: data.dam_name }, displayName: data.dam_name, isFromAncestor: false, sex: "female" };
        }
      }

      await createMutation.mutateAsync({
        registered_name: data.registered_name,
        date_of_birth: data.date_of_birth ?? undefined,
        sex: data.sex ?? undefined,
        color: data.color ?? undefined,
        coat_type: data.coat_type ?? undefined,
        microchip_number: data.microchip_number ?? undefined,
        owner_id: data.owner_id ?? undefined,
        breeder_id: data.breeder_id ?? undefined,
        pedigree: slotsToTree(slots),
        registrations: data.registrations.length > 0 ? data.registrations : undefined,
        is_public: false,
      });

      navigate("/registry");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 402) {
        setPaymentError("Payment is required to register this dog. Please contact an administrator.");
      } else if (error instanceof ApiRequestError) {
        setGeneralError(error.error?.message || "Failed to register dog. Please try again.");
      } else {
        setGeneralError("An unexpected error occurred. Please try again.");
      }
    }
  };

  // ─── Form stage handlers ──────────────────────────────────────────

  const addRegistration = () => {
    setRegistrations([...registrations, { organization_id: "", registration_number: "" }]);
  };

  const removeRegistration = (index: number) => {
    setRegistrations(registrations.filter((_, i) => i !== index));
    const newFiles = new Map<number, File>();
    registrationFiles.forEach((file, i) => {
      if (i < index) newFiles.set(i, file);
      else if (i > index) newFiles.set(i - 1, file);
    });
    setRegistrationFiles(newFiles);
  };

  const updateRegistration = (
    index: number,
    field: keyof (typeof registrations)[0],
    value: string
  ) => {
    const updated = [...registrations];
    updated[index] = { ...updated[index], [field]: value };
    setRegistrations(updated);
  };

  const onSubmit = async (data: DogForm) => {
    try {
      setPaymentError(null);
      setGeneralError(null);

      if (requiresRegistration) {
        const validRegs = registrations.filter(
          (r) => r.organization_id && r.registration_number.trim()
        );
        if (validRegs.length === 0) {
          setGeneralError("At least one external registration (e.g. AKC, UKC) is required.");
          return;
        }
      }

      // Upload any new registration certificate files
      let finalRegistrations = registrations;
      if (registrationFiles.size > 0) {
        setUploading(true);
        const token = await getToken();
        finalRegistrations = await Promise.all(
          registrations.map(async (reg, index) => {
            const file = registrationFiles.get(index);
            if (file) {
              const result = await api.upload<{ key: string }>(
                "/uploads/certificate",
                file,
                { token }
              );
              return { ...reg, registration_url: result.key };
            }
            return reg;
          })
        );
        setUploading(false);
      }

      const pedigree = slotsToTree(pedigreeSlots);

      await createMutation.mutateAsync({
        ...data,
        call_name: data.call_name ?? undefined,
        sire_id: undefined,
        dam_id: undefined,
        pedigree,
        registrations: finalRegistrations.length > 0 ? finalRegistrations : undefined,
      });
      navigate("/registry");
    } catch (error) {
      setUploading(false);
      if (error instanceof ApiRequestError && error.status === 402) {
        setPaymentError(
          "Payment is required to register this dog. Please contact an administrator."
        );
      } else if (error instanceof ApiRequestError) {
        setGeneralError(
          error.error?.message || "Failed to register dog. Please try again."
        );
      } else {
        setGeneralError("An unexpected error occurred. Please try again.");
      }
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  const stageTitle =
    stage === "scan"
      ? "Register a Dog"
      : stage === "pedigree"
        ? "Add Pedigree"
        : stage === "review"
          ? "Review Extracted Information"
          : "Registration Details";

  const stageSubtitle =
    stage === "scan"
      ? "Upload registration certificates and we'll fill in the details for you."
      : stage === "pedigree"
        ? "Optionally scan an export pedigree to fill in the dog's ancestors."
        : stage === "review"
          ? "Verify the information extracted from your documents before continuing."
          : preFill
            ? "Review and complete the details extracted from your documents."
            : "Enter your dog's registration details manually.";

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          {stage === "pedigree" && (
            <button type="button" onClick={() => setStage("scan")} className="text-gray-500 hover:text-gray-700" aria-label="Back to scan">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          {stage === "review" && (
            <button
              type="button"
              onClick={() => extractionResult ? setStage("pedigree") : setStage("scan")}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          {stage === "form" && (
            <button
              type="button"
              onClick={() => extractionResult ? setStage("review") : setStage("scan")}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{stageTitle}</h1>
        </div>
        <p className="text-gray-500 text-sm ml-8">{stageSubtitle}</p>
      </div>

      {/* ── Stage: Scan ── */}
      {stage === "scan" && (
        <ScanRegistrationFlow
          onSuccess={handleScanSuccess}
          onFallback={handleScanFallback}
          onSkip={handleScanSkip}
        />
      )}

      {/* ── Stage: Pedigree prompt ── */}
      {stage === "pedigree" && extractionResult && (
        <PedigreeScanPrompt
          dogName={extractionResult.suggested.registered_name || "this dog"}
          onSuccess={handlePedigreeScanned}
          onSkip={handlePedigreeSkip}
        />
      )}

      {/* ── Stage: Review ── */}
      {stage === "review" && extractionResult && (
        <>
          {(generalError || paymentError) && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {paymentError || generalError}
            </div>
          )}
          <RegistrationDraftReview
            extraction={extractionResult}
            breedCoatTypes={breedCoatTypes}
            onSubmit={handleReviewSubmit}
            isSubmitting={createMutation.isPending}
            onRescan={handleReviewRescan}
            onSkip={handleReviewSkip}
          />
        </>
      )}

      {/* ── Stage: Form ── */}
      {stage === "form" && (
        <>
          {/* Fallback banner (scan failed) */}
          {fallbackBanner && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              {fallbackBanner} — Please enter the details manually.
            </div>
          )}

          {/* Pre-fill banner (scan succeeded) */}
          {preFill && !fallbackBanner && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
              Form pre-filled from your registration documents. Review the fields below before submitting.
            </div>
          )}

          {/* Coat type prompt — shown when scan pre-filled the form but coat type is missing */}
          {preFill && showCoatTypeField && !watchedCoatType && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-900 flex items-start gap-3">
              <span className="text-lg leading-none">✂️</span>
              <div>
                <p className="font-semibold">One thing we couldn't get from the papers — coat type.</p>
                <p className="mt-0.5 text-amber-800">
                  Please select the coat type below before submitting.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>

              <div>
                <label
                  htmlFor="registered_name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Registered Name
                </label>
                <input
                  {...register("registered_name")}
                  type="text"
                  id="registered_name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                {errors.registered_name && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.registered_name.message}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="call_name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Call Name <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  {...register("call_name")}
                  type="text"
                  id="call_name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="sex"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Sex <span className="text-gray-400">(optional)</span>
                  </label>
                  <select
                    {...register("sex")}
                    id="sex"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="date_of_birth"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Date of Birth <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    {...register("date_of_birth")}
                    type="date"
                    id="date_of_birth"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {showColorField && (
                  <div>
                    <label
                      htmlFor="color"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Color
                    </label>
                    {breedColors.length > 1 ? (
                      <select
                        {...register("color")}
                        id="color"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      >
                        <option value="">Select...</option>
                        {breedColors.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        {...register("color")}
                        type="text"
                        id="color"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      />
                    )}
                  </div>
                )}

                {showCoatTypeField && (
                  <div>
                    <label
                      htmlFor="coat_type"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Coat Type
                      {preFill && !watchedCoatType && (
                        <span className="ml-2 text-xs font-normal text-amber-600">
                          ← required — not on registration papers
                        </span>
                      )}
                    </label>
                    {breedCoatTypes.length > 1 ? (
                      <select
                        {...register("coat_type")}
                        id="coat_type"
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                          preFill && !watchedCoatType
                            ? "border-amber-400 ring-2 ring-amber-200"
                            : "border-gray-300"
                        }`}
                      >
                        <option value="">Select coat type...</option>
                        {breedCoatTypes.map((ct) => (
                          <option key={ct} value={ct}>
                            {ct}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        {...register("coat_type")}
                        type="text"
                        id="coat_type"
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
                          preFill && !watchedCoatType
                            ? "border-amber-400 ring-2 ring-amber-200"
                            : "border-gray-300"
                        }`}
                      />
                    )}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="microchip_number"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Microchip # <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    {...register("microchip_number")}
                    type="text"
                    id="microchip_number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Contacts */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Owner & Breeder</h2>
              <Controller
                name="owner_id"
                control={control}
                render={({ field }) => (
                  <ContactTypeahead
                    value={field.value ?? undefined}
                    onChange={field.onChange}
                    label="Owner"
                    error={errors.owner_id?.message}
                  />
                )}
              />
              <Controller
                name="breeder_id"
                control={control}
                render={({ field }) => (
                  <ContactTypeahead
                    value={field.value ?? undefined}
                    onChange={field.onChange}
                    label="Breeder"
                    error={errors.breeder_id?.message}
                  />
                )}
              />
            </div>

            {/* Pedigree */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Pedigree</h2>
              <p className="text-sm text-gray-500">
                {preFill?.pedigree
                  ? "Ancestors pre-filled from your export pedigree document. Click any slot to adjust."
                  : "Click a slot to search for an existing dog or enter a new name."}
              </p>
              <PedigreeEditor
                slots={pedigreeSlots}
                onChange={setPedigreeSlots}
              />
            </div>

            {/* Registrations */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    External Registrations
                    {requiresRegistration && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </h2>
                  {requiresRegistration && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      At least one external registration (e.g. AKC, UKC) is required
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={addRegistration}
                  className="text-sm text-gray-700 hover:text-gray-900 font-medium"
                >
                  + Add Registration
                </button>
              </div>

              {registrations.map((reg, index) => (
                <div
                  key={index}
                  className="p-4 border border-gray-200 rounded-lg space-y-3"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">
                      Registration {index + 1}
                    </span>
                    {(!requiresRegistration || registrations.length > 1) && (
                      <button
                        type="button"
                        onClick={() => removeRegistration(index)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Organization
                    </label>
                    <select
                      value={reg.organization_id}
                      onChange={(e) =>
                        updateRegistration(index, "organization_id", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    >
                      <option value="">Select organization...</option>
                      {organizations
                        .filter((org: Organization) => org.type === "kennel_club")
                        .map((org: Organization) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Registration Number
                    </label>
                    <input
                      type="text"
                      value={reg.registration_number}
                      onChange={(e) =>
                        updateRegistration(
                          index,
                          "registration_number",
                          e.target.value
                        )
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Registration Certificate{" "}
                      <span className="text-gray-400">(optional)</span>
                    </label>
                    {reg.registration_url && !registrationFiles.get(index) ? (
                      <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                        Document uploaded from scan
                      </p>
                    ) : (
                      <>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const newFiles = new Map(registrationFiles);
                              newFiles.set(index, file);
                              setRegistrationFiles(newFiles);
                              updateRegistration(index, "registration_url", "");
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        {registrationFiles.get(index) && (
                          <p className="text-sm text-gray-500 mt-1">
                            {registrationFiles.get(index)!.name} (
                            {(
                              registrationFiles.get(index)!.size / 1024
                            ).toFixed(0)}{" "}
                            KB)
                          </p>
                        )}
                        {!registrationFiles.get(index) && (
                          <div className="mt-2">
                            <label className="block text-xs text-gray-500 mb-1">
                              Or paste a URL
                            </label>
                            <input
                              type="url"
                              value={reg.registration_url || ""}
                              onChange={(e) =>
                                updateRegistration(
                                  index,
                                  "registration_url",
                                  e.target.value
                                )
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              placeholder="https://..."
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Visibility */}
            <div className="flex items-center gap-2">
              <input
                {...register("is_public")}
                type="checkbox"
                id="is_public"
                className="rounded"
              />
              <label htmlFor="is_public" className="text-sm text-gray-700">
                Make this dog's profile public (visible to non-members)
              </label>
            </div>

            {/* Errors */}
            {paymentError && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">{paymentError}</p>
              </div>
            )}
            {generalError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{generalError}</p>
              </div>
            )}

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting || createMutation.isPending || uploading}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {uploading
                  ? "Uploading certificates..."
                  : isSubmitting || createMutation.isPending
                    ? "Submitting..."
                    : "Submit for Approval"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/registry")}
                className="px-6 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
