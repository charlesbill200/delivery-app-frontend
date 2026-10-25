// Small pieces shared by the order screens.

export function Icon({ name, size = 16 }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  switch (name) {
    case "check":
      return (
        <svg {...props}>
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "x":
      return (
        <svg {...props}>
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "pin":
      return (
        <svg {...props}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "search":
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      );
    case "info":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "download":
      return (
        <svg {...props}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      );
    case "arrow-left":
      return (
        <svg {...props}>
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    default:
      return null;
  }
}

export function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatMoney(value) {
  return (
    "₦" +
    (Number(value) || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })
  );
}

// Today's date (or the given date) as YYYY-MM-DD in Nigerian time.
export function lagosDate(value = new Date()) {
  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "Africa/Lagos",
  });
}

// "Today, 12:42 PM" for today, "21 Jul, 9:25 PM" for other days.
export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  const time = formatTime(d);
  if (lagosDate(d) === lagosDate()) return `Today, ${time}`;
  const day = d.toLocaleDateString([], { day: "numeric", month: "short" });
  return `${day}, ${time}`;
}

// The PDF's built-in font can't draw accents or the naira sign, so text is
// cleaned up and amounts are written as "NGN".
export function pdfText(value) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F]/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

export function pdfMoney(value) {
  return pdfText(
    "NGN " +
      (Number(value) || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 }),
  );
}