import { matchesVacancy, sortVacancies } from "./vacancies.js";

function faDigits(value) {
  return String(value);
}

function sentence(shown, total) {
  if (shown === total) return `${faDigits(total)} آگهی نشان داده می‌شود.`;
  return `${faDigits(shown)} آگهی از ${faDigits(total)} آگهی نشان داده می‌شود.`;
}

function readCard(card) {
  return {
    el: card,
    title: card.dataset.title || "",
    titleFa: card.dataset.titleFa || "",
    employer: card.dataset.employer || "",
    location: card.dataset.location || "",
    deadline: card.dataset.deadline || "",
    status: card.dataset.status || "",
    url: card.dataset.url || "",
  };
}

function initVacancyLibrary() {
  const list = document.querySelector("[data-vacancy-list]");
  if (!list) return;
  const cards = [...list.querySelectorAll("[data-vacancy]")].map(readCard);
  const query = document.querySelector("#vacancy-query");
  const status = document.querySelector("#vacancy-status");
  const from = document.querySelector("#deadline-from");
  const to = document.querySelector("#deadline-to");
  const sort = document.querySelector("#vacancy-sort");
  const live = document.querySelector("#vacancy-count");
  const empty = document.querySelector("#vacancy-empty");
  const reset = document.querySelector("#vacancy-reset");

  function apply() {
    const shown = sortVacancies(
      cards.filter((card) => matchesVacancy(card, query.value, status.value, from.value, to.value)),
      sort.value,
    );
    const visible = new Set(shown.map((card) => card.el));
    for (const card of cards) card.el.hidden = !visible.has(card.el);
    for (const card of shown) list.append(card.el);
    if (live) live.textContent = sentence(shown.length, cards.length);
    if (empty) empty.hidden = shown.length !== 0;
  }

  for (const control of [query, status, from, to, sort]) {
    control.addEventListener("input", apply);
    control.addEventListener("change", apply);
  }
  reset.addEventListener("click", () => {
    query.value = "";
    status.value = "all";
    from.value = "";
    to.value = "";
    sort.value = "deadline-asc";
    apply();
    query.focus();
  });
  apply();
}

initVacancyLibrary();
