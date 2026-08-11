import { useState, useEffect } from "react";

const API_URL = "https://delivery-app-backend-z9yz.onrender.com";

function StoreSettings({ token }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // --- Delivery fees by zone ---
  const [zoneFees, setZoneFees] = useState([]); // [{ zone_id, zone_name, delivery_fee }]
  const [zoneFeesLoading, setZoneFeesLoading] = useState(true);
  const [zoneFeeInputs, setZoneFeeInputs] = useState({}); // { [zone_id]: "typed value" }
  const [savingZoneId, setSavingZoneId] = useState(null); // which row's save button is spinning
  const [savedZoneId, setSavedZoneId] = useState(null); // brief "Saved" confirmation per row

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  async function fetchProfile() {
    try {
      const response = await fetch(`${API_URL}/api/vendor/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load profile");
      setProfile(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchZoneFees() {
    try {
      const response = await fetch(`${API_URL}/api/vendor/zone-fees`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Failed to load zone fees");
      setZoneFees(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setZoneFeesLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
    fetchZoneFees();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const form = e.target;
    const payload = {
      cuisine: form.cuisine.value,
      cover_image_url: form.cover_image_url.value,
      delivery_time_estimate: form.delivery_time_estimate.value,
      delivery_fee: parseFloat(form.delivery_fee.value) || 0,
      deal_text: form.deal_text.value || null,
      rating: parseFloat(form.rating.value) || 0,
    };

    try {
      const response = await fetch(`${API_URL}/api/vendor/profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save changes");
      setProfile(data);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Saves ONE zone's fee - each row has its own Save button so a vendor
  // can update one area without having to touch every other field.
  async function saveZoneFee(zoneId) {
    const typedValue = zoneFeeInputs[zoneId];
    if (typedValue === undefined || typedValue === "") return;

    setSavingZoneId(zoneId);
    try {
      const response = await fetch(
        `${API_URL}/api/vendor/zone-fees/${zoneId}`,
        {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ delivery_fee: parseFloat(typedValue) }),
        },
      );
      if (!response.ok) throw new Error("Failed to save delivery fee");
      await fetchZoneFees();
      setSavedZoneId(zoneId);
      setTimeout(() => setSavedZoneId(null), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingZoneId(null);
    }
  }

  if (loading) return <p>Loading store settings...</p>;

  if (!profile)
    return <p className="error-text">Could not load your profile: {error}</p>;

  return (
    <div>
      <h1>Store Settings</h1>
      <p className="settings-hint">
        This information appears on your storefront in the Customer App.
      </p>

      <form onSubmit={handleSubmit} className="settings-form">
        <label>
          Cuisine / tags
          <input
            name="cuisine"
            placeholder="e.g. American · Burgers"
            defaultValue={profile.cuisine || ""}
          />
        </label>

        <label>
          Cover photo URL
          <input
            name="cover_image_url"
            placeholder="https://..."
            defaultValue={profile.cover_image_url || ""}
          />
        </label>

        <div className="settings-row">
          <label>
            Delivery time estimate
            <input
              name="delivery_time_estimate"
              placeholder="e.g. 20-30 min"
              defaultValue={profile.delivery_time_estimate || ""}
            />
          </label>
          <label>
            Default delivery fee (₦)
            <input
              name="delivery_fee"
              type="number"
              step="0.01"
              defaultValue={profile.delivery_fee || 0}
            />
          </label>
        </div>
        <p className="settings-hint" style={{ marginTop: -10 }}>
          Used for any area you haven't set a specific fee for below.
        </p>

        <label>
          Deal / promo text (optional)
          <input
            name="deal_text"
            placeholder="e.g. 20% off first order"
            defaultValue={profile.deal_text || ""}
          />
        </label>

        <label>
          Rating (temporary - not yet based on real reviews)
          <input
            name="rating"
            type="number"
            step="0.1"
            min="0"
            max="5"
            defaultValue={profile.rating || 0}
          />
        </label>

        {error && <p className="error-text">{error}</p>}
        {success && <p className="success-text">Saved successfully.</p>}

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>

      <h2 style={{ marginTop: 32 }}>Delivery fees by area</h2>
      <p className="settings-hint">
        Set a different delivery fee for each area you deliver to. Leave an area
        blank to use your default delivery fee above.
      </p>

      {zoneFeesLoading ? (
        <p>Loading areas...</p>
      ) : (
        <div className="menu-form" style={{ maxWidth: 480 }}>
          {zoneFees.map((zone) => (
            <div
              key={zone.zone_id}
              className="settings-row"
              style={{ alignItems: "center" }}
            >
              <span style={{ flex: 1 }}>{zone.zone_name}</span>
              <input
                type="number"
                step="0.01"
                placeholder={
                  zone.delivery_fee !== null
                    ? String(zone.delivery_fee)
                    : "Using default"
                }
                value={
                  zoneFeeInputs[zone.zone_id] ??
                  (zone.delivery_fee !== null ? zone.delivery_fee : "")
                }
                onChange={(e) =>
                  setZoneFeeInputs({
                    ...zoneFeeInputs,
                    [zone.zone_id]: e.target.value,
                  })
                }
                style={{ maxWidth: 110 }}
              />
              <button
                type="button"
                onClick={() => saveZoneFee(zone.zone_id)}
                disabled={savingZoneId === zone.zone_id}
              >
                {savingZoneId === zone.zone_id
                  ? "..."
                  : savedZoneId === zone.zone_id
                    ? "✓ Saved"
                    : "Save"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default StoreSettings;
