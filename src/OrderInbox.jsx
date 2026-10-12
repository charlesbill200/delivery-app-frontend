import { useState, useEffect } from "react";
import { API_URL } from "./config";
import "./OrderInbox.css";

const POLL_MS = 15000;
const STATS_POLL_MS = 60000;
// Estimated kitchen time shown on Preparing cards. Fixed for now;
// it will become a vendor setting later.
const EST_PREP_MINUTES = 15;

const COLUMNS = [
  {
    key: "new",
    label: "New Orders",
    hint: "Awaiting your acceptance",
    statuses: ["placed"],
  },
  {
    key: "preparing",
    label: "Preparing",
    hint: "Accepted and in the kitchen",
    statuses: ["accepted", "preparing"],
  },
  {
    key: "ready",
    label: "Ready to Go",
    hint: "Packed and awaiting handoff",
    statuses: ["ready"],
  },
];

// What the button on each card does. "confirm" opens the handoff pop-up first.
const ACTIONS = {
  placed: { label: "Accept Order", next: "accepted", icon: "check" },
  accepted: { label: "Mark as Ready", next: "ready", icon: "check" },
  preparing: { label: "Mark as Ready", next: "ready", icon: "check" },
  ready: {
    label: "Handed to Rider",
    next: "picked_up",
    icon: "box",
    confirm: true,
  },
};

