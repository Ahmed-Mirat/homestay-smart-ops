/**
 * 民宿 Skill 套件 — 多平台商家后台登录初始化器
 * 
 * 管理各OTA平台商家后台的浏览器登录态。
 * 基于 Playwright Persistent Context，一次登录后状态持久保存。
 * 
 * 用法：
 *   node browser-init.js init <platform> <type>    # 初始化指定平台登录
 *   node browser-init.js init-all                  # 一键初始化所有平台
 *   node browser-init.js check <platform> <type>   # 检查指定平台登录态
 *   node browser-init.js check-all                 # 检查所有平台登录态
 * 
 * 示例：
 *   node browser-init.js init ctrip merchant       # 初始化携程商家后台登录
 *   node browser-init.js init ctrip consumer       # 初始化携程消费者端（竞品采集用）
 *   node browser-init.js check meituan merchant    # 检查美团商家后台登录态
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ============ 路径配置 ============

const ROOT_DIR = path.join(__dirname, '..');
const PROFILES_DIR = path.join(ROOT_DIR, 'browser-profiles');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');

// ============ 平台配置 ============

const PLATFORMS = {
  ctrip: {
    merchant: {
      name: '携程商家后台 (ebooking)',
      url: 'https://ebooking.ctrip.com',
      profileDir: 'ctrip-merchant',
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      loginSuccessIndicators: ['经营概况', '欢迎', '房型管理', '订单管理'],
      loginPageIndicators: ['登录', '扫码', '请输入密码'],
    },
    consumer: {
      name: '携程消费者端（竞品采集用）',
      url: 'https://m.ctrip.com/html5/',
      profileDir: 'ctrip-consumer',
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      loginSuccessIndicators: ['我的', '首页'],
      loginPageIndicators: ['登录', '注册'],
    },
  },
  meituan: {
    merchant: {
      name: '美团酒店商家版 (ehotel)',
      url: 'https://ehotel.meituan.com',
      profileDir: 'meituan-merchant',
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      loginSuccessIndicators: ['首页', '订单管理', '房型房价', '工作台'],
      loginPageIndicators: ['登录', '手机号', '验证码'],
    },
  },
  fliggy: {
    merchant: {
      name: '飞猪商家中心',
      url: 'https://merchant.fliggy.com',
      profileDir: 'fliggy-merchant',
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      loginSuccessIndicators: ['工作台', '商品管理', '订单', '房源管理'],
      loginPageIndicators: ['登录', '扫码', '淘宝', '支付宝'],
    },
  },
  qunar: {
    merchant: {
      name: '去哪儿酒店商家后台 (eHotel)',
      url: 'https://ehotel.qunar.com',
      profileDir: 'qunar-merchant',
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      loginSuccessIndicators: ['订单管理', '房型管理', '数据中心', '首页'],
      loginPageIndicators: ['登录', '密码', '验证码', '手机号'],
    },
    consumer: {
      name: '去哪儿消费者端（竞品采集用）',
      url: 'https://m.qunar.com/',
      profileDir: 'qunar-consumer',
      viewport: { width: 390, height: 844 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
      loginSuccessIndicators: ['我的', '首页'],
      loginPageIndicators: ['登录', '注册'],
    },
  },
  tongcheng: {
    merchant: {
      name: '同程酒店商家后台',
      url: 'https://e.ly.com',
      profileDir: 'tongcheng-merchant',
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      loginSuccessIndicators: ['订单管理', '房型管理', '数据中心', '首页'],
      loginPageIndicators: ['登录', '密码', '手机号', '验证码'],
    },
    consumer: {
      name: '同程消费者端（竞品采集用）',
      url: 'https://www.ly.com/hotel',
      profileDir: 'tongcheng-consumer',
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      loginSuccessIndicators: ['我的订单', '我的同程', '首页'],
      loginPageIndicators: ['登录', '注册', '请登录'],
    },
  },
};

// ============ 工具函数 ============

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getProfilePath(profileDir) {
  return path.join(PROFILES_DIR, profileDir);
}

function getPlatformConfig(platform, type) {
  const platformConfig = PLATFORMS[platform];
  if (!platformConfig) {
    console.error(`❌ 未知平台: ${platform}`);
    console.error(`   可选平台: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }
  const typeConfig = platformConfig[type];
  if (!typeConfig) {
    console.error(`❌ 平台 ${platform} 不支持类型: ${type}`);
    console.error(`   可选类型: ${Object.keys(platformConfig).join(', ')}`);
    process.exit(1);
  }
  return typeConfig;
}

// ============ 核心功能 ============

/**
 * 初始化登录：打开平台页面，等待用户手动登录
 */
async function initLogin(platform, type) {
  const config = getPlatformConfig(platform, type);
  const profilePath = getProfilePath(config.profileDir);
  ensureDir(profilePath);

  console.log('\n🔑 登录初始化');
  console.log('='.repeat(60));
  console.log(`平台: ${config.name}`);
  console.log(`地址: ${config.url}`);
  console.log(`Profile: ${profilePath}`);
  console.log('='.repeat(60));
  console.log('\n📋 操作步骤：');
  console.log('  1. 浏览器将自动打开平台登录页面');
  console.log('  2. 请在浏览器中手动完成登录（扫码/账号密码）');
  console.log('  3. 确认登录成功后（看到后台首页），关闭浏览器');
  console.log('  4. 登录状态将自动保存，后续操作无需重复登录\n');

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: config.viewport,
    userAgent: config.userAgent,
  });

  const page = await browser.newPage();
  await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('✅ 浏览器已打开，请在浏览器中完成登录...');
  console.log('⏳ 等待您关闭浏览器...\n');

  // 等待浏览器关闭
  await new Promise(resolve => {
    browser.on('close', resolve);
  });

  console.log('✅ 登录状态已保存！');
  console.log(`   Profile目录: ${profilePath}`);
  console.log(`   后续操作将自动使用此登录态。\n`);
}

