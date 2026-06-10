/**
 * 民宿 Skill 套件 — OTA 商家后台数据读取器
 * 
 * 通过 Browser Agent 从各 OTA 平台商家后台采集经营数据：
 * - 订单数据（近期订单列表）
 * - 房态数据（各房间当前状态）
 * - 营收数据（营收统计）
 * - 挂牌价数据（各平台当前挂牌价格）
 * 
 * 用法：
 *   node ota-reader.js orders [--days 7]             采集近N天订单
 *   node ota-reader.js room-status                   采集当前房态
 *   node ota-reader.js revenue [--days 30]           采集营收数据
 *   node ota-reader.js prices                        采集当前挂牌价
 *   node ota-reader.js daily                         日常全量采集（订单+房态+营收）
 *   node ota-reader.js full                          完整首次采集
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============ 路径配置 ============

const ROOT_DIR = path.join(__dirname, '..');
const PROFILES_DIR = path.join(ROOT_DIR, 'browser-profiles');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');

const DATA_FILES = {
  orders: path.join(DATA_DIR, 'orders.json'),
  roomStatus: path.join(DATA_DIR, 'room-status.json'),
  revenue: path.join(DATA_DIR, 'revenue.json'),
  priceCalendar: path.join(DATA_DIR, 'price-calendar.json'),
};

// ============ 平台数据采集配置 ============

const PLATFORM_READERS = {
  ctrip: {
    name: '携程',
    profileDir: 'ctrip-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      orders: 'https://ebooking.ctrip.com/home/order/list',
      roomStatus: 'https://ebooking.ctrip.com/home/room/status/calendar',
      revenue: 'https://ebooking.ctrip.com/home/data/overview',
      priceCalendar: 'https://ebooking.ctrip.com/home/room/price/calendar',
    },
    loginCheckText: ['登录', '请输入'],
    successCheckText: ['房型管理', '订单管理', '经营概况'],

    /**
     * 采集订单数据
     * 注意：DOM选择器需根据实际ebooking页面实测调整
     */
    async fetchOrders(page, days = 7) {
      await page.goto(this.urls.orders, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(3000);

      // 尝试提取订单表格数据
      const orders = await page.evaluate((daysBack) => {
        const results = [];
        
        // ebooking 订单列表通常是表格结构
        // 选择器需要实测，以下为通用提取策略
        const rows = document.querySelectorAll('table tbody tr, .order-item, .order-row, [class*="order"]');
        
        if (rows.length === 0) {
          // 如果找不到结构化元素，提取页面文本做初步解析
          const bodyText = document.body.innerText;
          return {
            note: '订单DOM结构待实测，返回页面原始文本摘要',
            rawTextSample: bodyText.slice(0, 2000),
            orderCount: (bodyText.match(/订单号/g) || []).length,
            extractedAt: new Date().toISOString(),
          };
        }

        rows.forEach(row => {
          const cells = row.querySelectorAll('td, .cell, span');
          if (cells.length >= 3) {
            results.push({
              raw: Array.from(cells).map(c => c.textContent.trim()).filter(t => t),
            });
          }
        });

        return results;
      }, days);

      return {
        platform: 'ctrip',
        type: 'orders',
        data: orders,
        fetchTime: formatDate(),
        daysRange: days,
      };
    },

    /**
     * 采集房态数据
     */
    async fetchRoomStatus(page) {
      await page.goto(this.urls.roomStatus, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(3000);

      const status = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return {
          note: '房态DOM结构待实测',
          rawTextSample: bodyText.slice(0, 2000),
          extractedAt: new Date().toISOString(),
        };
      });

      return {
        platform: 'ctrip',
        type: 'roomStatus',
        data: status,
        fetchTime: formatDate(),
      };
    },

    /**
     * 采集营收数据
     */
    async fetchRevenue(page, days = 30) {
      await page.goto(this.urls.revenue, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(3000);

      const revenue = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        
        // 尝试提取关键数字指标
        const numbers = bodyText.match(/[\d,]+\.?\d*/g) || [];
        const percentages = bodyText.match(/[\d.]+%/g) || [];
        
        return {
          note: '营收DOM结构待实测',
          rawTextSample: bodyText.slice(0, 2000),
          detectedNumbers: numbers.slice(0, 20),
          detectedPercentages: percentages,
          extractedAt: new Date().toISOString(),
        };
      });

      return {
        platform: 'ctrip',
        type: 'revenue',
        data: revenue,
        fetchTime: formatDate(),
        daysRange: days,
      };
    },

    /**
     * 采集当前挂牌价
     */
    async fetchPrices(page) {
      await page.goto(this.urls.priceCalendar, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(3000);

      const prices = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        
        // 提取价格相关文本
        const priceMatches = bodyText.match(/¥[\d,]+/g) || [];
        
        return {
          note: '价格日历DOM结构待实测',
          rawTextSample: bodyText.slice(0, 2000),
          detectedPrices: priceMatches,
          extractedAt: new Date().toISOString(),
        };
      });

      return {
        platform: 'ctrip',
        type: 'prices',
        data: prices,
        fetchTime: formatDate(),
      };
    },
  },

  meituan: {
    name: '美团',
    profileDir: 'meituan-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      orders: 'https://ehotel.meituan.com/order/list',
      roomStatus: 'https://ehotel.meituan.com/room/status',
      revenue: 'https://ehotel.meituan.com/data/report',
      priceCalendar: 'https://ehotel.meituan.com/room/price',
    },
    loginCheckText: ['登录', '手机号'],
    successCheckText: ['房型房价', '订单管理', '工作台'],

    async fetchOrders(page, days = 7) {
      return { platform: 'meituan', type: 'orders', data: { note: '美团订单采集待实测' }, fetchTime: formatDate() };
    },
    async fetchRoomStatus(page) {
      return { platform: 'meituan', type: 'roomStatus', data: { note: '美团房态采集待实测' }, fetchTime: formatDate() };
    },
    async fetchRevenue(page, days = 30) {
      return { platform: 'meituan', type: 'revenue', data: { note: '美团营收采集待实测' }, fetchTime: formatDate() };
    },
    async fetchPrices(page) {
      return { platform: 'meituan', type: 'prices', data: { note: '美团价格采集待实测' }, fetchTime: formatDate() };
    },
  },

  fliggy: {
    name: '飞猪',
    profileDir: 'fliggy-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      orders: 'https://merchant.fliggy.com/order/list',
      roomStatus: 'https://merchant.fliggy.com/room/status',
      revenue: 'https://merchant.fliggy.com/data/center',
      priceCalendar: 'https://merchant.fliggy.com/room/price',
    },
    loginCheckText: ['登录', '淘宝', '支付宝'],
    successCheckText: ['房源管理', '订单中心', '工作台'],

    async fetchOrders(page, days = 7) {
      return { platform: 'fliggy', type: 'orders', data: { note: '飞猪订单采集待实测' }, fetchTime: formatDate() };
    },
    async fetchRoomStatus(page) {
      return { platform: 'fliggy', type: 'roomStatus', data: { note: '飞猪房态采集待实测' }, fetchTime: formatDate() };
    },
    async fetchRevenue(page, days = 30) {
      return { platform: 'fliggy', type: 'revenue', data: { note: '飞猪营收采集待实测' }, fetchTime: formatDate() };
    },
    async fetchPrices(page) {
      return { platform: 'fliggy', type: 'prices', data: { note: '飞猪价格采集待实测' }, fetchTime: formatDate() };
    },
  },

  qunar: {
    name: '去哪儿',
    profileDir: 'qunar-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      orders: 'https://ehotel.qunar.com/order/list',
      roomStatus: 'https://ehotel.qunar.com/room/status',
      revenue: 'https://ehotel.qunar.com/data/overview',
      priceCalendar: 'https://ehotel.qunar.com/room/price',
    },
    loginCheckText: ['登录', '密码', '验证码'],
    successCheckText: ['订单管理', '房型管理', '数据中心'],

    async fetchOrders(page, days = 7) {
      return { platform: 'qunar', type: 'orders', data: { note: '去哪儿订单采集待实测' }, fetchTime: formatDate() };
    },
    async fetchRoomStatus(page) {
      return { platform: 'qunar', type: 'roomStatus', data: { note: '去哪儿房态采集待实测' }, fetchTime: formatDate() };
    },
    async fetchRevenue(page, days = 30) {
      return { platform: 'qunar', type: 'revenue', data: { note: '去哪儿营收采集待实测' }, fetchTime: formatDate() };
    },
    async fetchPrices(page) {
      return { platform: 'qunar', type: 'prices', data: { note: '去哪儿价格采集待实测' }, fetchTime: formatDate() };
    },
  },

  tongcheng: {
    name: '同程',
    profileDir: 'tongcheng-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      orders: 'https://e.ly.com/order/list',
      roomStatus: 'https://e.ly.com/room/status',
      revenue: 'https://e.ly.com/data/center',
      priceCalendar: 'https://e.ly.com/room/price',
    },
    loginCheckText: ['登录', '密码', '手机号'],
    successCheckText: ['订单管理', '房型管理', '数据中心'],

    async fetchOrders(page, days = 7) {
      return { platform: 'tongcheng', type: 'orders', data: { note: '同程订单采集待实测' }, fetchTime: formatDate() };
    },
    async fetchRoomStatus(page) {
      return { platform: 'tongcheng', type: 'roomStatus', data: { note: '同程房态采集待实测' }, fetchTime: formatDate() };
    },
    async fetchRevenue(page, days = 30) {
      return { platform: 'tongcheng', type: 'revenue', data: { note: '同程营收采集待实测' }, fetchTime: formatDate() };
    },
    async fetchPrices(page) {
      return { platform: 'tongcheng', type: 'prices', data: { note: '同程价格采集待实测' }, fetchTime: formatDate() };
    },
  },
};

