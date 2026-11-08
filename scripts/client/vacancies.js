export function compareSv(left, right) {
  return String(left).localeCompare(String(right), "sv", {
    usage: "sort",
    sensitivity: "variant",
    numeric: true,
  });
}

export function normalizeSearch(value) {
  return String(value || "")
    .toLocaleLowerCase("sv")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compareDeadline(left, right, direction) {
  const leftEmpty = !left;
  const rightEmpty = !right;
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (left === right) return 0;
  return left < right ? -direction : direction;
}

export function sortVacancies(items, mode) {
  const direction = mode === "deadline-desc" ? -1 : 1;
  return [...items].sort((left, right) => {
    let compared = 0;
    if (mode === "title") compared = compareSv(left.title, right.title);
    else if (mode === "employer") compared = compareSv(left.employer, right.employer);
    else compared = compareDeadline(left.deadline, right.deadline, direction);
    if (compared === 0) compared = compareSv(left.title, right.title);
    if (compared === 0) compared = compareSv(left.employer, right.employer);
    if (compared === 0) compared = compareSv(left.url || "", right.url || "");
    return compared;
  });
}

export function matchesVacancy(item, query, status, from, to) {
  if (status && status !== "all" && item.status !== status) return false;
  if (from || to) {
    if (!item.deadline) return false;
    if (from && item.deadline < from) return false;
    if (to && item.deadline > to) return false;
  }
  const needle = normalizeSearch(query);
  if (!needle) return true;
  const haystack = normalizeSearch([item.title, item.titleFa, item.employer, item.location].filter(Boolean).join(" "));
  return haystack.includes(needle);
}
