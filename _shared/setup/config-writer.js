/**
 * 配置写入工具（多商户类型支持版）
 *
 * 商户永远不直接编辑JSON文件。所有配置变更通过此工具执行。
 * Agent在对话中解析商户意图后调用对应方法。
 *
 * 支持商户类型：'homestay' | 'apartment' | 'hotel' | 'tcm-clinic'
 *
 * 用法示例（供Agent/Skill调用）：
 *   const cw = require('./config-writer');
 *   cw.setPropertyType('homestay');
 *   cw.updateHomestay({ name: '新名字' });
 *   cw.addRoom({ type: '山景大床房', price: 528, otaName: '山景大床', inventory: 2 });
 *   cw.addUnit({ type: '一室一厅', area: '45㎡', rent: 3500 });          // 公寓
 *   cw.addHotelRoom({ type: '行政套房', stars: 5, price: 1280 });        // 酒店
 *   cw.addTreatment({ name: '推拿', dept: '推拿科', price: 188 });       // 中医馆
 *   cw.addStaffMember('cleaner', { name: '小王', phone: '13800000000' });
 *   cw.updateNotification('https://webhook-url...');
 *
 * 约定：所有写入操作均遵循"读取→合并→写入"模式，避免覆盖其他字段。
 */

const fs = require('fs');
const path = require('path');

const SHARED_DIR = path.join(__dirname, '..');
const CONFIG_PATH = path.join(SHARED_DIR, 'config.json');
const STAFF_PATH = path.join(SHARED_DIR, 'data', 'staff.json');
const SETUP_STATE_PATH = path.join(__dirname, 'setup-state.json');

const SUPPORTED_PROPERTY_TYPES = ['homestay', 'apartment', 'hotel', 'tcm-clinic'];

// ============ 通用 IO ============

function loadJSON(filepath) {
  if (!fs.existsSync(filepath)) return {};
  try {
    const raw = fs.readFileSync(filepath, 'utf-8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`无法解析 JSON 文件 ${filepath}：${err.message}`);
  }
}

function saveJSON(filepath, data) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

function touchSetupState() {
  try {
    const state = loadJSON(SETUP_STATE_PATH);
    state.lastModifiedAt = new Date().toISOString();
    saveJSON(SETUP_STATE_PATH, state);
  } catch (_) { /* 静默：state 文件可选 */ }
}

// ============ 数据验证 ============

/**
 * 验证时间格式 HH:MM（24小时制）
 * @param {string} value
 * @returns {boolean}
 */
function isValidTime(value) {
  if (typeof value !== 'string') return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

/**
 * 验证电话号码（11位手机号 或 座机 010-12345678 / 0571-12345678）
 * @param {string} value
 * @returns {boolean}
 */
function isValidPhone(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (/^1[3-9]\d{9}$/.test(v)) return true;
  if (/^0\d{2,3}-?\d{7,8}$/.test(v)) return true;
  return false;
}

/**
 * 验证金额（正数，可为字符串）
 * @param {number|string} value
 * @returns {boolean}
 */
function isValidAmount(value) {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * 必填字段校验
 * @param {object} obj
 * @param {string[]} required
 * @returns {{ok:boolean,missing:string[]}}
 */
function checkRequired(obj, required) {
  const missing = required.filter(k => obj[k] === undefined || obj[k] === null || obj[k] === '');
  return { ok: missing.length === 0, missing };
}

function fail(msg, extra = {}) {
  return Object.assign({ success: false, error: msg }, extra);
}

// ============ Property Type ============

/**
 * 设置商户类型，写入 config.json.propertyType
 * 同时同步到 setup-state.json
 * @param {'homestay'|'apartment'|'hotel'|'tcm-clinic'} type
 */
function setPropertyType(type) {
  if (!SUPPORTED_PROPERTY_TYPES.includes(type)) {
    return fail(`不支持的商户类型：${type}，仅支持 ${SUPPORTED_PROPERTY_TYPES.join('/')}`);
  }
  const config = loadJSON(CONFIG_PATH);
  config.propertyType = type;
  saveJSON(CONFIG_PATH, config);

  // 同步到 setup-state
  try {
    const state = loadJSON(SETUP_STATE_PATH);
    state.propertyType = type;
    state.lastModifiedAt = new Date().toISOString();
    saveJSON(SETUP_STATE_PATH, state);
  } catch (_) { /* 忽略 */ }

  return { success: true, propertyType: type };
}

/**
 * 读取当前商户类型
 * @returns {string|null}
 */
function getPropertyType() {
  const config = loadJSON(CONFIG_PATH);
  return config.propertyType || null;
}

// ============ 民宿 (Homestay) ============

/**
 * 更新民宿基本信息
 * @param {object} fields - 任意子字段（name/address/totalRooms 等）
 */
function updateHomestay(fields) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.homestay) config.homestay = {};
  Object.assign(config.homestay, fields);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, updated: fields };
}

