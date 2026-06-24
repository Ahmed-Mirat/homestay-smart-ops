#!/usr/bin/env node
/**
 * auto-install.js — Skill 套件一键环境安装脚本
 *
 * 功能：
 * 1. 检测 Node.js 版本 (>= 18)
 * 2. 检测磁盘空间 (>= 500MB)
 * 3. 自动执行 npm install（最多重试3次）
 * 4. 按需安装 Playwright Chromium（民宿/酒店需要，公寓/中医馆可选）
 * 5. 安装结果汇总输出
 *
 * 用法：
 *   node _shared/scripts/auto-install.js               # 完整安装
 *   node _shared/scripts/auto-install.js --check-only  # 仅检测不安装
 *   node _shared/scripts/auto-install.js --type homestay
 *
 * 退出码：
 *   0 - 全部成功
 *   1 - 有可修复的问题（部分安装成功）
 *   2 - 致命错误（无法继续）
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 配置常量
const SHARED_DIR = path.resolve(__dirname, '..');
const MIN_NODE_VERSION = 18;
const MIN_DISK_SPACE_MB = 500;
const MAX_RETRIES = 3;

// 参数解析
const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
let merchantType = null;
const typeIdx = args.indexOf('--type');
if (typeIdx !== -1 && args[typeIdx + 1]) {
  merchantType = args[typeIdx + 1];
} else {
  const eqArg = args.find((a) => a.startsWith('--type='));
  if (eqArg) merchantType = eqArg.split('=')[1];
}

// 需要浏览器的商户类型
const NEEDS_BROWSER = ['homestay', 'hotel'];

async function main() {
  console.log('━━━ Skill 套件环境安装 ━━━━━━━━━━━━━━\n');
  if (merchantType) {
    console.log(`  商户类型: ${merchantType}\n`);
  }

  const results = [];

  // Step 1: Node.js 版本检测
  results.push(checkNodeVersion());

  // Step 2: 磁盘空间检测
  results.push(checkDiskSpace());

  // 致命错误检测：Node 版本不达标无法继续
  const nodeResult = results[0];
  if (!nodeResult.ok) {
    printResults(results);
    console.log('\n❌ Node.js 版本不满足要求，无法继续安装。');
    process.exit(2);
    return;
  }

  if (checkOnly) {
    printResults(results);
    process.exit(results.every((r) => r.ok) ? 0 : 1);
    return;
  }

  // Step 3: npm install
  results.push(await runNpmInstall());

  // Step 4: Playwright（按需）
  const needsBrowser = merchantType ? NEEDS_BROWSER.includes(merchantType) : true;
  if (needsBrowser) {
    results.push(await installPlaywright());
  } else {
    results.push({
      name: 'Playwright 浏览器',
      ok: true,
      detail: '当前商户类型无需浏览器，已跳过',
      skipped: true,
    });
  }

  // 输出结果
  printResults(results);

  const hasFailure = results.some((r) => !r.ok && !r.skipped);
  process.exit(hasFailure ? 1 : 0);
}

function checkNodeVersion() {
  const version = parseInt(process.versions.node.split('.')[0], 10);
  const ok = version >= MIN_NODE_VERSION;
  return {
    name: 'Node.js 版本',
    ok,
    detail: ok
      ? `v${process.versions.node} (>= ${MIN_NODE_VERSION} ✓)`
      : `v${process.versions.node} (需要 >= ${MIN_NODE_VERSION})`,
    tip: ok ? null : '请升级 Node.js: https://nodejs.org/',
  };
}

function checkDiskSpace() {
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(SHARED_DIR);
      const freeMB = Math.floor((stats.bavail * stats.bsize) / (1024 * 1024));
      const ok = freeMB >= MIN_DISK_SPACE_MB;
      return {
        name: '磁盘空间',
        ok,
        detail: ok
          ? `可用 ${freeMB}MB (>= ${MIN_DISK_SPACE_MB}MB ✓)`
          : `仅剩 ${freeMB}MB (需要 >= ${MIN_DISK_SPACE_MB}MB)`,
        tip: ok ? null : '请清理磁盘空间后重试',
      };
    }
    return {
      name: '磁盘空间',
      ok: true,
      detail: '无法检测（Node 版本限制），假设充足',
    };
  } catch (e) {
    return {
      name: '磁盘空间',
      ok: true,
      detail: '检测跳过',
      tip: null,
    };
  }
}

async function runNpmInstall() {
  let lastError = null;
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      console.log(`  📦 正在安装依赖... (第 ${i} 次尝试)`);
      execSync('npm install', {
        cwd: SHARED_DIR,
        stdio: 'pipe',
        timeout: 120000, // 2 分钟超时
      });
      return { name: 'npm 依赖安装', ok: true, detail: '安装完成' };
    } catch (e) {
      lastError = e;
      if (i < MAX_RETRIES) {
        console.log(`  ⚠️  安装失败，2 秒后重试...`);
        await sleep(2000);
      }
    }
  }

  // 诊断失败原因
  const errMsg =
    (lastError && lastError.stderr && lastError.stderr.toString()) ||
    (lastError && lastError.message) ||
    '未知错误';
  let tip = '请检查网络连接后重试';
  if (errMsg.includes('EACCES')) tip = '权限不足，请检查目录权限';
  if (errMsg.includes('ENOSPC')) tip = '磁盘空间不足，请清理后重试';
  if (errMsg.includes('ETIMEDOUT') || errMsg.toLowerCase().includes('network')) {
    tip = '网络超时，请检查代理或换个网络重试';
  }

  return {
    name: 'npm 依赖安装',
    ok: false,
    detail: `${MAX_RETRIES} 次尝试均失败`,
    tip,
  };
}

async function installPlaywright() {
  try {
    console.log('  🌐 正在安装 Chromium 浏览器...');
    execSync('npx playwright install chromium', {
      cwd: SHARED_DIR,
      stdio: 'pipe',
      timeout: 300000, // 5 分钟超时
    });
    return { name: 'Playwright 浏览器', ok: true, detail: 'Chromium 安装完成' };
  } catch (e) {
    const errMsg = (e && e.stderr && e.stderr.toString()) || (e && e.message) || '';
    let tip = '请手动执行: npx playwright install chromium';
    if (errMsg.includes('ETIMEDOUT')) {
      tip = '浏览器下载超时，请检查网络后手动执行: npx playwright install chromium';
    }
    return { name: 'Playwright 浏览器', ok: false, detail: '安装失败', tip };
  }
}

function printResults(results) {
  console.log('\n━━━ 安装结果 ━━━━━━━━━━━━━━━━━━━━━━\n');
  results.forEach((r, i) => {
    const icon = r.ok ? (r.skipped ? '⏭️ ' : '✅') : '❌';
    console.log(`${i + 1}. ${icon} ${r.name}：${r.detail}`);
    if (r.tip) console.log(`   💡 ${r.tip}`);
  });

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`检查完成：${passed}/${total} 项通过`);

  if (passed === total) {
    console.log('\n🎉 环境准备就绪！可以开始使用了。');
  } else {
    console.log('\n⚠️  部分检查未通过，请根据上方提示修复。');
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error('❌ 安装脚本异常:', e && e.message ? e.message : e);
  process.exit(2);
});
