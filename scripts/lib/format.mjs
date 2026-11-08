import { createHash } from "node:crypto";

const MONTHS_FA = [
  null,
  "ژانویه",
  "فوریه",
  "مارس",
  "آوریل",
  "مه",
  "ژوئن",
  "ژوئیه",
  "اوت",
  "سپتامبر",
  "اکتبر",
  "نوامبر",
  "دسامبر",
];

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function faDigits(value) {
  return String(value);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function mixedHtml(value) {
  const escaped = escapeHtml(faDigits(value));
  return escaped.replace(
    /[A-Za-z][A-Za-z0-9+.'’_-]*/g,
    (word) => `<bdi lang="sv" dir="ltr">${word}</bdi>`,
  );
}

export function splitTimestamp(iso) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/.exec(iso);
  if (!match) return null;
  return {
    date: match[1],
    time: `${match[2]}:${match[3]}:${match[4]}`,
    hhmmss: `${match[2]}${match[3]}${match[4]}`,
    offset: match[5],
    iso,
  };
}

export function formatIsoDateFa(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return faDigits(isoDate);
  const month = MONTHS_FA[Number(match[2])];
  if (!month) return faDigits(isoDate);
  return `${faDigits(Number(match[3]))} ${month} ${faDigits(match[1])}`;
}

export function formatTimestampFa(iso, timeZone) {
  const parts = splitTimestamp(iso);
  if (!parts) return escapeHtml(iso);
  const zone = timeZone ? `، به وقت <bdi dir="ltr">${escapeHtml(timeZone)}</bdi>` : "";
  const offset = parts.offset === "Z" ? "Z" : parts.offset;
  return `<time datetime="${escapeHtml(iso)}">${formatIsoDateFa(parts.date)}، ساعت ${faDigits(parts.time)}</time> <bdi dir="ltr">(${escapeHtml(`${parts.date} ${parts.time} ${offset}`)})</bdi>${zone}`;
}

export function addIsoDays(isoDate, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new Error("Expected a calendar date.");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateInTimeZone(iso, timeZone) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return /^\d{4}-\d{2}-\d{2}$/.test(formatted) ? formatted : null;
}

export function formatNowInZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  let offset = parts.timeZoneName.replace(/^GMT|^UTC/, "");
  if (offset === "" || offset === "+0" || offset === "+00") offset = "Z";
  else if (/^[+-]\d{2}:\d{2}$/.test(offset)) {
    /* already canonical */
  } else if (/^[+-]\d{2}$/.test(offset)) offset = `${offset}:00`;
  else if (/^[+-]\d{1,2}$/.test(offset)) {
    const sign = offset[0];
    const hours = offset.slice(1).padStart(2, "0");
    offset = `${sign}${hours}:00`;
  } else {
    throw new Error("Could not read the timezone offset.");
  }
  const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset === "Z" ? "Z" : offset}`;
  if (!splitTimestamp(iso)) throw new Error("Could not build a timestamp.");
  return iso;
}

export function snapshotIdFromTimestamp(iso, kind) {
  const parts = splitTimestamp(iso);
  if (!parts) throw new Error("Timestamp must include seconds and a timezone offset.");
  if (kind === "source") return `${parts.date}-${parts.hhmmss}`;
  if (kind === "check") return `${parts.date}-check-${parts.hhmmss}`;
  throw new Error("Unknown snapshot kind.");
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function withoutPublication(summary) {
  const copy = { ...summary };
  delete copy.publication;
  return copy;
}

export function factsEqual(left, right) {
  return stableStringify(withoutPublication(left)) === stableStringify(withoutPublication(right));
}
