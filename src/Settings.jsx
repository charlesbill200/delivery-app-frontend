import { useState, useEffect, useRef } from "react";
import { API_URL } from "./config";
import { playBeep } from "./orderAlerts";
import "./Settings.css";

const TABS = [
  { key: "profile", label: "Store profile" },
  { key: "delivery", label: "Delivery" },
  { key: "hours", label: "Opening hours" },
  { key: "alerts", label: "Orders and alerts" },
];

// Monday first, as on a calendar. day_of_week uses 0 = Sunday.
const DAYS = [
  { dow: 1, name: "Monday" },
  { dow: 2, name: "Tuesday" },
  { dow: 3, name: "Wednesday" },
  { dow: 4, name: "Thursday" },
  { dow: 5, name: "Friday" },
  { dow: 6, name: "Saturday" },
  { dow: 0, name: "Sunday" },
];

const CUISINES = [
  "Nigerian",
  "African",
  "Mediterranean",
  "Chinese",
  "Indian",
  "Italian",
  "American",
  "Burgers",
  "Pizza",
  "Chicken",
  "Seafood",
  "Vegetarian",
  "Breakfast",
  "Desserts",
  "Drinks",
  "Fast food",
];

// Shown until a store saves its hours for the first time.
const DEFAULT_HOURS = DAYS.map((d) => ({
  day_of_week: d.dow,
  is_open: d.dow !== 0,
  open_time: "09:00",
  close_time: "21:00",
}));

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function numberText(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = parseFloat(value);
  return Number.isFinite(n) ? String(n) : fallback;
}

function profileToForm(p) {
  return {
    name: p.name || "",
    cuisine: p.cuisine || "",
    description: p.description || "",
    deal_text: p.deal_text || "",
    delivery_time_estimate: p.delivery_time_estimate || "",
    delivery_fee: numberText(p.delivery_fee, "0"),
    min_order_amount: numberText(p.min_order_amount, "0"),
    is_open: p.is_open !== false,
    alert_sound: p.alert_sound !== false,
    waiting_reminder: p.waiting_reminder !== false,
    daily_summary: p.daily_summary === true,
  };
}

function hoursFromServer(rows) {
  return DAYS.map((d) => {
    const row = (rows || []).find((r) => r.day_of_week === d.dow);
    if (row) {
      return {
        day_of_week: d.dow,
        is_open: row.is_open,
        open_time: row.open_time,
        close_time: row.close_time,
      };
    }
    return DEFAULT_HOURS.find((h) => h.day_of_week === d.dow);
  });
}

function zoneInputsFrom(zones) {
  const inputs = {};
  zones.forEach((z) => {
    inputs[z.zone_id] = numberText(z.delivery_fee, "");
  });
  return inputs;
}

function Switch({ checked, onChange, label, disabled }) {
  return (
    <label className="st-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={label}
      />
      <span className="st-slider" />
    </label>
  );
}

