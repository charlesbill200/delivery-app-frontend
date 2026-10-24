import { useState, useEffect, useRef } from "react";
import { API_URL } from "./config";
import { formatMoney } from "./orderUi";
import "./MenuManagement.css";

const NEW_CATEGORY = "__new__";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function RowIcon({ name }) {
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
  if (name === "pencil") {
    return (
      <svg {...props}>
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    );
  }
  return (
    <svg {...props}>
      <path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function emptyForm(preset, categories) {
  return {
    name: "",
    description: "",
    category: preset || categories[0] || NEW_CATEGORY,
    newCategory: "",
    price: "",
    prep: "",
    available: true,
  };
}

function formFromItem(item) {
  return {
    name: item.name || "",
    description: item.description || "",
    category: item.category || "",
    newCategory: "",
    price:
      item.price !== null && item.price !== undefined
        ? String(parseFloat(item.price))
        : "",
    prep: item.prep_time_minutes ? String(item.prep_time_minutes) : "",
    available: item.is_available !== false,
  };
}

function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="mm-switch" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
      <span className="mm-slider" />
    </label>
  );
}

// The "Manage categories" window: rename a category, or remove it (its items
// move to "Uncategorized").
function ManageCategories({ categories, apiFetch, onClose, onChanged }) {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(path, options) {
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch(path, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "That didn't work");
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mm-backdrop" onClick={busy ? undefined : onClose}>
      <div
        className="mm-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Manage categories</h2>
        <p className="mm-muted">
          Rename a category, or remove it. Removing a category moves its items
          to "Uncategorized". To start a new category, choose "+ New category"
          when you add or edit an item.
        </p>
        {categories.length === 0 && <p className="mm-muted">No categories yet.</p>}
        <div className="mm-cat-list">
          {categories.map((cat) => {
            const value = values[cat.name] ?? cat.name;
            const changed = value.trim() && value.trim() !== cat.name;
            return (
              <div key={cat.name} className="mm-cat-row">
                <input
                  value={value}
                  maxLength={60}
                  onChange={(e) =>
                    setValues({ ...values, [cat.name]: e.target.value })
                  }
                  aria-label={`Rename ${cat.name}`}
                />
                <span className="mm-muted">
                  {cat.count} {cat.count === 1 ? "item" : "items"}
                </span>
                <button
                  type="button"
                  className="mm-btn-outline"
                  disabled={busy || !changed}
                  onClick={() =>
                    run("/api/menu-items/categories/rename", {
                      method: "PATCH",
                      body: JSON.stringify({ from: cat.name, to: value.trim() }),
                    })
                  }
                >
                  Save
                </button>
                <button
                  type="button"
                  className="mm-btn-danger-outline"
                  disabled={busy}
                  onClick={() =>
                    run("/api/menu-items/categories/remove", {
                      method: "POST",
                      body: JSON.stringify({ name: cat.name }),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
        {error && <p className="mm-error">{error}</p>}
        <div className="mm-modal-actions">
          <button type="button" className="mm-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// token: the vendor's login token.
// onSessionExpired: called when the server says the login is no longer valid.
function MenuManagement({ token, onSessionExpired }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availFilter, setAvailFilter] = useState("all");
  const [mode, setMode] = useState("edit"); // "edit" or "add"
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(emptyForm("", []));
  const [file, setFile] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
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

  async function loadItems() {
    try {
      const response = await apiFetch("/api/menu-items");
      if (!response.ok) throw new Error("Failed to load your menu");
      const data = await response.json();
      setItems(data);
      setLoadError(null);
      return data;
    } catch (err) {
      setLoadError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const data = await loadItems();
      if (data && data.length > 0) {
        setSelectedId(data[0].id);
        setForm(formFromItem(data[0]));
      } else if (data) {
        setMode("add");
        setForm(emptyForm("", []));
      }
    })();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const categories = [...new Set(items.map((i) => i.category))].sort((a, b) =>
    a.localeCompare(b),
  );
  const categoryCounts = categories.map((name) => ({
    name,
    count: items.filter((i) => i.category === name).length,
  }));

  const term = search.trim().toLowerCase();
  const visible = items.filter((i) => {
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    if (availFilter === "available" && !i.is_available) return false;
    if (availFilter === "unavailable" && i.is_available) return false;
    if (term && !`${i.name} ${i.category}`.toLowerCase().includes(term)) {
      return false;
    }
    return true;
  });

  const selectedItem = items.find((i) => i.id === selectedId) || null;

  function scrollToPanel() {
    if (window.matchMedia("(max-width: 900px)").matches && panelRef.current) {
      panelRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function selectItem(item, scroll = true) {
    setMode("edit");
    setSelectedId(item.id);
    setForm(formFromItem(item));
    setFile(null);
    setFormError(null);
    if (scroll) scrollToPanel();
  }

  function startAdd() {
    setMode("add");
    setSelectedId(null);
    setForm(
      emptyForm(categoryFilter !== "all" ? categoryFilter : "", categories),
    );
    setFile(null);
    setFormError(null);
    scrollToPanel();
  }

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function chooseFile(e) {
    const picked = e.target.files[0] || null;
    if (picked && picked.size > MAX_PHOTO_BYTES) {
      setFormError("That photo is too large (5 MB maximum)");
      e.target.value = "";
      return;
    }
    setFormError(null);
    setFile(picked);
  }

  async function uploadPhoto(itemId, photoFile) {
    const body = new FormData();
    body.append("photo", photoFile);
    // No Content-Type header on purpose: the browser sets the multipart
    // boundary by itself for FormData.
    const response = await fetch(`${API_URL}/api/menu-items/${itemId}/photo`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    if (response.status === 401 && onSessionExpired) onSessionExpired();
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Photo upload failed");
    }
  }

  async function saveItem(e) {
    e.preventDefault();
    setFormError(null);

    const category =
      form.category === NEW_CATEGORY ? form.newCategory.trim() : form.category;
    const price = parseFloat(form.price);
    const prep = form.prep.trim() === "" ? null : Number(form.prep);

    if (!form.name.trim()) return setFormError("Item name is required");
    if (!Number.isFinite(price) || price <= 0) {
      return setFormError("Enter a price above 0");
    }
    if (prep !== null && (!Number.isInteger(prep) || prep < 1 || prep > 240)) {
      return setFormError("Prep time must be a whole number from 1 to 240 minutes");
    }
    if (!category) return setFormError("Choose a category or enter a new one");

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      price,
      category,
      prep_time_minutes: prep,
      is_available: form.available,
    };
    const isEditing = mode === "edit" && selectedId !== null;

    setSaving(true);
    try {
      const response = await apiFetch(
        isEditing ? `/api/menu-items/${selectedId}` : "/api/menu-items",
        {
          method: isEditing ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saved.error || "Failed to save the item");

      let photoProblem = null;
      if (file) {
        try {
          await uploadPhoto(saved.id, file);
        } catch (err) {
          photoProblem = err.message;
        }
      }

      const data = await loadItems();
      const fresh = (data || []).find((i) => i.id === saved.id) || saved;
      selectItem(fresh, false);
      setNotice(
        photoProblem
          ? { type: "error", text: `Saved, but the photo didn't upload: ${photoProblem}` }
          : { type: "success", text: `"${fresh.name}" was saved` },
      );
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setFormError(null);
    setFile(null);
    if (mode === "edit" && selectedItem) {
      setForm(formFromItem(selectedItem));
    } else {
      setForm(emptyForm("", categories));
    }
  }

  async function toggleAvailability(item) {
    const next = !item.is_available;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_available: next } : i)),
    );
    if (item.id === selectedId && mode === "edit") {
      setForm((f) => ({ ...f, available: next }));
    }
    try {
      const response = await apiFetch(`/api/menu-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_available: next }),
      });
      if (!response.ok) throw new Error("Couldn't update this item");
    } catch (err) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_available: item.is_available } : i,
        ),
      );
      if (item.id === selectedId && mode === "edit") {
        setForm((f) => ({ ...f, available: item.is_available }));
      }
      setNotice({ type: "error", text: err.message });
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await apiFetch(`/api/menu-items/${target.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Couldn't delete this item");
      setDeleteTarget(null);
      setNotice({ type: "success", text: `"${target.name}" was deleted` });
      const list = await loadItems();
      if (target.id === selectedId) {
        if (list && list.length > 0) selectItem(list[0], false);
        else startAdd();
      }
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  async function markUnavailableInstead() {
    const target = deleteTarget;
    setDeleteTarget(null);
    setDeleteError(null);
    if (target.is_available) await toggleAvailability(target);
  }

  if (loading) return <p className="mm-muted">Loading your menu...</p>;

  const photoShown = file
    ? URL.createObjectURL(file)
    : mode === "edit" && selectedItem
      ? selectedItem.photo_url
      : "";

  return (
    <div className="mm-root">
      <div className="mm-header">
        <div>
          <h1>Menu Management</h1>
          <p className="mm-subtitle">
            Add, edit and switch items on or off. Customers see changes
            straight away.
          </p>
        </div>
        <button type="button" className="mm-btn-primary" onClick={startAdd}>
          Add new item
        </button>
      </div>

      {notice && (
        <div className={`mm-notice mm-notice-${notice.type}`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      {loadError && (
        <div className="mm-notice mm-notice-error">
          <span>{loadError}</span>
          <button type="button" onClick={loadItems}>
            Try again
          </button>
        </div>
      )}

      <div className="mm-filters">
        <input
          className="mm-search"
          placeholder="Search items"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="mm-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="mm-select"
          value={availFilter}
          onChange={(e) => setAvailFilter(e.target.value)}
          aria-label="Filter by availability"
        >
          <option value="all">All items</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </select>
      </div>

      <div className="mm-grid">
        <div className="mm-col">
          <section className="mm-card">
            <h2 className="mm-card-title">Food items</h2>
            <p className="mm-muted">
              {items.length} {items.length === 1 ? "item" : "items"} on your menu
            </p>

            {visible.length === 0 ? (
              <p className="mm-empty">
                {items.length === 0
                  ? "No items yet. Add your first one."
                  : "No items match your search."}
              </p>
            ) : (
              <div className="mm-table">
                <div className="mm-tr mm-th">
                  <span>Item</span>
                  <span>Price</span>
                  <span className="mm-col-prep">Prep time</span>
                  <span>Availability</span>
                  <span />
                </div>
                {visible.map((item) => (
                  <div
                    key={item.id}
                    className={
                      mode === "edit" && item.id === selectedId
                        ? "mm-tr mm-row mm-row-selected"
                        : "mm-tr mm-row"
                    }
                    onClick={() => selectItem(item)}
                  >
                    <span>
                      <span className="mm-item-name">{item.name}</span>
                      <span className="mm-item-cat">{item.category}</span>
                    </span>
                    <span>{formatMoney(item.price)}</span>
                    <span className="mm-col-prep mm-muted">
                      {item.prep_time_minutes ? `${item.prep_time_minutes} min` : "-"}
                    </span>
                    <span className="mm-avail">
                      <Switch
                        checked={item.is_available !== false}
                        onChange={() => toggleAvailability(item)}
                        label={`Availability of ${item.name}`}
                      />
                      <span className="mm-avail-label">
                        {item.is_available !== false ? "Available" : "Unavailable"}
                      </span>
                    </span>
                    <span className="mm-actions">
                      <button
                        type="button"
                        className="mm-icon-btn"
                        aria-label={`Edit ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectItem(item);
                        }}
                      >
                        <RowIcon name="pencil" />
                      </button>
                      <button
                        type="button"
                        className="mm-icon-btn mm-icon-btn-danger"
                        aria-label={`Delete ${item.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteError(null);
                          setDeleteTarget(item);
                        }}
                      >
                        <RowIcon name="trash" />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mm-card">
            <h2 className="mm-card-title">Categories</h2>
            <p className="mm-muted">Group items so customers find them quickly</p>
            <div className="mm-chips">
              {categories.length === 0 && (
                <span className="mm-muted">No categories yet</span>
              )}
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={categoryFilter === c ? "mm-chip mm-chip-on" : "mm-chip"}
                  onClick={() => setCategoryFilter(categoryFilter === c ? "all" : c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mm-btn-outline"
              onClick={() => setManageOpen(true)}
            >
              Manage categories
            </button>
          </section>
        </div>

        <div className="mm-col" ref={panelRef}>
          <section className="mm-card">
            <h2 className="mm-card-title">
              {mode === "add" ? "Add item" : "Edit item"}
            </h2>
            <p className="mm-muted">Changes apply once you save</p>

            <form onSubmit={saveItem} className="mm-form">
              <label>
                Item name
                <input
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => update("name", e.target.value)}
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                />
              </label>
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY}>+ New category</option>
                </select>
              </label>
              {form.category === NEW_CATEGORY && (
                <label>
                  New category name
                  <input
                    value={form.newCategory}
                    maxLength={60}
                    onChange={(e) => update("newCategory", e.target.value)}
                  />
                </label>
              )}
              <div className="mm-two">
                <label>
                  Price (₦)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.price}
                    onChange={(e) => update("price", e.target.value)}
                  />
                </label>
                <label>
                  Prep time (minutes)
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="240"
                    placeholder="e.g. 15"
                    value={form.prep}
                    onChange={(e) => update("prep", e.target.value)}
                  />
                </label>
              </div>

              <div className="mm-photo">
                {photoShown ? (
                  <img src={photoShown} alt="" />
                ) : (
                  <span className="mm-photo-empty" />
                )}
                <label className="mm-photo-pick">
                  Photo (JPEG, PNG or WebP)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={chooseFile}
                  />
                </label>
              </div>

              <div className="mm-toggle-row">
                <div>
                  <strong>Available today</strong>
                  <span className="mm-muted">Turn off to hide it from customers</span>
                </div>
                <Switch
                  checked={form.available}
                  onChange={(e) => update("available", e.target.checked)}
                  label="Available today"
                />
              </div>

              {formError && <p className="mm-error">{formError}</p>}

              <div className="mm-form-actions">
                <button type="button" className="mm-btn-outline" onClick={cancelEdit}>
                  Cancel
                </button>
                <button type="submit" className="mm-btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save item"}
                </button>
              </div>
            </form>
          </section>

          <section className="mm-card">
            <h2 className="mm-card-title">Out of stock?</h2>
            <p className="mm-muted">Pause an item without deleting it</p>
            <p className="mm-muted mm-gap">
              Switch the item to Unavailable and it disappears from the customer
              app until you turn it back on.
            </p>
            <div className="mm-form-actions">
              <button
                type="button"
                className="mm-btn-outline"
                disabled={!selectedItem || mode !== "edit"}
                onClick={() => selectedItem && toggleAvailability(selectedItem)}
              >
                {selectedItem && selectedItem.is_available === false
                  ? "Mark available"
                  : "Mark unavailable"}
              </button>
              <button
                type="button"
                className="mm-btn-danger-outline"
                disabled={!selectedItem || mode !== "edit"}
                onClick={() => {
                  setDeleteError(null);
                  setDeleteTarget(selectedItem);
                }}
              >
                Delete item
              </button>
            </div>
          </section>
        </div>
      </div>

      {deleteTarget && (
        <div className="mm-backdrop" onClick={deleting ? undefined : () => setDeleteTarget(null)}>
          <div
            className="mm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Delete "{deleteTarget.name}"?</h2>
            <p className="mm-muted">
              This can't be undone. If you only want to hide it for a while,
              mark it unavailable instead.
            </p>
            {deleteError && <p className="mm-error">{deleteError}</p>}
            <div className="mm-modal-actions">
              <button
                type="button"
                className="mm-btn-outline"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              {deleteError && deleteTarget.is_available !== false && (
                <button
                  type="button"
                  className="mm-btn-primary"
                  onClick={markUnavailableInstead}
                >
                  Mark unavailable instead
                </button>
              )}
              {!deleteError && (
                <button
                  type="button"
                  className="mm-btn-danger"
                  disabled={deleting}
                  onClick={confirmDelete}
                >
                  {deleting ? "Deleting..." : "Delete item"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {manageOpen && (
        <ManageCategories
          categories={categoryCounts}
          apiFetch={apiFetch}
          onClose={() => setManageOpen(false)}
          onChanged={async () => {
            const data = await loadItems();
            if (data && selectedId !== null) {
              const current = data.find((i) => i.id === selectedId);
              if (current && mode === "edit") setForm(formFromItem(current));
            }
          }}
        />
      )}
    </div>
  );
}

export default MenuManagement;