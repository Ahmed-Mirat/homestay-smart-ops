/**
 * 竞品价格趋势分析器 v1.0
 *
 * 功能：
 *   1. 历史价格时间序列分析（by 竞品/平台/房型）
 *   2. 环比分析（vs 上一采集周期、vs 昨日、vs 上周同期）
 *   3. 异常价格检测（24h 涨跌 >20%、连续多期不变、新低/新高）
 *   4. 趋势方向判定（上涨/下跌/平稳）
 *   5. 输出 JSON 供看板 Chart.js 消费
 *
 * 用法：
 *   node trend-analyzer.js analyze              # 分析全部历史数据
 *   node trend-analyzer.js analyze --days 7     # 分析最近 N 天
 *   node trend-analyzer.js anomalies            # 仅检测异常
 *   node trend-analyzer.js chart-data           # 输出看板 Chart.js 数据
 */

const fs = require('fs');
const path = require('path');

// ============ 路径配置 ============

const DATA_DIR = path.join(__dirname, '..', 'assets', 'data');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const TREND_OUTPUT = path.join(DATA_DIR, 'trend-analysis.json');
const ANOMALY_OUTPUT = path.join(DATA_DIR, 'anomalies.json');
const CHART_OUTPUT = path.join(DATA_DIR, 'chart-data.json');

// ============ 工具函数 ============

function loadHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    console.error('history.json not found');
    return [];
  }
  return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Parse price string like "¥528" or "¥528起" to number
 */
function parsePrice(str) {
  if (!str || str === '未获取到') return null;
  const match = str.match(/¥(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Build a time-series index: competitor -> platform -> roomName -> [ {time, price} ]
 */
function buildTimeSeries(history, daysBack) {
  const series = {};
  const cutoff = daysBack
    ? new Date(Date.now() - daysBack * 86400000).toISOString().replace('T', ' ').slice(0, 19)
    : null;

  history.forEach(snapshot => {
    if (cutoff && snapshot.scrapeTime < cutoff) return;

    const time = snapshot.scrapeTime;
    (snapshot.results || []).forEach(result => {
      const comp = result.competitor || 'unknown';
      const plat = result.platform || 'unknown';
      const key = `${comp}|${plat}`;

      if (!series[key]) series[key] = { competitor: comp, platform: plat, rooms: {} };

      (result.rooms || []).forEach(room => {
        const price = parsePrice(room.price);
        if (price === null) return;
        const name = room.name || 'unknown';

        if (!series[key].rooms[name]) series[key].rooms[name] = [];
        series[key].rooms[name].push({ time, price });
      });
    });
  });

  return series;
}

// ============ 分析功能 ============

/**
 * Calculate price statistics for a price array
 */
function calcStats(prices) {
  if (prices.length === 0) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const sum = prices.reduce((a, b) => a + b, 0);
  const avg = sum / prices.length;
  const median = sorted[Math.floor(sorted.length / 2)];

  // Standard deviation
  const variance = prices.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  return {
    count: prices.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(avg),
    median,
    stdDev: Math.round(stdDev),
    latest: prices[prices.length - 1],
    first: prices[0],
  };
}

/**
 * Detect trend direction from price time-series
 * Returns: 'rising' | 'falling' | 'stable'
 */
function detectTrend(entries) {
  if (entries.length < 3) return 'insufficient_data';

  const prices = entries.map(e => e.price);
  const recent = prices.slice(-3);
  const older = prices.slice(0, Math.max(1, prices.length - 3));

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  if (olderAvg === 0) return 'stable';
  const changePct = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (changePct > 3) return 'rising';
  if (changePct < -3) return 'falling';
  return 'stable';
}

/**
 * Detect anomalies in a single room's price history
 */
function detectAnomalies(roomName, entries) {
  const anomalies = [];
  if (entries.length < 2) return anomalies;

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1].price;
    const curr = entries[i].price;
    const changePct = prev > 0 ? ((curr - prev) / prev) * 100 : 0;

    // Rule 1: 24h spike/drop > 20%
    if (Math.abs(changePct) > 20) {
      anomalies.push({
        room: roomName,
        type: changePct > 0 ? 'price_spike' : 'price_drop',
        severity: Math.abs(changePct) > 40 ? 'high' : 'medium',
        from: prev,
        to: curr,
        changePct: Math.round(changePct * 10) / 10,
        time: entries[i].time,
        message: `价格${changePct > 0 ? '暴涨' : '暴跌'} ${Math.abs(Math.round(changePct))}%（${prev}→${curr}）`,
      });
    }
  }

  // Rule 2: Price unchanged for 3+ consecutive periods (suspicious)
  let unchangedStreak = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].price === entries[i - 1].price) {
      unchangedStreak++;
    } else {
      unchangedStreak = 0;
    }
  }
  if (unchangedStreak >= 3) {
    anomalies.push({
      room: roomName,
      type: 'price_stale',
      severity: 'low',
      message: `价格连续 ${unchangedStreak + 1} 期未变动（${entries[entries.length - 1].price}元），可能未及时更新`,
      time: entries[entries.length - 1].time,
    });
  }

  // Rule 3: New all-time high or low
  const stats = calcStats(entries.map(e => e.price));
  if (stats) {
    const latest = entries[entries.length - 1].price;
    if (latest === stats.max && entries.length > 1) {
      anomalies.push({
        room: roomName,
        type: 'new_high',
        severity: 'medium',
        price: latest,
        time: entries[entries.length - 1].time,
        message: `价格触及历史最高 ${latest} 元`,
      });
    }
    if (latest === stats.min && entries.length > 1) {
      anomalies.push({
        room: roomName,
        type: 'new_low',
        severity: 'medium',
        price: latest,
        time: entries[entries.length - 1].time,
        message: `价格触及历史最低 ${latest} 元`,
      });
    }
  }

  return anomalies;
}

