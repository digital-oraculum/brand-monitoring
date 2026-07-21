const fmt = {
  number: (n) => new Intl.NumberFormat("pl-PL").format(Math.round(n)),
  percent: (n) => `${(n * 100).toFixed(2)}%`,
  position: (n) => n.toFixed(1),
  date: (iso) => {
    if (!iso || iso.length !== 8) return iso;
    return `${iso.slice(6, 8)}.${iso.slice(4, 6)}.${iso.slice(0, 4)}`;
  },
  month: (yyyymm) => {
    if (!yyyymm || yyyymm.length !== 6) return yyyymm;
    return `${yyyymm.slice(4, 6)}.${yyyymm.slice(0, 4)}`;
  },
  trendLabel: (key, granularity) => {
    if (granularity === "month") return fmt.month(key);
    if (key.length === 8) return fmt.date(key);
    if (key.length === 10 && key.includes("-")) {
      const normalized = key.replaceAll("-", "");
      return fmt.date(normalized);
    }
    return key;
  },
  granularityLabel: (granularity) =>
    granularity === "day" ? "(dziennie)" : "(miesięcznie)",
};

const state = {
  siteUrl: "",
  charts: {},
};

function qs(id) {
  return document.getElementById(id);
}

function showAlert(message, type = "error") {
  const box = qs("alertBox");
  box.textContent = message;
  box.className = type === "ok" ? "alert ok" : "alert";
  box.classList.remove("hidden");
}

function hideAlert() {
  qs("alertBox").classList.add("hidden");
}

function setLoading(isLoading, message = "Ładowanie danych…") {
  const overlay = qs("loadingOverlay");
  const btn = qs("refreshBtn");
  if (overlay) {
    overlay.classList.toggle("hidden", !isLoading);
    overlay.setAttribute("aria-busy", isLoading ? "true" : "false");
    const text = qs("loadingOverlayText");
    if (text) text.textContent = message;
  }
  if (btn) {
    btn.disabled = isLoading;
    btn.innerHTML = isLoading
      ? '<span class="loading"></span> Ładowanie...'
      : "Odśwież dane";
  }
}

function formatDisplayDate(iso) {
  if (!iso || iso.length !== 10) return iso || "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function updateReportContextBar() {
  const start = qs("startDate")?.value;
  const end = qs("endDate")?.value;
  const rangeEl = qs("contextRange");
  const domainsEl = qs("contextDomains");
  const granEl = qs("contextGranularity");

  if (rangeEl) {
    rangeEl.textContent =
      start && end ? `${formatDisplayDate(start)} – ${formatDisplayDate(end)}` : "—";
  }

  if (domainsEl) {
    const selected = getSelectedBrandDomains();
    domainsEl.textContent = selected.length
      ? `${selected.length}: ${selected.join(", ")}`
      : "—";
  }

  if (granEl) {
    granEl.textContent = getSelectedGranularity() === "day" ? "dzienna" : "miesięczna";
  }
}

function syncBrandFiltersVisibility() {
  // Filtry brand są zawsze widoczne (brak zakładki GSC).
}

/** Ostatni dzień z kompletnymi danymi GSC (typowe opóźnienie ~3 dni). */
const GSC_DATA_LAG_DAYS = 3;
/** Maksymalne okno retencji danych w Search Console. */
const GSC_MAX_RETENTION_MONTHS = 16;

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function gscLatestDate() {
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  end.setDate(end.getDate() - GSC_DATA_LAG_DAYS);
  return end;
}

function computePeriodRange(presetId) {
  const latest = gscLatestDate();

  switch (presetId) {
    case "max": {
      const start = new Date(latest);
      start.setMonth(start.getMonth() - GSC_MAX_RETENTION_MONTHS);
      start.setDate(start.getDate() + 1);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(latest) };
    }
    case "last28": {
      const start = new Date(latest);
      start.setDate(start.getDate() - 27);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(latest) };
    }
    case "prevMonth": {
      const start = new Date(latest.getFullYear(), latest.getMonth() - 1, 1);
      const end = new Date(latest.getFullYear(), latest.getMonth(), 0);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
    }
    case "last3months":
    case "last6months":
    case "last12months": {
      const months =
        presetId === "last3months" ? 3 : presetId === "last6months" ? 6 : 12;
      const start = new Date(latest);
      start.setMonth(start.getMonth() - months);
      start.setDate(start.getDate() + 1);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(latest) };
    }
    case "prevQuarter": {
      const currentQuarter = Math.floor(latest.getMonth() / 3);
      let year = latest.getFullYear();
      let quarter = currentQuarter - 1;
      if (quarter < 0) {
        quarter = 3;
        year -= 1;
      }
      const start = new Date(year, quarter * 3, 1);
      const end = new Date(year, quarter * 3 + 3, 0);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(end) };
    }
    case "ytd": {
      const start = new Date(latest.getFullYear(), 0, 1);
      return { startDate: formatLocalDate(start), endDate: formatLocalDate(latest) };
    }
    default:
      return null;
  }
}

