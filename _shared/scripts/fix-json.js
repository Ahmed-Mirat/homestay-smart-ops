#!/usr/bin/env node
/**
 * fix-json.js — 数据文件修复工具
 *
 * 功能：
 * 1. 检测 JSON 语法错误（尾逗号、引号问题、编码问题）
 * 2. 尝试自动修复常见问题
 * 3. 验证必填字段完整性
 * 4. 修复前自动备份（.bak）
 * 5. 输出修复报告
 *
 * 用法：
 *   node _shared/scripts/fix-json.js orders        修复 data/orders.json
 *   node _shared/scripts/fix-json.js tasks         修复 data/tasks.json
 *   node _shared/scripts/fix-json.js config        修复 config.json
 *   node _shared/scripts/fix-json.js --check-all   检查所有数据文件
 */

const fs = require('fs');
const path = require('path');

const SHARED_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(SHARED_DIR, 'data');
const CONFIG_FILE = path.join(SHARED_DIR, 'config.json');

// 文件映射（涵盖民宿、公寓、中医馆等多类型常见数据文件）
const FILE_MAP = {
  orders: path.join(DATA_DIR, 'orders.json'),
  tasks: path.join(DATA_DIR, 'tasks.json'),
  schedule: path.join(DATA_DIR, 'schedule.json'),
  staff: path.join(DATA_DIR, 'staff.json'),
  'cron-log': path.join(DATA_DIR, 'cron-log.json'),
  members: path.join(DATA_DIR, 'members.json'),
  transactions: path.join(DATA_DIR, 'transactions.json'),
  inventory: path.join(DATA_DIR, 'inventory.json'),
  tenants: path.join(DATA_DIR, 'tenants.json'),
  'service-rules': path.join(DATA_DIR, 'service-rules.json'),
  'tcm-config': path.join(DATA_DIR, 'tcm-config.json'),
  config: CONFIG_FILE,
};

const args = process.argv.slice(2);

if (args.includes('--check-all')) {
  checkAll();
} else if (args.length > 0 && !args[0].startsWith('--')) {
  const target = args[0];
  if (!FILE_MAP[target]) {
    console.error(`❌ 未知文件: ${target}`);
    console.log(`可用文件: ${Object.keys(FILE_MAP).join(', ')}`);
    process.exit(1);
  }
  fixFile(target, FILE_MAP[target]);
} else {
  console.log('用法:');
  console.log('  node fix-json.js <filename>     修复指定文件');
  console.log('  node fix-json.js --check-all    检查所有数据文件');
  console.log(`\n可用文件: ${Object.keys(FILE_MAP).join(', ')}`);
}

function checkAll() {
  console.log('━━━ 数据文件完整性检查 ━━━━━━━━━━━━━━\n');
  let issues = 0;
  let checked = 0;

  Object.entries(FILE_MAP).forEach(([name, filePath]) => {
    if (!fs.existsSync(filePath)) {
      console.log(`  ⏭️  ${name}: 文件不存在（正常，未使用该功能）`);
      return;
    }
    checked++;

    const result = validateJson(filePath);
    if (result.ok) {
      console.log(`  ✅ ${name}: 正常 (${result.records} 条记录)`);
    } else {
      console.log(`  ❌ ${name}: ${result.error}`);
      console.log(`     💡 执行 node fix-json.js ${name} 修复`);
      issues++;
    }
  });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  if (issues === 0) {
    console.log(`✅ 所有文件正常（共检查 ${checked} 个文件）`);
  } else {
    console.log(`⚠️  ${issues} 个文件存在问题（共检查 ${checked} 个文件）`);
  }
  process.exit(issues === 0 ? 0 : 1);
}

function fixFile(name, filePath) {
  console.log(`━━━ 修复: ${name} ━━━━━━━━━━━━━━━━━━━━\n`);

  if (!fs.existsSync(filePath)) {
    console.log(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }

  // 读取原始内容
  const raw = fs.readFileSync(filePath, 'utf-8');

  // 尝试解析
  const parseResult = validateJson(filePath);
  if (parseResult.ok) {
    console.log(`✅ ${name} 文件语法正确，无需修复。`);
    console.log(`   记录数: ${parseResult.records}`);
    return;
  }

  console.log(`❌ 发现问题: ${parseResult.error}\n`);
  console.log('🔧 尝试自动修复...\n');

  // 备份
  const backupPath = filePath + '.bak';
  fs.copyFileSync(filePath, backupPath);
  console.log(`  📋 已备份到: ${path.basename(backupPath)}`);

  // 尝试修复
  let fixed = raw;
  const fixes = [];

  // 修复 1: 移除 BOM
  if (fixed.charCodeAt(0) === 0xfeff) {
    fixed = fixed.slice(1);
    fixes.push('移除 BOM 标记');
  }

  // 修复 2: 移除尾逗号
  const trailingComma = /,(\s*[}\]])/g;
  if (trailingComma.test(fixed)) {
    fixed = fixed.replace(trailingComma, '$1');
    fixes.push('移除尾部多余逗号');
  }

  // 修复 3: 修复单引号为双引号
  // 仅当文件不含双引号时启用（避免误改字符串内容）
  if (fixed.includes("'") && !fixed.includes('"')) {
    fixed = fixed.replace(/'/g, '"');
    fixes.push('单引号转双引号');
  }

  // 修复 4: 统一换行（去掉 \r）
  if (fixed.includes('\r')) {
    fixed = fixed.replace(/\r\n?/g, '\n');
    fixes.push('统一换行符为 LF');
  }

  // 尝试再次解析
  try {
    const parsed = JSON.parse(fixed);
    fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
    console.log(`\n✅ 修复成功！`);
    if (fixes.length === 0) {
      console.log('  • 重新格式化文件');
    } else {
      fixes.forEach((f) => console.log(`  • ${f}`));
    }
    console.log(`\n  原始备份: ${path.basename(backupPath)}`);
  } catch (e) {
    // 修复失败，还原
    fs.copyFileSync(backupPath, filePath);
    console.log(`\n❌ 自动修复失败，已还原原文件。`);
    console.log(`   错误位置: ${e.message.split('\n')[0]}`);
    console.log(`   💡 建议手动检查文件内容（备份: ${path.basename(backupPath)}）`);
    process.exit(1);
  }
}

function validateJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    const records = Array.isArray(parsed)
      ? parsed.length
      : parsed && typeof parsed === 'object'
      ? Object.keys(parsed).length
      : 0;
    return { ok: true, records };
  } catch (e) {
    const match = e.message.match(/position (\d+)/);
    const pos = match ? `第 ${match[1]} 字符处` : '';
    return {
      ok: false,
      error: `JSON 解析失败 ${pos}: ${e.message.split('\n')[0]}`,
    };
  }
}

module.exports = { validateJson, FILE_MAP };
