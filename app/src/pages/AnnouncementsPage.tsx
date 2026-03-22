/**
 * Public litter announcements page.
 * Shows approved litters with available pups.
 */

import { usePublicAnnouncements } from "@/hooks/useLitters";
import { formatDate } from "@/lib/utils";

export function AnnouncementsPage() {
  const { data, isLoading, error } = usePublicAnnouncements();
  const announcements = data?.data || [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-gray-600">Loading announcements...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Failed to load announcements. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Litter Announcements</h1>

      {announcements.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-600">No litter announcements at this time.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {announcements.map((litter) => {
            const availableCount =
              litter.pups?.filter((p: any) => p.status === "available").length || 0;
            const totalPups = litter.pups?.length || 0;

            return (
              <div
                key={litter.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition"
              >
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {litter.sire?.call_name || litter.sire?.registered_name || "Unknown"} x{" "}
                    {litter.dam?.call_name || litter.dam?.registered_name || "Unknown"}
                  </h3>
                </div>

                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  {litter.whelp_date && (
                    <p>
                      <span className="font-medium">Whelped:</span>{" "}
                      {formatDate(litter.whelp_date)}
                    </p>
                  )}
                  {totalPups > 0 && (
                    <p>
                      <span className="font-medium">Available:</span> {availableCount} of{" "}
                      {totalPups} pups
                    </p>
                  )}
                </div>

                {litter.breeder && (
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-sm font-medium text-gray-900">Breeder</p>
                    <p className="text-sm text-gray-600">
                      {litter.breeder.kennel_name || litter.breeder.full_name}
                    </p>
                    {litter.breeder.city && litter.breeder.state && (
                      <p className="text-sm text-gray-500">
                        {litter.breeder.city}, {litter.breeder.state}
                      </p>
                    )}
                    {litter.breeder.email && (
                      <a
                        href={`mailto:${litter.breeder.email}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Contact Breeder
                      </a>
                    )}
                  </div>
                )}

                {litter.notes && (
                  <p className="mt-3 text-sm text-gray-600 line-clamp-3">{litter.notes}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
