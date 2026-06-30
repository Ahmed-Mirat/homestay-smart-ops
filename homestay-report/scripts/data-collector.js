/**
 * 民宿报表 Skill — 数据采集调度脚本
 * 
 * 封装对 ota-reader 的调用逻辑，供 Skill 和 Cron 使用。
 * 负责：检查数据新鲜度 → 触发采集 → 返回数据状态
 * 
 * 用法：
 *   node data-collector.js status           检查本地数据状态
 *   node data-collector.js refresh          刷新过期数据
 *   node data-collector.js force            强制全量采集
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============ 路径配置 ============

const SHARED_DIR = path.join(__dirname, '..', '..', '_shared');
const DATA_DIR = path.join(SHARED_DIR, 'data');
const READER_SCRIPT = path.join(SHARED_DIR, 'scripts', 'ota-reader.js');

const DATA_FILES = {
  orders: { path: path.join(DATA_DIR, 'orders.json'), maxAgeHours: 24 },
  roomStatus: { path: path.join(DATA_DIR, 'room-status.json'), maxAgeHours: 12 },
  revenue: { path: path.join(DATA_DIR, 'revenue.json'), maxAgeHours: 24 },
  priceCalendar: { path: path.join(DATA_DIR, 'price-calendar.json'), maxAgeHours: 24 },
};

// ============ 工具函数 ============

function formatDate() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function getFileAge(filepath) {
  if (!fs.existsSync(filepath)) return Infinity;
  try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    if (data.lastSync) {
      const syncTime = new Date(data.lastSync).getTime();
      const now = Date.now();
      return (now - syncTime) / (1000 * 60 * 60); // 返回小时数
    }
  } catch {}
  // 如果无法解析lastSync，使用文件修改时间
  const stats = fs.statSync(filepath);
  return (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
}

// ============ 核心功能 ============

/**
 * 检查所有数据文件状态
 */
function checkDataStatus() {
  console.log('\n📊 本地数据状态检查');
  console.log('='.repeat(50));

  const results = {};

  for (const [key, config] of Object.entries(DATA_FILES)) {
    const exists = fs.existsSync(config.path);
    const ageHours = exists ? getFileAge(config.path) : Infinity;
    const isExpired = ageHours > config.maxAgeHours;
    const status = !exists ? '❌ 不存在' : isExpired ? '⚠️ 已过期' : '✅ 有效';

    results[key] = { exists, ageHours, isExpired, status };
    
    const ageStr = exists ? `${ageHours.toFixed(1)}小时前` : '无';
    console.log(`  ${status} ${key}: 更新时间 ${ageStr} (阈值: ${config.maxAgeHours}h)`);
  }

  const allFresh = Object.values(results).every(r => !r.isExpired);
  console.log(`\n${allFresh ? '✅ 所有数据有效' : '⚠️ 部分数据需要刷新'}`);

  return results;
}

/**
 * 刷新过期数据
 */
function refreshExpiredData() {
  console.log('\n🔄 刷新过期数据...');
  const status = checkDataStatus();

  const expiredTypes = Object.entries(status)
    .filter(([key, s]) => s.isExpired)
    .map(([key]) => key);

  if (expiredTypes.length === 0) {
    console.log('✅ 所有数据都是最新的，无需刷新');
    return;
  }

  console.log(`\n需要刷新: ${expiredTypes.join(', ')}`);

  // 确定需要执行的采集命令
  const commands = new Set();
  if (expiredTypes.includes('orders')) commands.add('orders');
  if (expiredTypes.includes('roomStatus')) commands.add('room-status');
  if (expiredTypes.includes('revenue')) commands.add('revenue');
  if (expiredTypes.includes('priceCalendar')) commands.add('prices');

  for (const cmd of commands) {
    console.log(`\n执行: node ota-reader.js ${cmd}`);
    try {
      execSync(`node "${READER_SCRIPT}" ${cmd}`, {
        cwd: SHARED_DIR,
        stdio: 'inherit',
        timeout: 120000,
      });
    } catch (err) {
      console.error(`❌ ${cmd} 采集失败: ${err.message}`);
    }
  }

  console.log('\n✅ 数据刷新完成');
}

/**
 * 强制全量采集
 */
function forceFullSync() {
  console.log('\n📊 强制全量数据采集...');
  try {
    execSync(`node "${READER_SCRIPT}" full`, {
      cwd: SHARED_DIR,
      stdio: 'inherit',
      timeout: 300000,
    });
  } catch (err) {
    console.error(`❌ 全量采集失败: ${err.message}`);
  }
}

/**
 * 读取本地数据（供Skill调用）
 */
function readLocalData(type) {
  const config = DATA_FILES[type];
  if (!config) return null;
  if (!fs.existsSync(config.path)) return null;
  try {
    return JSON.parse(fs.readFileSync(config.path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 获取报表所需的全部数据
 */
function getReportData() {
  return {
    orders: readLocalData('orders'),
    roomStatus: readLocalData('roomStatus'),
    revenue: readLocalData('revenue'),
    priceCalendar: readLocalData('priceCalendar'),
    dataStatus: checkDataStatus(),
    generatedAt: formatDate(),
  };
}

// ============ CLI 入口 ============

function main() {
  const command = process.argv[2] || 'status';

  switch (command) {
    case 'status':
      checkDataStatus();
      break;
    case 'refresh':
      refreshExpiredData();
      break;
    case 'force':
      forceFullSync();
      break;
    default:
      console.log(`
📊 民宿报表 — 数据采集调度

用法:
  node data-collector.js status     检查本地数据状态（新鲜度）
  node data-collector.js refresh    刷新过期数据（仅采集过期的）
  node data-collector.js force      强制全量采集

数据文件位置: ${DATA_DIR}
      `);
      break;
  }
}

// 导出供其他模块调用
module.exports = { checkDataStatus, refreshExpiredData, readLocalData, getReportData };

if (require.main === module) {
  main();
}
