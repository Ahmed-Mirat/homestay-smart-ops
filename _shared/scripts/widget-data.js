/**
 * 民宿 Skill 套件 — Widget 数据桥接器
 * 
 * 负责从本地 JSON 文件读取数据，组装为 Widget 所需的格式。
 * Agent 在调用 show_widget 前，先通过此脚本获取数据。
 * 
 * 用法：
 *   node widget-data.js workspace      获取工作台面板数据
 *   node widget-data.js task-board      获取任务看板数据
 *   node widget-data.js schedule        获取排班面板数据
 *   node widget-data.js report          获取报表面板数据
 * 
 * show_widget 调用规范（供 SKILL.md 引用）：
 * 
 *   Agent 通过以下方式展示 Widget：
 *   1. 调用此脚本获取数据 JSON
 *   2. 使用 show_widget 工具，传入 widget_path + data
 * 
 *   示例：
 *   ```
 *   show_widget({
 *     title: "民宿运营工作台",
 *     widget_path: "skills/_shared/assets/workspace-widget.html",
 *     data: <widget-data.js workspace 的输出>
 *   })
 *   ```
 */

const fs = require('fs');
const path = require('path');

const SHARED_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(SHARED_DIR, 'data');
const CONFIG_PATH = path.join(SHARED_DIR, 'config.json');

function loadJSON(filepath) {
  if (!fs.existsSync(filepath)) return null;
  try { return JSON.parse(fs.readFileSync(filepath, 'utf-8')); }
  catch { return null; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ============ 工作台数据 ============

function getWorkspaceData() {
  const config = loadJSON(CONFIG_PATH) || {};
  const tasks = loadJSON(path.join(DATA_DIR, 'tasks.json'))?.tasks || [];
  const revenue = loadJSON(path.join(DATA_DIR, 'revenue.json'));
  const roomStatus = loadJSON(path.join(DATA_DIR, 'room-status.json'));
  
  const todayTasks = tasks.filter(t => t.createdAt?.startsWith(today()));
  const pendingTasks = todayTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  
  // 构建KPI
  const kpi = {
    revenue: revenue?.today?.total || null,
    revenueChange: revenue?.today?.changePercent || null,
    occupancy: roomStatus?.occupancyRate || null,
    occupancyChange: roomStatus?.occupancyChange || null,
    occupied: roomStatus?.occupied || null,
    pending: pendingTasks.length,
  };
  
  // 构建告警
  const alerts = [];
  if (kpi.occupancy && kpi.occupancy < 40) {
    alerts.push({ level: 'warning', message: `入住率仅${kpi.occupancy}%，建议开启促销` });
  }
  if (pendingTasks.some(t => t.deadline && new Date(`${today()} ${t.deadline}`) < new Date())) {
    alerts.push({ level: 'error', message: '有逾期未完成的任务' });
  }
  
  return {
    homestayName: config.homestay?.name || '我的民宿',
    kpi: (kpi.revenue || kpi.occupancy || pendingTasks.length > 0) ? kpi : null,
    tasks: todayTasks.slice(0, 5).map(t => ({
      name: t.name,
      type: t.type,
      status: t.status,
      assignee: t.assignee,
      time: t.deadline,
    })),
    alerts,
  };
}

// ============ 任务看板数据 ============

function getTaskBoardData() {
  const tasks = loadJSON(path.join(DATA_DIR, 'tasks.json'))?.tasks || [];
  
  return {
    tasks: tasks.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      status: t.status,
      assignee: t.assignee,
      time: t.deadline || '',
    })),
  };
}

// ============ 排班数据 ============

function getScheduleData() {
  const scheduleData = loadJSON(path.join(DATA_DIR, 'schedule.json')) || {};
  const tasks = loadJSON(path.join(DATA_DIR, 'tasks.json'))?.tasks || [];
  const staffData = loadJSON(path.join(DATA_DIR, 'staff.json'));
  
  // 构建排班视图（每人的房间完成情况）
  const schedule = (scheduleData.assignments || []).map(a => {
    const rooms = (a.rooms || []).map(room => {
      const task = tasks.find(t => t.room === String(room) && t.assignee === a.staff);
      return {
        name: room,
        status: task?.status === 'done' ? 'done' : task?.status === 'in_progress' ? 'in_progress' : 'pending',
      };
    });
    return { name: a.staff, rooms };
  });
  
  // 本周统计（简化：仅统计本周的完成量）
  const weeklyStats = (staffData?.staff || [])
    .filter(s => s.role === 'cleaner')
    .map(s => {
      const completed = tasks.filter(t => t.assignee === s.name && t.status === 'done').length;
      return { name: s.name, completed };
    });
  
  return {
    date: scheduleData.date || today(),
    schedule,
    weeklyStats,
  };
}

