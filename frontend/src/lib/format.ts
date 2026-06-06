const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Grouped thousands, fixed decimals. */
export function formatNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Signed percent like "+412%", "-12%", "0%" (06 §4). */
export function formatPct(n: number, decimals = 0, withSign = true): string {
  if (!Number.isFinite(n)) return "—";
  const sign = withSign && n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/**
 * Signed integer percent — alias used by panels (MT-37, §5).
 * e.g. signedPct(412) → "+412%", signedPct(-37) → "-37%", signedPct(0) → "0%"
 */
export function signedPct(n: number): string {
  return formatPct(Math.round(n), 0, true);
}

export type DateStyle = "short" | "medium" | "weekday";

/** Format an ISO YYYY-MM-DD date. Parsed as UTC to avoid TZ drift (05 intro). */
export function formatDate(iso: string, style: DateStyle = "short"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, monthIdx, day));
  const mon = MONTHS_SHORT[monthIdx];
  const wd = WEEKDAYS_SHORT[d.getUTCDay()];
  switch (style) {
    case "medium":
      return `${mon} ${day}, ${year}`;
    case "weekday":
      return `${wd}, ${mon} ${day}`;
    case "short":
    default:
      return `${mon} ${day}`;
  }
}