function defaultDates() {
  return computePeriodRange("max");
}

function setManualDateFieldsEnabled(enabled) {
  qs("startDate").disabled = !enabled;
  qs("endDate").disabled = !enabled;
}

function applyPeriodPreset(presetId, { updateSelect = true } = {}) {
  if (updateSelect && qs("periodPreset")) {
    qs("periodPreset").value = presetId;
  }

  const isCustom = presetId === "custom";
  setManualDateFieldsEnabled(isCustom);

  if (isCustom) {
    return;
  }

  const range = computePeriodRange(presetId);
  if (!range) return;

  qs("startDate").value = range.startDate;
  qs("endDate").value = range.endDate;
  updateReportContextBar();
}

function setupPeriodPresets() {
  applyPeriodPreset("max");

  qs("periodPreset")?.addEventListener("change", async () => {
    const presetId = qs("periodPreset").value;
    applyPeriodPreset(presetId);
    if (presetId !== "custom") {
      await refreshActiveDashboard();
    }
  });

  for (const inputId of ["startDate", "endDate"]) {
    qs(inputId)?.addEventListener("change", () => {
      if (qs("periodPreset").value !== "custom") {
        applyPeriodPreset("custom", { updateSelect: true });
      }
      updateReportContextBar();
    });
  }
}

async function refreshActiveDashboard({ force = true } = {}) {
  if (qs("dashboardSection").classList.contains("hidden")) return;

  if (force) {
    clearBrandDatasetCache();
  }

  const hasDataset =
    !force &&
    brandDatasetState.cacheKey === getBrandDatasetCacheKey() &&
    brandDatasetState.dataset;

  if (hasDataset) {
    applyBrandDatasetViews();
    return;
  }

  await loadBrandDataset({ force, showLoading: true });
}

function getSelectedGranularity() {
  return qs("granularity")?.value === "day" ? "day" : "month";
}

const DEFAULT_WSKZ_DOMAINS = [
  "wskz.pl",
  "studia-online.pl",
  "studia-pedagogiczne.pl",
  "studia-wroclaw.pl",
];

const brandDomainState = {
  availableDomains: [...DEFAULT_WSKZ_DOMAINS],
  selectedDomains: new Set(DEFAULT_WSKZ_DOMAINS),
  missingDomains: [],
  pillsReady: false,
};

const brandDomainChartState = {
  metric: "impressions",
  breakdown: [],
};

const DOMAIN_CHART_COLORS = ["#5b8cff", "#7c5cff", "#3ddc97", "#ffd166", "#ff6b6b", "#56cfe1"];

const DOMAIN_METRICS = {
  impressions: {
    label: "Wyświetlenia",
    chartType: "pie",
    title: "Rozkład wyświetleń między domenami",
    formatValue: (v) => fmt.number(v),
    chartValue: (v) => v,
  },
  clicks: {
    label: "Kliknięcia",
    chartType: "pie",
    title: "Rozkład kliknięć między domenami",
    formatValue: (v) => fmt.number(v),
    chartValue: (v) => v,
  },
  ctr: {
    label: "CTR",
    chartType: "bar",
    title: "CTR per domena",
    formatValue: (v) => fmt.percent(v),
    chartValue: (v) => v * 100,
  },
  position: {
    label: "Śr. pozycja",
    chartType: "bar",
    title: "Średnia pozycja per domena",
    formatValue: (v) => fmt.position(v),
    chartValue: (v) => v,
  },
};

function getSelectedBrandDomains() {
  return [...brandDomainState.selectedDomains];
}

function getBrandDatasetParams() {
  return new URLSearchParams({
    startDate: qs("startDate").value,
    endDate: qs("endDate").value,
  });
}

function getBrandDatasetCacheKey() {
  return `${qs("startDate").value}|${qs("endDate").value}`;
}

const brandDatasetState = {
  cacheKey: null,
  dataset: null,
};

function clearBrandDatasetCache() {
  brandDatasetState.cacheKey = null;
  brandDatasetState.dataset = null;
}