/**
 * 添加民宿房型（兼容现有签名，新增可选字段）
 * @param {object} room
 * @param {string} room.type        房型名称（必填）
 * @param {string} [room.area]      面积
 * @param {string} [room.bed]       床型
 * @param {number|string} [room.price]      平日价
 * @param {number|string} [room.weekendPrice] 周末价（新增）
 * @param {string} [room.feature]   特色
 * @param {string} [room.floor]     楼层/房号
 * @param {number} [room.maxGuests] 可住人数
 * @param {string} [room.otaName]   OTA渠道显示名（新增）
 * @param {number} [room.inventory] 房间库存数量（新增）
 * @param {number} [room.minStay]   最少入住晚数（新增）
 */
function addRoom(room) {
  const check = checkRequired(room || {}, ['type']);
  if (!check.ok) return fail(`房型缺少必填字段：${check.missing.join(',')}`);
  if (room.price !== undefined && !isValidAmount(room.price)) return fail('price 必须为正数');
  if (room.weekendPrice !== undefined && !isValidAmount(room.weekendPrice)) return fail('weekendPrice 必须为正数');
  if (room.inventory !== undefined && (!Number.isInteger(Number(room.inventory)) || Number(room.inventory) < 0)) {
    return fail('inventory 必须为非负整数');
  }
  if (room.minStay !== undefined && (!Number.isInteger(Number(room.minStay)) || Number(room.minStay) < 1)) {
    return fail('minStay 必须为正整数');
  }

  const config = loadJSON(CONFIG_PATH);
  if (!config.homestay) config.homestay = {};
  if (!config.homestay.rooms) config.homestay.rooms = [];
  room.id = `room-${String(config.homestay.rooms.length + 1).padStart(2, '0')}`;
  config.homestay.rooms.push(room);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, room };
}

function removeRoom(roomId) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.homestay?.rooms) return fail('无房型数据');
  const before = config.homestay.rooms.length;
  config.homestay.rooms = config.homestay.rooms.filter(r => r.id !== roomId);
  if (config.homestay.rooms.length === before) return fail(`未找到房型 ${roomId}`);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, removed: roomId };
}

// ============ 公寓 (Apartment) ============

/**
 * 添加公寓房源（户型）
 * @param {object} unit
 * @param {string} unit.type        户型名称（必填，如"一室一厅"）
 * @param {string} [unit.area]      面积
 * @param {string} [unit.orientation] 朝向
 * @param {string|number} [unit.floor] 楼层
 * @param {number|string} unit.rent  月租金（必填）
 * @param {string} [unit.payment]   付费方式（如押一付三）
 * @param {string} [unit.decoration]精装/简装
 * @param {string[]|string} [unit.appliances] 家电清单
 */
function addUnit(unit) {
  const check = checkRequired(unit || {}, ['type', 'rent']);
  if (!check.ok) return fail(`房源缺少必填字段：${check.missing.join(',')}`);
  if (!isValidAmount(unit.rent)) return fail('rent 必须为正数');

  const config = loadJSON(CONFIG_PATH);
  if (!config.apartment) config.apartment = {};
  if (!config.apartment.units) config.apartment.units = [];
  unit.id = `unit-${String(config.apartment.units.length + 1).padStart(2, '0')}`;
  config.apartment.units.push(unit);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, unit };
}

