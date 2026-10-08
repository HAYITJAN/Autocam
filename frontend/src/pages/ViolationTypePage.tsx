import { BrainCircuit, CarFront, CheckCircle2, Clock3, TriangleAlert } from "lucide-react";
import { useParams } from "react-router-dom";

import { useViolationTypeDetail } from "@/api/queries";
import { TimeseriesChart } from "@/components/charts";
import { Card, CardHeader, KpiTile, PageHeader, QueryView, SeverityBadge } from "@/components/ui";
import { CameraBars, HourChart } from "@/components/violations/blocks";
import { EventsTable } from "@/components/violations/EventsTable";
import { FilterBar } from "@/components/violations/FilterBar";
import { useViolationFilters } from "@/components/violations/filters";
import { TypeIcon } from "@/components/violations/parts";
import { ViolationsNav } from "@/components/violations/ViolationsNav";
import { formatConfidence, formatNumber, formatPct } from "@/lib/format";

/** Events of one violation type: type KPIs, its dynamics and the event list. */
export default function ViolationTypePage() {
  const code = useParams().code ?? "";
  const filters = useViolationFilters();
  const query = useViolationTypeDetail(code, { ...filters.apiParams, violation_type: undefined });

  return (
    <QueryView query={query}>
      {({ type, by_camera, by_hour, series }) => (
        <>
          <PageHeader
            title={
              <span className="inline-flex items-center gap-3">
                <TypeIcon code={type.code} icon={type.icon} color={type.color} className="h-11 w-11" />
                {type.name}
              </span>
            }
            subtitle={type.description ?? undefined}
            crumbs={[
              { label: "Bosh sahifa", to: "/" },
              { label: "Qoidabuzarliklar", to: filters.linkTo("/violations") },
              { label: "Turlar", to: filters.linkTo("/violations/types") },
              { label: type.name },
            ]}
            actions={<SeverityBadge severity={type.severity} />}
          />
          <ViolationsNav filters={filters} />
          <FilterBar filters={filters} hide={["type"]} />

          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KpiTile icon={TriangleAlert} tone="red" label="Hodisalar" value={formatNumber(type.count)} hint={`barcha hodisalarning ${formatPct(type.pct)}`} />
              <KpiTile icon={CarFront} tone="blue" label="Unikal avtomobillar" value={formatNumber(type.unique_vehicles)} />
              <KpiTile icon={Clock3} tone="amber" label="Ko‘rib chiqish kutilmoqda" value={formatNumber(type.pending)} />
              <KpiTile icon={CheckCircle2} tone="green" label="Tasdiqlangan" value={formatNumber(type.confirmed)} />
              <KpiTile
                icon={BrainCircuit}
                tone="violet"
                label="AI o‘rtacha aniqligi"
                value={type.avg_confidence !== null ? formatConfidence(type.avg_confidence) : "—"}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader title="Dinamika" subtitle={series.bucket === "hour" ? "Soatlik hodisalar" : "Kunlik hodisalar"} />
                <div className="px-3 pb-4">
                  <TimeseriesChart data={{ ...series, series: series.series.filter((item) => item.code === type.code) }} stacked height={240} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Kameralar" subtitle="Bu tur eng ko‘p qayd etilgan joylar" />
                <div className="p-5 pt-2">{by_camera.length ? <CameraBars cameras={by_camera.slice(0, 6)} /> : <p className="text-[13px] text-mute">Ma’lumot yo‘q</p>}</div>
              </Card>
              <Card className="xl:col-span-3">
                <CardHeader title="Sutka soatlari bo‘yicha" />
                <div className="px-3 pb-4">
                  <HourChart byHour={by_hour} height={200} />
                </div>
              </Card>
            </div>

            <EventsTable filters={filters} params={{ violation_type: type.code }} showType={false} title={`${type.name} — hodisalar`} />
          </div>
        </>
      )}
    </QueryView>
  );
}
