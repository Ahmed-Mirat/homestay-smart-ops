#!/usr/bin/env node
/**
 * 竹悦云庐 功能演示数据生成器
 *
 * 生成14天竞品价格历史 + 最新采集快照 + 趋势分析 + 可视化看板
 * 纯本地运行，无需OTA账号或网络连接
 *
 * 用法: node demo-setup.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'assets', 'data');
const WIDGET_DIR = path.join(__dirname, '..', '..', '_shared', 'data', 'widgets');
const CONFIG_PATH = path.join(__dirname, '..', 'assets', 'pricing-config.json');

// ======== 竹悦云庐 真实房型数据 ========
const MY_ROOMS = [
  { name: '山景大床房', basePrice: 688, cost: 280, count: 4 },
  { name: '亲子家庭房', basePrice: 888, cost: 380, count: 2 },
  { name: '云庐全景套房', basePrice: 1288, cost: 580, count: 1 },
];

// ======== 竞品房型模拟数据 ========
const COMPETITOR_ROOMS = {
  '莫干山云溪山居': {
    tier: '高端', distance: '300m',
    rooms: [
      { name: '山景大床房', basePrice: 758, area: '28-32㎡', bed: '1张1.8米大床', breakfast: '含双早', cancelPolicy: '入住当天18:00前免费取消' },
      { name: '竹韵套房', basePrice: 1380, area: '45-50㎡', bed: '1张2米特大床', breakfast: '含双早+下午茶', cancelPolicy: '入住前1天18:00前免费取消' },
      { name: '亲子家庭房', basePrice: 980, area: '35-40㎡', bed: '1张大床+1张单人床', breakfast: '含三早', cancelPolicy: '入住当天18:00前免费取消' },
    ],
  },
  '竹海人家': {
    tier: '中端', distance: '800m',
    rooms: [
      { name: '标准大床房', basePrice: 458, area: '20-25㎡', bed: '1张1.5米大床', breakfast: '无早餐', cancelPolicy: '入住当天12:00前免费取消' },
      { name: '山景双床房', basePrice: 528, area: '25-28㎡', bed: '2张1.2米单人床', breakfast: '含双早', cancelPolicy: '入住当天18:00前免费取消' },
      { name: '豪华大床房', basePrice: 658, area: '30-35㎡', bed: '1张1.8米大床', breakfast: '含双早', cancelPolicy: '入住前1天免费取消' },
    ],
  },
  '山间雅舍': {
    tier: '经济', distance: '1.2km',
    rooms: [
      { name: '经济大床房', basePrice: 298, area: '15-18㎡', bed: '1张1.5米大床', breakfast: '无早餐', cancelPolicy: '不可取消' },
      { name: '舒适双床房', basePrice: 388, area: '20-25㎡', bed: '2张1.2米单人床', breakfast: '无早餐', cancelPolicy: '入住当天18:00前免费取消' },
    ],
  },
};

// ======== 活动标签库 ========
const PROMO_POOLS = [
  [],
  ['连住优惠'],
  ['新客立减'],
  ['早鸟价'],
  ['连住优惠', '新客立减'],
  ['限时特惠'],
  ['满减'],
  ['连住优惠', '早鸟价'],
  [],
  ['闪住'],
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rand(0, arr.length - 1)]; }
function jitter(base, pct) { return Math.round(base * (1 + (Math.random() - 0.5) * pct * 2)); }

/**
 * Generate a single scrape snapshot
 */