// ============ 工具函数 ============

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatDate() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ 配置文件不存在:', CONFIG_PATH);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function saveData(type, data) {
  ensureDir(DATA_DIR);
  const filepath = DATA_FILES[type];
  if (!filepath) {
    console.error(`❌ 未知数据类型: ${type}`);
    return;
  }

  // 读取已有数据，合并
  let existing = {};
  if (fs.existsSync(filepath)) {
    try { existing = JSON.parse(fs.readFileSync(filepath, 'utf-8')); } catch {}
  }

  // 按平台合并
  if (!existing.platforms) existing.platforms = {};
  existing.platforms[data.platform] = data;
  existing.lastSync = formatDate();
  existing.type = type;

  fs.writeFileSync(filepath, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`  📄 数据已保存: ${path.basename(filepath)}`);
}

/**
 * 检查登录态
 */
async function checkLoginStatus(page, platformConfig) {
  const bodyText = await page.evaluate(() => document.body.innerText);
  const isOnLoginPage = platformConfig.loginCheckText.some(t => bodyText.includes(t));
  const isLoggedIn = platformConfig.successCheckText.some(t => bodyText.includes(t));
  return isLoggedIn && !isOnLoginPage;
}

// ============ 核心读取类 ============

class OtaReader {
  constructor() {
    this.config = loadConfig();
  }

