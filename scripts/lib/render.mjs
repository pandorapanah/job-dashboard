import { readFileSync } from "node:fs";
import path from "node:path";
import { sortVacancies } from "../client/vacancies.js";
import {
  addIsoDays,
  escapeHtml,
  faDigits,
  formatIsoDateFa,
  formatTimestampFa,
  mixedHtml,
} from "./format.mjs";
import { clientDir, REVISION_LABEL_FA } from "./paths.mjs";

const STATUS_CLASS = {
  "مهلت گذشته": "status-past",
  "مهلت امروز": "status-today",
  "مهلت آینده": "status-future",
  "نامشخص": "status-unknown",
};

function pageShell({ title, description, depth, body, current, script = false }) {
  const assets = `${"../".repeat(depth)}assets/`;
  const home = `${"../".repeat(depth)}index.html`;
  const archive = `${"../".repeat(depth)}archive/index.html`;
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="referrer" content="no-referrer">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="${assets}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${assets}style.css">
</head>
<body>
  <a class="skip" href="#content">برو به متن</a>
  <header class="site-header">
    <div class="wrap">
      <p class="mark">یک گزارش بی‌نام</p>
      ${body.header}
      <nav class="nav" aria-label="میان صفحه‌ها">
        <a href="${home}"${current === "latest" ? ' aria-current="page"' : ""}>تازه‌ترین گزارش</a>
        <a href="${archive}"${current === "archive" ? ' aria-current="page"' : ""}>بایگانی</a>
        <a href="${body.libraryHref}"${current === "library" ? ' aria-current="page"' : ""}>کتابخانهٔ آگهی‌ها</a>
      </nav>
    </div>
  </header>
  <main id="content" class="wrap stack">
    ${body.main}
  </main>
  <footer class="site-footer">
    <div class="wrap">
      <p>اینجا نام، راه‌تماس، رزومه، جواب فرم و وضعیت درخواست برای آگهی‌ها نیست. چیزی برای ورود یا فرستادن اطلاعات هم ندارد.</p>
      ${body.footer || ""}
    </div>
  </footer>
  ${script ? `<script type="module" src="${assets}view.js"></script>` : ""}
</body>
</html>
`;
}

function roleLabel(summary) {
  return summary.publication?.kind === "revision_check" ? REVISION_LABEL_FA : "خلاصهٔ اصلی";
}

function versionBlock(summary, variant, immutableHref, immutableLabel) {
  const role = roleLabel(summary);
  const lines = [
    `<p class="version">تاریخ گزارش: <time datetime="${escapeHtml(summary.report_date)}">${formatIsoDateFa(summary.report_date)}</time> <bdi dir="ltr">(${escapeHtml(summary.report_date)})</bdi></p>`,
    `<p class="version">منطقهٔ زمانی: <bdi dir="ltr">${escapeHtml(summary.timezone)}</bdi></p>`,
    `<p class="version">زمان ساخت خلاصهٔ اصلی: ${formatTimestampFa(summary.generated_at, summary.timezone)}</p>`,
  ];
  if (summary.publication?.kind === "revision_check") {
    lines.push(
      `<p class="version"><span class="badge">${escapeHtml(role)}</span></p>`,
      `<p>این نسخه یک بازبینی و کنترل است، نه یک گزارش روز بعد و نه یک ارسال تازه. عددها و آگهی‌ها همان خلاصهٔ اصلی‌اند.</p>`,
      `<p class="version">زمان ثبت این بازبینی: ${formatTimestampFa(summary.publication.updated_at, summary.timezone)}</p>`,
      `<p>${mixedHtml(summary.publication.note_fa)}</p>`,
    );
  } else {
    lines.push(`<p class="version"><span class="badge">خلاصهٔ اصلی</span> این همان دادهٔ ساخته‌شده در زمان بالاست.</p>`);
  }
  if (variant === "latest") {
    lines.push(`<p>این صفحه همیشه تازه‌ترین نسخهٔ موجود را نشان می‌دهد. <a href="${immutableHref}">${immutableLabel}</a> در بایگانی می‌ماند و بعداً عوض نمی‌شود.</p>`);
  } else {
    lines.push(`<p>این یک نسخهٔ ثابت است. به‌روزرسانی‌های بعدی این صفحه را عوض نمی‌کنند.</p>`);
  }
  return lines.join("\n");
}

function statCard(metric, aggregate, definition) {
  const limitation = aggregate.limitation_fa ? `<p>${mixedHtml(aggregate.limitation_fa)}</p>` : "";
  return `<article class="stat" data-metric="${escapeHtml(metric)}" data-value="${aggregate.value}">
    <p class="num">${faDigits(aggregate.value)}</p>
    <p class="label">${mixedHtml(aggregate.label_fa)}</p>
    ${limitation}
    <details>
      <summary>این عدد دقیقاً یعنی چه؟</summary>
      <p>${mixedHtml(definition)}</p>
    </details>
  </article>`;
}

function reportMain(summary, variant, hrefs) {
  const aggregates = summary.aggregates;
  const definitions = summary.counting_definitions;
  const today = aggregates.applications_submitted_today.value;
  const week = aggregates.applications_submitted_last_7_days.value;
  const earlier = week - today;
  const windowStart = addIsoDays(summary.report_date, -6);
  const dayBefore = addIsoDays(summary.report_date, -1);
  const total = aggregates.all_officially_submitted.value;
  const bot = aggregates.submitted_by_applicant_bot_with_known_date.value;
  const historical = aggregates.historical_submitted_unknown_exact_date.value;
  const lifetimeSentence = bot + historical === total
    ? `در این خلاصه این دو گروه با هم می‌شوند ${faDigits(total)} تا.`
    : `جمع کل ${faDigits(total)} تاست. این دو گروه با هم ${faDigits(bot + historical)} تا می‌شوند و لزوماً همهٔ جمع کل نیستند.`;
  const earlierSentence = earlier === 0
    ? `از ${formatIsoDateFa(windowStart)} تا ${formatIsoDateFa(dayBefore)}، روی هم، ${faDigits(0)} ارسال با تاریخ مشخص ثبت شده. چون جمع این تکه صفر است، ارسال تاریخ‌داری در این روزها نبوده. تفکیک ساختگیِ روزبه‌روز هم این‌جا نیامده.`
    : `از ${formatIsoDateFa(windowStart)} تا ${formatIsoDateFa(dayBefore)}، روی هم ${faDigits(earlier)} ارسال با تاریخ مشخص ثبت شده. این خلاصه نمی‌گوید آن تعداد مال کدام روز بوده و اینجا روز جداگانه‌ای برایشان ساخته نشده.`;

  const actions = summary.next_actions.length
    ? summary.next_actions.map((action) => `<li>${mixedHtml(action.label_fa)}</li>`).join("")
    : "<li>قدم بعدیِ مشخصی در این خلاصه نیست.</li>";

  return `<article class="note" data-snapshot-role="${summary.publication ? "revision_check" : "source"}" data-report-date="${escapeHtml(summary.report_date)}">
    <h2>${variant === "latest" ? "تازه‌ترین گزارش" : "نسخهٔ ثابت"}</h2>
    ${versionBlock(summary, variant, hrefs.immutable, "نسخهٔ ثابت همین گزارش")}
  </article>
  <section class="panel" id="limits">
    <h2>حدود این گزارش</h2>
    <div class="measure">
      <p>${mixedHtml(summary.scope_note_fa)}</p>
      <p>عددهای این صفحه دربارهٔ جمع درخواست‌هاست و نام کارفرما ندارد. کتابخانهٔ آگهی‌ها صفحه‌ای جداست و نمی‌گوید برای کدام آگهی درخواستی رفته.</p>
      <p>${mixedHtml(summary.counting_definitions.official_confirmation_on_report_date.fa)}</p>
      <p>${mixedHtml(summary.aggregates.applications_ready_not_submitted.limitation_fa)}</p>
      <p>${mixedHtml(summary.aggregates.new_employer_responses_today.limitation_fa)}</p>
      <p>${mixedHtml(summary.aggregates.interview_invitations_today.limitation_fa)}</p>
      <p>مهلت آگهی‌ها در صفحهٔ کتابخانه است. «مهلت امروز» فقط یعنی تاریخ مهلت با روز گزارش یکی است. ساعت بسته شدنش معلوم نیست، پس باز بودن آگهی تا همین لحظه یا تا نیمه‌شب تضمین نشده.</p>
    </div>
  </section>
  <nav class="section-nav" aria-label="بخش‌های همین گزارش">
    <a href="#today">امروز</a>
    <a href="#week">هفت روز</a>
    <a href="#prep">آماده‌سازی</a>
    <a href="#responses">پاسخ و مصاحبه</a>
    <a href="#lifetime">تا حالا</a>
    <a href="#next">قدم بعدی</a>
  </nav>
  <section id="today">
    <h2>امروز</h2>
    <div class="stats">
      ${statCard("applications_submitted_today", aggregates.applications_submitted_today, definitions.submitted_on_report_date.fa)}
      ${statCard("confirmations_today", aggregates.confirmations_today, definitions.official_confirmation_on_report_date.fa)}
    </div>
  </section>
  <section id="week">
    <h2>هفت روز با تاریخ مشخص</h2>
    <p class="measure">بازه از ${formatIsoDateFa(windowStart)} تا ${formatIsoDateFa(summary.report_date)} است. جمع ارسال‌های رسمی که تاریخ مشخص دارند ${faDigits(week)} تاست. پنج درخواست تاریخیِ بدون تاریخ دقیق وارد این حساب نمی‌شوند و برایشان تاریخ روزانه ساخته نشده.</p>
    <div class="panel">
      <table>
        <caption>فقط ارسال‌هایی که تاریخ مشخص دارند</caption>
        <thead><tr><th scope="col">بازه</th><th scope="col">تعداد</th></tr></thead>
        <tbody>
          <tr><th scope="row">روز گزارش، ${formatIsoDateFa(summary.report_date)}</th><td>${faDigits(today)}</td></tr>
          <tr><th scope="row">${formatIsoDateFa(windowStart)} تا ${formatIsoDateFa(dayBefore)}</th><td>${faDigits(earlier)}</td></tr>
        </tbody>
      </table>
      <p>${earlierSentence}</p>
      <p>${faDigits(historical)} درخواست تاریخی تأیید پورتال دارند ولی تاریخ دقیقشان معلوم نیست. این‌ها ردیف روزانه ندارند.</p>
    </div>
  </section>
  <section id="prep">
    <h2>آماده‌سازی</h2>
    <p class="measure">آماده‌سازیِ ناتمام، آمادهٔ ارسال بدون مانع، و موردی که هنوز توجه می‌خواهد سه شمارش جدا هستن. توضیح صفرِ آمادهٔ ارسال زیر همان کارت آمده.</p>
    <div class="stats">
      ${statCard("applications_in_active_preparation", aggregates.applications_in_active_preparation, definitions.active_unfinished_preparation.fa)}
      ${statCard("applications_ready_not_submitted", aggregates.applications_ready_not_submitted, definitions.ready_not_submitted.fa)}
      ${statCard("applications_requiring_attention", aggregates.applications_requiring_attention, definitions.requires_attention.fa)}
    </div>
  </section>
  <section id="responses">
    <h2>پاسخ و مصاحبه</h2>
    <div class="stats">
      ${statCard("new_employer_responses_today", aggregates.new_employer_responses_today, definitions.selection_response_on_report_date.fa)}
      ${statCard("interview_invitations_today", aggregates.interview_invitations_today, definitions.explicit_interview_invitation_on_report_date.fa)}
    </div>
  </section>
  <section id="lifetime">
    <h2>همهٔ ارسال‌های رسمی تا حالا</h2>
    <p class="lifetime-total" data-metric="all_officially_submitted" data-value="${total}">${faDigits(total)}</p>
    <p class="label">${mixedHtml(aggregates.all_officially_submitted.label_fa)}</p>
    <ul>
      <li data-metric="submitted_by_applicant_bot_with_known_date" data-value="${bot}">${faDigits(bot)} تا: ${mixedHtml(aggregates.submitted_by_applicant_bot_with_known_date.label_fa)}</li>
      <li data-metric="historical_submitted_unknown_exact_date" data-value="${historical}">${faDigits(historical)} تا: ${mixedHtml(aggregates.historical_submitted_unknown_exact_date.label_fa)}</li>
    </ul>
    <p>${lifetimeSentence}</p>
    <p>${mixedHtml(definitions.applicant_bot_dated_sends.fa)}</p>
    <p>${mixedHtml(definitions.historical_portal_confirm_unknown_date.fa)}</p>
    <p>برای آن ${faDigits(historical)} موردِ بدون تاریخ دقیق، روز تاریخی ساخته نشده. حتی اگر بعداً یک تاریخ پیدا شود، از روی خودِ تاریخ نمی‌شود گفت چه کسی آن را فرستاده.</p>
  </section>
  <section id="next" class="panel">
    <h2>قدم بعدی، بدون نام</h2>
    <p>این کار به کارفرمای مشخصی وصل نشده.</p>
    <ul>${actions}</ul>
  </section>
  <section class="note" id="library-pointer">
    <h2>کتابخانهٔ آگهی‌ها جداست</h2>
    <p>فهرست آگهی‌های عمومی در صفحهٔ خودش است تا کنار این عددها خوانده نشود. بودن یک آگهی آنجا نمی‌گوید برایش درخواستی رفته، آماده‌سازی شده، یا کسی برایش مناسب بوده.</p>
    <p><a href="${hrefs.library}">کتابخانهٔ همین نسخه</a></p>
  </section>`;
}

export function renderReport(summary, { variant, depth, hrefs, sha256, snapshotId }) {
  const titleDate = formatIsoDateFa(summary.report_date);
  const title = variant === "latest"
    ? "گزارش روزانهٔ جست‌وجوی کار"
    : `گزارش ${titleDate}، ${roleLabel(summary)}`;
  const header = `<h1>گزارش روزانهٔ جست‌وجوی کار</h1>
    <p class="lede">جمع‌بندی کلی اینجاست. فهرست آگهی‌ها صفحه‌ای جداست و نمی‌گوید برای کدام‌شان درخواستی رفته.</p>`;
  return pageShell({
    title,
    description: "گزارش بی‌نام جست‌وجوی کار. جمع‌بندی کلی از کتابخانهٔ آگهی‌های عمومی جداست.",
    depth,
    current: variant === "latest" ? "latest" : "",
    body: {
      header,
      libraryHref: hrefs.library,
      main: reportMain(summary, variant, hrefs),
      footer: `<p class="hash">شناسهٔ نسخه: <bdi dir="ltr">${escapeHtml(snapshotId)}</bdi></p>
        <p class="hash">اثر انگشت خلاصه: <bdi dir="ltr">${escapeHtml(sha256)}</bdi></p>
        <p><a href="${hrefs.summary}">فایل خام همین نسخه</a></p>`,
    },
  });
}

function unavailable(value, missing) {
  return value ? mixedHtml(value) : missing;
}

function vacancyCard(vacancy) {
  const statusClass = STATUS_CLASS[vacancy.vacancy_date_status] || "status-unknown";
  const deadline = vacancy.advertised_deadline_date
    ? `<time datetime="${escapeHtml(vacancy.advertised_deadline_date)}">${formatIsoDateFa(vacancy.advertised_deadline_date)}</time> <bdi dir="ltr">${escapeHtml(vacancy.advertised_deadline_date)}</bdi>`
    : "تاریخش در این خلاصه نیست";
  const todayNote = vacancy.vacancy_date_status === "مهلت امروز"
    ? "<p>امروز بودن مهلت یعنی تاریخش با روز گزارش یکی است، نه اینکه آگهی تا نیمه‌شب باز بماند.</p>"
    : "";
  const location = vacancy.location_public || "";
  return `<article class="card" data-vacancy data-title="${escapeHtml(vacancy.title_sv)}" data-title-fa="${escapeHtml(vacancy.title_explain_fa)}" data-employer="${escapeHtml(vacancy.employer)}" data-location="${escapeHtml(location)}" data-deadline="${escapeHtml(vacancy.advertised_deadline_date || "")}" data-status="${escapeHtml(vacancy.vacancy_date_status)}" data-url="${escapeHtml(vacancy.original_ad_url)}">
    <h3>
      <span class="sv" lang="sv" dir="ltr">${escapeHtml(vacancy.title_sv)}</span>
      <span class="explain">${mixedHtml(vacancy.title_explain_fa)}</span>
    </h3>
    <p class="employer" lang="sv" dir="ltr">${escapeHtml(vacancy.employer)}</p>
    <div class="meta">
      <p class="status ${statusClass}">${escapeHtml(vacancy.vacancy_date_status)}</p>
      <p>مهلت: ${deadline}</p>
      <p>مکان: ${unavailable(vacancy.location_public, "تو این خلاصه نیامده")}</p>
    </div>
    ${todayNote}
    <a class="ad-link" href="${escapeHtml(vacancy.original_ad_url)}" rel="noopener noreferrer">آگهی اصلی <bdi class="url" dir="ltr">${escapeHtml(vacancy.original_ad_url)}</bdi></a>
    <details>
      <summary>جزئیات همین آگهی عمومی</summary>
      <p>${unavailable(vacancy.description_fa, "توضیح این آگهی تو خلاصه نیامده.")}</p>
      <p>شرایط: ${unavailable(vacancy.requirements_fa, "تو این خلاصه نیامده.")}</p>
      <p>آخرین بررسی متن آگهی: ${vacancy.last_public_ad_check_precision === "datetime" ? formatTimestampFa(vacancy.last_public_ad_check) : `<time datetime="${escapeHtml(vacancy.last_public_ad_check)}">${formatIsoDateFa(vacancy.last_public_ad_check)}</time>`}. دقت این بررسی: ${escapeHtml(vacancy.last_public_ad_check_precision === "date_only" ? "فقط تاریخ" : "تاریخ و ساعت")}.</p>
      <p>بررسی خود لینک: کد ${faDigits(vacancy.url_check.http_status)}، نتیجه <bdi dir="ltr">${escapeHtml(vacancy.url_check.result)}</bdi>، در ${formatTimestampFa(vacancy.url_check.checked_at)}.</p>
      <p>${mixedHtml(vacancy.advertised_deadline_precision === "date_only" ? "مهلت فقط با تاریخ آمده و ساعتش معلوم نیست." : "دقت تاریخ مهلت در حد یک روز کامل نیست.")}</p>
    </details>
  </article>`;
}

export function renderLibrary(summary, { variant, depth, hrefs, snapshotId }) {
  const vacancies = sortVacancies(
    summary.public_vacancies.map((vacancy) => ({
      ...vacancy,
      title: vacancy.title_sv,
      titleFa: vacancy.title_explain_fa,
      location: vacancy.location_public || "",
      deadline: vacancy.advertised_deadline_date || "",
      status: vacancy.vacancy_date_status,
      url: vacancy.original_ad_url,
    })),
    "deadline-asc",
  );
  const counts = { "مهلت گذشته": 0, "مهلت امروز": 0, "مهلت آینده": 0, "نامشخص": 0 };
  for (const vacancy of vacancies) counts[vacancy.vacancy_date_status] += 1;
  const legend = Object.keys(counts).map((status) => `<li class="${STATUS_CLASS[status]}">${escapeHtml(status)}: ${faDigits(counts[status])}</li>`).join("");
  const title = variant === "latest"
    ? "کتابخانهٔ آگهی‌های عمومی"
    : `کتابخانهٔ آگهی‌ها، ${formatIsoDateFa(summary.report_date)}`;
  const header = `<h1>کتابخانهٔ آگهی‌های عمومی</h1>
    <p class="lede">این فهرست از جمع درخواست‌ها جداست. تعداد مهلت‌های امروز، تعداد درخواست نیست.</p>`;
  const main = `<article class="note" data-snapshot-role="${summary.publication ? "revision_check" : "source"}" data-report-date="${escapeHtml(summary.report_date)}">
      <h2>${variant === "latest" ? "فهرست همراه تازه‌ترین نسخه" : "فهرست ثابت همین نسخه"}</h2>
      ${versionBlock(summary, variant, hrefs.immutable, "نسخهٔ ثابت همین فهرست")}
      <p>${mixedHtml(summary.public_vacancies_note_fa)}</p>
      <p>اگر مکان، توضیح یا شرایط یک آگهی در خلاصه نباشد، همان‌جا نوشته می‌شود که موجود نیست. چیزی جایش ساخته نمی‌شود.</p>
    </article>
    <ul class="legend">${legend}</ul>
    <div class="panel filters" role="search">
      <p class="measure">جست‌وجو و چینش همین‌جا روی صفحه انجام می‌شود و جایی فرستاده نمی‌شود.</p>
      <label for="vacancy-query">جست‌وجو در عنوان، کارفرما یا مکان
        <input id="vacancy-query" type="search" autocomplete="off" aria-controls="vacancy-list">
      </label>
      <label for="vacancy-status">دستهٔ تاریخ مهلت
        <select id="vacancy-status" aria-controls="vacancy-list">
          <option value="all">همهٔ تاریخ‌ها</option>
          <option value="مهلت امروز">مهلت امروز</option>
          <option value="مهلت آینده">مهلت آینده</option>
          <option value="مهلت گذشته">مهلت گذشته</option>
          <option value="نامشخص">نامشخص</option>
        </select>
      </label>
      <label for="deadline-from">مهلت از
        <input id="deadline-from" type="date" aria-controls="vacancy-list">
      </label>
      <label for="deadline-to">مهلت تا
        <input id="deadline-to" type="date" aria-controls="vacancy-list">
      </label>
      <label for="vacancy-sort">چینش
        <select id="vacancy-sort" aria-controls="vacancy-list">
          <option value="deadline-asc">مهلت، نزدیک‌تر اول</option>
          <option value="deadline-desc">مهلت، دورتر اول</option>
          <option value="title">عنوان، الفبای سوئدی</option>
          <option value="employer">کارفرما، الفبا</option>
        </select>
      </label>
      <button class="reset" id="vacancy-reset" type="button">پاک کردن فیلترها</button>
    </div>
    <p id="vacancy-count" aria-live="polite">${faDigits(vacancies.length)} آگهی نشان داده می‌شود.</p>
    <p id="vacancy-empty" hidden>هیچ آگهی‌ای با این فیلتر پیدا نشد.</p>
    <noscript><p>بدون جاوااسکریپت همهٔ آگهی‌ها پایین هستن. جست‌وجو و چینش با جاوااسکریپت کار می‌کند و چیزی به جایی فرستاده نمی‌شود.</p></noscript>
    <div class="cards" id="vacancy-list" data-vacancy-list>
      ${vacancies.map((vacancy) => vacancyCard(vacancy)).join("\n")}
    </div>
    <p><a href="${hrefs.report}">برگرد به جمع‌بندی همین نسخه</a></p>`;
  return pageShell({
    title,
    description: "کتابخانهٔ آگهی‌های عمومی، جدا از جمع‌بندی درخواست‌ها.",
    depth,
    current: "library",
    script: true,
    body: {
      header,
      libraryHref: hrefs.library,
      main,
      footer: `<p class="hash">شناسهٔ نسخه: <bdi dir="ltr">${escapeHtml(snapshotId)}</bdi></p>`,
    },
  });
}

export function renderArchive(manifest) {
  const rows = manifest.snapshots.map((snapshot) => {
    const updated = snapshot.updated_at
      ? `<p>زمان بازبینی: <time datetime="${escapeHtml(snapshot.updated_at)}"><bdi dir="ltr">${escapeHtml(snapshot.updated_at)}</bdi></time></p>`
      : "<p>بازبینیِ جداگانه‌ای روی خودِ این ردیف ثبت نشده.</p>";
    const badge = snapshot.id === manifest.latest_snapshot_id ? `<span class="badge">تازه‌ترین</span>` : "";
    return `<article class="card" data-snapshot-id="${escapeHtml(snapshot.id)}" data-role="${escapeHtml(snapshot.role)}">
      <h3>${badge} ${escapeHtml(snapshot.label_fa)}</h3>
      <p>شناسه: <bdi dir="ltr">${escapeHtml(snapshot.id)}</bdi></p>
      <p>تاریخ گزارش: <time datetime="${escapeHtml(snapshot.report_date)}">${formatIsoDateFa(snapshot.report_date)}</time></p>
      <p>زمان ساخت خلاصهٔ اصلی: <time datetime="${escapeHtml(snapshot.generated_at)}"><bdi dir="ltr">${escapeHtml(snapshot.generated_at)}</bdi></time></p>
      ${updated}
      <p><a href="../reports/${escapeHtml(snapshot.id)}/index.html">گزارش ثابت</a></p>
      <p><a href="../reports/${escapeHtml(snapshot.id)}/library.html">کتابخانهٔ همان نسخه</a></p>
      <p><a href="../reports/${escapeHtml(snapshot.id)}/summary.json">فایل خام</a></p>
    </article>`;
  }).join("\n");
  return pageShell({
    title: "بایگانی گزارش‌ها",
    description: "نسخه‌های ثابت گزارش بی‌نام جست‌وجوی کار.",
    depth: 1,
    current: "archive",
    body: {
      header: `<h1>بایگانی گزارش‌ها</h1>
        <p class="lede">هر کارت یک نسخهٔ ثابت است. نسخهٔ تازه‌تر، قبلی‌ها را عوض نمی‌کند.</p>`,
      libraryHref: "../library/index.html",
      main: `<section class="note">
          <h2>تاریخ‌هایی که ساخته نشده‌اند</h2>
          <p>پنج ارسال قدیمی تاریخ دقیق ندارند. برایشان روز گزارش ساخته نشده و این بایگانی فقط نسخه‌هایی را نشان می‌دهد که واقعاً ثبت شده‌اند. به‌روزرسانی خودکار یا زمان‌بندی انتشار هم این‌جا نیست.</p>
        </section>
        <div class="cards">${rows}</div>`,
      footer: `<p>تازه‌ترین شناسه: <bdi dir="ltr">${escapeHtml(manifest.latest_snapshot_id)}</bdi></p>`,
    },
  });
}

export function renderNotFound() {
  return pageShell({
    title: "این صفحه پیدا نشد",
    description: "صفحهٔ درخواستی در گزارش بی‌نام پیدا نشد.",
    depth: 0,
    current: "",
    body: {
      header: `<h1>این صفحه پیدا نشد</h1><p class="lede">لینک ممکن است قدیمی باشد.</p>`,
      libraryHref: "library/index.html",
      main: `<p><a href="index.html">برو به تازه‌ترین گزارش</a></p>`,
      footer: "",
    },
  });
}

export function publicManifest(manifest) {
  return {
    archive_schema: manifest.archive_schema,
    latest_snapshot_id: manifest.latest_snapshot_id,
    snapshots: manifest.snapshots.map((snapshot) => ({
      id: snapshot.id,
      role: snapshot.role,
      label_fa: snapshot.label_fa,
      report_date: snapshot.report_date,
      generated_at: snapshot.generated_at,
      updated_at: snapshot.updated_at,
      source_snapshot_id: snapshot.source_snapshot_id,
      sha256: snapshot.sha256,
      report_href: `reports/${snapshot.id}/index.html`,
      library_href: `reports/${snapshot.id}/library.html`,
      summary_href: `reports/${snapshot.id}/summary.json`,
    })),
  };
}

export function readClientAsset(name) {
  return readFileSync(path.join(clientDir, name));
}
