import { useState } from "react";
import "./App.css";
import OrderInbox from "./OrderInbox";
import MenuManagement from "./MenuManagement";
import StoreSettings from "./StoreSettings";
import Login from "./Login";

function App() {
  const [activeTab, setActiveTab] = useState("orders");

  // null means "not logged in". Once set, this holds { token, vendor }.
  const [session, setSession] = useState(null);

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

  return (
    <div className="container">
      <div className="app-topbar">
        <span>{session.vendor.name}</span>
        <button className="logout-btn" onClick={handleLogout}>
          Log out
        </button>
      </div>

      <div className="tabs">
        <button
          className={activeTab === "orders" ? "tab active" : "tab"}
          onClick={() => setActiveTab("orders")}
        >
          Order Inbox
        </button>
        <button
          className={activeTab === "menu" ? "tab active" : "tab"}
          onClick={() => setActiveTab("menu")}
        >
          Menu Management
        </button>
        <button
          className={activeTab === "settings" ? "tab active" : "tab"}
          onClick={() => setActiveTab("settings")}
        >
          Store Settings
        </button>
      </div>

      {activeTab === "orders" && <OrderInbox token={session.token} />}
      {activeTab === "menu" && <MenuManagement token={session.token} />}
      {activeTab === "settings" && <StoreSettings token={session.token} />}
    </div>
  );
}

export default App;
