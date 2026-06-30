/**
 * 民宿流程 Skill — Cron 定时调度器
 * 
 * 在 Qoder 工作环境中运行，按配置时间触发各 Skill 的关键操作。
 * 
 * 用法：
 *   node cron-scheduler.js start        启动定时调度（前台运行）
 *   node cron-scheduler.js start-bg     启动定时调度（后台运行）
 *   node cron-scheduler.js status       查看调度状态
 *   node cron-scheduler.js run <task>   手动触发指定任务
 *   node cron-scheduler.js list         列出所有定时任务
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const cron = require(path.join(__dirname, '..', '..', '_shared', 'node_modules', 'node-cron'));

// ============ 路径配置 ============

const ROOT_DIR = path.join(__dirname, '..', '..');
const SHARED_DIR = path.join(ROOT_DIR, '_shared');
const DATA_DIR = path.join(SHARED_DIR, 'data');
const CRON_LOG_PATH = path.join(DATA_DIR, 'cron-log.json');

// ============ 任务定义 ============

const SCHEDULED_TASKS = {
  'daily-data-sync': {
    name: '日常数据同步',
    schedule: '0 8 * * *', // 每日 08:00
    description: '从OTA商家后台采集经营数据',
    command: `node "${path.join(SHARED_DIR, 'scripts', 'ota-reader.js')}" daily`,
    cwd: SHARED_DIR,
  },
  'daily-report': {
    name: '生成日报',
    schedule: '10 8 * * *', // 每日 08:10（数据同步后）
    description: '基于采集数据生成经营日报',
    command: `node "${path.join(ROOT_DIR, 'homestay-report', 'scripts', 'data-collector.js')}" refresh`,
    cwd: ROOT_DIR,
  },
  'competitor-scrape': {
    name: '竞品数据采集',
    schedule: '0 10 * * *', // 每日 10:00
    description: '采集竞品价格数据',
    command: `node "${path.join(ROOT_DIR, 'homestay-pricing', 'scripts', 'scraper.js')}" scrape`,
    cwd: path.join(ROOT_DIR, 'homestay-pricing'),
  },
  'checkin-check': {
    name: '检查次日入住',
    schedule: '0 16 * * *', // 每日 16:00
    description: '检查明日是否有入住订单，生成准备清单并派发保洁任务',
    handler: function() {
      const taskManager = require(path.join(SHARED_DIR, 'scripts', 'task-manager.js'));
      const orders = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'orders.json'), 'utf-8') || '{"orders":[]}');
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      const checkins = (orders.orders || []).filter(o => (o.checkIn || o.checkin) === tomorrow);
      
      if (checkins.length > 0) {
        checkins.forEach(order => taskManager.generateCheckinPrep(order));
        console.log(`[CRON] 生成了 ${checkins.length} 个入住准备任务`);
        // 触发通知
        try {
          const { notifyMarkdown } = require(path.join(SHARED_DIR, 'scripts', 'notifier.js'));
          const list = checkins.map(o => `- ${o.guestName || '客人'} ${o.roomType || ''} ${o.roomNumber || ''}`).join('\n');
          notifyMarkdown(`📋 **明日入住提醒**\n\n${list}\n\n入住准备任务已创建`);
        } catch(e) { console.log('[CRON] 通知发送跳过:', e.message); }
      } else {
        console.log('[CRON] 明日无入住订单');
      }
    },
  },
  'daily-close': {
    name: '日终流程',
    schedule: '0 22 * * *', // 每日 22:00
    description: '日终汇总：统计今日完成任务、生成明日待办',
    handler: function() {
      const taskManager = require(path.join(SHARED_DIR, 'scripts', 'task-manager.js'));
      const tasks = taskManager.listTasks({});
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayTasks = tasks.filter(t => t.createdAt?.startsWith(todayStr));
      const done = todayTasks.filter(t => t.status === 'done').length;
      const total = todayTasks.length;
      
      console.log(`[CRON] 日终汇总: ${done}/${total} 任务完成`);
      
      // 触发通知
      try {
        const { notifyMarkdown } = require(path.join(SHARED_DIR, 'scripts', 'notifier.js'));
        notifyMarkdown(`🌙 **日终汇总**\n\n> 今日任务：${done}/${total} 完成\n> 完成率：${total > 0 ? Math.round(done/total*100) : 0}%`);
      } catch(e) { console.log('[CRON] 通知发送跳过:', e.message); }
    },
  },
  'weekly-report': {
    name: '生成周报',
    schedule: '0 9 * * 1', // 每周一 09:00
    description: '生成上周经营周报',
    handler: function() {
      console.log('[CRON] 周报生成触发 — 需要report Skill配合处理');
      // 触发报表数据采集
      try {
        execSync(`node "${path.join(ROOT_DIR, 'homestay-report', 'scripts', 'data-collector.js')}" refresh`, { stdio: 'inherit' });
      } catch(e) { console.log('[CRON] 数据采集跳过:', e.message); }
    },
  },
  'oversell-check': {
    name: '超卖预防检测',
    schedule: '*/5 * * * *', // 每5分钟
    description: '检查各平台是否有新订单，有则自动关闭其他平台同期售卖',
    command: 'echo "[CRON] 超卖预防检测 — 需Phase B完成后激活"',
    note: '依赖OTA授权（Phase B），未授权时跳过',
    requiresPhase: 'B',
  },
};

