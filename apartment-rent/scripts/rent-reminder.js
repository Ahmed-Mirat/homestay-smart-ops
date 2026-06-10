#!/usr/bin/env node
/**
 * 房租催缴引擎
 * 用法: node rent-reminder.js check   — 检查并生成催缴话术
 *       node rent-reminder.js mark T001 — 标记租客已缴
 *       node rent-reminder.js list      — 列出本月催缴统计
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', '_shared', 'data', 'tenants.json');

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    console.log(JSON.stringify({ tenants: [], rules: { early_days: 3, overdue_levels: [1, 3, 7], auto_push: false, push_time: '09:00' } }));
    return null;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getDaysUntil(dayOfMonth) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function getReminder(tenant, rules) {
  const daysUntil = getDaysUntil(tenant.rent_day);
  if (tenant.status === '已缴') return null;

  const tagMultiplier = tenant.tag === '关注' ? 1.5 : tenant.tag === '优质' ? 0.7 : 1;
  const earlyDays = Math.round(rules.early_days * tagMultiplier);

  let level, urgency, template;

  if (daysUntil > earlyDays) return null; // not yet

  if (daysUntil > 0 && daysUntil <= earlyDays) {
    level = 'early';
    urgency = '提前提醒';
    template = `${tenant.name}您好，您的房租${tenant.amount}元将于${tenant.rent_day}日到期（还有${daysUntil}天），温馨提醒您提前安排～`;
  } else if (daysUntil === 0 || daysUntil === -1) {
    level = 'due';
    urgency = '到期催收';
    template = `${tenant.name}您好，您的房租${tenant.amount}元今天到期，请尽快完成缴费。如有困难可随时与我沟通。`;
  } else {
    const overdue = Math.abs(daysUntil);
    const stage = rules.overdue_levels.filter(l => overdue >= l).length;
    level = 'overdue';
    urgency = `逾期通知(L${stage})`;
    template = `${tenant.name}您好，您的房租${tenant.amount}元已逾期${overdue}天，请于48小时内完成缴纳，以免影响正常居住。`;
  }

  return {
    tenant_id: tenant.id,
    tenant_name: tenant.name,
    room: tenant.room,
    tag: tenant.tag,
    days_until: daysUntil,
    level,
    urgency,
    message: template,
    amount: tenant.amount,
    rent_day: tenant.rent_day
  };
}

// ========== CLI ==========
const cmd = process.argv[2];

if (cmd === 'check') {
  const data = load();
  if (!data || !data.tenants.length) { console.log('[]'); process.exit(0); }

  const reminders = data.tenants
    .map(t => getReminder(t, data.rules))
    .filter(Boolean);

  console.log(JSON.stringify(reminders, null, 2));
} else if (cmd === 'mark') {
  const id = process.argv[3];
  if (!id) { console.log('用法: rent-reminder.js mark [租客ID]'); process.exit(1); }

  const data = load();
  const tenant = data.tenants.find(t => t.id === id);
  if (!tenant) { console.log(`租客 ${id} 未找到`); process.exit(1); }

  const today = new Date();
  tenant.last_paid = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  tenant.status = '已缴';
  save(data);
  console.log(`✅ ${tenant.name}(${tenant.room}) 已标记为已缴`);
} else if (cmd === 'list') {
  const data = load();
  if (!data || !data.tenants.length) { console.log('暂无租客数据'); process.exit(0); }

  const paid = data.tenants.filter(t => t.status === '已缴').length;
  const unpaid = data.tenants.filter(t => t.status !== '已缴').length;

  console.log(`本月催缴统计 (${data.tenants.length}户)`);
  console.log(`  ✅ 已缴: ${paid}`);
  console.log(`  ❌ 未缴: ${unpaid}`);
  if (unpaid > 0) {
    console.log('\n未缴明细:');
    data.tenants.filter(t => t.status !== '已缴').forEach(t => {
      const d = getDaysUntil(t.rent_day);
      console.log(`  ${t.name}(${t.room}) 交租日:${t.rent_day}日 ¥${t.amount} 距交租日:${d}天 [${t.tag}]`);
    });
  }
} else {
  console.log('用法: node rent-reminder.js check|mark [ID]|list');
}
