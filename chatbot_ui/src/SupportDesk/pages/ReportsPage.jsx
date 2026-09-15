import { useState, useEffect } from "react";
import { statsAPI } from "../../services/supportDeskApi";
import { TrendingUp, Users, Smile, Frown } from "lucide-react";

function fmtDay(d) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A small, dependency-free line chart for the daily CSAT average — an SVG
 * polyline scaled to a fixed 1-5 rating range, with a faint area fill and a
 * dot on the most recent point. No charting library needed for one series. */
function CsatSparkline({ daily }) {
  const width = 640;
  const height = 160;
  const pad = 24;

  if (!daily.length) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--sd-text-faint)", fontSize: "0.84rem" }}>
        No ratings in this window yet.
      </div>
    );
  }

  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const points = daily.map((d, i) => {
    const x = pad + (daily.length === 1 ? innerW / 2 : (i / (daily.length - 1)) * innerW);
    const rating = Number(d.avg_rating) || 0;
    const y = pad + innerH - ((rating - 1) / 4) * innerH; // scale 1..5 -> bottom..top
    return { x, y, ...d };
  });
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(pad + innerH).toFixed(1)} L ${points[0].x.toFixed(1)} ${(pad + innerH).toFixed(1)} Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {[1, 2, 3, 4, 5].map((v) => {
        const y = pad + innerH - ((v - 1) / 4) * innerH;
        return (
          <g key={v}>
            <line x1={pad} y1={y} x2={width - pad} y2={y} stroke="var(--sd-border)" strokeWidth="1" />
            <text x={2} y={y + 3} fontSize="10" fill="var(--sd-text-faint)">{v}</text>
          </g>
        );
      })}
      <path d={areaPath} fill="var(--sd-primary-light)" opacity="0.5" />
      <path d={linePath} fill="none" stroke="var(--sd-primary)" strokeWidth="2" />
      <circle cx={last.x} cy={last.y} r="4" fill="var(--sd-primary-dark)" />
      <text x={last.x} y={last.y - 10} fontSize="11" fontWeight="700" fill="var(--sd-text)" textAnchor="end">
        {Number(last.avg_rating).toFixed(2)}
      </text>
    </svg>
  );
}

function StatTile({ icon: Icon, label, value, sub }) {
  return (
    <div className="sd-card sd-card-pad" style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--sd-primary-light)", color: "var(--sd-primary-dark)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={17} />
      </div>
      <div>
        <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--sd-text-faint)", textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--sd-text)" }}>{value}</div>
        {sub && <div style={{ fontSize: "0.72rem", color: "var(--sd-text-muted)" }}>{sub}</div>}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    statsAPI.csatTrend(days)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [days]);

  const overall = data?.overall || {};
  const satisfiedPct = overall.rating_count > 0 ? Math.round((overall.satisfied_count / overall.rating_count) * 100) : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <TrendingUp size={19} /> CSAT Trend
          </h1>
          <p style={{ fontSize: "0.8rem", color: "var(--sd-text-muted)", margin: "4px 0 0" }}>
            Customer satisfaction ratings on solved tickets, over time and by agent.
          </p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="sd-btn sd-btn-secondary sd-btn-sm" style={{ cursor: "pointer" }}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 12 months</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--sd-text-muted)" }}>Loading...</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <StatTile icon={Smile} label="Average Rating" value={overall.avg_rating ? Number(overall.avg_rating).toFixed(2) : "—"} sub={`${overall.rating_count || 0} rating(s)`} />
            <StatTile icon={Users} label="Satisfied (4-5★)" value={satisfiedPct !== null ? `${satisfiedPct}%` : "—"} sub={`${overall.satisfied_count || 0} tickets`} />
            <StatTile icon={Frown} label="Unsatisfied (1-2★)" value={overall.unsatisfied_count || 0} sub="tickets rated low" />
          </div>

          <div className="sd-card sd-card-pad" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.84rem", fontWeight: 700, marginBottom: 10 }}>Daily average rating</div>
            <CsatSparkline daily={data?.daily || []} />
            {data?.daily?.length > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--sd-text-faint)", marginTop: 4 }}>
                <span>{fmtDay(data.daily[0].date)}</span>
                <span>{fmtDay(data.daily[data.daily.length - 1].date)}</span>
              </div>
            )}
          </div>

          <div className="sd-card sd-card-pad">
            <div style={{ fontSize: "0.84rem", fontWeight: 700, marginBottom: 10 }}>By agent</div>
            {(!data?.byAgent || data.byAgent.length === 0) ? (
              <div style={{ color: "var(--sd-text-faint)", fontSize: "0.82rem" }}>No rated, assigned tickets in this window.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--sd-text-faint)", fontSize: "0.7rem", textTransform: "uppercase" }}>
                    <th style={{ padding: "6px 8px" }}>Agent</th>
                    <th style={{ padding: "6px 8px" }}>Avg Rating</th>
                    <th style={{ padding: "6px 8px" }}>Ratings</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byAgent.map((a) => (
                    <tr key={a.agent_id} style={{ borderTop: "1px solid var(--sd-border)" }}>
                      <td style={{ padding: "8px" }}>{a.agent_name}</td>
                      <td style={{ padding: "8px", fontWeight: 700 }}>{Number(a.avg_rating).toFixed(2)}</td>
                      <td style={{ padding: "8px", color: "var(--sd-text-muted)" }}>{a.rating_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
