export function buildChartLegend(labels, getIcon) {
  return `
    <div class="saving-plan-chart-legend">
      <div class="saving-plan-chart-legend-row">
        <span class="saving-plan-chart-legend-item">
          <span class="saving-plan-chart-legend-dot saving-plan-chart-legend-dot-result"></span>
          <span class="saving-plan-chart-legend-text">${labels.legendResult}</span>
        </span>
        <span class="saving-plan-chart-legend-item">
          <span class="saving-plan-chart-legend-icon" data-icon-original="fixed">${getIcon('step-up')}</span>
          <span class="saving-plan-chart-legend-icon" data-icon-original="stepup" hidden>${getIcon('step-up-adjusted')}</span>
          <span class="saving-plan-chart-legend-text" data-variant-original>${labels.legendFixed}</span>
        </span>
      </div>
      <div class="saving-plan-chart-legend-row" data-newplan-row hidden>
        <span class="saving-plan-chart-legend-item">
          <span class="saving-plan-chart-legend-dot saving-plan-chart-legend-dot-newplan"></span>
          <span class="saving-plan-chart-legend-text">${labels.legendNewPlan}</span>
        </span>
        <span class="saving-plan-chart-legend-item">
          <span class="saving-plan-chart-legend-icon" data-icon-newplan="fixed">${getIcon('step-up')}</span>
          <span class="saving-plan-chart-legend-icon" data-icon-newplan="stepup" hidden>${getIcon('step-up-adjusted')}</span>
          <span class="saving-plan-chart-legend-text" data-variant-newplan>${labels.legendFixed}</span>
        </span>
      </div>
    </div>
  `;
}

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

