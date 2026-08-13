import { useState, useEffect } from "react";
import "./App.css";
import OrderInbox from "./OrderInbox";
import MenuManagement from "./MenuManagement";
import StoreSettings from "./StoreSettings";
import Login from "./Login";

const SESSION_KEY = "quickbite_vendor_session";

// Nav items that are wired to a real screen. Kept separate from the
// "coming soon" list below so an unfinished screen never becomes a
// dead link in production.
const NAV_ITEMS = [
  { key: "orders", label: "Order Inbox", icon: "🧾" },
  { key: "menu", label: "Menu Management", icon: "🍽️" },
  { key: "settings", label: "Store Settings", icon: "⚙️" },
];

// Shown in the sidebar so the nav structure matches the product's real
// shape, but disabled rather than faked - each of these needs backend
// work (earnings totals, a reviews table, an analytics query) before
// it can show real numbers instead of placeholders.
const COMING_SOON_ITEMS = [
  { key: "reports", label: "Reports", icon: "📊" },
  { key: "earnings", label: "Earnings", icon: "💳" },
  { key: "reviews", label: "Reviews", icon: "⭐" },
];

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function App() {
  const [activeTab, setActiveTab] = useState("orders");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // null means "not logged in". Once set, this holds { token, vendor }.
  // Initialized from localStorage so a page refresh doesn't drop the
  // vendor's session mid-shift.
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem(SESSION_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      // Corrupted/unreadable storage - treat as logged out rather than crash.
      return null;
    }
  });

  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [session]);

  function handleLogin(token, vendor) {
    setSession({ token, vendor });
  }

  function handleLogout() {
    setSession(null);
  }

  // Not logged in yet - show the login/signup screen instead of the dashboard
  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  const activeItem = NAV_ITEMS.find((item) => item.key === activeTab);

  return (
    <div className="vendor-app">
      {mobileNavOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <button
        className="mobile-menu-button"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open menu"
      >
        ☰
      </button>

      <aside className={`vendor-sidebar${mobileNavOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">🍲</div>
          <div>
            <strong>QuickBite</strong>
            <span>Vendor</span>
          </div>
        </div>

        <span className="sidebar-section-label">MENU</span>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={
              item.key === activeTab ? "sidebar-link active" : "sidebar-link"
            }
            onClick={() => {
              setActiveTab(item.key);
              setMobileNavOpen(false);
            }}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}

        <div className="sidebar-divider" />

        <span className="sidebar-section-label">COMING SOON</span>
        {COMING_SOON_ITEMS.map((item) => (
          <button
            key={item.key}
            className="sidebar-link"
            disabled
            title="Not available yet"
            style={{ opacity: 0.45, cursor: "default" }}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}

        <div className="sidebar-spacer" />

        <div className="vendor-profile">
          <div className="vendor-avatar">
            {getInitials(session.vendor.name)}
          </div>
          <div className="vendor-profile-info">
            <strong>{session.vendor.name}</strong>
            <span>{session.vendor.email}</span>
          </div>
        </div>
        <button className="logout-link" onClick={handleLogout}>
          <span className="sidebar-icon">⎋</span>
          <span>Log out</span>
        </button>
      </aside>

      <main className="vendor-main">
        <div className="vendor-topbar">
          <div className="page-heading">
            <span className="eyebrow">
              {activeItem ? activeItem.label.toUpperCase() : ""}
            </span>
            <h1>Hello, {session.vendor.name} 👋</h1>
            <p>Here's what's happening with your store today.</p>
          </div>

          <div className="topbar-actions">
            <button className="topbar-icon-button" aria-label="Notifications">
              🔔
            </button>
            <div className="topbar-avatar">
              {getInitials(session.vendor.name)}
            </div>
          </div>
        </div>

        <div className="dashboard-content">
          {activeTab === "orders" && <OrderInbox token={session.token} />}
          {activeTab === "menu" && <MenuManagement token={session.token} />}
          {activeTab === "settings" && <StoreSettings token={session.token} />}
        </div>
      </main>
    </div>
  );
}

export default App;
