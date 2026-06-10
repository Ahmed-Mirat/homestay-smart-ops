/**
 * 民宿竞品数据采集器 v3.3
 * 
 * v3.3 变更：
 *   - 新增活动标签采集（promotions）：连住优惠/早鸟价/新客立减/满减/限时特惠等
 *   - 新增原价/划线价采集（originalPrice）：区分活动价与原价
 *   - 新增房型总数统计（roomCount）：自动从采集结果填充
 *   - 携程 extractor：活动标签 + 原价 + 酒店级活动标签
 *   - 美团 extractor：活动标签 + 划线价检测（del标签/文本多价格）
 *   - 飞猪 extractor：活动标签 + .pi-old-price 划线价
 *   - 去哪儿/同程 extractor：活动标签框架（需国内网络实测校准）
 * 
 * v3.2 变更：
 *   - 所有平台 extractor 新增 remainingRooms（剩余房量）字段
 *   - 携程 extractor 基于实测详情页 DOM 重写（叶子节点遍历 + 语义过滤）
 *   - 去哪儿 extractor 重写为健壮的通用提取器（需国内网络实测校准）
 *   - 采集输出增加剩余房量展示和统计
 *   - 携程实测发现：剩余房量仅在库存紧张时显示“仅剩X间”，充足时不显示
 * 
 * v3.1 变更：
 *   - 新增去哪儿（qunar）和同程（tongcheng）平台支持
 *   - 去哪儿 extractor 基于通用文本语义过滤（消费者端有反爬重定向，待国内网络实测）
 *   - 同程 extractor 基于实测 Vue + li.hotelItem DOM 结构
 * 
 * v3.0 变更：
 *   - OTA 平台配置抽取到 ota-platforms.js（携程/美团/飞猪三平台独立维护）
 *   - 美团 extractor 基于实测 Vue H5 DOM 重写（文本语义过滤）
 *   - 飞猪 extractor 基于实测 KISSY PC端 DOM 重写
 *   - 三平台均仅需消费者端普通账号，无需商家后台
 *   - 登录态检测：携程"登录看低价"/美团"登录后查看+URL重定向"/飞猪"登录查看+淘宝重定向"
 * 
 * 用法：
 *   node scraper.js init                    # 首次初始化：打开登录页，等待用户登录
 *   node scraper.js check                   # 检查各平台登录状态
 *   node scraper.js scrape                  # 执行竞品数据采集
 *   node scraper.js history                 # 查看历史采集记录
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', '_shared', 'node_modules', 'playwright'));
const OTA_PLATFORMS = require('./ota-platforms');

// ============ 路径配置 ============

const ROOT_DIR = path.join(__dirname, '..');
const PROFILE_DIR = path.join(ROOT_DIR, 'browser-profile');
const CONFIG_PATH = path.join(ROOT_DIR, 'assets', 'pricing-config.json');
const DATA_DIR = path.join(ROOT_DIR, 'assets', 'data');
const LATEST_PATH = path.join(DATA_DIR, 'latest.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');

// ============ 工具函数 ============

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ 配置文件不存在:', CONFIG_PATH);
    console.error('请先填写 pricing-config.json');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function loadHistory() {
  ensureDataDir();
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveToHistory(report) {
  const history = loadHistory();
  history.push(report);
  // 只保留最近30条记录
  if (history.length > 30) history.splice(0, history.length - 30);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), 'utf-8');
}

function saveLatest(report) {
  ensureDataDir();
  fs.writeFileSync(LATEST_PATH, JSON.stringify(report, null, 2), 'utf-8');
}

// ============ 核心功能 ============

/**
 * 初始化：打开OTA登录页，等待用户手动登录
 * 登录状态自动保存到 browser-profile/
 * ⚠️ 美团和飞猪详情页需要登录才能看到价格
 */
