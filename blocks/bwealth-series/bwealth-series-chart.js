/*
 * BWealth Series — กราฟเงินลงทุนสะสม
 *
 * port มาจาก SavingToolsV2/Graph/SavingToolsGraph.tsx (recharts) มาเป็น Chart.js
 * ใช้ตัวเดียวกับที่ saving-plan ใช้อยู่ (/scripts/vendor/chart.umd.js) จึงไม่มี dependency เพิ่ม
 *
 * ต่างจาก saving-plan ตรงที่แกน X ของ V2 เป็น "เดือน" (1..ปี*12) แล้วค่อย
 * format tick ให้แสดงเป็นปี ไม่ใช่ plot รายปีแบบ saving-plan
 */

const COLOR_ORIGINAL = '#0064FF';
const COLOR_NEW = '#002850';

export async function loadChartJs() {
  if (window.Chart) return window.Chart;
  await new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = '/scripts/vendor/chart.umd.js';
    script.onload = resolve;
    script.onerror = resolve;
    document.head.appendChild(script);
  });
  return window.Chart || null;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

// ตรงกับ formatNumberToK ของฝั่ง React ที่ใช้กับ tick แกน Y
function formatNumberToK(value) {
  if (!Number.isFinite(value) || value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1000000) {
    const m = value / 1000000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (abs >= 1000) {
    const k = value / 1000;
    return `${k % 1 === 0 ? k : k.toFixed(1)}K`;
  }
  return String(Math.round(value));
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* กล่อง "ลงทุนเดือนละ" — เทียบเท่า renderMonthlySavingAnnotation ใน recharts */
function drawMonthlyTag(ctx, x, y, label, value, unit, bg) {
  const boxW = 138;
  const boxH = 56;
  ctx.save();
  ctx.fillStyle = bg;
  drawRoundedRect(ctx, x, y, boxW, boxH, 6);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.font = '12px "BBL Sans", system-ui, sans-serif';
  ctx.fillText(label, x + boxW / 2, y + 20);
  ctx.font = 'bold 15px "BBL Sans", system-ui, sans-serif';
  ctx.fillText(`${formatNumber(value)} ${unit}`, x + boxW / 2, y + 41);
  ctx.restore();
}

/* ป้าย "เงินลงทุนเป้าหมาย" — เทียบเท่า renderSavingGoalAnnotation */
function drawGoalLabel(ctx, x, y, label, value, unit, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.font = '12px "BBL Sans", system-ui, sans-serif';
  ctx.fillText(label, x, y);
  ctx.font = 'bold 15px "BBL Sans", system-ui, sans-serif';
  ctx.fillText(`${formatNumber(value)} ${unit}`, x, y + 20);
  ctx.restore();
}

function buildOverlayPlugin({
  original, current, originalResult, currentResult, graphTexts, unit,
}) {
  const monthlyLabel = graphTexts.monthlySavingLabel || '';
  const goalLabel = graphTexts.savingGoalLabel || '';

  // ฝั่ง React เลือกระยะ offset ตามว่าเส้นไหนสูงกว่าที่เดือนแรก เพื่อไม่ให้ป้ายทับกัน
  const originalHigherAtStart = current && current[0]
    ? original[0].accumulatedValue > current[0].accumulatedValue
    : true;
  const OFFSET_LOWER = 50;
  const OFFSET_HIGHER = 100;

  return {
    id: 'bwealthSeriesOverlay',
    afterDatasetsDraw(chart) {
      const { ctx, scales: { x: xScale, y: yScale } } = chart;
      if (!xScale || !yScale) return;

      const first = original[0];
      const last = original[original.length - 1];

      const startX = xScale.getPixelForValue(first.month);
      const startY = yScale.getPixelForValue(first.accumulatedValue);
      drawMonthlyTag(
        ctx,
        startX + 6,
        startY - (originalHigherAtStart ? OFFSET_HIGHER : OFFSET_LOWER),
        monthlyLabel,
        originalResult.SavingMonth,
        unit,
        COLOR_ORIGINAL,
      );

      drawGoalLabel(
        ctx,
        xScale.getPixelForValue(last.month) - 6,
        yScale.getPixelForValue(last.accumulatedValue) - 44,
        goalLabel,
        originalResult.FutureValue,
        unit,
        COLOR_ORIGINAL,
      );

      if (!current || !currentResult) return;
      const cFirst = current[0];
      const cLast = current[current.length - 1];
      if (currentResult.SavingMonth !== 0) {
        drawMonthlyTag(
          ctx,
          xScale.getPixelForValue(cFirst.month) + 6,
          yScale.getPixelForValue(cFirst.accumulatedValue)
            - (originalHigherAtStart ? OFFSET_LOWER : OFFSET_HIGHER),
          monthlyLabel,
          currentResult.SavingMonth,
          unit,
          COLOR_NEW,
        );
      }
      if (currentResult.FutureValue !== 0) {
        drawGoalLabel(
          ctx,
          xScale.getPixelForValue(cLast.month) - 6,
          yScale.getPixelForValue(cLast.accumulatedValue) - 58,
          goalLabel,
          currentResult.FutureValue,
          unit,
          COLOR_NEW,
        );
      }
    },
  };
}

export function buildChartLegend(graphTexts, hasStepUp) {
  const stepUpIcon = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21.6 20.9999H3V2.3999" stroke="${COLOR_ORIGINAL}" stroke-width="2" stroke-miterlimit="10"></path>
      <path d="M8 18V15H12V11H16V7H20V3" stroke="${COLOR_ORIGINAL}" stroke-width="2"></path>
    </svg>`;
  const stepUpItem = hasStepUp ? `
    <span class="bwealth-series-legend-item">
      ${stepUpIcon}
      <span class="bwealth-series-legend-text">${graphTexts.savingIncreasedSteppedLabel || ''}</span>
    </span>` : '';

  return `
    <div class="bwealth-series-legend">
      <div class="bwealth-series-legend-row">
        <span class="bwealth-series-legend-item">
          <span class="bwealth-series-legend-dot"></span>
          <span class="bwealth-series-legend-text">${graphTexts.originalCalculationLabel || ''}</span>
        </span>
        ${stepUpItem}
      </div>
    </div>
  `;
}

function buildConfig({
  original, current, graphTexts, yearsToSave, overlay,
}) {
  const values = [
    ...original.map((p) => p.accumulatedValue),
    ...(current ? current.map((p) => p.accumulatedValue) : []),
  ];
  const yMax = Math.max(...values, 1) * 1.25;

  const datasets = [{
    label: graphTexts.originalCalculationLabel || '',
    data: original.map((p) => ({ x: p.month, y: p.accumulatedValue })),
    borderColor: COLOR_ORIGINAL,
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 0,
    tension: 0.3,
  }];

  if (current) {
    datasets.push({
      label: graphTexts.newCalculationLabel || '',
      data: current.map((p) => ({ x: p.month, y: p.accumulatedValue })),
      borderColor: COLOR_NEW,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0.3,
    });
  }

  // ticks ทุกสิ้นปี แล้ว format กลับเป็นเลขปี — ตรงกับ recharts เดิม
  const yearTicks = Array.from({ length: yearsToSave }, (unused, i) => (i + 1) * 12);

  return {
    type: 'line',
    data: { datasets },
    plugins: [overlay],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      // ที่ว่างสำหรับป้ายกำกับมาจาก yMax ที่เผื่อไว้ 25% แล้ว ไม่ต้อง padding ซ้ำ
      // (ต้นฉบับ recharts ใช้ margin top 8 เท่านี้เหมือนกัน)
      layout: { padding: { top: 8, right: 8, bottom: 8 } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          type: 'linear',
          min: 1,
          max: yearsToSave * 12,
          afterBuildTicks: (axis) => {
            axis.ticks = yearTicks.map((v) => ({ value: v }));
          },
          grid: { drawOnChartArea: false, drawTicks: true, tickLength: 6 },
          border: { display: true, color: '#C8C8CC' },
          ticks: {
            color: '#636366',
            font: { size: 12, family: '"BBL Sans", system-ui, sans-serif' },
            callback: (value) => `${value / 12}`,
          },
          title: {
            display: true,
            text: graphTexts.xAxisLabel || '',
            color: '#636366',
            font: { size: 12, family: '"BBL Sans", system-ui, sans-serif' },
          },
        },
        y: {
          min: 0,
          max: yMax,
          grid: { color: '#E6E6EA', drawTicks: false, borderDash: [3, 3] },
          border: { display: false, dash: [3, 3] },
          ticks: {
            color: '#636366',
            font: { size: 12, family: '"BBL Sans", system-ui, sans-serif' },
            padding: 8,
            callback: (value) => formatNumberToK(value),
          },
          title: {
            display: true,
            text: graphTexts.yAxisLabel || '',
            color: '#636366',
            font: { size: 12, family: '"BBL Sans", system-ui, sans-serif' },
          },
        },
      },
    },
  };
}

/**
 * วาด/วาดใหม่กราฟลงใน state.chartCanvas
 * @param {object} state state ของ block (ถือ chartInstance ไว้)
 * @param {object} params ข้อมูลกราฟและ texts
 */
export async function renderChart(state, {
  original, current, originalResult, currentResult, graphTexts, unit, yearsToSave,
}) {
  const Chart = await loadChartJs();
  if (!Chart || !original || !original.length || !originalResult) return;

  const canvas = state.root.querySelector('.bwealth-series-chart');
  if (!canvas) return;

  if (state.chartInstance) {
    try { state.chartInstance.destroy(); } catch (e) { /* ignore */ }
    state.chartInstance = null;
  }

  const overlay = buildOverlayPlugin({
    original, current, originalResult, currentResult, graphTexts, unit,
  });
  state.chartInstance = new Chart(
    canvas,
    buildConfig({
      original, current, graphTexts, yearsToSave, overlay,
    }),
  );
}

export function destroyChart(state) {
  if (!state.chartInstance) return;
  try { state.chartInstance.destroy(); } catch (e) { /* ignore */ }
  state.chartInstance = null;
}