async function ensureBrandDataset({ force = false } = {}) {
  const cacheKey = getBrandDatasetCacheKey();
  if (!force && brandDatasetState.cacheKey === cacheKey && brandDatasetState.dataset) {
    return { dataset: brandDatasetState.dataset, fromCache: true };
  }

  const params = getBrandDatasetParams();
  const dataset = await api(`/api/brand/wskz/dataset?${params}`);
  brandDatasetState.cacheKey = cacheKey;
  brandDatasetState.dataset = dataset;

  if (Array.isArray(dataset.availableDomains) && dataset.availableDomains.length) {
    brandDomainState.availableDomains = dataset.availableDomains;
  }
  if (Array.isArray(dataset.missingDomains)) {
    brandDomainState.missingDomains = dataset.missingDomains;
  }

  return { dataset, fromCache: false };
}

function applyBrandOverviewViews(views, meta) {
  qs("wskzKpiClicks").textContent = fmt.number(views.overview.clicks);
  qs("wskzKpiImpressions").textContent = fmt.number(views.overview.impressions);
  qs("wskzKpiCtr").textContent = fmt.percent(views.overview.ctr);
  qs("wskzKpiPosition").textContent = fmt.position(views.overview.position);

  renderBrandDomainStatus(meta);
  brandDomainChartState.breakdown = views.domainBreakdown ?? [];
  renderBrandTrendChart(views.trend.rows ?? [], views.trend.granularity);
  renderBrandDomainChart();
}

function applyBrandDatasetViews() {
  if (!brandDatasetState.dataset) return;

  const selectedDomains = getSelectedBrandDomains();
  if (!selectedDomains.length) return;

  const views = buildBrandViewsFromDataset(
    brandDatasetState.dataset,
    selectedDomains,
    getSelectedGranularity(),
  );
  const meta = { ...views.meta, selectedDomains };

  applyBrandOverviewViews(views, meta);
  renderBrandQueriesTable(views.queries.rows ?? [], meta.domainColumns ?? []);
  applyBrandCategoriesData({ ...views.categories, ...meta });
  updateReportContextBar();
  requestAnimationFrame(() => refreshBrandCategoryCharts());
}

function renderBrandDomainPills() {
  const container = qs("wskzDomainPills");
  if (!container) return;

  const missing = new Set(brandDomainState.missingDomains.map((d) => d.toLowerCase()));

  container.innerHTML = brandDomainState.availableDomains
    .map((domain) => {
      const isMissing = missing.has(domain.toLowerCase());
      const isActive = brandDomainState.selectedDomains.has(domain);
      const classes = ["domain-pill"];
      if (isActive) classes.push("active");
      if (isMissing) classes.push("unavailable");

      const title = isMissing
        ? "Brak dostępu do tej domeny w Search Console"
        : isActive
          ? "Kliknij, aby wyłączyć z raportu"
          : "Kliknij, aby włączyć do raportu";

      return `<button type="button" class="${classes.join(" ")}" data-domain="${escapeHtml(domain)}" title="${escapeHtml(title)}" ${isMissing ? "disabled" : ""}>${escapeHtml(domain)}</button>`;
    })
    .join("");

  container.querySelectorAll(".domain-pill:not(.unavailable)").forEach((pill) => {
    pill.addEventListener("click", async () => {
      const domain = pill.dataset.domain;
      if (!domain) return;

      const selected = brandDomainState.selectedDomains;
      if (selected.has(domain)) {
        if (selected.size <= 1) return;
        selected.delete(domain);
      } else {
        selected.add(domain);
      }

      renderBrandDomainPills();
      updateReportContextBar();
      applyBrandDatasetViews();
    });
  });

  brandDomainState.pillsReady = true;
  updateReportContextBar();
}

function syncBrandDomainStateFromResponse(data) {
  if (Array.isArray(data.availableDomains) && data.availableDomains.length) {
    brandDomainState.availableDomains = data.availableDomains;
  }

  if (Array.isArray(data.missingDomains)) {
    brandDomainState.missingDomains = data.missingDomains;
  }
}

function renderBrandDomainStatus(data) {
  syncBrandDomainStateFromResponse(data);
  renderBrandDomainPills();

  const missingBox = qs("wskzMissingDomains");
  const missing = data.missingDomains ?? [];
  if (missing.length) {
    missingBox.textContent = `Brak dostępu w Search Console do: ${missing.join(", ")}. Te domeny nie są uwzględnione w raporcie.`;
    missingBox.classList.remove("hidden");
  } else {
    missingBox.classList.add("hidden");
  }
}