async function initLogin() {
  console.log('\n🔑 竞品采集器 - 登录初始化（消费者端）');
  console.log('='.repeat(50));
  console.log('即将打开各OTA平台登录页面。');
  console.log('⚠️ 美团/飞猪详情页需要登录才能看到价格，携程也需要登录看低价。');
  console.log('请在浏览器中手动完成登录，登录后状态会自动保存。');
  console.log('所有平台登录完成后，关闭浏览器即可。');
  console.log('='.repeat(50));

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  });

  for (const [key, platform] of Object.entries(OTA_PLATFORMS)) {
    console.log(`\n📱 正在打开 ${platform.name} 登录页...`);
    const page = await browser.newPage();
    // 飞猪使用 PC端 viewport 登录淘宝账号
    if (key === 'fliggy') {
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await page.goto(platform.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);
  }

  console.log('\n✅ 所有平台已打开，请在浏览器中完成登录。');
  console.log('⏳ 等待您关闭浏览器...');

  await browser.waitForEvent('close').catch(() => {});
  console.log('\n✅ 登录状态已保存！后续采集无需重复登录。');
}

/**
 * 检查各平台登录状态
 */
async function checkLoginStatus() {
  console.log('\n🔍 检查各平台登录状态...');
  console.log('='.repeat(50));

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  });

  const results = {};

  for (const [key, platform] of Object.entries(OTA_PLATFORMS)) {
    try {
      const page = await browser.newPage();
      await page.goto(platform.listUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);

      // 使用各平台特有的检测逻辑
      const info = await platform.extractors.extractHotelInfo(page);
      const isLoggedIn = !info.needsLogin;

      results[key] = {
        platform: platform.name,
        loggedIn: isLoggedIn,
        status: isLoggedIn ? '✅ 已登录' : '❌ 未登录/已过期'
      };

      console.log(`${platform.name}: ${results[key].status}`);
    } catch (err) {
      results[key] = { platform: platform.name, loggedIn: false, status: `⚠️ 检查失败: ${err.message}` };
      console.log(`${platform.name}: ⚠️ 检查失败`);
    }
  }

  await browser.close();

  const allLoggedIn = Object.values(results).every(r => r.loggedIn);
  if (allLoggedIn) {
    console.log('\n✅ 所有平台登录状态有效，可以执行采集！');
  } else {
    console.log('\n⚠️ 部分平台需要重新登录，请运行: node scraper.js init');
  }

  return results;
}

/**
 * 执行竞品数据采集（核心流程）
 */
