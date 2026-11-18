const DEFAULT_THRESHOLDS = {
  low: [0.7, 0.9, 1.05, 1.25],
  high: [1.5, 1.15, 0.95, 0.75],
};
// Campaign formulas and grading, shared by manual and imported rows.
function calculateValidationMetrics(row) {
  const { cost, imp, click, conv } = row;
  const safeDivide = (n, d) =>
    typeof n !== "number" ||
    typeof d !== "number" ||
    d <= 0 ||
    isNaN(n) ||
    isNaN(d) ||
    n === null ||
    d === null
      ? null
      : n / d;
  row.actualCpm =
    safeDivide(cost, imp) !== null ? safeDivide(cost, imp) * 1000 : null;
  row.actualCpc = safeDivide(cost, click);
  row.actualCtr = safeDivide(click, imp);
  row.actualCvr = safeDivide(conv, click);
  row.actualCpa = safeDivide(cost, conv);
}

function scoreMetric(actual, target, key) {
  if (
    actual === null ||
    !Number.isFinite(actual) ||
    !Number.isFinite(target) ||
    target <= 0
  )
    return key === "cvr" || key === "cpa" ? null : 1;
  const t = validationData?.settings?.thresholds || DEFAULT_THRESHOLDS;
  const ratio = actual / target;
  const lower = ["cpm", "cpc", "cpa"].includes(key);
  const bounds = lower ? t.low : t.high;
  for (let i = 0; i < bounds.length; i++) {
    if (
      lower
        ? i === 0
          ? ratio < bounds[i]
          : ratio <= bounds[i]
        : i === 0
          ? ratio > bounds[i]
          : ratio >= bounds[i]
    )
      return 5 - i;
  }
  return 1;
}
const getScoreCpm = (a, t) => scoreMetric(a, t, "cpm");
const getScoreCpc = (a, t) => scoreMetric(a, t, "cpc");
const getScoreCtr = (a, t) => scoreMetric(a, t, "ctr");
const getScoreCvr = (a, t) => scoreMetric(a, t, "cvr");
const getScoreCpa = (a, t) => scoreMetric(a, t, "cpa");

