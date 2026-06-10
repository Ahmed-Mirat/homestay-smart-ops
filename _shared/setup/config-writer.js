/**
 * 配置写入工具
 * 
 * 商户永远不直接编辑JSON文件。所有配置变更通过此工具执行。
 * Agent在对话中解析商户意图后调用对应方法。
 * 
 * 用法（供Agent/Skill调用）：
 *   const cw = require('./config-writer');
 *   cw.updateHomestay({ name: '新名字' });
 *   cw.addRoom({ type: '山景大床房', price: 528 });
 *   cw.addStaff({ name: '小王', role: 'cleaner' });
 *   cw.updateNotification('https://webhook-url...');
 */

const fs = require('fs');
const path = require('path');

const SHARED_DIR = path.join(__dirname, '..');
const CONFIG_PATH = path.join(SHARED_DIR, 'config.json');
const STAFF_PATH = path.join(SHARED_DIR, 'data', 'staff.json');
const SETUP_STATE_PATH = path.join(__dirname, 'setup-state.json');

function loadJSON(filepath) {
  if (!fs.existsSync(filepath)) return {};
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function saveJSON(filepath, data) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

// ============ Config Operations ============

function updateHomestay(fields) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.homestay) config.homestay = {};
  Object.assign(config.homestay, fields);
  saveJSON(CONFIG_PATH, config);
  return { success: true, updated: fields };
}

function addRoom(room) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.homestay) config.homestay = {};
  if (!config.homestay.rooms) config.homestay.rooms = [];
  room.id = `room-${String(config.homestay.rooms.length + 1).padStart(2, '0')}`;
  config.homestay.rooms.push(room);
  saveJSON(CONFIG_PATH, config);
  return { success: true, room };
}

function removeRoom(roomId) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.homestay?.rooms) return { success: false, error: '无房型数据' };
  config.homestay.rooms = config.homestay.rooms.filter(r => r.id !== roomId);
  saveJSON(CONFIG_PATH, config);
  return { success: true, removed: roomId };
}

function updateNotification(webhookUrl) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.notification) config.notification = {};
  if (!config.notification.wechatWork) config.notification.wechatWork = {};
  config.notification.wechatWork.webhookUrl = webhookUrl;
  config.notification.enabled = true;
  saveJSON(CONFIG_PATH, config);
  return { success: true };
}

function addCompetitor(competitor) {
  const pricingConfigPath = path.join(SHARED_DIR, '..', 'homestay-pricing', 'assets', 'pricing-config.json');
  const config = loadJSON(pricingConfigPath);
  if (!config.competitors) config.competitors = [];
  config.competitors.push(competitor);
  saveJSON(pricingConfigPath, config);
  return { success: true, competitor };
}

// ============ Staff Operations ============

function addStaff(staffMember) {
  const data = loadJSON(STAFF_PATH);
  if (!data.staff) data.staff = [];
  staffMember.id = `staff-${Date.now()}`;
  data.staff.push(staffMember);
  saveJSON(STAFF_PATH, data);
  return { success: true, staff: staffMember };
}

function removeStaff(staffId) {
  const data = loadJSON(STAFF_PATH);
  if (!data.staff) return { success: false, error: '无员工数据' };
  data.staff = data.staff.filter(s => s.id !== staffId);
  saveJSON(STAFF_PATH, data);
  return { success: true, removed: staffId };
}

function listStaff() {
  const data = loadJSON(STAFF_PATH);
  return data.staff || [];
}

// ============ Setup State ============

function updateSetupStep(step, status, data) {
  const state = loadJSON(SETUP_STATE_PATH);
  state.steps[step] = { status, data, completedAt: new Date().toISOString() };
  const allDone = Object.values(state.steps).every(s => s.status === 'done');
  if (allDone) {
    state.completed = true;
    state.completedAt = new Date().toISOString();
  }
  state.currentStep = Object.values(state.steps).filter(s => s.status === 'done').length;
  saveJSON(SETUP_STATE_PATH, state);
  return state;
}

function getSetupState() {
  return loadJSON(SETUP_STATE_PATH);
}

module.exports = {
  updateHomestay,
  addRoom,
  removeRoom,
  updateNotification,
  addCompetitor,
  addStaff,
  removeStaff,
  listStaff,
  updateSetupStep,
  getSetupState,
};
