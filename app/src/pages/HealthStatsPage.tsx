/**
 * Health statistics dashboard - aggregate health data and charts.
 * Supports two views via ?view= query param:
 *   whole-breed (default) — registry-wide aggregate stats
 *   my-dogs               — stats scoped to the current user's dogs
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

interface OrgStats {
  organization: {
    id: string;
    name: string;
  };
  total_tested: number;
  result_distribution: Array<{
    result: string;
    count: number;
  }>;
}

interface TestTypeStats {
  test_type: {
    id: string;
    name: string;
    short_name?: string;
    category: string;
  };
  total_tested: number;
  by_org: OrgStats[];
}

interface ConditionSeverityDist {
  mild: number;
  moderate: number;
  severe: number;
}

interface ConditionBreedingDist {
  informational: number;
  advisory: number;
  disqualifying: number;
}

interface ConditionStats {
  condition_name: string;
  condition_type_id: string | null;
  total_dogs: number;
  medical_severity_dist: ConditionSeverityDist;
  breeding_impact_dist: ConditionBreedingDist;
}

interface ConditionCategoryStats {
  category: string;
  total_reports: number;
  conditions: ConditionStats[];
}

interface ConditionStatistics {
  by_category: ConditionCategoryStats[];
  total_conditions: number;
}

interface HealthStats {
  overview: {
    total_dogs: number;
    total_clearances: number;
  };
  by_test_type: TestTypeStats[];
  condition_statistics?: ConditionStatistics;
}

type ViewMode = "whole-breed" | "my-dogs";

function StatCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
}) {
  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg">
      <div className="text-sm font-medium text-gray-600 uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-3xl font-bold text-gray-900">{value}</div>
      {subtitle && <div className="mt-1 text-sm text-gray-500">{subtitle}</div>}
    </div>
  );
}

function ResultDistribution({
  distribution,
  totalTested,
}: {
  distribution: OrgStats["result_distribution"];
  totalTested: number;
}) {
  return (
    <div className="space-y-2">
      {distribution.map((dist) => {
        const percentage = totalTested > 0 ? ((dist.count / totalTested) * 100).toFixed(1) : "0";
        return (
          <div key={dist.result} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-gray-700 font-medium">{dist.result}</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
            <div className="ml-3 text-gray-600 min-w-[60px] text-right">
              {dist.count} ({percentage}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TestTypeCard({ stats }: { stats: TestTypeStats }) {
  const hasData = stats.total_tested > 0;

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{stats.test_type.name}</h3>
        {stats.test_type.short_name && (
          <div className="text-sm text-gray-500">({stats.test_type.short_name})</div>
        )}
        <div className="text-sm text-gray-600 mt-1 capitalize">{stats.test_type.category}</div>
      </div>

      <div className="mb-4">
        <div className="text-2xl font-bold text-gray-900">{stats.total_tested}</div>
        <div className="text-sm text-gray-500">dogs tested</div>
      </div>

      {hasData ? (
        <div className="space-y-4">
          {stats.by_org.map((orgStats) => {
            if (orgStats.total_tested === 0) return null;
            return (
              <div key={orgStats.organization.id}>
                <div className="text-sm font-medium text-gray-700 mb-2">
                  {orgStats.organization.name}
                  <span className="ml-1 text-gray-400 font-normal">
                    ({orgStats.total_tested})
                  </span>
                </div>
                <ResultDistribution
                  distribution={orgStats.result_distribution}
                  totalTested={orgStats.total_tested}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-sm text-gray-500 italic">No test results yet</div>
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  reproductive: "Reproductive",
  neurological: "Neurological",
  musculoskeletal: "Musculoskeletal",
  cardiac: "Cardiac",
  dermatological: "Dermatological",
  gastrointestinal: "Gastrointestinal",
  endocrine: "Endocrine",
  cancer: "Cancer / Neoplasia",
  immune: "Immune / Autoimmune",
  behavioral: "Behavioral",
  other: "Other",
};

const BREEDING_IMPACT_COLORS: Record<string, string> = {
  informational: "bg-blue-100 text-blue-800",
  advisory: "bg-yellow-100 text-yellow-800",
  disqualifying: "bg-red-100 text-red-800",
};

const MEDICAL_SEVERITY_COLORS: Record<string, string> = {
  mild: "bg-green-100 text-green-800",
  moderate: "bg-yellow-100 text-yellow-800",
  severe: "bg-red-100 text-red-800",
};

function SeverityPill({ label, colorClass, count }: { label: string; colorClass: string; count: number }) {
  if (count === 0) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {count} {label}
    </span>
  );
}

function ConditionRow({
  condition,
  totalDogs,
}: {
  condition: ConditionStats;
  totalDogs: number;
}) {
  const pct = totalDogs > 0 ? ((condition.total_dogs / totalDogs) * 100).toFixed(1) : "0";
  const { medical_severity_dist: ms, breeding_impact_dist: bi } = condition;
  const hasMedical = ms.mild + ms.moderate + ms.severe > 0;
  const hasBreeding = bi.informational + bi.advisory + bi.disqualifying > 0;

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900">{condition.condition_name}</span>
          {(hasMedical || hasBreeding) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {hasMedical && (
                <>
                  <SeverityPill label="mild" colorClass={MEDICAL_SEVERITY_COLORS.mild} count={ms.mild} />
                  <SeverityPill label="moderate" colorClass={MEDICAL_SEVERITY_COLORS.moderate} count={ms.moderate} />
                  <SeverityPill label="severe" colorClass={MEDICAL_SEVERITY_COLORS.severe} count={ms.severe} />
                </>
              )}
              {hasBreeding && (
                <>
                  <SeverityPill label="info" colorClass={BREEDING_IMPACT_COLORS.informational} count={bi.informational} />
                  <SeverityPill label="advisory" colorClass={BREEDING_IMPACT_COLORS.advisory} count={bi.advisory} />
                  <SeverityPill label="disqualifying" colorClass={BREEDING_IMPACT_COLORS.disqualifying} count={bi.disqualifying} />
                </>
              )}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-gray-900">{condition.total_dogs}</div>
          <div className="text-xs text-gray-500">{pct}%</div>
        </div>
      </div>
    </div>
  );
}

function ConditionCategoryCard({
  catStats,
  totalDogs,
}: {
  catStats: ConditionCategoryStats;
  totalDogs: number;
}) {
  const label = CATEGORY_LABELS[catStats.category] ?? catStats.category;
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-5 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">{label}</h3>
        <span className="text-xs text-gray-500">{catStats.total_reports} report{catStats.total_reports !== 1 ? "s" : ""}</span>
      </div>
      <div className="px-5 divide-y divide-gray-100">
        {catStats.conditions.map((c) => (
          <ConditionRow key={c.condition_name} condition={c} totalDogs={totalDogs} />
        ))}
      </div>
    </div>
  );
}

export function HealthStatsPage() {
  const { getToken, isSignedIn } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const rawView = searchParams.get("view");
  const view: ViewMode = rawView === "my-dogs" ? "my-dogs" : "whole-breed";

  const { data, isLoading, error } = useQuery<HealthStats>({
    queryKey: ["health", "statistics", view],
    queryFn: async () => {
      const token = await getToken();
      const endpoint = view === "my-dogs" ? "/health/my-statistics" : "/health/statistics";
      return api.get<HealthStats>(endpoint, { token });
    },
    enabled: isSignedIn === true,
  });

  function handleViewChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as ViewMode;
    if (next === "whole-breed") {
      navigate("/health-stats");
    } else {
      navigate("/health-stats?view=my-dogs");
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12 text-gray-600">Loading health statistics...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="text-center py-12">
          <p className="text-red-600">Failed to load health statistics.</p>
        </div>
      </div>
    );
  }

  const { overview, by_test_type, condition_statistics } = data;

  // Group by category
  const categorized = by_test_type.reduce(
    (acc, stats) => {
      const category = stats.test_type.category || "Other";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(stats);
      return acc;
    },
    {} as Record<string, TestTypeStats[]>
  );

  const categories = Object.keys(categorized).sort();

  const subtitleMap: Record<ViewMode, string> = {
    "whole-breed": "Aggregate health testing data across the registry",
    "my-dogs": "Health testing data for your dogs",
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Health Statistics</h1>
          <p className="text-gray-600 mt-2">{subtitleMap[view]}</p>
        </div>
        <div className="shrink-0">
          <select
            value={view}
            onChange={handleViewChange}
            className="block w-full sm:w-auto rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="whole-breed">Whole Breed</option>
            <option value="my-dogs">My Dogs</option>
          </select>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Total Dogs"
          value={overview.total_dogs}
          subtitle={view === "my-dogs" ? "your dogs" : "in the registry"}
        />
        <StatCard
          label="Total Clearances"
          value={overview.total_clearances}
          subtitle="approved tests"
        />
        <StatCard
          label="Test Types"
          value={by_test_type.length}
          subtitle="available tests"
        />
        <StatCard
          label="Reported Conditions"
          value={condition_statistics?.total_conditions ?? 0}
          subtitle="health issues reported"
        />
      </div>

      {/* Test Type Statistics by Category */}
      {categories.map((category) => (
        <div key={category} className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 capitalize">{category}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categorized[category].map((stats) => (
              <TestTypeCard key={stats.test_type.id} stats={stats} />
            ))}
          </div>
        </div>
      ))}

      {by_test_type.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600">
            {view === "my-dogs"
              ? "No health test data found for your dogs."
              : "No health test data available yet."}
          </p>
        </div>
      )}

      {/* Reported Health Conditions */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Reported Health Conditions</h2>
        <p className="text-sm text-gray-500 mb-6">
          Health issues reported by owners and verified by club administrators. Shows distinct dogs affected and severity breakdown.
        </p>

        {condition_statistics && condition_statistics.by_category.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {condition_statistics.by_category.map((catStats) => (
              <ConditionCategoryCard
                key={catStats.category}
                catStats={catStats}
                totalDogs={overview.total_dogs}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <p className="text-gray-500 text-sm">
              {view === "my-dogs"
                ? "No health conditions reported for your dogs."
                : "No health conditions have been reported yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
