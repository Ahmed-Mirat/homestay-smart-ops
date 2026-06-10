/**
 * 民宿 Skill 套件 — 任务管理器
 * 
 * 负责任务的完整生命周期：创建→派发→确认→联动
 * 是 workflow Skill 的执行引擎，连接 排班/看板/通知/sync 各模块。
 * 
 * 用法：
 *   node task-manager.js create --type clean --room 301 --assignee 小王 --deadline "10:00"
 *   node task-manager.js complete --room 301
 *   node task-manager.js complete-all --type clean
 *   node task-manager.js list [--status pending|in_progress|done]
 *   node task-manager.js from-schedule         从今日排班自动生成任务
 *   node task-manager.js from-checkout         从退房订单自动生成保洁任务
 *   node task-manager.js demo                  注入演示数据
 * 
 * 编程接口：
 *   const tm = require('./task-manager');
 *   tm.createTask({ type, room, assignee, deadline });
 *   tm.completeTask(roomOrId);
 *   tm.generateFromSchedule();
 *   tm.generateFromCheckout();
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TASKS_PATH = path.join(DATA_DIR, 'tasks.json');
const SCHEDULE_PATH = path.join(DATA_DIR, 'schedule.json');
const STAFF_PATH = path.join(DATA_DIR, 'staff.json');
const ORDERS_PATH = path.join(DATA_DIR, 'orders.json');

// ============ 工具函数 ============

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadJSON(filepath) {
  if (!fs.existsSync(filepath)) return null;
  try { return JSON.parse(fs.readFileSync(filepath, 'utf-8')); }
  catch { return null; }
}

function saveJSON(filepath, data) {
  ensureDir(path.dirname(filepath));
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ============ 任务 CRUD ============

function loadTasks() {
  const data = loadJSON(TASKS_PATH);
  return data?.tasks || [];
}

function saveTasks(tasks) {
  saveJSON(TASKS_PATH, { tasks, lastUpdated: now() });
}

/**
 * 创建任务
 */
function createTask({ type = 'clean', room, assignee, deadline, name, source }) {
  const tasks = loadTasks();
  
  const taskName = name || `${room}房 ${type === 'clean' ? '保洁' : type === 'repair' ? '维修' : type === 'checkin' ? '入住准备' : '任务'}`;
  
  const task = {
    id: generateId(),
    type,       // clean | repair | checkin | general
    name: taskName,
    room: room || null,
    assignee: assignee || null,
    status: 'pending',
    deadline: deadline || null,
    source: source || 'manual',  // manual | schedule | checkout | order | cron
    createdAt: now(),
    updatedAt: now(),
    completedAt: null,
  };
  
  tasks.push(task);
  saveTasks(tasks);
  console.log(`✅ 任务已创建: [${task.type}] ${task.name} → ${task.assignee || '未指派'}`);
  return task;
}

/**
 * 完成任务（通过房号或ID）
 */
function completeTask(roomOrId) {
  const tasks = loadTasks();
  
  const task = tasks.find(t => 
    (t.status !== 'done') && 
    (t.id === roomOrId || t.room === roomOrId || t.room === String(roomOrId))
  );
  
  if (!task) {
    console.log(`⚠️ 未找到待完成的任务: ${roomOrId}`);
    return null;
  }
  
  task.status = 'done';
  task.completedAt = now();
  task.updatedAt = now();
  saveTasks(tasks);
  
  console.log(`✅ 任务已完成: ${task.name} (${task.assignee || ''})`);
  return task;
}

/**
 * 批量完成指定类型的所有任务
 */
function completeAllByType(type) {
  const tasks = loadTasks();
  let count = 0;
  
  tasks.forEach(t => {
    if (t.type === type && t.status !== 'done') {
      t.status = 'done';
      t.completedAt = now();
      t.updatedAt = now();
      count++;
    }
  });
  
  saveTasks(tasks);
  console.log(`✅ 已完成 ${count} 个 ${type} 任务`);
  return count;
}

