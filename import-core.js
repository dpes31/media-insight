/* Shared import rules. SheetJS CE 0.20.3 is vendored under Apache-2.0. */
(function (root) {
  const fields = [
    ["media", "매체"],
    ["placement", "상품"],
    ["creativeName", "소재명"],
    ["cost", "광고비"],
    ["imp", "노출수"],
    ["click", "클릭수"],
    ["conv", "전환수"],
    ["revenue", "매출액"],
    ["targetCpm", "목표 CPM"],
    ["targetCpc", "목표 CPC"],
    ["targetCtr", "목표 CTR"],
    ["targetCvr", "목표 CVR"],
    ["targetCpa", "목표 CPA"],
  ];
  const textFields = ["media", "placement", "creativeName"];
  const ratioFields = ["targetCtr", "targetCvr"];
  const normalize = (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/[\s()%원회건,_-]/g, "");
  const aliases = {
    media: ["매체", "미디어", "media"],
    placement: ["상품", "광고상품", "게재위치", "placement"],
    creativeName: ["소재", "소재명", "광고소재", "creativename"],
    cost: ["광고비", "소진금액", "집행금액", "cost", "예산"],
    imp: ["노출", "노출수", "impressions"],
    click: ["클릭", "클릭수", "clicks"],
    conv: ["전환", "전환수", "conversions"],
    revenue: ["매출", "매출액", "revenue"],
  };
  function suggest(title, kind) {
    const name = normalize(title);
    for (const [key, list] of Object.entries(aliases)) {
      if (list.includes(name)) return key;
    }
    for (const [suffix, key] of [
      ["cpm", "targetCpm"],
      ["cpc", "targetCpc"],
      ["ctr", "targetCtr"],
      ["cvr", "targetCvr"],
      ["cpa", "targetCpa"],
    ]) {
      if (
        name.includes(suffix) &&
        (kind === "plan" || /목표|예상|계획/.test(name))
      )
        return key;
    }
    return "";
  }
  function parseTSV(source) {
    const rows = [[]];
    let value = "",
      quoted = false;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (char === '"') {
        if (quoted && source[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = !quoted;
      } else if (!quoted && (char === "\t" || char === "\n" || char === "\r")) {
        rows[rows.length - 1].push(value);
        value = "";
        if (char !== "\t") {
          if (char === "\r" && source[i + 1] === "\n") i++;
          rows.push([]);
        }
      } else value += char;
    }
    if (quoted)
      throw new Error(
        "닫히지 않은 따옴표가 있습니다. 표를 다시 복사해 주세요.",
      );
    rows[rows.length - 1].push(value);
    return rows;
  }
  function number(value, unit) {
    if (
      value === null ||
      value === undefined ||
      String(value).trim() === "" ||
      ["-", "—", "N/A", "#N/A"].includes(String(value).trim())
    )
      return null;
    const raw = String(value).trim();
    const cleaned = raw.replace(/[,₩원%\s]/g, "");
    if (!/^(\d+(\.\d*)?|\.\d+)$/.test(cleaned))
      throw new Error("유효한 양수 또는 0을 입력해 주세요.");
    const n = Number(cleaned);
    if (!Number.isFinite(n)) throw new Error("숫자 범위를 확인해 주세요.");
    if (raw.includes("%")) return n / 100;
    if (unit === "percent") return n / 100;
    if (unit === "thousand") return n * 1000;
    return n;
  }
  function convert(rows, mappings, options) {
    const used = mappings.filter((m) => m.key);
    if (!used.some((m) => m.key === "media"))
      throw new Error("매체 열을 연결해 주세요.");
    if (new Set(used.map((m) => m.key)).size !== used.length)
      throw new Error("같은 분석 항목에 두 열이 연결돼 있습니다.");
    for (const m of used) {
      const allowed = textFields.includes(m.key)
        ? ["text", "raw"]
        : ratioFields.includes(m.key)
          ? ["raw", "percent"]
          : ["imp", "click", "conv"].includes(m.key)
            ? ["raw"]
            : ["raw", "thousand"];
      if (!allowed.includes(m.unit))
        throw new Error(m.title + "의 단위를 확인해 주세요.");
    }
    periodRange(options.period);
    const data = [],
      errors = [],
      excluded = [];
    rows.forEach((cells, index) => {
      const rowNumber = options.start + index + 1;
      if (
        cells.every(
          (v) => v === null || v === undefined || String(v).trim() === "",
        )
      )
        return;
      if (
        cells.some((v) =>
          /^(총\s*합계|소계|합계|총계|subtotal|grand total|total)$/i.test(
            String(v ?? "").trim(),
          ),
        )
      ) {
        excluded.push(rowNumber);
        return;
      }
      const row = Object.fromEntries(fields.map(([key]) => [key, null]));
      for (const m of used) {
        try {
          if (
            !ratioFields.includes(m.key) &&
            !textFields.includes(m.key) &&
            String(cells[m.index] ?? "").includes("%")
          )
            throw new Error("백분율 열의 연결 항목을 확인해 주세요.");
          row[m.key] = textFields.includes(m.key)
            ? String(cells[m.index] ?? "").trim() || null
            : number(cells[m.index], m.unit);
        } catch (error) {
          errors.push(rowNumber + "행 " + m.title + " " + error.message);
        }
      }
      if (!row.media) errors.push(rowNumber + "행 매체가 비어 있습니다.");
      for (const key of ["imp", "click", "conv"]) {
        if (row[key] !== null && !Number.isInteger(row[key]))
          errors.push(rowNumber + "행 " + key + "은 정수여야 합니다.");
      }
      for (const key of fields
        .map((f) => f[0])
        .filter((k) => k.startsWith("target"))) {
        if (row[key] !== null && row[key] <= 0)
          errors.push(rowNumber + "행 목표값은 0보다 커야 합니다.");
      }
      row.mappedFields = used.map((m) => m.key);
      row.period = options.period;
      row.source = options.source;
      data.push(row);
    });
    if (!data.length) errors.push("반영할 데이터가 없습니다.");
    return { data, errors, excluded };
  }
  function periodRange(value) {
    const month = /^(\d{4})-(\d{2})$/.exec(value);
    if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) {
      const end = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0))
        .toISOString()
        .slice(0, 10);
      return [value + "-01", end];
    }
    const range = /^(\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})$/.exec(value);
    if (
      range &&
      range.slice(1).every((d) => {
        const date = new Date(d);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === d
        );
      }) &&
      range[1] <= range[2]
    )
      return range.slice(1);
    throw new Error(
      "기간은 YYYY-MM 또는 YYYY-MM-DD ~ YYYY-MM-DD로 입력해 주세요.",
    );
  }
  function identity(row) {
    return JSON.stringify([
      row.period || "",
      row.media || "",
      row.placement || "",
      row.creativeName || "",
    ]);
  }
  function merge(existing, incoming) {
    const keys = incoming.map(identity);
    if (new Set(keys).size !== keys.length)
      throw new Error(
        "같은 기간·매체·상품·소재가 중복됩니다. 범위를 좁히거나 소재명을 구분해 주세요.",
      );
    const result = existing
      .filter((r) => r.media || r.creativeName || r.cost != null)
      .map((r) => ({ ...r }));
    let added = 0,
      updated = 0;
    incoming.forEach((row) => {
      const range = periodRange(row.period);
      if (
        result.some(
          (r) =>
            !r.period &&
            r.media === row.media &&
            (r.placement || "") === (row.placement || "") &&
            (r.creativeName || "") === (row.creativeName || ""),
        )
      )
        throw new Error(
          "같은 소재의 기존 행에 기간이 없습니다. 수기 행을 확인하거나 전체 교체 방식으로 가져와 주세요.",
        );
      const overlaps = result.some((r) => {
        if (
          !r.period ||
          r.period === row.period ||
          r.media !== row.media ||
          (r.placement || "") !== (row.placement || "") ||
          (r.creativeName || "") !== (row.creativeName || "")
        )
          return false;
        const old = periodRange(r.period);
        return old[0] <= range[1] && range[0] <= old[1];
      });
      if (overlaps)
        throw new Error(
          "기존 행과 집계 기간이 겹칩니다. 동일 기간으로 갱신하거나 기간을 나눠 주세요.",
        );
      const matches = result
        .map((r, i) => (identity(r) === identity(row) ? i : -1))
        .filter((i) => i >= 0);
      if (matches.length > 1)
        throw new Error("기존 행이 중복되어 갱신 대상을 정할 수 없습니다.");
      if (matches.length) {
        const i = matches[0];
        const next = { ...result[i], ...row, id: result[i].id };
        for (const [key] of fields.filter(([k]) => k.startsWith("target"))) {
          if (
            row.mappedFields &&
            !row.mappedFields.includes(key) &&
            row[key] == null
          ) {
            next[key] = result[i][key];
            next.targetSources = {
              ...(next.targetSources || {}),
              [key]: result[i].targetSources?.[key] || "이전 목표 유지",
            };
          }
        }
        result[i] = next;
        updated++;
      } else {
        result.push({ ...row, id: crypto.randomUUID(), isPrefill: false });
        added++;
      }
    });
    return { rows: result, added, updated };
  }
  function attachTargets(rows, plans) {
    return rows.map((row) => {
      const matches = plans.filter(
        (p) =>
          p.period === row.period &&
          p.media === row.media &&
          (!p.placement || p.placement === row.placement) &&
          (!p.creativeName || p.creativeName === row.creativeName),
      );
      const scored = matches.map((p) => ({
        p,
        specificity: Number(!!p.placement) + 2 * Number(!!p.creativeName),
      }));
      scored.sort((a, b) => b.specificity - a.specificity);
      const next = { ...row, targetSources: { ...(row.targetSources || {}) } };
      for (const [key] of fields.filter(([k]) => k.startsWith("target"))) {
        if (
          row[key] !== null &&
          row[key] !== undefined &&
          !row.targetSources?.[key]?.startsWith("계획")
        ) {
          next.targetSources[key] = "소재 명시값";
          continue;
        }
        const candidates = scored.filter(({ p }) => p[key] != null);
        if (
          candidates.length &&
          candidates.filter((c) => c.specificity === candidates[0].specificity)
            .length > 1
        ) {
          throw new Error(
            row.media +
              " 목표 후보가 여러 개입니다. 계획 범위를 확인해 주세요.",
          );
        }
        next[key] = candidates[0]?.p[key] ?? null;
        next.targetSources[key] = candidates[0]
          ? "계획 · " + candidates[0].p.source
          : "미입력";
      }
      return next;
    });
  }
  const api = {
    fields,
    textFields,
    ratioFields,
    normalize,
    suggest,
    parseTSV,
    number,
    convert,
    merge,
    attachTargets,
    periodRange,
    identity,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.ImportCore = api;
})(globalThis);
