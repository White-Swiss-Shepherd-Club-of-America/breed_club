/**
 * Dog edit page for admins and approvers.
 * Allows editing any dog regardless of status.
 */

import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateDogSchema } from "@breed-club/shared/validation.js";
import { useDog, useDogs, useAdminUpdateDog } from "@/hooks/useDogs";
import { useContacts } from "@/hooks/useContacts";
import type { z } from "zod";
import type { Contact } from "@breed-club/shared";

type DogForm = z.infer<typeof updateDogSchema>;

function ContactTypeahead({
  value,
  onChange,
  label,
  initialLabel,
}: {
  value?: string;
  onChange: (id: string | undefined) => void;
  label: string;
  initialLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSelected, setHasSelected] = useState(!!value);
  const { data: contactsData } = useContacts(search);
  const contacts = contactsData?.data || [];
  const selectedContact = contacts.find((c) => c.id === value);

  const displayValue = search || selectedContact?.full_name || (hasSelected ? initialLabel : "") || "";

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} <span className="text-gray-400">(optional)</span>
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
            if (!e.target.value) {
              onChange(undefined);
              setHasSelected(false);
            }
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search by name, kennel, or email..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setSearch("");
              setHasSelected(false);
            }}
            className="px-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>
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
                setHasSelected(true);
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
    </div>
  );
}

function DogTypeahead({
  value,
  onChange,
  label,
  excludeId,
  sex,
  initialLabel,
}: {
  value?: string;
  onChange: (id: string | undefined) => void;
  label: string;
  excludeId?: string;
  sex?: "male" | "female";
  initialLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasSelected, setHasSelected] = useState(!!value);
  const { data: dogsData } = useDogs(1, search, sex);
  const dogs = dogsData?.data || [];
  const selectedDog = dogs.find((d) => d.id === value);

  const displayValue = search || selectedDog?.registered_name || (hasSelected ? initialLabel : "") || "";

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} <span className="text-gray-400">(optional)</span>
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(true);
            if (!e.target.value) {
              onChange(undefined);
              setHasSelected(false);
            }
          }}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search by registered name..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setSearch("");
              setHasSelected(false);
            }}
            className="px-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>
      {showDropdown && search && dogs.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {dogs
            .filter((dog) => dog.id !== excludeId)
            .map((dog) => (
              <button
                type="button"
                key={dog.id}
                onClick={() => {
                  onChange(dog.id);
                  setSearch("");
                  setShowDropdown(false);
                  setHasSelected(true);
                }}
                className="w-full px-3 py-2 text-left hover:bg-gray-100 focus:bg-gray-100"
              >
                <div className="font-medium">{dog.registered_name}</div>
                {dog.call_name && <div className="text-sm text-gray-600">{dog.call_name}</div>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export function DogEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error } = useDog(id);
  const updateMutation = useAdminUpdateDog();
  const [generalError, setGeneralError] = useState<string | null>(null);

  const dog = data?.dog;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DogForm>({
    resolver: zodResolver(updateDogSchema),
    values: dog
      ? {
          registered_name: dog.registered_name,
          call_name: dog.call_name ?? undefined,
          microchip_number: dog.microchip_number ?? undefined,
          sex: (dog.sex === "male" || dog.sex === "female" ? dog.sex : undefined) as
            | "male"
            | "female"
            | undefined,
          date_of_birth: dog.date_of_birth ?? undefined,
          date_of_death: dog.date_of_death ?? undefined,
          color: dog.color ?? undefined,
          coat_type: dog.coat_type ?? undefined,
          sire_id: dog.sire_id ?? undefined,
          dam_id: dog.dam_id ?? undefined,
          owner_id: dog.owner_id ?? undefined,
          breeder_id: dog.breeder_id ?? undefined,
          is_public: dog.is_public ?? false,
        }
      : undefined,
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-12 text-gray-600">Loading dog details...</div>
      </div>
    );
  }

  if (error || !dog) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center py-12">
          <p className="text-red-600 mb-4">Failed to load dog details.</p>
          <Link to="/registry" className="text-gray-700 hover:text-gray-900 underline">
            Back to Registry
          </Link>
        </div>
      </div>
    );
  }

  const onSubmit = async (formData: DogForm) => {
    try {
      setGeneralError(null);
      // Strip null values to undefined for the API
      const cleaned = Object.fromEntries(
        Object.entries(formData).map(([k, v]) => [k, v === null ? undefined : v])
      );
      await updateMutation.mutateAsync({ id: id!, ...cleaned });
      navigate(`/dogs/${id}`);
    } catch {
      setGeneralError("Failed to update dog. Please try again.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to={`/dogs/${id}`} className="text-gray-600 hover:text-gray-900 text-sm">
          ← Back to {dog.registered_name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Edit Dog</h1>
      <p className="text-gray-600 mb-8">
        Update information for <strong>{dog.registered_name}</strong>.
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

          <div>
            <label htmlFor="coat_type" className="block text-sm font-medium text-gray-700 mb-1">
              Coat Type <span className="text-gray-400">(optional)</span>
            </label>
            <input
              {...register("coat_type")}
              type="text"
              id="coat_type"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="date_of_death" className="block text-sm font-medium text-gray-700 mb-1">
              Date of Death <span className="text-gray-400">(optional)</span>
            </label>
            <input
              {...register("date_of_death")}
              type="date"
              id="date_of_death"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
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
                initialLabel={dog.owner?.full_name}
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
                initialLabel={dog.breeder?.full_name}
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
              <DogTypeahead
                value={typeof field.value === "string" ? field.value : undefined}
                onChange={field.onChange}
                label="Sire"
                excludeId={id}
                sex="male"
                initialLabel={dog.sire?.registered_name}
              />
            )}
          />

          <Controller
            name="dam_id"
            control={control}
            render={({ field }) => (
              <DogTypeahead
                value={typeof field.value === "string" ? field.value : undefined}
                onChange={field.onChange}
                label="Dam"
                excludeId={id}
                sex="female"
                initialLabel={dog.dam?.registered_name}
              />
            )}
          />
        </div>

        {/* Visibility */}
        <div className="flex items-center gap-2">
          <input {...register("is_public")} type="checkbox" id="is_public" className="rounded" />
          <label htmlFor="is_public" className="text-sm text-gray-700">
            Make this dog's profile public (visible to non-members)
          </label>
        </div>

        {generalError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{generalError}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting || updateMutation.isPending}
            className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            {isSubmitting || updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/dogs/${id}`)}
            className="px-6 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Health Clearances link */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <Link
          to={`/health/${id}`}
          className="text-sm text-purple-600 hover:text-purple-700 font-medium"
        >
          Manage Health Clearances →
        </Link>
      </div>
    </div>
  );
}
