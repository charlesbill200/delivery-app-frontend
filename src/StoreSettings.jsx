import { useState, useEffect } from "react";

const API_URL = "https://delivery-app-backend-z9yz.onrender.com";

function StoreSettings({ token }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function fetchProfile() {
    try {
      const response = await fetch(`${API_URL}/api/vendor/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to load profile");
      const data = await response.json();
      setProfile(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfile();
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
      if (!response.ok) throw new Error("Failed to save changes");
      const updated = await response.json();
      setProfile(updated);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading store settings...</p>;
  if (!profile) return <p>Could not load your profile.</p>;

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
            Delivery fee (₦)
            <input
              name="delivery_fee"
              type="number"
              step="0.01"
              defaultValue={profile.delivery_fee || 0}
            />
          </label>
        </div>

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
    </div>
  );
}

export default StoreSettings;
