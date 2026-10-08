import { BrainCircuit, Car, CarFront, Repeat, ScanLine, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { useViolationStatistics } from "@/api/queries";
import { DonutChart, TimeseriesChart } from "@/components/charts";
import { Card, CardHeader, ErrorBlock, KpiTile, LoadingBlock, PageHeader } from "@/components/ui";
import { CameraBars, HourChart, pendingCount, statusItems, TypeCard } from "@/components/violations/blocks";
import { EventsTable } from "@/components/violations/EventsTable";
import { FilterBar } from "@/components/violations/FilterBar";
import { useViolationFilters } from "@/components/violations/filters";
import { ViolationsNav } from "@/components/violations/ViolationsNav";
import { formatConfidence, formatDate, formatNumber, formatPct } from "@/lib/format";
import type { ViolationStatistics } from "@/lib/types";

function SecondaryStat({ icon: Icon, label, value, to }: { icon: typeof Car; label: string; value: string; to?: string }) {
  const body = (
    <>
      <Icon className="h-4 w-4 text-mute" />
      <span className="text-mute">{label}</span>
      <span className="font-semibold tabular-nums text-ink">{value}</span>
    </>
  );
  const className = "inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 text-[13px]";
  return to ? (
    <Link to={to} className={`${className} transition hover:border-ink/30`}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

function Kpis({ s, vehiclesLink }: { s: ViolationStatistics | undefined; vehiclesLink: (repeat: boolean) => string }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={Car}
          tone="blue"
          label="Jami o‘tgan avtomobillar"
          value={formatNumber(s?.total_vehicles)}
          hint={s ? "kameralar qayd etgan barcha o‘tishlar" : undefined}
        />
        <KpiTile
          icon={TriangleAlert}
          tone="red"
          label="Jami qoidabuzarliklar"
          value={formatNumber(s?.total_violations)}
          hint={s?.violation_rate_pct != null ? `o‘tishlarning ${formatPct(s.violation_rate_pct, 2)} qismi` : undefined}
        />
        <KpiTile
          icon={CarFront}
          tone="green"
          label="Unikal avtomobillar"
          value={formatNumber(s?.unique_vehicles)}
          hint={s ? "takrorlanmas davlat raqamlari" : undefined}
        />
        <KpiTile
          icon={BrainCircuit}
          tone="violet"
          label="AI o‘rtacha aniqligi"
          value={s?.avg_confidence != null ? formatConfidence(s.avg_confidence) : "—"}
          hint={s ? `${formatNumber(s.total_violations)} ta hodisa bo‘yicha` : undefined}
        />
      </div>
      {s && (
        <div className="mt-3 flex flex-wrap gap-2">
          <SecondaryStat icon={CarFront} label="Qoidabuzar avtomobillar" value={formatNumber(s.unique_violators)} to={vehiclesLink(false)} />
          <SecondaryStat icon={Repeat} label="Takroriy qoidabuzarlar" value={formatNumber(s.repeat_violators)} to={vehiclesLink(true)} />
          <SecondaryStat icon={ScanLine} label="Raqami aniqlanmagan" value={formatNumber(s.unrecognized_plates)} />
          <SecondaryStat icon={TriangleAlert} label="Ko‘rib chiqish kutilmoqda" value={formatNumber(pendingCount(s.by_status))} />
        </div>
      )}
    </>
  );
}

export default function ViolationsPage() {
  const filters = useViolationFilters();
  const stats = useViolationStatistics(filters.apiParams);
  const s = stats.data;
  const period = `${formatDate(`${filters.range.from}T12:00:00`)} – ${formatDate(`${filters.range.to}T12:00:00`)}`;

  return (
    <>
      <PageHeader
        title="Qoidabuzarliklar"
        subtitle={`Kameralar — manba, avtomobillar — obyekt, hodisalar — qoidabuzarlik · ${period}`}
        crumbs={[{ label: "Bosh sahifa", to: "/" }, { label: "Qoidabuzarliklar" }]}
      />
      <ViolationsNav filters={filters} />
      <FilterBar filters={filters} />

      <div className="space-y-5">
        {stats.isError && !s ? <ErrorBlock error={stats.error} onRetry={() => void stats.refetch()} /> : null}
        <Kpis s={s} vehiclesLink={(repeat) => filters.linkTo("/violations/vehicles", { repeat: repeat ? "1" : null })} />

        <Card>
          <CardHeader title="Qoidabuzarlik turlari" subtitle="Hodisalar soni bo‘yicha — avtomobillar soni emas" to={filters.linkTo("/violations/types")} />
          <div className="p-5 pt-3">
            {s ? (
              s.by_type.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                  {s.by_type.map((stat) => (
                    <TypeCard key={stat.code} stat={stat} to={filters.linkTo(`/violations/types/${stat.code}`, { type: null })} />
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-[13px] text-mute">Tanlangan filtrlar bo‘yicha hodisa topilmadi</p>
              )
            ) : (
              <LoadingBlock />
            )}
          </div>
        </Card>

        {s && (
          <div className="grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Hodisalar dinamikasi" subtitle={s.series.bucket === "hour" ? "Soatlik, turlar kesimida" : "Kunlik, turlar kesimida"} />
              <div className="px-3 pb-4">
                <TimeseriesChart data={s.series} stacked height={280} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Status bo‘yicha" subtitle="Hodisalarni ko‘rib chiqish holati" />
              <div className="p-5 pt-2">
                <DonutChart items={statusItems(s.by_status)} total={s.total_violations} height={180} />
              </div>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader title="Sutka soatlari bo‘yicha" subtitle="Hodisalar qaysi soatlarda ko‘p sodir bo‘ladi" />
              <div className="px-3 pb-4">
                <HourChart byHour={s.by_hour} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Eng faol kameralar" subtitle="Hodisa manbalari" to={filters.linkTo("/violations/cameras")} />
              <div className="p-5 pt-2">
                {s.by_camera.length ? <CameraBars cameras={s.by_camera.slice(0, 6)} /> : <p className="text-[13px] text-mute">Ma’lumot yo‘q</p>}
              </div>
            </Card>
          </div>
        )}

        <EventsTable filters={filters} />
      </div>
    </>
  );
}
