import { useState, useEffect } from "react";

const API_URL = "https://delivery-app-backend-z9yz.onrender.com";

// "token" comes in as a prop now instead of a hardcoded vendor ID.
function MenuManagement({ token }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [formItem, setFormItem] = useState(null);

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function fetchItems() {
    try {
      const response = await fetch(`${API_URL}/api/menu-items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch menu items");
      const data = await response.json();
      setItems(data);
      setError(null);
      if (data.length > 0 && !selectedCategory) {
        setSelectedCategory(data[0].category);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchItems();
  }, []);

  const categoryMap = {};
  items.forEach((item) => {
    if (!categoryMap[item.category]) categoryMap[item.category] = [];
    categoryMap[item.category].push(item);
  });
  const categories = Object.keys(categoryMap);

  const soldOutCount = items.filter((i) => !i.is_available).length;
  const itemsInSelectedCategory = selectedCategory
    ? categoryMap[selectedCategory] || []
    : [];

  async function toggleAvailability(item) {
    try {
      const response = await fetch(`${API_URL}/api/menu-items/${item.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ is_available: !item.is_available }),
      });
      if (!response.ok) throw new Error("Failed to update item");
      fetchItems();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteItem(item) {
    if (!confirm(`Delete "${item.name}"? This can't be undone.`)) return;

    try {
      const response = await fetch(`${API_URL}/api/menu-items/${item.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete item");
      fetchItems();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const payload = {
      name: form.name.value,
      description: form.description.value,
      price: parseFloat(form.price.value),
      category: form.category.value,
      tag: form.tag.value || null,
    };

    const isEditing = formItem && formItem.id;
    const url = isEditing
      ? `${API_URL}/api/menu-items/${formItem.id}`
      : `${API_URL}/api/menu-items`;
    const method = isEditing ? "PATCH" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(
          isEditing ? payload : { ...payload, photo_url: "" },
        ),
      });
      if (!response.ok) throw new Error("Failed to save item");
      setFormItem(null);
      fetchItems();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <p>Loading menu...</p>;

  return (
    <div>
      <div className="menu-header">
        <h1>Menu management</h1>
        <div className="menu-stats">
          <span className="stat stat-new">{items.length} items</span>
          <span className="stat">{categories.length} categories</span>
          <span className="stat">{soldOutCount} sold out</span>
        </div>
      </div>

      {error && <p className="error-text">Error: {error}</p>}

      <div className="menu-layout">
        <div className="menu-sidebar">
          <div className="sidebar-label">CATEGORIES</div>
          {categories.map((cat) => (
            <button
              key={cat}
              className={
                cat === selectedCategory
                  ? "category-btn active"
                  : "category-btn"
              }
              onClick={() => setSelectedCategory(cat)}
            >
              <span>{cat}</span>
              <span className="category-count">{categoryMap[cat].length}</span>
            </button>
          ))}
          <button
            className="add-category-btn"
            onClick={() => {
              const name = prompt("New category name:");
              if (name) setSelectedCategory(name);
            }}
          >
            + Add category
          </button>
        </div>

        <div className="menu-main">
          <div className="menu-main-header">
            <h2>{selectedCategory || "No category selected"}</h2>
            <button
              className="add-item-btn"
              onClick={() => setFormItem({ category: selectedCategory || "" })}
            >
              + Add item
            </button>
          </div>

          {itemsInSelectedCategory.length === 0 && (
            <p className="empty-column">No items in this category yet.</p>
          )}

          {itemsInSelectedCategory.map((item) => (
            <div key={item.id} className="menu-row">
              <div className="menu-row-thumb" />
              <div className="menu-row-info">
                <div className="menu-row-title">
                  <strong>{item.name}</strong>
                  {item.tag && (
                    <span className={`tag tag-${item.tag.toLowerCase()}`}>
                      {item.tag}
                    </span>
                  )}
                </div>
                <p className="menu-row-desc">{item.description}</p>
              </div>
              <div className="menu-row-price">₦{item.price}</div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={item.is_available}
                  onChange={() => toggleAvailability(item)}
                />
                <span className="slider" />
              </label>
              <button className="icon-btn" onClick={() => setFormItem(item)}>
                ✎
              </button>
              <button className="icon-btn" onClick={() => deleteItem(item)}>
                🗑
              </button>
            </div>
          ))}
        </div>
      </div>

      {formItem && (
        <div className="modal-backdrop" onClick={() => setFormItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{formItem.id ? "Edit item" : "Add item"}</h2>
            <form onSubmit={handleFormSubmit} className="menu-form">
              <input
                name="name"
                placeholder="Item name"
                defaultValue={formItem.name || ""}
                required
              />
              <input
                name="description"
                placeholder="Description"
                defaultValue={formItem.description || ""}
              />
              <input
                name="price"
                type="number"
                step="0.01"
                placeholder="Price"
                defaultValue={formItem.price || ""}
                required
              />
              <input
                name="category"
                placeholder="Category"
                defaultValue={formItem.category || ""}
                required
              />
              <input
                name="tag"
                placeholder="Tag (optional, e.g. VEGETARIAN)"
                defaultValue={formItem.tag || ""}
              />
              <div className="modal-actions">
                <button type="button" onClick={() => setFormItem(null)}>
                  Cancel
                </button>
                <button type="submit">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MenuManagement;