/**
 * 开始任务（标记为进行中）
 */
function startTask(roomOrId) {
  const tasks = loadTasks();
  const task = tasks.find(t => 
    t.status === 'pending' && 
    (t.id === roomOrId || t.room === roomOrId || t.room === String(roomOrId))
  );
  
  if (!task) return null;
  
  task.status = 'in_progress';
  task.updatedAt = now();
  saveTasks(tasks);
  return task;
}

/**
 * 列出任务
 */
function listTasks(filter = {}) {
  const tasks = loadTasks();
  let filtered = tasks;
  
  if (filter.status) filtered = filtered.filter(t => t.status === filter.status);
  if (filter.type) filtered = filtered.filter(t => t.type === filter.type);
  if (filter.date) filtered = filtered.filter(t => t.createdAt?.startsWith(filter.date));
  
  return filtered;
}

// ============ 自动生成逻辑 ============

/**
 * 从今日排班自动生成保洁任务
 */
function generateFromSchedule() {
  const scheduleData = loadJSON(SCHEDULE_PATH);
  if (!scheduleData?.assignments || scheduleData.assignments.length === 0) {
    console.log('ℹ️ 暂无排班数据，无法生成任务');
    return [];
  }
  
  const created = [];
  scheduleData.assignments.forEach(assignment => {
    const rooms = assignment.rooms || [];
    rooms.forEach(room => {
      const existing = loadTasks().find(t => 
        t.room === String(room) && t.type === 'clean' && t.createdAt?.startsWith(today())
      );
      if (!existing) {
        const task = createTask({
          type: 'clean',
          room: String(room),
          assignee: assignment.staff,
          source: 'schedule',
        });
        created.push(task);
      }
    });
  });
  
  console.log(`📋 从排班生成了 ${created.length} 个保洁任务`);
  return created;
}

/**
 * 从退房订单自动生成保洁任务
 */
function generateFromCheckout() {
  const ordersData = loadJSON(ORDERS_PATH);
  if (!ordersData?.orders) {
    console.log('ℹ️ 暂无订单数据');
    return [];
  }
  
  const todayStr = today();
  const checkoutOrders = ordersData.orders.filter(o => 
    o.checkOut === todayStr || o.checkout === todayStr
  );
  
  const created = [];
  checkoutOrders.forEach(order => {
    const room = order.roomNumber || order.room;
    if (!room) return;
    
    const existing = loadTasks().find(t => 
      t.room === String(room) && t.type === 'clean' && t.createdAt?.startsWith(todayStr)
    );
    
    if (!existing) {
      const task = createTask({
        type: 'clean',
        room: String(room),
        name: `${room}房 退房清洁`,
        source: 'checkout',
      });
      created.push(task);
    }
  });
  
  console.log(`📋 从退房订单生成了 ${created.length} 个保洁任务`);
  return created;
}

/**
 * 从新订单生成入住准备任务
 */
function generateCheckinPrep(order) {
  const task = createTask({
    type: 'checkin',
    room: order.roomNumber || order.room,
    name: `${order.guestName || '客人'} 入住准备 ${order.roomType || ''}`,
    source: 'order',
    deadline: order.checkIn || order.checkin,
  });
  return task;
}

// ============ 演示数据 ============