function removeUnit(unitId) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.apartment?.units) return fail('无房源数据');
  const before = config.apartment.units.length;
  config.apartment.units = config.apartment.units.filter(u => u.id !== unitId);
  if (config.apartment.units.length === before) return fail(`未找到房源 ${unitId}`);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, removed: unitId };
}

/**
 * 更新租约规则
 * @param {object} lease
 * @param {string} [lease.minTerm]      起租期（如"6个月"）
 * @param {string} [lease.depositRatio] 押付比（如"押一付三"）
 * @param {string} [lease.penalty]      违约金条款
 * @param {string} [lease.renewal]      续租规则
 * @param {string} [lease.payDay]       交租日
 * @param {string} [lease.utilities]    水电费说明
 */
function updateLease(lease) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.apartment) config.apartment = {};
  if (!config.apartment.lease) config.apartment.lease = {};
  Object.assign(config.apartment.lease, lease || {});
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, lease: config.apartment.lease };
}

/**
 * 添加公寓设施信息
 * @param {object} facility
 * @param {string} facility.name        设施名称（必填）
 * @param {string} [facility.location]  位置
 * @param {string} [facility.hours]     开放时间
 * @param {string} [facility.description] 说明
 */
function addFacility(facility) {
  const check = checkRequired(facility || {}, ['name']);
  if (!check.ok) return fail(`设施缺少必填字段：${check.missing.join(',')}`);

  const config = loadJSON(CONFIG_PATH);
  if (!config.apartment) config.apartment = {};
  if (!config.apartment.facilities) config.apartment.facilities = [];
  facility.id = `fac-${String(config.apartment.facilities.length + 1).padStart(2, '0')}`;
  config.apartment.facilities.push(facility);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, facility };
}

// ============ 酒店 (Hotel) ============

/**
 * 添加酒店房型
 * @param {object} room
 * @param {string} room.type            房型名称（必填）
 * @param {number} [room.stars]         星级
 * @param {number|string} room.price    门市价（必填）
 * @param {number|string} [room.contractPrice] 协议价
 * @param {boolean|string} [room.breakfast] 是否含早
 * @param {string} [room.bed]           床型
 * @param {string} [room.area]          面积
 * @param {string} [room.feature]       特色
 */
function addHotelRoom(room) {
  const check = checkRequired(room || {}, ['type', 'price']);
  if (!check.ok) return fail(`酒店房型缺少必填字段：${check.missing.join(',')}`);
  if (!isValidAmount(room.price)) return fail('price 必须为正数');
  if (room.contractPrice !== undefined && !isValidAmount(room.contractPrice)) return fail('contractPrice 必须为正数');

  const config = loadJSON(CONFIG_PATH);
  if (!config.hotel) config.hotel = {};
  if (!config.hotel.rooms) config.hotel.rooms = [];
  room.id = `hroom-${String(config.hotel.rooms.length + 1).padStart(2, '0')}`;
  config.hotel.rooms.push(room);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, room };
}

function removeHotelRoom(roomId) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.hotel?.rooms) return fail('无房型数据');
  const before = config.hotel.rooms.length;
  config.hotel.rooms = config.hotel.rooms.filter(r => r.id !== roomId);
  if (config.hotel.rooms.length === before) return fail(`未找到房型 ${roomId}`);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, removed: roomId };
}

/**
 * 添加酒店增值服务
 * @param {object} service
 * @param {string} service.name         服务名称（必填，如"接机"）
 * @param {number|string} [service.price] 价格
 * @param {string} [service.hours]      时间
 * @param {string} [service.description]说明
 */
function addHotelService(service) {
  const check = checkRequired(service || {}, ['name']);
  if (!check.ok) return fail(`服务缺少必填字段：${check.missing.join(',')}`);
  if (service.price !== undefined && !isValidAmount(service.price)) return fail('price 必须为正数');

  const config = loadJSON(CONFIG_PATH);
  if (!config.hotel) config.hotel = {};
  if (!config.hotel.services) config.hotel.services = [];
  service.id = `svc-${String(config.hotel.services.length + 1).padStart(2, '0')}`;
  config.hotel.services.push(service);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, service };
}

