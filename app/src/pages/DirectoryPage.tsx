/**
 * Public breeder directory page.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MapPin, Mail, Phone, Globe } from "lucide-react";

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
}

export function DirectoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["breeders"],
    queryFn: () => api.get<{ data: Breeder[] }>("/public/breeders"),
  });

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
          <div
            key={breeder.id}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <h3 className="font-semibold text-gray-900">
              {breeder.kennel_name || breeder.full_name}
            </h3>
            {breeder.kennel_name && (
              <p className="text-sm text-gray-600">{breeder.full_name}</p>
            )}

            <div className="mt-3 space-y-1">
              {(breeder.city || breeder.state) && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>
                    {[breeder.city, breeder.state, breeder.country]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
              {breeder.email && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                  <a href={`mailto:${breeder.email}`} className="hover:text-gray-700">
                    {breeder.email}
                  </a>
                </div>
              )}
              {breeder.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                  <a href={`tel:${breeder.phone}`} className="hover:text-gray-700">
                    {breeder.phone}
                  </a>
                </div>
              )}
              {breeder.website_url && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                  <a
                    href={breeder.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-gray-700 underline"
                  >
                    Visit Website
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
