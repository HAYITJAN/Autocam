import { ArrowRight, Video } from "lucide-react";
import { Link } from "react-router-dom";

import { useViolationStatistics } from "@/api/queries";
import { CardHeader, PageHeader, QueryView } from "@/components/ui";
import { FilterBar } from "@/components/violations/FilterBar";
import { useViolationFilters } from "@/components/violations/filters";
import { ViolationsNav } from "@/components/violations/ViolationsNav";
import { formatNumber, formatPct } from "@/lib/format";

/** Cameras as the source of events: how many events and vehicles each camera produced. */
export default function ViolationCamerasPage() {
  const filters = useViolationFilters();
  const query = useViolationStatistics({ ...filters.apiParams, camera_id: undefined, camera_limit: 500 });

  return (
    <>
      <PageHeader
        title="Kameralar — hodisa manbalari"
        subtitle="Kamera qoidabuzarlikni qayd etadigan manba. Kamerani tanlab, u qayd etgan hodisalarni ko‘ring."
        crumbs={[{ label: "Bosh sahifa", to: "/" }, { label: "Qoidabuzarliklar", to: filters.linkTo("/violations") }, { label: "Kameralar" }]}
      />
      <ViolationsNav filters={filters} />
      <FilterBar filters={filters} hide={["camera"]} />

      <section className="card overflow-hidden">
        <QueryView query={query} isEmpty={(s) => s.by_camera.length === 0}>
          {(s) => {
            const max = Math.max(1, ...s.by_camera.map((camera) => camera.count));
            return (
              <>
                <CardHeader title="Kameralar reytingi" subtitle={`${s.by_camera.length} ta kamera · ${formatNumber(s.total_violations)} ta hodisa`} />
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-line">
                    <thead>
                      <tr>
                        <th className="th w-12">№</th>
                        <th className="th">Kamera</th>
                        <th className="th">Tuman</th>
                        <th className="th text-right">Hodisalar</th>
                        <th className="th text-right">Unikal avtomobillar</th>
                        <th className="th w-64">Ulushi</th>
                        <th className="th" aria-label="Amallar" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {s.by_camera.map((camera, index) => (
                        <tr key={camera.id} className="transition hover:bg-soft">
                          <td className="td text-xs tabular-nums text-mute">{index + 1}</td>
                          <td className="td">
                            <div className="font-mono text-xs font-semibold text-ink">{camera.code}</div>
                            <div className="text-[12px] text-mute">{camera.name}</div>
                          </td>
                          <td className="td text-[13px]">{camera.district ?? "—"}</td>
                          <td className="td text-right text-[15px] font-semibold tabular-nums text-ink">{formatNumber(camera.count)}</td>
                          <td className="td text-right tabular-nums">{formatNumber(camera.unique_vehicles)}</td>
                          <td className="td">
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 rounded-full bg-soft">
                                <div className="h-2 rounded-full bg-ink" style={{ width: `${(camera.count / max) * 100}%` }} />
                              </div>
                              <span className="w-12 text-right text-xs text-mute">{formatPct((camera.count / Math.max(1, s.total_violations)) * 100)}</span>
                            </div>
                          </td>
                          <td className="td">
                            <div className="flex justify-end gap-1.5">
                              <Link to={`/cameras/${camera.id}`} className="icon-btn h-8 w-8" title="Kamera sahifasi">
                                <Video className="h-4 w-4" />
                              </Link>
                              <Link to={filters.linkTo("/violations", { camera: String(camera.id) })} className="btn-secondary h-8 px-3 text-xs">
                                Hodisalar <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          }}
        </QueryView>
      </section>
    </>
  );
}