/**
 * Main analysis function
 */
function analyzeHistory(daysBack) {
  const history = loadHistory();
  if (history.length === 0) {
    console.log('No history data to analyze');
    return null;
  }

  const series = buildTimeSeries(history, daysBack);
  const analysis = {
    analyzedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    dataRange: {
      from: history[0].scrapeTime,
      to: history[history.length - 1].scrapeTime,
      snapshots: history.length,
      daysBack: daysBack || 'all',
    },
    competitors: [],
    anomalies: [],
    summary: {},
  };

  let totalRooms = 0;
  let risingCount = 0;
  let fallingCount = 0;
  let stableCount = 0;

  Object.entries(series).forEach(([key, data]) => {
    const compEntry = { competitor: data.competitor, platform: data.platform, rooms: [] };

    Object.entries(data.rooms).forEach(([roomName, entries]) => {
      const stats = calcStats(entries.map(e => e.price));
      const trend = detectTrend(entries);
      const anomalies = detectAnomalies(roomName, entries);

      if (trend === 'rising') risingCount++;
      else if (trend === 'falling') fallingCount++;
      else stableCount++;

      totalRooms++;

      compEntry.rooms.push({
        name: roomName,
        trend,
        stats,
        samples: entries.length,
        latestPrice: entries[entries.length - 1].price,
        priceHistory: entries.slice(-14), // Last 14 data points for chart
      });

      analysis.anomalies.push(...anomalies);
    });

    analysis.competitors.push(compEntry);
  });

  analysis.summary = {
    totalCompetitors: analysis.competitors.length,
    totalRooms,
    trendDistribution: { rising: risingCount, falling: fallingCount, stable: stableCount },
    anomalyCount: analysis.anomalies.length,
    highSeverityAnomalies: analysis.anomalies.filter(a => a.severity === 'high').length,
  };

  return analysis;
}

/**
 * Output Chart.js compatible data for the dashboard
 */
function generateChartData(analysis) {
  if (!analysis || !analysis.competitors) return null;

  const datasets = [];
  const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

  analysis.competitors.forEach((comp, ci) => {
    comp.rooms.forEach((room, ri) => {
      if (room.priceHistory && room.priceHistory.length > 1) {
        datasets.push({
          label: `${comp.competitor} ${room.name} (${comp.platform})`,
          data: room.priceHistory.map(p => ({ x: p.time, y: p.price })),
          borderColor: colors[(ci + ri) % colors.length],
          backgroundColor: 'transparent',
          tension: 0.3,
          pointRadius: 2,
        });
      }
    });
  });

  return {
    type: 'line',
    title: '竞品价格趋势',
    xLabel: '采集时间',
    yLabel: '价格 (元)',
    datasets,
  };
}

// ============ CLI ============

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'analyze';
  const daysBack = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1], 10) : null;

  ensureDataDir();

  switch (command) {
    case 'analyze': {
      const analysis = analyzeHistory(daysBack);
      if (!analysis) break;
      fs.writeFileSync(TREND_OUTPUT, JSON.stringify(analysis, null, 2), 'utf-8');
      console.log(`Trend analysis saved to ${TREND_OUTPUT}`);
      console.log(`Competitors: ${analysis.summary.totalCompetitors}, Rooms: ${analysis.summary.totalRooms}`);
      console.log(`Trend: ↑${analysis.summary.trendDistribution.rising} ↓${analysis.summary.trendDistribution.falling} →${analysis.summary.trendDistribution.stable}`);
      console.log(`Anomalies: ${analysis.summary.anomalyCount} (${analysis.summary.highSeverityAnomalies} high severity)`);
      if (analysis.anomalies.length > 0) {
        console.log('\n⚠️ Anomalies:');
        analysis.anomalies.forEach(a => console.log(`  [${a.severity}] ${a.message}`));
      }
      break;
    }

    case 'anomalies': {
      const analysis = analyzeHistory(daysBack);
      if (!analysis) break;
      fs.writeFileSync(ANOMALY_OUTPUT, JSON.stringify(analysis.anomalies, null, 2), 'utf-8');
      console.log(`Anomalies saved to ${ANOMALY_OUTPUT} (${analysis.anomalies.length} found)`);
      analysis.anomalies.forEach(a => console.log(`  [${a.severity}] ${a.message}`));
      break;
    }

    case 'chart-data': {
      const analysis = analyzeHistory(daysBack);
      if (!analysis) break;
      const chartData = generateChartData(analysis);
      fs.writeFileSync(CHART_OUTPUT, JSON.stringify(chartData, null, 2), 'utf-8');
      console.log(`Chart data saved to ${CHART_OUTPUT} (${chartData.datasets.length} datasets)`);
      break;
    }

    default:
      console.log(`
Price Trend Analyzer v1.0

Usage:
  node trend-analyzer.js analyze              Full analysis (all history)
  node trend-analyzer.js analyze --days 7     Analysis for last N days
  node trend-analyzer.js anomalies            Detect price anomalies only
  node trend-analyzer.js chart-data           Generate Chart.js compatible data

Output:
  ${TREND_OUTPUT}
  ${ANOMALY_OUTPUT}
  ${CHART_OUTPUT}
      `);
  }
}

main();