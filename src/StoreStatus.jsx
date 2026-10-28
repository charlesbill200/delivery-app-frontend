import { useState, useEffect, useRef } from "react";
import { API_URL } from "./config";
import "./StoreStatus.css";

const OPTIONS = [
  {
    value: true,
    title: "Open for orders",
    hint: "Customers can place new orders.",
  },
  {
    value: false,
    title: "Closed",
    hint: "New orders are blocked. Orders you already have carry on.",
  },
];

// token: the vendor's login token.
// onSessionExpired: called when the server says the login is no longer valid.
function StoreStatus({ token, onSessionExpired }) {
  const [isOpen, setIsOpen] = useState(null); // null = not loaded yet
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const rootRef = useRef(null);

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

  async function loadStatus() {
    try {
      const response = await apiFetch("/api/vendor/profile");
      if (!response.ok) return;
      const data = await response.json();
      if (typeof data.is_open === "boolean") setIsOpen(data.is_open);
    } catch {
      // Leave the pill as it was; clicking it tries again.
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  // Settings tells us when the store was opened or closed from there.
  useEffect(() => {
    function onChanged(e) {
      if (e.detail && typeof e.detail.is_open === "boolean") {
        setIsOpen(e.detail.is_open);
      }
    }
    window.addEventListener("store-status-changed", onChanged);
    return () => window.removeEventListener("store-status-changed", onChanged);
  }, []);

  // Close the menu when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  function toggleMenu() {
    if (isOpen === null) {
      loadStatus(); // still loading, so try again
      return;
    }
    setError(null);
    if (!menuOpen) loadStatus(); // refresh in case it changed elsewhere
    setMenuOpen(!menuOpen);
  }

  async function choose(value) {
    if (value === isOpen) {
      setMenuOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await apiFetch("/api/vendor/store-status", {
        method: "PATCH",
        body: JSON.stringify({ is_open: value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Couldn't update your store status");
      }
      setIsOpen(data.is_open);
      setMenuOpen(false);
      window.dispatchEvent(
        new CustomEvent("store-status-changed", {
          detail: { is_open: data.is_open },
        }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const longLabel =
    isOpen === null ? "Checking..." : isOpen ? "Open for orders" : "Closed";
  const shortLabel = isOpen === null ? "..." : isOpen ? "Open" : "Closed";
  const pillClass =
    isOpen === null
      ? "ss-pill ss-pill-loading"
      : isOpen
        ? "ss-pill ss-pill-open"
        : "ss-pill ss-pill-closed";

  return (
    <div className="ss-root" ref={rootRef}>
      <button
        type="button"
        className={pillClass}
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title="Choose whether customers can order from you"
      >
        <span className="ss-dot" />
        <span className="ss-label-long">{longLabel}</span>
        <span className="ss-label-short">{shortLabel}</span>
      </button>

      {menuOpen && (
        <div className="ss-menu" role="menu">
          {OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              role="menuitemradio"
              aria-checked={isOpen === opt.value}
              className={
                isOpen === opt.value
                  ? "ss-option ss-option-selected"
                  : "ss-option"
              }
              onClick={() => choose(opt.value)}
              disabled={saving}
            >
              <span
                className={
                  isOpen === opt.value ? "ss-radio ss-radio-on" : "ss-radio"
                }
              />
              <span>
                <strong>{opt.title}</strong>
                <span className="ss-hint">{opt.hint}</span>
              </span>
            </button>
          ))}
          {saving && <p className="ss-note">Saving...</p>}
          {error && <p className="ss-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

export default StoreStatus;
