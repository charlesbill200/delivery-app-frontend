import { useState, useEffect } from "react";

const API_URL = "https://delivery-app-backend-z9yz.onrender.com";

const COLUMNS = [
  { key: "new", label: "New", statuses: ["placed", "accepted"] },
  { key: "preparing", label: "Preparing", statuses: ["preparing"] },
  { key: "ready", label: "Ready", statuses: ["ready"] },
  {
    key: "completed",
    label: "Completed",
    statuses: ["picked_up", "delivered"],
  },
];

const ACTION = {
  placed: { label: "Accept", next: "accepted" },
  accepted: { label: "Start Preparing", next: "preparing" },
  preparing: { label: "Mark ready", next: "ready" },
  ready: { label: "Complete", next: "delivered" },
};

function timeAgo(dateString) {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}

// "token" now comes in as a prop from App.jsx instead of a hardcoded vendor ID.
// Every fetch sends it in the Authorization header so the backend knows who's asking.
function OrderInbox({ token }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function fetchOrders() {
    try {
      const response = await fetch(`${API_URL}/api/orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch orders");
      const data = await response.json();
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, []);

  async function advanceStatus(orderId, nextStatus) {
    try {
      const response = await fetch(`${API_URL}/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error("Failed to update order");
      fetchOrders();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p>Loading orders...</p>;
  if (error) return <p>Error: {error}</p>;

  const newCount = orders.filter((o) =>
    COLUMNS[0].statuses.includes(o.status),
  ).length;
  const preparingCount = orders.filter((o) => o.status === "preparing").length;

  return (
    <div>
      <div className="inbox-header">
        <div>
          <h1>Order inbox</h1>
        </div>
        <div className="inbox-stats">
          <span className="stat stat-new">{newCount} new</span>
          <span className="stat">{preparingCount} preparing</span>
          <span className="stat">{orders.length} total today</span>
        </div>
      </div>

      <div className="kanban-board">
        {COLUMNS.map((column) => {
          const columnOrders = orders.filter((o) =>
            column.statuses.includes(o.status),
          );

          return (
            <div key={column.key} className="kanban-column">
              <div className="kanban-column-header">
                <span>{column.label.toUpperCase()}</span>
                <span className="column-count">{columnOrders.length}</span>
              </div>

              {columnOrders.length === 0 && (
                <div className="empty-column">Nothing here</div>
              )}

              {columnOrders.map((order) => {
                const action = ACTION[order.status];
                const isCompleted = column.key === "completed";

                return (
                  <div key={order.id} className="kanban-card">
                    <div className="kanban-card-top">
                      <span className="order-number">#{order.id}</span>
                      <span className="time-ago">
                        {timeAgo(order.created_at)}
                      </span>
                    </div>

                    <div className="kanban-card-tags">
                      <span className="tag tag-delivery">DELIVERY</span>
                      <span className="customer-name">
                        {order.customer_name}
                      </span>
                    </div>

                    <div className="kanban-items">
                      {order.items.map((item, idx) => (
                        <div key={idx}>
                          {item.quantity}× {item.name}
                        </div>
                      ))}
                    </div>

                    <div className="kanban-card-bottom">
                      <span className="total">₦{order.total_amount}</span>
                      {isCompleted ? (
                        <span className="done-label">✓ Done</span>
                      ) : (
                        action && (
                          <button
                            onClick={() => advanceStatus(order.id, action.next)}
                          >
                            {action.label}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OrderInbox;
