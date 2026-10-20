import { useState, useEffect } from "react";
import { API_URL } from "./config";
import { formatMoney } from "./orderUi";
import "./Dashboard.css";

const REFRESH_MS = 30000;

const STATUS_LABELS = {
  placed: "New",
  accepted: "Preparing",
  preparing: "Preparing",
  ready: "Ready",
  picked_up: "Completed",
  delivered: "Completed",
  cancelled: "Cancelled",
};

function statusLabel(status) {
  return STATUS_LABELS[status] || "New";
}

function pillClass(status) {
  return `db-pill db-pill-${statusLabel(status).toLowerCase()}`;
}

function hourShort(h) {
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
}

function hourLong(h) {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
}

function countLabel(n, word) {
  return `${n} ${n === 1 ? word : word + "s"}`;
}

// Eight hourly bars. They start at 8 AM (earlier if orders came in earlier)
// and slide later in the day so the current hour is always visible.
function buildBars(data) {
  const counts = {};
  data.hourly.forEach((r) => {
    counts[r.hour] = r.orders;
  });
  const hoursWithOrders = data.hourly.map((r) => r.hour);
  let start = Math.min(8, ...(hoursWithOrders.length ? hoursWithOrders : [8]));
  if (data.current_hour > start + 7) start = data.current_hour - 7;
  start = Math.max(0, Math.min(start, 16));
  const max = Math.max(1, ...Object.values(counts));
  return Array.from({ length: 8 }, (_, i) => {
    const hour = start + i;
    const orders = counts[hour] || 0;
    return {
      hour,
      orders,
      ratio: orders / max,
      isNow: hour === data.current_hour,
    };
  });
}

function barClass(bar) {
  if (bar.orders === 0) return "db-bar db-bar-empty";
  return bar.isNow ? "db-bar db-bar-now" : "db-bar db-bar-past";
}

function StatCard({ label, value, sub }) {
  return (
    <div className="db-card db-stat">
      <span className="db-stat-label">{label}</span>
      <span className="db-stat-value">{value}</span>
      <span className="db-stat-sub">{sub}</span>
    </div>
  );
}

function ActiveRow({ title, hint, count, tone }) {
  return (
    <div className="db-active-row">
      <div>
        <div className="db-active-title">{title}</div>
        <div className="db-muted">{hint}</div>
      </div>
      <span className={`db-count db-count-${tone}`}>{count}</span>
    </div>
  );
}

