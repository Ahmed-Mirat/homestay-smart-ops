/**
 * 民宿 Skill 套件 — 环境自检脚本
 *
 * 检测 6 项核心环境状态，输出每项 ✅/❌ 以及对话化修复建议。
 * 商户说"检查环境/状态检查/帮我检查/系统正常吗"时由 Agent 调用。
 *
 * 用法：
 *   node check-env.js
 */

const fs = require('fs');
const path = require('path');

const SHARED_DIR = path.join(__dirname, '..');
const ROOT_DIR = path.join(SHARED_DIR, '..');

const NODE_MODULES = path.join(SHARED_DIR, 'node_modules');
const CONFIG_PATH = path.join(SHARED_DIR, 'config.json');
const SETUP_STATE_PATH = path.join(SHARED_DIR, 'setup', 'setup-state.json');
const KB_PATH = path.join(ROOT_DIR, 'homestay-guest', 'assets', 'knowledge-base.md');
const SCRAPER_PROFILE_DIR = path.join(ROOT_DIR, 'homestay-pricing', 'browser-profile');
const SCRAPER_LATEST = path.join(ROOT_DIR, 'homestay-pricing', 'assets', 'data', 'latest.json');

function safeLoadJSON(filepath) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return null;
  }
}

function check() {
  const results = [];

  // 1. 文件依赖
  const hasModules = fs.existsSync(NODE_MODULES);
  results.push({
    name: '运行环境（依赖包）',
    ok: hasModules,
    detail: hasModules ? '已安装' : '尚未安装',
    tip: hasModules
      ? null
      : '在 QoderWork 终端执行 `cd _shared && npm install`，1 分钟即可。',
  });

  // 2. 民宿基础配置
  const config = safeLoadJSON(CONFIG_PATH) || {};
  const homestayName = config.homestay && config.homestay.name;
  const hasName = Boolean(homestayName && homestayName.trim());
  results.push({
    name: '民宿基础配置',
    ok: hasName,
    detail: hasName ? `已录入：${homestayName}` : '尚未录入',
    tip: hasName ? null : '在对话中说"开始设置"启动安装向导。',
  });

  // 3. 安装向导完成状态
  const setupState = safeLoadJSON(SETUP_STATE_PATH) || {};
  const setupDone = setupState.completed === true;
  results.push({
    name: '安装向导',
    ok: setupDone,
    detail: setupDone
      ? `已完成（共 ${setupState.totalSteps || 5} 步）`
      : `进行中（当前第 ${setupState.currentStep || 0} 步）`,
    tip: setupDone ? null : '在对话中说"继续设置"接着上次的步骤往下走。',
  });

  // 4. 知识库
  const hasKB = fs.existsSync(KB_PATH);
  let kbSize = 0;
  if (hasKB) {
    try {
      kbSize = fs.statSync(KB_PATH).size;
    } catch {}
  }
  results.push({
    name: '客服知识库',
    ok: hasKB && kbSize > 100,
    detail: hasKB ? `已生成（${kbSize} 字节）` : '未生成',
    tip:
      hasKB && kbSize > 100
        ? null
        : '完成安装向导后会自动生成；也可以说"重新生成知识库"立即生成。',
  });

  // 5. 通知配置
  const webhookUrl =
    (config.notification &&
      config.notification.wechatWork &&
      config.notification.wechatWork.webhookUrl) ||
    '';
  const hasWebhook = Boolean(webhookUrl && webhookUrl.startsWith('http'));
  results.push({
    name: '企业微信通知',
    ok: hasWebhook,
    detail: hasWebhook ? '已配置' : '未配置（可选功能）',
    tip: hasWebhook
      ? null
      : '可选功能。如需启用，在对话中说"配置通知"，按 3 步引导即可。',
  });

  // 6. 竞品采集器
  const hasScraperProfile = fs.existsSync(SCRAPER_PROFILE_DIR);
  let scraperLastRun = '';
  if (fs.existsSync(SCRAPER_LATEST)) {
    try {
      const latest = JSON.parse(fs.readFileSync(SCRAPER_LATEST, 'utf-8'));
      scraperLastRun = latest.scrapeTime || '';
    } catch {}
  }
  const scraperDetail = hasScraperProfile
    ? `已初始化${scraperLastRun ? '，上次采集: ' + scraperLastRun : ''}`
    : '未初始化（可选功能）';
  results.push({
    name: '竞品采集器',
    ok: hasScraperProfile,
    detail: scraperDetail,
    tip: hasScraperProfile
      ? null
      : '可选功能。如需启用，运行 node homestay-pricing/scripts/scraper.js init 登录消费者端账号。',
  });

  return results;
}

function render(results) {
  console.log('');
  console.log('🩺 民宿 Skill 套件 — 环境自检');
  console.log('='.repeat(60));

  results.forEach((r, i) => {
    const icon = r.ok ? '✅' : '❌';
    console.log(`\n${i + 1}. ${icon} ${r.name}：${r.detail}`);
    if (r.tip) {
      console.log(`   💡 建议：${r.tip}`);
    }
  });

  const okCount = results.filter((r) => r.ok).length;
  const total = results.length;

  console.log('\n' + '='.repeat(60));
  console.log(`检查完成：${okCount}/${total} 项正常\n`);

  if (okCount === total) {
    console.log('🎉 所有项目都正常，您可以放心使用所有功能！');
  } else if (okCount >= 3) {
    console.log('⚠️  核心功能可用，可参考上面的建议进一步完善。');
  } else {
    console.log('⚠️  环境尚未就绪，请按上面的建议逐项处理。');
  }
}

if (require.main === module) {
  const results = check();
  render(results);
  process.exit(0);
}

module.exports = { check };
