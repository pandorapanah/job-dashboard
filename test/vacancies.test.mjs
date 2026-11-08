import assert from "node:assert/strict";
import test from "node:test";
import { compareSv, matchesVacancy, sortVacancies } from "../scripts/client/vacancies.js";

test("Swedish title sort is alphabetical, with å ä ö after z", () => {
  const titles = ["Övrigt", "Äpple", "Zebra", "Administratör", "Ång", "Administrativ assistent"];
  const sorted = [...titles].sort(compareSv);
  assert.deepEqual(sorted, ["Administrativ assistent", "Administratör", "Zebra", "Ång", "Äpple", "Övrigt"]);
  assert.ok(compareSv("Z", "Å") < 0);
  assert.ok(compareSv("Å", "Ä") < 0);
  assert.ok(compareSv("Ä", "Ö") < 0);
});

test("deadline sort keeps unknown dates last and title sort is not the input order", () => {
  const items = [
    { title: "Zebra", employer: "B", deadline: "2026-12-01", url: "https://example.com/z", status: "مهلت آینده" },
    { title: "Administratör", employer: "A", deadline: "", url: "https://example.com/a", status: "نامشخص" },
    { title: "Ång", employer: "C", deadline: "2026-11-08", url: "https://example.com/aa", status: "مهلت امروز" },
  ];
  assert.deepEqual(sortVacancies(items, "deadline-asc").map((item) => item.deadline), ["2026-11-08", "2026-12-01", ""]);
  assert.deepEqual(sortVacancies(items, "deadline-desc").map((item) => item.deadline), ["2026-12-01", "2026-11-08", ""]);
  assert.deepEqual(sortVacancies(items, "title").map((item) => item.title), ["Administratör", "Zebra", "Ång"]);
  assert.notDeepEqual(sortVacancies(items, "title").map((item) => item.url), items.map((item) => item.url));
});

test("search covers title, employer, and location, including Persian letter forms", () => {
  const item = {
    title: "HR-koordinator",
    titleFa: "هماهنگ‌کننده",
    employer: "Göteborgs Stad",
    location: "گوتنبرگ",
    deadline: "2026-11-08",
    status: "مهلت امروز",
  };
  assert.equal(matchesVacancy(item, "هماهنگ", "all", "", ""), true);
  assert.equal(matchesVacancy(item, "گوتنبرگ", "all", "", ""), true);
  assert.equal(matchesVacancy(item, "هماهنگ كننده", "all", "", ""), true);
  assert.equal(matchesVacancy(item, "stad", "مهلت امروز", "2026-11-08", "2026-11-08"), true);
  assert.equal(matchesVacancy(item, "", "مهلت آینده", "", ""), false);
  assert.equal(matchesVacancy(item, "", "all", "2026-11-09", ""), false);
  assert.equal(matchesVacancy({ ...item, deadline: "", location: "" }, "", "all", "2026-11-01", ""), false);
});
