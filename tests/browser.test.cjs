const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("../vendor/xlsx.full.min.js");
const artifacts = process.env.MI_ARTIFACT_DIR || "/tmp/mi-artifacts";
fs.mkdirSync(artifacts, { recursive: true });
(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const requests = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => requests.push(r));
  await p.goto(process.env.MI_TEST_URL || "http://127.0.0.1:8765/");
  await p.waitForTimeout(1500);
  console.log("load", errors);
  await p.click("#import-open");
  await p.fill("#import-period", "2026-11");
  await p.fill("#template-name", "A업체");
  await p.fill(
    "#paste-table",
    "매체\t소재명\t광고비(원)\t노출수\t클릭수\t전환수\t매출액(원)\t목표 CPM(원)\t목표 CPC(원)\t목표 CTR(%)\t목표 CVR(%)\t목표 CPA(원)\n테스트\t소재1\t100000\t10000\t100\t5\t300000\t10000\t1000\t1%\t5%\t20000",
  );
  await p.getByRole("button", { name: "열 연결 확인", exact: true }).click();
  await p.getByRole("button", { name: "반영 미리보기", exact: true }).click();
  console.log("preview", await p.locator("#import-preview").innerText());
  await p.screenshot({
    path: path.join(artifacts, "import-preview.png"),
    fullPage: true,
  });
  await p
    .getByRole("button", { name: "확인한 자료 반영", exact: true })
    .click();
  await p.reload();
  assert.match(await p.locator("#source-status").innerText(), /2026-11/);
  assert.equal(await p.locator("#table-body tr").count(), 1);
  assert.match(await p.locator("#summary-body").innerText(), /100,000원/);
  // Excel path uses the same fields, now reordered, with an actual percent cell.
  const rows = [
    [
      "소재명",
      "매체",
      "목표 CTR(%)",
      "클릭수",
      "광고비(원)",
      "노출수",
      "전환수",
      "매출액(원)",
    ],
    ["소재1", "테스트", 0.01, 100, 100000, 10000, 5, 300000],
    ["합계", "", null, 100, 100000, 10000, 5, 300000],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet.C2.z = "0%";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["설명"], ["테스트 자료"]]),
    "안내",
  );
  XLSX.utils.book_append_sheet(wb, sheet, "실적");
  const fixture = "/tmp/media-insight-fixture.xlsx";
  fs.writeFileSync(
    fixture,
    XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
  );
  await p.click("#import-open");
  await p.fill("#import-period", "2026-11");
  await p.setInputFiles("#report-file", fixture);
  await p.waitForFunction(
    () => document.querySelector("#sheet-select").options.length === 2,
  );
  await p.selectOption("#sheet-select", "실적");
  await p.getByRole("button", { name: "열 연결 확인", exact: true }).click();
  await p.getByRole("button", { name: "반영 미리보기", exact: true }).click();
  assert.match(await p.locator("#import-preview").innerText(), /갱신 1행/);
  assert.match(await p.locator("#import-preview").innerText(), /합계 제외 1행/);
  await p
    .getByRole("button", { name: "확인한 자료 반영", exact: true })
    .click();
  assert.equal(await p.locator("#table-body tr").count(), 1);
  // Cancel and storage failure preserve committed data.
  const committed = await p.evaluate(() =>
    localStorage.getItem("campaignDashboardStorage"),
  );
  await p.click("#import-open");
  await p.getByRole("button", { name: "닫기", exact: true }).click();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("campaignDashboardStorage")),
    committed,
  );
  await p.click("#settings-open");
  await p.getByRole("button", { name: "변경 결과 미리보기" }).click();
  await p.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw Error("quota");
    };
  });
  await p.getByRole("button", { name: "기준 적용", exact: true }).click();
  assert.match(
    await p.locator("dialog .error").innerText(),
    /이전 데이터가 유지/,
  );
  await p.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
  });
  await p.getByRole("button", { name: "닫기", exact: true }).click();
  assert.equal(
    await p.evaluate(() => localStorage.getItem("campaignDashboardStorage")),
    committed,
  );
  // New project names cannot overwrite an existing project.
  p.once("dialog", (d) => d.accept("검수"));
  await p.click("#new-project-button");
  p.once("dialog", (d) => d.accept("검수"));
  p.on("dialog", async (d) => {
    if (d.type() === "alert") await d.accept();
  });
  await p.click("#new-project-button");
  assert.equal(
    await p.evaluate(
      () =>
        Object.keys(
          JSON.parse(localStorage.getItem("campaignDashboardStorage")).projects,
        ).filter((k) => k === "검수").length,
    ),
    1,
  );
  await p.selectOption("#project-selector", "default");

  await p.locator("#table-body tr").last().click();
  console.log("evidence", await p.locator("dialog").innerText());
  await p.getByRole("button", { name: "닫기", exact: true }).click();
  await p.click("#settings-open");
  const thresholds = p.locator("dialog fieldset").first().locator("input");
  for (let i = 0; i < 4; i++)
    await thresholds.nth(i).fill(String(1.1 + i * 0.1));
  await p.getByRole("button", { name: "변경 결과 미리보기" }).click();
  assert.match(
    await p.locator("dialog .notice").last().innerText(),
    /1개 소재/,
  );
  console.log("settings", await p.locator("dialog .notice").last().innerText());
  await p.getByRole("button", { name: "기준 적용", exact: true }).click();
  await p.screenshot({
    path: path.join(artifacts, "dashboard.png"),
    fullPage: true,
  }); // A legacy project restores and remains editable without the original prefill reset.
  const legacy = await p.evaluate(() => ({
    currentProject: "legacy",
    projects: {
      legacy: {
        MAIN: mapCampaignDataToValidation([
          {
            media: "A",
            creativeName: "old",
            cost: 100000,
            imp: 10000,
            click: 100,
          },
        ]),
      },
    },
  }));
  await p.evaluate(
    (data) =>
      localStorage.setItem("campaignDashboardStorage", JSON.stringify(data)),
    legacy,
  );
  await p.reload();
  await p.locator("summary").filter({ hasText: "수기 입력·수정" }).click();
  await p
    .locator('#validation-table-body input[data-key="media"]')
    .first()
    .focus();
  assert.equal(
    await p
      .locator('#validation-table-body input[data-key="media"]')
      .first()
      .inputValue(),
    "A",
  );
  // Media-level plan goals flow to two creatives, while only actual costs enter totals.
  async function pasteReport(kind, text) {
    await p.click("#import-open");
    await p.fill("#import-period", "2026-12");
    await p.selectOption("#import-kind", kind);
    await p.fill("#paste-table", text);
    await p.getByRole("button", { name: "열 연결 확인", exact: true }).click();
    await p.getByRole("button", { name: "반영 미리보기", exact: true }).click();
    await p
      .getByRole("button", { name: "확인한 자료 반영", exact: true })
      .click();
  }
  p.once("dialog", (d) => d.accept("계획 검수"));
  await p.click("#new-project-button");
  await pasteReport(
    "plan",
    "매체\t목표 CPM(원)\t목표 CPC(원)\t목표 CTR(%)\nA\t10000\t1000\t1%",
  );
  await pasteReport(
    "actual",
    "매체\t소재명\t광고비(원)\t노출수\t클릭수\nA\ta\t100000\t10000\t100\nA\tb\t20000\t1000\t20",
  );
  assert.equal(await p.locator("#table-body tr").count(), 2);
  assert.match(await p.locator("#summary-body").innerText(), /120,000원/);
  await p.locator("#table-body tr").first().click();
  assert.match(await p.locator("dialog").innerText(), /계획 · 붙여넣기/);
  await p.getByRole("button", { name: "닫기", exact: true }).click();
  assert.deepEqual(errors, []);
  assert.equal(requests.filter((r) => r.method() !== "GET").length, 0);
  console.log(
    "PASS: paste, Excel, percentages, totals, upsert, cancel, quota rollback, duplicate names, evidence, settings, reload, GET-only network",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