// ============ 中医馆 (TCM Clinic) ============

/**
 * 添加诊疗项目
 * @param {object} t
 * @param {string} t.name           项目名称（必填）
 * @param {string} [t.dept]         科室
 * @param {string} [t.duration]     时长（如"60分钟"）
 * @param {number|string} t.price   单次价格（必填）
 * @param {string} [t.description]  描述
 * @param {string} [t.indication]   适应症
 * @param {string} [t.doctor]       操作医师
 */
function addTreatment(t) {
  const check = checkRequired(t || {}, ['name', 'price']);
  if (!check.ok) return fail(`诊疗项目缺少必填字段：${check.missing.join(',')}`);
  if (!isValidAmount(t.price)) return fail('price 必须为正数');

  const config = loadJSON(CONFIG_PATH);
  if (!config.tcm) config.tcm = {};
  if (!config.tcm.treatments) config.tcm.treatments = [];
  t.id = `tr-${String(config.tcm.treatments.length + 1).padStart(2, '0')}`;
  config.tcm.treatments.push(t);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, treatment: t };
}

function removeTreatment(treatmentId) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.tcm?.treatments) return fail('无诊疗项目数据');
  const before = config.tcm.treatments.length;
  config.tcm.treatments = config.tcm.treatments.filter(t => t.id !== treatmentId);
  if (config.tcm.treatments.length === before) return fail(`未找到项目 ${treatmentId}`);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, removed: treatmentId };
}

/**
 * 添加会员等级
 * @param {object} tier
 * @param {string} tier.name              等级名称（必填，如"金卡"）
 * @param {number|string} tier.threshold  充值金额（必填）
 * @param {string} [tier.discount]        折扣（如"8.5折"）
 * @param {string} [tier.gift]            赠送
 * @param {string} [tier.privileges]      专属权益
 * @param {string} [tier.validity]        有效期
 */
function addMembershipTier(tier) {
  const check = checkRequired(tier || {}, ['name', 'threshold']);
  if (!check.ok) return fail(`会员等级缺少必填字段：${check.missing.join(',')}`);
  if (!isValidAmount(tier.threshold)) return fail('threshold 必须为正数');

  const config = loadJSON(CONFIG_PATH);
  if (!config.tcm) config.tcm = {};
  if (!config.tcm.membership) config.tcm.membership = [];
  tier.id = `tier-${String(config.tcm.membership.length + 1).padStart(2, '0')}`;
  config.tcm.membership.push(tier);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, tier };
}

/**
 * 更新收费标准（一次性合并多个字段）
 * @param {object} pricing
 * @param {string} [pricing.consultation] 诊金
 * @param {string} [pricing.coursePackage] 疗程价
 * @param {string} [pricing.firstTrial]    首次体验价
 * @param {string} [pricing.memberPrice]   会员价说明
 */
function updatePricing(pricing) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.tcm) config.tcm = {};
  if (!config.tcm.pricing) config.tcm.pricing = {};
  Object.assign(config.tcm.pricing, pricing || {});
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, pricing: config.tcm.pricing };
}

// ============ 通用：紧急联系人 / 员工 ============

/**
 * 更新紧急联系人
 * @param {object} contact
 * @param {string} contact.name   姓名（必填）
 * @param {string} contact.phone  电话（必填，需通过格式校验）
 * @param {string} [contact.role] 角色
 */
function updateEmergencyContact(contact) {
  const check = checkRequired(contact || {}, ['name', 'phone']);
  if (!check.ok) return fail(`紧急联系人缺少必填字段：${check.missing.join(',')}`);
  if (!isValidPhone(contact.phone)) return fail(`电话格式不正确：${contact.phone}`);

  const config = loadJSON(CONFIG_PATH);
  if (!config.contacts) config.contacts = {};
  config.contacts.emergency = Object.assign({}, config.contacts.emergency, contact);
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
  return { success: true, emergency: config.contacts.emergency };
}