async function scrapeCompetitors() {
  const config = loadConfig();
  const competitors = config.competitors || [];

  if (competitors.length === 0) {
    console.error('❌ 未配置竞品列表，请在 pricing-config.json 中添加竞品');
    process.exit(1);
  }

  console.log('\n📊 竞品数据采集');
  console.log(`采集时间: ${formatDate()}`);
  console.log(`竞品数量: ${competitors.length}`);
  console.log('='.repeat(50));

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
  });

  const report = {
    scrapeTime: formatDate(),
    results: [],
    failures: [],
    summary: {
      totalCompetitors: competitors.length,
      successCount: 0,
      failureCount: 0,
      totalRooms: 0,
      roomsWithRemaining: 0,
      loginExpiredPlatforms: [],
    }
  };

  for (const comp of competitors) {
    console.log(`\n🏠 采集: ${comp.name}`);

    for (const [platformKey, url] of Object.entries(comp.urls || {})) {
      const platform = OTA_PLATFORMS[platformKey];
      if (!platform) {
        console.log(`  ⚠️ 未知平台: ${platformKey}`);
        continue;
      }

      try {
        const page = await browser.newPage();
        // 飞猪使用 PC端 viewport
        if (platformKey === 'fliggy') {
          await page.setViewportSize({ width: 1280, height: 800 });
        }
        console.log(`  📱 ${platform.name} - 正在打开...`);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        // 等待动态内容渲染
        await sleep(4000);

        // 检测登录状态
        const hotelInfo = await platform.extractors.extractHotelInfo(page);
        if (hotelInfo.needsLogin) {
          report.failures.push({
            competitor: comp.name,
            platform: platform.name,
            error: '登录态过期',
            suggestion: '运行 node scraper.js init 重新登录'
          });
          report.summary.loginExpiredPlatforms.push(platform.name);
          console.log(`  ❌ ${platform.name} - 登录态过期`);
          continue;
        }

        // 提取房型价格数据
        const roomData = await platform.extractors.extractRoomData(page);

        // 处理 extractRoomData 可能返回 { rooms, needsLogin } 或纯数组
        let rooms = [];
        if (Array.isArray(roomData)) {
          rooms = roomData;
        } else if (roomData && roomData.needsLogin) {
          // 美团/飞猪可能在 extractRoomData 内部检测到登录过期
          report.failures.push({
            competitor: comp.name,
            platform: platform.name,
            error: '登录态过期（页面重定向）',
            suggestion: '运行 node scraper.js init 重新登录'
          });
          report.summary.loginExpiredPlatforms.push(platform.name);
          console.log(`  ❌ ${platform.name} - 登录态过期（页面重定向）`);
          continue;
        } else if (roomData && Array.isArray(roomData.rooms)) {
          rooms = roomData.rooms;
        }

        // ── v3.3: 填充房型总数 roomCount ──
        const totalRoomCount = rooms.length;
        rooms.forEach(room => {
          room.roomCount = totalRoomCount;
        });

        const result = {
          competitor: comp.name,
          competitorTier: comp.tier || '',
          competitorDistance: comp.distance || '',
          platform: platform.name,
          platformKey: platformKey,
          url: url,
          hotelName: hotelInfo.hotelName || comp.name,
          rating: hotelInfo.rating || '',
          reviewCount: hotelInfo.reviewCount || '',
          hotelPromotions: hotelInfo.hotelPromotions || [],  // v3.3: 酒店级活动标签
          rooms: rooms,
          scrapeTime: formatDate(),
          status: 'success'
        };

        report.results.push(result);
        report.summary.successCount++;
        report.summary.totalRooms += rooms.length;

        // 统计有剩余房量信息的房型
        const roomsWithRemaining = rooms.filter(r => r.remainingRooms !== null && r.remainingRooms !== undefined);
        report.summary.roomsWithRemaining += roomsWithRemaining.length;

        // ── v3.3: 统计有活动标签的房型 ──
        const roomsWithPromotions = rooms.filter(r => r.promotions && r.promotions.length > 0);
        const roomsWithOriginalPrice = rooms.filter(r => r.originalPrice && r.originalPrice !== '');
        report.summary.roomsWithPromotions = (report.summary.roomsWithPromotions || 0) + roomsWithPromotions.length;
        report.summary.roomsWithOriginalPrice = (report.summary.roomsWithOriginalPrice || 0) + roomsWithOriginalPrice.length;

        // 采集日志：展示房型数量、活动标签、原价、剩余房量信息
        console.log(`  ✅ ${platform.name} - 采集成功 (${rooms.length}个房型${roomsWithPromotions.length > 0 ? `，${roomsWithPromotions.length}个有活动` : ''})`);
        rooms.forEach(room => {
          const remaining = room.remainingRooms !== null && room.remainingRooms !== undefined
            ? ` [剩余${room.remainingRooms}间]`
            : '';
          const promo = room.promotions && room.promotions.length > 0
            ? ` 【${room.promotions.join(',')}】`
            : '';
          const origPrice = room.originalPrice && room.originalPrice !== ''
            ? ` (原价${room.originalPrice})`
            : '';
          console.log(`     ${room.name}: ${room.price}${origPrice}${promo}${remaining}`);
        });

        // 页面间等待，避免限流
        await sleep(5000);
      } catch (err) {
        report.failures.push({
          competitor: comp.name,
          platform: platform.name,
          error: err.message
        });
        report.summary.failureCount++;
        console.log(`  ❌ ${platform.name} - 采集失败: ${err.message}`);
      }
    }
  }

  await browser.close();

  // 保存结果
  saveLatest(report);
  saveToHistory(report);

  console.log('\n' + '='.repeat(50));
  console.log(`✅ 采集完成！成功: ${report.summary.successCount}, 失败: ${report.summary.failureCount}`);
  console.log(`📊 共采集 ${report.summary.totalRooms} 个房型，其中 ${report.summary.roomsWithRemaining} 个有剩余房量信息，${report.summary.roomsWithPromotions || 0} 个有活动标签，${report.summary.roomsWithOriginalPrice || 0} 个有原价信息`);
  console.log(`📄 最新数据: ${LATEST_PATH}`);
  console.log(`📄 历史记录: ${HISTORY_PATH}`);

  if (report.summary.loginExpiredPlatforms.length > 0) {
    console.log(`\n⚠️ 以下平台登录过期: ${report.summary.loginExpiredPlatforms.join(', ')}`);
    console.log('   请运行: node scraper.js init');
  }

  if (report.failures.length > 0) {
    console.log('\n⚠️ 失败项:');
    report.failures.forEach(f => {
      console.log(`  - ${f.competitor} (${f.platform}): ${f.error}`);
    });
  }

  return report;
}