async function api(path, options = {}) {
  const res = await fetch(path, { credentials: "include", ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Błąd HTTP ${res.status}`);
  }
  return data;
}

async function loadBrandDataset({ force = false, showLoading = true } = {}) {
  const hasCache =
    !force &&
    brandDatasetState.cacheKey === getBrandDatasetCacheKey() &&
    brandDatasetState.dataset;

  if (!hasCache && showLoading) {
    setLoading(true, "Ładowanie danych GSC…");
  }

  try {
    await ensureBrandDataset({ force });
    applyBrandDatasetViews();
  } catch (error) {
    showAlert(error.message);
    throw error;
  } finally {
    if (!hasCache && showLoading) {
      setLoading(false);
    }
  }
}

async function showBrandReport({ force = false } = {}) {
  hideAlert();
  await loadBrandDataset({ force, showLoading: true });
}

async function refreshBrand() {
  clearBrandDatasetCache();
  await showBrandReport({ force: true });
}

const DOMAIN_VISIBLE_LABEL = "słowo kluczowe widoczne";

function syncWskzDomainColumnVisibility() {
  const show = qs("wskzShowDomainCols")?.checked ?? false;
  document.querySelectorAll(".col-domain").forEach((el) => {
    el.classList.toggle("hidden", !show);
  });
}

function renderWskzQueriesTableHead(domainList) {
  const head = qs("wskzQueriesTableHead");
  if (!head) return;

  head.innerHTML = `
    <th>Słowo kluczowe</th>
    <th class="num">Wyświetlenia</th>
    <th class="num">Kliknięcia</th>
    <th class="num">CTR</th>
    <th class="num">Pozycja</th>
    ${domainList
      .map((domain) => `<th class="col-domain hidden">${escapeHtml(domain)}</th>`)
      .join("")}
  `;
  syncWskzDomainColumnVisibility();
}

const brandQueriesState = {
  rows: [],
  domainList: [],
  search: "",
};

function renderBrandQueriesTable(rows = brandQueriesState.rows, domainList = brandQueriesState.domainList) {
  brandQueriesState.rows = rows ?? [];
  brandQueriesState.domainList = domainList ?? [];
  renderWskzQueriesTableHead(brandQueriesState.domainList);

  const tbody = qs("wskzQueriesTable");
  const baseColCount = 5;
  const totalCols = baseColCount + brandQueriesState.domainList.length;
  const search = brandQueriesState.search.trim().toLowerCase();
  const filtered = search
    ? brandQueriesState.rows.filter((row) => (row.keys?.[0] ?? "").toLowerCase().includes(search))
    : brandQueriesState.rows;

  const countEl = qs("wskzQueriesCount");
  if (countEl) {
    const total = brandQueriesState.rows.length;
    countEl.textContent = search
      ? `(${fmt.number(filtered.length)} z ${fmt.number(total)} fraz)`
      : total
        ? `(${fmt.number(total)} fraz)`
        : "";
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${totalCols}" class="muted">${search ? "Brak fraz pasujących do wyszukiwania" : "Brak danych w wybranym okresie"}</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.keys[0] ?? "—")}</td>
        <td class="num">${fmt.number(row.impressions)}</td>
        <td class="num">${fmt.number(row.clicks)}</td>
        <td class="num">${fmt.percent(row.ctr)}</td>
        <td class="num">${fmt.position(row.position)}</td>
        ${brandQueriesState.domainList
          .map((domain) => {
            const visible = row.domainPresence?.[domain];
            const text = visible ? DOMAIN_VISIBLE_LABEL : "—";
            return `<td class="col-domain hidden">${escapeHtml(text)}</td>`;
          })
          .join("")}
      </tr>`,
    )
    .join("");

  syncWskzDomainColumnVisibility();
}


function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function destroyChart(name) {
  if (state.charts[name]) {
    state.charts[name].destroy();
    delete state.charts[name];
  }
}

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#edf2f7" } },
    },
    scales: {
      x: { ticks: { color: "#9aa8bc" }, grid: { color: "rgba(255,255,255,0.06)" } },
      y: { ticks: { color: "#9aa8bc" }, grid: { color: "rgba(255,255,255,0.06)" } },
    },
  };
}

function updateTrendGranularityLabels(granularity) {
  const label = fmt.granularityLabel(granularity);
  const wskzLabel = qs("wskzTrendGranularityLabel");
  if (wskzLabel) wskzLabel.textContent = label;
}


