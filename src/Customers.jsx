import { useState, useEffect, useRef } from "react";
import { API_URL } from "./config";
import { Icon, formatMoney, formatDateTime, lagosDate } from "./orderUi";
import "./Customers.css";

const SORTS = [
  { value: "recent", label: "Sort: Most recent order" },
  { value: "orders", label: "Sort: Most orders" },
  { value: "spent", label: "Sort: Highest spend" },
  { value: "name", label: "Sort: Name A to Z" },
];

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

function initials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function lastOrderText(value) {
  if (!value) return "-";
  const diff = Math.round(
    (Date.parse(lagosDate()) - Date.parse(lagosDate(value))) / 86400000,
  );
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 30) return `${diff} days ago`;
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function memberSince(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

// WhatsApp wants the number with the country code and no symbols, and
// Nigerian numbers often start with 0 (0803... becomes 234803...).
function whatsappNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
  return digits;
}

function ContactIcon({ name }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  if (name === "mail") {
    return (
      <svg {...props}>
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <path d="M22 6l-10 7L2 6" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

// token: the vendor's login token.
// onSessionExpired: called when the server says the login is no longer valid.
function Customers({ token, onSessionExpired }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [list, setList] = useState({ customers: [], total: 0, page_size: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMessage, setNoteMessage] = useState(null);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const panelRef = useRef(null);

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

  async function loadList() {
    const requestId = ++listRequest.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sort, page: String(page) });
      if (search) params.set("search", search);
      const response = await apiFetch(`/api/vendor/customers?${params}`);
      const data = await response.json().catch(() => ({}));
      if (requestId !== listRequest.current) return;
      if (!response.ok) throw new Error(data.error || "Failed to load your customers");
      setList(data);
      setSelectedKey((current) =>
        data.customers.some((c) => c.key === current)
          ? current
          : (data.customers[0]?.key ?? null),
      );
    } catch (err) {
      if (requestId === listRequest.current) setError(err.message);
    } finally {
      if (requestId === listRequest.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
  }, [search, sort, page]);

  // Wait a moment after typing stops before searching.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (selectedKey === null) {
      setDetail(null);
      return;
    }
    const requestId = ++detailRequest.current;
    setDetailLoading(true);
    setDetailError(false);
    (async () => {
      try {
        const response = await apiFetch(`/api/vendor/customers/${selectedKey}`);
        if (!response.ok) throw new Error("Failed");
        const data = await response.json();
        if (requestId === detailRequest.current) {
          setDetail(data);
          setNoteDraft(data.note || "");
          setNoteMessage(null);
        }
      } catch {
        if (requestId === detailRequest.current) setDetailError(true);
      } finally {
        if (requestId === detailRequest.current) setDetailLoading(false);
      }
    })();
  }, [selectedKey]);

  function selectCustomer(key) {
    setSelectedKey(key);
    if (window.matchMedia("(max-width: 900px)").matches && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function saveNote() {
    setNoteSaving(true);
    setNoteMessage(null);
    try {
      const response = await apiFetch(`/api/vendor/customers/${selectedKey}/note`, {
        method: "PUT",
        body: JSON.stringify({ note: noteDraft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't save the note");
      setDetail((d) => (d ? { ...d, note: data.note } : d));
      setNoteDraft(data.note);
      setNoteMessage({ type: "ok", text: "Note saved" });
    } catch (err) {
      setNoteMessage({ type: "error", text: err.message });
    } finally {
      setNoteSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(list.total / list.page_size));
  const from = list.total === 0 ? 0 : (page - 1) * list.page_size + 1;
  const to = Math.min(page * list.page_size, list.total);
  const showDetail = detail && detail.key === selectedKey;
  const waNumber = showDetail ? whatsappNumber(detail.phone) : "";
  const noteChanged = showDetail && noteDraft.trim() !== (detail.note || "");

  return (
    <div className="cu-root">
      <div className="cu-header">
        <h1>Customers</h1>
        <p className="cu-subtitle">See who orders from you and how often they come back.</p>
      </div>

      <div className="cu-toolbar">
        <label className="cu-search">
          <Icon name="search" />
          <input
            type="text"
            placeholder="Search by name, email or phone"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <select
          className="cu-select"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setPage(1);
          }}
          aria-label="Sort customers"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="cu-notice">
          <span>{error}</span>
          <button type="button" onClick={loadList}>
            Try again
          </button>
        </div>
      )}

      <div className="cu-grid">
        <div className="cu-col">
          <section className="cu-card">
            <h2 className="cu-card-title">Customer directory</h2>
            <p className="cu-muted">Select a customer to see their details</p>

            {loading ? (
              <p className="cu-empty">Loading customers...</p>
            ) : list.customers.length === 0 ? (
              <p className="cu-empty">
                {search
                  ? "No customers match your search."
                  : "No customers yet. People who order from you will appear here."}
              </p>
            ) : (
              <div className="cu-table">
                <div className="cu-tr cu-th">
                  <span>Customer</span>
                  <span>Orders</span>
                  <span>Total spent</span>
                  <span>Last order</span>
                </div>
                {list.customers.map((c) => (
                  <div
                    key={c.key}
                    className={c.key === selectedKey ? "cu-tr cu-row cu-row-selected" : "cu-tr cu-row"}
                    onClick={() => selectCustomer(c.key)}
                  >
                    <span className="cu-person">
                      <span className="cu-avatar">{initials(c.name)}</span>
                      <span className="cu-person-text">
                        <span className="cu-name">{c.name}</span>
                        <span className="cu-sub">{c.email || c.phone}</span>
                      </span>
                    </span>
                    <span>{c.orders}</span>
                    <span>{formatMoney(c.total_spent)}</span>
                    <span className="cu-muted">{lastOrderText(c.last_order_at)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="cu-pagination">
              <span className="cu-muted">
                {list.total === 0
                  ? "No customers"
                  : list.total <= list.page_size
                    ? `Showing ${list.total} of ${list.total} customers`
                    : `Showing ${from}-${to} of ${list.total} customers`}
              </span>
              {list.total > list.page_size && (
                <div className="cu-pager">
                  <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </button>
                  <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                    Next
                  </button>
                </div>
              )}
            </div>
          </section>

          <div className="cu-privacy">
            <Icon name="info" size={16} />
            <span>
              Customer details are private. Only use them to fulfil orders and
              answer questions about an order.
            </span>
          </div>
        </div>

        <div className="cu-col" ref={panelRef}>
          {selectedKey === null && (
            <section className="cu-card">
              <p className="cu-muted">Select a customer to see their details.</p>
            </section>
          )}
          {selectedKey !== null && !showDetail && detailLoading && (
            <section className="cu-card">
              <p className="cu-muted">Loading customer...</p>
            </section>
          )}
          {selectedKey !== null && detailError && (
            <section className="cu-card">
              <p className="cu-error">Couldn't load this customer.</p>
            </section>
          )}

          {showDetail && (
            <>
              <section className="cu-card">
                <div className="cu-profile-head">
                  <span className="cu-avatar cu-avatar-big">{initials(detail.name)}</span>
                  <div>
                    <h2 className="cu-card-title">{detail.name}</h2>
                    <p className="cu-muted">Customer since {memberSince(detail.customer_since)}</p>
                  </div>
                </div>
                <div className="cu-contact">
                  {detail.email && (
                    <div>
                      <ContactIcon name="mail" />
                      <span>{detail.email}</span>
                    </div>
                  )}
                  {detail.phone && (
                    <div>
                      <ContactIcon name="phone" />
                      <span>{detail.phone}</span>
                    </div>
                  )}
                  {detail.address && (
                    <div>
                      <Icon name="pin" />
                      <span>{detail.address}</span>
                    </div>
                  )}
                </div>
                <div className="cu-stats">
                  <div className="cu-stat">
                    <span className="cu-muted">Orders</span>
                    <strong>{detail.orders}</strong>
                  </div>
                  <div className="cu-stat">
                    <span className="cu-muted">Total spent</span>
                    <strong>{formatMoney(detail.total_spent)}</strong>
                  </div>
                  <div className="cu-stat">
                    <span className="cu-muted">Average order</span>
                    <strong>{formatMoney(detail.average_order)}</strong>
                  </div>
                </div>
              </section>

              <section className="cu-card">
                <h2 className="cu-card-title">Recent orders</h2>
                <p className="cu-muted">Latest orders from {detail.name.split(" ")[0]}</p>
                <div className="cu-recent">
                  {detail.recent_orders.map((o) => (
                    <div key={o.id} className="cu-recent-row">
                      <div>
                        <div className="cu-name">#{o.id}</div>
                        <div className="cu-muted">
                          {o.items_count} {o.items_count === 1 ? "item" : "items"} ·{" "}
                          {formatDateTime(o.created_at)}
                        </div>
                      </div>
                      <div className="cu-recent-right">
                        <span className="cu-name">{formatMoney(o.total_amount)}</span>
                        <span className={`cu-pill cu-pill-${statusLabel(o.status).toLowerCase()}`}>
                          {statusLabel(o.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="cu-card">
                <div className="cu-note-head">
                  <h2 className="cu-card-title">Customer note</h2>
                  <span className="cu-tag">{detail.tag}</span>
                </div>
                <textarea
                  className="cu-note"
                  rows={3}
                  maxLength={500}
                  placeholder="Add a note only you can see, for example what they usually order."
                  value={noteDraft}
                  onChange={(e) => {
                    setNoteDraft(e.target.value);
                    setNoteMessage(null);
                  }}
                />
                <div className="cu-note-actions">
                  <span
                    className={
                      noteMessage && noteMessage.type === "error" ? "cu-error" : "cu-muted"
                    }
                  >
                    {noteMessage ? noteMessage.text : ""}
                  </span>
                  <button
                    type="button"
                    className="cu-btn-outline"
                    disabled={!noteChanged || noteSaving}
                    onClick={saveNote}
                  >
                    {noteSaving ? "Saving..." : "Save note"}
                  </button>
                </div>
                <div className="cu-contact-buttons">
                  {waNumber.length >= 10 ? (
                    <a
                      className="cu-btn-outline cu-btn-link"
                      href={`https://wa.me/${waNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Message customer
                    </a>
                  ) : (
                    <span className="cu-btn-outline cu-btn-disabled">Message customer</span>
                  )}
                  {detail.phone && (
                    <a className="cu-btn-outline cu-btn-link" href={`tel:${detail.phone}`}>
                      Call
                    </a>
                  )}
                </div>
                <p className="cu-muted cu-foot">"Message customer" opens WhatsApp.</p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Customers;