/**
 * 通用添加员工接口
 * @param {string} role  角色（cleaner/manager/doctor/receptionist...）
 * @param {object} staffData
 * @param {string} staffData.name   姓名（必填）
 * @param {string} staffData.phone  电话（必填）
 * @param {string} [staffData.title]职称/职位
 * @param {string} [staffData.shift]班次
 */
function addStaffMember(role, staffData) {
  if (!role) return fail('role 必填');
  const check = checkRequired(staffData || {}, ['name', 'phone']);
  if (!check.ok) return fail(`员工缺少必填字段：${check.missing.join(',')}`);
  if (!isValidPhone(staffData.phone)) return fail(`电话格式不正确：${staffData.phone}`);

  const data = loadJSON(STAFF_PATH);
  if (!data.staff) data.staff = [];
  const member = Object.assign({}, staffData, {
    role,
    id: `staff-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  });
  data.staff.push(member);
  saveJSON(STAFF_PATH, data);
  touchSetupState();
  return { success: true, staff: member };
}

/**
 * 删除员工（通用）
 */
function removeStaffMember(staffId) {
  const data = loadJSON(STAFF_PATH);
  if (!data.staff) return fail('无员工数据');
  const before = data.staff.length;
  data.staff = data.staff.filter(s => s.id !== staffId);
  if (data.staff.length === before) return fail(`未找到员工 ${staffId}`);
  saveJSON(STAFF_PATH, data);
  touchSetupState();
  return { success: true, removed: staffId };
}

// ============ 通知 / 竞品 / 旧版兼容 ============

function updateNotification(webhookUrl) {
  const config = loadJSON(CONFIG_PATH);
  if (!config.notification) config.notification = {};
  if (!config.notification.wechatWork) config.notification.wechatWork = {};
  config.notification.wechatWork.webhookUrl = webhookUrl;
  config.notification.enabled = true;
  saveJSON(CONFIG_PATH, config);
  touchSetupState();
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

/**
 * @deprecated 推荐使用 addStaffMember(role, data)
 */
function addStaff(staffMember) {
  const role = staffMember?.role || 'staff';
  return addStaffMember(role, staffMember);
}

/**
 * @deprecated 推荐使用 removeStaffMember(id)
 */
function removeStaff(staffId) {
  return removeStaffMember(staffId);
}

function listStaff() {
  const data = loadJSON(STAFF_PATH);
  return data.staff || [];
}

// ============ Setup State ============

function updateSetupStep(step, status, data) {
  const state = loadJSON(SETUP_STATE_PATH);
  if (!state.steps) state.steps = {};
  state.steps[step] = { status, data, completedAt: new Date().toISOString() };
  const stepValues = Object.values(state.steps);
  const allDone = stepValues.length > 0 && stepValues.every(s => (s && s.status === 'done') || s === true);
  if (allDone) {
    state.completed = true;
    state.completedAt = new Date().toISOString();
  }
  state.currentStep = stepValues.filter(s => (s && s.status === 'done') || s === true).length;
  state.lastModifiedAt = new Date().toISOString();
  saveJSON(SETUP_STATE_PATH, state);
  return state;
}

function getSetupState() {
  return loadJSON(SETUP_STATE_PATH);
}

module.exports = {
  // Property type
  setPropertyType,
  getPropertyType,
  // 民宿
  updateHomestay,
  addRoom,
  removeRoom,
  // 公寓
  addUnit,
  removeUnit,
  updateLease,
  addFacility,
  // 酒店
  addHotelRoom,
  removeHotelRoom,
  addHotelService,
  // 中医馆
  addTreatment,
  removeTreatment,
  addMembershipTier,
  updatePricing,
  // 通用
  updateEmergencyContact,
  addStaffMember,
  removeStaffMember,
  // 通知 / 竞品
  updateNotification,
  addCompetitor,
  // 兼容旧版
  addStaff,
  removeStaff,
  listStaff,
  // Setup state
  updateSetupStep,
  getSetupState,
  // 工具
  validators: { isValidTime, isValidPhone, isValidAmount, checkRequired },
};