function renderBrandTrendChart(rows, granularity = getSelectedGranularity()) {
  destroyChart("brandTrend");
  updateTrendGranularityLabels(granularity);
  const sorted = [...rows].sort((a, b) => a.keys[0].localeCompare(b.keys[0]));
  const labels = sorted.map((r) => fmt.trendLabel(r.keys[0], granularity));
  const ctx = qs("wskzTrendChart").getContext("2d");

  state.charts.brandTrend = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Kliknięcia",
          data: sorted.map((r) => r.clicks),
          borderColor: "#5b8cff",
          backgroundColor: "rgba(91, 140, 255, 0.15)",
          tension: 0.3,
          fill: true,
        },
        {
          label: "Wyświetlenia",
          data: sorted.map((r) => r.impressions),
          borderColor: "#7c5cff",
          backgroundColor: "rgba(124, 92, 255, 0.08)",
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      ...chartDefaults(),
      scales: {
        x: chartDefaults().scales.x,
        y: { ...chartDefaults().scales.y, position: "left" },
        y1: {
          ...chartDefaults().scales.y,
          position: "right",
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function setBrandDomainMetric(metric) {
  if (!DOMAIN_METRICS[metric]) return;
  brandDomainChartState.metric = metric;
  document
    .querySelectorAll("#brandDashboardSection .kpi-selectable")
    .forEach((card) => card.classList.toggle("active", card.dataset.metric === metric));
  renderBrandDomainChart();
}

function setupBrandKpiSelectors() {
  document.querySelectorAll("#brandDashboardSection .kpi-selectable").forEach((card) => {
    const activate = () => setBrandDomainMetric(card.dataset.metric);
    card.addEventListener("click", activate);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });
}

function renderBrandDomainChart() {
  destroyChart("brandDomain");

  const metricConfig = DOMAIN_METRICS[brandDomainChartState.metric] ?? DOMAIN_METRICS.impressions;
  const breakdown = brandDomainChartState.breakdown ?? [];
  const titleEl = qs("wskzDomainChartTitle");
  if (titleEl) titleEl.textContent = metricConfig.title;

  const canvas = qs("wskzDomainChart");
  if (!canvas) return;

  if (!breakdown.length) {
    return;
  }

  const labels = breakdown.map((row) => row.domain);
  const rawValues = breakdown.map((row) => row[brandDomainChartState.metric] ?? 0);
  const chartValues = rawValues.map((v) => metricConfig.chartValue(v));
  const colors = labels.map((_, index) => DOMAIN_CHART_COLORS[index % DOMAIN_CHART_COLORS.length]);
  const ctx = canvas.getContext("2d");

  if (metricConfig.chartType === "pie") {
    const total = chartValues.reduce((sum, v) => sum + v, 0);
    state.charts.brandDomain = new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data: chartValues,
            backgroundColor: colors,
            borderColor: "#151d31",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#edf2f7" } },
          tooltip: {
            callbacks: {
              label: (context) => {
                const value = rawValues[context.dataIndex] ?? 0;
                const share = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : "0.0";
                return `${context.label}: ${metricConfig.formatValue(value)} (${share}%)`;
              },
            },
          },
        },
      },
    });
    return;
  }

  state.charts.brandDomain = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: metricConfig.label,
          data: chartValues,
          backgroundColor: colors,
          borderRadius: 8,
        },
      ],
    },
    options: {
      ...chartDefaults(),
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = rawValues[context.dataIndex] ?? 0;
              return `${metricConfig.label}: ${metricConfig.formatValue(value)}`;
            },
          },
        },
      },
      scales: {
        x: chartDefaults().scales.x,
        y: {
          ...chartDefaults().scales.y,
          ticks: {
            ...chartDefaults().scales.y.ticks,
            callback: (value) =>
              brandDomainChartState.metric === "ctr" ? `${Number(value).toFixed(2)}%` : value,
          },
        },
      },
    },
  });
}

const CATEGORY_COLORS = {
  "Czysty brand": "#5b8cff",
  Miasta: "#7c5cff",
  "Frazy nawigacyjne/informacyjne": "#3ddc97",
  "Frazy reputacyjne": "#ffd166",
  "Frazy sprzedażowe": "#ff6b6b",
  Praca: "#56cfe1",
  Pozostałe: "#9aa8bc",
};

const CATEGORY_METRICS = {
  impressions: { label: "Wyświetlenia", format: (v) => fmt.number(v), chartValue: (v) => v },
  clicks: { label: "Kliknięcia", format: (v) => fmt.number(v), chartValue: (v) => v },
  ctr: { label: "CTR", format: (v) => fmt.percent(v), chartValue: (v) => v * 100 },
  position: { label: "Śr. pozycja", format: (v) => fmt.position(v), chartValue: (v) => v },
};

