#!/usr/bin/env node
/**
 * 增值服务推送引擎
 * 根据入住时长/季节节点匹配推送规则
 * 用法: node service-pusher.js check [租客ID]   — 检查某租客该推送什么
 *       node service-pusher.js rules             — 查看当前规则
 *       node service-pusher.js add-rule          — 交互式添加规则
 */

const fs = require('fs');
const path = require('path');

const TENANTS_FILE = path.join(__dirname, '..', '..', '_shared', 'data', 'tenants.json');
const RULES_FILE = path.join(__dirname, '..', '..', '_shared', 'data', 'service-rules.json');

const defaultRules = {
  rules: [
    { id: 1, name: '入住保洁', trigger: 'checkin', days: 0, message: '欢迎入住！如有深度保洁需求，可联系我预约～', icon: '🧹' },
    { id: 2, name: '月度保洁', trigger: 'stay', days: 30, message: '您已入住30天，建议安排一次全屋保洁，保持居住舒适～', icon: '🏠' },
    { id: 3, name: '空调清洗(夏)', trigger: 'season', months: [5,6,7,8], message: '夏季将至，建议预约空调清洗服务，确保制冷效果～', icon: '❄️' },
    { id: 4, name: '净水滤芯更换', trigger: 'stay', days: 90, message: '您已入住90天，净水器滤芯建议更换，可联系我预约～', icon: '💧' },
    { id: 5, name: '暖气检查(冬)', trigger: 'season', months: [10,11,12], message: '冬季将至，建议预约暖气设备检查～', icon: '🔥' },
    { id: 6, name: '家电清洗', trigger: 'stay', days: 60, message: '您已入住60天，需要家电深度清洗服务吗？洗衣机/冰箱均可～', icon: '🔧' },
    { id: 7, name: '续租优惠', trigger: 'stay', days: 330, message: '您的租期即将满一年，续租可享专属优惠，详聊～', icon: '🎁' },
    { id: 8, name: '退租保洁', trigger: 'moveout', days: -7, message: '距退租还有7天，预约退租保洁可免扣押金，提前安排更省心～', icon: '✨' }
  ]
};

function loadRules() {
  if (!fs.existsSync(RULES_FILE)) {
    fs.writeFileSync(RULES_FILE, JSON.stringify(defaultRules, null, 2));
    return defaultRules;
  }
  return JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
}

function loadTenants() {
  if (!fs.existsSync(TENANTS_FILE)) return { tenants: [] };
  return JSON.parse(fs.readFileSync(TENANTS_FILE, 'utf-8'));
}

function getStayDays(checkinDate) {
  const now = new Date();
  const checkin = new Date(checkinDate);
  return Math.floor((now - checkin) / (1000 * 60 * 60 * 24));
}

const cmd = process.argv[2];

if (cmd === 'check') {
  const tid = process.argv[3];
  const rules = loadRules();
  const tenants = loadTenants();
  const targets = tid ? tenants.tenants.filter(t => t.id === tid) : tenants.tenants;

  const results = [];
  for (const t of targets) {
    // For apartment tenants, use rent_day as proxy — need checkin date
    // If no explicit checkin, use last_paid as approximate
    const checkin = t.checkin || t.last_paid;
    if (!checkin) continue;

    const stayDays = getStayDays(checkin);
    const month = new Date().getMonth() + 1;

    for (const rule of rules.rules) {
      let match = false;
      if (rule.trigger === 'checkin' && stayDays >= 0 && stayDays <= rule.days) match = true;
      if (rule.trigger === 'moveout' && stayDays >= rule.days && rule.days < 0) match = true;
      if (rule.trigger === 'stay' && rule.days > 0 && stayDays >= rule.days - 3 && stayDays <= rule.days + 3) match = true;
      if (rule.trigger === 'season' && rule.months && rule.months.includes(month)) match = true;

      if (match) {
        results.push({
          tenant_name: t.name, room: t.room, stay_days: stayDays,
          rule: rule.name, icon: rule.icon, message: rule.message
        });
      }
    }
  }

  if (!results.length) { console.log('[]'); process.exit(0); }
  console.log(JSON.stringify(results, null, 2));

} else if (cmd === 'rules') {
  const rules = loadRules();
  console.log('📋 当前增值服务规则:');
  rules.rules.forEach(r => {
    const trigger = r.trigger === 'checkin' ? '入住时' : r.trigger === 'stay' ? `入住${r.days}天` : r.trigger === 'season' ? `季节(${r.months.join(',')}月)` : r.trigger === 'moveout' ? '退租前' : r.trigger;
    console.log(`  ${r.icon} ${r.name} [${trigger}]: ${r.message}`);
  });
  console.log(`\n共 ${rules.rules.length} 条规则，修改请编辑 _shared/data/service-rules.json`);

} else {
  console.log('用法: node service-pusher.js check [租客ID] | rules');
}