  /**
   * 获取已启用的平台列表
   */
  getEnabledPlatforms() {
    const platforms = this.config.platforms || {};
    return Object.entries(platforms)
      .filter(([key, cfg]) => cfg.enabled && PLATFORM_READERS[key])
      .map(([key, cfg]) => key);
  }

  /**
   * 打开平台浏览器并验证登录
   */
  async openPlatform(platformKey) {
    const reader = PLATFORM_READERS[platformKey];
    if (!reader) throw new Error(`未知平台: ${platformKey}`);

    const profilePath = path.join(PROFILES_DIR, reader.profileDir);
    if (!fs.existsSync(profilePath)) {
      throw new Error(`未初始化登录。请运行: node browser-init.js init ${platformKey} merchant`);
    }

    const browser = await chromium.launchPersistentContext(profilePath, {
      headless: this.config.scraping?.headless !== false,
      viewport: reader.viewport,
      userAgent: reader.userAgent,
    });

    const page = await browser.newPage();
    return { browser, page, reader };
  }

  /**
   * 采集订单数据
   */
  async fetchOrders(days = 7) {
    console.log(`\n📋 采集订单数据 (近${days}天)`);
    console.log('='.repeat(50));

    const platforms = this.getEnabledPlatforms();
    const allResults = [];

    for (const platformKey of platforms) {
      console.log(`\n  🏪 ${PLATFORM_READERS[platformKey].name}...`);
      try {
        const { browser, page, reader } = await this.openPlatform(platformKey);

        // 先导航到首页检查登录态
        await page.goto(reader.urls.orders, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);

        const isLoggedIn = await checkLoginStatus(page, reader);
        if (!isLoggedIn) {
          console.log(`  ❌ ${reader.name} 登录态过期`);
          await browser.close();
          continue;
        }

        const result = await reader.fetchOrders(page, days);
        allResults.push(result);
        saveData('orders', result);
        console.log(`  ✅ ${reader.name} 订单数据采集完成`);

        await browser.close();
        await sleep(this.config.scraping?.intervalSeconds * 1000 || 5000);
      } catch (err) {
        console.log(`  ❌ ${PLATFORM_READERS[platformKey].name} 采集失败: ${err.message}`);
      }
    }

    return allResults;
  }