const brandCategoryState = {
  metric: "impressions",
  trend: null,
  categories: [],
  queries: [],
  categoryFilter: "",
  search: "",
};

function setBrandCategoryMetric(metric) {
  if (!CATEGORY_METRICS[metric]) return;
  brandCategoryState.metric = metric;
  document.querySelectorAll("#wskzCategoryMetricToggle [data-category-metric]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.categoryMetric === metric);
  });
  updateBrandCategoryTrendLabel();
  updateBrandCategoryPieTitle();
  renderBrandCategoryPieChart();
  renderBrandCategoryTrendChart();
}

function setupBrandCategoryControls() {
  document.querySelectorAll("#wskzCategoryMetricToggle [data-category-metric]").forEach((btn) => {
    btn.addEventListener("click", () => setBrandCategoryMetric(btn.dataset.categoryMetric));
  });

  qs("wskzCategoryFilter")?.addEventListener("change", (event) => {
    brandCategoryState.categoryFilter = event.target.value ?? "";
    renderBrandCategoriesTable(brandCategoryState.categories);
    renderBrandCategoryQueriesTable();
  });

  qs("wskzCategoryQuerySearch")?.addEventListener("input", (event) => {
    brandCategoryState.search = event.target.value ?? "";
    renderBrandCategoryQueriesTable();
  });
}

function populateBrandCategoryFilter(categoryList = []) {
  const select = qs("wskzCategoryFilter");
  if (!select) return;

  const current = brandCategoryState.categoryFilter;
  select.innerHTML = [
    `<option value="">Wszystkie</option>`,
    ...categoryList.map(
      (category) =>
        `<option value="${escapeHtml(category)}"${category === current ? " selected" : ""}>${escapeHtml(category)}</option>`,
    ),
  ].join("");
}

function setCategoryFilter(category) {
  const next = brandCategoryState.categoryFilter === category ? "" : category;
  brandCategoryState.categoryFilter = next;
  const select = qs("wskzCategoryFilter");
  if (select) select.value = next;
  renderBrandCategoriesTable(brandCategoryState.categories);
  renderBrandCategoryQueriesTable();
}

function renderBrandCategoryQueriesTable(rows) {
  if (rows) brandCategoryState.queries = rows;
  const tbody = qs("wskzCategoryQueriesTable");
  if (!tbody) return;

  const filter = brandCategoryState.categoryFilter;
  const search = brandCategoryState.search.trim().toLowerCase();
  let filtered = brandCategoryState.queries;
  if (filter) filtered = filtered.filter((row) => row.category === filter);
  if (search) {
    filtered = filtered.filter((row) => (row.keys?.[0] ?? "").toLowerCase().includes(search));
  }

  const countEl = qs("wskzCategoryQueriesCount");
  if (countEl) {
    const total = brandCategoryState.queries.length;
    countEl.textContent =
      filter || search
        ? `(${fmt.number(filtered.length)} z ${fmt.number(total)} fraz)`
        : total
          ? `(${fmt.number(total)} fraz)`
          : "";
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Brak słów kluczowych dla wybranych filtrów</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map(
      (row) => `
      <tr>
        <td>${escapeHtml(row.keys?.[0] ?? "—")}</td>
        <td>${escapeHtml(row.category ?? "—")}</td>
        <td class="num">${fmt.number(row.impressions)}</td>
        <td class="num">${fmt.number(row.clicks)}</td>
        <td class="num">${fmt.percent(row.ctr)}</td>
        <td class="num">${fmt.position(row.position)}</td>
      </tr>`,
    )
    .join("");
}

function updateBrandCategoryTrendLabel() {
  const metric = CATEGORY_METRICS[brandCategoryState.metric] ?? CATEGORY_METRICS.impressions;
  const granularity = brandCategoryState.trend?.granularity ?? getSelectedGranularity();
  const granLabel = granularity === "day" ? "dziennie" : "miesięcznie";
  const label = qs("wskzCategoryTrendLabel");
  if (label) label.textContent = `(${metric.label.toLowerCase()}, ${granLabel})`;
}

function getCategoryPieMetricKey() {
  return ["impressions", "clicks"].includes(brandCategoryState.metric)
    ? brandCategoryState.metric
    : "impressions";
}

function updateBrandCategoryPieTitle() {
  const metric = CATEGORY_METRICS[getCategoryPieMetricKey()];
  const title = qs("wskzCategoryPieTitle");
  if (title) title.textContent = `Podział ${metric.label.toLowerCase()} według kategorii`;
}

function renderBrandCategoryPieChart() {
  destroyChart("brandCategoryPie");
  const canvas = qs("wskzCategoryPieChart");
  const wrap = canvas?.closest(".chart-wrap");
  const emptyEl = qs("wskzCategoryPieEmpty");
  const categories = brandCategoryState.categories ?? [];

  if (!canvas) return;

  if (!categories.length) {
    wrap?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  const metricKey = getCategoryPieMetricKey();
  const metric = CATEGORY_METRICS[metricKey];
  const rows = categories.filter((row) => (row[metricKey] ?? 0) > 0);

  if (!rows.length) {
    wrap?.classList.add("hidden");
    emptyEl?.classList.remove("hidden");
    return;
  }

  wrap?.classList.remove("hidden");
  emptyEl?.classList.add("hidden");

  const labels = rows.map((row) => row.category);
  const rawValues = rows.map((row) => row[metricKey] ?? 0);
  const colors = labels.map((label) => CATEGORY_COLORS[label] ?? "#9aa8bc");
  const total = rawValues.reduce((sum, value) => sum + value, 0);
  const ctx = canvas.getContext("2d");

  state.charts.brandCategoryPie = new Chart(ctx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: rawValues,
          backgroundColor: colors,
          borderColor: "#151d31",
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#edf2f7" } },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = rawValues[context.dataIndex] ?? 0;
              const share = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
              return `${context.label}: ${metric.format(value)} (${share}%)`;
            },
          },
        },
      },
    },
  });

  requestAnimationFrame(() => state.charts.brandCategoryPie?.resize());
}

