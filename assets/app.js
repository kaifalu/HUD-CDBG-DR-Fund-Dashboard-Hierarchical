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
  const narrativeCache = new Map();
  const narrativeYearsLoaded = new Set();
  const defaultMetrics = [0, 1, 2];
  const formatInteger = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const formatPercent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadScriptOnce(source) {
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
            <label class="checkbox-line"><input id="p${number}-narrative-only" type="checkbox"><span><strong>Only show records with nonempty narratives</strong><br>Uses the exact Grant + Activity Number + QPR quarter link prepared in the source workflow.</span></label>
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

        <details id="p${number}-narrative-details" class="narrative-details">
          <summary>Linked narrative records</summary>
          <div class="narrative-body"><p id="p${number}-narrative-status" class="narrative-status">Open this section to load the most recent linked narrative excerpts.</p><div id="p${number}-narrative-table" class="table-scroll"></div></div>
        </details>
      </article>`;
  }

  function buildPanel(number) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = panelMarkup(number).trim();
    const root = wrapper.firstElementChild;
    panelGrid.appendChild(root);

    const state = {
      filters: Array(FILTERS.length).fill(-1),
      narrativeOnly: false,
      geographyLevel: DD.geographyLevels[0].key,
      geographyValue: -1,
      selectedMetrics: [...defaultMetrics],
      mapMetric: 0,
      plotBasis: "cumulative",
    };
    const elements = {
      root,
      filterSelects: [...root.querySelectorAll("select[data-filter-index]")],
      narrativeOnly: root.querySelector(`#p${number}-narrative-only`),
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
      narrativeDetails: root.querySelector(`#p${number}-narrative-details`),
      narrativeStatus: root.querySelector(`#p${number}-narrative-status`),
      narrativeTable: root.querySelector(`#p${number}-narrative-table`),
    };
    const panel = { number, state, elements, renderToken: 0, lastResult: null, narrativeToken: 0 };

    elements.narrativeOnly.addEventListener("change", async () => {
      state.narrativeOnly = elements.narrativeOnly.checked;
      state.filters.fill(-1);
      state.geographyValue = -1;
      await updateHierarchy(panel, "narrative");
    });

    elements.filterSelects.forEach((select, index) => {
      select.addEventListener("change", async () => {
        state.filters[index] = Number(select.value);
        for (let lower = index + 1; lower < state.filters.length; lower += 1) state.filters[lower] = -1;
        state.geographyValue = -1;
        await updateHierarchy(panel, index);
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

    elements.narrativeDetails.addEventListener("toggle", () => {
      if (elements.narrativeDetails.open) renderNarratives(panel).catch(showError);
    });

    elements.downloadCsv.addEventListener("click", () => downloadAggregateCsv(panel));
    elements.downloadMap.addEventListener("click", () => downloadPlotImage(panel, "map"));
    elements.downloadTimeline.addEventListener("click", () => downloadPlotImage(panel, "timeline"));

    panels.push(panel);
    return panel;
  }

  function baseRowMatches(row, state) {
    if (state.narrativeOnly && row[C.hasNarrative] !== 1) return false;
    for (let index = 0; index < FILTERS.length; index += 1) {
      const selected = state.filters[index];
      if (selected >= 0 && row[index] !== selected) return false;
    }
    return true;
  }

  function rowsAfterAllFilters(state) {
    const rows = [];
    for (const row of ROWS) if (baseRowMatches(row, state)) rows.push(row);
    return rows;
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

  async function updateHierarchy(panel) {
    const { state, elements } = panel;
    let running = [];
    for (const row of ROWS) {
      if (!state.narrativeOnly || row[C.hasNarrative] === 1) running.push(row);
    }

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
    if (token !== panel.renderToken) return;
    if (panel.elements.narrativeDetails.open) await renderNarratives(panel);
  }

  function renderKpis(panel, result) {
    const frame = result.indices;
    const grants = new Set();
    const activities = new Set();
    let narrativeCount = 0;
    let metricTotal = 0;
    for (const rowIndex of frame) {
      const row = ROWS[rowIndex];
      grants.add(row[C.grantCode]);
      activities.add(row[C.activityCode]);
      narrativeCount += row[C.hasNarrative] === 1 ? 1 : 0;
      metricTotal += row[C.metricStart + panel.state.mapMetric] || 0;
    }
    const narrativeShare = frame.length ? narrativeCount / frame.length : 0;
    const mappingNote = result.level.inferred
      ? `${formatInteger.format(result.mappedRecords)} of ${formatInteger.format(result.preGeographyRecords)} pre-geography rows mapped`
      : "Direct state assignment";
    const cards = [
      ["Displayed records", formatInteger.format(frame.length), result.level.displayLabel],
      ["Unique grants", formatInteger.format(grants.size), "Distinct HUD grants"],
      ["Unique activities", formatInteger.format(activities.size), "Grant + activity number"],
      ["Net selected metric", formatCurrencyCompact(metricTotal), METRICS[panel.state.mapMetric].label],
      ["Narrative-linked", formatPercent.format(narrativeShare), "Exact-key nonempty narrative"],
      ["Mapping coverage", formatPercent.format(result.mappingCoverage), mappingNote],
    ];
    panel.elements.kpis.innerHTML = cards.map(([label, value, note]) => (
      `<div class="kpi-card"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value" title="${escapeHtml(value)}">${escapeHtml(value)}</div><div class="kpi-note">${escapeHtml(note)}</div></div>`
    )).join("");
  }

  function renderStatus(panel, result) {
    const level = result.level;
    let interpretation;
    if (level.key === "city") {
      interpretation = "City/place symbols are matched gazetteer points, not municipal boundary polygons. County values derived from a city use that place’s listed primary county.";
    } else if (level.key === "county") {
      interpretation = "County coverage combines direct county text and city-derived primary counties; unmatched rows are excluded from the mapped analysis.";
    } else if (level.key === "urban") {
      interpretation = "Urban areas are secondary Census statistical geographies linked through matched city points or conservative locality text.";
    } else {
      interpretation = "State geography is assigned directly from Grantee State and covers all dashboard finance rows.";
    }

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
    panel.elements.status.innerHTML = `<strong>Analysis scope:</strong> ${escapeHtml(level.label)}; ${escapeHtml(scope)}. ${escapeHtml(interpretation + methodText)}`;
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

  function plotConfig(filename) {
    return {
      responsive: true,
      displaylogo: false,
      scrollZoom: true,
      modeBarButtonsToRemove: ["lasso2d", "select2d"],
      toImageButtonOptions: { format: "png", filename, width: 1600, height: 950, scale: 1 },
    };
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

  function aggregateMap(panel, result) {
    const grouped = new Map();
    const metricColumn = C.metricStart + panel.state.mapMetric;
    for (const rowIndex of result.indices) {
      const row = ROWS[rowIndex];
      const geographyCode = row[result.level.column];
      let group = grouped.get(geographyCode);
      if (!group) {
        group = { geographyCode, amount: 0, records: 0, narrativeRecords: 0, grants: new Set(), projects: new Set(), activities: new Set() };
        grouped.set(geographyCode, group);
      }
      group.amount += row[metricColumn] || 0;
      group.records += 1;
      group.narrativeRecords += row[C.hasNarrative] === 1 ? 1 : 0;
      group.grants.add(row[C.grantCode]);
      group.projects.add(row[C.project]);
      group.activities.add(row[C.activityCode]);
    }
    return [...grouped.values()].sort((a, b) => b.amount - a.amount);
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
      await emptyPlot(
        panel.elements.map,
        "Geographic distribution",
        "The interactive map requires WebGL. Open the site in a current Chrome, Edge, Firefox, or Safari browser and enable hardware acceleration.",
        510,
      );
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
      group.records ? group.narrativeRecords / group.records : 0,
      group.geographyCode,
    ]);
    const hover = `<b>%{customdata[0]}</b><br>${escapeHtml(metric)}: $%{z:,.0f}<br>Records: %{customdata[1]:,}<br>Grants: %{customdata[2]:,}<br>Projects: %{customdata[3]:,}<br>Activities: %{customdata[4]:,}<br>Narrative-linked: %{customdata[5]:.1%}<extra></extra>`;
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
        const code = Number(point?.customdata?.[6]);
        if (!Number.isInteger(code) || code < 0) return;
        panel.state.geographyValue = code;
        panel.elements.geographyScope.value = String(code);
        await renderPanel(panel);
      });
    }
  }

  async function ensureNarrativeYears(years) {
    const needed = [...new Set(years)].filter((year) => year && !narrativeYearsLoaded.has(year));
    for (const year of needed) {
      const entries = DD.narrativeManifest[year] || [];
      for (const entry of entries) {
        await loadScriptOnce(entry.file);
        const pairs = DD.narrativeChunks[entry.key] || [];
        for (const [id, text] of pairs) narrativeCache.set(Number(id), text);
        delete DD.narrativeChunks[entry.key];
      }
      narrativeYearsLoaded.add(year);
    }
  }

  async function renderNarratives(panel) {
    const token = ++panel.narrativeToken;
    const result = panel.lastResult || computeResult(panel.state);
    if (!result.indices.length) {
      panel.elements.narrativeStatus.textContent = "No narratives are available for the current mapped selection.";
      panel.elements.narrativeTable.replaceChildren();
      return;
    }
    const latestById = new Map();
    for (const rowIndex of result.indices) {
      const row = ROWS[rowIndex];
      const id = row[C.narrativeId];
      if (row[C.hasNarrative] !== 1 || id < 0) continue;
      const existing = latestById.get(id);
      if (!existing || row[C.quarter] > existing.quarter) latestById.set(id, { id, quarter: row[C.quarter], rowIndex });
    }
    const total = latestById.size;
    if (!total) {
      panel.elements.narrativeStatus.textContent = "No exact-key, nonempty narratives are linked to these records.";
      panel.elements.narrativeTable.replaceChildren();
      return;
    }
    const selected = [...latestById.values()].sort((a, b) => b.quarter - a.quarter || b.id - a.id).slice(0, 40);
    panel.elements.narrativeStatus.textContent = `Loading ${selected.length.toLocaleString()} recent narrative excerpts…`;
    const years = selected.map((item) => String(DD.quarters[item.quarter]).slice(0, 4));
    await ensureNarrativeYears(years);
    if (token !== panel.narrativeToken) return;

    const rows = selected.map((item) => {
      const row = ROWS[item.rowIndex];
      return {
        quarter: DD.quarters[row[C.quarter]],
        grantee: DD.filterDictionaries.grantees[row[C.grantee]] ?? "",
        title: row[C.activityTitle] >= 0 ? DD.filterDictionaries.activityTitles[row[C.activityTitle]] : "",
        type: row[C.activityType] >= 0 ? DD.filterDictionaries.activityTypes[row[C.activityType]] : "",
        text: narrativeCache.get(item.id) ?? "Narrative excerpt unavailable in the static index.",
      };
    });
    panel.elements.narrativeStatus.textContent = `Showing the ${rows.length.toLocaleString()} most recent narrative records out of ${total.toLocaleString()} linked records.`;
    panel.elements.narrativeTable.innerHTML = `<table class="narrative-table"><thead><tr><th>QPR quarter</th><th>Grantee</th><th>Activity title</th><th>Activity type</th><th>Narrative excerpt</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.quarter)}</td><td>${escapeHtml(row.grantee)}</td><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.text)}</td></tr>`).join("")}</tbody></table>`;
  }

  function csvEscape(value) {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function selectionContext(panel) {
    const context = {};
    FILTERS.forEach((filter, index) => { context[filter.label] = filterLabel(index, panel.state.filters[index]); });
    context["Only records with narratives"] = panel.state.narrativeOnly ? "Yes" : "No";
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
          group = { geographyCode, quarter, records: 0, narrativeRecords: 0, grants: new Set(), projects: new Set(), activities: new Set(), amounts: metrics.map(() => 0) };
          groups.set(key, group);
        }
        group.records += 1;
        group.narrativeRecords += row[C.hasNarrative] === 1 ? 1 : 0;
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
        "Record Count", "Unique Grants", "Unique Projects", "Unique Activities", "Narrative-linked Records",
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
          group.narrativeRecords,
          ...group.amounts.flatMap((amount, position) => [amount.toFixed(2), running[position].toFixed(2)]),
          ...contextHeaders.map((name) => context[name]),
        ];
        output.push(values.map(csvEscape).join(","));
      }
      if (!groupsSorted.length) {
        output.push([`Panel ${panel.number}`, "", result.level.label, "", "No mapped records match the current selection", 0, 0, 0, 0, 0, ...metrics.flatMap(() => ["0.00", "0.00"]), ...contextHeaders.map((name) => context[name])].map(csvEscape).join(","));
      }
      const notes = [
        "", "Methodology Notes",
        "Financial values are source-quarter transactions. Cumulative values are chronological cumulative net sums and may decline after reversals, corrections, or deobligations.",
        DD.metadata.geography_note || "",
        DD.metadata.narrative_join_note || "",
        "This export is aggregate only and contains no raw narrative text.",
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

  function renderHeader() {
    const metadata = DD.metadata;
    const badges = [
      `${formatInteger.format(metadata.dashboard_finance_rows)} quarter-level finance records`,
      `${formatInteger.format(metadata.finance_rows_with_narrative)} narrative-linked records`,
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
      setLoading("Loading compact finance data…", 7);
      const files = DD.rowChunkFiles || [];
      for (let index = 0; index < files.length; index += 1) {
        await loadScriptOnce(files[index]);
        setLoading(`Loading finance data ${index + 1} of ${files.length}…`, 7 + ((index + 1) / Math.max(files.length, 1)) * 62);
      }
      for (const chunk of DD.rowChunks) ROWS.push(...chunk);
      DD.rowChunks.length = 0;
      if (!ROWS.length) throw new Error("No finance rows were loaded from data/rows.");

      setLoading("Creating dashboard controls…", 73);
      renderHeader();
      const panelOne = buildPanel(1);
      const panelTwo = buildPanel(2);
      app.hidden = false;

      setLoading("Rendering Panel 1…", 80);
      await updateHierarchy(panelOne);
      setLoading("Rendering Panel 2…", 91);
      await updateHierarchy(panelTwo);

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
