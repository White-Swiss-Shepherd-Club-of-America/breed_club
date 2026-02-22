/**
 * Dog registration form with contact typeahead and registration fields.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDogSchema } from "@breed-club/shared/validation.js";
import { useAuth } from "@clerk/clerk-react";
import { useCreateDog, useDogs } from "@/hooks/useDogs";
import { useContacts } from "@/hooks/useContacts";
import { usePublicOrganizations } from "@/hooks/useAdmin";
import { api, ApiRequestError } from "@/lib/api";
import type { z } from "zod";
import type { Contact, Organization } from "@breed-club/shared";

type DogForm = z.infer<typeof createDogSchema>;

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
              {contact.kennel_name && <div className="text-sm text-gray-600">{contact.kennel_name}</div>}
              {contact.email && <div className="text-xs text-gray-500">{contact.email}</div>}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}

type ParentRef = string | { registered_name: string } | undefined;

function DogTypeahead({
  value,
  onChange,
  label,
  excludeId,
  sex,
}: {
  value?: ParentRef;
  onChange: (ref: ParentRef) => void;
  label: string;
  excludeId?: string;
  sex?: "male" | "female";
}) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const { data: dogsData } = useDogs(1, search, sex);
  const dogs = dogsData?.data || [];

  // Determine display value
  const selectedId = typeof value === "string" ? value : undefined;
  const newName = value && typeof value === "object" ? value.registered_name : undefined;
  const selectedDog = selectedId ? dogs.find((d) => d.id === selectedId) : undefined;

  const filteredDogs = dogs.filter((dog) => dog.id !== excludeId);
  const showCreateNew = search.length >= 2 && !filteredDogs.some(
    (d) => d.registered_name.toLowerCase() === search.toLowerCase()
  );

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} <span className="text-gray-400">(optional)</span>
      </label>
      <div className="relative">
        <input
          type="text"
          value={search || selectedDog?.registered_name || newName || ""}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
            if (!e.target.value) onChange(undefined);
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search by registered name..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        {newName && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
            new
          </span>
        )}
      </div>
      {showDropdown && search && (filteredDogs.length > 0 || showCreateNew) && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filteredDogs.map((dog) => (
            <button
              type="button"
              key={dog.id}
              onClick={() => {
                onChange(dog.id);
                setSearch("");
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100"
            >
              <div className="font-medium">{dog.registered_name}</div>
              {dog.call_name && <div className="text-sm text-gray-600">{dog.call_name}</div>}
            </button>
          ))}
          {showCreateNew && (
            <button
              type="button"
              onClick={() => {
                onChange({ registered_name: search });
                setSearch("");
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left hover:bg-yellow-50 focus:bg-yellow-50 border-t border-gray-200"
            >
              <div className="font-medium text-yellow-700">+ Create "{search}" as new {label.toLowerCase()}</div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DogCreatePage() {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const createMutation = useCreateDog();
  const { data: orgsData } = usePublicOrganizations();
  const organizations = orgsData?.data || [];

  const [registrations, setRegistrations] = useState<
    Array<{ organization_id: string; registration_number: string; registration_url?: string }>
  >([]);
  const [registrationFiles, setRegistrationFiles] = useState<Map<number, File>>(new Map());
  const [uploading, setUploading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DogForm>({
    resolver: zodResolver(createDogSchema),
    defaultValues: {
      is_public: false,
    },
  });

  const onSubmit = async (data: DogForm) => {
    try {
      setPaymentError(null);
      setGeneralError(null);

      // Upload any registration certificate files first
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

      await createMutation.mutateAsync({
        ...data,
        call_name: data.call_name ?? undefined,
        registrations: finalRegistrations.length > 0 ? finalRegistrations : undefined,
      });
      navigate("/registry");
    } catch (error) {
      setUploading(false);
      if (error instanceof ApiRequestError && error.status === 402) {
        setPaymentError(
          "Payment is required to register this dog. Please contact an administrator to enable fee bypass for your account."
        );
      } else if (error instanceof ApiRequestError) {
        setGeneralError(error.error?.message || "Failed to register dog. Please try again.");
      } else {
        setGeneralError("An unexpected error occurred. Please try again.");
      }
    }
  };

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

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Register a Dog</h1>
      <p className="text-gray-600 mb-8">
        Add a dog to the registry. Your submission will be reviewed before being approved.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Info */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>

          <div>
            <label htmlFor="registered_name" className="block text-sm font-medium text-gray-700 mb-1">
              Registered Name
            </label>
            <input
              {...register("registered_name")}
              type="text"
              id="registered_name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
            {errors.registered_name && (
              <p className="mt-1 text-sm text-red-600">{errors.registered_name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="call_name" className="block text-sm font-medium text-gray-700 mb-1">
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
              <label htmlFor="sex" className="block text-sm font-medium text-gray-700 mb-1">
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
              <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700 mb-1">
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
            <div>
              <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-1">
                Color <span className="text-gray-400">(optional)</span>
              </label>
              <input
                {...register("color")}
                type="text"
                id="color"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="microchip_number" className="block text-sm font-medium text-gray-700 mb-1">
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

          <Controller
            name="sire_id"
            control={control}
            render={({ field }) => (
              <DogTypeahead value={(field.value as ParentRef) ?? undefined} onChange={field.onChange} label="Sire" sex="male" />
            )}
          />

          <Controller
            name="dam_id"
            control={control}
            render={({ field }) => (
              <DogTypeahead value={(field.value as ParentRef) ?? undefined} onChange={field.onChange} label="Dam" sex="female" />
            )}
          />
        </div>

        {/* Registrations */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">External Registrations</h2>
            <button
              type="button"
              onClick={addRegistration}
              className="text-sm text-gray-700 hover:text-gray-900 font-medium"
            >
              + Add Registration
            </button>
          </div>

          {registrations.map((reg, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Registration {index + 1}</span>
                <button
                  type="button"
                  onClick={() => removeRegistration(index)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization</label>
                <select
                  value={reg.organization_id}
                  onChange={(e) => updateRegistration(index, "organization_id", e.target.value)}
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
                  onChange={(e) => updateRegistration(index, "registration_number", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Registration Certificate <span className="text-gray-400">(optional)</span>
                </label>
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
                    {registrationFiles.get(index)!.name} ({(registrationFiles.get(index)!.size / 1024).toFixed(0)} KB)
                  </p>
                )}
                {!registrationFiles.get(index) && (
                  <div className="mt-2">
                    <label className="block text-xs text-gray-500 mb-1">Or paste a URL</label>
                    <input
                      type="url"
                      value={reg.registration_url || ""}
                      onChange={(e) => updateRegistration(index, "registration_url", e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="https://..."
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Visibility */}
        <div className="flex items-center gap-2">
          <input {...register("is_public")} type="checkbox" id="is_public" className="rounded" />
          <label htmlFor="is_public" className="text-sm text-gray-700">
            Make this dog's profile public (visible to non-members)
          </label>
        </div>

        {/* Payment Error */}
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

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting || createMutation.isPending || uploading}
            className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {uploading ? "Uploading certificates..." : isSubmitting || createMutation.isPending ? "Submitting..." : "Submit for Approval"}
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
    </div>
  );
}
