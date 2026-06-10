/**
 * 民宿 Skill 套件 — OTA 商家后台写操作器
 * 
 * 通过 Browser Agent 操作各 OTA 平台商家后台，执行改价/关房/开房等写操作。
 * 每次操作前后截图存证，完整记录操作日志。
 * 操作失败时自动生成兜底人工指引。
 * 
 * 用法（由其他脚本调用或CLI直接执行）：
 *   node ota-operator.js update-price --platform ctrip --room "山景大床房" --date 2026-06-05 --price 558
 *   node ota-operator.js close-room --platform ctrip --room "山景大床房" --dates 2026-06-05,2026-06-06
 *   node ota-operator.js open-room --platform ctrip --room "山景大床房" --dates 2026-06-05
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============ 路径配置 ============

const ROOT_DIR = path.join(__dirname, '..');
const PROFILES_DIR = path.join(ROOT_DIR, 'browser-profiles');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SCREENSHOTS_DIR = path.join(DATA_DIR, 'screenshots');
const OPERATION_LOG_PATH = path.join(DATA_DIR, 'operation-log.json');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');

// ============ 平台操作配置 ============

const PLATFORM_OPERATIONS = {
  ctrip: {
    name: '携程',
    profileDir: 'ctrip-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      priceCalendar: 'https://ebooking.ctrip.com/home/room/price/calendar',
      roomStatus: 'https://ebooking.ctrip.com/home/room/status/calendar',
      orderList: 'https://ebooking.ctrip.com/home/order/list',
    },
    loginCheckText: ['登录', '请输入'],
    successCheckText: ['房型管理', '价格日历', '房态'],

    /**
     * 携程改价操作流程
     * 注意：DOM选择器需要根据实际页面实测调整
     */
    async updatePrice(page, roomType, date, newPrice) {
      // 导航到价格日历页面
      await page.goto(this.urls.priceCalendar, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(2000);

      // 步骤1: 定位房型行（通过文本匹配）
      const roomRow = await page.locator(`text=${roomType}`).first();
      if (!await roomRow.isVisible()) {
        return { success: false, error: `未找到房型: ${roomType}` };
      }

      // 步骤2: 点击对应日期的价格单元格
      // 注意：ebooking价格日历通常是表格结构，日期为列
      const dateCell = await page.locator(`[data-date="${date}"]`).first();
      if (!await dateCell.isVisible()) {
        // 备选：尝试通过日期文本定位
        const dayNum = new Date(date).getDate().toString();
        const cells = await page.locator('.price-cell, .calendar-cell, td[class*="price"]').all();
        // 如果精确定位失败，返回需要实测的提示
        return { 
          success: false, 
          error: 'DOM定位失败：价格日历单元格选择器需要实测调整',
          needsCalibration: true
        };
      }

      await dateCell.click();
      await sleep(1000);

      // 步骤3: 在弹出的编辑框中输入新价格
      const priceInput = await page.locator('input[type="number"], input[class*="price"], input[placeholder*="价格"]').first();
      if (!await priceInput.isVisible()) {
        return { success: false, error: '未找到价格输入框', needsCalibration: true };
      }

      await priceInput.clear();
      await priceInput.fill(String(newPrice));
      await sleep(500);

      // 步骤4: 点击保存/确认按钮
      const saveBtn = await page.locator('button:has-text("保存"), button:has-text("确认"), button:has-text("确定")').first();
      if (!await saveBtn.isVisible()) {
        return { success: false, error: '未找到保存按钮', needsCalibration: true };
      }

      await saveBtn.click();
      await sleep(2000);

      // 步骤5: 检查操作结果
      const successToast = await page.locator('text=成功, text=修改成功, .success-toast, .ant-message-success').first();
      const hasSuccess = await successToast.isVisible().catch(() => false);

      // 未检测到成功提示时视为不确定，需要商户确认
      // 修复：hasSuccess || true 导致永远返回 true 的 bug
      return {
        success: hasSuccess,
        message: hasSuccess ? '价格修改成功' : '操作已提交但未检测到成功提示，请在商家后台确认',
        needsConfirmation: !hasSuccess,
      };
    },

    /**
     * 携程关房操作流程
     */
    async closeRoom(page, roomType, dates) {
      await page.goto(this.urls.roomStatus, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(2000);

      // 房态日历操作 — 选择日期并设置为关闭
      // DOM选择器需要根据实际页面实测
      return {
        success: false,
        error: '携程关房操作DOM选择器待实测',
        needsCalibration: true,
      };
    },

    /**
     * 携程开房操作流程
     */
    async openRoom(page, roomType, dates) {
      await page.goto(this.urls.roomStatus, { waitUntil: 'networkidle', timeout: 20000 });
      await sleep(2000);

      return {
        success: false,
        error: '携程开房操作DOM选择器待实测',
        needsCalibration: true,
      };
    },
  },

  meituan: {
    name: '美团',
    profileDir: 'meituan-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      priceManage: 'https://ehotel.meituan.com/room/price',
      roomStatus: 'https://ehotel.meituan.com/room/status',
      orderList: 'https://ehotel.meituan.com/order/list',
    },
    loginCheckText: ['登录', '手机号'],
    successCheckText: ['房型房价', '订单管理', '工作台'],

    async updatePrice(page, roomType, date, newPrice) {
      return { success: false, error: '美团改价操作DOM选择器待实测', needsCalibration: true };
    },
    async closeRoom(page, roomType, dates) {
      return { success: false, error: '美团关房操作DOM选择器待实测', needsCalibration: true };
    },
    async openRoom(page, roomType, dates) {
      return { success: false, error: '美团开房操作DOM选择器待实测', needsCalibration: true };
    },
  },

  fliggy: {
    name: '飞猪',
    profileDir: 'fliggy-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      priceManage: 'https://merchant.fliggy.com/room/price',
      roomStatus: 'https://merchant.fliggy.com/room/status',
      orderList: 'https://merchant.fliggy.com/order/list',
    },
    loginCheckText: ['登录', '淘宝', '支付宝'],
    successCheckText: ['房源管理', '订单中心', '工作台'],

    async updatePrice(page, roomType, date, newPrice) {
      return { success: false, error: '飞猪改价操作DOM选择器待实测', needsCalibration: true };
    },
    async closeRoom(page, roomType, dates) {
      return { success: false, error: '飞猪关房操作DOM选择器待实测', needsCalibration: true };
    },
    async openRoom(page, roomType, dates) {
      return { success: false, error: '飞猪开房操作DOM选择器待实测', needsCalibration: true };
    },
  },

  qunar: {
    name: '去哪儿',
    profileDir: 'qunar-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      priceManage: 'https://ehotel.qunar.com/room/price',
      roomStatus: 'https://ehotel.qunar.com/room/status',
      orderList: 'https://ehotel.qunar.com/order/list',
    },
    loginCheckText: ['登录', '密码', '验证码'],
    successCheckText: ['订单管理', '房型管理', '数据中心'],

    async updatePrice(page, roomType, date, newPrice) {
      return { success: false, error: '去哪儿改价操作DOM选择器待实测', needsCalibration: true };
    },
    async closeRoom(page, roomType, dates) {
      return { success: false, error: '去哪儿关房操作DOM选择器待实测', needsCalibration: true };
    },
    async openRoom(page, roomType, dates) {
      return { success: false, error: '去哪儿开房操作DOM选择器待实测', needsCalibration: true };
    },
  },

  tongcheng: {
    name: '同程',
    profileDir: 'tongcheng-merchant',
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    urls: {
      priceManage: 'https://e.ly.com/room/price',
      roomStatus: 'https://e.ly.com/room/status',
      orderList: 'https://e.ly.com/order/list',
    },
    loginCheckText: ['登录', '密码', '手机号'],
    successCheckText: ['订单管理', '房型管理', '数据中心'],

    async updatePrice(page, roomType, date, newPrice) {
      return { success: false, error: '同程改价操作DOM选择器待实测', needsCalibration: true };
    },
    async closeRoom(page, roomType, dates) {
      return { success: false, error: '同程关房操作DOM选择器待实测', needsCalibration: true };
    },
    async openRoom(page, roomType, dates) {
      return { success: false, error: '同程开房操作DOM选择器待实测', needsCalibration: true };
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

function loadOperationLog() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(OPERATION_LOG_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(OPERATION_LOG_PATH, 'utf-8'));
  } catch { return []; }
}