const getDaInsight = (sA, sB) => {
  if (sA >= 4 && sB >= 4)
    return {
      grade: "Top 소재",
      text: "노출이 매우 원활하고, 소재 관심도도 매우 높아 타겟팅과 메시지 효과적인 소재",
    };
  if (sA >= 4 && sB >= 3)
    return {
      grade: "Top 소재",
      text: "노출이 매우 원활하고, 소재 관심은 우수한 편이므로 좀 더 범용적인 소재로 개선 필요",
    };
  if (sA >= 4 && sB >= 1.5)
    return {
      grade: "Mid 소재",
      text: "노출은 매우 원할하지만, 소재 관심이 낮은 편으로 훅킹성을 높인 소재로 수정 필요",
    };
  if (sA >= 4 && sB >= 0)
    return {
      grade: "Low소재",
      text: "노출은 매우 원활하지만 극소수의 집단에서 반응이 발생함으로 소재 훅킹성 증대 필요",
    };
  if (sA >= 3 && sB >= 4)
    return {
      grade: "Top 소재",
      text: "노출이 적절하며, 소재 관심이 매우 높아 메시지 효과성이 높은 소재",
    };
  if (sA >= 3 && sB >= 3)
    return {
      grade: "Top소재",
      text: "노출이 적절하고, 소재 관심도 동반되어 우수한 소재",
    };
  if (sA >= 3 && sB >= 1.5)
    return {
      grade: "Mid 소재",
      text: "노출은 적절하지만 소재 관심이 낮은 편으로 타겟팅 확장 및 범용적인 소재로 개선 필요",
    };
  if (sA >= 3 && sB >= 0)
    return {
      grade: "Low소재",
      text: "노출은 적절하지만 관심이 저조하여 소재 OFF 및 예산 이관 고려",
    };
  if (sA >= 1.5 && sB >= 4)
    return {
      grade: "Mid소재",
      text: "소재 관심이 매우 높지만 노출이 원활하지 않는 소재로 타겟팅 조정 및 예산 증액으로 노출 증대방안 고려",
    };
  if (sA >= 1.5 && sB >= 3)
    return {
      grade: "Low소재",
      text: "소재 훅킹성은 있지만 노출이 원활하지 않는 소재로 타겟팅 확장 필요",
    };
  if (sA >= 1.5 && sB >= 1.5)
    return {
      grade: "Low소재",
      text: "노출과 소재 관심이 낮은 편으로 소재 OFF 및 예산 이관 고려",
    };
  if (sA >= 1.5 && sB >= 0)
    return {
      grade: "Low소재",
      text: "노출과 소재 관심이 저조하여 소재 OFF 및 예산 이관 고려",
    };
  if (sA >= 0 && sB >= 4)
    return {
      grade: "Low소재",
      text: "소재 관심은 매우 높지만 극소수의 집단에만 노출되어 타겟팅 확장 및 예산 증액으로 노출 증대방안 고려",
    };
  if (sA >= 0 && sB >= 3)
    return {
      grade: "Low소재",
      text: "소재 훅킹성은 있지만 극소수의 집단에만 노출되어 타겟팅 조정 필요",
    };
  if (sA >= 0 && sB >= 1.5)
    return {
      grade: "Low소재",
      text: "노출이 저조하고 소재 관심이 낮은 편으로 소재 OFF 및 예산 이관 고려",
    };
  if (sA >= 0 && sB >= 0)
    return {
      grade: "Low소재",
      text: "노출과 소재 관심이 저조하여 소재 OFF 및 예산 이관 고려",
    };
  return { grade: "오류", text: "점수 계산 오류" };
};
const getDaFeedback = (sA, sB) => {
  if (sA === null || sB === null) return "";
  if (sA >= 4 && sB >= 4) return "유지/강화";
  if (sA >= 4 && sB >= 3) return "범용적 메시지 강화";
  if (sA >= 4 && sB >= 1.5) return "훅킹성 증대";
  if (sA >= 4 && sB >= 0) return "훅킹성 증대";
  if (sA >= 3 && sB >= 4) return "유지/강화";
  if (sA >= 3 && sB >= 3) return "유지/강화";
  if (sA >= 3 && sB >= 1.5) return "타겟팅 확장/범용적 메시지";
  if (sA >= 3 && sB >= 0) return "타겟팅 확장+훅킹성 증대";
  if (sA >= 1.5 && sB >= 4) return "타겟팅 확장+예산 증대";
  if (sA >= 1.5 && sB >= 3) return "타겟팅 조정";
  if (sA >= 1.5 && sB >= 1.5) return "예산이관";
  if (sA >= 1.5 && sB >= 0) return "예산이관";
  if (sA >= 0 && sB >= 4) return "타겟팅 확장+예산 증대";
  if (sA >= 0 && sB >= 3) return "타겟팅 조정+훅킹성 증대";
  if (sA >= 0 && sB >= 1.5) return "예산이관";
  if (sA >= 0 && sB >= 0) return "예산이관";
  return "";
};
const getPerfInsight = (sB, sC) => {
  if (sB === null || sC === null)
    return { grade: "데이터 부족", text: "퍼포먼스 성과 분석 불가" };
  if (sB >= 4 && sC >= 4)
    return {
      grade: "Top 소재",
      text: "광고 반응과 전환 효율이 매우 높아 메시지가 워킹하는 소재",
    };
  if (sB >= 4 && sC >= 3)
    return {
      grade: "Top 소재",
      text: "광고 반응은 매우 높지만 전환 효율은 우수한 편으로 액션에 다소 신중한 태도를 보이는 것으로 예상",
    };
  if (sB >= 4 && sC >= 1.5)
    return {
      grade: "Mid 소재",
      text: "광고 반응은 매우 높지만 전환 효율이 낮은 편으로 타 상품과 비교 중이거나 전환 프로세스에 허들이 있을 것으로 예상",
    };
  if (sB >= 4 && sC >= 0)
    return {
      grade: "Low소재",
      text: "광고 반응은 매우 높지만 전환 효율이 저조한 소재로 호기심은 있지만 상품 관심 자체가 없을 것으로 예상",
    };
  if (sB >= 3 && sC >= 4)
    return {
      grade: "Top 소재",
      text: "광고 반응은 적절한 반면 전환 효율은 매우 높은 편으로 한 번에 다수 액션이 발생하거나 바이럴 된 것으로 예상",
    };
  if (sB >= 3 && sC >= 3)
    return {
      grade: "Top소재",
      text: "광고 반응과 전환 효율이 우수한 편이지만 액션에 다소 신중한 태도를 보이고 있어서 베네핏 강조 시 개선 될 것으로 예상",
    };
  if (sB >= 3 && sC >= 1.5)
    return {
      grade: "Mid 소재",
      text: "광고 반응은 적절하지만 전환 효율이 낮은 편으로 타 상품과 비교 중이거나 전환 프로세스에 허들이 있을 것으로 예상",
    };
  if (sB >= 3 && sC >= 0)
    return {
      grade: "Low소재",
      text: "광고 반응은 적절하지만 전환 효율이 저조한 소재로 상품 관심 자체가 없을 것으로 예상",
    };
  if (sB >= 1.5 && sC >= 4)
    return {
      grade: "Mid소재",
      text: "광고 반응은 낮지만 전환 효율이 매우 높은 편으로 매니아층이 있거나 바이럴 된 것으로 예상",
    };
  if (sB >= 1.5 && sC >= 3)
    return {
      grade: "Mid소재",
      text: "광고 반응은 낮지만 전환 효율이 우수한 편으로 매니아층이 있는 것으로 예상",
    };
  if (sB >= 1.5 && sC >= 1.5)
    return {
      grade: "Low소재",
      text: "광고 반응과 전환 효율이 낮은 편으로 소재 OFF 및 예산 이관 고려",
    };
  if (sB >= 1.5 && sC >= 0)
    return {
      grade: "Low소재",
      text: "광고 반응이 낮은 편이고 전환 효율이 저조하여 소재 OFF 및 예산 이관 고려",
    };
  if (sB >= 0 && sC >= 4)
    return {
      grade: "Mid소재",
      text: "광고 반응은 저조하지만 전환 효율이 매우 높은 편으로 매니아층이 있거나 바이럴 된 것으로 예상",
    };
  if (sB >= 0 && sC >= 3)
    return {
      grade: "Low소재",
      text: "광고 반응은 저조하지만 전환 효율이 우수한 편으로 매니아층이 있는 것으로 예상",
    };
  if (sB >= 0 && sC >= 1.5)
    return {
      grade: "Low소재",
      text: "광고 반응이 저조하고 전환 효율이 낮은 편으로 소재 OFF 및 예산 이관 고려",
    };
  if (sB >= 0 && sC >= 0)
    return {
      grade: "Low소재",
      text: "광고 반응과 전환 효율이 모두 저조하여 소재 OFF 및 예산 이관 고려",
    };
  return { grade: "오류", text: "퍼포먼스 점수 계산 오류" };
};
const getPerfFeedback = (sB, sC) => {
  if (sB === null || sC === null) return "";
  if (sB >= 4 && sC >= 4) return "유지/강화";
  if (sB >= 4 && sC >= 3) return "결정적인 베네핏 강조";
  if (sB >= 4 && sC >= 1.5) return "타사 대비 강점 강조 / 액션 허들 점검";
  if (sB >= 4 && sC >= 0) return "판매 상품 교체";
  if (sB >= 3 && sC >= 4) return "유지/강화";
  if (sB >= 3 && sC >= 3) return "결정적인 베네핏 강조";
  if (sB >= 3 && sC >= 1.5) return "타사 대비 강점 강조 / 액션 허들 점검";
  if (sB >= 3 && sC >= 0) return "판매 상품 교체";
  if (sB >= 1.5 && sC >= 4) return "훅킹성 증대 / 타겟팅 확장";
  if (sB >= 1.5 && sC >= 3) return "훅킹성 증대";
  if (sB >= 1.5 && sC >= 1.5) return "예산이관";
  if (sB >= 1.5 && sC >= 0) return "예산이관";
  if (sB >= 0 && sC >= 4) return "훅킹성 증대 / 타겟팅 확장";
  if (sB >= 0 && sC >= 3) return "훅킹성 증대";
  if (sB >= 0 && sC >= 1.5) return "예산이관";
  if (sB >= 0 && sC >= 0) return "예산이관";
  return "";
};
const getRoasInsight = (roas, prefix) => {
  if (roas === null || isNaN(roas) || roas <= 0) return null;
  let grade = "1점",
    text =
      "광고비 소진 대비 손익분기 미달이거나 단순 본전을 달성한 것으로 판단됨";
  if (roas > 600) {
    grade = "5점";
    text =
      "압도적인 수익이 발생되는 소재로 즉각적인 예산 증액을 통한 유지강화 필요";
  } else if (roas >= 400) {
    grade = "4점";
    text =
      "높은 순이익을 기록하는 것으로 예상되며 예산 증액을 통한 유지강화 권장";
  } else if (roas >= 250) {
    grade = "3점";
    text =
      "순이익이 발생되는 구간에 진입한 것으로 예상되며 추이를 지켜본 후 예상 증액 여부 판단을 권장";
  } else if (roas >= 150) {
    grade = "2점";
    text = "손익분기에 근접하거나 소폭 순이익을 기록하는 상황으로 예상 됨";
  }
  return {
    grade,
    text: `${prefix}: [ROAS ${Math.round(roas)}% (${grade})] ${text}`,
  };
};

