/**
 * 民宿同步 Skill — 批量同步执行器
 * 
 * 封装对 ota-operator 的批量调用，支持：
 * - 多平台串行执行
 * - 断点续传（部分失败后可重试）
 * - 同步日志记录
 * - 回滚能力（根据日志反向操作）
 * 
 * 用法：
 *   node sync-executor.js close --room "山景大床房" --dates 2026-06-05,2026-06-06
 *   node sync-executor.js open --room "山景大床房" --dates 2026-06-05
 *   node sync-executor.js price --room "山景大床房" --date 2026-06-05 --price 558
 *   node sync-executor.js status                查看同步日志
 *   node sync-executor.js retry <sync-id>       重试失败项
 */

const fs = require('fs');
const path = require('path');

// ============ 路径配置 ============

const SHARED_DIR = path.join(__dirname, '..', '..', '_shared');
const DATA_DIR = path.join(SHARED_DIR, 'data');
const SYNC_LOG_PATH = path.join(DATA_DIR, 'sync-log.json');
const CONFIG_PATH = path.join(SHARED_DIR, 'config.json');

// 动态加载 ota-operator
let OtaOperator;
try {
  ({ OtaOperator } = require(path.join(SHARED_DIR, 'scripts', 'ota-operator.js')));
} catch (err) {
  console.error('❌ 无法加载 ota-operator.js:', err.message);
  process.exit(1);
}

// ============ 工具函数 ============

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatDate() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function generateSyncId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `sync-${date}-${rand}`;
}

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function loadSyncLog() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(SYNC_LOG_PATH)) return { logs: [] };
  try {
    return JSON.parse(fs.readFileSync(SYNC_LOG_PATH, 'utf-8'));
  } catch { return { logs: [] }; }
}

function saveSyncLog(logData) {
  ensureDir(DATA_DIR);
  // 保留最近50条
  if (logData.logs.length > 50) logData.logs.splice(0, logData.logs.length - 50);
  fs.writeFileSync(SYNC_LOG_PATH, JSON.stringify(logData, null, 2), 'utf-8');
}

function getEnabledPlatforms() {
  const config = loadConfig();
  return Object.entries(config.platforms || {})
    .filter(([key, cfg]) => cfg.enabled)
    .map(([key]) => key);
}

// ============ 核心同步逻辑 ============

/**
 * 执行全平台关房同步
 */
