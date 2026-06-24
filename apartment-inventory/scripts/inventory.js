#!/usr/bin/env node
/**
 * 物资出入库记账
 * 用法:
 *   node inventory.js in  "矿泉水" 5 "箱" "日常补货"
 *   node inventory.js out "垃圾袋" 3 "卷" "301房客领取"
 *   node inventory.js list                — 全部库存
 *   node inventory.js low                 — 低于阈值的物资
 *   node inventory.js log                 — 出入库流水
 */

const fs = require('fs');
const path = require('path');

const INV_FILE = path.join(__dirname, '..', '..', '_shared', 'data', 'inventory.json');

const defaults = {
  items: [],
  log: [],
  thresholds: { default: 5 }
};

function load() {
  if (!fs.existsSync(INV_FILE)) {
    fs.writeFileSync(INV_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  return JSON.parse(fs.readFileSync(INV_FILE, 'utf-8'));
}

function save(d) { fs.writeFileSync(INV_FILE, JSON.stringify(d, null, 2)); }

function now() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

const cmd = process.argv[2];

if (cmd === 'in' || cmd === 'out') {
  const name = process.argv[3];
  const qty = parseInt(process.argv[4]) || 1;
  const unit = process.argv[5] || '个';
  const note = process.argv.slice(6).join(' ') || '';

  if (!name) { console.log('用法: inventory.js in|out [品名] [数量] [单位] [备注]'); process.exit(1); }

  const data = load();
  let item = data.items.find(i => i.name === name);

  if (!item) {
    item = { name, qty: 0, unit, threshold: data.thresholds.default };
    data.items.push(item);
  }

  const before = item.qty;
  item.qty += cmd === 'in' ? qty : -qty;
  if (item.qty < 0) item.qty = 0;

  const record = {
    time: now(),
    type: cmd === 'in' ? '入库' : '出库',
    name, qty, unit, before, after: item.qty, note
  };
  data.log.push(record);
  save(data);

  const icon = cmd === 'in' ? '📥' : '📤';
  console.log(`${icon} ${record.type}: ${name} ${qty}${unit} (${before}→${item.qty})${note ? ' — '+note : ''}`);

  // Threshold check
  if (item.qty <= item.threshold) {
    console.log(`⚠️  ${name} 库存仅剩 ${item.qty}${unit}，低于阈值(${item.threshold})，建议补货`);
  }

} else if (cmd === 'list') {
  const data = load();
  if (!data.items.length) { console.log('暂无库存记录'); process.exit(0); }
  console.log('📦 当前库存:');
  data.items.forEach(i => {
    const warn = i.qty <= i.threshold ? ' ⚠️' : '';
    console.log(`  ${i.name}: ${i.qty}${i.unit} (阈值:${i.threshold})${warn}`);
  });

} else if (cmd === 'low') {
  const data = load();
  const low = data.items.filter(i => i.qty <= i.threshold);
  if (!low.length) { console.log('✅ 所有物资库存正常'); process.exit(0); }
  console.log('⚠️ 低库存物资:');
  low.forEach(i => console.log(`  ${i.name}: ${i.qty}${i.unit} (阈值:${i.threshold})`));

} else if (cmd === 'log') {
  const data = load();
  const recent = data.log.slice(-20).reverse();
  if (!recent.length) { console.log('暂无出入库记录'); process.exit(0); }
  console.log('📋 最近20条出入库记录:');
  recent.forEach(r => {
    const icon = r.type === '入库' ? '📥' : '📤';
    console.log(`  ${icon} ${r.time} ${r.name} ${r.qty}${r.unit} ${r.before}→${r.after} ${r.note||''}`);
  });

} else if (cmd === 'set-threshold') {
  const name = process.argv[3];
  const val = parseInt(process.argv[4]);
  if (!name || !val) { console.log('用法: inventory.js set-threshold [品名] [数量]'); process.exit(1); }
  const data = load();
  const item = data.items.find(i => i.name === name);
  if (!item) { console.log(`物资 "${name}" 不存在`); process.exit(1); }
  item.threshold = val;
  save(data);
  console.log(`✅ ${name} 阈值已更新为 ${val}`);

} else {
  console.log('用法: node inventory.js in|out|list|low|log|set-threshold');
}
