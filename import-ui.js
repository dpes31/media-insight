/* Local-only report import and project settings. */
document.addEventListener("DOMContentLoaded", () => {
  const C = ImportCore;
  const bar = document.createElement("section");
  bar.className = "workbar";
  bar.innerHTML =
    '<div><strong>Media Insight</strong><p id="source-status">자료를 가져와 소재별 목표와 성과를 비교하세요.</p></div><div class="actions"><button id="import-open" class="primary">자료 가져오기</button><button id="settings-open">분석 기준</button></div>';
  document.querySelector("header")?.after(bar);
  if (!bar.isConnected) document.body.prepend(bar);
  const dialog = document.createElement("dialog");
  dialog.className = "report-dialog";
  document.body.append(dialog);
  let workbook,
    grid = [],
    mappings = [],
    preview,
    source = "붙여넣기";
  const el = (tag, text, attrs = {}) => {
    const node = document.createElement(tag);
    if (text !== null) node.textContent = text;
    Object.assign(node, attrs);
    return node;
  };
  function select(options, value) {
    const node = el("select", null);
    options.forEach(([v, label]) =>
      node.append(el("option", label, { value: v })),
    );
    node.value = value;
    return node;
  }
  function labeled(text, node) {
    const label = el("label", text);
    label.append(node);
    return label;
  }
  function button(text, handler, primary = false) {
    const node = el("button", text, {
      type: "button",
      className: primary ? "primary" : "",
    });
    node.onclick = handler;
    return node;
  }
  function resetDialog(title) {
    dialog.oninput = null;
    dialog.replaceChildren();
    const top = el("div", null, { className: "dialog-head" });
    top.append(
      el("h2", title),
      button("닫기", () => dialog.close()),
    );
    dialog.append(top);
    if (!dialog.open) dialog.showModal();
  }
  function message(text, error = false) {
    const node = el("p", text, { className: error ? "error" : "notice" });
    node.setAttribute("role", error ? "alert" : "status");
    return node;
  }
  function persist(next) {
    const previous = structuredClone(storageData);
    const proposed = structuredClone(storageData);
    proposed.projects[currentProject] = next;
    proposed.currentProject = currentProject;
    proposed.schemaVersion = 2;
    const raw = JSON.stringify(proposed);
    // Save a previous-format snapshot before committing the next state.
    try {
      if (!localStorage.getItem(DASHBOARD_STORAGE_KEY + ":backup"))
        localStorage.setItem(
          DASHBOARD_STORAGE_KEY + ":backup",
          localStorage.getItem(DASHBOARD_STORAGE_KEY) ||
            JSON.stringify(previous),
        );
      localStorage.setItem(DASHBOARD_STORAGE_KEY, raw);
    } catch {
      throw new Error(
        "저장 공간이 부족하거나 저장 권한이 없습니다. 이전 데이터가 유지됩니다.",
      );
    }
    storageData = proposed;
    validationData = proposed.projects[currentProject];
    isPrefillActive = false;
    renderDashboard();
    updateStatus();
  }
  function updateStatus() {
    const meta = validationData.importMeta;
    document.getElementById("source-status").textContent = meta
      ? currentProject +
        " · " +
        meta.period +
        " · " +
        meta.source +
        " · " +
        new Date(meta.at).toLocaleString("ko-KR") +
        " 반영"
      : currentProject + " · 자료를 가져와 소재별 목표와 성과를 비교하세요.";
  }
  document
    .getElementById("project-selector")
    ?.addEventListener("change", updateStatus);
  updateStatus();
  const results = document.getElementById("analysis-results");
  const comparison = document.getElementById("table-body").closest("table")
    .parentElement.parentElement;
  const overview = results.querySelector(".grid");
  const charts = document.createElement("details");
  charts.className = "chart-details";
  charts.append(el("summary", "분포와 운영 제안 보기"), overview);
  charts.addEventListener("toggle", () => {
    if (charts.open) renderChart(liveAnalysisData);
  });
  results.append(comparison, charts);
  const inputs = document.getElementById("validation-section");
  const manual = document.createElement("details");
  manual.className = "chart-details";
  manual.append(el("summary", "수기 입력·수정"), inputs);
  results.after(manual);
  const analyze = document.getElementById("run-analysis-button").parentElement;
  manual.append(analyze);
  const missing = el("p", null, { className: "notice", id: "missing-status" });
  results.prepend(missing);
  const originalRender = renderDashboard;
  renderDashboard = function () {
    originalRender();
    const rows = liveAnalysisData.data;
    missing.textContent =
      "전환 미입력 " +
      rows.filter((r) => r.conv === null).length +
      "행 · 매출 미입력 " +
      rows.filter((r) => r.revenue === null).length +
      "행 · 해당 전체 지표는 —로 표시합니다. 소재 행을 선택하면 판단 근거가 열립니다.";
    updateStatus();
  };
  renderDashboard();
  function table(headers, rows) {
    const wrap = el("div", null, { className: "preview-scroll" });
    const t = el("table", null),
      head = el("tr", null);
    headers.forEach((h) => head.append(el("th", h)));
    t.append(head);
    rows.forEach((row) => {
      const tr = el("tr", null);
      row.forEach((v) => tr.append(el("td", v ?? "—")));
      t.append(tr);
    });
    wrap.append(t);
    return wrap;
  }
  function openImport() {
    workbook = null;
    grid = [];
    mappings = [];
    preview = null;
    source = "붙여넣기";
    resetDialog("자료 가져오기");
    dialog.append(
      message(
        "엑셀 파일을 선택하거나 엑셀·구글시트의 셀 범위를 복사해 붙여넣으세요.",
      ),
    );
    const meta = el("div", null, { className: "form-grid" });
    const period = el("input", null, {
      type: "text",
      placeholder: "2026-11 또는 2026-11-01 ~ 2026-11-30",
      id: "import-period",
      value: validationData.importMeta?.period || "",
    });
    const kind = select(
      [
        ["actual", "실적 자료"],
        ["plan", "계획·미디어믹스"],
      ],
      "actual",
    );
    kind.id = "import-kind";
    const mode = select(
      [
        ["merge", "같은 기간 갱신·새 행 추가"],
        ["replace", "현재 프로젝트 실적 전체 교체"],
      ],
      "merge",
    );
    mode.id = "import-mode";
    const template = el("input", null, {
      placeholder: "업체명 또는 양식명",
      id: "template-name",
    });
    meta.append(
      labeled("대상 기간", period),
      labeled("자료 성격", kind),
      labeled("반영 방식 (실적)", mode),
      labeled("기억할 양식 이름", template),
    );
    dialog.append(meta);
    const file = el("input", null, {
      type: "file",
      accept: ".xlsx",
      id: "report-file",
    });
    const sheets = select([], "");
    sheets.id = "sheet-select";
    sheets.hidden = true;
    const paste = el("textarea", null, {
      id: "paste-table",
      placeholder: "제목 행을 포함해 붙여넣으세요.",
      rows: 5,
    });
    dialog.append(
      labeled("엑셀 파일 (.xlsx)", file),
      sheets,
      labeled("표 붙여넣기", paste),
    );
    const controls = el("div", null, { className: "form-grid" });
    const header = el("input", null, {
      type: "number",
      min: 1,
      value: "1",
      id: "header-row",
    });
    const start = el("input", null, {
      type: "number",
      min: 1,
      value: "2",
      id: "start-row",
    });
    const end = el("input", null, { type: "number", min: 1, id: "end-row" });
    const parent = el("input", null, {
      type: "number",
      min: 0,
      value: "0",
      id: "parent-row",
    });
    controls.append(
      labeled("제목 행 번호", header),
      labeled("데이터 시작 행", start),
      labeled("데이터 마지막 행", end),
      labeled("상위 제목 행 (없으면 0)", parent),
    );
    dialog.append(controls);
    const stage = el("div", null, { id: "import-stage" });
    const failure = el("div", null);
    const clearPreview = () => {
      preview = null;
      stage.replaceChildren();
      failure.replaceChildren();
    };
    [period, kind, mode, template, header, start, end, parent, paste].forEach(
      (n) => n.addEventListener("input", clearPreview),
    );
    function loadSheet() {
      const sheet = workbook.Sheets[sheets.value];
      if (
        Object.values(sheet).some(
          (cell) =>
            cell && typeof cell === "object" && cell.f && cell.v === undefined,
        )
      )
        throw new Error(
          "결과값이 없는 수식이 있습니다. 엑셀에서 계산 후 저장하거나 값만 붙여넣어 주세요.",
        );
      grid = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: true,
      });
      source = file.files[0].name + " / " + sheets.value;
      end.value = grid.length;
      clearPreview();
    }
    sheets.onchange = () => {
      try {
        loadSheet();
      } catch (error) {
        grid = [];
        clearPreview();
        failure.replaceChildren(message(error.message, true));
      }
    };
    file.onchange = async () => {
      clearPreview();
      try {
        if (!file.files[0]) return;
        if (file.files[0].size > 20 * 1024 * 1024)
          throw new Error("20MB 이하의 표 범위로 나눠 가져와 주세요.");
        workbook = XLSX.read(await file.files[0].arrayBuffer(), {
          type: "array",
          cellFormula: true,
        });
        sheets.replaceChildren(
          ...workbook.SheetNames.map((name) =>
            el("option", name, { value: name }),
          ),
        );
        sheets.hidden = false;
        paste.value = "";
        loadSheet();
      } catch (error) {
        workbook = null;
        grid = [];
        failure.replaceChildren(
          message("파일을 읽지 못했습니다. " + error.message, true),
        );
      }
    };
    const next = button(
      "열 연결 확인",
      () => {
        try {
          failure.replaceChildren();
          preview = null;
          if (!period.value.trim())
            throw new Error(
              "대상 기간을 입력해 주세요. 같은 자료를 갱신할 때 동일한 기간을 사용하세요.",
            );
          if (paste.value.trim()) {
            grid = C.parseTSV(paste.value);
            source = "붙여넣기";
            workbook = null;
          }
          if (!grid.length) throw new Error("자료를 선택해 주세요.");
          const h = Number(header.value) - 1,
            a = Number(start.value) - 1,
            b = end.value ? Number(end.value) : grid.length;
          const p = Number(parent.value) - 1;
          if (
            ![h, a, b, p].every(Number.isInteger) ||
            h < 0 ||
            a <= h ||
            b <= a ||
            b > grid.length ||
            p >= h ||
            p < -1
          )
            throw new Error("제목·상위 제목·데이터 행 범위를 확인해 주세요.");
          end.value = b;
          const merges = workbook?.Sheets[sheets.value]?.["!merges"] || [];
          const headerValue = (r, c) => {
            const merge = merges.find(
              (m) => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c,
            );
            return merge ? grid[merge.s.r]?.[merge.s.c] : grid[r]?.[c];
          };
          const width = Math.max(
            grid[h]?.length || 0,
            ...merges
              .filter((m) => h >= m.s.r && h <= m.e.r)
              .map((m) => m.e.c + 1),
          );
          const titles = Array.from({ length: width }, (_, i) =>
            [p >= 0 ? headerValue(p, i) : "", headerValue(h, i)]
              .filter(Boolean)
              .join(" / "),
          );
          if (!titles.length) throw new Error("제목 행이 비어 있습니다.");
          const savedValue = storageData.templates?.[template.value.trim()];
          const saved = Array.isArray(savedValue) ? savedValue : [];
          mappings = titles.map((title, index) => {
            const found = saved.find((m) => m.title === title);
            const key = found?.key ?? C.suggest(title, kind.value);
            return {
              title,
              index,
              key,
              unit:
                found?.unit ||
                (C.textFields.includes(key)
                  ? "text"
                  : /%/.test(title)
                    ? "percent"
                    : /천원/.test(title)
                      ? "thousand"
                      : /원/.test(title) ||
                          ["imp", "click", "conv"].includes(key)
                        ? "raw"
                        : ""),
            };
          });
          stage.replaceChildren(el("h3", "원본 열 → 분석 항목"));
          mappings.forEach((m) => {
            const line = el("div", null, { className: "mapping-row" });
            const key = select([["", "가져오지 않음"], ...C.fields], m.key);
            const unit = select(
              [
                ["", "단위 선택"],
                ["text", "텍스트"],
                ["raw", "원·회·건 / 소수 비율"],
                ["thousand", "천원"],
                ["percent", "퍼센트 (1 → 1%)"],
              ],
              m.unit,
            );
            const invalidate = () => {
              preview = null;
              output.replaceChildren();
            };
            key.onchange = () => {
              m.key = key.value;
              invalidate();
            };
            unit.onchange = () => {
              m.unit = unit.value;
              invalidate();
            };
            line.append(
              el("span", m.title + " · 예시 " + (grid[a]?.[m.index] ?? "")),
              key,
              unit,
            );
            stage.append(line);
          });
          const output = el("div", null, { id: "import-preview" });
          stage.append(
            button(
              "반영 미리보기",
              () => {
                try {
                  preview = null;
                  output.replaceChildren();
                  const result = C.convert(grid.slice(a, b), mappings, {
                    start: a,
                    source,
                    period: period.value.trim(),
                  });
                  if (result.errors.length)
                    throw new Error(result.errors.join("\n"));
                  const nextProject = structuredClone(validationData);
                  let summary, previewRows;
                  const conflicts = [];
                  if (kind.value === "plan") {
                    // Derive missing plan targets while keeping explicit targets authoritative.
                    result.data.forEach((r) => {
                      const derived = {
                        targetCpm:
                          r.imp > 0 && r.cost !== null
                            ? (r.cost / r.imp) * 1000
                            : null,
                        targetCpc:
                          r.click > 0 && r.cost !== null
                            ? r.cost / r.click
                            : null,
                        targetCtr:
                          r.imp > 0 && r.click !== null
                            ? r.click / r.imp
                            : null,
                      };
                      for (const [k, v] of Object.entries(derived))
                        if (
                          v !== null &&
                          r[k] !== null &&
                          Math.abs(v - r[k]) > 1e-8
                        )
                          conflicts.push(
                            (r.media || "") +
                              " " +
                              k +
                              " 명시값 " +
                              r[k] +
                              " / 역산값 " +
                              v.toFixed(4),
                          );
                      r.targetCpm ??=
                        r.cost != null && r.imp > 0
                          ? (r.cost / r.imp) * 1000
                          : null;
                      r.targetCpc ??=
                        r.cost != null && r.click > 0 ? r.cost / r.click : null;
                      r.targetCtr ??=
                        r.click != null && r.imp > 0 ? r.click / r.imp : null;
                      r.targetCvr ??=
                        r.conv != null && r.click > 0 ? r.conv / r.click : null;
                      r.targetCpa ??=
                        r.cost != null && r.conv > 0 ? r.cost / r.conv : null;
                    });
                    const merged = C.merge(
                      nextProject.plans || [],
                      result.data,
                    );
                    nextProject.plans = merged.rows;
                    nextProject.MAIN = C.attachTargets(
                      nextProject.MAIN,
                      merged.rows,
                    );
                    summary = merged;
                    previewRows = result.data;
                  } else {
                    const withTargets = C.attachTargets(
                      result.data,
                      nextProject.plans || [],
                    );
                    summary = C.merge(
                      mode.value === "replace" ? [] : nextProject.MAIN,
                      withTargets,
                    );
                    nextProject.MAIN = summary.rows;
                    previewRows = result.data.map((row) =>
                      summary.rows.find(
                        (r) => C.identity(r) === C.identity(row),
                      ),
                    );
                  }
                  nextProject.importMeta = {
                    period: period.value.trim(),
                    source,
                    at: new Date().toISOString(),
                  };
                  preview = {
                    nextProject,
                    template: template.value.trim(),
                    mappings: structuredClone(mappings),
                  };
                  if (kind.value === "actual" && mode.value === "replace")
                    output.append(
                      message(
                        "현재 프로젝트의 기존 실적 전체를 " +
                          result.data.length +
                          "행으로 교체합니다. 계획과 분석 기준은 유지합니다.",
                      ),
                    );
                  output.append(
                    message(
                      "추가 " +
                        summary.added +
                        "행 · 갱신 " +
                        summary.updated +
                        "행 · 합계 제외 " +
                        result.excluded.length +
                        "행 (" +
                        result.excluded.join(", ") +
                        ")",
                    ),
                  );
                  output.append(
                    table(
                      C.fields.map((f) => f[1]),
                      previewRows
                        .slice(0, 20)
                        .map((r) => C.fields.map(([k]) => r[k])),
                    ),
                  );
                  output.append(
                    message(
                      "표는 최대 20행을 표시합니다. 전체 " +
                        result.data.length +
                        "행이 반영됩니다. 누락된 전환·매출은 미입력으로 유지됩니다.",
                    ),
                  );
                  let approveConflict;
                  if (conflicts.length) {
                    output.append(
                      message(
                        "계획 명시 목표와 역산값이 다릅니다.\n" +
                          conflicts.join("\n"),
                      ),
                    );
                    approveConflict = el("input", null, { type: "checkbox" });
                    output.append(
                      labeled("명시 목표를 우선 적용합니다.", approveConflict),
                    );
                  }
                  output.append(
                    button(
                      "확인한 자료 반영",
                      () => {
                        if (!preview) return;
                        if (approveConflict && !approveConflict.checked) {
                          output.append(
                            message(
                              "명시 목표 우선 적용을 확인해 주세요.",
                              true,
                            ),
                          );
                          return;
                        }
                        try {
                          const oldTemplates = storageData.templates;
                          if (preview.template)
                            storageData.templates = {
                              ...(storageData.templates || {}),
                              [preview.template]: preview.mappings,
                            };
                          try {
                            persist(preview.nextProject);
                          } catch (error) {
                            storageData.templates = oldTemplates;
                            throw error;
                          }
                          dialog.close();
                        } catch (error) {
                          output.append(message(error.message, true));
                        }
                      },
                      true,
                    ),
                  );
                } catch (error) {
                  output.append(message(error.message, true));
                }
              },
              true,
            ),
            output,
          );
        } catch (error) {
          failure.replaceChildren(message(error.message, true));
        }
      },
      true,
    );
    dialog.append(next, failure, stage);
  }
  function openSettings() {
    resetDialog("분석 기준");
    const old = validationData.settings || {
      name: "기본 기준",
      version: 1,
      thresholds: structuredClone(DEFAULT_THRESHOLDS),
    };
    const name = el("input", null, { value: old.name });
    dialog.append(labeled("기준 이름", name));
    dialog.append(
      message(
        "목표 대비 실적 비율을 입력합니다. CPM·CPC·CPA는 낮을수록, CTR·CVR은 높을수록 높은 점수입니다. 5점은 경계값 미만/초과, 4~2점은 경계값을 포함합니다.",
      ),
    );
    const inputs = {};
    for (const [key, label] of [
      ["low", "CPM·CPC·CPA (오름차순)"],
      ["high", "CTR·CVR (내림차순)"],
    ]) {
      const group = el("fieldset", null);
      group.append(el("legend", label));
      inputs[key] = [];
      old.thresholds[key].forEach((v, i) => {
        const n = el("input", null, {
          type: "number",
          step: ".01",
          min: ".01",
          value: v,
        });
        inputs[key].push(n);
        group.append(labeled(5 - i + "점 경계", n));
      });
      dialog.append(group);
    }
    const output = el("div", null);
    let proposed;
    dialog.oninput = () => {
      proposed = null;
      output.replaceChildren();
    };
    dialog.append(
      button(
        "변경 결과 미리보기",
        () => {
          try {
            const thresholds = Object.fromEntries(
              Object.entries(inputs).map(([k, list]) => [
                k,
                list.map((n) => Number(n.value)),
              ]),
            );
            for (const [k, values] of Object.entries(thresholds))
              if (
                values.some(
                  (v, i) =>
                    !Number.isFinite(v) ||
                    v <= 0 ||
                    (i > 0 &&
                      (k === "low" ? v <= values[i - 1] : v >= values[i - 1])),
                )
              )
                throw new Error("양수 경계값을 순서대로 입력해 주세요.");
            const before = aggregateAndScoreData().data;
            const previous = validationData.settings;
            let after;
            try {
              validationData.settings = { thresholds };
              after = aggregateAndScoreData().data;
            } finally {
              validationData.settings = previous;
            }
            proposed = {
              name: name.value.trim() || "사용자 기준",
              version: old.version + 1,
              thresholds,
            };
            const changes = after.filter(
              (r, i) =>
                r.daInsight !== before[i].daInsight ||
                r.pmInsight !== before[i].pmInsight ||
                r.total !== before[i].total,
            );
            output.replaceChildren(
              message(
                changes.length + "개 소재의 점수 또는 등급이 변경됩니다.",
              ),
              table(
                ["소재", "이전 DA / PM / 총점", "변경 DA / PM / 총점"],
                after.map((r, i) => [
                  r.creativeName || r.media,
                  [
                    before[i].daInsight,
                    before[i].pmInsight,
                    before[i].total,
                  ].join(" / "),
                  [r.daInsight, r.pmInsight, r.total].join(" / "),
                ]),
              ),
            );
            output.append(
              button(
                "기준 적용",
                () => {
                  if (proposed)
                    try {
                      persist({ ...validationData, settings: proposed });
                      dialog.close();
                    } catch (e) {
                      output.append(message(e.message, true));
                    }
                },
                true,
              ),
            );
          } catch (e) {
            output.replaceChildren(message(e.message, true));
          }
        },
        true,
      ),
      output,
    );
  }
  document.getElementById("import-open").onclick = openImport;
  document.getElementById("settings-open").onclick = openSettings;
  function showEvidence(event) {
    const tr = event.target.closest("tr");
    const row =
      liveAnalysisData.data[
        Array.from(tr?.parentElement.children || []).indexOf(tr)
      ];
    if (!row) return;
    resetDialog((row.creativeName || row.media || "소재") + " · 판단 근거");
    const settings = validationData.settings || {
      name: "기본 기준",
      version: 1,
    };
    dialog.append(
      message(
        settings.name +
          " v" +
          settings.version +
          " · " +
          (row.period || "기간 미지정") +
          " · " +
          (row.source || "수기 입력"),
      ),
    );
    const metrics = [
      ["CPM", "targetCpm", "actualCpm", "광고비 ÷ 노출 × 1,000"],
      ["CPC", "targetCpc", "actualCpc", "광고비 ÷ 클릭"],
      ["CTR", "targetCtr", "actualCtr", "클릭 ÷ 노출"],
      ["CVR", "targetCvr", "actualCvr", "전환 ÷ 클릭"],
      ["CPA", "targetCpa", "actualCpa", "광고비 ÷ 전환"],
    ];
    dialog.append(
      table(
        ["항목", "목표", "실적", "목표 출처", "계산식"],
        metrics.map(([label, t, a, formula]) => [
          label,
          row[t],
          row[a],
          row.targetSources?.[t] || "수기 입력",
          formula,
        ]),
      ),
    );
    dialog.append(
      message(
        "A 노출 점수 " +
          row.scoreA +
          " · B 클릭 반응 점수 " +
          row.scoreB +
          " · C 전환 점수 " +
          row.scoreC,
      ),
    );
    dialog.append(
      message(
        "DA " +
          (row.daInsight || "데이터 부족") +
          " · " +
          row.daAction +
          " / 전환 " +
          (row.conv === null
            ? "미입력"
            : row.conv === 0
              ? "0건 · CPA 산출 불가"
              : row.pmInsight || "목표 또는 데이터 부족"),
      ),
    );
  }
  document.getElementById("table-body").addEventListener("click", showEvidence);
  document.getElementById("table-body").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      showEvidence(e);
    }
  });
});
