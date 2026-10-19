import { useState, useEffect } from "react";
import "./App.css";
import OrderInbox from "./OrderInbox";
import OrderHistory from "./OrderHistory";
import MenuManagement from "./MenuManagement";
import StoreSettings from "./StoreSettings";
import Login from "./Login";
import VendorFrame from "./VendorFrame";

const SESSION_KEY = "quickbite_vendor_session";

function App() {
  const [activeTab, setActiveTab] = useState("orders");
  const [ordersView, setOrdersView] = useState("inbox"); // "inbox" or "history"

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
    setOrdersView("inbox");
  }

  // Choosing "Orders" (sidebar, bottom bar or bell) always lands on the inbox.
  function handleNavigate(tab) {
    setActiveTab(tab);
    if (tab === "orders") setOrdersView("inbox");
  }

  // Not logged in yet - show the login/signup screen instead of the dashboard
  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <VendorFrame
      token={session.token}
      vendor={session.vendor}
      activeTab={activeTab}
      onNavigate={handleNavigate}
      onLogout={handleLogout}
      onSessionExpired={handleLogout}
    >
      {activeTab === "orders" && ordersView === "inbox" && (
        <OrderInbox
          token={session.token}
          vendorName={session.vendor.name}
          onSessionExpired={handleLogout}
          onOpenHistory={() => setOrdersView("history")}
        />
      )}
      {activeTab === "orders" && ordersView === "history" && (
        <OrderHistory
          token={session.token}
          vendorName={session.vendor.name}
          onSessionExpired={handleLogout}
          onBack={() => setOrdersView("inbox")}
        />
      )}
      {activeTab === "menu" && <MenuManagement token={session.token} />}
      {activeTab === "settings" && <StoreSettings token={session.token} />}
    </VendorFrame>
  );
}

export default App;
