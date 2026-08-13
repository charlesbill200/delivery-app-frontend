// config.js
// Single source of truth for the API base URL.
//
// Reads from an env var so local dev can point at localhost without
// hand-editing every file that calls the API. Falls back to the live
// Render URL if the env var isn't set (e.g. someone runs the build
// without a .env file).
//
// To point at a local backend, create a .env file (Vite auto-loads it) with:
//   VITE_API_URL=http://localhost:5000

export const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://delivery-app-backend-z9yz.onrender.com";