/**
 * 一键初始化所有已启用平台的商家后台
 */
async function initAll() {
  console.log('\n🔑 一键初始化所有平台商家后台登录');
  console.log('='.repeat(60));

  const enabledPlatforms = [];
  for (const [key, types] of Object.entries(PLATFORMS)) {
    if (types.merchant) {
      enabledPlatforms.push({ key, config: types.merchant });
    }
  }

  console.log(`将依次初始化 ${enabledPlatforms.length} 个平台：`);
  enabledPlatforms.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.config.name}`);
  });
  console.log('');

  for (const platform of enabledPlatforms) {
    console.log(`\n${'─'.repeat(60)}`);
    await initLogin(platform.key, 'merchant');
    await sleep(1000);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✅ 所有平台登录初始化完成！');
  console.log('   运行 node browser-init.js check-all 验证登录态');
}

/**
 * 检查指定平台登录态
 */
async function checkLogin(platform, type) {
  const config = getPlatformConfig(platform, type);
  const profilePath = getProfilePath(config.profileDir);

  if (!fs.existsSync(profilePath)) {
    return {
      platform: config.name,
      status: 'no_profile',
      message: '❌ 未初始化（无Profile目录）',
      loggedIn: false,
    };
  }

  try {
    const browser = await chromium.launchPersistentContext(profilePath, {
      headless: true,
      viewport: config.viewport,
      userAgent: config.userAgent,
    });

    const page = await browser.newPage();
    await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);

    const bodyText = await page.evaluate(() => document.body.innerText);

    // 检测是否在登录页
    const onLoginPage = config.loginPageIndicators.some(indicator =>
      bodyText.includes(indicator)
    );

    // 检测是否已登录
    const loggedIn = config.loginSuccessIndicators.some(indicator =>
      bodyText.includes(indicator)
    );

    await browser.close();

    if (loggedIn && !onLoginPage) {
      return {
        platform: config.name,
        status: 'logged_in',
        message: '✅ 已登录',
        loggedIn: true,
      };
    } else {
      return {
        platform: config.name,
        status: 'expired',
        message: '❌ 登录态已过期',
        loggedIn: false,
      };
    }
  } catch (err) {
    return {
      platform: config.name,
      status: 'error',
      message: `⚠️ 检查失败: ${err.message}`,
      loggedIn: false,
    };
  }
}

/**
 * 检查所有平台登录态
 */
async function checkAll() {
  console.log('\n🔍 检查所有平台登录状态');
  console.log('='.repeat(60));

  const results = [];

  for (const [platformKey, types] of Object.entries(PLATFORMS)) {
    for (const [typeKey, config] of Object.entries(types)) {
      const result = await checkLogin(platformKey, typeKey);
      results.push(result);
      console.log(`  ${result.platform}: ${result.message}`);
    }
  }

  console.log('\n' + '─'.repeat(60));

  const allLoggedIn = results.filter(r => r.status !== 'no_profile').every(r => r.loggedIn);
  const needInit = results.filter(r => !r.loggedIn);

  if (allLoggedIn && needInit.length === 0) {
    console.log('✅ 所有平台登录态有效！可正常使用。');
  } else if (needInit.length > 0) {
    console.log('⚠️ 以下平台需要（重新）登录：');
    needInit.forEach(r => {
      console.log(`   - ${r.platform}`);
    });
    console.log('\n   请运行: node browser-init.js init <platform> <type>');
  }

  return results;
}

// ============ CLI 入口 ============

async function main() {
  const [command, platform, type] = process.argv.slice(2);

  switch (command) {
    case 'init':
      if (!platform || !type) {
        console.error('用法: node browser-init.js init <platform> <type>');
        console.error('  platform: ctrip, meituan, fliggy');
        console.error('  type: merchant, consumer');
        console.error('\n示例: node browser-init.js init ctrip merchant');
        process.exit(1);
      }
      await initLogin(platform, type);
      break;

    case 'init-all':
      await initAll();
      break;

    case 'check':
      if (!platform || !type) {
        console.error('用法: node browser-init.js check <platform> <type>');
        process.exit(1);
      }
      const result = await checkLogin(platform, type);
      console.log(`\n${result.platform}: ${result.message}`);
      break;

    case 'check-all':
      await checkAll();
      break;

    default:
      console.log(`
🏨 民宿 Skill 套件 — 浏览器登录管理器

用法:
  node browser-init.js init <platform> <type>     初始化指定平台登录
  node browser-init.js init-all                   一键初始化所有商家后台
  node browser-init.js check <platform> <type>    检查指定平台登录态
  node browser-init.js check-all                  检查所有平台登录态

参数:
  platform: ctrip | meituan | fliggy | qunar | tongcheng
  type:     merchant（商家后台）| consumer（消费者端，携程/去哪儿/同程）

示例:
  node browser-init.js init ctrip merchant        携程商家后台登录
  node browser-init.js init meituan merchant      美团商家后台登录
  node browser-init.js init qunar merchant        去哪儿商家后台登录
  node browser-init.js init tongcheng merchant    同程商家后台登录
  node browser-init.js check-all                  检查所有登录态

原理:
  使用 Playwright Persistent Context 保存浏览器登录状态。
  初始化一次后，后续所有操作（改价/关房/数据采集）自动复用登录态。
  登录态过期后重新 init 即可。
      `);
      break;
  }
}

main().catch(err => {
  console.error('❌ 执行出错:', err.message);
  process.exit(1);
});
