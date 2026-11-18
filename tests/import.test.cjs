const { test } = require("node:test");
const assert = require("node:assert/strict");
const C = require("../import-core.js");
const fs = require("node:fs");
const vm = require("node:vm");
const html = fs.readFileSync(
  require("node:path").join(__dirname, "../index.html"),
  "utf8",
);
const analysis = fs.readFileSync(
  require("node:path").join(__dirname, "../analysis.js"),
  "utf8",
);
function context(source) {
  const ctx = vm.createContext({
    crypto,
    console,
    document: { getElementById: () => ({}), addEventListener() {} },
  });
  vm.runInContext(analysis, ctx);
  vm.runInContext(source.split("<script>")[1].split("</script>")[0], ctx);
  return ctx;
}
function metrics(ctx, overrides = {}) {
  return JSON.parse(
    vm.runInContext(
      "JSON.stringify(aggregateAndScoreData(mapCampaignDataToValidation(" +
        JSON.stringify([
          {
            media: "A",
            placement: "DA",
            creativeName: "one",
            cost: 100000,
            imp: 10000,
            click: 100,
            conv: 5,
            revenue: 300000,
            targetCpm: 10000,
            targetCpc: 1000,
            targetCtr: 0.01,
            targetCvr: 0.05,
            targetCpa: 20000,
            ...overrides,
          },
        ]) +
        ")))",
      ctx,
    ),
  );
}
test("baseline formulas and existing grades remain consistent", () => {
  const got = metrics(context(html));
  const old = {
    data: [
      {
        actualCpm: 10000,
        actualCpc: 1000,
        actualCtr: 0.01,
        actualCvr: 0.05,
        actualCpa: 20000,
        roas: 300,
        scoreA: 3,
        scoreB: 3,
        scoreC: 3,
        daInsight: "Top소재",
        pmInsight: "Top소재",
      },
    ],
  };
  for (const k of [
    "actualCpm",
    "actualCpc",
    "actualCtr",
    "actualCvr",
    "actualCpa",
    "roas",
    "scoreA",
    "scoreB",
    "scoreC",
    "daInsight",
    "pmInsight",
  ])
    assert.equal(got.data[0][k], old.data[0][k], k);
  assert.deepEqual(
    [
      "actualCpm",
      "actualCpc",
      "actualCtr",
      "actualCvr",
      "actualCpa",
      "roas",
    ].map((k) => got.data[0][k]),
    [10000, 1000, 0.01, 0.05, 20000, 300],
  );
});
test("null revenue and zero conversion differ from zero revenue", () => {
  const got = metrics(context(html), { conv: 0, revenue: null });
  assert.equal(got.data[0].actualCvr, 0);
  assert.equal(got.data[0].actualCpa, null);
  assert.equal(got.data[0].roas, null);
  assert.equal(metrics(context(html), { revenue: 0 }).data[0].roas, 0);
});
test("TSV quoting and units", () => {
  assert.deepEqual(C.parseTSV('매체\t소재\r\nA\t"one\ntwo"'), [
    ["매체", "소재"],
    ["A", "one\ntwo"],
  ]);
  assert.equal(C.number("1%", "raw"), 0.01);
  assert.equal(C.number("1", "percent"), 0.01);
  assert.equal(C.number("100", "thousand"), 100000);
  assert.equal(C.number("", "raw"), null);
  assert.equal(C.number("0", "raw"), 0);
  assert.throws(() => C.number("1.2.3", "raw"));
});
test("reordered columns, totals, repeated import and plan targets", () => {
  const opts = { period: "2026-11", start: 1, source: "fixture" };
  const a = C.convert(
    [
      ["A", "100,000", "10,000", 100],
      ["합계", 100000, 10000, 100],
    ],
    ["media", "cost", "imp", "click"].map((key, index) => ({
      key,
      index,
      unit: "raw",
      title: key,
    })),
    opts,
  );
  const b = C.convert(
    [[100, "A", "10,000", "100,000"]],
    ["click", "media", "imp", "cost"].map((key, index) => ({
      key,
      index,
      unit: "raw",
      title: key,
    })),
    opts,
  );
  assert.deepEqual(
    a.data.map(({ mappedFields, ...r }) => r),
    b.data.map(({ mappedFields, ...r }) => r),
  );
  assert.equal(a.excluded.length, 1);
  assert.equal(a.errors.length, 0);
  const once = C.merge([], a.data),
    twice = C.merge(once.rows, a.data);
  assert.equal(twice.rows.length, 1);
  assert.equal(twice.updated, 1);
  const plan = { ...a.data[0], targetCpc: 1000 };
  const rows = C.attachTargets(
    [
      { ...a.data[0], creativeName: "a" },
      { ...a.data[0], creativeName: "b" },
    ],
    [plan],
  );
  assert.deepEqual(
    rows.map((r) => r.targetCpc),
    [1000, 1000],
  );
  assert.equal(rows[0].cost, 100000);
  assert.throws(() => C.merge([], [...a.data, ...a.data]));
});
test("threshold boundaries match strict existing criteria", () => {
  const ctx = context(html);
  assert.equal(vm.runInContext("getScoreCpm(69,100)", ctx), 5);
  assert.equal(vm.runInContext("getScoreCpm(70,100)", ctx), 4);
  assert.equal(vm.runInContext("getScoreCpm(90,100)", ctx), 4);
  assert.equal(vm.runInContext("getScoreCtr(150,100)", ctx), 4);
  assert.equal(vm.runInContext("getScoreCtr(151,100)", ctx), 5);
});
test("period overlap, ambiguous mapping and wrong units need review", () => {
  const base = {
    period: "2026-11",
    media: "A",
    placement: "DA",
    creativeName: "x",
    cost: 1,
  };
  assert.throws(
    () => C.merge([base], [{ ...base, period: "2026-11-01 ~ 2026-11-30" }]),
    /기간이 겹/,
  );
  assert.throws(() => C.periodRange("2026-02-30 ~ 2026-03-01"));
  assert.equal(C.suggest("단가", "actual"), "");
  assert.throws(
    () =>
      C.convert(
        [["A", 1]],
        [
          { key: "media", index: 0, unit: "text" },
          { key: "targetCtr", index: 1, unit: "" },
        ],
        { period: "2026-11", start: 1 },
      ),
    /단위/,
  );
});
test("weighted summary and missing totals", () => {
  const ctx = context(html);
  const result = JSON.parse(
    vm.runInContext(
      "JSON.stringify(aggregateAndScoreData(mapCampaignDataToValidation([{media:'A',cost:100000,imp:10000,click:100,conv:5,revenue:300000},{media:'B',cost:20000,imp:1000,click:20}])).summary)",
      ctx,
    ),
  );
  assert.equal(result[2].subMetrics[1].value, 120 / 11000);
  assert.equal(result[3].value, null);
  assert.equal(result[4].value, null);
});
