import { useState, useEffect, useRef } from "react";
import { API_URL } from "./config";
import { formatMoney, lagosDate, pdfText, pdfMoney } from "./orderUi";
import "./Analytics.css";

const RANGES = [
  { key: "today", label: "Today", phrase: "today" },
  { key: "7d", label: "Last 7 days", phrase: "over the last 7 days" },
  { key: "30d", label: "Last 30 days", phrase: "over the last 30 days" },
  { key: "month", label: "This month", phrase: "so far this month" },
];
const REFRESH_MS = 120000;

function dayDate(day) {
  return new Date(`${day}T12:00:00`);
}
function weekdayShort(day) {
  return dayDate(day).toLocaleDateString("en-GB", { weekday: "short" });
}
function weekdayLong(day) {
  return dayDate(day).toLocaleDateString("en-GB", { weekday: "long" });
}
function dayMonth(day) {
  return dayDate(day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
function formatRange(start, end) {
  const year = dayDate(end).getFullYear();
  if (start === end) return `${dayMonth(end)} ${year}`;
  return `${dayMonth(start)} to ${dayMonth(end)} ${year}`;
}
function hourText(h) {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}
function percent(part, whole) {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "0.0%";
}
function compactMoney(value) {
  const n = Number(value) || 0;
  if (n >= 1000000) return `₦${(n / 1000000).toFixed(1)}M`;
  if (n >= 10000) return `₦${Math.round(n / 1000)}k`;
  return `₦${n.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}
function countLabel(n, word) {
  return `${n} ${n === 1 ? word : word + "s"}`;
}
function finalY(doc, fallback) {
  return (doc.lastAutoTable && doc.lastAutoTable.finalY) || fallback;
}

function StatCard({ label, value, sub }) {
  return (
    <div className="an-card an-stat">
      <span className="an-stat-label">{label}</span>
      <span className="an-stat-value">{value}</span>
      <span className="an-stat-sub">{sub}</span>
    </div>
  );
}

// token: the vendor's login token. vendorName: shown in the exported report.
// onSessionExpired: called when the server says the login is no longer valid.
function Analytics({ token, vendorName, onSessionExpired }) {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const requestRef = useRef(0);

  async function load(selected, quiet) {
    const requestId = ++requestRef.current;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/vendor/analytics?range=${selected}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.status === 401) {
        if (onSessionExpired) onSessionExpired();
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (requestId !== requestRef.current) return;
      if (!response.ok) throw new Error(body.error || "Failed to load analytics");
      setData(body);
      setError(null);
    } catch (err) {
      if (requestId === requestRef.current) setError(err.message);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    load(range, false);
    const timer = setInterval(() => load(range, true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [range]);

  async function exportReport() {
    if (!data) return;
    setExporting(true);
    try {
      const [{ jsPDF }, tableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = tableModule.autoTable || tableModule.default;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;
      const rangeInfo = RANGES.find((r) => r.key === data.range);
      const tableStyle = {
        margin: { left: margin, right: margin, bottom: 40 },
        styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [35, 74, 66], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 246] },
      };
      const sm = data.summary;

      doc.setTextColor(31, 41, 51);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Analytics report", margin, 44);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text(
        pdfText(`${vendorName || ""}   |   ${rangeInfo.label}: ${formatRange(data.start, data.end)}`),
        margin,
        62,
      );
      doc.text(
        pdfText(
          `Total sales ${pdfMoney(sm.total_sales)}   |   Orders ${sm.total_orders}   |   Average order ${pdfMoney(sm.average_order)}   |   Cancellation rate ${(sm.cancellation_rate * 100).toFixed(1)}%`,
        ),
        margin,
        78,
      );

      let y = 100;
      function heading(text) {
        if (y > pageHeight - 140) {
          doc.addPage();
          y = 40;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(31, 41, 51);
        doc.text(text, margin, y);
        y += 8;
      }

      heading("Order status");
      autoTable(doc, {
        ...tableStyle,
        startY: y,
        head: [["Status", "Orders", "Share"]],
        body: [
          ["Completed", data.status.completed, percent(data.status.completed, sm.total_orders)],
          ["In progress", data.status.in_progress, percent(data.status.in_progress, sm.total_orders)],
          ["Cancelled", data.status.cancelled, percent(data.status.cancelled, sm.total_orders)],
        ],
      });
      y = finalY(doc, y + 60) + 24;

      heading("Sales by day");
      autoTable(doc, {
        ...tableStyle,
        startY: y,
        head: [["Day", "Orders", "Sales"]],
        body: data.sales_by_day.map((d) => [
          pdfText(`${weekdayShort(d.day)} ${dayMonth(d.day)}`),
          d.orders,
          pdfMoney(d.sales),
        ]),
        columnStyles: { 2: { halign: "right" } },
      });
      y = finalY(doc, y + 60) + 24;

      heading("Best-selling items");
      autoTable(doc, {
        ...tableStyle,
        startY: y,
        head: [["#", "Item", "Sold", "Sales"]],
        body: data.best_selling.map((item, idx) => [
          idx + 1,
          pdfText(item.name),
          item.sold,
          pdfMoney(item.sales),
        ]),
        columnStyles: { 3: { halign: "right" } },
      });
      y = finalY(doc, y + 60) + 24;

      heading("Sales by category");
      autoTable(doc, {
        ...tableStyle,
        startY: y,
        head: [["Category", "Items", "Share", "Sales"]],
        body: [
          ...data.categories.map((c) => [
            pdfText(c.category),
            c.items,
            `${(c.share * 100).toFixed(1)}%`,
            pdfMoney(c.sales),
          ]),
          ["Total", data.categories_total.items, "100%", pdfMoney(data.categories_total.sales)],
        ],
        columnStyles: { 3: { halign: "right" } },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 20, {
          align: "right",
        });
      }
      doc.save(`analytics-${data.range}-${lagosDate()}.pdf`);
    } catch (err) {
      setError(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const rangeInfo = RANGES.find((r) => r.key === range);

  if (loading && !data) return <p className="an-muted">Loading analytics...</p>;

  if (!data) {
    return (
      <div className="an-root">
        <div className="an-notice">
          <span>{error || "Couldn't load analytics."}</span>
          <button type="button" onClick={() => load(range, false)}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const sm = data.summary;
  const metric = sm.total_sales > 0 ? "sales" : "orders";
  const values = data.sales_by_day.map((d) => (metric === "sales" ? d.sales : d.orders));
  const maxValue = Math.max(1, ...values);
  const labelEvery = Math.max(1, Math.ceil(data.sales_by_day.length / 8));
  const showValues = data.sales_by_day.length <= 8;
  const status = data.status;

  return (
    <div className="an-root">
      <div className="an-header">
        <div>
          <h1>Analytics</h1>
          <p className="an-subtitle">
            See how your sales, orders and menu items are performing.
          </p>
        </div>
        <button
          type="button"
          className="an-btn-outline"
          onClick={exportReport}
          disabled={exporting}
        >
          {exporting ? "Preparing PDF..." : "Export report"}
        </button>
      </div>

      <div className="an-ranges">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            className={r.key === range ? "an-range an-range-on" : "an-range"}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
        <span className="an-muted">{formatRange(data.start, data.end)}</span>
      </div>

      {error && (
        <div className="an-notice">
          <span>Couldn't refresh · showing the last numbers</span>
        </div>
      )}

      <div className={loading ? "an-body an-body-loading" : "an-body"}>
        <div className="an-stats">
          <StatCard
            label="Total sales"
            value={formatMoney(sm.total_sales)}
            sub={rangeInfo.label}
          />
          <StatCard
            label="Total orders"
            value={sm.total_orders}
            sub={data.days > 1 ? `About ${sm.orders_per_day} a day` : "Received today"}
          />
          <StatCard
            label="Average order"
            value={formatMoney(sm.average_order)}
            sub="Per order"
          />
          <StatCard
            label="Cancellation rate"
            value={`${(sm.cancellation_rate * 100).toFixed(1)}%`}
            sub={`${sm.cancelled_orders} of ${countLabel(sm.total_orders, "order")}`}
          />
        </div>

        <div className="an-grid an-grid-top">
          <div className="an-card">
            <h2 className="an-card-title">
              {metric === "sales" ? "Sales by day" : "Orders by day"}
            </h2>
            <p className="an-muted">
              {metric === "sales"
                ? `Money taken each day ${rangeInfo.phrase}`
                : "Sales will show here once payments are connected. Showing orders for now."}
            </p>
            <div className="an-total-line">
              <span className="an-total-value">{formatMoney(sm.total_sales)}</span>
              <span className="an-muted">
                from {countLabel(sm.total_orders, "order")}
              </span>
            </div>
            <div
              className="an-chart"
              style={{ gridTemplateColumns: `repeat(${data.sales_by_day.length}, minmax(0, 1fr))` }}
              role="img"
              aria-label="Chart of each day"
            >
              {data.sales_by_day.map((d, idx) => {
                const value = values[idx];
                const isToday = d.day === data.end;
                return (
                  <div key={d.day} className="an-bar-col">
                    <div className="an-bar-track">
                      {showValues && value > 0 && (
                        <span className="an-bar-value">
                          {metric === "sales" ? compactMoney(value) : value}
                        </span>
                      )}
                      <div
                        className={
                          value === 0
                            ? "an-bar an-bar-empty"
                            : isToday
                              ? "an-bar an-bar-now"
                              : "an-bar an-bar-past"
                        }
                        style={{ "--h": value / maxValue }}
                        title={`${weekdayShort(d.day)} ${dayMonth(d.day)}: ${
                          metric === "sales" ? formatMoney(d.sales) : countLabel(d.orders, "order")
                        }`}
                      />
                    </div>
                    <span className="an-bar-label">
                      {idx % labelEvery === 0
                        ? data.sales_by_day.length <= 7
                          ? weekdayShort(d.day)
                          : dayMonth(d.day)
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="an-muted an-foot">
              Today's bar is darker because the day is still in progress.
            </p>
          </div>

          <div className="an-card">
            <h2 className="an-card-title">Order status</h2>
            <p className="an-muted">
              How your {countLabel(sm.total_orders, "order")} ended up
            </p>
            <div className="an-stack" aria-hidden="true">
              <span className="an-seg an-seg-completed" style={{ flexGrow: status.completed }} />
              <span className="an-seg an-seg-progress" style={{ flexGrow: status.in_progress }} />
              <span className="an-seg an-seg-cancelled" style={{ flexGrow: status.cancelled }} />
              {sm.total_orders === 0 && <span className="an-seg an-seg-none" style={{ flexGrow: 1 }} />}
            </div>
            {[
              ["Completed", status.completed, "completed"],
              ["In progress", status.in_progress, "progress"],
              ["Cancelled", status.cancelled, "cancelled"],
            ].map(([label, count, tone]) => (
              <div key={label} className="an-status-row">
                <span className={`an-dot an-dot-${tone}`} />
                <span className="an-status-label">{label}</span>
                <strong>{count}</strong>
                <span className="an-muted an-pct">{percent(count, sm.total_orders)}</span>
              </div>
            ))}
            <div className="an-busy">
              <div className="an-busy-card">
                <span className="an-muted">Busiest day</span>
                <strong>{data.busiest_day ? weekdayLong(data.busiest_day.day) : "-"}</strong>
                <span className="an-muted">
                  {data.busiest_day ? countLabel(data.busiest_day.orders, "order") : "No orders yet"}
                </span>
              </div>
              <div className="an-busy-card">
                <span className="an-muted">Busiest hour</span>
                <strong>{data.busiest_hour ? hourText(data.busiest_hour.hour) : "-"}</strong>
                <span className="an-muted">
                  {data.busiest_hour ? `to ${hourText((data.busiest_hour.hour + 1) % 24)}` : "No orders yet"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="an-grid an-grid-bottom">
          <div className="an-card">
            <h2 className="an-card-title">Best-selling items</h2>
            <p className="an-muted">What customers ordered most {rangeInfo.phrase}</p>
            {data.best_selling.length === 0 ? (
              <p className="an-empty">No sales in this period yet.</p>
            ) : (
              <>
                <div className="an-list">
                  {data.best_selling.map((item, idx) => (
                    <div key={item.id} className="an-list-row">
                      <span className="an-rank">{idx + 1}</span>
                      <div className="an-list-name">
                        <div className="an-strong">{item.name}</div>
                        <div className="an-muted">{item.sold} sold</div>
                      </div>
                      <span className="an-strong">{formatMoney(item.sales)}</span>
                    </div>
                  ))}
                </div>
                <div className="an-list-total">
                  <span className="an-strong">
                    Top {data.best_selling.length} {data.best_selling.length === 1 ? "item" : "items"} combined
                  </span>
                  <span>
                    <span className="an-muted">{data.best_selling_total.sold} sold </span>
                    <span className="an-strong">{formatMoney(data.best_selling_total.sales)}</span>
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="an-card">
            <h2 className="an-card-title">Sales by category</h2>
            <p className="an-muted">Which parts of your menu earn the most</p>
            {data.categories.length === 0 ? (
              <p className="an-empty">No sales in this period yet.</p>
            ) : (
              <div className="an-table">
                <div className="an-tr an-th">
                  <span>Category</span>
                  <span>Items</span>
                  <span>Share</span>
                  <span>Sales</span>
                </div>
                {data.categories.map((c) => (
                  <div key={c.category} className="an-tr">
                    <span className="an-strong">{c.category}</span>
                    <span className="an-muted">{c.items}</span>
                    <span className="an-muted">{(c.share * 100).toFixed(1)}%</span>
                    <span>{formatMoney(c.sales)}</span>
                  </div>
                ))}
                <div className="an-tr an-tr-total">
                  <span className="an-strong">Total</span>
                  <span className="an-strong">{data.categories_total.items}</span>
                  <span className="an-strong">100%</span>
                  <span className="an-strong">{formatMoney(data.categories_total.sales)}</span>
                </div>
              </div>
            )}
            <p className="an-muted an-foot">Figures update every few minutes.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Analytics;