function calculateScoresAndInsight(row) {
  let sA = null,
    sB = null,
    sC = null,
    total = null,
    insight = "데이터 부족",
    color = "#94a3b8",
    mInsight = "데이터를 입력해주세요.";
  let daGrade = null,
    daFeed = "",
    pmGrade = null,
    pmFeed = "";

  // [FIX] Color separation logic
  let daColor = "#94a3b8";
  let pmColor = "#94a3b8";

  const prefix =
    row.media || row.placement || row.creativeName
      ? `${escapeHtml(row.media || "N/A")}/${escapeHtml(row.placement || "N/A")}/${escapeHtml(row.creativeName || "N/A")}`
      : "매체 상품과 소재명 없음";

  const daMiss =
    row.cost === null ||
    row.cost === 0 ||
    row.imp === null ||
    row.imp === 0 ||
    row.click === null ||
    row.targetCpm === null ||
    row.targetCpc === null ||
    row.targetCtr === null;
  if (!daMiss) {
    sA = getScoreCpm(row.actualCpm, row.targetCpm);
    const b1 = getScoreCtr(row.actualCtr, row.targetCtr);
    const b2 = getScoreCpc(row.actualCpc, row.targetCpc);
    sB = (b1 + b2) / 2;
    const daRes = getDaInsight(sA, sB);
    daGrade = daRes.grade;
    daFeed = getDaFeedback(sA, sB);

    // DA Color Logic
    if (daGrade.includes("Top")) daColor = "#10b981";
    else if (daGrade.includes("Mid")) daColor = "#f59e0b";
    else if (daGrade.includes("Low")) daColor = "#ef4444";
  }

  const perfMiss =
    row.conv === null ||
    row.targetCvr === null ||
    row.targetCpa === null ||
    row.click === null ||
    row.click === 0;
  if (!perfMiss && row.actualCvr !== null && row.actualCpa !== null) {
    const sc1 = getScoreCvr(row.actualCvr, row.targetCvr);
    const sc2 = getScoreCpa(row.actualCpa, row.targetCpa);
    if (sc1 !== null && sc2 !== null) {
      sC = (sc1 + sc2) / 2;
      const pmRes = getPerfInsight(sB, sC);
      pmGrade = pmRes.grade;
      pmFeed = getPerfFeedback(sB, sC);

      // PM Color Logic
      if (pmGrade.includes("Top")) pmColor = "#10b981";
      else if (pmGrade.includes("Mid")) pmColor = "#f59e0b";
      else if (pmGrade.includes("Low")) pmColor = "#ef4444";
    }
  }

  // Determine main insight for table display (fallback priority)
  if (sC !== null && sB !== null) {
    insight = pmGrade;
    mInsight = `${getPerfInsight(sB, sC).text}`;
  } else if (sA !== null && sB !== null) {
    insight = daGrade;
    mInsight = `${getDaInsight(sA, sB).text}`;
  }

  // Main color (for table badge)
  if (insight.includes("Top")) color = "#10b981";
  else if (insight.includes("Mid")) color = "#f59e0b";
  else if (insight.includes("Low")) color = "#ef4444";

  if (sA !== null && sB !== null) {
    if (sC !== null) total = (sA + sB + sC) / 3;
    else total = (sA + sB) / 2;
  }

  if (daMiss) {
    insight = "미디어 성과를 작성해주세요";
    mInsight = `${insight}`;
    color = "#94a3b8";
  }

  return {
    ...row,
    scoreA: sA ? parseFloat(sA.toFixed(2)) : null,
    scoreB: sB ? parseFloat(sB.toFixed(2)) : null,
    scoreC: sC ? parseFloat(sC.toFixed(2)) : null,
    total: total ? parseFloat(total.toFixed(2)) : null,
    insight,
    color,
    mediaInsight: mInsight,
    daInsight: daGrade,
    daAction: daFeed,
    pmInsight: pmGrade,
    pmAction: pmFeed,
    roas:
      row.cost > 0 && row.revenue !== null
        ? (row.revenue / row.cost) * 100
        : null,
    daColor,
    pmColor, // Return separated colors
  };
}