// ============ 动态任务注册 ============

const DYNAMIC_TASKS_PATH = path.join(DATA_DIR, 'scheduled-tasks.json');

/**
 * 从 JSON 配置文件加载动态注册的定时任务
 * Agent 通过编辑此文件来注册/启停任务
 */
function loadDynamicTasks() {
  if (!fs.existsSync(DYNAMIC_TASKS_PATH)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(DYNAMIC_TASKS_PATH, 'utf-8'));
    const tasks = {};
    (data.dynamic || []).forEach(t => {
      tasks[t.id] = {
        name: t.name,
        schedule: t.schedule,
        description: t.description,
        command: t.command,
        cwd: t.cwd || ROOT_DIR,
        enabled: t.enabled !== false, // 默认启用
        dynamic: true,
      };
    });
    return tasks;
  } catch (e) {
    console.error('[CRON] 加载动态任务失败:', e.message);
    return {};
  }
}

/**
 * 合并内置任务和动态任务
 * 动态任务与内置任务ID冲突时，内置任务优先
 */
function mergeTasks() {
  const dynamic = loadDynamicTasks();
  const merged = { ...dynamic };  // 动态任务先放入
  // 内置任务覆盖同ID的动态任务
  Object.entries(SCHEDULED_TASKS).forEach(([id, task]) => {
    merged[id] = task;
  });
  return merged;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function formatDate() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function loadCronLog() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(CRON_LOG_PATH)) return { executions: [] };
  try {
    return JSON.parse(fs.readFileSync(CRON_LOG_PATH, 'utf-8'));
  } catch { return { executions: [] }; }
}

function appendCronLog(taskId, result) {
  const log = loadCronLog();
  log.executions.push({
    taskId,
    time: formatDate(),
    result: result.success ? 'success' : 'failed',
    output: result.output?.slice(0, 500) || '',
    error: result.error || null,
  });
  // 保留最近200条
  if (log.executions.length > 200) log.executions.splice(0, log.executions.length - 200);
  fs.writeFileSync(CRON_LOG_PATH, JSON.stringify(log, null, 2), 'utf-8');
}

/**
 * 执行单个任务
 */
function executeTask(taskId) {
  const allTasks = mergeTasks();
  const task = allTasks[taskId];
  if (!task) {
    console.error(`❌ 未知任务: ${taskId}`);
    console.error(`   可用任务: ${Object.keys(allTasks).join(', ')}`);
    return { success: false, error: '未知任务' };
  }

  // 检查阶段依赖
  if (task.requiresPhase) {
    console.log(`   ⏭️ 跳过 (需完成 Phase ${task.requiresPhase})`);
    return { success: true, output: 'skipped - phase not reached' };
  }

  console.log(`\n⏰ [${formatDate()}] 执行任务: ${task.name}`);
  console.log(`   ${task.description}`);

  try {
    // 优先使用 handler 函数，否则使用 command
    if (task.handler && typeof task.handler === 'function') {
      task.handler();
      console.log(`   ✅ 完成 (handler)`);
      const result = { success: true, output: 'handler executed' };
      appendCronLog(taskId, result);
      return result;
    }
    
    const output = execSync(task.command, {
      cwd: task.cwd || ROOT_DIR,
      timeout: 180000, // 3分钟超时
      encoding: 'utf-8',
    });
    console.log(`   ✅ 完成`);
    const result = { success: true, output };
    appendCronLog(taskId, result);
    return result;
  } catch (err) {
    console.error(`   ❌ 失败: ${err.message}`);
    const result = { success: false, error: err.message };
    appendCronLog(taskId, result);
    return result;
  }
}

// ============ 调度器 ============