function generateSnapshot(dateStr, dayIndex) {
  const results = [];
  const isWeekend = [5, 6, 0].includes(new Date(dateStr).getDay());
  const weekendPremium = isWeekend ? 1.15 : 1.0;

  Object.entries(COMPETITOR_ROOMS).forEach(([compName, compData]) => {
    ['携程', '美团', '飞猪'].forEach(platform => {
      const rooms = compData.rooms.map((roomTmpl, ri) => {
        // Base price with sinusoidal trend + weekend effect + random noise
        const trendFactor = 1 + Math.sin((dayIndex / 14) * Math.PI * 2 + ri) * 0.08;
        const rawPrice = Math.round(roomTmpl.basePrice * trendFactor * weekendPremium);
        const price = jitter(rawPrice, 0.03);
        const hasPromo = Math.random() > 0.6;
        const originalPrice = hasPromo ? Math.round(price * (1.1 + Math.random() * 0.2)) : '';
        const promotions = hasPromo ? pick(PROMO_POOLS.filter(p => p.length > 0)) || [] : [];
        const hasFewRooms = isWeekend && Math.random() > 0.5;

        return {
          name: roomTmpl.name,
          price: '¥' + price,
          originalPrice: originalPrice ? '¥' + originalPrice : '',
          promotions,
          remainingRooms: hasFewRooms ? rand(1, 3) : null,
          roomCount: compData.rooms.length,
          area: roomTmpl.area,
          bed: roomTmpl.bed,
          breakfast: roomTmpl.breakfast,
          cancelPolicy: roomTmpl.cancelPolicy,
        };
      });

      const promoCount = rooms.filter(r => r.promotions.length > 0).length;
      const origCount = rooms.filter(r => r.originalPrice !== '').length;

      results.push({
        competitor: compName,
        competitorTier: compData.tier,
        competitorDistance: compData.distance,
        platform,
        platformKey: platform === '携程' ? 'ctrip' : platform === '美团' ? 'meituan' : 'fliggy',
        url: '',
        hotelName: compName,
        rating: (4.3 + Math.random() * 0.6).toFixed(1),
        reviewCount: rand(120, 580) + '点评',
        hotelPromotions: isWeekend ? ['周末特惠'] : [],
        rooms,
        scrapeTime: dateStr + ' 08:30:' + String(rand(10, 59)).padStart(2, '0'),
        status: 'success',
      });
    });
  });

  return {
    scrapeTime: dateStr + ' 08:30:00',
    results,
    failures: [],
    summary: {
      totalCompetitors: 3,
      successCount: 9,
      failureCount: 0,
      totalRooms: results.reduce((s, r) => s + r.rooms.length, 0),
      roomsWithRemaining: results.reduce((s, r) => s + r.rooms.filter(rm => rm.remainingRooms !== null).length, 0),
      roomsWithPromotions: results.reduce((s, r) => s + r.rooms.filter(rm => rm.promotions.length > 0).length, 0),
      roomsWithOriginalPrice: results.reduce((s, r) => s + r.rooms.filter(rm => rm.originalPrice !== '').length, 0),
      loginExpiredPlatforms: [],
    },
  };
}

/**
 * Generate 14 days of history
 */
function generateHistory() {
  const history = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
    history.push(generateSnapshot(dateStr, 13 - i));
  }
  return history;
}

/**
 * Build widget data for dashboard rendering
 */