function getChartColors(block) {
  const style = getComputedStyle(block);
  return {
    result: style.getPropertyValue('--sp-chart-result').trim() || '#1e6ffb',
    newPlan: style.getPropertyValue('--sp-chart-new-plan').trim() || '#0f2a44',
    axis: style.getPropertyValue('--sp-chart-axis').trim() || '#555',
    border: style.getPropertyValue('--sp-chart-border').trim() || '#aaa',
    grid: style.getPropertyValue('--sp-chart-grid').trim() || '#c8c8c8',
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

function formatCompact(val) {
  if (!Number.isFinite(val) || val === 0) return '0';
  const abs = Math.abs(val);
  if (abs >= 1_000_000) {
    const m = val / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (abs >= 1000) {
    const k = val / 1000;
    return `${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return String(Math.round(val));
}

function projectBalance({
  balance, monthly, years, annualReturn, annualIncrease,
}) {
  const r = annualReturn / 100;
  const g = annualIncrease / 100;
  const rm = (1 + r) ** (1 / 12) - 1;
  const points = [{ year: 0, value: balance }];
  let current = balance;
  for (let i = 0; i < years; i += 1) {
    const yearMonthly = monthly * (1 + g) ** i;
    let yearEnd = current;
    for (let m = 0; m < 12; m += 1) {
      yearEnd = yearEnd * (1 + rm) + yearMonthly;
    }
    current = yearEnd;
    points.push({ year: i + 1, value: current });
  }
  return points;
}

function scaleSeriesToFuture(series, futureValue) {
  const last = series[series.length - 1]?.value || 0;
  if (!Number.isFinite(futureValue) || futureValue <= 0 || last <= 0) return series;
  const scale = futureValue / last;
  return series.map((point) => ({
    ...point,
    value: point.year === 0 ? point.value : point.value * scale,
  }));
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

function drawMonthlyTag(ctx, cx, cy, line1, line2, bg) {
  const pad = 10;
  const lh = 17;
  const boxW = 140;
  const boxH = 47;
  const x = cx - boxW / 2;
  const y = cy - boxH / 2;
  ctx.save();
  ctx.fillStyle = bg;
  drawRoundedRect(ctx, x, y, boxW, boxH, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '11px system-ui,sans-serif';
  ctx.fillText(line1, cx, y + pad + 12);
  ctx.font = 'bold 14px system-ui,sans-serif';
  ctx.fillText(line2, cx, y + pad + lh + 12);
  ctx.restore();
}

function drawGoalLabel(ctx, x, y, line1, line2, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.font = '11px system-ui,sans-serif';
  ctx.fillText(line1, x, y);
  ctx.font = 'bold 13px system-ui,sans-serif';
  ctx.fillText(line2, x, y + 15);
  ctx.restore();
}

function buildChartOverlayPlugin(originalSeries, newSeries, monthly, monthlyNew, labels, colors) {
  const monthlyLabel = labels.monthlySavingsTag || 'Monthly savings';
  const goalLabel = labels.goalAmountTag || 'Goal amount';

  return {
    id: 'savingPlanOverlay',
    afterDraw(chart) {
      const { ctx, scales: { x: xScale, y: yScale } } = chart;
      const lastIdx = originalSeries.length - 1;
      const lastYear = originalSeries[lastIdx].year;
      const goalX = xScale.getPixelForValue(lastYear) - 6;
      const boxH = 48;
      const boxW = 140;
      // Monthly-savings tags: anchored near the origin (just right of the
      // y-axis) and sitting just above the x-axis baseline.
      const tagX = xScale.getPixelForValue(0) + boxW / 2 + 6;
      const baseY = yScale.getPixelForValue(0);
      // bottom box sits just above the x-axis baseline
      const bottomTagY = baseY - boxH / 2 - 4;

      const origVal = formatNumber(monthly);

      if (newSeries) {
        // New-plan (dark) stacked on top, Result (light blue) on the bottom,
        // overlapping slightly so the two boxes read as one connected pair.
        const newVal = formatNumber(monthlyNew);
        const overlap = 0;
        const topTagY = bottomTagY - (boxH - overlap);
        drawMonthlyTag(ctx, tagX, bottomTagY, monthlyLabel, origVal, colors.result);
        drawMonthlyTag(ctx, tagX, topTagY, monthlyLabel, newVal, colors.newPlan);
      } else {
        drawMonthlyTag(ctx, tagX, bottomTagY, monthlyLabel, origVal, colors.result);
      }

      const origEndY = yScale.getPixelForValue(originalSeries[lastIdx].value);
      const originalGoal = formatNumber(originalSeries[lastIdx].value);

      if (newSeries) {
        const newGoal = formatNumber(newSeries[lastIdx].value);
        const yearW = xScale.getPixelForValue(lastYear) - xScale.getPixelForValue(lastYear - 1);
        // New-plan (dark) label sits just UNDER the dark line, offset left of the
        // end; the dark line's height at that x is interpolated from the last two
        // points. Result (blue) label stays above the lower line end at the right.
        const darkXFrac = 0.7;
        const vEnd = newSeries[lastIdx].value;
        const vPrev = newSeries[lastIdx - 1]?.value ?? vEnd;
        const darkLineY = yScale.getPixelForValue(vEnd - (vEnd - vPrev) * darkXFrac);
        const darkX = goalX - yearW * darkXFrac;
        drawGoalLabel(ctx, darkX, darkLineY + 16, goalLabel, newGoal, colors.newPlan);
        drawGoalLabel(ctx, goalX, origEndY - 8, goalLabel, originalGoal, colors.result);
      } else {
        drawGoalLabel(ctx, goalX, origEndY - 32, goalLabel, originalGoal, colors.result);
      }
    },
  };
}

function buildChartConfig(originalSeries, newSeries, labels, overlayPlugin, colors) {
  const years = originalSeries.map((p) => p.year);
  const allValues = [
    ...originalSeries.map((p) => p.value),
    ...(newSeries ? newSeries.map((p) => p.value) : []),
  ];
  const dataMax = Math.max(...allValues, 1);
  const yMax = dataMax * 1.25;

  const datasets = [
    {
      label: labels.legendResult,
      data: originalSeries.map((p) => p.value),
      borderColor: colors.result,
      backgroundColor: 'transparent',
      tension: 0,
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 0,
    },
  ];
  if (newSeries) {
    datasets.push({
      label: labels.legendNewPlan,
      data: newSeries.map((p) => p.value),
      borderColor: colors.newPlan,
      backgroundColor: 'transparent',
      tension: 0,
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 0,
    });
  }

  return {
    type: 'line',
    data: { labels: years, datasets },
    plugins: overlayPlugin ? [overlayPlugin] : [],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      layout: {
        padding: {
          right: 10, top: 10, left: 4, bottom: 0,
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: labels.xAxis || 'Year(s)',
            color: colors.axis,
            font: { size: 12, family: 'system-ui, sans-serif' },
          },
          grid: {
            // no vertical gridlines across the plot, but keep tick marks
            drawOnChartArea: false,
            drawTicks: true,
            tickLength: 6,
            // no tick mark at the origin (index 0); keep them for years 1..n
            tickColor: (ctx) => (ctx.index === 0 ? 'transparent' : colors.border),
          },
          border: { display: true, color: colors.border },
          ticks: {
            color: colors.axis,
            font: { size: 12, family: 'system-ui, sans-serif' },
            padding: 6,
            // hide the "0" label under the origin; keep years 1..n
            callback(value) {
              const label = this.getLabelForValue(value);
              return Number(label) === 0 ? '' : label;
            },
          },
        },
        y: {
          min: 0,
          max: yMax,
          title: {
            display: true,
            text: labels.yAxis || 'Amount (baht)',
            color: colors.axis,
            font: { size: 12, family: 'system-ui, sans-serif' },
          },
          // Explicit ticks in 1.5M steps (0, 1.5M, 3M …) plus the max on top,
          // dropping any regular tick that would crowd the max.
          afterBuildTicks: (axis) => {
            const top = axis.max;
            const step = 1500000;
            const ticks = [];
            for (let v = 0; v < top - step / 2; v += step) ticks.push({ value: v });
            ticks.push({ value: top });
            axis.ticks = ticks;
          },
          ticks: {
            callback: (val) => formatCompact(val),
            color: colors.axis,
            font: { size: 12, family: 'system-ui, sans-serif' },
          },
          grid: {
            color: colors.grid,
            lineWidth: 1,
            drawTicks: false,
          },
          // dashed horizontal gridlines: the grid line dash is driven by
          // border.dash in this Chart.js build, not grid.borderDash.
          border: { display: false, dash: [4, 4] },
          beginAtZero: true,
        },
      },
    },
  };
}

function getSavingsVariantLabel(annualIncrease, labels) {
  return annualIncrease > 0 ? labels.legendStepUp : labels.legendFixed;
}

function setVariantIcon(root, key, isStepUp) {
  const fixedIcon = root.querySelector(`[data-icon-${key}="fixed"]`);
  const stepUpIcon = root.querySelector(`[data-icon-${key}="stepup"]`);
  if (fixedIcon) fixedIcon.toggleAttribute('hidden', isStepUp);
  if (stepUpIcon) stepUpIcon.toggleAttribute('hidden', !isStepUp);
}

function updateLegend(root, data, originalIncrease, newIncrease, hasNewPlan) {
  const originalVariant = getSavingsVariantLabel(originalIncrease, data.labels.chart);
  const newVariant = getSavingsVariantLabel(newIncrease, data.labels.chart);
  const originalText = root.querySelector('[data-variant-original]');
  const newText = root.querySelector('[data-variant-newplan]');
  if (originalText) originalText.textContent = originalVariant;
  if (newText) newText.textContent = newVariant;
  // Icon must match the text: rising (step-up) icon only when the annual
  // increase is > 0; otherwise the flat "Fixed savings" icon.
  setVariantIcon(root, 'original', originalIncrease > 0);
  setVariantIcon(root, 'newplan', newIncrease > 0);
  const newplanRow = root.querySelector('[data-newplan-row]');
  if (newplanRow) newplanRow.toggleAttribute('hidden', !hasNewPlan);
}

export async function renderChart(state, data) {
  const Chart = await loadChartJs();
  if (!Chart) return;

  const inputs = state.calculatedInputs;
  if (!inputs) return;

  const canvasWrap = state.root.querySelector('.saving-plan-chart-canvas-wrap');
  if (!canvasWrap) return;

  const calculation = state.calculatedCalculation;
  if (!calculation) return;

  const monthly = calculation.SavingMonth;
  let original = projectBalance({
    balance: inputs.balance,
    monthly,
    years: inputs.goalPeriod,
    annualReturn: inputs.annualReturn,
    annualIncrease: inputs.annualIncrease,
  });
  original = scaleSeriesToFuture(original, calculation.FutureValue);

  let newSeries = null;
  let tweakMonthly = 0;
  if (state.tweakActive && state.tweakInputs && state.tweakCalculation) {
    const t = state.tweakInputs;
    tweakMonthly = state.tweakCalculation.SavingMonth;
    newSeries = projectBalance({
      balance: inputs.balance,
      monthly: tweakMonthly,
      years: inputs.goalPeriod,
      annualReturn: t.annualReturn,
      annualIncrease: t.annualIncrease,
    });
    newSeries = scaleSeriesToFuture(newSeries, state.tweakCalculation.FutureValue);
  }

  if (state.chartInstance) {
    try { state.chartInstance.destroy(); } catch (_) { /* ignore */ }
    state.chartInstance = null;
  }

  if (state.chartResizeObserver) {
    state.chartResizeObserver.disconnect();
    state.chartResizeObserver = null;
  }

  const oldCanvas = canvasWrap.querySelector('.saving-plan-chart');
  const canvas = document.createElement('canvas');
  canvas.className = 'saving-plan-chart';
  if (oldCanvas) canvasWrap.replaceChild(canvas, oldCanvas);
  else canvasWrap.appendChild(canvas);

  await new Promise((resolve) => { setTimeout(resolve, 100); });

  const cw = canvasWrap.offsetWidth || 600;
  const ch = canvasWrap.offsetHeight || (cw < 600 ? 220 : 300);
  canvas.width = cw;
  canvas.height = ch;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  try {
    const colors = getChartColors(state.root);
    const chartLabels = data.labels.chart;
    const overlayArgs = [original, newSeries, monthly, tweakMonthly, chartLabels, colors];
    const overlayPlugin = buildChartOverlayPlugin(...overlayArgs);
    const config = buildChartConfig(original, newSeries, chartLabels, overlayPlugin, colors);
    config.options.responsive = false;
    state.chartInstance = new Chart(ctx, config);
    canvas.style.height = '';
    const heightObserver = new MutationObserver(() => {
      if (canvas.style.height) canvas.style.height = '';
    });
    heightObserver.observe(canvas, { attributes: true, attributeFilter: ['style'] });
    if (!state.chartResizeObserver && window.ResizeObserver) {
      state.chartResizeObserver = new ResizeObserver(() => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(
          () => state.chartInstance?.resize(),
        ));
      });
      state.chartResizeObserver.observe(canvasWrap);
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => state.chartInstance?.resize());
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[saving-plan] Chart.js creation error:', err);
  }

  const newIncrease = state.tweakInputs?.annualIncrease ?? inputs.annualIncrease;
  updateLegend(state.root, data, inputs.annualIncrease, newIncrease, !!newSeries);
}
