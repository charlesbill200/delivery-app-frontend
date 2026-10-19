import { useState, useEffect } from "react";
import { API_URL } from "./config";
import StoreStatus from "./StoreStatus";
import "./VendorFrame.css";

// "soon" items are shown but disabled until their screens exist.
const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "home", soon: true },
  { key: "orders", label: "Orders", icon: "inbox" },
  { key: "menu", label: "Menu", icon: "list" },
  { key: "customers", label: "Customers", icon: "user", soon: true },
  { key: "analytics", label: "Analytics", icon: "chart", soon: true },
  { key: "settings", label: "Settings", icon: "sliders" },
];

const POLL_MS = 15000;

function NavIcon({ name, size = 18 }) {
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
    case "menu":
      return (
        <svg {...props}>
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      );
    case "home":
      return (
        <svg {...props}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M9 22V12h6v10" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...props}>
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      );
    case "list":
      return (
        <svg {...props}>
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );
    case "user":
      return (
        <svg {...props}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <path d="M18 20V10M12 20V4M6 20v-6" />
        </svg>
      );
    case "sliders":
      return (
        <svg {...props}>
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "logout":
      return (
        <svg {...props}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5M21 12H9" />
        </svg>
      );
    default:
      return null;
  }
}

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// e.g. "Wednesday, 14 October 2026"
function formatToday() {
  const d = new Date();
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${weekday}, ${d.getDate()} ${month} ${d.getFullYear()}`;
}

// token: the vendor's login token.
// vendor: the logged-in vendor ({ name, ... }).
// activeTab / onNavigate: which screen is showing, and how to change it.
// onLogout: log out. onSessionExpired: called if the server rejects the login.
// children: the screen to show.
function VendorFrame({
  token,
  vendor,
  activeTab,
  onNavigate,
  onLogout,
  onSessionExpired,
  children,
}) {
  // active = orders still being worked on; fresh = new orders not yet accepted.
  const [counts, setCounts] = useState({ active: 0, fresh: 0 });
  const [drawerOpen, setDrawerOpen] = useState(false); // phone slide-out menu

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`${API_URL}/api/orders/active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.status === 401) {
          if (onSessionExpired) onSessionExpired();
          return;
        }
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setCounts({
            active: data.length,
            fresh: data.filter((o) => o.status === "placed").length,
          });
        }
      } catch {
        // Keep the last numbers; the next check tries again.
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  // Phone menu: lock page scrolling while it is open, close it on Escape,
  // and close it if the window grows to desktop size.
  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    const wide = window.matchMedia("(min-width: 901px)");
    function onWide(e) {
      if (e.matches) setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    wide.addEventListener("change", onWide);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", onWide);
    };
  }, [drawerOpen]);

  function go(tab) {
    setDrawerOpen(false);
    onNavigate(tab);
  }

  const dateText = formatToday();

  return (
    <div className="vh-root">
      {drawerOpen && (
        <div className="vh-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      <aside
        className={drawerOpen ? "vh-sidebar vh-sidebar-open" : "vh-sidebar"}
      >
        <div className="vh-brand">
          <span className="vh-mark">
            <NavIcon name="check" size={20} />
          </span>
          <span className="vh-brand-name">Vendor Hub</span>
          <button
            type="button"
            className="vh-close"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          >
            <NavIcon name="x" size={20} />
          </button>
        </div>

        <span className="vh-section">MENU</span>
        <nav className="vh-nav">
          {NAV_ITEMS.map((item) =>
            item.soon ? (
              <button
                key={item.key}
                type="button"
                className="vh-link vh-link-soon"
                disabled
                title="Coming soon"
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
                <span className="vh-soon">Soon</span>
              </button>
            ) : (
              <button
                key={item.key}
                type="button"
                className={
                  item.key === activeTab ? "vh-link vh-link-active" : "vh-link"
                }
                onClick={() => go(item.key)}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
                {item.key === "orders" && counts.active > 0 && (
                  <span className="vh-badge">{counts.active}</span>
                )}
              </button>
            ),
          )}
        </nav>

        <div className="vh-spacer" />

        <div className="vh-user">
          <span className="vh-avatar">{getInitials(vendor.name)}</span>
          <div>
            <div className="vh-user-name">{vendor.name}</div>
            <div className="vh-user-role">Vendor account</div>
          </div>
        </div>
        <button type="button" className="vh-logout" onClick={onLogout}>
          <NavIcon name="logout" />
          <span>Log out</span>
        </button>
      </aside>

      <div className="vh-main">
        <header className="vh-topbar">
          <div className="vh-top-left">
            <button
              type="button"
              className="vh-menu-btn"
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <NavIcon name="menu" size={20} />
            </button>
            <div className="vh-store">
              <span className="vh-store-name">{vendor.name}</span>
              <span className="vh-date vh-date-mobile">{dateText}</span>
            </div>
            <StoreStatus token={token} onSessionExpired={onSessionExpired} />
          </div>

          <div className="vh-top-right">
            <span className="vh-date vh-date-desktop">{dateText}</span>
            <button
              type="button"
              className="vh-bell"
              aria-label={
                counts.fresh > 0
                  ? `${counts.fresh} new orders waiting`
                  : "Orders"
              }
              title={
                counts.fresh > 0
                  ? `${counts.fresh} new order${counts.fresh === 1 ? "" : "s"} waiting`
                  : "No new orders"
              }
              onClick={() => go("orders")}
            >
              <NavIcon name="bell" />
              {counts.fresh > 0 && (
                <span className="vh-bell-count">{counts.fresh}</span>
              )}
            </button>
          </div>
        </header>

        <main className="vh-content">{children}</main>
      </div>
    </div>
  );
}

export default VendorFrame;