// ============ 报表数据 ============

function getReportData() {
  const revenue = loadJSON(path.join(DATA_DIR, 'revenue.json'));
  const orders = loadJSON(path.join(DATA_DIR, 'orders.json'));
  const roomStatus = loadJSON(path.join(DATA_DIR, 'room-status.json'));
  
  if (!revenue && !orders) {
    return null; // 无数据，Widget显示空状态
  }
  
  return {
    period: '近7天',
    kpi: {
      revenue: revenue?.weekly?.total || 0,
      revenueChange: revenue?.weekly?.changePercent || null,
      occupancy: roomStatus?.weeklyOccupancy || 0,
      occupancyChange: roomStatus?.occupancyChange || null,
      adr: revenue?.weekly?.adr || 0,
      adrChange: null,
      revpar: revenue?.weekly?.revpar || 0,
      revparChange: null,
    },
    trend: revenue?.trend || null,
    channels: revenue?.channels || [],
    alerts: [],
  };
}

// ============ HTML 文件生成 ============

const WIDGET_TEMPLATES = {
  'workspace': path.join(SHARED_DIR, 'assets', 'workspace-widget.html'),
  'task-board': path.join(SHARED_DIR, '..', 'homestay-workflow', 'assets', 'task-board-widget.html'),
  'schedule': path.join(SHARED_DIR, '..', 'homestay-workflow', 'assets', 'schedule-widget.html'),
  'report': path.join(SHARED_DIR, '..', 'homestay-report', 'assets', 'report-widget.html'),
};

const OUTPUT_DIR = path.join(DATA_DIR, 'widgets');

/**
 * 将数据注入到 Widget HTML 模板中，生成可独立打开的 .html 文件
 * @param {string} widgetName - workspace | task-board | schedule | report
 * @returns {string} 生成的 .html 文件绝对路径
 */
function generateWidgetFile(widgetName) {
  const templatePath = WIDGET_TEMPLATES[widgetName];
  if (!templatePath || !fs.existsSync(templatePath)) {
    console.error(`❌ Widget模板不存在: ${widgetName}`);
    return null;
  }

  // 获取对应数据
  let data;
  switch(widgetName) {
    case 'workspace': data = getWorkspaceData(); break;
    case 'task-board': data = getTaskBoardData(); break;
    case 'schedule': data = getScheduleData(); break;
    case 'report': data = getReportData(); break;
  }

  // 读取模板
  let html = fs.readFileSync(templatePath, 'utf-8');

  // 将 window.__WIDGET_DATA__ = {} 替换为实际数据
  const dataScript = `<script>window.__WIDGET_DATA__ = ${JSON.stringify(data || {}, null, 2)};</script>`;
  
  // 在 <script> 标签前注入数据
  html = html.replace(
    '<script>',
    `${dataScript}\n<script>`,
  );

  // 输出文件
  ensureDir(OUTPUT_DIR);
  const outputPath = path.join(OUTPUT_DIR, `${widgetName}.html`);
  fs.writeFileSync(outputPath, html, 'utf-8');
  
  return outputPath;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ============ CLI ============

function main() {
  const command = process.argv[2];
  const outputMode = process.argv.includes('--json');
  
  if (!command || !['workspace', 'task-board', 'schedule', 'report'].includes(command)) {
    console.log(`
📊 民宿 Skill 套件 — Widget 数据桥接器

用法:
  node widget-data.js workspace       生成工作台面板 .html
  node widget-data.js task-board      生成任务看板 .html
  node widget-data.js schedule        生成排班面板 .html
  node widget-data.js report          生成报表面板 .html

  添加 --json 参数只输出 JSON 数据不生成文件:
  node widget-data.js workspace --json
    `);
    process.exit(0);
  }

  if (outputMode) {
    // 仅输出JSON数据
    let data;
    switch(command) {
      case 'workspace': data = getWorkspaceData(); break;
      case 'task-board': data = getTaskBoardData(); break;
      case 'schedule': data = getScheduleData(); break;
      case 'report': data = getReportData(); break;
    }
    console.log(JSON.stringify(data, null, 2));
  } else {
    // 生成 .html 文件
    const outputPath = generateWidgetFile(command);
    if (outputPath) {
      const fileUrl = 'file:///' + outputPath.replace(/\\/g, '/');
      console.log(`✅ 面板已生成：${outputPath}`);
      console.log(`💡 双击该文件即可在浏览器中打开查看，或复制下面的链接贴到浏览器地址栏：`);
      console.log(`   ${fileUrl}`);
    }
  }
}

module.exports = { 
  getWorkspaceData, getTaskBoardData, getScheduleData, getReportData,
  generateWidgetFile,
};

if (require.main === module) {
  main();
}
