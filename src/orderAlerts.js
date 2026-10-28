import { useEffect, useRef } from "react";
import { API_URL } from "./config";

// Browsers only allow sound after the person has clicked or pressed a key on
// the page at least once, so the sound is "unlocked" by the first click.
let audioContext = null;

function getContext() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  return audioContext;
}

export function unlockAudio() {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

// A short beep, repeated "times" times.
export function playBeep(times = 2) {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const start = ctx.currentTime + 0.02;
  for (let i = 0; i < times; i++) {
    const t = start + i * 0.3;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(t);
    oscillator.stop(t + 0.25);
  }
}

const REMINDER_AFTER_MS = 5 * 60 * 1000; // an order waits this long before a reminder
const REMINDER_EVERY_MS = 5 * 60 * 1000; // and the reminder repeats this often

// placedOrders: the orders waiting to be accepted, as [{ id, created_at }],
// or null until the first check has finished.
// Plays a beep when a NEW order arrives (if "Sound alert" is on) and a
// reminder when an order has waited too long (if "Remind me" is on).
export function useOrderAlerts(placedOrders, token) {
  const settings = useRef({ sound: true, reminder: true });
  const seen = useRef(null);
  const lastReminder = useRef(0);
  const latest = useRef(null);
  latest.current = placedOrders;

  // Unlock sound on the first click or key press.
  useEffect(() => {
    function unlock() {
      unlockAudio();
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Read the alert preferences, and again whenever Settings saves.
  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      try {
        const response = await fetch(`${API_URL}/api/vendor/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          settings.current = {
            sound: data.alert_sound !== false,
            reminder: data.waiting_reminder !== false,
          };
        }
      } catch {
        // Keep the last known preferences.
      }
    }
    loadSettings();
    window.addEventListener("vendor-settings-changed", loadSettings);
    return () => {
      cancelled = true;
      window.removeEventListener("vendor-settings-changed", loadSettings);
    };
  }, [token]);

  // New order arrived?
  useEffect(() => {
    if (placedOrders === null) return;
    const ids = new Set(placedOrders.map((o) => o.id));
    if (seen.current === null) {
      seen.current = ids; // the first list is not "new"
      return;
    }
    let fresh = false;
    ids.forEach((id) => {
      if (!seen.current.has(id)) fresh = true;
    });
    seen.current = ids;
    if (fresh && settings.current.sound) playBeep(2);
  }, [placedOrders]);

  // An order has been waiting too long?
  useEffect(() => {
    const timer = setInterval(() => {
      const list = latest.current;
      if (!list || !settings.current.reminder) return;
      const now = Date.now();
      const waiting = list.some(
        (o) => now - new Date(o.created_at).getTime() > REMINDER_AFTER_MS,
      );
      if (waiting && now - lastReminder.current >= REMINDER_EVERY_MS) {
        lastReminder.current = now;
        playBeep(3);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, []);
}