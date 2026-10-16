import { useState, useEffect, useRef } from "react";
import { API_URL } from "./config";
import {
  Icon,
  formatTime,
  formatMoney,
  formatDateTime,
  lagosDate,
} from "./orderUi";
import "./OrderHistory.css";

const STATUS_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const ACTIVITY_LABELS = {
  placed: "Order received",
  accepted: "Accepted by kitchen",
  preparing: "Preparing",
  ready: "Marked as ready",
  picked_up: "Handoff confirmed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function statusLabel(status) {
  return status === "cancelled" ? "Cancelled" : "Completed";
}

function formatDay(dateString) {
  return new Date(`${dateString}T12:00:00`).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function itemSummary(order) {
  const count = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const names = order.items.map((i) => i.name);
  const shown = names.slice(0, 2).join(", ");
  const more = names.length > 2 ? ` +${names.length - 2} more` : "";
  return `${count} ${count === 1 ? "item" : "items"} · ${shown}${more}`;
}

// The PDF's built-in font only supports plain English letters, so this
// removes accents and replaces anything it can't draw with a "?".
function pdfText(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

// The PDF font can't draw the naira sign, so amounts are written as "NGN".
function pdfMoney(value) {
  return pdfText(
    "NGN " +
      (Number(value) || 0).toLocaleString("en-NG", {
        maximumFractionDigits: 2,
      }),
  );
}

function pdfStamp(value) {
  return pdfText(
    new Date(value).toLocaleString([], {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  );
}

// token: the vendor's login token.
// vendorName: shown in "Handoff manually confirmed by ..." and in the PDF.
// onSessionExpired: called when the server says the login is no longer valid.
// onBack: returns to the Order Inbox.
function OrderHistory({ token, vendorName, onSessionExpired, onBack }) {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(lagosDate());
  const [status, setStatus] = useState("completed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.status === 401 && onSessionExpired) onSessionExpired();
    return response;
  }

  function buildParams(pageNum) {
    const params = new URLSearchParams({ page: String(pageNum), status });
    if (search) params.set("search", search);
    if (date) params.set("date", date);
    return params;
  }

  async function loadList() {
    const requestId = ++listRequest.current;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch(
        `/api/orders/history?${buildParams(page)}`,
      );
      const data = await response.json().catch(() => ({}));
      if (requestId !== listRequest.current) return;
      if (!response.ok) {
        throw new Error(data.error || "Failed to load order history");
      }
      setOrders(data.orders);
      setTotal(data.total);
      setPageSize(data.page_size);
      setStats(data.stats);
      setSelectedId((current) =>
        data.orders.some((o) => o.id === current)
          ? current
          : (data.orders[0]?.id ?? null),
      );
    } catch (err) {
      if (requestId === listRequest.current) setError(err.message);
    } finally {
      if (requestId === listRequest.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
  }, [page, search, date, status]);

  // Wait a moment after typing stops before searching.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    setDetailError(false);
    (async () => {
      try {
        const response = await apiFetch(`/api/orders/${selectedId}`);
        if (!response.ok) throw new Error("Failed");
        const data = await response.json();
        if (requestId === detailRequest.current) setDetail(data);
      } catch {
        if (requestId === detailRequest.current) setDetailError(true);
      } finally {
        if (requestId === detailRequest.current) setDetailLoading(false);
      }
    })();
  }, [selectedId]);

  function changeDate(value) {
    setDate(value);
    setPage(1);
  }

  function changeStatus(value) {
    setStatus(value);
    setPage(1);
  }

  async function exportPdf() {
    setExporting(true);
    setError(null);
    try {
      // Fetch every page of orders that match the current filters
      // (up to 50 pages, which is 1,000 orders).
      const rows = [];
      let matching = 0;
      let pageNum = 1;
      let totalPages = 1;
      while (pageNum <= totalPages && pageNum <= 50) {
        const response = await apiFetch(
          `/api/orders/history?${buildParams(pageNum)}`,
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Export failed");
        rows.push(...data.orders);
        matching = data.total;
        totalPages = Math.ceil(data.total / data.page_size);
        pageNum += 1;
      }

      // The PDF tools are loaded only now, so the rest of the dashboard
      // stays fast to open.
      const [{ jsPDF }, tableModule] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = tableModule.autoTable || tableModule.default;

      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 40;

      const orderValue = rows.reduce(
        (sum, o) => sum + Number(o.total_amount || 0),
        0,
      );
      const paidValue = rows
        .filter((o) => o.payment_status === "success")
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
      const filters = [
        `Status: ${statusLabel(status)}`,
        `Date: ${date ? formatDay(date) : "All dates"}`,
        search ? `Search: ${pdfText(search)}` : null,
      ]
        .filter(Boolean)
        .join("   |   ");
      const countNote =
        rows.length < matching
          ? ` (first ${rows.length} of ${matching} orders)`
          : "";

      doc.setTextColor(31, 41, 51);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("Order History", margin, 44);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text(
        `${pdfText(vendorName || "")}   |   Created ${pdfStamp(new Date())}`,
        margin,
        62,
      );
      doc.text(pdfText(filters), margin, 78);
      doc.text(
        `Orders: ${rows.length}${countNote}   |   Order value: ${pdfMoney(orderValue)}   |   Of which paid: ${pdfMoney(paidValue)}`,
        margin,
        94,
      );

      const body = rows.map((o) => [
        `#${o.id}`,
        pdfText(o.customer_name),
        pdfText(o.customer_phone),
        pdfText(o.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")),
        pdfText(o.delivery_address),
        pdfMoney(o.total_amount),
        o.payment_status === "success" ? "Paid" : "Unpaid",
        o.handed_off_at ? pdfStamp(o.handed_off_at) : "-",
      ]);

      autoTable(doc, {
        startY: 108,
        head: [
          [
            "Order",
            "Customer",
            "Phone",
            "Items",
            "Address",
            "Total",
            "Payment",
            "Handed off",
          ],
        ],
        body,
        margin: { left: margin, right: margin, bottom: 40 },
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 4,
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: { fillColor: [35, 74, 66], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 246] },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 90 },
          2: { cellWidth: 75 },
          3: { cellWidth: 170 },
          4: { cellWidth: 170 },
          5: { cellWidth: 70, halign: "right" },
          6: { cellWidth: 50 },
          7: { cellWidth: 95 },
        },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth - margin,
          pageHeight - 20,
          {
            align: "right",
          },
        );
      }

      doc.save(`order-history-${lagosDate()}.pdf`);
    } catch (err) {
      setError(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const showDetail = detail && detail.id === selectedId;
  const handoffEntry = showDetail
    ? detail.history.find(
        (h) => h.status === "picked_up" || h.status === "delivered",
      )
    : null;
  const cancelEntry = showDetail
    ? detail.history.find((h) => h.status === "cancelled")
    : null;

  return (
    <div className="oh-root">
      <div className="oh-header">
        <div>
          <h1>Order History</h1>
          <p className="oh-subtitle">
            Completed orders, safely archived after rider handoff.
          </p>
        </div>
        <button type="button" className="oh-btn-outline" onClick={onBack}>
          <Icon name="arrow-left" /> Back to Order Inbox
        </button>
      </div>

      {error && (
        <div className="oh-error">
          <span>{error}</span>
          <button type="button" onClick={loadList}>
            Try again
          </button>
        </div>
      )}

      <div className="oh-stats">
        <div className="oh-stat">
          <span className="oh-stat-label">Completed today</span>
          <span className="oh-stat-value">
            {stats ? stats.completed_today : "–"}
          </span>
          <span className="oh-stat-sub">All manually confirmed handoffs</span>
        </div>
        <div className="oh-stat">
          <span className="oh-stat-label">Completed order value</span>
          <span className="oh-stat-value">
            {stats ? formatMoney(stats.completed_today_value) : "–"}
          </span>
          <span className="oh-stat-sub">Today · Paid orders</span>
        </div>
        <div className="oh-stat">
          <span className="oh-stat-label">Still in your inbox</span>
          <span className="oh-stat-value">
            {stats
              ? stats.inbox_new + stats.inbox_preparing + stats.inbox_ready
              : "–"}
          </span>
          <span className="oh-stat-sub">
            {stats
              ? `${stats.inbox_new} New Orders · ${stats.inbox_preparing} Preparing · ${stats.inbox_ready} Ready to Go`
              : ""}
          </span>
        </div>
      </div>

      <div className="oh-toolbar">
        <label className="oh-search">
          <Icon name="search" />
          <input
            type="text"
            placeholder="Search order number or customer"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <div className="oh-date">
          <Icon name="calendar" />
          <input
            type="date"
            value={date}
            max={lagosDate()}
            onChange={(e) => changeDate(e.target.value)}
            aria-label="Filter by date"
          />
          <button
            type="button"
            className="oh-link"
            onClick={() => changeDate(lagosDate())}
          >
            Today
          </button>
          <button
            type="button"
            className="oh-link"
            onClick={() => changeDate("")}
          >
            All dates
          </button>
        </div>
        <select
          className="oh-select"
          value={status}
          onChange={(e) => changeStatus(e.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="oh-btn-outline oh-toolbar-spacer"
          onClick={exportPdf}
          disabled={exporting || total === 0}
        >
          <Icon name="download" />{" "}
          {exporting ? "Preparing PDF..." : "Export PDF"}
        </button>
      </div>

      <div className="oh-grid">
        <div className="oh-card">
          <div className="oh-list-head">
            <span className="oh-list-title">
              {status === "cancelled" ? "Cancelled orders" : "Completed orders"}
            </span>
            <span className="oh-count">{total}</span>
            <span className="oh-list-date">
              {date ? formatDay(date) : "All dates"}
            </span>
          </div>

          {loading ? (
            <div className="oh-empty">Loading orders...</div>
          ) : orders.length === 0 ? (
            <div className="oh-empty">
              {date ? "No orders on this date." : "No orders found."}
              {date && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="oh-link"
                    onClick={() => changeDate("")}
                  >
                    Show all dates
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="oh-table-wrap">
              <table className="oh-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer / Summary</th>
                    <th>Total</th>
                    <th>Handed off</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className={
                        order.id === selectedId
                          ? "oh-row oh-row-selected"
                          : "oh-row"
                      }
                      onClick={() => setSelectedId(order.id)}
                    >
                      <td className="oh-cell-id">#{order.id}</td>
                      <td>
                        <div className="oh-cust-name">
                          {order.customer_name}
                        </div>
                        <div className="oh-cust-sub">{itemSummary(order)}</div>
                      </td>
                      <td className="oh-cell-total">
                        {formatMoney(order.total_amount)}
                      </td>
                      <td className="oh-cell-time">
                        {order.handed_off_at
                          ? date
                            ? formatTime(order.handed_off_at)
                            : formatDateTime(order.handed_off_at)
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={`oh-pill oh-pill-${order.status === "cancelled" ? "cancelled" : "completed"}`}
                        >
                          {statusLabel(order.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="oh-pagination">
            <span>
              {total === 0
                ? "No orders"
                : `Showing ${from}–${to} of ${total} orders`}
            </span>
            <div className="oh-pager">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span className="oh-page-no">{page}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <aside className="oh-card oh-panel">
          {selectedId === null && (
            <p className="oh-muted">Select an order to see its details.</p>
          )}
          {selectedId !== null && !showDetail && detailLoading && (
            <p className="oh-muted">Loading order...</p>
          )}
          {selectedId !== null && detailError && (
            <p className="oh-error-text">Couldn't load this order.</p>
          )}
          {showDetail && (
            <>
              <h2>Order #{detail.id}</h2>
              <span
                className={`oh-pill oh-pill-${detail.status === "cancelled" ? "cancelled" : "completed"}`}
              >
                {statusLabel(detail.status)}
              </span>
              {handoffEntry && (
                <p className="oh-panel-sub">
                  Handed to rider · {formatDateTime(handoffEntry.created_at)}
                </p>
              )}
              {cancelEntry && (
                <p className="oh-panel-sub">
                  Cancelled · {formatDateTime(cancelEntry.created_at)}
                </p>
              )}

              <div className="oh-panel-section">
                <div className="oh-panel-name">{detail.customer_name}</div>
                {detail.customer_phone && (
                  <div className="oh-panel-line">{detail.customer_phone}</div>
                )}
                <div className="oh-panel-line">{detail.delivery_address}</div>
              </div>

              <div className="oh-panel-section">
                {detail.items.map((item, idx) => (
                  <div key={idx} className="oh-panel-item">
                    <strong>{item.quantity}×</strong>
                    <span>{item.name}</span>
                  </div>
                ))}
                <div className="oh-panel-total">
                  <span>Total {formatMoney(detail.total_amount)}</span>
                  <span
                    className={
                      detail.payment_status === "success"
                        ? "oh-badge"
                        : "oh-badge oh-badge-unpaid"
                    }
                  >
                    {detail.payment_status === "success" ? "Paid" : "Unpaid"}
                  </span>
                </div>
                {detail.notes && (
                  <div className="oh-notes">
                    <strong>Special instructions</strong>
                    <span>{detail.notes}</span>
                  </div>
                )}
              </div>

              <div className="oh-panel-section oh-activity">
                <h3>Order activity</h3>
                <ul>
                  {detail.history.map((entry, idx) => (
                    <li
                      key={idx}
                      className={
                        idx === detail.history.length - 1
                          ? "oh-activity-item oh-activity-last"
                          : "oh-activity-item"
                      }
                    >
                      <Icon name="check" size={14} />
                      <span>
                        {ACTIVITY_LABELS[entry.status] || entry.status}
                      </span>
                      <span>{formatDateTime(entry.created_at)}</span>
                    </li>
                  ))}
                </ul>
                {handoffEntry && handoffEntry.changed_by_type === "vendor" && (
                  <div className="oh-handoff-note">
                    <Icon name="shield" />
                    <span>
                      Handoff manually confirmed
                      {vendorName ? ` by ${vendorName}` : ""}.
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <div className="oh-footer">
        <Icon name="info" size={14} />
        <span>
          Completed means handed to your rider. This archive is separate from
          your active order workflow.
        </span>
      </div>
    </div>
  );
}

export default OrderHistory;