// token: the vendor's login token.
// onSessionExpired: called when the server says the login is no longer valid.
// onOpenInbox: go to the Order Inbox. onOpenHistory: go to Order History.
function Dashboard({ token, onSessionExpired, onOpenInbox, onOpenHistory }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const response = await fetch(`${API_URL}/api/vendor/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        if (onSessionExpired) onSessionExpired();
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Failed to load the dashboard");
      }
      setData(body);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <p className="db-muted">Loading dashboard...</p>;

  if (!data) {
    return (
      <div className="db-root">
        <div className="db-notice db-notice-error">
          <span>{error || "Couldn't load the dashboard."}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load();
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const bars = buildBars(data);

  return (
    <div className="db-root">
      <div className="db-header">
        <div>
          <h1>Dashboard</h1>
          <p className="db-subtitle">
            A quick overview of today's orders and sales.
          </p>
        </div>
        <button type="button" className="db-btn-primary" onClick={onOpenInbox}>
          Open order inbox
        </button>
      </div>

      {error && (
        <div className="db-notice db-notice-error">
          <span>Couldn't refresh · showing the last numbers</span>
        </div>
      )}

      <div className="db-stats">
        <StatCard
          label="Today's sales"
          value={formatMoney(data.sales_today)}
          sub={`From ${countLabel(data.sales_orders_today, "order")}`}
        />
        <StatCard
          label="Total orders"
          value={data.total_orders_today}
          sub="Received today"
        />
        <StatCard
          label="Pending orders"
          value={data.pending_orders}
          sub="Need attention"
        />
        <StatCard
          label="Completed orders"
          value={data.completed_today}
          sub="Handed to a rider"
        />
      </div>

      <div className="db-grid">
        <div className="db-card">
          <h2 className="db-card-title">Today's orders</h2>
          <p className="db-muted">Orders received per hour</p>
          <div className="db-sales-line">
            <span className="db-sales-value">
              {formatMoney(data.sales_today)}
            </span>
            <span className="db-muted">sales so far</span>
          </div>
          <div
            className="db-chart"
            role="img"
            aria-label="Orders received per hour today"
          >
            {bars.map((bar) => (
              <div key={bar.hour} className="db-bar-col">
                <div className="db-bar-track">
                  {bar.orders > 0 && (
                    <span className="db-bar-count">{bar.orders}</span>
                  )}
                  <div className={barClass(bar)} style={{ "--h": bar.ratio }} />
                </div>
                <span className="db-bar-label">
                  <span className="db-hour-long">{hourLong(bar.hour)}</span>
                  <span className="db-hour-short">{hourShort(bar.hour)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="db-card">
          <h2 className="db-card-title">Active orders</h2>
          <p className="db-muted">What needs your attention now</p>
          <div className="db-active">
            <ActiveRow
              title="New orders"
              hint="Waiting to be accepted"
              count={data.active.new}
              tone="new"
            />
            <ActiveRow
              title="Preparing"
              hint="Being made in your kitchen"
              count={data.active.preparing}
              tone="preparing"
            />
            <ActiveRow
              title="Ready for pickup"
              hint="Waiting for the rider"
              count={data.active.ready}
              tone="ready"
            />
          </div>
          <button
            type="button"
            className="db-btn-primary db-btn-full"
            onClick={onOpenInbox}
          >
            Manage active orders
          </button>
        </div>
      </div>

      <div className="db-grid">
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h2 className="db-card-title">Recent orders</h2>
              <p className="db-muted">Latest orders from your customers</p>
            </div>
            <button type="button" className="db-link" onClick={onOpenHistory}>
              View all
            </button>
          </div>

          {data.recent_orders.length === 0 ? (
            <p className="db-empty">No orders yet.</p>
          ) : (
            <>
              <div className="db-table">
                <div className="db-tr db-th">
                  <span>Order</span>
                  <span>Customer</span>
                  <span>Items</span>
                  <span>Total</span>
                  <span>Status</span>
                </div>
                {data.recent_orders.map((o) => (
                  <div key={o.id} className="db-tr">
                    <span className="db-o-id">#{o.id}</span>
                    <span>{o.customer_name}</span>
                    <span className="db-muted">
                      {countLabel(o.items_count, "item")}
                    </span>
                    <span>{formatMoney(o.total_amount)}</span>
                    <span>
                      <span className={pillClass(o.status)}>
                        {statusLabel(o.status)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="db-list">
                {data.recent_orders.map((o) => (
                  <div key={o.id} className="db-list-row">
                    <div>
                      <div className="db-list-title">
                        #{o.id} · {o.customer_name}
                      </div>
                      <div className="db-muted">
                        {countLabel(o.items_count, "item")} ·{" "}
                        {formatMoney(o.total_amount)}
                      </div>
                    </div>
                    <span className={pillClass(o.status)}>
                      {statusLabel(o.status)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            type="button"
            className="db-btn-outline db-btn-full db-view-all-mobile"
            onClick={onOpenHistory}
          >
            View all orders
          </button>
        </div>

        <div className="db-card">
          <h2 className="db-card-title">Popular items</h2>
          <p className="db-muted">Top sellers today</p>
          {data.popular_items.length === 0 ? (
            <p className="db-empty">No sales yet today.</p>
          ) : (
            <div className="db-popular">
              {data.popular_items.map((item, idx) => (
                <div key={item.id} className="db-popular-row">
                  <span className="db-rank">{idx + 1}</span>
                  <div className="db-popular-name">
                    <div className="db-list-title">{item.name}</div>
                    <div className="db-muted">{item.sold} sold</div>
                  </div>
                  <span className="db-popular-price">
                    {formatMoney(item.price)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