function buildWidgetData(history) {
  const latest = history[history.length - 1];

  // KPI calculation
  const myAdr = Math.round(MY_ROOMS.reduce((s, r) => s + r.basePrice, 0) / MY_ROOMS.length);
  const compPrices = [];
  latest.results.forEach(r => r.rooms.forEach(rm => {
    const p = parseInt((rm.price || '').replace('¥', ''));
    if (p) compPrices.push(p);
  }));
  const compAvg = Math.round(compPrices.reduce((a, b) => a + b, 0) / compPrices.length);
  const occValues = [58, 62, 55, 60, 65, 72, 78, 75, 70, 68, 74, 80, 76, 72];

  // Anomaly detection (from trend analysis)
  const anomalies = [];
  const prevSnapshot = history[history.length - 2];
  if (prevSnapshot) {
    latest.results.forEach(r => {
      r.rooms.forEach(rm => {
        const currPrice = parseInt((rm.price || '').replace('¥', ''));
        const prevRoom = prevSnapshot.results
          .find(pr => pr.competitor === r.competitor && pr.platform === r.platform)
          ?.rooms?.find(prm => prm.name === rm.name);
        if (prevRoom) {
          const prevPrice = parseInt((prevRoom.price || '').replace('¥', ''));
          if (prevPrice > 0 && currPrice > 0) {
            const changePct = ((currPrice - prevPrice) / prevPrice) * 100;
            if (Math.abs(changePct) > 15) {
              anomalies.push({
                room: `${r.competitor} ${rm.name}`,
                type: changePct > 0 ? 'price_spike' : 'price_drop',
                severity: Math.abs(changePct) > 25 ? 'high' : 'medium',
                message: `${r.competitor} ${rm.name} ${changePct > 0 ? '涨' : '跌'} ${Math.abs(Math.round(changePct))}%（¥${prevPrice}→¥${currPrice}）`,
              });
            }
          }
        }
      });
    });
  }

  // Trend chart data
  const trendDatasets = [];
  const colors = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6'];
  let colorIdx = 0;

  // Pick top 5 room+competitor combos for trend chart
  const trendItems = [];
  Object.entries(COMPETITOR_ROOMS).forEach(([compName, compData]) => {
    compData.rooms.forEach(room => {
      const series = history.map((snap, si) => {
        const r = snap.results.find(r => r.competitor === compName && r.platform === '携程');
        const rm = r?.rooms?.find(rm => rm.name === room.name);
        const p = rm ? parseInt((rm.price || '').replace('¥', '')) : null;
        return p ? { x: snap.scrapeTime.slice(0, 10), y: p } : null;
      }).filter(Boolean);

      if (series.length >= 3) {
        trendDatasets.push({
          label: `${compName} ${room.name}`,
          data: series,
          borderColor: colors[colorIdx % colors.length],
          backgroundColor: 'transparent',
          tension: 0.3,
          pointRadius: 2,
        });
        colorIdx++;
      }
    });
  });

  return {
    kpis: {
      adr: { value: myAdr, change: '+3.8%', direction: 'up' },
      occ: { value: 72, change: '+3.1%', direction: 'up', suffix: '%' },
      revpar: { value: Math.round(myAdr * 0.72), change: '+7.1%', direction: 'up' },
      compAvg: { value: compAvg, change: ((compAvg - myAdr) / myAdr * 100).toFixed(1) + '%', direction: compAvg > myAdr ? 'down' : 'up' },
    },
    suggestions: MY_ROOMS.map(r => {
      const competitorsSameRoom = [];
      latest.results.forEach(res => {
        res.rooms.forEach(rm => {
          if (rm.name.includes('大床') && r.name.includes('大床')) competitorsSameRoom.push(parseInt((rm.price || '').replace('¥', '')));
          if (rm.name.includes('家庭') && r.name.includes('家庭')) competitorsSameRoom.push(parseInt((rm.price || '').replace('¥', '')));
          if (rm.name.includes('套房') && r.name.includes('套房')) competitorsSameRoom.push(parseInt((rm.price || '').replace('¥', '')));
        });
      });
      const compMedian = competitorsSameRoom.length > 0
        ? competitorsSameRoom.sort((a, b) => a - b)[Math.floor(competitorsSameRoom.length / 2)]
        : r.basePrice;
      const suggested = Math.round((compMedian + r.basePrice) / 2);
      const change = ((suggested - r.basePrice) / r.basePrice * 100);
      return {
        room: r.name,
        platform: '全平台',
        current: r.basePrice,
        suggested,
        change: (change > 0 ? '+' : '') + change.toFixed(1) + '%',
        direction: change > 0 ? 'up' : 'down',
        confidence: competitorsSameRoom.length >= 4 ? 'high' : 'mid',
        roomKey: r.name.replace(/[^\w]/g, '_'),
      };
    }),
    competitors: latest.results.flatMap(r =>
      r.rooms.slice(0, 2).map(rm => ({
        name: r.competitor,
        platform: r.platform,
        room: rm.name,
        price: parseInt((rm.price || '0').replace('¥', '')),
        rating: r.rating,
        promo: rm.promotions.length > 0 ? rm.promotions[0] : '无',
      }))
    ).slice(0, 10),
    factors: [
      { name: '成本底线', value: '¥280-580/晚', impact: '利润率38-45%', impactTag: 'keep', weight: '20%' },
      { name: '竞品中位价', value: '¥' + compAvg, impact: myAdr < compAvg ? '我方低于市场' : '我方高于市场', impactTag: myAdr < compAvg ? 'up' : 'warn', weight: '25%' },
      { name: '预测入住率', value: '72%', impact: '供需平衡偏紧', impactTag: 'up', weight: '25%' },
      { name: '距入住天数', value: '7-14天', impact: '时间充裕', impactTag: 'keep', weight: '15%' },
      { name: '渠道差异', value: '美团偏低5%', impact: '需关注', impactTag: 'warn', weight: '15%' },
    ],
    compChart: {
      labels: MY_ROOMS.map(r => r.name),
      mine: MY_ROOMS.map(r => r.basePrice),
      compAvg: MY_ROOMS.map(r => {
        const related = [];
        latest.results.forEach(res => res.rooms.forEach(rm => {
          if ((rm.name.includes('大床') && r.name.includes('大床')) ||
              (rm.name.includes('家庭') && r.name.includes('家庭')) ||
              (rm.name.includes('套房') && r.name.includes('套房'))) {
            related.push(parseInt((rm.price || '').replace('¥', '')));
          }
        }));
        return related.length > 0 ? Math.round(related.reduce((a, b) => a + b, 0) / related.length) : r.basePrice;
      }),
      compMax: MY_ROOMS.map(r => {
        const related = [];
        latest.results.forEach(res => res.rooms.forEach(rm => {
          if ((rm.name.includes('大床') && r.name.includes('大床')) ||
              (rm.name.includes('家庭') && r.name.includes('家庭')) ||
              (rm.name.includes('套房') && r.name.includes('套房'))) {
            related.push(parseInt((rm.price || '').replace('¥', '')));
          }
        }));
        return related.length > 0 ? Math.max(...related) : Math.round(r.basePrice * 1.15);
      }),
    },
    occChart: { data: occValues, target: 70 },
    trendChart: { type: 'line', title: '竞品价格趋势', datasets: trendDatasets.slice(0, 5) },
    anomalies,
    alertCount: anomalies.length > 0 ? anomalies.length : Math.floor(Math.random() * 3) + 1,
  };
}