// token: the vendor's login token.
// onSessionExpired: called when the server says the login is no longer valid.
function Settings({ token, onSessionExpired }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saved, setSaved] = useState(null); // what the server has
  const [form, setForm] = useState(null);
  const [hours, setHours] = useState([]);
  const [zoneInputs, setZoneInputs] = useState({});
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [activeTab, setActiveTab] = useState("profile");
  const sectionRefs = useRef({});

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

  async function call(path, options) {
    const response = await apiFetch(path, options);
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
  }

  // Loads everything from the server. Returns the profile (or null).
  async function loadAll() {
    setLoadError(null);
    try {
      const [p, h, z] = await Promise.all([
        apiFetch("/api/vendor/profile"),
        apiFetch("/api/vendor/opening-hours"),
        apiFetch("/api/vendor/zone-fees"),
      ]);
      if (!p.ok || !h.ok || !z.ok) {
        throw new Error("Couldn't load your settings");
      }
      const [profile, hoursData, zones] = await Promise.all([
        p.json(),
        h.json(),
        z.json(),
      ]);
      const f = profileToForm(profile);
      const hrs = hoursFromServer(hoursData.hours);
      const zi = zoneInputsFrom(zones);
      setSaved({
        form: f,
        hours: hrs,
        configured: hoursData.configured,
        zones,
        zoneInputs: zi,
        coverUrl: profile.cover_image_url || "",
      });
      setForm(f);
      setHours(hrs);
      setZoneInputs(zi);
      setCoverFile(null);
      return profile;
    } catch (err) {
      setLoadError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // The top-bar pill can also open and close the store; keep this in sync.
  useEffect(() => {
    function onChanged(e) {
      const value = e.detail && e.detail.is_open;
      if (typeof value !== "boolean") return;
      setForm((f) => (f ? { ...f, is_open: value } : f));
      setSaved((s) => (s ? { ...s, form: { ...s.form, is_open: value } } : s));
    }
    window.addEventListener("store-status-changed", onChanged);
    return () => window.removeEventListener("store-status-changed", onChanged);
  }, []);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview("");
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  useEffect(() => {
    if (!message || message.type !== "ok") return;
    const timer = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  if (loading) return <p className="st-muted">Loading your settings...</p>;

  if (!form) {
    return (
      <div className="st-root">
        <div className="st-notice st-notice-error">
          <span>{loadError || "Couldn't load your settings."}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadAll();
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const dirty =
    JSON.stringify(form) !== JSON.stringify(saved.form) ||
    JSON.stringify(hours) !== JSON.stringify(saved.hours) ||
    JSON.stringify(zoneInputs) !== JSON.stringify(saved.zoneInputs) ||
    coverFile !== null;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateHour(index, patch) {
    setHours((list) => list.map((h, i) => (i === index ? { ...h, ...patch } : h)));
  }

  function chooseCover(e) {
    const picked = e.target.files[0] || null;
    if (picked && picked.size > MAX_PHOTO_BYTES) {
      setMessage({ type: "error", text: "That photo is too large (5 MB maximum)" });
      e.target.value = "";
      return;
    }
    setMessage(null);
    setCoverFile(picked);
  }

  function goToTab(key) {
    setActiveTab(key);
    const el = sectionRefs.current[key];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancel() {
    setForm(saved.form);
    setHours(saved.hours);
    setZoneInputs(saved.zoneInputs);
    setCoverFile(null);
    setMessage(null);
  }

  function fail(text) {
    setMessage({ type: "error", text });
  }

  async function save() {
    setMessage(null);
    const name = form.name.trim();
    const fee = Number(form.delivery_fee);
    const minimum = Number(form.min_order_amount);

    if (!name) return fail("Enter your store name");
    if (form.delivery_fee.trim() === "" || !Number.isFinite(fee) || fee < 0) {
      return fail("Delivery fee must be 0 or more");
    }
    if (
      form.min_order_amount.trim() === "" ||
      !Number.isFinite(minimum) ||
      minimum < 0
    ) {
      return fail("Minimum order must be 0 or more");
    }
    for (let i = 0; i < hours.length; i++) {
      const h = hours[i];
      if (h.is_open && (!h.open_time || !h.close_time)) {
        return fail(`${DAYS[i].name}: enter an opening and a closing time`);
      }
      if (h.is_open && h.open_time === h.close_time) {
        return fail(`${DAYS[i].name}: opening and closing time can't be the same`);
      }
    }
    for (const z of saved.zones) {
      const text = (zoneInputs[z.zone_id] ?? "").trim();
      if (text !== "" && (!Number.isFinite(Number(text)) || Number(text) < 0)) {
        return fail(`${z.zone_name}: the delivery fee must be 0 or more`);
      }
    }

    setSaving(true);
    const problems = [];
    try {
      // 1) Cover photo
      if (coverFile) {
        const body = new FormData();
        body.append("photo", coverFile);
        const response = await fetch(`${API_URL}/api/vendor/cover-photo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body,
        });
        if (response.status === 401 && onSessionExpired) onSessionExpired();
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          problems.push(data.error || "The cover photo didn't upload");
        }
      }

      // 2) Store details, delivery and alert preferences
      let r = await call("/api/vendor/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name,
          cuisine: form.cuisine,
          description: form.description,
          deal_text: form.deal_text,
          delivery_time_estimate: form.delivery_time_estimate,
          delivery_fee: fee,
          min_order_amount: minimum,
          alert_sound: form.alert_sound,
          waiting_reminder: form.waiting_reminder,
          daily_summary: form.daily_summary,
        }),
      });
      if (!r.ok) problems.push(r.data.error || "Your store details didn't save");

      // 3) Accepting orders (the same switch as the top-bar pill)
      if (form.is_open !== saved.form.is_open) {
        r = await call("/api/vendor/store-status", {
          method: "PATCH",
          body: JSON.stringify({ is_open: form.is_open }),
        });
        if (!r.ok) problems.push(r.data.error || "Accepting orders didn't save");
      }

      // 4) Opening hours
      if (JSON.stringify(hours) !== JSON.stringify(saved.hours)) {
        r = await call("/api/vendor/opening-hours", {
          method: "PUT",
          body: JSON.stringify({ hours }),
        });
        if (!r.ok) problems.push(r.data.error || "Your opening hours didn't save");
      }

      // 5) Delivery fees by area (blank removes the fee)
      for (const z of saved.zones) {
        const before = saved.zoneInputs[z.zone_id] ?? "";
        const after = (zoneInputs[z.zone_id] ?? "").trim();
        if (before === after) continue;
        if (after === "") {
          r = await call(`/api/vendor/zone-fees/${z.zone_id}`, { method: "DELETE" });
        } else {
          r = await call(`/api/vendor/zone-fees/${z.zone_id}`, {
            method: "PATCH",
            body: JSON.stringify({ delivery_fee: Number(after) }),
          });
        }
        if (!r.ok) {
          problems.push(`${z.zone_name}: ${r.data.error || "the fee didn't save"}`);
        }
      }
    } catch (err) {
      problems.push(err.message || "Something went wrong");
    }

    // Reload from the server so the screen shows what was really saved.
    const profile = await loadAll();
    setSaving(false);
    if (profile) {
      window.dispatchEvent(
        new CustomEvent("store-status-changed", {
          detail: { is_open: profile.is_open },
        }),
      );
      window.dispatchEvent(new Event("vendor-settings-changed"));
    }
    setMessage(
      problems.length
        ? { type: "error", text: `Some changes weren't saved: ${problems.join("; ")}` }
        : { type: "ok", text: "Settings saved" },
    );
  }

  const coverShown = coverPreview || saved.coverUrl;

  return (
    <div className="st-root">
      <div className="st-header">
        <h1>Settings</h1>
        <p className="st-subtitle">
          Manage how your store looks, when it is open and how you get notified.
        </p>
      </div>

      <div className="st-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={t.key === activeTab ? "st-tab st-tab-on" : "st-tab"}
            onClick={() => goToTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="st-grid">
        <div className="st-col">
          <section className="st-card" ref={(el) => (sectionRefs.current.profile = el)}>
            <h2 className="st-card-title">Store profile</h2>
            <p className="st-muted">What customers see on your store page</p>

            <div className="st-cover">
              {coverShown ? (
                <img src={coverShown} alt="" />
              ) : (
                <span className="st-cover-empty" />
              )}
              <div className="st-cover-text">
                <strong>Cover photo</strong>
                <span className="st-muted">Shown at the top of your store page</span>
              </div>
              <label className="st-btn-outline">
                Change photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={chooseCover}
                  hidden
                />
              </label>
            </div>

            <div className="st-two">
              <label className="st-field">
                Store name
                <input
                  value={form.name}
                  maxLength={120}
                  onChange={(e) => set("name", e.target.value)}
                />
              </label>
              <label className="st-field">
                Cuisine
                <input
                  list="st-cuisines"
                  value={form.cuisine}
                  maxLength={120}
                  placeholder="e.g. Nigerian"
                  onChange={(e) => set("cuisine", e.target.value)}
                />
                <datalist id="st-cuisines">
                  {CUISINES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            </div>
            <label className="st-field">
              Description
              <textarea
                rows={3}
                maxLength={500}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </label>
            <label className="st-field">
              Deal badge text
              <input
                value={form.deal_text}
                maxLength={120}
                placeholder="e.g. Free drink over ₦5,000"
                onChange={(e) => set("deal_text", e.target.value)}
              />
            </label>
          </section>

          <section className="st-card" ref={(el) => (sectionRefs.current.delivery = el)}>
            <h2 className="st-card-title">Delivery settings</h2>
            <p className="st-muted">Shown to customers before they order</p>

            <div className="st-two">
              <label className="st-field">
                Delivery time
                <input
                  value={form.delivery_time_estimate}
                  maxLength={60}
                  placeholder="e.g. 25 to 35 min"
                  onChange={(e) => set("delivery_time_estimate", e.target.value)}
                />
              </label>
              <label className="st-field">
                Default delivery fee (₦)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.delivery_fee}
                  onChange={(e) => set("delivery_fee", e.target.value)}
                />
              </label>
            </div>
            <label className="st-field">
              Minimum order (₦)
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.min_order_amount}
                onChange={(e) => set("min_order_amount", e.target.value)}
              />
            </label>
            <p className="st-muted st-gap">
              The minimum applies to the food total, not the delivery fee. Use 0
              for no minimum.
            </p>

            <h3 className="st-sub">Delivery fees by area</h3>
            <p className="st-muted">
              Set a different fee for an area, or leave it blank to use your
              default fee.
            </p>
            <div className="st-zones">
              {saved.zones.map((z) => (
                <div key={z.zone_id} className="st-zone-row">
                  <span>{z.zone_name}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="Default"
                    value={zoneInputs[z.zone_id] ?? ""}
                    onChange={(e) =>
                      setZoneInputs((inputs) => ({
                        ...inputs,
                        [z.zone_id]: e.target.value,
                      }))
                    }
                    aria-label={`Delivery fee for ${z.zone_name}`}
                  />
                </div>
              ))}
              {saved.zones.length === 0 && (
                <p className="st-muted">No delivery areas have been set up yet.</p>
              )}
            </div>
          </section>
        </div>

        <div className="st-col">
          <section className="st-card" ref={(el) => (sectionRefs.current.hours = el)}>
            <h2 className="st-card-title">Opening hours</h2>
            <p className="st-muted">Customers can only order while you are open</p>
            {!saved.configured && (
              <div className="st-hint">
                You haven't set opening hours yet. Until you save them, customers
                can order whenever "Accepting orders" is on.
              </div>
            )}
            <div className="st-hours">
              {DAYS.map((d, i) => {
                const h = hours[i];
                return (
                  <div key={d.dow} className="st-hours-row">
                    <span className="st-day">{d.name}</span>
                    <Switch
                      checked={h.is_open}
                      onChange={(e) => updateHour(i, { is_open: e.target.checked })}
                      label={`${d.name} open`}
                    />
                    {h.is_open ? (
                      <>
                        <input
                          type="time"
                          value={h.open_time}
                          onChange={(e) => updateHour(i, { open_time: e.target.value })}
                          aria-label={`${d.name} opens at`}
                        />
                        <input
                          type="time"
                          value={h.close_time}
                          onChange={(e) => updateHour(i, { close_time: e.target.value })}
                          aria-label={`${d.name} closes at`}
                        />
                      </>
                    ) : (
                      <>
                        <span className="st-closed">Closed</span>
                        <span className="st-closed">Closed</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="st-muted st-gap">
              Hours are in Nigerian time. A closing time earlier than the
              opening time means you close after midnight, for example 18:00 to
              02:00.
            </p>
          </section>

          <section className="st-card" ref={(el) => (sectionRefs.current.alerts = el)}>
            <h2 className="st-card-title">Orders and alerts</h2>
            <p className="st-muted">Control when you receive orders</p>
            <div className="st-toggles">
              <div className="st-toggle">
                <div>
                  <strong>Accepting orders</strong>
                  <span className="st-muted">Turn off to pause new orders</span>
                </div>
                <Switch
                  checked={form.is_open}
                  onChange={(e) => set("is_open", e.target.checked)}
                  label="Accepting orders"
                />
              </div>
              <div className="st-toggle">
                <div>
                  <strong>Sound alert for new orders</strong>
                  <span className="st-muted">
                    Plays a tone when an order arrives.{" "}
                    <button type="button" className="st-link" onClick={() => playBeep(2)}>
                      Play test sound
                    </button>
                  </span>
                </div>
                <Switch
                  checked={form.alert_sound}
                  onChange={(e) => set("alert_sound", e.target.checked)}
                  label="Sound alert for new orders"
                />
              </div>
              <div className="st-toggle">
                <div>
                  <strong>Remind me about waiting orders</strong>
                  <span className="st-muted">If an order waits more than 5 minutes</span>
                </div>
                <Switch
                  checked={form.waiting_reminder}
                  onChange={(e) => set("waiting_reminder", e.target.checked)}
                  label="Remind me about waiting orders"
                />
              </div>
              <div className="st-toggle">
                <div>
                  <strong>Daily summary email</strong>
                  <span className="st-muted">
                    Sent each evening after closing. Email isn't set up yet, so
                    this saves your choice but nothing is sent for now.
                  </span>
                </div>
                <Switch
                  checked={form.daily_summary}
                  onChange={(e) => set("daily_summary", e.target.checked)}
                  label="Daily summary email"
                />
              </div>
            </div>
            <p className="st-muted st-gap">
              Your browser only plays sounds after you have clicked on the page
              once.
            </p>
          </section>
        </div>
      </div>

      <div className="st-footer">
        <span
          className={
            message
              ? message.type === "error"
                ? "st-footer-text st-footer-error"
                : "st-footer-text st-footer-ok"
              : "st-footer-text"
          }
        >
          {message
            ? message.text
            : dirty
              ? "You have unsaved changes."
              : "Changes apply to customers straight away."}
        </span>
        <div className="st-footer-buttons">
          <button
            type="button"
            className="st-btn-outline"
            onClick={cancel}
            disabled={!dirty || saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="st-btn-primary"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;