function startScheduler() {
  const allTasks = mergeTasks();
  const builtin = Object.keys(SCHEDULED_TASKS).length;
  const dynamic = Object.keys(allTasks).length - builtin;

  console.log('\n⏰ 民宿 Cron 调度器已启动');
  console.log('='.repeat(50));
  console.log(`启动时间: ${formatDate()}`);
  console.log(`任务数量: ${Object.keys(allTasks).length} (内置${builtin} + 动态${dynamic})\n`);

  let enabledCount = 0;
  let skippedCount = 0;
  for (const [taskId, task] of Object.entries(allTasks)) {
    if (!cron.validate(task.schedule)) {
      console.error(`⚠️ 无效的Cron表达式: ${task.schedule} (${taskId})`);
      continue;
    }

    // 动态任务可通过 enabled=false 暂停
    if (task.dynamic && task.enabled === false) {
      console.log(`  ⏸️ ${task.schedule.padEnd(15)} → ${task.name} (已暂停, enabled=false)`);
      skippedCount++;
      continue;
    }

    cron.schedule(task.schedule, () => {
      executeTask(taskId);
    });

    console.log(`  ✅ ${task.schedule.padEnd(15)} → ${task.name}${task.dynamic ? ' [动态]' : ''}`);
    enabledCount++;
  }

  console.log(`\n已启用: ${enabledCount} | 已暂停: ${skippedCount}`);
  console.log('动态任务管理: 编辑 _shared/data/scheduled-tasks.json，重启调度器生效');
  console.log('调度器运行中... (Ctrl+C 停止)\n');
}

function listTasks() {
  const allTasks = mergeTasks();
  const builtinIds = Object.keys(SCHEDULED_TASKS);

  console.log('\n📋 定时任务列表');
  console.log('='.repeat(60));

  console.log('\n  ── 内置任务 ──');
  Object.entries(allTasks)
    .filter(([id]) => builtinIds.includes(id))
    .forEach(([taskId, task]) => {
      console.log(`\n  [${taskId}]`);
      console.log(`    名称: ${task.name}`);
      console.log(`    时间: ${task.schedule}`);
      console.log(`    说明: ${task.description}`);
      if (task.note) console.log(`    备注: ${task.note}`);
    });

  const dynamicTasks = Object.entries(allTasks)
    .filter(([id]) => !builtinIds.includes(id));
  if (dynamicTasks.length > 0) {
    console.log('\n  ── 动态任务 (scheduled-tasks.json) ──');
    dynamicTasks.forEach(([taskId, task]) => {
      const status = task.enabled !== false ? '✅' : '⏸️';
      console.log(`\n  ${status} [${taskId}]`);
      console.log(`    名称: ${task.name}`);
      console.log(`    时间: ${task.schedule}`);
      console.log(`    说明: ${task.description}`);
      console.log(`    启用: ${task.enabled !== false ? '是' : '否'}`);
    });
    console.log('\n  💡 动态任务通过编辑 _shared/data/scheduled-tasks.json 管理');
  }
}

function showStatus() {
  const log = loadCronLog();
  console.log('\n📊 Cron 调度状态');
  console.log('='.repeat(60));

  if (log.executions.length === 0) {
    console.log('暂无执行记录');
    return;
  }

  console.log(`总执行次数: ${log.executions.length}`);
  console.log(`\n最近10次执行:`);

  log.executions.slice(-10).forEach(exec => {
    const icon = exec.result === 'success' ? '✅' : '❌';
    console.log(`  ${icon} [${exec.time}] ${exec.taskId}`);
    if (exec.error) console.log(`     错误: ${exec.error}`);
  });
}

// ============ CLI 入口 ============

function main() {
  const command = process.argv[2] || 'help';
  const arg = process.argv[3];

  switch (command) {
    case 'start':
      startScheduler();
      break;
    case 'status':
      showStatus();
      break;
    case 'run':
      if (!arg) {
        const allIds = Object.keys(mergeTasks());
        console.error('用法: node cron-scheduler.js run <task-id>');
        console.error('可用任务: ' + allIds.join(', '));
        process.exit(1);
      }
      executeTask(arg);
      break;
    case 'list':
      listTasks();
      break;
    default:
      console.log(`
⏰ 民宿流程 Skill — Cron 定时调度器

用法:
  node cron-scheduler.js start       启动定时调度器
  node cron-scheduler.js status      查看执行状态和日志
  node cron-scheduler.js run <id>    手动触发指定任务
  node cron-scheduler.js list        列出所有定时任务

内置任务: ${Object.keys(SCHEDULED_TASKS).join(', ')}
动态任务: 编辑 _shared/data/scheduled-tasks.json 注册新任务
      `);
      break;
  }
}

main();