  /**
   * 采集房态数据
   */
  async fetchRoomStatus() {
    console.log(`\n🏠 采集房态数据`);
    console.log('='.repeat(50));

    const platforms = this.getEnabledPlatforms();
    const allResults = [];

    for (const platformKey of platforms) {
      console.log(`\n  🏪 ${PLATFORM_READERS[platformKey].name}...`);
      try {
        const { browser, page, reader } = await this.openPlatform(platformKey);
        await page.goto(reader.urls.roomStatus, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);

        const isLoggedIn = await checkLoginStatus(page, reader);
        if (!isLoggedIn) {
          console.log(`  ❌ ${reader.name} 登录态过期`);
          await browser.close();
          continue;
        }

        const result = await reader.fetchRoomStatus(page);
        allResults.push(result);
        saveData('roomStatus', result);
        console.log(`  ✅ ${reader.name} 房态数据采集完成`);

        await browser.close();
        await sleep(this.config.scraping?.intervalSeconds * 1000 || 5000);
      } catch (err) {
        console.log(`  ❌ ${PLATFORM_READERS[platformKey].name} 采集失败: ${err.message}`);
      }
    }

    return allResults;
  }

  /**
   * 采集营收数据
   */
  async fetchRevenue(days = 30) {
    console.log(`\n💰 采集营收数据 (近${days}天)`);
    console.log('='.repeat(50));

    const platforms = this.getEnabledPlatforms();
    const allResults = [];

    for (const platformKey of platforms) {
      console.log(`\n  🏪 ${PLATFORM_READERS[platformKey].name}...`);
      try {
        const { browser, page, reader } = await this.openPlatform(platformKey);
        await page.goto(reader.urls.revenue, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);

        const isLoggedIn = await checkLoginStatus(page, reader);
        if (!isLoggedIn) {
          console.log(`  ❌ ${reader.name} 登录态过期`);
          await browser.close();
          continue;
        }

        const result = await reader.fetchRevenue(page, days);
        allResults.push(result);
        saveData('revenue', result);
        console.log(`  ✅ ${reader.name} 营收数据采集完成`);

        await browser.close();
        await sleep(this.config.scraping?.intervalSeconds * 1000 || 5000);
      } catch (err) {
        console.log(`  ❌ ${PLATFORM_READERS[platformKey].name} 采集失败: ${err.message}`);
      }
    }

    return allResults;
  }

