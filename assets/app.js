(() => {
  "use strict";

  const DD = window.DISASTER_DASHBOARD_DATA;
  const Plotly = window.Plotly;
  const loadingScreen = document.getElementById("loading-screen");
  const loadingMessage = document.getElementById("loading-message");
  const loadingProgress = document.getElementById("loading-progress");
  const app = document.getElementById("app");
  const globalError = document.getElementById("global-error");
  const panelGrid = document.getElementById("panel-grid");
  const quickReportView = document.getElementById("quick-report-view");
  const exploreView = document.getElementById("explore-view");

  if (!DD || !Plotly) {
    const missing = !DD ? "dashboard data bootstrap" : "Plotly";
    document.body.innerHTML = `<div class="fatal-message">The ${missing} failed to load. Confirm that all package files were uploaded without changing the folder structure.</div>`;
    return;
  }

  const C = DD.columns;
  const FILTERS = DD.filters;
  const METRICS = DD.metrics;
  const LEVELS = new Map(DD.geographyLevels.map((level) => [level.key, level]));
  const ROWS = [];
  const panels = [];
  const scriptPromises = new Map();
  const defaultMetrics = [0, 1, 2];
  const QUICK_FILTER_INDICES = [0, 1, 2, 3, 5];
  const formatInteger = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const formatPercent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
  const formatCurrencyFull = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  let exploreInitialized = false;

  const quick = {
    initialized: false,
    renderToken: 0,
    lastReport: null,
    state: {
      reportType: "single",
      geographyLevel: DD.geographyLevels[0].key,
      metric: 1,
      plotBasis: "cumulative",
      useATimeForB: true,
      scenarios: {
        a: defaultQuickScenario(),
        b: defaultQuickScenario(),
      },
    },
    elements: {},
  };

  function defaultQuickScenario() {
    return {
      filters: Array(FILTERS.length).fill(-1),
      geographyValue: -1,
      timePreset: "all",
      startQuarter: 0,
      endQuarter: Math.max(0, DD.quarters.length - 1),
    };
  }

  function setLoading(message, percent) {
    loadingMessage.textContent = message;
    loadingProgress.style.width = `${Math.max(3, Math.min(100, percent))}%`;
  }

  function showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    globalError.hidden = false;
    globalError.innerHTML = `<strong>Dashboard error:</strong> ${escapeHtml(message)}<br><span>Confirm that the full extracted package—not the ZIP file itself—was uploaded to the repository root.</span>`;
    console.error(error);
  }

  function clearError() {
    globalError.hidden = true;
    globalError.replaceChildren();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function wrapAnnotationText(value, maxLength = 68) {
    const words = String(value ?? "").split(/\s+/).filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxLength && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.map(escapeHtml).join("<br>");
  }

  function loadScriptOnce(source) {
    if (typeof window.__CDBG_EXEC_PACKED_ASSET === "function") {
      return window.__CDBG_EXEC_PACKED_ASSET(source);
    }
    const url = new URL(source, document.baseURI).href;
    if (scriptPromises.has(url)) return scriptPromises.get(url);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.onload = () => resolve(url);
      script.onerror = () => reject(new Error(`Could not load ${source}`));
      document.head.appendChild(script);
    });
    scriptPromises.set(url, promise);
    return promise;
  }

  function dictionaryForFilter(index) {
    return DD.filterDictionaries[FILTERS[index].key];
  }

  function geographyInfo(key) {
    return DD.geography[key];
  }

  function levelInfo(key) {
    return LEVELS.get(key) || DD.geographyLevels[0];
  }

  function filterLabel(index, code) {
    if (code < 0) return "All";
    return dictionaryForFilter(index)[code] ?? "Unknown";
  }

  function geographyLabel(levelKey, code) {
    if (code < 0) return "All mapped geographies";
    return geographyInfo(levelKey).names[code] ?? "Unknown geography";
  }

  function methodLabel(level, row) {
    if (level.methodColumn === null || level.methodColumn === undefined) return "Direct state assignment";
    const code = row[level.methodColumn];
    if (code < 0 || !level.methodDictionary) return "Unspecified";
    return DD.methodDictionaries[level.methodDictionary][code] ?? "Unspecified";
  }

  function confidenceLabel(level, row) {
    if (level.confidenceColumn === null || level.confidenceColumn === undefined) return "direct";
    const code = row[level.confidenceColumn];
    if (code < 0 || !level.confidenceDictionary) return "unspecified";
    return DD.methodDictionaries[level.confidenceDictionary][code] ?? "unspecified";
  }

  function formatCurrencyCompact(value) {
    const amount = Number(value) || 0;
    const sign = amount < 0 ? "-" : "";
    const absolute = Math.abs(amount);
    if (absolute >= 1e12) return `${sign}$${(absolute / 1e12).toFixed(2)}T`;
    if (absolute >= 1e9) return `${sign}$${(absolute / 1e9).toFixed(2)}B`;
    if (absolute >= 1e6) return `${sign}$${(absolute / 1e6).toFixed(2)}M`;
    if (absolute >= 1e3) return `${sign}$${(absolute / 1e3).toFixed(1)}K`;
    return `${sign}$${formatInteger.format(absolute)}`;
  }

  function safeFilename(value) {
    return String(value)
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 90) || "cdbg_dr_fund_dashboard_export";
  }

  function timestampForFilename() {
    const now = new Date();
    const pad = (number) => String(number).padStart(2, "0");
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  let webGLSupport;

  function hasWebGLSupport() {
    if (webGLSupport !== undefined) return webGLSupport;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      webGLSupport = Boolean(context);
      if (context && typeof context.getExtension === "function") {
        const loseContext = context.getExtension("WEBGL_lose_context");
        if (loseContext) loseContext.loseContext();
      }
    } catch (error) {
      console.warn("WebGL availability check failed", error);
      webGLSupport = false;
    }
    return webGLSupport;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function csvEscape(value) {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function setSelectOptions(select, choices, labels, selectedValue, allLabel = "All") {
    const fragment = document.createDocumentFragment();
    const all = document.createElement("option");
    all.value = "-1";
    all.textContent = allLabel;
    fragment.appendChild(all);
    for (const code of choices) {
      const option = document.createElement("option");
      option.value = String(code);
      option.textContent = labels[code] ?? `Unknown (${code})`;
      fragment.appendChild(option);
    }
    select.replaceChildren(fragment);
    select.value = String(selectedValue);
    if (select.value !== String(selectedValue)) select.value = "-1";
  }

  function choiceSort(codes, labels, year = false) {
    return [...codes].sort((a, b) => {
      const left = labels[a] ?? "";
      const right = labels[b] ?? "";
      if (year) return Number(left) - Number(right);
      return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
    });
  }

  function rowMatchesFilters(row, filters) {
    for (let index = 0; index < FILTERS.length; index += 1) {
      const selected = filters[index];
      if (selected >= 0 && row[index] !== selected) return false;
    }
    return true;
  }

  function geographyInterpretation(level) {
    if (level.key === "city") {
      return "City/place symbols are matched gazetteer points rather than municipal boundary polygons. County values derived from a city use that place’s listed primary county.";
    }
    if (level.key === "county") {
      return "County coverage combines direct county text and city-derived primary counties; unmatched rows are excluded from mapped analysis.";
    }
    if (level.key === "urban") {
      return "Urban areas are secondary Census statistical geographies linked through matched city points or conservative locality text.";
    }
    return "State geography is assigned directly from Grantee State and covers all dashboard financial rows.";
  }

  function emptyPlot(div, title, message, height) {
    return Plotly.react(div, [], {
      title: { text: title, x: 0.02, xanchor: "left", font: { size: 16 } },
      height,
      margin: { l: 20, r: 20, t: 60, b: 20 },
      paper_bgcolor: "white",
      plot_bgcolor: "white",
      xaxis: { visible: false },
      yaxis: { visible: false },
      annotations: [{ text: message, x: 0.5, y: 0.5, xref: "paper", yref: "paper", showarrow: false, font: { size: 14, color: "#64748b" }, align: "center" }],
    }, { responsive: true, displaylogo: false });
  }

  function showPlotError(div, title, message) {
    return emptyPlot(div, title, `Unable to render this figure: ${message}`, 455);
  }

  function plotConfig(filename, options = {}) {
    return {
      responsive: true,
      displaylogo: false,
      scrollZoom: options.scrollZoom !== false,
      modeBarButtonsToRemove: ["lasso2d", "select2d"],
      toImageButtonOptions: {
        format: "png",
        filename,
        width: options.width || 1600,
        height: options.height || 950,
        scale: 1,
      },
    };
  }

  function colorSettings(values) {
    if (!values.length) return { colorscale: "Blues" };
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    if (minimum < 0 && maximum > 0) {
      const bound = Math.max(Math.abs(minimum), Math.abs(maximum), 1);
      return { colorscale: "RdBu", cmin: -bound, cmax: bound, cmid: 0 };
    }
    if (minimum === maximum) {
      const padding = Math.max(Math.abs(minimum) * 0.05, 1);
      return { colorscale: "Blues", cmin: minimum - padding, cmax: maximum + padding };
    }
    return { colorscale: "Blues", cmin: minimum, cmax: maximum };
  }

  async function ensureGeojson(levelKey) {
    if (DD.geojson[levelKey]) return DD.geojson[levelKey];
    const source = DD.geoFiles[levelKey];
    if (!source) return null;
    await loadScriptOnce(source);
    return DD.geojson[levelKey] || null;
  }

  function collectCoordinatePairs(coordinates, output) {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      output.push([coordinates[0], coordinates[1]]);
      return;
    }
    for (const item of coordinates) collectCoordinatePairs(item, output);
  }

  function mapViewFromPolygonGeojson(geojson, locationIds) {
    if (!geojson || locationIds.size > 120) return { center: { lat: 38.2, lon: -96.5 }, zoom: 2.25 };
    const points = [];
    for (const feature of geojson.features || []) {
      if (!locationIds.has(String(feature?.properties?.id ?? ""))) continue;
      collectCoordinatePairs(feature?.geometry?.coordinates, points);
    }
    if (!points.length) return { center: { lat: 38.2, lon: -96.5 }, zoom: 2.25 };
    const longitudes = points.map((point) => point[0]);
    const latitudes = points.map((point) => point[1]);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const lonSpan = maxLon - minLon;
    const latSpan = maxLat - minLat;
    if (lonSpan > 80) return { center: { lat: 38.2, lon: -96.5 }, zoom: 2.25 };
    const span = Math.max(lonSpan, latSpan * 1.6, 0.15);
    const zoom = Math.min(9, Math.max(2, Math.log2(300 / span)));
    return { center: { lat: (maxLat + minLat) / 2, lon: (maxLon + minLon) / 2 }, zoom };
  }

  function mapViewFromPoints(latitudes, longitudes) {
    const valid = latitudes.map((lat, index) => [Number(lat), Number(longitudes[index])]).filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
    if (!valid.length || valid.length > 120) return { center: { lat: 38.2, lon: -96.5 }, zoom: 2.25 };
    const lats = valid.map((item) => item[0]);
    const lons = valid.map((item) => item[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const lonSpan = maxLon - minLon;
    const latSpan = maxLat - minLat;
    if (lonSpan > 80) return { center: { lat: 38.2, lon: -96.5 }, zoom: 2.25 };
    const span = Math.max(lonSpan, latSpan * 1.6, 0.15);
    const zoom = Math.min(10, Math.max(2, Math.log2(300 / span)));
    return { center: { lat: (maxLat + minLat) / 2, lon: (maxLon + minLon) / 2 }, zoom };
  }

  /* ------------------------------------------------------------------
     Quick Report decision tool
  ------------------------------------------------------------------ */

  function bindQuickElements() {
    const byId = (id) => document.getElementById(id);
    quick.elements = {
      reportType: byId("qr-report-type"),
      geographyLevel: byId("qr-geo-level"),
      metric: byId("qr-metric"),
      plotBasis: byId("qr-plot-basis"),
      scenarioBCard: byId("qr-scenario-b-card"),
      useATimeForB: byId("qr-b-use-a-time"),
      bTimeControls: byId("qr-b-time-controls"),
      generate: byId("qr-generate"),
      reset: byId("qr-reset"),
      placeholder: byId("qr-report-placeholder"),
      output: byId("qr-report-output"),
      reportStatus: byId("qr-report-status"),
      reportPlot: byId("qr-report-plot"),
      downloadPng: byId("qr-download-png"),
      printPdf: byId("qr-print-pdf"),
      downloadCsv: byId("qr-download-csv"),
      scenarios: {
        a: bindQuickScenarioElements("a"),
        b: bindQuickScenarioElements("b"),
      },
    };
  }

  function bindQuickScenarioElements(key) {
    const byId = (id) => document.getElementById(id);
    const filterSelects = new Map();
    for (const index of QUICK_FILTER_INDICES) filterSelects.set(index, byId(`qr-${key}-filter-${index}`));
    return {
      location: byId(`qr-${key}-location`),
      timePreset: byId(`qr-${key}-time-preset`),
      startQuarter: byId(`qr-${key}-start`),
      endQuarter: byId(`qr-${key}-end`),
      customRange: byId(`qr-${key}-custom-range`),
      caption: byId(`qr-${key}-caption`),
      filterSelects,
    };
  }

  function populateQuickSharedChoices() {
    const geographyOptions = DD.geographyLevels.map((level) => `<option value="${escapeHtml(level.key)}">${escapeHtml(level.label)}</option>`).join("");
    quick.elements.geographyLevel.innerHTML = geographyOptions;
    quick.elements.geographyLevel.value = quick.state.geographyLevel;
    quick.elements.metric.innerHTML = METRICS.map((metric, index) => `<option value="${index}">${escapeHtml(metric.label)}</option>`).join("");
    quick.elements.metric.value = String(quick.state.metric);
    quick.elements.plotBasis.value = quick.state.plotBasis;

    const quarterOptions = DD.quarters.map((quarter, index) => `<option value="${index}">${escapeHtml(quarter)}</option>`).join("");
    for (const key of ["a", "b"]) {
      const elements = quick.elements.scenarios[key];
      elements.startQuarter.innerHTML = quarterOptions;
      elements.endQuarter.innerHTML = quarterOptions;
      elements.startQuarter.value = String(quick.state.scenarios[key].startQuarter);
      elements.endQuarter.value = String(quick.state.scenarios[key].endQuarter);
      elements.timePreset.value = quick.state.scenarios[key].timePreset;
    }
  }

  function presetRange(preset) {
    const last = Math.max(0, DD.quarters.length - 1);
    if (preset === "1y") return [Math.max(0, last - 3), last];
    if (preset === "3y") return [Math.max(0, last - 11), last];
    if (preset === "5y") return [Math.max(0, last - 19), last];
    return [0, last];
  }

  function syncQuickScenarioRange(key) {
    const scenario = quick.state.scenarios[key];
    const elements = quick.elements.scenarios[key];
    scenario.timePreset = elements.timePreset.value;
    elements.customRange.hidden = scenario.timePreset !== "custom";
    if (scenario.timePreset === "custom") {
      let start = Number(elements.startQuarter.value);
      let end = Number(elements.endQuarter.value);
      if (!Number.isInteger(start)) start = 0;
      if (!Number.isInteger(end)) end = DD.quarters.length - 1;
      if (start > end) [start, end] = [end, start];
      scenario.startQuarter = start;
      scenario.endQuarter = end;
      elements.startQuarter.value = String(start);
      elements.endQuarter.value = String(end);
    } else {
      [scenario.startQuarter, scenario.endQuarter] = presetRange(scenario.timePreset);
      elements.startQuarter.value = String(scenario.startQuarter);
      elements.endQuarter.value = String(scenario.endQuarter);
    }
  }

  function quickScenarioRange(key) {
    if (key === "b" && quick.state.useATimeForB) {
      const a = quick.state.scenarios.a;
      return [a.startQuarter, a.endQuarter];
    }
    const scenario = quick.state.scenarios[key];
    return [scenario.startQuarter, scenario.endQuarter];
  }

  function quickRowInTime(row, range) {
    const quarter = row[C.quarter];
    return quarter >= range[0] && quarter <= range[1];
  }

  function updateQuickScenarioCaption(key) {
    const elements = quick.elements.scenarios[key];
    if (!elements.caption) return;
    const scenario = quick.state.scenarios[key];
    elements.caption.textContent = geographyLabel(quick.state.geographyLevel, scenario.geographyValue);
  }

  function updateQuickScenarioChoices(key) {
    const scenario = quick.state.scenarios[key];
    const elements = quick.elements.scenarios[key];
    const level = levelInfo(quick.state.geographyLevel);
    const range = quickScenarioRange(key);

    const locationAvailable = new Set();
    for (const row of ROWS) {
      if (!quickRowInTime(row, range) || !rowMatchesFilters(row, scenario.filters)) continue;
      const geographyCode = row[level.column];
      if (geographyCode >= 0) locationAvailable.add(geographyCode);
    }
    if (scenario.geographyValue >= 0 && !locationAvailable.has(scenario.geographyValue)) scenario.geographyValue = -1;
    const locationChoices = choiceSort(locationAvailable, geographyInfo(level.key).names);
    setSelectOptions(elements.location, locationChoices, geographyInfo(level.key).names, scenario.geographyValue, "All mapped geographies");

    let running = [];
    for (const row of ROWS) {
      if (!quickRowInTime(row, range)) continue;
      const geographyCode = row[level.column];
      if (geographyCode < 0) continue;
      if (scenario.geographyValue >= 0 && geographyCode !== scenario.geographyValue) continue;
      running.push(row);
    }

    for (const index of QUICK_FILTER_INDICES) {
      const select = elements.filterSelects.get(index);
      const gated = index === 3 && scenario.filters[2] < 0;
      if (gated) {
        scenario.filters[index] = -1;
        select.disabled = true;
        const option = document.createElement("option");
        option.value = "-1";
        option.textContent = "Select a grantee first";
        select.replaceChildren(option);
        continue;
      }
      select.disabled = false;
      const available = new Set();
      for (const row of running) {
        const code = row[index];
        if (code >= 0) available.add(code);
      }
      if (scenario.filters[index] >= 0 && !available.has(scenario.filters[index])) scenario.filters[index] = -1;
      const choices = choiceSort(available, dictionaryForFilter(index), index === 0);
      setSelectOptions(select, choices, dictionaryForFilter(index), scenario.filters[index], "All");
      if (scenario.filters[index] >= 0) {
        const selected = scenario.filters[index];
        running = running.filter((row) => row[index] === selected);
      }
    }
    updateQuickScenarioCaption(key);
  }

  function resetQuickDownstreamFilters(key, changedIndex) {
    const scenario = quick.state.scenarios[key];
    const position = QUICK_FILTER_INDICES.indexOf(changedIndex);
    for (let cursor = position + 1; cursor < QUICK_FILTER_INDICES.length; cursor += 1) {
      scenario.filters[QUICK_FILTER_INDICES[cursor]] = -1;
    }
  }

  function syncQuickSharedState() {
    quick.state.reportType = quick.elements.reportType.value;
    quick.state.geographyLevel = quick.elements.geographyLevel.value;
    quick.state.metric = Number(quick.elements.metric.value);
    quick.state.plotBasis = quick.elements.plotBasis.value;
    quick.state.useATimeForB = quick.elements.useATimeForB.checked;
    quick.elements.scenarioBCard.hidden = quick.state.reportType !== "comparison";
    quick.elements.bTimeControls.hidden = quick.state.useATimeForB;
  }

  function bindQuickEvents() {
    quick.elements.reportType.addEventListener("change", () => {
      syncQuickSharedState();
      quick.lastReport = null;
    });
    quick.elements.geographyLevel.addEventListener("change", () => {
      quick.state.geographyLevel = quick.elements.geographyLevel.value;
      for (const key of ["a", "b"]) quick.state.scenarios[key].geographyValue = -1;
      updateQuickScenarioChoices("a");
      updateQuickScenarioChoices("b");
      quick.lastReport = null;
    });
    quick.elements.metric.addEventListener("change", () => {
      quick.state.metric = Number(quick.elements.metric.value);
      quick.lastReport = null;
    });
    quick.elements.plotBasis.addEventListener("change", () => {
      quick.state.plotBasis = quick.elements.plotBasis.value;
      quick.lastReport = null;
    });
    quick.elements.useATimeForB.addEventListener("change", () => {
      quick.state.useATimeForB = quick.elements.useATimeForB.checked;
      quick.elements.bTimeControls.hidden = quick.state.useATimeForB;
      if (quick.state.useATimeForB) updateQuickScenarioChoices("b");
      quick.lastReport = null;
    });

    for (const key of ["a", "b"]) {
      const scenario = quick.state.scenarios[key];
      const elements = quick.elements.scenarios[key];
      elements.location.addEventListener("change", () => {
        scenario.geographyValue = Number(elements.location.value);
        updateQuickScenarioChoices(key);
        quick.lastReport = null;
      });
      elements.timePreset.addEventListener("change", () => {
        syncQuickScenarioRange(key);
        updateQuickScenarioChoices(key);
        if (key === "a" && quick.state.useATimeForB) updateQuickScenarioChoices("b");
        quick.lastReport = null;
      });
      elements.startQuarter.addEventListener("change", () => {
        syncQuickScenarioRange(key);
        updateQuickScenarioChoices(key);
        if (key === "a" && quick.state.useATimeForB) updateQuickScenarioChoices("b");
        quick.lastReport = null;
      });
      elements.endQuarter.addEventListener("change", () => {
        syncQuickScenarioRange(key);
        updateQuickScenarioChoices(key);
        if (key === "a" && quick.state.useATimeForB) updateQuickScenarioChoices("b");
        quick.lastReport = null;
      });
      for (const [index, select] of elements.filterSelects.entries()) {
        select.addEventListener("change", () => {
          scenario.filters[index] = Number(select.value);
          resetQuickDownstreamFilters(key, index);
          updateQuickScenarioChoices(key);
          quick.lastReport = null;
        });
      }
    }

    quick.elements.generate.addEventListener("click", () => generateQuickReport().catch(showError));
    quick.elements.reset.addEventListener("click", () => resetQuickReport().catch(showError));
    quick.elements.downloadPng.addEventListener("click", () => downloadQuickReportPng().catch(showError));
    quick.elements.printPdf.addEventListener("click", () => printQuickReport().catch(showError));
    quick.elements.downloadCsv.addEventListener("click", () => downloadQuickReportCsv());
  }

  async function setupQuickReport() {
    bindQuickElements();
    populateQuickSharedChoices();
    bindQuickEvents();
    syncQuickSharedState();
    syncQuickScenarioRange("a");
    syncQuickScenarioRange("b");
    updateQuickScenarioChoices("a");
    updateQuickScenarioChoices("b");
    quick.initialized = true;
  }

  async function resetQuickReport() {
    quick.state.reportType = "single";
    quick.state.geographyLevel = DD.geographyLevels[0].key;
    quick.state.metric = 1;
    quick.state.plotBasis = "cumulative";
    quick.state.useATimeForB = true;
    quick.state.scenarios.a = defaultQuickScenario();
    quick.state.scenarios.b = defaultQuickScenario();
    quick.elements.reportType.value = "single";
    quick.elements.geographyLevel.value = quick.state.geographyLevel;
    quick.elements.metric.value = String(quick.state.metric);
    quick.elements.plotBasis.value = quick.state.plotBasis;
    quick.elements.useATimeForB.checked = true;
    for (const key of ["a", "b"]) {
      const elements = quick.elements.scenarios[key];
      elements.timePreset.value = "all";
      elements.startQuarter.value = "0";
      elements.endQuarter.value = String(DD.quarters.length - 1);
      elements.customRange.hidden = true;
      for (const select of elements.filterSelects.values()) select.value = "-1";
    }
    syncQuickSharedState();
    updateQuickScenarioChoices("a");
    updateQuickScenarioChoices("b");
    quick.lastReport = null;
    quick.elements.output.hidden = true;
    quick.elements.placeholder.hidden = false;
    if (quick.elements.reportPlot.data) await Plotly.purge(quick.elements.reportPlot);
  }

  function computeQuickScenario(key) {
    const scenario = quick.state.scenarios[key];
    const level = levelInfo(quick.state.geographyLevel);
    const range = quickScenarioRange(key);
    const indices = [];
    let preGeographyRecords = 0;
    let mappedRecords = 0;
    for (let index = 0; index < ROWS.length; index += 1) {
      const row = ROWS[index];
      if (!quickRowInTime(row, range) || !rowMatchesFilters(row, scenario.filters)) continue;
      preGeographyRecords += 1;
      const geographyCode = row[level.column];
      if (geographyCode < 0) continue;
      mappedRecords += 1;
      if (scenario.geographyValue >= 0 && geographyCode !== scenario.geographyValue) continue;
      indices.push(index);
    }
    return {
      key,
      level,
      range,
      scenario,
      indices,
      preGeographyRecords,
      mappedRecords,
      mappingCoverage: preGeographyRecords ? mappedRecords / preGeographyRecords : 0,
    };
  }

  function summarizeQuickScenario(result, metricIndex) {
    const grants = new Set();
    const projects = new Set();
    const activities = new Set();
    let total = 0;
    for (const rowIndex of result.indices) {
      const row = ROWS[rowIndex];
      grants.add(row[C.grantCode]);
      projects.add(row[C.project]);
      activities.add(row[C.activityCode]);
      total += row[C.metricStart + metricIndex] || 0;
    }
    return {
      total,
      records: result.indices.length,
      grants: grants.size,
      projects: projects.size,
      activities: activities.size,
      mappingCoverage: result.mappingCoverage,
    };
  }

  function buildQuarterSeries(result, metricIndex, basis) {
    const values = [];
    for (let quarter = result.range[0]; quarter <= result.range[1]; quarter += 1) values.push(0);
    for (const rowIndex of result.indices) {
      const row = ROWS[rowIndex];
      const quarter = row[C.quarter];
      values[quarter - result.range[0]] += row[C.metricStart + metricIndex] || 0;
    }
    const quarterly = [...values];
    if (basis === "cumulative") {
      let running = 0;
      for (let index = 0; index < values.length; index += 1) {
        running += values[index];
        values[index] = running;
      }
    }
    return {
      x: DD.quarters.slice(result.range[0], result.range[1] + 1),
      y: values,
      quarterly,
    };
  }

  function aggregateQuickGeography(result, metricIndex) {
    const grouped = new Map();
    for (const rowIndex of result.indices) {
      const row = ROWS[rowIndex];
      const geographyCode = row[result.level.column];
      let group = grouped.get(geographyCode);
      if (!group) {
        group = { geographyCode, amount: 0, records: 0, grants: new Set(), projects: new Set(), activities: new Set() };
        grouped.set(geographyCode, group);
      }
      group.amount += row[C.metricStart + metricIndex] || 0;
      group.records += 1;
      group.grants.add(row[C.grantCode]);
      group.projects.add(row[C.project]);
      group.activities.add(row[C.activityCode]);
    }
    return [...grouped.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }

  function quickCategoryKind(resultA, resultB = null) {
    const scenarioA = resultA.scenario;
    const scenarioB = resultB?.scenario;
    if (scenarioA.filters[3] >= 0 && (!scenarioB || scenarioB.filters[3] >= 0)) {
      return { key: "activityType", label: "activity type", column: C.activityType, labels: dictionaryForFilter(5) };
    }
    if (scenarioA.geographyValue >= 0 && (!scenarioB || scenarioB.geographyValue >= 0)) {
      return { key: "project", label: "project", column: C.project, labels: dictionaryForFilter(3) };
    }
    return { key: "geography", label: resultA.level.displayLabel.toLowerCase(), column: resultA.level.column, labels: geographyInfo(resultA.level.key).names };
  }

  function aggregateQuickCategories(result, metricIndex, category) {
    const grouped = new Map();
    for (const rowIndex of result.indices) {
      const row = ROWS[rowIndex];
      const code = row[category.column];
      if (code < 0) continue;
      grouped.set(code, (grouped.get(code) || 0) + (row[C.metricStart + metricIndex] || 0));
    }
    return grouped;
  }

  function buildTopCategoryRows(resultA, resultB, metricIndex, reportType) {
    const category = quickCategoryKind(resultA, reportType === "comparison" ? resultB : null);
    const a = aggregateQuickCategories(resultA, metricIndex, category);
    const b = reportType === "comparison" ? aggregateQuickCategories(resultB, metricIndex, category) : new Map();
    const codes = new Set([...a.keys(), ...b.keys()]);
    const rows = [...codes].map((code) => ({
      code,
      label: category.labels[code] ?? `Unknown (${code})`,
      a: a.get(code) || 0,
      b: b.get(code) || 0,
    }));
    for (const row of rows) row.difference = row.b - row.a;
    rows.sort((left, right) => {
      const leftScore = reportType === "comparison" ? Math.max(Math.abs(left.a), Math.abs(left.b), Math.abs(left.difference)) : Math.abs(left.a);
      const rightScore = reportType === "comparison" ? Math.max(Math.abs(right.a), Math.abs(right.b), Math.abs(right.difference)) : Math.abs(right.a);
      return rightScore - leftScore;
    });
    return { category, rows: rows.slice(0, 5) };
  }

  function quickFilterDescription(filters) {
    const parts = [];
    for (const index of QUICK_FILTER_INDICES) {
      if (filters[index] >= 0) parts.push(`${FILTERS[index].label}: ${filterLabel(index, filters[index])}`);
    }
    return parts.length ? parts.join("; ") : "All disasters, grantees, projects, and activity types";
  }

  function quickScenarioDescription(result) {
    const location = geographyLabel(result.level.key, result.scenario.geographyValue);
    const range = `${DD.quarters[result.range[0]]}–${DD.quarters[result.range[1]]}`;
    return `${location} · ${range} · ${quickFilterDescription(result.scenario.filters)}`;
  }

  function peakQuarter(series) {
    if (!series.quarterly.length) return null;
    let bestIndex = 0;
    for (let index = 1; index < series.quarterly.length; index += 1) {
      if (series.quarterly[index] > series.quarterly[bestIndex]) bestIndex = index;
    }
    return { quarter: series.x[bestIndex], value: series.quarterly[bestIndex] };
  }

  function recentTrendStatement(series) {
    if (series.quarterly.length < 8) return null;
    const lastFour = series.quarterly.slice(-4).reduce((sum, value) => sum + value, 0);
    const priorFour = series.quarterly.slice(-8, -4).reduce((sum, value) => sum + value, 0);
    const difference = lastFour - priorFour;
    const direction = difference >= 0 ? "higher" : "lower";
    return `The latest four-quarter net amount is ${formatCurrencyCompact(Math.abs(difference))} ${direction} than the preceding four quarters.`;
  }

  function buildQuickTakeaways(report) {
    const metric = METRICS[report.metric].shortLabel || METRICS[report.metric].label;
    const takeaways = [];
    if (report.reportType === "single") {
      const peak = peakQuarter(report.seriesA);
      takeaways.push(`${report.labelA} records a net ${metric.toLowerCase()} amount of ${formatCurrencyCompact(report.summaryA.total)} across ${formatInteger.format(report.summaryA.records)} quarter-level records.`);
      if (peak) takeaways.push(`The highest quarterly net amount was ${formatCurrencyCompact(peak.value)} in ${peak.quarter}.`);
      const trend = recentTrendStatement(report.seriesA);
      if (trend) takeaways.push(trend);
      if (report.top.rows.length) {
        const leader = report.top.rows[0];
        takeaways.push(`The leading ${report.top.category.label} is ${leader.label}, representing ${formatCurrencyCompact(leader.a)}.`);
      }
      takeaways.push(`${report.level.displayLabel} mapping coverage is ${formatPercent.format(report.summaryA.mappingCoverage)} for records matching the nongeographic filters.`);
    } else {
      const difference = report.summaryB.total - report.summaryA.total;
      const direction = difference >= 0 ? "higher" : "lower";
      const percentText = report.summaryA.total !== 0
        ? ` (${formatPercent.format(Math.abs(difference / report.summaryA.total))})`
        : "";
      takeaways.push(`Scenario B is ${formatCurrencyCompact(Math.abs(difference))} ${direction} than Scenario A${percentText} for ${metric.toLowerCase()}.`);
      const peakA = peakQuarter(report.seriesA);
      const peakB = peakQuarter(report.seriesB);
      if (peakA && peakB) takeaways.push(`Scenario A peaked in ${peakA.quarter} at ${formatCurrencyCompact(peakA.value)}, while Scenario B peaked in ${peakB.quarter} at ${formatCurrencyCompact(peakB.value)}.`);
      if (report.top.rows.length) {
        const largest = [...report.top.rows].sort((left, right) => Math.abs(right.difference) - Math.abs(left.difference))[0];
        const diffDirection = largest.difference >= 0 ? "more" : "less";
        takeaways.push(`The largest displayed ${report.top.category.label} difference is ${largest.label}, with Scenario B showing ${formatCurrencyCompact(Math.abs(largest.difference))} ${diffDirection} than Scenario A.`);
      }
      takeaways.push(`Mapping coverage is ${formatPercent.format(report.summaryA.mappingCoverage)} for Scenario A and ${formatPercent.format(report.summaryB.mappingCoverage)} for Scenario B.`);
    }
    return takeaways.slice(0, 4);
  }

  function quickKpis(report) {
    if (report.reportType === "single") {
      return [
        ["Net selected measure", formatCurrencyCompact(report.summaryA.total), METRICS[report.metric].shortLabel],
        ["Unique grants", formatInteger.format(report.summaryA.grants), "Distinct HUD grants"],
        ["Unique activities", formatInteger.format(report.summaryA.activities), "Grant + activity number"],
        ["Mapping coverage", formatPercent.format(report.summaryA.mappingCoverage), report.level.displayLabel],
      ];
    }
    const difference = report.summaryB.total - report.summaryA.total;
    const relative = report.summaryA.total !== 0 ? difference / Math.abs(report.summaryA.total) : null;
    return [
      ["Scenario A", formatCurrencyCompact(report.summaryA.total), report.labelA],
      ["Scenario B", formatCurrencyCompact(report.summaryB.total), report.labelB],
      ["Difference (B − A)", formatCurrencyCompact(difference), METRICS[report.metric].shortLabel],
      ["Relative difference", relative === null ? "N/A" : formatPercent.format(relative), "Relative to Scenario A"],
    ];
  }

  function reportMapData(report) {
    const geo = geographyInfo(report.level.key);
    const a = new Map(report.mapA.map((group) => [group.geographyCode, group]));
    if (report.reportType === "single") {
      return report.mapA.map((group) => ({
        geographyCode: group.geographyCode,
        value: group.amount,
        name: geo.names[group.geographyCode] ?? "Unknown",
        a: group.amount,
        b: null,
        difference: null,
        records: group.records,
        grants: group.grants.size,
        projects: group.projects.size,
        activities: group.activities.size,
      }));
    }
    const b = new Map(report.mapB.map((group) => [group.geographyCode, group]));
    const codes = new Set([...a.keys(), ...b.keys()]);
    return [...codes].map((code) => {
      const groupA = a.get(code);
      const groupB = b.get(code);
      const amountA = groupA?.amount || 0;
      const amountB = groupB?.amount || 0;
      return {
        geographyCode: code,
        value: amountB - amountA,
        name: geo.names[code] ?? "Unknown",
        a: amountA,
        b: amountB,
        difference: amountB - amountA,
        records: (groupA?.records || 0) + (groupB?.records || 0),
        grants: new Set([...(groupA?.grants || []), ...(groupB?.grants || [])]).size,
        projects: new Set([...(groupA?.projects || []), ...(groupB?.projects || [])]).size,
        activities: new Set([...(groupA?.activities || []), ...(groupB?.activities || [])]).size,
      };
    }).sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
  }

  async function buildQuickReportMapTrace(report, mapDomain) {
    if (!hasWebGLSupport()) return { traces: [], view: null, annotation: "Interactive map unavailable because WebGL is disabled in this browser." };
    const rows = reportMapData(report);
    if (!rows.length) return { traces: [], view: null, annotation: "No mapped records match the report selections." };
    const geo = geographyInfo(report.level.key);
    const values = rows.map((row) => row.value);
    const color = report.reportType === "comparison"
      ? (() => {
          const bound = Math.max(...values.map((value) => Math.abs(value)), 1);
          return { colorscale: "RdBu", cmin: -bound, cmax: bound, cmid: 0 };
        })()
      : colorSettings(values);
    let traces;
    let view;

    if (report.level.mapType === "point") {
      const absolute = values.map((value) => Math.abs(value));
      const maximum = Math.max(...absolute, 0);
      const sizes = absolute.map((value) => maximum <= 0 ? 11 : 10 + 24 * Math.sqrt(value / maximum));
      const customdata = rows.map((row) => report.reportType === "comparison"
        ? [row.name, row.a, row.b, row.difference]
        : [row.name, row.a, row.records, row.grants, row.activities]);
      const hovertemplate = report.reportType === "comparison"
        ? `<b>%{customdata[0]}</b><br>Scenario A: $%{customdata[1]:,.0f}<br>Scenario B: $%{customdata[2]:,.0f}<br>Difference (B − A): $%{customdata[3]:,.0f}<extra></extra>`
        : `<b>%{customdata[0]}</b><br>${escapeHtml(METRICS[report.metric].label)}: $%{customdata[1]:,.0f}<br>Records: %{customdata[2]:,}<br>Grants: %{customdata[3]:,}<br>Activities: %{customdata[4]:,}<extra></extra>`;
      traces = [{
        type: "scattermap",
        subplot: "map",
        mode: "markers",
        lat: rows.map((row) => geo.lat[row.geographyCode]),
        lon: rows.map((row) => geo.lon[row.geographyCode]),
        customdata,
        marker: {
          size: sizes,
          color: values,
          colorscale: color.colorscale,
          cmin: color.cmin,
          cmax: color.cmax,
          cmid: color.cmid,
          showscale: true,
          opacity: 0.84,
          line: { color: "rgba(255,255,255,.85)", width: 0.7 },
          colorbar: { title: { text: report.reportType === "comparison" ? "B − A" : "USD" }, tickprefix: "$", tickformat: ",.2s", thickness: 12, len: .34, y: .60 },
        },
        hovertemplate,
      }];
      view = mapViewFromPoints(
        rows.map((row) => geo.lat[row.geographyCode]),
        rows.map((row) => geo.lon[row.geographyCode]),
      );
    } else {
      const geojson = await ensureGeojson(report.level.key);
      if (!geojson) return { traces: [], view: null, annotation: "The selected geographic boundary file is unavailable." };
      const customdata = rows.map((row) => report.reportType === "comparison"
        ? [row.name, row.a, row.b, row.difference]
        : [row.name, row.a, row.records, row.grants, row.activities]);
      const hovertemplate = report.reportType === "comparison"
        ? `<b>%{customdata[0]}</b><br>Scenario A: $%{customdata[1]:,.0f}<br>Scenario B: $%{customdata[2]:,.0f}<br>Difference (B − A): $%{customdata[3]:,.0f}<extra></extra>`
        : `<b>%{customdata[0]}</b><br>${escapeHtml(METRICS[report.metric].label)}: $%{customdata[1]:,.0f}<br>Records: %{customdata[2]:,}<br>Grants: %{customdata[3]:,}<br>Activities: %{customdata[4]:,}<extra></extra>`;
      traces = [{
        type: "choroplethmap",
        subplot: "map",
        geojson,
        featureidkey: "properties.id",
        locations: rows.map((row) => geo.ids[row.geographyCode]),
        z: values,
        customdata,
        colorscale: color.colorscale,
        zmin: color.cmin,
        zmax: color.cmax,
        zmid: color.cmid,
        marker: { line: { color: "rgba(255,255,255,.78)", width: 0.55 } },
        colorbar: { title: { text: report.reportType === "comparison" ? "B − A" : "USD" }, tickprefix: "$", tickformat: ",.2s", thickness: 12, len: .34, y: .60 },
        hovertemplate,
      }];
      view = mapViewFromPolygonGeojson(geojson, new Set(rows.map((row) => String(geo.ids[row.geographyCode]))));
    }
    return { traces, view, annotation: null, mapDomain };
  }

  function reportScopeText(report) {
    if (report.reportType === "single") {
      return `Single-area report · ${report.level.displayLabel}: ${report.labelA} · ${DD.quarters[report.resultA.range[0]]}–${DD.quarters[report.resultA.range[1]]} · ${METRICS[report.metric].label}`;
    }
    return `Comparison report · ${report.level.displayLabel} · Scenario A: ${report.labelA} (${DD.quarters[report.resultA.range[0]]}–${DD.quarters[report.resultA.range[1]]}) · Scenario B: ${report.labelB} (${DD.quarters[report.resultB.range[0]]}–${DD.quarters[report.resultB.range[1]]})`;
  }

  async function renderQuickReport(report) {
    const token = ++quick.renderToken;
    const plot = quick.elements.reportPlot;
    const mapDomain = { x: [0.025, 0.495], y: [0.40, 0.765] };
    const mapResult = await buildQuickReportMapTrace(report, mapDomain);
    if (token !== quick.renderToken) return;
    const traces = [...mapResult.traces];

    const timelineA = {
      type: "scatter",
      mode: "lines+markers",
      name: report.reportType === "comparison" ? "Scenario A" : report.labelA,
      x: report.seriesA.x,
      y: report.seriesA.y,
      xaxis: "x",
      yaxis: "y",
      line: { width: 2.6, color: "#0f766e" },
      marker: { size: 5, color: "#0f766e" },
      hovertemplate: `<b>${escapeHtml(report.reportType === "comparison" ? "Scenario A" : report.labelA)}</b><br>%{x}<br>$%{y:,.0f}<extra></extra>`,
    };
    traces.push(timelineA);
    if (report.reportType === "comparison") {
      traces.push({
        type: "scatter",
        mode: "lines+markers",
        name: "Scenario B",
        x: report.seriesB.x,
        y: report.seriesB.y,
        xaxis: "x",
        yaxis: "y",
        line: { width: 2.6, color: "#6d28d9" },
        marker: { size: 5, color: "#6d28d9" },
        hovertemplate: "<b>Scenario B</b><br>%{x}<br>$%{y:,.0f}<extra></extra>",
      });
    }

    const topLabels = report.top.rows.map((row) => row.label.length > 34 ? `${row.label.slice(0, 32)}…` : row.label).reverse();
    const topRows = [...report.top.rows].reverse();
    traces.push({
      type: "bar",
      orientation: "h",
      name: report.reportType === "comparison" ? "Scenario A" : METRICS[report.metric].shortLabel,
      x: topRows.map((row) => row.a),
      y: topLabels,
      customdata: topRows.map((row) => [row.label, row.a]),
      xaxis: "x2",
      yaxis: "y2",
      marker: { color: "#0f766e" },
      hovertemplate: "<b>%{customdata[0]}</b><br>Scenario A: $%{customdata[1]:,.0f}<extra></extra>",
    });
    if (report.reportType === "comparison") {
      traces.push({
        type: "bar",
        orientation: "h",
        name: "Scenario B",
        x: topRows.map((row) => row.b),
        y: topLabels,
        customdata: topRows.map((row) => [row.label, row.b, row.difference]),
        xaxis: "x2",
        yaxis: "y2",
        marker: { color: "#6d28d9" },
        hovertemplate: "<b>%{customdata[0]}</b><br>Scenario B: $%{customdata[1]:,.0f}<br>Difference: $%{customdata[2]:,.0f}<extra></extra>",
      });
    }

    const shapes = [];
    const annotations = [];
    const kpis = quickKpis(report);
    const kpiGap = 0.012;
    const kpiWidth = (0.96 - (3 * kpiGap)) / 4;
    kpis.forEach(([label, value, note], index) => {
      const x0 = 0.02 + index * (kpiWidth + kpiGap);
      const x1 = x0 + kpiWidth;
      shapes.push({ type: "rect", xref: "paper", yref: "paper", x0, x1, y0: 0.81, y1: 0.895, line: { color: index < 2 ? "#99d5cf" : "#d7e0ea", width: 1 }, fillcolor: index === 1 && report.reportType === "comparison" ? "#faf7ff" : "#f8fafc", layer: "below" });
      annotations.push(
        { x: x0 + 0.01, y: 0.881, xref: "paper", yref: "paper", text: `<b>${escapeHtml(label.toUpperCase())}</b>`, showarrow: false, xanchor: "left", yanchor: "top", font: { size: 9, color: "#64748b" } },
        { x: x0 + 0.01, y: 0.854, xref: "paper", yref: "paper", text: `<b>${escapeHtml(value)}</b>`, showarrow: false, xanchor: "left", yanchor: "top", font: { size: 18, color: "#0f172a" } },
        { x: x0 + 0.01, y: 0.824, xref: "paper", yref: "paper", text: escapeHtml(note || ""), showarrow: false, xanchor: "left", yanchor: "top", font: { size: 8.5, color: "#718096" } },
      );
    });

    annotations.push(
      { x: 0.02, y: 0.985, xref: "paper", yref: "paper", text: "<b>CDBG-DR FUNDING DECISION BRIEF</b>", showarrow: false, xanchor: "left", yanchor: "top", font: { size: 22, color: "#0f172a" } },
      { x: 0.02, y: 0.948, xref: "paper", yref: "paper", text: wrapAnnotationText(reportScopeText(report), 120), showarrow: false, xanchor: "left", yanchor: "top", align: "left", font: { size: 10.5, color: "#475569" } },
      { x: 0.98, y: 0.985, xref: "paper", yref: "paper", text: `Generated ${escapeHtml(new Date(report.generatedAt).toLocaleString())}`, showarrow: false, xanchor: "right", yanchor: "top", font: { size: 8.5, color: "#718096" } },
      { x: 0.025, y: 0.786, xref: "paper", yref: "paper", text: `<b>${report.reportType === "comparison" ? "Geographic difference (Scenario B − Scenario A)" : `${escapeHtml(METRICS[report.metric].shortLabel)} by ${escapeHtml(report.level.displayLabel)}`}</b>`, showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12.5, color: "#263449" } },
      { x: 0.525, y: 0.786, xref: "paper", yref: "paper", text: "<b>Key Takeaways</b>", showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12.5, color: "#263449" } },
      { x: 0.055, y: 0.335, xref: "paper", yref: "paper", text: `<b>${report.plotBasis === "cumulative" ? "Cumulative net" : "Quarterly net"} ${escapeHtml(METRICS[report.metric].shortLabel.toLowerCase())} by QPR quarter</b>`, showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12.5, color: "#263449" } },
      { x: 0.575, y: 0.335, xref: "paper", yref: "paper", text: `<b>Top five ${escapeHtml(report.top.category.label)} results</b>`, showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 12.5, color: "#263449" } },
    );

    shapes.push({ type: "rect", xref: "paper", yref: "paper", x0: 0.515, x1: 0.98, y0: 0.40, y1: 0.765, line: { color: "#d7e0ea", width: 1 }, fillcolor: "#f8fafc", layer: "below" });
    const takeawayText = report.takeaways.map((item) => `• ${wrapAnnotationText(item, 70)}`).join("<br><br>");
    annotations.push({
      x: 0.532,
      y: 0.737,
      xref: "paper",
      yref: "paper",
      text: takeawayText || "No results are available for the current selection.",
      showarrow: false,
      xanchor: "left",
      yanchor: "top",
      align: "left",
      font: { size: 10.5, color: "#334155" },
    });

    if (mapResult.annotation) {
      annotations.push({
        x: 0.26,
        y: 0.58,
        xref: "paper",
        yref: "paper",
        text: wrapAnnotationText(mapResult.annotation, 52),
        showarrow: false,
        align: "center",
        font: { size: 11, color: "#64748b" },
      });
    }

    const noteParts = [
      "Source: HUD CDBG-DR QPR financial data.",
      "Values are source-quarter transactions; cumulative net totals may decline after reversals, corrections, or deobligations.",
      geographyInterpretation(report.level),
    ];
    annotations.push({
      x: 0.02,
      y: 0.015,
      xref: "paper",
      yref: "paper",
      text: wrapAnnotationText(noteParts.join(" "), 185),
      showarrow: false,
      xanchor: "left",
      yanchor: "bottom",
      align: "left",
      font: { size: 7.5, color: "#64748b" },
    });

    const layout = {
      height: 900,
      margin: { l: 20, r: 20, t: 18, b: 8 },
      paper_bgcolor: "white",
      plot_bgcolor: "white",
      font: { family: "Inter, Arial, sans-serif", color: "#0f172a", size: 10 },
      hovermode: "closest",
      showlegend: report.reportType === "comparison",
      legend: { orientation: "h", x: 0.56, y: 0.038, xanchor: "left", yanchor: "bottom", font: { size: 8.5 }, bgcolor: "rgba(255,255,255,.8)" },
      barmode: "group",
      bargap: 0.22,
      shapes,
      annotations,
      map: {
        style: "white-bg",
        domain: mapDomain,
        center: mapResult.view?.center || { lat: 38.2, lon: -96.5 },
        zoom: mapResult.view?.zoom || 2.25,
      },
      xaxis: {
        domain: [0.055, 0.49],
        anchor: "y",
        tickangle: -45,
        showgrid: false,
        tickfont: { size: 8 },
        categoryorder: "array",
        categoryarray: [...new Set([...report.seriesA.x, ...(report.seriesB?.x || [])])],
      },
      yaxis: {
        domain: [0.075, 0.30],
        anchor: "x",
        tickprefix: "$",
        tickformat: ",.2s",
        gridcolor: "#e2e8f0",
        zeroline: true,
        zerolinecolor: "#94a3b8",
        title: { text: "USD", font: { size: 9 } },
        tickfont: { size: 8 },
      },
      xaxis2: {
        domain: [0.60, 0.965],
        anchor: "y2",
        tickprefix: "$",
        tickformat: ",.2s",
        gridcolor: "#e2e8f0",
        zeroline: true,
        zerolinecolor: "#94a3b8",
        tickfont: { size: 8 },
      },
      yaxis2: {
        domain: [0.075, 0.30],
        anchor: "x2",
        automargin: true,
        tickfont: { size: 8 },
        categoryorder: "array",
        categoryarray: topLabels,
      },
    };

    await Plotly.react(plot, traces, layout, plotConfig("cdbg_dr_one_page_report", { width: 2200, height: 1700, scrollZoom: false }));
  }

  async function generateQuickReport() {
    if (!quick.initialized) return;
    clearError();
    syncQuickSharedState();
    syncQuickScenarioRange("a");
    syncQuickScenarioRange("b");
    updateQuickScenarioChoices("a");
    if (quick.state.reportType === "comparison") updateQuickScenarioChoices("b");

    const button = quick.elements.generate;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Generating report…";
    try {
      const resultA = computeQuickScenario("a");
      const resultB = quick.state.reportType === "comparison" ? computeQuickScenario("b") : null;
      const summaryA = summarizeQuickScenario(resultA, quick.state.metric);
      const summaryB = resultB ? summarizeQuickScenario(resultB, quick.state.metric) : null;
      const seriesA = buildQuarterSeries(resultA, quick.state.metric, quick.state.plotBasis);
      const seriesB = resultB ? buildQuarterSeries(resultB, quick.state.metric, quick.state.plotBasis) : null;
      const mapA = aggregateQuickGeography(resultA, quick.state.metric);
      const mapB = resultB ? aggregateQuickGeography(resultB, quick.state.metric) : [];
      const top = buildTopCategoryRows(resultA, resultB, quick.state.metric, quick.state.reportType);
      const report = {
        generatedAt: new Date().toISOString(),
        reportType: quick.state.reportType,
        level: resultA.level,
        metric: quick.state.metric,
        plotBasis: quick.state.plotBasis,
        resultA,
        resultB,
        summaryA,
        summaryB,
        seriesA,
        seriesB,
        mapA,
        mapB,
        top,
        labelA: geographyLabel(resultA.level.key, resultA.scenario.geographyValue),
        labelB: resultB ? geographyLabel(resultB.level.key, resultB.scenario.geographyValue) : null,
      };
      report.takeaways = buildQuickTakeaways(report);
      quick.lastReport = report;
      quick.elements.placeholder.hidden = true;
      quick.elements.output.hidden = false;
      quick.elements.reportStatus.textContent = quick.state.reportType === "comparison"
        ? `Comparison Report: ${report.labelA} vs. ${report.labelB}`
        : `Single-Area Report: ${report.labelA}`;
      await renderQuickReport(report);
      quick.elements.reportPlot.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function downloadQuickReportPng() {
    if (!quick.lastReport) await generateQuickReport();
    if (!quick.lastReport) return;
    const button = quick.elements.downloadPng;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing PNG…";
    try {
      await Plotly.downloadImage(quick.elements.reportPlot, {
        format: "png",
        filename: `cdbg_dr_${quick.lastReport.reportType}_decision_report_${timestampForFilename()}`,
        width: 2200,
        height: 1700,
        scale: 1,
      });
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function printQuickReport() {
    if (!quick.lastReport) await generateQuickReport();
    if (!quick.lastReport) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) throw new Error("The browser blocked the print window. Allow pop-ups for this site and try again.");
    printWindow.document.write("<!doctype html><title>Preparing CDBG-DR report…</title><body style='font-family:Arial,sans-serif;padding:24px'>Preparing the one-page report…</body>");
    const button = quick.elements.printPdf;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing PDF…";
    try {
      const image = await Plotly.toImage(quick.elements.reportPlot, { format: "png", width: 2200, height: 1700, scale: 1 });
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>CDBG-DR Funding Decision Brief</title><style>@page{size:letter landscape;margin:.2in}html,body{margin:0;padding:0;background:#fff}body{display:grid;place-items:center;min-height:100vh}img{display:block;width:10.6in;height:auto;max-height:8.1in;object-fit:contain}@media print{body{min-height:0}}</style></head><body><img src="${image}" alt="CDBG-DR Funding Decision Brief" onload="setTimeout(()=>window.print(),250)"></body></html>`);
      printWindow.document.close();
    } catch (error) {
      printWindow.close();
      throw error;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function downloadQuickReportCsv() {
    const report = quick.lastReport;
    if (!report) {
      generateQuickReport().catch(showError);
      return;
    }
    const lines = [];
    const add = (...values) => lines.push(values.map(csvEscape).join(","));
    add("CDBG-DR Funding Decision Brief");
    add("Generated", new Date(report.generatedAt).toLocaleString());
    add("Report Type", report.reportType === "comparison" ? "Comparison" : "Single area");
    add("Geographic Level", report.level.label);
    add("Financial Measure", METRICS[report.metric].label);
    add("Trend Basis", report.plotBasis === "cumulative" ? "Cumulative net" : "Quarterly net");
    add("");
    add("Scenario A");
    add("Location", report.labelA);
    add("Time Horizon", `${DD.quarters[report.resultA.range[0]]}–${DD.quarters[report.resultA.range[1]]}`);
    add("Additional Filters", quickFilterDescription(report.resultA.scenario.filters));
    add("Net Selected Measure", report.summaryA.total.toFixed(2));
    add("Quarter-level Records", report.summaryA.records);
    add("Unique Grants", report.summaryA.grants);
    add("Unique Projects", report.summaryA.projects);
    add("Unique Activities", report.summaryA.activities);
    add("Mapping Coverage", report.summaryA.mappingCoverage);
    if (report.reportType === "comparison") {
      add("");
      add("Scenario B");
      add("Location", report.labelB);
      add("Time Horizon", `${DD.quarters[report.resultB.range[0]]}–${DD.quarters[report.resultB.range[1]]}`);
      add("Additional Filters", quickFilterDescription(report.resultB.scenario.filters));
      add("Net Selected Measure", report.summaryB.total.toFixed(2));
      add("Quarter-level Records", report.summaryB.records);
      add("Unique Grants", report.summaryB.grants);
      add("Unique Projects", report.summaryB.projects);
      add("Unique Activities", report.summaryB.activities);
      add("Mapping Coverage", report.summaryB.mappingCoverage);
      add("Difference (B - A)", (report.summaryB.total - report.summaryA.total).toFixed(2));
    }

    add("");
    add("Funding Series");
    add("QPR Quarter", "Scenario A", ...(report.reportType === "comparison" ? ["Scenario B"] : []));
    const quarterCodes = new Set();
    for (let quarter = report.resultA.range[0]; quarter <= report.resultA.range[1]; quarter += 1) quarterCodes.add(quarter);
    if (report.resultB) for (let quarter = report.resultB.range[0]; quarter <= report.resultB.range[1]; quarter += 1) quarterCodes.add(quarter);
    const aLookup = new Map(report.seriesA.x.map((quarter, index) => [quarter, report.seriesA.y[index]]));
    const bLookup = report.seriesB ? new Map(report.seriesB.x.map((quarter, index) => [quarter, report.seriesB.y[index]])) : new Map();
    for (const code of [...quarterCodes].sort((a, b) => a - b)) {
      const quarter = DD.quarters[code];
      add(quarter, aLookup.has(quarter) ? Number(aLookup.get(quarter)).toFixed(2) : "", ...(report.reportType === "comparison" ? [bLookup.has(quarter) ? Number(bLookup.get(quarter)).toFixed(2) : ""] : []));
    }

    add("");
    add(`Top Five ${report.top.category.label}`);
    add("Category", "Scenario A", ...(report.reportType === "comparison" ? ["Scenario B", "Difference (B - A)"] : []));
    for (const row of report.top.rows) {
      add(row.label, row.a.toFixed(2), ...(report.reportType === "comparison" ? [row.b.toFixed(2), row.difference.toFixed(2)] : []));
    }

    add("");
    add("Key Takeaways");
    report.takeaways.forEach((takeaway, index) => add(index + 1, takeaway));
    add("");
    add("Methodology Notes");
    add("Financial values are source-quarter transactions. Cumulative values are chronological cumulative net sums and may decline after reversals, corrections, or deobligations.");
    add(geographyInterpretation(report.level));
    add("This report-data export is aggregate only and contains no raw financial rows.");

    const blob = new Blob(["\ufeff", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `cdbg_dr_${report.reportType}_decision_report_data_${timestampForFilename()}.csv`);
  }

  /* ------------------------------------------------------------------
     Full Explore & Compare dashboard
  ------------------------------------------------------------------ */

  function panelMarkup(number) {
    const className = number === 1 ? "panel-one" : "panel-two";
    const filterFields = FILTERS.map((filter, index) => {
      const full = index === 6 ? " full" : "";
      return `<div class="form-field${full}"><label for="p${number}-filter-${index}">${index + 1}. ${escapeHtml(filter.label)}</label><select id="p${number}-filter-${index}" data-filter-index="${index}"><option value="-1">All</option></select></div>`;
    }).join("");
    const metricCheckboxes = METRICS.map((metric, index) => (
      `<label class="metric-option"><input type="checkbox" value="${index}" ${defaultMetrics.includes(index) ? "checked" : ""}><span>${escapeHtml(metric.label)}</span></label>`
    )).join("");
    const geographyLevels = DD.geographyLevels.map((level) => `<option value="${escapeHtml(level.key)}">${escapeHtml(level.label)}</option>`).join("");
    const mapMetrics = METRICS.map((metric, index) => `<option value="${index}">${escapeHtml(metric.label)}</option>`).join("");

    return `
      <article class="panel-shell ${className}" id="panel-${number}">
        <div class="panel-heading">
          <div><h2>Panel ${number}</h2><p>Independent comparison scenario</p></div>
          <span class="panel-pill">SCENARIO ${number}</span>
        </div>

        <details class="filter-details" open>
          <summary>Filters and display settings</summary>
          <div class="filter-body">
            <p class="help-text">Project and activity-level options populate after a grantee is selected. Activity Title populates after a project, responsible organization, or activity type is selected.</p>
            <div class="form-grid">${filterFields}
              <div class="form-field"><label for="p${number}-geo-level">Geographic level</label><select id="p${number}-geo-level">${geographyLevels}</select></div>
              <div class="form-field"><label for="p${number}-geo-scope">Geographic scope</label><select id="p${number}-geo-scope"><option value="-1">All mapped geographies</option></select></div>
            </div>
            <fieldset class="metric-fieldset"><legend class="field-label">Financial metrics shown in the funding plot</legend><div id="p${number}-metric-grid" class="metric-grid">${metricCheckboxes}</div></fieldset>
            <div class="form-grid" style="margin-top:10px">
              <div class="form-field"><label for="p${number}-map-metric">Single metric used to color the map</label><select id="p${number}-map-metric">${mapMetrics}</select></div>
              <div class="form-field"><label for="p${number}-plot-basis">Funding plot basis</label><select id="p${number}-plot-basis"><option value="cumulative">Cumulative</option><option value="quarterly">Quarterly</option></select></div>
            </div>
          </div>
        </details>

        <div id="p${number}-kpis" class="kpi-grid"></div>
        <div id="p${number}-status" class="analysis-note"></div>

        <div class="plot-card map-card"><div id="p${number}-map-loading" class="plot-loading">Preparing map…</div><div id="p${number}-map" class="plot-target" aria-label="Panel ${number} geographic distribution"></div></div>
        <div class="plot-card"><div id="p${number}-timeline-loading" class="plot-loading">Preparing funding plot…</div><div id="p${number}-timeline" class="plot-target" aria-label="Panel ${number} funding timeline"></div></div>

        <div class="download-row">
          <button id="p${number}-download-csv" class="action-button primary" type="button">Download aggregate CSV</button>
          <button id="p${number}-download-map" class="action-button" type="button">Download map PNG</button>
          <button id="p${number}-download-timeline" class="action-button" type="button">Download funding plot PNG</button>
        </div>
      </article>`;
  }

  function buildPanel(number) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = panelMarkup(number).trim();
    const root = wrapper.firstElementChild;
    panelGrid.appendChild(root);

    const state = {
      filters: Array(FILTERS.length).fill(-1),
      geographyLevel: DD.geographyLevels[0].key,
      geographyValue: -1,
      selectedMetrics: [...defaultMetrics],
      mapMetric: 0,
      plotBasis: "cumulative",
    };
    const elements = {
      root,
      filterSelects: [...root.querySelectorAll("select[data-filter-index]")],
      geographyLevel: root.querySelector(`#p${number}-geo-level`),
      geographyScope: root.querySelector(`#p${number}-geo-scope`),
      metricGrid: root.querySelector(`#p${number}-metric-grid`),
      mapMetric: root.querySelector(`#p${number}-map-metric`),
      plotBasis: root.querySelector(`#p${number}-plot-basis`),
      kpis: root.querySelector(`#p${number}-kpis`),
      status: root.querySelector(`#p${number}-status`),
      map: root.querySelector(`#p${number}-map`),
      mapLoading: root.querySelector(`#p${number}-map-loading`),
      timeline: root.querySelector(`#p${number}-timeline`),
      timelineLoading: root.querySelector(`#p${number}-timeline-loading`),
      downloadCsv: root.querySelector(`#p${number}-download-csv`),
      downloadMap: root.querySelector(`#p${number}-download-map`),
      downloadTimeline: root.querySelector(`#p${number}-download-timeline`),
    };
    const panel = { number, state, elements, renderToken: 0, lastResult: null };

    elements.filterSelects.forEach((select, index) => {
      select.addEventListener("change", async () => {
        state.filters[index] = Number(select.value);
        for (let lower = index + 1; lower < state.filters.length; lower += 1) state.filters[lower] = -1;
        state.geographyValue = -1;
        await updateHierarchy(panel);
      });
    });

    elements.geographyLevel.addEventListener("change", async () => {
      state.geographyLevel = elements.geographyLevel.value;
      state.geographyValue = -1;
      updateGeographyChoices(panel, rowsAfterAllFilters(state));
      await renderPanel(panel);
    });

    elements.geographyScope.addEventListener("change", async () => {
      state.geographyValue = Number(elements.geographyScope.value);
      await renderPanel(panel);
    });

    elements.metricGrid.addEventListener("change", async () => {
      state.selectedMetrics = [...elements.metricGrid.querySelectorAll('input[type="checkbox"]:checked')].map((input) => Number(input.value));
      await renderPanel(panel);
    });

    elements.mapMetric.addEventListener("change", async () => {
      state.mapMetric = Number(elements.mapMetric.value);
      await renderPanel(panel);
    });

    elements.plotBasis.addEventListener("change", async () => {
      state.plotBasis = elements.plotBasis.value;
      await renderPanel(panel);
    });

    elements.downloadCsv.addEventListener("click", () => downloadAggregateCsv(panel));
    elements.downloadMap.addEventListener("click", () => downloadPlotImage(panel, "map"));
    elements.downloadTimeline.addEventListener("click", () => downloadPlotImage(panel, "timeline"));

    panels.push(panel);
    return panel;
  }

  function baseRowMatches(row, state) {
    return rowMatchesFilters(row, state.filters);
  }

  function rowsAfterAllFilters(state) {
    const rows = [];
    for (const row of ROWS) if (baseRowMatches(row, state)) rows.push(row);
    return rows;
  }

  async function updateHierarchy(panel) {
    const { state, elements } = panel;
    let running = [...ROWS];

    for (let index = 0; index < FILTERS.length; index += 1) {
      const granteeSelected = state.filters[2] >= 0;
      const activityContextSelected = state.filters[3] >= 0 || state.filters[4] >= 0 || state.filters[5] >= 0;
      const gated = (index >= 3 && index <= 5 && !granteeSelected) || (index === 6 && !activityContextSelected);
      if (gated) {
        state.filters[index] = -1;
        setSelectOptions(elements.filterSelects[index], [], dictionaryForFilter(index), -1);
        elements.filterSelects[index].disabled = true;
        continue;
      }
      elements.filterSelects[index].disabled = false;
      const available = new Set();
      for (const row of running) {
        const code = row[index];
        if (code >= 0) available.add(code);
      }
      const choices = choiceSort(available, dictionaryForFilter(index), index === 0);
      if (state.filters[index] >= 0 && !available.has(state.filters[index])) state.filters[index] = -1;
      setSelectOptions(elements.filterSelects[index], choices, dictionaryForFilter(index), state.filters[index]);
      if (state.filters[index] >= 0) {
        const selected = state.filters[index];
        running = running.filter((row) => row[index] === selected);
      }
    }

    updateGeographyChoices(panel, running);
    await renderPanel(panel);
  }

  function updateGeographyChoices(panel, filteredRows) {
    const { state, elements } = panel;
    const level = levelInfo(state.geographyLevel);
    const labels = geographyInfo(level.key).names;
    const available = new Set();
    for (const row of filteredRows) {
      const code = row[level.column];
      if (code >= 0) available.add(code);
    }
    if (state.geographyValue >= 0 && !available.has(state.geographyValue)) state.geographyValue = -1;
    const choices = choiceSort(available, labels);
    setSelectOptions(elements.geographyScope, choices, labels, state.geographyValue, "All mapped geographies");
  }

  function computeResult(state) {
    const level = levelInfo(state.geographyLevel);
    const indices = [];
    let preGeographyRecords = 0;
    let mappedRecords = 0;
    for (let index = 0; index < ROWS.length; index += 1) {
      const row = ROWS[index];
      if (!baseRowMatches(row, state)) continue;
      preGeographyRecords += 1;
      const geographyCode = row[level.column];
      if (geographyCode < 0) continue;
      mappedRecords += 1;
      if (state.geographyValue >= 0 && geographyCode !== state.geographyValue) continue;
      indices.push(index);
    }
    return {
      level,
      indices,
      preGeographyRecords,
      mappedRecords,
      mappingCoverage: preGeographyRecords ? mappedRecords / preGeographyRecords : 0,
    };
  }

  async function renderPanel(panel) {
    const token = ++panel.renderToken;
    const result = computeResult(panel.state);
    panel.lastResult = result;
    renderKpis(panel, result);
    renderStatus(panel, result);
    panel.elements.mapLoading.hidden = false;
    panel.elements.timelineLoading.hidden = false;
    const mapPromise = renderMap(panel, result, token).catch((error) => {
      if (token === panel.renderToken) showPlotError(panel.elements.map, "Geographic distribution", error.message);
      throw error;
    }).finally(() => { if (token === panel.renderToken) panel.elements.mapLoading.hidden = true; });
    const timelinePromise = renderTimeline(panel, result, token).catch((error) => {
      if (token === panel.renderToken) showPlotError(panel.elements.timeline, "Funding over time", error.message);
      throw error;
    }).finally(() => { if (token === panel.renderToken) panel.elements.timelineLoading.hidden = true; });
    await Promise.allSettled([mapPromise, timelinePromise]);
  }

  function renderKpis(panel, result) {
    const frame = result.indices;
    const grants = new Set();
    const projects = new Set();
    const activities = new Set();
    let metricTotal = 0;
    for (const rowIndex of frame) {
      const row = ROWS[rowIndex];
      grants.add(row[C.grantCode]);
      projects.add(row[C.project]);
      activities.add(row[C.activityCode]);
      metricTotal += row[C.metricStart + panel.state.mapMetric] || 0;
    }
    const mappingNote = result.level.inferred
      ? `${formatInteger.format(result.mappedRecords)} of ${formatInteger.format(result.preGeographyRecords)} pre-geography rows mapped`
      : "Direct state assignment";
    const cards = [
      ["Displayed records", formatInteger.format(frame.length), result.level.displayLabel],
      ["Unique grants", formatInteger.format(grants.size), "Distinct HUD grants"],
      ["Unique projects", formatInteger.format(projects.size), "Project titles"],
      ["Unique activities", formatInteger.format(activities.size), "Grant + activity number"],
      ["Net selected metric", formatCurrencyCompact(metricTotal), METRICS[panel.state.mapMetric].label],
      ["Mapping coverage", formatPercent.format(result.mappingCoverage), mappingNote],
    ];
    panel.elements.kpis.innerHTML = cards.map(([label, value, note]) => (
      `<div class="kpi-card"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value" title="${escapeHtml(value)}">${escapeHtml(value)}</div><div class="kpi-note">${escapeHtml(note)}</div></div>`
    )).join("");
  }

  function renderStatus(panel, result) {
    const level = result.level;
    let methodText = "";
    if (level.methodColumn !== null && level.methodColumn !== undefined && result.indices.length) {
      const counts = new Map();
      for (const rowIndex of result.indices) {
        const label = methodLabel(level, ROWS[rowIndex]);
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      if (top.length) methodText = ` Match methods in displayed data: ${top.map(([name, count]) => `${name}: ${formatInteger.format(count)}`).join("; ")}.`;
    }
    const scope = geographyLabel(level.key, panel.state.geographyValue);
    panel.elements.status.innerHTML = `<strong>Analysis scope:</strong> ${escapeHtml(level.label)}; ${escapeHtml(scope)}. ${escapeHtml(geographyInterpretation(level) + methodText)}`;
  }

  async function renderTimeline(panel, result, token) {
    const metrics = [...new Set(panel.state.selectedMetrics)].filter((index) => index >= 0 && index < METRICS.length);
    if (!metrics.length) {
      await emptyPlot(panel.elements.timeline, "Funding over time", "Select at least one financial metric.", 455);
      return;
    }
    if (!result.indices.length) {
      await emptyPlot(panel.elements.timeline, "Funding over time", "No mapped records match the current selections.", 455);
      return;
    }

    const sums = metrics.map(() => Array(DD.quarters.length).fill(0));
    const counts = Array(DD.quarters.length).fill(0);
    for (const rowIndex of result.indices) {
      const row = ROWS[rowIndex];
      const quarter = row[C.quarter];
      counts[quarter] += 1;
      metrics.forEach((metric, metricPosition) => {
        sums[metricPosition][quarter] += row[C.metricStart + metric] || 0;
      });
    }
    const activeQuarters = counts.map((count, index) => count ? index : -1).filter((index) => index >= 0);
    if (!activeQuarters.length) {
      await emptyPlot(panel.elements.timeline, "Funding over time", "No quarter-level values are available.", 455);
      return;
    }
    if (panel.state.plotBasis === "cumulative") {
      for (const metricSums of sums) {
        let running = 0;
        for (let quarter = 0; quarter < metricSums.length; quarter += 1) {
          running += metricSums[quarter];
          metricSums[quarter] = running;
        }
      }
    }
    const x = activeQuarters.map((quarter) => DD.quarters[quarter]);
    const traces = metrics.map((metric, metricPosition) => ({
      type: "scatter",
      mode: "lines+markers",
      name: METRICS[metric].label,
      x,
      y: activeQuarters.map((quarter) => sums[metricPosition][quarter]),
      line: { width: 2.4 },
      marker: { size: 6 },
      hovertemplate: `<b>${escapeHtml(METRICS[metric].label)}</b><br>%{x}<br>$%{y:,.0f}<extra></extra>`,
    }));
    const basis = panel.state.plotBasis === "cumulative" ? "Cumulative net amount" : "Quarterly net amount";
    const layout = {
      title: { text: `Panel ${panel.number}: ${basis} by QPR quarter`, x: 0.02, xanchor: "left", font: { size: 16 } },
      height: 455,
      margin: { l: 72, r: 20, t: 65, b: 88 },
      paper_bgcolor: "white",
      plot_bgcolor: "white",
      hovermode: "x unified",
      legend: { title: { text: "Metric" }, orientation: "h", y: -0.25, x: 0 },
      xaxis: { title: "QPR quarter", tickangle: -45, showgrid: false, categoryorder: "array", categoryarray: x },
      yaxis: { title: `${basis} (USD)`, tickprefix: "$", tickformat: ",.2s", gridcolor: "#e2e8f0", zeroline: true, zerolinecolor: "#94a3b8", zerolinewidth: 1 },
      font: { family: "Inter, Arial, sans-serif", color: "#0f172a", size: 11 },
    };
    if (token !== panel.renderToken) return;
    await Plotly.react(panel.elements.timeline, traces, layout, plotConfig(`panel_${panel.number}_funding_timeline`));
  }

  function aggregateMap(panel, result) {
    const grouped = new Map();
    const metricColumn = C.metricStart + panel.state.mapMetric;
    for (const rowIndex of result.indices) {
      const row = ROWS[rowIndex];
      const geographyCode = row[result.level.column];
      let group = grouped.get(geographyCode);
      if (!group) {
        group = { geographyCode, amount: 0, records: 0, grants: new Set(), projects: new Set(), activities: new Set() };
        grouped.set(geographyCode, group);
      }
      group.amount += row[metricColumn] || 0;
      group.records += 1;
      group.grants.add(row[C.grantCode]);
      group.projects.add(row[C.project]);
      group.activities.add(row[C.activityCode]);
    }
    return [...grouped.values()].sort((a, b) => b.amount - a.amount);
  }

  async function renderMap(panel, result, token) {
    if (!result.indices.length) {
      await emptyPlot(panel.elements.map, "Geographic distribution", "No mapped records match the current selections.", 510);
      return;
    }
    const grouped = aggregateMap(panel, result);
    if (!grouped.length) {
      await emptyPlot(panel.elements.map, "Geographic distribution", "No geography could be aggregated.", 510);
      return;
    }
    if (!hasWebGLSupport()) {
      await emptyPlot(panel.elements.map, "Geographic distribution", "The interactive map requires WebGL. Open the site in a current Chrome, Edge, Firefox, or Safari browser and enable hardware acceleration.", 510);
      return;
    }
    const level = result.level;
    const geo = geographyInfo(level.key);
    const metric = METRICS[panel.state.mapMetric].label;
    const values = grouped.map((group) => group.amount);
    const color = colorSettings(values);
    const customdata = grouped.map((group) => [
      geo.names[group.geographyCode] ?? "Unknown",
      group.records,
      group.grants.size,
      group.projects.size,
      group.activities.size,
      group.geographyCode,
    ]);
    const hover = `<b>%{customdata[0]}</b><br>${escapeHtml(metric)}: $%{z:,.0f}<br>Records: %{customdata[1]:,}<br>Grants: %{customdata[2]:,}<br>Projects: %{customdata[3]:,}<br>Activities: %{customdata[4]:,}<extra></extra>`;
    let traces;
    let mapView;

    if (level.mapType === "point") {
      const absolute = values.map((value) => Math.abs(value));
      const maximum = Math.max(...absolute, 0);
      const sizes = absolute.map((value) => maximum <= 0 ? 10 : 9 + 28 * Math.sqrt(value / maximum));
      traces = [{
        type: "scattermap",
        mode: "markers",
        lat: grouped.map((group) => geo.lat[group.geographyCode]),
        lon: grouped.map((group) => geo.lon[group.geographyCode]),
        text: grouped.map((group) => geo.names[group.geographyCode]),
        customdata,
        marker: {
          size: sizes,
          color: values,
          colorscale: color.colorscale,
          cmin: color.cmin,
          cmax: color.cmax,
          cmid: color.cmid,
          showscale: true,
          opacity: 0.82,
          line: { color: "rgba(255,255,255,.8)", width: 0.5 },
          colorbar: { title: { text: "USD" }, tickprefix: "$", tickformat: ",.2s", thickness: 14 },
        },
        hovertemplate: hover.replaceAll("%{z", "%{marker.color"),
      }];
      mapView = mapViewFromPoints(
        grouped.map((group) => geo.lat[group.geographyCode]),
        grouped.map((group) => geo.lon[group.geographyCode]),
      );
    } else {
      const geojson = await ensureGeojson(level.key);
      if (token !== panel.renderToken) return;
      if (!geojson) {
        await emptyPlot(panel.elements.map, "Geographic distribution", "The boundary file is unavailable.", 510);
        return;
      }
      traces = [{
        type: "choroplethmap",
        geojson,
        featureidkey: "properties.id",
        locations: grouped.map((group) => geo.ids[group.geographyCode]),
        z: values,
        customdata,
        colorscale: color.colorscale,
        zmin: color.cmin,
        zmax: color.cmax,
        zmid: color.cmid,
        marker: { line: { color: "rgba(255,255,255,.75)", width: 0.5 } },
        colorbar: { title: { text: "USD" }, tickprefix: "$", tickformat: ",.2s", thickness: 14 },
        hovertemplate: hover,
      }];
      mapView = mapViewFromPolygonGeojson(geojson, new Set(grouped.map((group) => String(geo.ids[group.geographyCode]))));
    }

    const layout = {
      title: { text: `Panel ${panel.number}: ${metric} by ${level.displayLabel}`, x: 0.02, xanchor: "left", font: { size: 16 } },
      height: 510,
      margin: { l: 0, r: 0, t: 60, b: 0 },
      paper_bgcolor: "white",
      map: { style: "white-bg", center: mapView.center, zoom: mapView.zoom },
      font: { family: "Inter, Arial, sans-serif", color: "#0f172a", size: 11 },
      uirevision: `${level.key}-${panel.state.geographyValue}`,
    };
    if (token !== panel.renderToken) return;
    await Plotly.react(panel.elements.map, traces, layout, plotConfig(`panel_${panel.number}_${level.key}_map`));
    if (typeof panel.elements.map.removeAllListeners === "function") panel.elements.map.removeAllListeners("plotly_click");
    if (typeof panel.elements.map.on === "function") {
      panel.elements.map.on("plotly_click", async (event) => {
        const point = event?.points?.[0];
        const code = Number(point?.customdata?.[5]);
        if (!Number.isInteger(code) || code < 0) return;
        panel.state.geographyValue = code;
        panel.elements.geographyScope.value = String(code);
        await renderPanel(panel);
      });
    }
  }

  function selectionContext(panel) {
    const context = {};
    FILTERS.forEach((filter, index) => { context[filter.label] = filterLabel(index, panel.state.filters[index]); });
    context["Geography level"] = levelInfo(panel.state.geographyLevel).label;
    context["Geography scope"] = geographyLabel(panel.state.geographyLevel, panel.state.geographyValue);
    context["Map metric"] = METRICS[panel.state.mapMetric].label;
    context["Plot basis"] = panel.state.plotBasis === "cumulative" ? "Cumulative" : "Quarterly";
    return context;
  }

  function downloadAggregateCsv(panel) {
    const button = panel.elements.downloadCsv;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Building CSV…";
    try {
      const result = panel.lastResult || computeResult(panel.state);
      const metrics = [...new Set([...panel.state.selectedMetrics, panel.state.mapMetric])].filter((index) => index >= 0 && index < METRICS.length);
      const groups = new Map();
      for (const rowIndex of result.indices) {
        const row = ROWS[rowIndex];
        const quarter = row[C.quarter];
        const geographyCode = row[result.level.column];
        const key = `${geographyCode}|${quarter}`;
        let group = groups.get(key);
        if (!group) {
          group = { geographyCode, quarter, records: 0, grants: new Set(), projects: new Set(), activities: new Set(), amounts: metrics.map(() => 0) };
          groups.set(key, group);
        }
        group.records += 1;
        group.grants.add(row[C.grantCode]);
        group.projects.add(row[C.project]);
        group.activities.add(row[C.activityCode]);
        metrics.forEach((metric, position) => { group.amounts[position] += row[C.metricStart + metric] || 0; });
      }
      const groupsSorted = [...groups.values()].sort((a, b) => a.geographyCode - b.geographyCode || a.quarter - b.quarter);
      const context = selectionContext(panel);
      const contextHeaders = Object.keys(context);
      const headers = [
        "Panel", "QPR Actual Quarter", "Geography Level", "Geography ID", "Geography Name",
        "Record Count", "Unique Grants", "Unique Projects", "Unique Activities",
        ...metrics.flatMap((metric) => [`${METRICS[metric].label} - Quarterly net`, `${METRICS[metric].label} - Cumulative net`]),
        ...contextHeaders.map((name) => `Selection - ${name}`),
      ];
      const cumulative = new Map();
      const output = [headers.map(csvEscape).join(",")];
      const geo = geographyInfo(result.level.key);
      for (const group of groupsSorted) {
        if (!cumulative.has(group.geographyCode)) cumulative.set(group.geographyCode, metrics.map(() => 0));
        const running = cumulative.get(group.geographyCode);
        group.amounts.forEach((amount, position) => { running[position] += amount; });
        const values = [
          `Panel ${panel.number}`,
          DD.quarters[group.quarter],
          result.level.label,
          geo.ids[group.geographyCode],
          geo.names[group.geographyCode],
          group.records,
          group.grants.size,
          group.projects.size,
          group.activities.size,
          ...group.amounts.flatMap((amount, position) => [amount.toFixed(2), running[position].toFixed(2)]),
          ...contextHeaders.map((name) => context[name]),
        ];
        output.push(values.map(csvEscape).join(","));
      }
      if (!groupsSorted.length) {
        output.push([`Panel ${panel.number}`, "", result.level.label, "", "No mapped records match the current selection", 0, 0, 0, 0, ...metrics.flatMap(() => ["0.00", "0.00"]), ...contextHeaders.map((name) => context[name])].map(csvEscape).join(","));
      }
      const notes = [
        "", "Methodology Notes",
        "Financial values are source-quarter transactions. Cumulative values are chronological cumulative net sums and may decline after reversals, corrections, or deobligations.",
        DD.metadata.geography_note || "",
        "This export is aggregate only and contains no raw financial rows.",
      ];
      output.push("", ...notes.map((line) => csvEscape(line)));
      const blob = new Blob(["\ufeff", output.join("\r\n")], { type: "text/csv;charset=utf-8" });
      downloadBlob(blob, `cdbg_dr_panel_${panel.number}_aggregate_${timestampForFilename()}.csv`);
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function downloadPlotImage(panel, kind) {
    const button = kind === "map" ? panel.elements.downloadMap : panel.elements.downloadTimeline;
    const div = kind === "map" ? panel.elements.map : panel.elements.timeline;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing PNG…";
    try {
      const level = levelInfo(panel.state.geographyLevel);
      const stem = kind === "map"
        ? `cdbg_dr_panel_${panel.number}_${safeFilename(level.key)}_map_${timestampForFilename()}`
        : `cdbg_dr_panel_${panel.number}_funding_timeline_${timestampForFilename()}`;
      await Plotly.downloadImage(div, { format: "png", filename: stem, width: 1800, height: kind === "map" ? 1100 : 950, scale: 1 });
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function ensureExplorePanels() {
    if (exploreInitialized) return;
    exploreInitialized = true;
    const panelOne = buildPanel(1);
    const panelTwo = buildPanel(2);
    await updateHierarchy(panelOne);
    await updateHierarchy(panelTwo);
  }

  async function switchMode(mode) {
    const quickTab = document.getElementById("mode-tab-quick");
    const exploreTab = document.getElementById("mode-tab-explore");
    const quickActive = mode === "quick";
    quickReportView.hidden = !quickActive;
    exploreView.hidden = quickActive;
    quickTab.classList.toggle("active", quickActive);
    exploreTab.classList.toggle("active", !quickActive);
    quickTab.setAttribute("aria-selected", String(quickActive));
    exploreTab.setAttribute("aria-selected", String(!quickActive));
    if (!quickActive) await ensureExplorePanels();
    if (quickActive && quick.elements.reportPlot?.data) window.setTimeout(() => Plotly.Plots.resize(quick.elements.reportPlot), 50);
  }

  function setupModeTabs() {
    document.getElementById("mode-tab-quick").addEventListener("click", () => switchMode("quick").catch(showError));
    document.getElementById("mode-tab-explore").addEventListener("click", () => switchMode("explore").catch(showError));
  }

  function renderHeader() {
    const metadata = DD.metadata;
    const badges = [
      `${formatInteger.format(metadata.dashboard_finance_rows)} quarter-level financial records`,
      `${formatInteger.format(metadata.unique_grants)} HUD grants`,
      `${formatInteger.format(metadata.unique_activities)} activities`,
      `State coverage ${Number(metadata.state_mapping_coverage_pct).toFixed(1)}%`,
      `Enhanced county coverage ${Number(metadata.county_enhanced_row_coverage_pct).toFixed(1)}%`,
      `Matched city/place coverage ${Number(metadata.city_matched_row_coverage_pct).toFixed(1)}%`,
      `Urban-area coverage ${Number(metadata.urban_area_row_coverage_pct).toFixed(1)}%`,
      `${metadata.quarter_min}–${metadata.quarter_max}`,
    ];
    document.getElementById("data-badges").innerHTML = badges.map((badge) => `<span class="data-badge">${escapeHtml(badge)}</span>`).join("");
    const generated = metadata.generated_at_utc ? new Date(metadata.generated_at_utc).toLocaleString() : "unknown date";
    document.getElementById("build-stamp").textContent = `Processed-data build: ${generated}`;
  }

  async function initialize() {
    try {
      setLoading("Loading compact financial data…", 7);
      const files = DD.rowChunkFiles || [];
      for (let index = 0; index < files.length; index += 1) {
        await loadScriptOnce(files[index]);
        setLoading(`Loading financial data ${index + 1} of ${files.length}…`, 7 + ((index + 1) / Math.max(files.length, 1)) * 62);
      }
      for (const chunk of DD.rowChunks) ROWS.push(...chunk);
      DD.rowChunks.length = 0;
      if (!ROWS.length) throw new Error("No financial rows were loaded from data/rows.");

      setLoading("Creating the Quick Report decision tool…", 74);
      renderHeader();
      setupModeTabs();
      await setupQuickReport();
      app.hidden = false;

      setLoading("Preparing default report controls…", 90);
      await switchMode("quick");

      setLoading("Dashboard ready", 100);
      window.setTimeout(() => { loadingScreen.hidden = true; }, 220);
    } catch (error) {
      showError(error);
      loadingScreen.hidden = true;
      app.hidden = false;
    }
  }

  initialize();
})();