/**
 * Render dashboard HTML from widget data
 */
function renderDashboard(widgetData) {
  const templatePath = path.join(__dirname, '..', 'assets', 'dashboard-widget.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  // Inject data
  const injected = template.replace(
    'window.__WIDGET_DATA__ || {',
    'window.__WIDGET_DATA__ = ' + JSON.stringify(widgetData, null, 2) + '; window.__WIDGET_DATA__ || {'
  );

  ensureDir(WIDGET_DIR);
  const outputPath = path.join(WIDGET_DIR, 'zhuyueyunlu-demo-dashboard.html');
  fs.writeFileSync(outputPath, injected, 'utf-8');
  return outputPath;
}

// ======== Main ========
function main() {
  console.log('\n🏡 竹悦云庐 · 智能运营演示数据生成');
  console.log('='.repeat(50));

  ensureDir(DATA_DIR);

  // Step 1: Generate history
  console.log('\n📊 Step 1/5: 生成14天历史竞品数据...');
  const history = generateHistory();
  fs.writeFileSync(path.join(DATA_DIR, 'history.json'), JSON.stringify(history, null, 2), 'utf-8');
  console.log(`   ✅ history.json (${history.length} snapshots, ${history[0].results.length * history[0].results[0].rooms.length} data points)`);

  // Step 2: Save latest
  console.log('\n📄 Step 2/5: 保存最新采集快照...');
  fs.writeFileSync(path.join(DATA_DIR, 'latest.json'), JSON.stringify(history[history.length - 1], null, 2), 'utf-8');
  console.log('   ✅ latest.json');

  // Step 3: Build widget data
  console.log('\n📈 Step 3/5: 计算KPI + 生成调价建议...');
  const widgetData = buildWidgetData(history);
  fs.writeFileSync(path.join(DATA_DIR, 'widget-data.json'), JSON.stringify(widgetData, null, 2), 'utf-8');
  console.log(`   ✅ KPI: ADR ¥${widgetData.kpis.adr.value} | OCC ${widgetData.kpis.occ.value}% | RevPAR ¥${widgetData.kpis.revpar.value}`);
  console.log(`   ✅ 调价建议: ${widgetData.suggestions.length} 条`);
  console.log(`   ✅ 异常检测: ${widgetData.anomalies.length} 条`);

  // Step 4: Trend analysis
  console.log('\n🔍 Step 4/5: 趋势分析...');
  const prices = [];
  history.forEach(snap => snap.results.forEach(r => r.rooms.forEach(rm => {
    const p = parseInt((rm.price || '').replace('¥', ''));
    if (p) prices.push(p);
  })));
  const trendAnalysis = {
    analyzedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    dataRange: {
      from: history[0].scrapeTime,
      to: history[history.length - 1].scrapeTime,
      snapshots: history.length,
    },
    summary: {
      totalCompetitors: 3,
      totalRooms: 8,
      trendDistribution: { rising: 3, falling: 1, stable: 4 },
      anomalyCount: widgetData.anomalies.length,
      highSeverityAnomalies: widgetData.anomalies.filter(a => a.severity === 'high').length,
      priceRange: { min: Math.min(...prices), max: Math.max(...prices), avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) },
    },
    anomalies: widgetData.anomalies,
    competitors: Object.entries(COMPETITOR_ROOMS).map(([name, data]) => ({
      competitor: name, platform: '携程',
      rooms: data.rooms.map(r => ({ name: r.name, trend: pick(['stable', 'stable', 'stable', 'rising', 'falling']), latestPrice: jitter(r.basePrice, 0.05) })),
    })),
  };
  fs.writeFileSync(path.join(DATA_DIR, 'trend-analysis.json'), JSON.stringify(trendAnalysis, null, 2), 'utf-8');
  console.log('   ✅ trend-analysis.json');

  // Step 5: Render dashboard
  console.log('\n🎨 Step 5/5: 渲染可视化看板...');
  const dashboardPath = renderDashboard(widgetData);
  console.log(`   ✅ ${dashboardPath}`);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('✅ 演示环境就绪！');
  console.log('');
  console.log('📊 数据资产:');
  console.log(`   ${path.join(DATA_DIR, 'latest.json')}`);
  console.log(`   ${path.join(DATA_DIR, 'history.json')} (14天趋势)`);
  console.log(`   ${path.join(DATA_DIR, 'trend-analysis.json')}`);
  console.log(`   ${path.join(DATA_DIR, 'widget-data.json')}`);
  console.log('');
  console.log('🎨 可视化看板:');
  console.log(`   ${dashboardPath}`);
  console.log('');
  console.log('💡 演示建议:');
  console.log('   1. 打开看板 HTML → 展示竞品对比 + 调价建议 + KPI卡片');
  console.log('   2. 说"采集竞品数据" → 演示 scraper 工作流（需OTA登录）');
  console.log('   3. 说"价格趋势" → 演示历史趋势分析');
  console.log('   4. 说"帮我排班" → 演示保洁排班功能');
  console.log('   5. 说"301完成" → 演示任务确认流程');
  console.log('   6. 说"打开工作台" → 演示全功能面板');
  console.log('   7. 说"客人问WiFi密码" → 演示智能客服');
  console.log('');
}

main();