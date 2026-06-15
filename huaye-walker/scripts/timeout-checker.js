#!/usr/bin/env node
/**
 * 华业沃克 — 维修工单超时检测器
 * 扫描 type=repair 且 status!=done 且超过24h的任务，输出超时清单
 * 通常由 cron-scheduler 每小时调用，或 Agent 手动触发
 *
 * 用法:
 *   node timeout-checker.js check    检测超时工单（输出JSON）
 *   node timeout-checker.js notify   检测超时工单并推送提醒
 */

const fs = require('fs');
const path = require('path');

const TASKS_PATH = path.join(__dirname, '..', '..', '_shared', 'data', 'tasks.json');
const CONFIG_PATH = path.join(__dirname, '..', '..', '_shared', 'config.json');

function loadJSON(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function now() { return new Date(); }

function hoursSince(isoStr) {
  if (!isoStr) return Infinity;
  const t = new Date(isoStr.replace(' ', 'T'));
  return (now() - t) / 3600000;
}

function check() {
  const data = loadJSON(TASKS_PATH);
  if (!data || !Array.isArray(data.tasks)) {
    console.log(JSON.stringify({ overdue: [], total: 0, message: '无任务数据' }));
    return [];
  }

  const overdue = data.tasks.filter(t => {
    if (t.type !== 'repair') return false;
    if (t.status === 'done') return false;
    return hoursSince(t.createdAt) > 24;
  });

  const result = {
    checkedAt: now().toISOString().replace('T', ' ').slice(0, 19),
    overdue: overdue.map(t => ({
      id: t.id,
      room: t.room,
      name: t.name,
      assignee: t.assignee,
      createdBy: t.createdBy || '未知',
      createdAt: t.createdAt,
      hoursElapsed: Math.round(hoursSince(t.createdAt)),
      status: t.status,
    })),
    total: overdue.length,
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function notify() {
  const result = check();
  if (result.total === 0) {
    console.log('✅ 无超时工单');
    return;
  }

  const notifier = require(path.join(__dirname, '..', '..', '_shared', 'scripts', 'notifier.js'));
  const rows = result.overdue.map(t =>
    `> ${t.room}房 ${t.name} | 派单人:${t.createdBy} | 维修:${t.assignee} | 已超时${t.hoursElapsed}h`
  ).join('\n');

  const msg = [
    `⚠️ **维修工单超时提醒**`,
    `> 以下工单超过24小时未反馈完工状态：`,
    rows,
    `> `,
    `> 请相关人员尽快处理或更新状态`,
  ].join('\n');

  const res = await notifier.notifyMarkdown(msg);
  console.log(res.success ? '✅ 超时提醒已推送' : `❌ 推送失败: ${res.error}`);
}

const cmd = process.argv[2] || 'check';
if (cmd === 'notify') notify().catch(e => { console.error(e.message); process.exit(1); });
else check();