async function syncCloseRoom(roomType, dates, platforms = null) {
  const targetPlatforms = platforms || getEnabledPlatforms();
  const operator = new OtaOperator();
  const syncId = generateSyncId();

  console.log(`\n🚫 全平台关房同步 [${syncId}]`);
  console.log(`   房型: ${roomType}`);
  console.log(`   日期: ${dates.join(', ')}`);
  console.log(`   平台: ${targetPlatforms.join(', ')}`);
  console.log('='.repeat(50));

  const syncEntry = {
    id: syncId,
    time: formatDate(),
    type: 'closeRoom',
    roomType,
    dates,
    platforms: {},
    triggeredBy: 'cli',
  };

  for (const platform of targetPlatforms) {
    console.log(`\n  🏪 ${platform}...`);
    const result = await operator.closeRoom(platform, roomType, dates);
    syncEntry.platforms[platform] = {
      status: result.success ? 'success' : 'failed',
      error: result.error || null,
      fallbackGuide: result.fallbackGuide || null,
    };

    if (result.success) {
      console.log(`  ✅ ${platform} 关房成功`);
    } else {
      console.log(`  ❌ ${platform} 关房失败: ${result.error}`);
    }
  }

  // 保存同步日志
  const logData = loadSyncLog();
  logData.logs.push(syncEntry);
  saveSyncLog(logData);

  // 输出汇总
  const successCount = Object.values(syncEntry.platforms).filter(p => p.status === 'success').length;
  const failCount = Object.values(syncEntry.platforms).filter(p => p.status === 'failed').length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 同步完成: 成功 ${successCount}, 失败 ${failCount}`);
  console.log(`📋 同步ID: ${syncId}`);

  return syncEntry;
}

/**
 * 执行全平台开房同步
 */
async function syncOpenRoom(roomType, dates, platforms = null) {
  const targetPlatforms = platforms || getEnabledPlatforms();
  const operator = new OtaOperator();
  const syncId = generateSyncId();

  console.log(`\n✅ 全平台开房同步 [${syncId}]`);
  console.log(`   房型: ${roomType}`);
  console.log(`   日期: ${dates.join(', ')}`);
  console.log('='.repeat(50));

  const syncEntry = {
    id: syncId,
    time: formatDate(),
    type: 'openRoom',
    roomType,
    dates,
    platforms: {},
    triggeredBy: 'cli',
  };

  for (const platform of targetPlatforms) {
    const result = await operator.openRoom(platform, roomType, dates);
    syncEntry.platforms[platform] = {
      status: result.success ? 'success' : 'failed',
      error: result.error || null,
    };
  }

  const logData = loadSyncLog();
  logData.logs.push(syncEntry);
  saveSyncLog(logData);

  return syncEntry;
}

/**
 * 执行全平台价格同步
 */
async function syncPrice(roomType, date, price, platforms = null) {
  const targetPlatforms = platforms || getEnabledPlatforms();
  const operator = new OtaOperator();
  const syncId = generateSyncId();

  console.log(`\n💲 全平台价格同步 [${syncId}]`);
  console.log(`   房型: ${roomType}`);
  console.log(`   日期: ${date}`);
  console.log(`   目标价: ¥${price}`);
  console.log('='.repeat(50));

  const syncEntry = {
    id: syncId,
    time: formatDate(),
    type: 'updatePrice',
    roomType,
    dates: [date],
    targetPrice: price,
    platforms: {},
    triggeredBy: 'cli',
  };

  for (const platform of targetPlatforms) {
    const result = await operator.updatePrice(platform, roomType, date, price);
    syncEntry.platforms[platform] = {
      status: result.success ? 'success' : 'failed',
      error: result.error || null,
    };
  }

  const logData = loadSyncLog();
  logData.logs.push(syncEntry);
  saveSyncLog(logData);

  return syncEntry;
}

/**
 * 查看同步日志
 */
function showSyncStatus() {
  const logData = loadSyncLog();
  if (logData.logs.length === 0) {
    console.log('\n📭 暂无同步记录');
    return;
  }

  console.log(`\n📋 同步日志（最近${Math.min(logData.logs.length, 10)}条）`);
  console.log('='.repeat(60));

  logData.logs.slice(-10).forEach(entry => {
    const platforms = Object.entries(entry.platforms);
    const success = platforms.filter(([, p]) => p.status === 'success').length;
    const fail = platforms.filter(([, p]) => p.status === 'failed').length;
    const icon = fail === 0 ? '✅' : '⚠️';

    console.log(`\n${icon} [${entry.id}] ${entry.time}`);
    console.log(`   操作: ${entry.type} | 房型: ${entry.roomType}`);
    console.log(`   结果: 成功${success} 失败${fail}`);
    if (fail > 0) {
      const failedPlatforms = platforms.filter(([, p]) => p.status === 'failed').map(([k]) => k);
      console.log(`   失败平台: ${failedPlatforms.join(', ')}`);
    }
  });
}

// ============ CLI 入口 ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  function getArg(name) {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : null;
  }

  switch (command) {
    case 'close': {
      const room = getArg('room');
      const dates = getArg('dates')?.split(',') || [];
      if (!room || dates.length === 0) {
        console.error('用法: node sync-executor.js close --room "山景大床房" --dates 2026-06-05,2026-06-06');
        process.exit(1);
      }
      await syncCloseRoom(room, dates);
      break;
    }
    case 'open': {
      const room = getArg('room');
      const dates = getArg('dates')?.split(',') || [];
      if (!room || dates.length === 0) {
        console.error('用法: node sync-executor.js open --room "山景大床房" --dates 2026-06-05');
        process.exit(1);
      }
      await syncOpenRoom(room, dates);
      break;
    }
    case 'price': {
      const room = getArg('room');
      const date = getArg('date');
      const price = parseInt(getArg('price'));
      if (!room || !date || !price) {
        console.error('用法: node sync-executor.js price --room "山景大床房" --date 2026-06-05 --price 558');
        process.exit(1);
      }
      await syncPrice(room, date, price);
      break;
    }
    case 'status':
      showSyncStatus();
      break;
    case 'retry': {
      if (!arg) {
        console.error('用法: node sync-executor.js retry <sync-id>');
        const logData = loadSyncLog();
        const failedLogs = logData.logs.filter(l =>
          Object.values(l.platforms || {}).some(p => p.status === 'failed')
        );
        if (failedLogs.length > 0) {
          console.log('\n可重试的同步ID:');
          failedLogs.slice(-5).forEach(l => {
            const failed = Object.entries(l.platforms || {}).filter(([, p]) => p.status === 'failed').map(([k]) => k);
            console.log(`  ${l.id} - ${l.type} ${l.roomType} (失败平台: ${failed.join(', ')})`);
          });
        } else {
          console.log('没有可重试的失败记录');
        }
        process.exit(1);
      }
      // 查找同步日志并重试失败的平台
      const logData = loadSyncLog();
      const syncEntry = logData.logs.find(l => l.id === arg);
      if (!syncEntry) {
        console.error(`❌ 未找到同步记录: ${arg}`);
        process.exit(1);
      }
      const failedPlatforms = Object.entries(syncEntry.platforms || {})
        .filter(([, p]) => p.status === 'failed')
        .map(([k]) => k);
      if (failedPlatforms.length === 0) {
        console.log('✅ 该同步记录无失败项，无需重试');
        break;
      }
      console.log(`\n🔄 重试同步 ${arg} 的失败平台: ${failedPlatforms.join(', ')}`);
      const operator = new OtaOperator();
      let retrySuccess = 0, retryFail = 0;
      for (const platform of failedPlatforms) {
        let result;
        switch (syncEntry.type) {
          case 'closeRoom':
            result = await operator.closeRoom(platform, syncEntry.roomType, syncEntry.dates);
            break;
          case 'openRoom':
            result = await operator.openRoom(platform, syncEntry.roomType, syncEntry.dates);
            break;
          case 'updatePrice':
            result = await operator.updatePrice(platform, syncEntry.roomType, syncEntry.dates[0], syncEntry.targetPrice);
            break;
          default:
            result = { success: false, error: `未知操作类型: ${syncEntry.type}` };
        }
        syncEntry.platforms[platform] = {
          status: result.success ? 'success' : 'failed',
          error: result.error || null,
          retriedAt: formatDate(),
        };
        if (result.success) retrySuccess++; else retryFail++;
        console.log(`  ${result.success ? '✅' : '❌'} ${platform}: ${result.success ? '成功' : result.error}`);
        if (result.fallbackGuide) console.log('\n' + result.fallbackGuide);
      }
      saveSyncLog(logData);
      console.log(`\n重试完成: 成功 ${retrySuccess}, 失败 ${retryFail}`);
      break;
    }
    default:
      console.log(`
🔄 民宿同步 Skill — 批量同步执行器

用法:
  node sync-executor.js close --room <r> --dates <d1,d2>     全平台关房
  node sync-executor.js open --room <r> --dates <d1,d2>      全平台开房
  node sync-executor.js price --room <r> --date <d> --price <n>  全平台改价
  node sync-executor.js status                                查看同步日志
      `);
      break;
  }
}

module.exports = { syncCloseRoom, syncOpenRoom, syncPrice };

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 执行出错:', err.message);
    process.exit(1);
  });
}
