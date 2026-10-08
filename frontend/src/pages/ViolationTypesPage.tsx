import { useViolationTypeStats } from "@/api/queries";
import { DonutChart } from "@/components/charts";
import { Card, CardHeader, PageHeader, QueryView } from "@/components/ui";
import { TypeCard } from "@/components/violations/blocks";
import { FilterBar } from "@/components/violations/FilterBar";
import { useViolationFilters } from "@/components/violations/filters";
import { ViolationsNav } from "@/components/violations/ViolationsNav";
import { formatNumber } from "@/lib/format";

/** Violation types as groupings of events: each card counts events, not vehicles or cameras. */
export default function ViolationTypesPage() {
  const filters = useViolationFilters();
  const query = useViolationTypeStats({ ...filters.apiParams, violation_type: undefined });

  return (
    <>
      <PageHeader
        title="Qoidabuzarlik turlari"
        subtitle="Har bir tur — hodisalar guruhi. Turni tanlab, shu turdagi barcha hodisalarni ko‘ring."
        crumbs={[{ label: "Bosh sahifa", to: "/" }, { label: "Qoidabuzarliklar", to: filters.linkTo("/violations") }, { label: "Turlar" }]}
      />
      <ViolationsNav filters={filters} />
      <FilterBar filters={filters} hide={["type"]} />
      <QueryView query={query}>
        {(types) => {
          const total = types.reduce((sum, type) => sum + type.count, 0);
          const withEvents = types.filter((type) => type.count > 0);
          return (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid content-start gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {types.map((stat) => (
                  <TypeCard key={stat.code} stat={stat} size="lg" to={filters.linkTo(`/violations/types/${stat.code}`, { type: null })} />
                ))}
              </div>
              <Card className="h-fit xl:sticky xl:top-24">
                <CardHeader title="Turlar ulushi" subtitle={`${formatNumber(total)} ta hodisa, ${withEvents.length} ta turda`} />
                <div className="p-5 pt-2">
                  <DonutChart items={withEvents.map((type) => ({ code: type.code, name: type.name, color: type.color, count: type.count, pct: type.pct }))} total={total} height={200} />
                </div>
              </Card>
            </div>
          );
        }}
      </QueryView>
    </>
  );
}