function injectDemoData() {
  const demoTasks = [
    { type: 'clean', room: '201', assignee: '小王', status: 'done', name: '201房 退房清洁', completedAt: `${today()} 09:30` },
    { type: 'clean', room: '202', assignee: '小李', status: 'in_progress', name: '202房 退房清洁' },
    { type: 'clean', room: '301', assignee: '小王', status: 'pending', name: '301房 退房清洁', deadline: '10:00' },
    { type: 'repair', room: '502', assignee: '师傅', status: 'in_progress', name: '502房 马桶维修' },
    { type: 'checkin', room: '303', assignee: '管家', status: 'pending', name: '张先生 入住准备 山景大床房', deadline: '14:00' },
  ].map(t => ({
    id: generateId(),
    ...t,
    source: 'demo',
    createdAt: now(),
    updatedAt: now(),
    completedAt: t.completedAt || null,
  }));
  
  saveTasks(demoTasks);
  
  // 同时注入排班演示数据
  const demoSchedule = {
    date: today(),
    assignments: [
      { staff: '小王', rooms: ['201', '301', '303'], status: 'in_progress' },
      { staff: '小李', rooms: ['202', '302'], status: 'in_progress' },
    ],
    history: []
  };
  saveJSON(SCHEDULE_PATH, demoSchedule);
  
  // 注入员工数据
  const demoStaff = {
    staff: [
      { id: 'staff-1', name: '小王', role: 'cleaner', phone: '' },
      { id: 'staff-2', name: '小李', role: 'cleaner', phone: '' },
      { id: 'staff-3', name: '师傅', role: 'maintenance', phone: '' },
      { id: 'staff-4', name: '王管家', role: 'manager', phone: '138xxxx1234' },
    ],
    roles: { cleaner: '保洁员', manager: '管家', maintenance: '维修师傅' }
  };
  saveJSON(STAFF_PATH, demoStaff);
  
  console.log('✅ 演示数据已注入（5个任务 + 排班 + 员工）');
}

// ============ CLI 入口 ============

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'create': {
      const type = args.find((a, i) => args[i-1] === '--type') || 'clean';
      const room = args.find((a, i) => args[i-1] === '--room');
      const assignee = args.find((a, i) => args[i-1] === '--assignee');
      const deadline = args.find((a, i) => args[i-1] === '--deadline');
      createTask({ type, room, assignee, deadline });
      break;
    }
    case 'complete': {
      const room = args.find((a, i) => args[i-1] === '--room') || args[1];
      completeTask(room);
      break;
    }
    case 'complete-all': {
      const type = args.find((a, i) => args[i-1] === '--type') || 'clean';
      completeAllByType(type);
      break;
    }
    case 'start': {
      const room = args.find((a, i) => args[i-1] === '--room') || args[1];
      startTask(room);
      break;
    }
    case 'list': {
      const status = args.find((a, i) => args[i-1] === '--status');
      const tasks = listTasks({ status });
      console.log(`\n📋 任务列表 ${status ? `(${status})` : '(全部)'}`);
      console.log('='.repeat(50));
      if (tasks.length === 0) {
        console.log('  暂无任务');
      } else {
        tasks.forEach(t => {
          const icon = { clean: '🧹', repair: '🔧', checkin: '📋', general: '📝' }[t.type] || '📝';
          const statusIcon = { pending: '⏳', in_progress: '🔄', done: '✅' }[t.status];
          console.log(`  ${statusIcon} ${icon} ${t.name} | ${t.assignee || '-'} | ${t.deadline || ''}`);
        });
      }
      break;
    }
    case 'from-schedule':
      generateFromSchedule();
      break;
    case 'from-checkout':
      generateFromCheckout();
      break;
    case 'demo':
      injectDemoData();
      break;
    default:
      console.log(`
📋 民宿 Skill 套件 — 任务管理器

用法:
  node task-manager.js create --type clean --room 301 --assignee 小王
  node task-manager.js complete --room 301
  node task-manager.js complete-all --type clean
  node task-manager.js list [--status pending]
  node task-manager.js from-schedule        从排班生成任务
  node task-manager.js from-checkout        从退房订单生成任务
  node task-manager.js demo                 注入演示数据
      `);
  }
}

module.exports = {
  createTask,
  completeTask,
  completeAllByType,
  startTask,
  listTasks,
  generateFromSchedule,
  generateFromCheckout,
  generateCheckinPrep,
  injectDemoData,
};

if (require.main === module) {
  main();
}