function Icon({ name, size = 16 }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (name) {
    case "check":
      return (
        <svg {...props}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "x":
      return (
        <svg {...props}>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "pin":
      return (
        <svg {...props}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "note":
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "box":
      return (
        <svg {...props}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="M3.27 6.96L12 12.01l8.73-5.05" />
          <path d="M12 22.08V12" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      );
    case "sort":
      return (
        <svg {...props}>
          <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
        </svg>
      );
    case "info":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      );
    default:
      return null;
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoney(value) {
  return (
    "₦" +
    (Number(value) || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })
  );
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function timeAgo(value, now) {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function itemCount(order) {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function OrderCard({ order, columnKey, now, busy, onAction }) {
  const action = ACTIONS[order.status];
  const paid = order.payment_status === "success";
  const count = itemCount(order);

  const startedAt = new Date(order.accepted_at || order.created_at).getTime();
  const elapsed = now - startedAt;
  const late = elapsed > EST_PREP_MINUTES * 60000;
  const estReadyAt = startedAt + EST_PREP_MINUTES * 60000;
  const readyTime = order.ready_at || order.created_at;

  return (
    <div className="oi-card">
      <div className="oi-card-top">
        <span className="oi-order-no">#{order.id}</span>
        <span className="oi-meta">
          {count} {count === 1 ? "item" : "items"} · Delivery
        </span>
      </div>

      <div className="oi-customer">{order.customer_name}</div>
      {columnKey === "preparing" && order.customer_phone && (
        <div className="oi-phone">{order.customer_phone}</div>
      )}

      {columnKey === "preparing" && (
        <div className={late ? "oi-timer oi-timer-late" : "oi-timer"}>
          <div className="oi-timer-clock">
            <Icon name="clock" size={18} />
            <span className="oi-timer-time">{formatElapsed(elapsed)}</span>
            <span className="oi-timer-label">elapsed</span>
          </div>
          <div className="oi-timer-est">
            <span>Est. {EST_PREP_MINUTES} min</span>
            <span>Ready {formatTime(estReadyAt)}</span>
          </div>
        </div>
      )}

      <div className="oi-items">
        {order.items.map((item, idx) => (
          <div key={idx} className="oi-item">
            <span className="oi-qty">{item.quantity}×</span>
            <span>{item.name}</span>
          </div>
        ))}
      </div>

      <div className="oi-total-row">
        <span>
          Total <strong>{formatMoney(order.total_amount)}</strong>
        </span>
        <span
          className={
            paid ? "oi-badge oi-badge-paid" : "oi-badge oi-badge-unpaid"
          }
        >
          {paid ? "Paid" : "Unpaid"}
        </span>
      </div>

      <div className="oi-divider" />

      <div className="oi-address">
        <Icon name="pin" />
        <span>{order.delivery_address}</span>
      </div>

      {order.notes && (
        <div className="oi-notes">
          <Icon name="note" />
          <span>{order.notes}</span>
        </div>
      )}

      <div className="oi-time-line">
        <Icon name="clock" size={14} />
        {columnKey === "new" && (
          <span>Received {formatTime(order.created_at)}</span>
        )}
        {columnKey === "preparing" && (
          <span>
            Accepted {formatTime(order.accepted_at || order.created_at)}
          </span>
        )}
        {columnKey === "ready" && (
          <span>
            Ready since {formatTime(readyTime)} · {timeAgo(readyTime, now)}
          </span>
        )}
      </div>

      {action && (
        <button
          type="button"
          className="oi-btn-primary oi-btn-full"
          disabled={busy}
          onClick={() => onAction(order)}
        >
          <Icon name={action.icon} /> {action.label}
        </button>
      )}
    </div>
  );
}

function HandoffModal({ order, busy, onCancel, onConfirm }) {
  const paid = order.payment_status === "success";
  const count = itemCount(order);

  return (
    <div className="oi-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="oi-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oi-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="oi-modal-close"
          aria-label="Close"
          onClick={onCancel}
          disabled={busy}
        >
          <Icon name="x" size={20} />
        </button>

        <div className="oi-modal-icon">
          <Icon name="box" size={22} />
        </div>
        <h2 id="oi-modal-title">
          Confirm this order has been handed to the rider?
        </h2>
        <p className="oi-modal-sub">
          Only confirm after you have physically handed the order to your
          trusted rider.
        </p>

        <div className="oi-summary">
          <div className="oi-summary-top">
            <span>
              #{order.id} · {order.customer_name}
            </span>
            <span className="oi-summary-tag">Ready to Go</span>
          </div>
          <div>
            {order.items
              .map((item) => `${item.quantity}× ${item.name}`)
              .join(" · ")}
          </div>
          <div className="oi-address">
            <Icon name="pin" />
            <span>{order.delivery_address}</span>
          </div>
          <div className="oi-summary-bottom">
            <span>
              {count} {count === 1 ? "item" : "items"} ·{" "}
              {paid ? "Paid" : "Unpaid"}
            </span>
            <strong>{formatMoney(order.total_amount)}</strong>
          </div>
        </div>

        <p className="oi-modal-note">
          This marks the order as Completed and moves it out of Ready to Go into
          Order History.
        </p>

        <div className="oi-modal-actions">
          <button
            type="button"
            className="oi-btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="oi-btn-primary"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Confirming..." : "Confirm Handoff"}
          </button>
        </div>
      </div>
    </div>
  );
}

// token: the vendor's login token.
// vendorName: shown in the "handoff confirmed by" banner.
// onSessionExpired: called when the server says the login is no longer valid.
// onOpenHistory: optional; when given, an "Order History" button appears.
function OrderInbox({ token, vendorName, onSessionExpired, onOpenHistory }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [handoffOrder, setHandoffOrder] = useState(null);
  const [banner, setBanner] = useState(null);
  const [completedToday, setCompletedToday] = useState(null);
  const [search, setSearch] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [now, setNow] = useState(Date.now());

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

  async function fetchOrders() {
    try {
      const response = await apiFetch("/api/orders/active");
      if (!response.ok) throw new Error("Failed to fetch orders");
      const data = await response.json();
      setOrders(data);
      setRefreshError(false);
      setLastUpdated(new Date());
    } catch {
      // Keep showing the orders we already have; just flag the problem.
      setRefreshError(true);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const response = await apiFetch("/api/orders/history?page=1");
      if (!response.ok) return;
      const data = await response.json();
      setCompletedToday(data.stats.completed_today);
    } catch {
      // The counter simply keeps its last value.
    }
  }

  useEffect(() => {
    fetchOrders();
    fetchStats();
    const ordersTimer = setInterval(fetchOrders, POLL_MS);
    const statsTimer = setInterval(fetchStats, STATS_POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(ordersTimer);
      clearInterval(statsTimer);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 10000);
    return () => clearTimeout(timer);
  }, [banner]);

  useEffect(() => {
    if (!handoffOrder) return;
    function onKey(e) {
      if (e.key === "Escape" && busyId === null) setHandoffOrder(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handoffOrder, busyId]);

  async function moveOrder(order, nextStatus) {
    setActionError(null);
    setBusyId(order.id);
    try {
      const response = await apiFetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to update order");
      await fetchOrders();
      return true;
    } catch (err) {
      setActionError(err.message);
      fetchOrders();
      return false;
    } finally {
      setBusyId(null);
    }
  }

  function handleAction(order) {
    const action = ACTIONS[order.status];
    if (!action) return;
    if (action.confirm) {
      setHandoffOrder(order);
      return;
    }
    moveOrder(order, action.next);
  }

  async function confirmHandoff() {
    const order = handoffOrder;
    const ok = await moveOrder(order, "picked_up");
    setHandoffOrder(null);
    if (ok) {
      const by = vendorName ? ` by ${vendorName}` : "";
      setBanner(
        `Order #${order.id} completed. Handoff confirmed${by} at ${formatTime(new Date())}.`,
      );
      fetchStats();
    }
  }

  if (loading) return <p className="oi-loading">Loading orders...</p>;

  const term = search.trim().replace(/^#/, "").toLowerCase();
  const visible = orders
    .filter(
      (o) =>
        !term ||
        String(o.id).includes(term) ||
        (o.customer_name || "").toLowerCase().includes(term),
    )
    .sort((a, b) => {
      const diff = new Date(b.created_at) - new Date(a.created_at);
      return newestFirst ? diff : -diff;
    });

  return (
    <div className="oi-root">
      <div className="oi-header">
        <div>
          <h1>Order Inbox</h1>
          <p className="oi-subtitle">
            Manage incoming orders and prepare them for delivery.
          </p>
        </div>
        {onOpenHistory && (
          <button
            type="button"
            className="oi-btn-outline"
            onClick={onOpenHistory}
          >
            Order History
          </button>
        )}
      </div>

      {banner && (
        <div className="oi-banner">
          <Icon name="check" size={18} />
          <span>{banner}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setBanner(null)}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      {actionError && (
        <div className="oi-banner oi-banner-error">
          <span>{actionError}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setActionError(null)}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}

      <div className="oi-toolbar">
        <label className="oi-search">
          <Icon name="search" />
          <input
            type="text"
            placeholder="Search order number or customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="oi-btn-outline"
          onClick={() => setNewestFirst(!newestFirst)}
        >
          <Icon name="sort" /> {newestFirst ? "Newest first" : "Oldest first"}
        </button>
        <span
          className={
            refreshError ? "oi-updated oi-updated-error" : "oi-updated"
          }
        >
          {refreshError
            ? "Couldn't refresh · retrying"
            : lastUpdated
              ? `Updated ${timeAgo(lastUpdated, now)} · ${formatTime(lastUpdated)}`
              : ""}
        </span>
      </div>

      <div className="oi-board">
        {COLUMNS.map((column) => {
          const columnOrders = visible.filter((o) =>
            column.statuses.includes(o.status),
          );
          return (
            <section key={column.key} className="oi-column">
              <div className="oi-column-head">
                <span className={`oi-dot oi-dot-${column.key}`} />
                <span className="oi-column-title">{column.label}</span>
                <span className={`oi-count oi-count-${column.key}`}>
                  {columnOrders.length}
                </span>
              </div>
              <div className="oi-column-hint">{column.hint}</div>
              <div className="oi-column-body">
                {columnOrders.length === 0 && (
                  <div className="oi-empty">
                    {term ? "No matching orders" : "Nothing here"}
                  </div>
                )}
                {columnOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    columnKey={column.key}
                    now={now}
                    busy={busyId === order.id}
                    onAction={handleAction}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="oi-footer">
        <span>
          <Icon name="info" size={14} /> Hand orders to your trusted riders,
          then confirm the handoff here. Completed orders move to Order History.
        </span>
        <span>
          {orders.length} active
          {completedToday !== null
            ? ` · ${completedToday} completed today`
            : ""}
        </span>
      </div>

      {handoffOrder && (
        <HandoffModal
          order={handoffOrder}
          busy={busyId === handoffOrder.id}
          onCancel={() => setHandoffOrder(null)}
          onConfirm={confirmHandoff}
        />
      )}
    </div>
  );
}

export default OrderInbox;