/**
 * 查看历史采集记录
 */
function showHistory() {
  const history = loadHistory();
  if (history.length === 0) {
    console.log('\n📭 暂无历史采集记录');
    return;
  }

  console.log(`\n📊 历史采集记录 (共${history.length}条)`);
  console.log('='.repeat(50));

  history.forEach((record, index) => {
    const successCount = record.results?.length || 0;
    const failureCount = record.failures?.length || 0;
    console.log(`${index + 1}. ${record.scrapeTime} | 成功:${successCount} 失败:${failureCount}`);
  });

  console.log('\n最近一次采集详情:');
  const latest = history[history.length - 1];
  if (latest.results) {
    latest.results.forEach(r => {
      console.log(`  ${r.competitor} (${r.platform}): ${r.rooms.length}个房型`);
      if (r.hotelPromotions && r.hotelPromotions.length > 0) {
        console.log(`    酒店活动: ${r.hotelPromotions.join(', ')}`);
      }
      r.rooms.forEach(room => {
        const remaining = room.remainingRooms !== null && room.remainingRooms !== undefined
          ? ` [剩余${room.remainingRooms}间]`
          : '';
        const promo = room.promotions && room.promotions.length > 0
          ? ` 【${room.promotions.join(',')}】`
          : '';
        const origPrice = room.originalPrice && room.originalPrice !== ''
          ? ` (原价${room.originalPrice})`
          : '';
        console.log(`    - ${room.name}: ${room.price}${origPrice}${promo}${remaining}`);
      });
    });
  }
}

// ============ CLI 入口 ============

async function main() {
  const command = process.argv[2] || 'help';

  switch (command) {
    case 'init':
      await initLogin();
      break;
    case 'check':
      await checkLoginStatus();
      break;
    case 'scrape':
      await scrapeCompetitors();
      break;
    case 'history':
      showHistory();
      break;
    case 'help':
    default:
      console.log(`
🏨 民宿竞品数据采集器 v3.3

用法:
  node scraper.js init      首次初始化：打开OTA消费者端登录页，手动登录后自动保存状态
  node scraper.js check     检查各平台登录状态是否有效
  node scraper.js scrape    执行竞品数据采集（需先完成init登录）
  node scraper.js history   查看历史采集记录

⚠️ 重要说明:
  - 所有平台均仅需消费者端普通账号，无需商家后台权限
  - 美团/飞猪详情页需要登录才能看到价格
  - 携程也需要登录才能看到低价
  - 去哪儿消费者端在海外IP下会被重定向，需国内网络实测
  - 同程列表页可用，但详情页价格需登录查看

采集字段（v3.3）:
  - 房型名称（大床房/双床房/家庭房/钟点房等）
  - 房间价格（活动价/卖价）
  - 原价/划线价（如有活动时显示，无活动时为空）
  - 活动标签（连住优惠/早鸟价/新客立减/满减/限时特惠等）
  - 房型总数（该竞品在售房型数量）
  - 剩余房量（"仅剩X间"时显示数字，否则为null表示充足）
  - 面积、床型、早餐、取消政策

自动化原理:
  1. 首次运行 init → 打开浏览器 → 用户手动登录 → 状态保存到 browser-profile/
  2. 后续运行 scrape → 加载已保存的 profile → 自动保持登录 → 提取价格数据
  3. 登录过期时 → 自动检测登录提示文字 / URL重定向 → 提示重新 init

数据输出:
  最新数据:  ${LATEST_PATH}
  历史记录:  ${HISTORY_PATH}
  看板读取:  Skill读取 latest.json 驱动数据看板渲染

技术说明:
  - 携程基于Taro框架，使用叶子节点遍历 + 文本语义过滤提取（v3.2实测）
  - 美团基于Vue H5，使用通用文本语义过滤（适配 hue-base-* CSS框架）
  - 飞猪基于KISSY PC端，使用 .pi-price + 文本语义过滤提取数据
  - 去哪儿使用通用提取器（需国内网络实测校准DOM选择器）
  - 同程基于Vue + li.hotelItem + div.name/.score/.price（实测列表页可用）
  - 采集间隔≥5秒/页，避免触发OTA限流
      `);
      break;
  }
}

main().catch(err => {
  console.error('❌ 执行出错:', err.message);
  process.exit(1);
});