function refreshBrandCategoryCharts() {
  updateBrandCategoryPieTitle();
  renderBrandCategoryPieChart();
  renderBrandCategoryTrendChart();
}

const CATEGORY_PRIORITY = {
  "Czysty brand": 1,
  Miasta: 2,
  "Frazy nawigacyjne/informacyjne": 3,
  "Frazy reputacyjne": 4,
  "Frazy sprzedażowe": 5,
  Praca: 6,
  Pozostałe: 7,
};

function renderBrandCategoriesTable(rows) {
  brandCategoryState.categories = rows ?? [];
  const tbody = qs("wskzCategoriesTable");
  if (!tbody) return;

  if (!rows?.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Brak danych w wybranym okresie</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const active = brandCategoryState.categoryFilter === row.category;
      const priority = CATEGORY_PRIORITY[row.category] ?? "—";
      return `
      <tr class="category-row${active ? " active-filter" : ""}" data-category="${escapeHtml(row.category)}">
        <td class="num muted">${priority}</td>
        <td>${escapeHtml(row.category)}</td>
        <td class="num">${fmt.number(row.impressions)}</td>
        <td class="num">${fmt.number(row.clicks)}</td>
        <td class="num">${fmt.percent(row.ctr)}</td>
        <td class="num">${fmt.position(row.position)}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".category-row").forEach((tr) => {
    tr.addEventListener("click", () => setCategoryFilter(tr.dataset.category));
  });
}

function renderBrandCategoryTrendChart() {
  destroyChart("brandCategoryTrend");
  const canvas = qs("wskzCategoryTrendChart");
  const trend = brandCategoryState.trend;
  if (!canvas || !trend?.periods?.length) return;

  const metric = CATEGORY_METRICS[brandCategoryState.metric] ?? CATEGORY_METRICS.impressions;
  const granularity = trend.granularity ?? "month";
  const labels = trend.periods.map((period) => fmt.trendLabel(period, granularity));
  const ctx = canvas.getContext("2d");

  const datasets = (trend.series ?? []).map((series) => ({
    label: series.category,
    data: series.rows.map((row) => metric.chartValue(row[brandCategoryState.metric] ?? 0)),
    borderColor: CATEGORY_COLORS[series.category] ?? "#9aa8bc",
    backgroundColor: CATEGORY_COLORS[series.category] ?? "#9aa8bc",
    tension: 0.25,
    fill: false,
  }));

  state.charts.brandCategoryTrend = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      ...chartDefaults(),
      plugins: {
        legend: {
          labels: { color: "#edf2f7", boxWidth: 12 },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const raw = trend.series
                ?.find((s) => s.category === context.dataset.label)
                ?.rows?.[context.dataIndex]?.[brandCategoryState.metric];
              return `${context.dataset.label}: ${metric.format(raw ?? 0)}`;
            },
          },
        },
      },
    },
  });
}

function applyBrandCategoriesData(data) {
  qs("wskzCatTotalImpressions").textContent = fmt.number(data.overview?.impressions ?? 0);
  qs("wskzCatTotalClicks").textContent = fmt.number(data.overview?.clicks ?? 0);
  qs("wskzCatTotalCtr").textContent = fmt.percent(data.overview?.ctr ?? 0);
  qs("wskzCatTotalPosition").textContent = fmt.position(data.overview?.position ?? 0);

  brandCategoryState.trend = data.trend ?? null;
  updateBrandCategoryTrendLabel();
  updateBrandCategoryPieTitle();
  renderBrandCategoriesTable(data.categories ?? []);
  populateBrandCategoryFilter(data.categoryList ?? data.categories?.map((c) => c.category) ?? []);
  renderBrandCategoryQueriesTable(data.queries ?? []);
  requestAnimationFrame(() => refreshBrandCategoryCharts());
  updateReportContextBar();
}

async function showBrandCategoriesReport({ force = false } = {}) {
  hideAlert();
  const hasDataset =
    !force &&
    brandDatasetState.cacheKey === getBrandDatasetCacheKey() &&
    brandDatasetState.dataset;

  await loadBrandDataset({ force, showLoading: !hasDataset });
}

async function refreshBrandCategories() {
  clearBrandDatasetCache();
  await showBrandCategoriesReport({ force: true });
}

async function loadAuthStatus() {
  const status = await api("/api/auth/status");
  const badge = qs("authBadge");
  const authSection = qs("authSection");
  const dashboardSection = qs("dashboardSection");
  const logoutBtn = qs("logoutBtn");

  if (status.authenticated) {
    badge.textContent = status.email ? `Zalogowano: ${status.email}` : "Zalogowano";
    badge.classList.remove("offline");
    authSection.classList.add("hidden");
    dashboardSection.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    return true;
  }

  badge.textContent = "Nie zalogowano";
  badge.classList.add("offline");
  authSection.classList.remove("hidden");
  dashboardSection.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  return false;
}

function setupMainTabs() {
  document.querySelectorAll(".main-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".main-tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");

      const mainTab = btn.dataset.mainTab;
      const isCategories = mainTab === "categories";

      qs("brandDashboardSection").classList.toggle("hidden", isCategories);
      qs("brandCategoriesSection").classList.toggle("hidden", !isCategories);
      updateReportContextBar();

      if (mainTab === "categories") {
        await showBrandCategoriesReport({ force: false });
        requestAnimationFrame(() => refreshBrandCategoryCharts());
      } else {
        await showBrandReport({ force: false });
      }
    });
  });
}

function setupQuerySearch() {
  qs("wskzQuerySearch")?.addEventListener("input", (event) => {
    brandQueriesState.search = event.target.value ?? "";
    renderBrandQueriesTable();
  });
}

function setupGranularity() {
  updateTrendGranularityLabels(getSelectedGranularity());
  qs("granularity")?.addEventListener("change", () => {
    updateReportContextBar();
    applyBrandDatasetViews();
  });
}

async function init() {
  setupPeriodPresets();
  setupGranularity();
  setupBrandKpiSelectors();
  setupBrandCategoryControls();
  setupQuerySearch();
  setupMainTabs();
  renderBrandDomainPills();
  updateReportContextBar();

  const initialMainTab = document.querySelector(".main-tab.active")?.dataset.mainTab ?? "brand";
  qs("brandDashboardSection").classList.toggle("hidden", initialMainTab === "categories");
  qs("brandCategoriesSection").classList.toggle("hidden", initialMainTab !== "categories");

  const params = new URLSearchParams(window.location.search);
  if (params.get("connected") === "1") {
    showAlert("Zalogowano pomyślnie.", "ok");
    window.history.replaceState({}, "", "/");
  }
  if (params.get("error") === "not_allowed") {
    showAlert("To konto Google nie ma dostępu do tej aplikacji.");
    window.history.replaceState({}, "", "/");
  } else if (params.get("error")) {
    showAlert("Logowanie nie powiodło się. Spróbuj ponownie.");
    window.history.replaceState({}, "", "/");
  }

  qs("refreshBtn").addEventListener("click", () => refreshActiveDashboard({ force: true }));
  qs("wskzShowDomainCols")?.addEventListener("change", syncWskzDomainColumnVisibility);
  qs("logoutBtn").addEventListener("click", async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    window.location.reload();
  });

  const authed = await loadAuthStatus();
  if (!authed) return;

  try {
    await loadBrandDataset({ force: true });
  } catch (error) {
    showAlert(error.message);
  }
}

init();