function appendOperationLog(entry) {
  const log = loadOperationLog();
  log.push(entry);
  // 保留最近100条
  if (log.length > 100) log.splice(0, log.length - 100);
  fs.writeFileSync(OPERATION_LOG_PATH, JSON.stringify(log, null, 2), 'utf-8');
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

/**
 * 截图存证
 */
async function takeScreenshot(page, operationType, platform, suffix) {
  ensureDir(SCREENSHOTS_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${platform}_${operationType}_${suffix}_${timestamp}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}

/**
 * 生成兜底人工操作指引
 */
function generateFallbackGuide(operation, platform, params, error) {
  const platformConfig = PLATFORM_OPERATIONS[platform];
  const guideLines = [
    `⚠️ 自动操作失败，请手动执行以下步骤：`,
    ``,
    `━━━ ${platformConfig.name}${operation === 'updatePrice' ? '改价' : operation === 'closeRoom' ? '关房' : '开房'}指引 ━━━`,
    `失败原因：${error}`,
    ``,
    `手动操作步骤：`,
  ];

  if (operation === 'updatePrice') {
    guideLines.push(
      `1. 打开浏览器，访问 ${platformConfig.urls.priceCalendar || platformConfig.urls.priceManage}`,
      `2. 登录您的商家账号`,
      `3. 进入 "房型管理" → "价格日历"`,
      `4. 找到房型 "${params.roomType}"`,
      `5. 点击日期 ${params.date} 的价格单元格`,
      `6. 将价格修改为 ¥${params.newPrice}`,
      `7. 点击"保存"或"确认"`,
      `8. 确认修改成功`,
    );
  } else if (operation === 'closeRoom') {
    guideLines.push(
      `1. 打开浏览器，访问 ${platformConfig.urls.roomStatus}`,
      `2. 登录您的商家账号`,
      `3. 进入 "房型管理" → "房态日历"`,
      `4. 找到房型 "${params.roomType}"`,
      `5. 选择日期 ${params.dates.join(', ')}`,
      `6. 点击"关闭售卖"或"关房"`,
      `7. 确认操作`,
    );
  } else if (operation === 'openRoom') {
    guideLines.push(
      `1. 打开浏览器，访问 ${platformConfig.urls.roomStatus}`,
      `2. 登录您的商家账号`,
      `3. 进入 "房型管理" → "房态日历"`,
      `4. 找到房型 "${params.roomType}"`,
      `5. 选择日期 ${params.dates.join(', ')}`,
      `6. 点击"开启售卖"或"开房"`,
      `7. 确认操作`,
    );
  }

  guideLines.push(
    ``,
    `完成后请告诉我"已完成"，我将更新操作状态。`,
  );

  return guideLines.join('\n');
}

// ============ 核心操作类 ============

class OtaOperator {
  constructor() {
    this.config = loadConfig();
  }

  /**
   * 执行改价操作
   */
  async updatePrice(platform, roomType, date, newPrice, options = {}) {
    const platformConfig = PLATFORM_OPERATIONS[platform];
    if (!platformConfig) {
      return { success: false, error: `未知平台: ${platform}` };
    }

    const profilePath = path.join(PROFILES_DIR, platformConfig.profileDir);
    if (!fs.existsSync(profilePath)) {
      return {
        success: false,
        error: '未初始化登录，请先运行 node browser-init.js init ' + platform + ' merchant',
        fallbackGuide: generateFallbackGuide('updatePrice', platform, { roomType, date, newPrice }, '未初始化登录'),
      };
    }

    console.log(`\n📝 改价操作: ${platformConfig.name}`);
    console.log(`   房型: ${roomType} | 日期: ${date} | 目标价: ¥${newPrice}`);

    let browser;
    try {
      browser = await chromium.launchPersistentContext(profilePath, {
        headless: options.headless !== false,
        viewport: platformConfig.viewport,
        userAgent: platformConfig.userAgent,
      });

      const page = await browser.newPage();

      // 导航并检查登录态
      await page.goto(platformConfig.urls.priceCalendar || platformConfig.urls.priceManage, {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await sleep(3000);

      const isLoggedIn = await checkLoginStatus(page, platformConfig);
      if (!isLoggedIn) {
        await browser.close();
        const error = '登录态已过期，请重新初始化';
        return {
          success: false,
          error,
          fallbackGuide: generateFallbackGuide('updatePrice', platform, { roomType, date, newPrice }, error),
        };
      }

      // 截图：操作前
      const beforeScreenshot = await takeScreenshot(page, 'updatePrice', platform, 'before');
      console.log(`   📸 操作前截图: ${path.basename(beforeScreenshot)}`);

      // 执行改价
      await sleep(this.config.operationRules?.minOperationIntervalMs || 2000);
      const result = await platformConfig.updatePrice(page, roomType, date, newPrice);

      // 截图：操作后
      const afterScreenshot = await takeScreenshot(page, 'updatePrice', platform, 'after');
      console.log(`   📸 操作后截图: ${path.basename(afterScreenshot)}`);

      await browser.close();

      // 记录操作日志
      const logEntry = {
        time: formatDate(),
        operation: 'updatePrice',
        platform: platformConfig.name,
        params: { roomType, date, newPrice },
        result: result.success ? 'success' : 'failed',
        error: result.error || null,
        screenshots: { before: beforeScreenshot, after: afterScreenshot },
        needsCalibration: result.needsCalibration || false,
      };
      appendOperationLog(logEntry);

      if (!result.success) {
        result.fallbackGuide = generateFallbackGuide('updatePrice', platform, { roomType, date, newPrice }, result.error);
      }

      console.log(`   ${result.success ? '✅' : '❌'} ${result.message || result.error}`);
      return result;

    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      const error = `操作异常: ${err.message}`;
      return {
        success: false,
        error,
        fallbackGuide: generateFallbackGuide('updatePrice', platform, { roomType, date, newPrice }, error),
      };
    }
  }

  /**
   * 执行关房操作
   */
  async closeRoom(platform, roomType, dates, reason = '') {
    const platformConfig = PLATFORM_OPERATIONS[platform];
    if (!platformConfig) {
      return { success: false, error: `未知平台: ${platform}` };
    }

    const profilePath = path.join(PROFILES_DIR, platformConfig.profileDir);
    if (!fs.existsSync(profilePath)) {
      return {
        success: false,
        error: '未初始化登录',
        fallbackGuide: generateFallbackGuide('closeRoom', platform, { roomType, dates }, '未初始化登录'),
      };
    }

    console.log(`\n🚫 关房操作: ${platformConfig.name}`);
    console.log(`   房型: ${roomType} | 日期: ${dates.join(', ')} | 原因: ${reason || '未指定'}`);

    let browser;
    try {
      browser = await chromium.launchPersistentContext(profilePath, {
        headless: true,
        viewport: platformConfig.viewport,
        userAgent: platformConfig.userAgent,
      });

      const page = await browser.newPage();
      await page.goto(platformConfig.urls.roomStatus, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);

      const isLoggedIn = await checkLoginStatus(page, platformConfig);
      if (!isLoggedIn) {
        await browser.close();
        return {
          success: false,
          error: '登录态已过期',
          fallbackGuide: generateFallbackGuide('closeRoom', platform, { roomType, dates }, '登录态已过期'),
        };
      }

      const beforeScreenshot = await takeScreenshot(page, 'closeRoom', platform, 'before');
      const result = await platformConfig.closeRoom(page, roomType, dates);
      const afterScreenshot = await takeScreenshot(page, 'closeRoom', platform, 'after');

      await browser.close();

      appendOperationLog({
        time: formatDate(),
        operation: 'closeRoom',
        platform: platformConfig.name,
        params: { roomType, dates, reason },
        result: result.success ? 'success' : 'failed',
        error: result.error || null,
        screenshots: { before: beforeScreenshot, after: afterScreenshot },
      });

      if (!result.success) {
        result.fallbackGuide = generateFallbackGuide('closeRoom', platform, { roomType, dates }, result.error);
      }

      return result;
    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      return {
        success: false,
        error: err.message,
        fallbackGuide: generateFallbackGuide('closeRoom', platform, { roomType, dates }, err.message),
      };
    }
  }

  /**
   * 执行开房操作
   */
  async openRoom(platform, roomType, dates) {
    const platformConfig = PLATFORM_OPERATIONS[platform];
    if (!platformConfig) {
      return { success: false, error: `未知平台: ${platform}` };
    }

    const profilePath = path.join(PROFILES_DIR, platformConfig.profileDir);
    if (!fs.existsSync(profilePath)) {
      return {
        success: false,
        error: '未初始化登录',
        fallbackGuide: generateFallbackGuide('openRoom', platform, { roomType, dates }, '未初始化登录'),
      };
    }

    console.log(`\n✅ 开房操作: ${platformConfig.name}`);
    console.log(`   房型: ${roomType} | 日期: ${dates.join(', ')}`);

    let browser;
    try {
      browser = await chromium.launchPersistentContext(profilePath, {
        headless: true,
        viewport: platformConfig.viewport,
        userAgent: platformConfig.userAgent,
      });

      const page = await browser.newPage();
      await page.goto(platformConfig.urls.roomStatus, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await sleep(3000);

      const isLoggedIn = await checkLoginStatus(page, platformConfig);
      if (!isLoggedIn) {
        await browser.close();
        return {
          success: false,
          error: '登录态已过期',
          fallbackGuide: generateFallbackGuide('openRoom', platform, { roomType, dates }, '登录态已过期'),
        };
      }

      const result = await platformConfig.openRoom(page, roomType, dates);
      await browser.close();

      appendOperationLog({
        time: formatDate(),
        operation: 'openRoom',
        platform: platformConfig.name,
        params: { roomType, dates },
        result: result.success ? 'success' : 'failed',
        error: result.error || null,
      });

      if (!result.success) {
        result.fallbackGuide = generateFallbackGuide('openRoom', platform, { roomType, dates }, result.error);
      }

      return result;
    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      return {
        success: false,
        error: err.message,
        fallbackGuide: generateFallbackGuide('openRoom', platform, { roomType, dates }, err.message),
      };
    }
  }

  /**
   * 批量执行操作（带确认步骤）
   */
  async batchExecute(operations) {
    const results = [];
    const config = this.config;
    const maxBatch = config.operationRules?.maxBatchSize || 10;

    if (operations.length > maxBatch) {
      return {
        success: false,
        error: `批量操作超过上限（${maxBatch}），请分批执行`,
        results: [],
      };
    }

    console.log(`\n📋 批量操作: ${operations.length} 个任务`);
    console.log('='.repeat(50));

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      console.log(`\n[${i + 1}/${operations.length}] ${op.operation} - ${op.platform}`);

      let result;
      const interval = config.operationRules?.minOperationIntervalMs || 2000;

      switch (op.operation) {
        case 'updatePrice':
          result = await this.updatePrice(op.platform, op.roomType, op.date, op.newPrice);
          break;
        case 'closeRoom':
          result = await this.closeRoom(op.platform, op.roomType, op.dates, op.reason);
          break;
        case 'openRoom':
          result = await this.openRoom(op.platform, op.roomType, op.dates);
          break;
        default:
          result = { success: false, error: `未知操作: ${op.operation}` };
      }

      results.push({ ...op, result });

      // 如果操作失败且不是"待实测"类失败，停止后续操作
      if (!result.success && !result.needsCalibration) {
        console.log(`\n⚠️ 操作失败，停止后续批量任务`);
        break;
      }

      // 操作间隔
      if (i < operations.length - 1) {
        await sleep(interval);
      }
    }

    const successCount = results.filter(r => r.result.success).length;
    const failCount = results.filter(r => !r.result.success).length;

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ 批量操作完成: 成功 ${successCount}, 失败 ${failCount}`);

    return { success: failCount === 0, results, successCount, failCount };
  }
}

// ============ CLI 入口 ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
🏨 民宿 Skill 套件 — OTA 商家后台操作器

用法:
  node ota-operator.js update-price --platform <p> --room <room> --date <d> --price <n>
  node ota-operator.js close-room --platform <p> --room <room> --dates <d1,d2>
  node ota-operator.js open-room --platform <p> --room <room> --dates <d1,d2>
  node ota-operator.js log                                查看操作日志

参数:
  --platform: ctrip | meituan | fliggy | qunar | tongcheng
  --room: 房型名称（如 "山景大床房"）
  --date: 单个日期（如 2026-06-05）
  --dates: 多个日期逗号分隔
  --price: 目标价格（数字）

注意:
  - 携程DOM选择器已部分实测，美团/飞猪/去哪儿/同程待实测
  - 操作失败时自动输出人工操作指引（兜底策略）
  - 所有操作记录在 data/operation-log.json
  - 操作截图保存在 data/screenshots/
    `);
    return;
  }

  const operator = new OtaOperator();

  // 解析参数
  function getArg(name) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : null;
  }

  switch (command) {
    case 'update-price': {
      const platform = getArg('platform');
      const room = getArg('room');
      const date = getArg('date');
      const price = parseInt(getArg('price'));
      if (!platform || !room || !date || !price) {
        console.error('缺少必要参数。用法: node ota-operator.js update-price --platform ctrip --room "山景大床房" --date 2026-06-05 --price 558');
        process.exit(1);
      }
      const result = await operator.updatePrice(platform, room, date, price);
      if (!result.success && result.fallbackGuide) {
        console.log('\n' + result.fallbackGuide);
      }
      break;
    }

    case 'close-room': {
      const platform = getArg('platform');
      const room = getArg('room');
      const dates = getArg('dates')?.split(',') || [];
      if (!platform || !room || dates.length === 0) {
        console.error('缺少必要参数。用法: node ota-operator.js close-room --platform ctrip --room "山景大床房" --dates 2026-06-05,2026-06-06');
        process.exit(1);
      }
      const result = await operator.closeRoom(platform, room, dates);
      if (!result.success && result.fallbackGuide) {
        console.log('\n' + result.fallbackGuide);
      }
      break;
    }

    case 'open-room': {
      const platform = getArg('platform');
      const room = getArg('room');
      const dates = getArg('dates')?.split(',') || [];
      if (!platform || !room || dates.length === 0) {
        console.error('缺少必要参数。');
        process.exit(1);
      }
      const result = await operator.openRoom(platform, room, dates);
      if (!result.success && result.fallbackGuide) {
        console.log('\n' + result.fallbackGuide);
      }
      break;
    }

    case 'log': {
      const log = loadOperationLog();
      if (log.length === 0) {
        console.log('📭 暂无操作记录');
      } else {
        console.log(`\n📋 操作日志（最近${log.length}条）\n`);
        log.slice(-10).forEach(entry => {
          const icon = entry.result === 'success' ? '✅' : '❌';
          console.log(`${icon} [${entry.time}] ${entry.platform} ${entry.operation} → ${entry.result}`);
          if (entry.error) console.log(`   原因: ${entry.error}`);
        });
      }
      break;
    }

    default:
      console.error(`未知命令: ${command}`);
      process.exit(1);
  }
}

// 导出供其他脚本调用
module.exports = { OtaOperator, PLATFORM_OPERATIONS };

// CLI模式运行
if (require.main === module) {
  main().catch(err => {
    console.error('❌ 执行出错:', err.message);
    process.exit(1);
  });
}
