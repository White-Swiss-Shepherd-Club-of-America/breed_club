/**
 * Health statistics dashboard - aggregate health data and charts.
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-react";
import { api } from "@/lib/api";

interface TestTypeStats {
  test_type: {
    id: string;
    name: string;
    short_name?: string;
    category: string;
  };
  total_tested: number;
  result_distribution: Array<{
    result: string;
    count: number;
  }>;
}

interface HealthStats {
  overview: {
    total_dogs: number;
    total_clearances: number;
  };
  by_test_type: TestTypeStats[];
}

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

function TestTypeCard({ stats }: { stats: TestTypeStats }) {
  const totalTested = stats.total_tested;
  const hasData = totalTested > 0;

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
        <div className="text-2xl font-bold text-gray-900">{totalTested}</div>
        <div className="text-sm text-gray-500">dogs tested</div>
      </div>

      {hasData ? (
        <div className="space-y-2">
          <div className="text-sm font-medium text-gray-700 mb-2">Results</div>
          {stats.result_distribution.map((dist) => {
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
      ) : (
        <div className="text-sm text-gray-500 italic">No test results yet</div>
      )}
    </div>
  );
}

export function HealthStatsPage() {
  const { getToken, isSignedIn } = useAuth();
  const { data, isLoading, error } = useQuery<HealthStats>({
    queryKey: ["health", "statistics"],
    queryFn: async () => {
      const token = await getToken();
      return api.get<HealthStats>("/health/statistics", { token });
    },
    enabled: isSignedIn === true,
  });

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

  const { overview, by_test_type } = data;

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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Health Statistics</h1>
        <p className="text-gray-600 mt-2">
          Aggregate health testing data across the registry
        </p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          label="Total Dogs"
          value={overview.total_dogs}
          subtitle="in the registry"
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
          <p className="text-gray-600">No health test data available yet.</p>
        </div>
      )}
    </div>
  );
}