function aggregateAndScoreData(dataSource) {
  const raw = dataSource || validationData["MAIN"];
  const scored = raw
    .filter((r) => r.media || r.creativeName || r.cost !== null)
    .map((r) => {
      calculateValidationMetrics(r);
      return calculateScoresAndInsight(r);
    });

  let tCost = 0,
    tImp = 0,
    tClick = 0,
    tConv = 0,
    tRev = 0;
  scored.forEach((i) => {
    tCost += i.cost || 0;
    tImp += i.imp || 0;
    tClick += i.click || 0;
    tConv += i.conv || 0;
    tRev += i.revenue || 0;
  });

  const avgCpm = tImp > 0 ? (tCost / tImp) * 1000 : null;
  const avgCtr = tImp > 0 ? tClick / tImp : null;
  const avgCpc = tClick > 0 ? tCost / tClick : null;
  const avgCvr = tClick > 0 ? tConv / tClick : null;
  const avgCpa = tConv > 0 ? tCost / tConv : null;
  const avgRoas = tCost > 0 ? (tRev / tCost) * 100 : null;

  return {
    data: scored,
    summary: [
      { label: "총 광고비", value: tCost, type: "currency" },
      {
        label: "총 노출수",
        value: tImp,
        type: "number",
        subMetrics: [{ label: "성과 CPM", value: avgCpm, type: "currency" }],
      },
      {
        label: "총 클릭수",
        value: tClick,
        type: "number",
        subMetrics: [
          { label: "성과 CPC", value: avgCpc, type: "currency" },
          { label: "성과 CTR", value: avgCtr, type: "percent" },
        ],
      },
      {
        label: "총 전환수",
        value: scored.some((r) => r.conv === null) ? null : tConv,
        type: "number",
        subMetrics: [
          {
            label: "성과 CVR",
            value: scored.some((r) => r.conv === null) ? null : avgCvr,
            type: "percent",
          },
          {
            label: "성과 CPA",
            value: scored.some((r) => r.conv === null) ? null : avgCpa,
            type: "currency",
          },
        ],
      },
      {
        label: "총 매출액",
        value: scored.some((r) => r.revenue === null) ? null : tRev,
        type: "currency",
        subMetrics: [
          {
            label: "성과 ROAS",
            value: scored.some((r) => r.revenue === null) ? null : avgRoas,
            type: "percent",
          },
        ],
      },
    ],
    headers: campaignData["MAIN"].headers,
  };
}