  /**
   * 采集当前挂牌价
   */
  async fetchPrices() {
    console.log(`\n💲 采集各平台当前挂牌价`);
    console.log('='.repeat(50));

    const platforms = this.getEnabledPlatforms();
    const allResults = [];

    for (const platformKey of platforms) {
      console.log(`\n  🏪 ${PLATFORM_READERS[platformKey].name}...`);
      try {
        const { browser, page, reader } = await this.openPlatform(platformKey);
        await page.goto(reader.urls.priceCalendar, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);

        const isLoggedIn = await checkLoginStatus(page, reader);
        if (!isLoggedIn) {
          console.log(`  ❌ ${reader.name} 登录态过期`);
          await browser.close();
          continue;
        }

        const result = await reader.fetchPrices(page);
        allResults.push(result);
        saveData('priceCalendar', result);
        console.log(`  ✅ ${reader.name} 价格数据采集完成`);

        await browser.close();
        await sleep(this.config.scraping?.intervalSeconds * 1000 || 5000);
      } catch (err) {
        console.log(`  ❌ ${PLATFORM_READERS[platformKey].name} 采集失败: ${err.message}`);
      }
    }

    return allResults;
  }

  /**
   * 日常采集（订单+房态+营收）
   */
  async dailySync() {
    console.log('\n📊 日常数据同步');
    console.log('═'.repeat(60));

    await this.fetchOrders(7);
    await this.fetchRoomStatus();
    await this.fetchRevenue(30);

    console.log('\n═'.repeat(60));
    console.log('✅ 日常数据同步完成！');
    console.log(`   数据目录: ${DATA_DIR}`);
  }

  /**
   * 完整首次采集
   */
  async fullSync() {
    console.log('\n📊 完整数据采集（首次使用）');
    console.log('═'.repeat(60));

    await this.fetchOrders(30);
    await this.fetchRoomStatus();
    await this.fetchRevenue(90);
    await this.fetchPrices();

    console.log('\n═'.repeat(60));
    console.log('✅ 完整数据采集完成！');
    console.log(`   数据目录: ${DATA_DIR}`);
  }
}

// ============ CLI 入口 ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  function getArg(name, defaultVal) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : defaultVal;
  }

  const reader = new OtaReader();

  switch (command) {
    case 'orders':
      await reader.fetchOrders(parseInt(getArg('days', '7')));
      break;
    case 'room-status':
      await reader.fetchRoomStatus();
      break;
    case 'revenue':
      await reader.fetchRevenue(parseInt(getArg('days', '30')));
      break;
    case 'prices':
      await reader.fetchPrices();
      break;
    case 'daily':
      await reader.dailySync();
      break;
    case 'full':
      await reader.fullSync();
      break;
    default:
      console.log(`
🏨 民宿 Skill 套件 — OTA 商家后台数据读取器

用法:
  node ota-reader.js orders [--days 7]      采集近N天订单数据
  node ota-reader.js room-status            采集当前房态
  node ota-reader.js revenue [--days 30]    采集营收数据
  node ota-reader.js prices                 采集各平台当前挂牌价
  node ota-reader.js daily                  日常全量采集（订单+房态+营收）
  node ota-reader.js full                   完整首次采集（含长周期数据）

数据输出:
  订单数据:   ${DATA_FILES.orders}
  房态数据:   ${DATA_FILES.roomStatus}
  营收数据:   ${DATA_FILES.revenue}
  挂牌价数据: ${DATA_FILES.priceCalendar}

注意:
  - 首次使用请先运行 node browser-init.js init-all 完成登录
  - 携程DOM结构已部分实测，美团/飞猪/去哪儿/同程待实测
  - 数据自动按平台合并存储
      `);
      break;
  }
}

// 导出供其他脚本调用
module.exports = { OtaReader, PLATFORM_READERS };

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 执行出错:', err.message);
    process.exit(1);
  });
}
