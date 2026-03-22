/**
 * Public breeder directory page.
 * Cards show logo, kennel name, state, pup status badge, and breeder's color scheme.
 * Clicking a card opens a detailed modal.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MapPin, Globe, X } from "lucide-react";

interface Breeder {
  id: string;
  kennel_name: string | null;
  full_name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website_url: string | null;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string | null;
  accent_color: string | null;
  pup_status: "available" | "expected" | "none" | null;
  pup_expected_date: string | null;
}

function PupBadge({ status, date }: { status: string | null; date: string | null }) {
  if (!status || status === "none") return null;

  if (status === "available") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Pups Available
      </span>
    );
  }

  const label = date
    ? `Expected ${new Date(date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
    : "Pups Expected";

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      {label}
    </span>
  );
}

function BreederCard({ breeder, onClick }: { breeder: Breeder; onClick: () => void }) {
  const bg = breeder.primary_color || "#ffffff";
  const fg = breeder.accent_color || "#111827";
  const hasBranding = !!breeder.primary_color;
  const displayName = breeder.kennel_name || breeder.full_name;
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div
      onClick={onClick}
      className="rounded-xl border overflow-hidden cursor-pointer hover:shadow-md transition"
      style={{
        backgroundColor: bg,
        borderColor: hasBranding ? bg : "#e5e7eb",
      }}
    >
      <div className="p-5">
        <div className="flex items-center gap-3">
          {breeder.logo_url ? (
            <img
              src={breeder.logo_url}
              alt={displayName}
              className="w-12 h-12 object-cover rounded-lg flex-shrink-0"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: fg, color: bg }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold truncate" style={{ color: fg }}>{displayName}</h3>
            {breeder.state && (
              <div className="flex items-center gap-1 text-sm" style={{ color: fg, opacity: 0.7 }}>
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span>{breeder.state}</span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3">
          <PupBadge status={breeder.pup_status} date={breeder.pup_expected_date} />
        </div>
      </div>
    </div>
  );
}

function BreederModal({ breeder, onClose }: { breeder: Breeder; onClose: () => void }) {
  const color = breeder.primary_color || "#655e7a";
  const accent = breeder.accent_color || "#655e7a";
  const displayName = breeder.kennel_name || breeder.full_name;
  const initials = displayName.slice(0, 2).toUpperCase();
  const location = [breeder.city, breeder.state, breeder.country].filter(Boolean).join(", ");

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner / header */}
        {breeder.banner_url ? (
          <div className="relative h-36">
            <img
              src={breeder.banner_url}
              alt=""
              className="w-full h-full object-cover"
            />
            <button
              onClick={onClose}
              className="absolute top-2 right-2 p-1 bg-black/40 rounded-full text-white hover:bg-black/60"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="relative h-20" style={{ backgroundColor: color }}>
            <button
              onClick={onClose}
              className="absolute top-2 right-2 p-1 bg-black/20 rounded-full text-white hover:bg-black/40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Logo overlapping banner */}
        <div className="px-6 -mt-10 relative z-10">
          {breeder.logo_url ? (
            <img
              src={breeder.logo_url}
              alt={displayName}
              className="w-20 h-20 object-cover rounded-xl border-4 border-white shadow-sm"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-xl border-4 border-white shadow-sm flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: color }}
            >
              {initials}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-6 pb-6 pt-3">
          <h2 className="text-xl font-bold text-gray-900">{displayName}</h2>
          {breeder.kennel_name && (
            <p className="text-sm text-gray-600">{breeder.full_name}</p>
          )}

          {location && (
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-2">
              <MapPin className="h-3.5 w-3.5" />
              <span>{location}</span>
            </div>
          )}

          {breeder.website_url && (
            <div className="flex items-center gap-1.5 text-sm mt-2">
              <Globe className="h-3.5 w-3.5 text-gray-500" />
              <a
                href={breeder.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
                style={{ color: accent }}
              >
                Visit Website
              </a>
            </div>
          )}

          <div className="mt-4">
            <PupBadge status={breeder.pup_status} date={breeder.pup_expected_date} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DirectoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["breeders"],
    queryFn: () => api.get<{ data: Breeder[] }>("/public/breeders"),
  });

  const [selectedBreeder, setSelectedBreeder] = useState<Breeder | null>(null);
  const breeders = data?.data ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Breeder Directory</h1>
      <p className="text-gray-600 mb-8">
        Active breeders who are members of the club.
      </p>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}

      {!isLoading && breeders.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No breeders listed yet.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {breeders.map((breeder) => (
          <BreederCard
            key={breeder.id}
            breeder={breeder}
            onClick={() => setSelectedBreeder(breeder)}
          />
        ))}
      </div>

      {selectedBreeder && (
        <BreederModal
          breeder={selectedBreeder}
          onClose={() => setSelectedBreeder(null)}
        />
      )}
    </div>
  );
}
