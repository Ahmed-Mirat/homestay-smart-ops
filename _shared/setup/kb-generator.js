/**
 * 知识库自动生成器（多商户类型支持版）
 *
 * 将 Setup Wizard 采集的结构化 JSON 数据转换为 knowledge-base.md
 * 生成的知识库供对应商户 Skill 使用（RAG问答）。
 *
 * 支持商户类型：'homestay' | 'apartment' | 'hotel' | 'tcm-clinic'
 *
 * 用法：
 *   const { generateKnowledgeBase } = require('./kb-generator');
 *
 *   // 1) 显式指定 propertyType
 *   generateKnowledgeBase(data, 'apartment');
 *
 *   // 2) 不传时，自动从 config.json.propertyType 读取
 *   //    若仍读取不到，默认按 'homestay' 处理（向后兼容）
 *   generateKnowledgeBase(data);
 */

const fs = require('fs');
const path = require('path');

const SHARED_DIR = path.join(__dirname, '..');
const CONFIG_PATH = path.join(SHARED_DIR, 'config.json');

// 各类型默认输出位置（可在调用时通过第三个参数 outputPath 覆盖）
const KB_OUTPUT_MAP = {
  'homestay': path.join(__dirname, '..', '..', 'homestay-guest', 'assets', 'knowledge-base.md'),
  'apartment': path.join(__dirname, '..', '..', 'apartment-guest', 'assets', 'knowledge-base.md'),
  'hotel': path.join(__dirname, '..', '..', 'hotel-guest', 'assets', 'knowledge-base.md'),
  'tcm-clinic': path.join(__dirname, '..', '..', 'tcm-reception', 'assets', 'knowledge-base.md'),
};

function loadJSONSafe(filepath) {
  if (!fs.existsSync(filepath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch (_) {
    return {};
  }
}

function detectPropertyType(explicitType) {
  if (explicitType) return explicitType;
  const config = loadJSONSafe(CONFIG_PATH);
  return config.propertyType || 'homestay';
}

function writeMarkdown(filepath, markdown) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, markdown, 'utf-8');
}

/**
 * 主入口
 * @param {object} data            Setup Wizard 采集的结构化数据
 * @param {string} [propertyType]  商户类型；不传则从 config.json 自动读取，再缺省为 'homestay'
 * @param {string} [outputPath]    输出文件路径；不传则使用默认映射
 * @returns {string}               生成的文件路径
 */
function generateKnowledgeBase(data, propertyType, outputPath) {
  const type = detectPropertyType(propertyType);
  const target = outputPath || KB_OUTPUT_MAP[type] || KB_OUTPUT_MAP.homestay;

  let markdown;
  switch (type) {
    case 'apartment':
      markdown = renderApartmentKB(data);
      break;
    case 'hotel':
      markdown = renderHotelKB(data);
      break;
    case 'tcm-clinic':
      markdown = renderTcmKB(data);
      break;
    case 'homestay':
    default:
      markdown = renderHomestayKB(data);
      break;
  }

  writeMarkdown(target, markdown);
  console.log(`✅ 知识库已生成 [${type}]: ${target}`);
  return target;
}

// =========================================================
// 民宿（保持原有结构 + 新增字段）
// =========================================================

function renderHomestayKB(data) {
  const sections = [];
  sections.push(generateRoomSection(data));
  sections.push(generateRulesSection(data));
  sections.push(generateSurroundingsSection(data));
  sections.push(generateSafetySection(data));
  sections.push(generateFAQSection(data));
  sections.push(generateContactSection(data));
  sections.push(generateReviewTemplates());

  return `# ${data.basic?.name || '民宿'} — 客服知识库\n\n> 本文件由安装向导自动生成，供智能客服Skill使用。\n> 更新方式：对话中告诉Agent需要修改的内容即可。\n\n---\n\n${sections.join('\n\n---\n\n')}`;
}

function generateRoomSection(data) {
  const rooms = data.rooms || [];
  let md = `## 一、房源介绍\n\n`;
  md += `**${data.basic?.name || ''}** 共 ${data.basic?.totalRooms || rooms.length} 间客房。\n\n`;

  if (rooms.length === 0) {
    md += `暂无房型信息。\n`;
    return md;
  }

  md += `| 房型 | 面积 | 床型 | 平日价 | 周末价 | 特色 | 楼层/房号 | 可住人数 |\n`;
  md += `|------|------|------|--------|--------|------|----------|----------|\n`;
  rooms.forEach(room => {
    md += `| ${room.type || '-'} | ${room.area || '-'} | ${room.bed || '-'} | ¥${room.price || '-'}/晚 | ${room.weekendPrice ? '¥' + room.weekendPrice + '/晚' : '-'} | ${room.feature || '-'} | ${room.floor || '-'} | ${room.maxGuests || '-'} |\n`;
  });

  md += `\n### 各房型详细介绍\n\n`;
  rooms.forEach(room => {
    md += `**${room.type}**\n`;
    md += `- 面积：${room.area || '详询管家'}\n`;
    md += `- 床型：${room.bed || '-'}\n`;
    md += `- 平日价：¥${room.price || '-'}/晚\n`;
    if (room.weekendPrice) md += `- 周末价：¥${room.weekendPrice}/晚\n`;
    if (room.feature) md += `- 特色：${room.feature}\n`;
    if (room.floor) md += `- 位置：${room.floor}\n`;
    if (room.maxGuests) md += `- 最多入住：${room.maxGuests}人\n`;
    if (room.minStay) md += `- 最少入住：${room.minStay}晚\n`;
    if (room.otaName) md += `- OTA渠道名：${room.otaName}\n`;
    if (room.inventory !== undefined) md += `- 库存：${room.inventory}间\n`;
    md += `\n`;
  });

  return md;
}

function generateRulesSection(data) {
  const rules = data.rules || {};
  let md = `## 二、入住规则\n\n`;
  md += `| 项目 | 说明 |\n`;
  md += `|------|------|\n`;
  if (rules.checkinTime) md += `| 入住时间 | ${rules.checkinTime} |\n`;
  if (rules.checkoutTime) md += `| 退房时间 | ${rules.checkoutTime} |\n`;
  if (rules.cancelPolicy) md += `| 取消政策 | ${rules.cancelPolicy} |\n`;
  if (rules.deposit) md += `| 押金 | ${rules.deposit} |\n`;
  if (rules.wifi) md += `| WiFi | ${rules.wifi} |\n`;
  if (rules.parking) md += `| 停车 | ${rules.parking} |\n`;
  if (rules.pets) md += `| 宠物 | ${rules.pets} |\n`;
  if (rules.smoking) md += `| 吸烟 | ${rules.smoking} |\n`;
  if (rules.extraBed) md += `| 加床 | ${rules.extraBed} |\n`;
  return md;
}

function generateSurroundingsSection(data) {
  const surr = data.surroundings || {};
  let md = `## 三、周边信息\n\n`;
  md += `### 交通方式\n\n`;
  if (surr.nearestStation) md += `- **高铁/火车**：${surr.nearestStation}\n`;
  if (surr.nearestAirport) md += `- **飞机**：${surr.nearestAirport}\n`;
  if (surr.selfDrive) md += `- **自驾**：${surr.selfDrive}\n`;
  md += `\n`;
  if (surr.food) md += `### 餐饮推荐\n\n${surr.food}\n\n`;
  if (surr.attractions) md += `### 周边景点\n\n${surr.attractions}\n\n`;
  if (surr.tips) md += `### 注意事项\n\n${surr.tips}\n\n`;
  return md;
}

function generateSafetySection(data) {
  const safety = data.safety || {};
  const contacts = data.contacts || {};
  let md = `## 四、安全与紧急信息\n\n`;
  if (safety.tips) md += `- **安全提醒**：${safety.tips}\n`;
  if (safety.nearestHospital) md += `- **最近医院**：${safety.nearestHospital}\n`;
  md += `- **紧急电话**：火警119 / 报警110 / 急救120\n`;
  if (contacts.emergency?.phone) {
    md += `- **馆内紧急联系**：${contacts.emergency.name || '值班'} ${contacts.emergency.phone}\n`;
  }
  return md;
}

function generateContactSection(data) {
  const contacts = data.contacts || {};
  let md = `## 六、联系方式\n\n`;
  if (contacts.manager) {
    md += `- **管家/负责人**：${contacts.manager.name}，电话 ${contacts.manager.phone}\n`;
  }
  if (contacts.emergency) {
    md += `- **紧急电话**：${contacts.emergency.name || '值班'} ${contacts.emergency.phone}\n`;
  }
  if (contacts.maintenance) {
    md += `- **维修**：${contacts.maintenance.name || '维修师傅'} ${contacts.maintenance.phone}\n`;
  }
  return md;
}

function generateFAQSection(data) {
  const rules = data.rules || {};
  const surr = data.surroundings || {};
  let md = `## 五、常见问题 FAQ\n\n`;
  const faqs = [];
  if (rules.wifi) faqs.push({ q: 'WiFi密码是多少？', a: rules.wifi });
  if (rules.checkinTime) faqs.push({ q: '几点可以入住？', a: `${rules.checkinTime}，如需提前请联系管家确认。` });
  if (rules.checkoutTime) faqs.push({ q: '几点退房？', a: `${rules.checkoutTime}，如需延迟退房请提前告知。` });
  if (rules.parking) faqs.push({ q: '有停车位吗？', a: rules.parking });
  if (surr.nearestStation) faqs.push({ q: '怎么到你们那里？', a: surr.nearestStation + (surr.selfDrive ? `。自驾：${surr.selfDrive}` : '') });
  if (rules.cancelPolicy) faqs.push({ q: '可以取消预订吗？', a: rules.cancelPolicy });
  if (rules.pets) faqs.push({ q: '可以带宠物吗？', a: rules.pets });
  if (surr.food) faqs.push({ q: '附近有什么好吃的？', a: surr.food });
  if (surr.attractions) faqs.push({ q: '附近有什么好玩的？', a: surr.attractions });
  faqs.push({ q: '有吹风机/洗衣机吗？', a: '房间配有吹风机，如需洗衣服务请联系管家。' });
  faqs.push({ q: '可以开发票吗？', a: '可以提供电子发票，请联系管家提供开票信息。' });

  faqs.forEach(faq => {
    md += `**Q：${faq.q}**\nA：${faq.a}\n\n`;
  });
  return md;
}

function generateReviewTemplates() {
  let md = `## 七、差评回应参考模板\n\n`;
  md += `### 卫生类差评\n\n> 尊敬的客人，非常抱歉给您带来不好的体验。我们已经加强了保洁标准和检查流程，确保每位客人入住前房间达到最佳状态。期待您给我们一次改正的机会。\n\n`;
  md += `### 设施类差评\n\n> 感谢您的反馈，对于设施问题给您造成的不便深表歉意。我们已安排维修并升级了相关设施，后续会加强定期检查。欢迎您再次体验。\n\n`;
  md += `### 服务类差评\n\n> 非常抱歉未能提供满意的服务体验。我们已针对您提到的问题进行了团队培训和流程优化。感谢您帮助我们变得更好，期待有机会重新为您服务。\n\n`;
  md += `### 噪音/位置类差评\n\n> 感谢您的入住，对于[噪音/交通]问题给您造成的困扰十分抱歉。我们已[采取措施描述]。如果您下次入住，我们可以为您安排更安静的房间。\n\n`;
  return md;
}

// =========================================================
// 公寓
// =========================================================

function renderApartmentKB(data) {
  const name = data.basic?.name || '公寓';
  const sections = [];
  sections.push(renderApartmentUnits(data));
  sections.push(renderApartmentLease(data));
  sections.push(renderApartmentFacilities(data));
  sections.push(renderApartmentNotice(data));
  sections.push(renderApartmentContacts(data));

  return `# ${name} — 租客服务知识库\n\n> 本文件由安装向导自动生成，供租客客服Skill使用。\n\n---\n\n${sections.join('\n\n---\n\n')}`;
}

function renderApartmentUnits(data) {
  const units = data.units || data.apartment?.units || [];
  let md = `## 一、房源信息\n\n`;
  if (units.length === 0) {
    md += `暂无房源信息。\n`;
    return md;
  }
  md += `| 户型 | 面积 | 朝向 | 楼层 | 月租金 | 付款方式 | 装修 |\n`;
  md += `|------|------|------|------|--------|----------|------|\n`;
  units.forEach(u => {
    md += `| ${u.type || '-'} | ${u.area || '-'} | ${u.orientation || '-'} | ${u.floor || '-'} | ¥${u.rent || '-'}/月 | ${u.payment || '-'} | ${u.decoration || '-'} |\n`;
  });
  md += `\n### 各户型详细介绍\n\n`;
  units.forEach(u => {
    md += `**${u.type}**\n`;
    if (u.area) md += `- 面积：${u.area}\n`;
    if (u.orientation) md += `- 朝向：${u.orientation}\n`;
    if (u.floor) md += `- 楼层：${u.floor}\n`;
    md += `- 月租金：¥${u.rent}/月\n`;
    if (u.payment) md += `- 付款方式：${u.payment}\n`;
    if (u.decoration) md += `- 装修：${u.decoration}\n`;
    if (u.appliances) {
      const list = Array.isArray(u.appliances) ? u.appliances.join('、') : u.appliances;
      md += `- 家电：${list}\n`;
    }
    md += `\n`;
  });
  return md;
}

function renderApartmentLease(data) {
  const lease = data.lease || data.apartment?.lease || {};
  let md = `## 二、租约条款\n\n`;
  md += `| 项目 | 说明 |\n|------|------|\n`;
  if (lease.minTerm) md += `| 起租期 | ${lease.minTerm} |\n`;
  if (lease.depositRatio) md += `| 押付比 | ${lease.depositRatio} |\n`;
  if (lease.penalty) md += `| 违约金 | ${lease.penalty} |\n`;
  if (lease.renewal) md += `| 续租 | ${lease.renewal} |\n`;
  if (lease.payDay) md += `| 交租日 | ${lease.payDay} |\n`;
  if (lease.utilities) md += `| 水电费 | ${lease.utilities} |\n`;
  return md;
}

function renderApartmentFacilities(data) {
  const fac = data.facilities || data.apartment?.facilities || [];
  const services = data.services || {};
  let md = `## 三、设施与服务\n\n`;
  if (fac.length > 0) {
    md += `### 公共区域\n\n`;
    fac.forEach(f => {
      md += `- **${f.name}**${f.location ? '（' + f.location + '）' : ''}${f.hours ? '，开放时间：' + f.hours : ''}${f.description ? '。' + f.description : ''}\n`;
    });
    md += `\n`;
  }
  if (services.parking) md += `- 停车：${services.parking}\n`;
  if (services.security) md += `- 安保：${services.security}\n`;
  if (services.network) md += `- 网络：${services.network}\n`;
  if (services.property) md += `- 物业服务：${services.property}\n`;
  return md;
}

function renderApartmentNotice(data) {
  const notice = data.notice || {};
  let md = `## 四、住户须知\n\n`;
  if (notice.rules) md += `### 公约\n\n${notice.rules}\n\n`;
  if (notice.repair) md += `### 报修流程\n\n${notice.repair}\n\n`;
  if (!notice.rules && !notice.repair) {
    md += `1. 请遵守小区公约，不影响他人生活\n2. 设施损坏请及时报修\n3. 退租前请配合物业验房\n`;
  }
  return md;
}

function renderApartmentContacts(data) {
  const c = data.contacts || {};
  let md = `## 五、联系方式\n\n`;
  if (c.manager) md += `- **管家**：${c.manager.name} ${c.manager.phone}\n`;
  if (c.frontDesk) md += `- **物业前台**：${c.frontDesk.name || '前台'} ${c.frontDesk.phone}\n`;
  if (c.maintenance) md += `- **维修**：${c.maintenance.name || '维修师傅'} ${c.maintenance.phone}\n`;
  if (c.emergency) md += `- **紧急电话**：${c.emergency.name || '值班'} ${c.emergency.phone}\n`;
  return md;
}

// =========================================================
// 酒店
// =========================================================

function renderHotelKB(data) {
  const name = data.basic?.name || '酒店';
  const sections = [];
  sections.push(renderHotelRooms(data));
  sections.push(renderHotelRules(data));
  sections.push(renderHotelServices(data));
  sections.push(renderHotelMeeting(data));
  sections.push(renderHotelContacts(data));

  return `# ${name} — 服务指南知识库\n\n> 本文件由安装向导自动生成，供酒店前台/客服Skill使用。\n\n---\n\n${sections.join('\n\n---\n\n')}`;
}

function renderHotelRooms(data) {
  const rooms = data.rooms || data.hotel?.rooms || [];
  let md = `## 一、房型介绍\n\n`;
  if (rooms.length === 0) {
    md += `暂无房型信息。\n`;
    return md;
  }
  md += `| 房型 | 档次 | 门市价 | 协议价 | 含早 | 床型 | 特色 |\n`;
  md += `|------|------|--------|--------|------|------|------|\n`;
  rooms.forEach(r => {
    md += `| ${r.type || '-'} | ${r.stars ? r.stars + '星' : '-'} | ¥${r.price || '-'} | ${r.contractPrice ? '¥' + r.contractPrice : '-'} | ${formatBreakfast(r.breakfast)} | ${r.bed || '-'} | ${r.feature || '-'} |\n`;
  });
  md += `\n### 各房型详细介绍\n\n`;
  rooms.forEach(r => {
    md += `**${r.type}**\n`;
    if (r.stars) md += `- 档次：${r.stars}星\n`;
    md += `- 门市价：¥${r.price}/晚\n`;
    if (r.contractPrice) md += `- 协议价：¥${r.contractPrice}/晚\n`;
    md += `- 含早：${formatBreakfast(r.breakfast)}\n`;
    if (r.bed) md += `- 床型：${r.bed}\n`;
    if (r.area) md += `- 面积：${r.area}\n`;
    if (r.feature) md += `- 特色：${r.feature}\n`;
    md += `\n`;
  });
  return md;
}

function formatBreakfast(b) {
  if (b === true || b === '是' || b === 'yes') return '含';
  if (b === false || b === '否' || b === 'no') return '不含';
  return b || '-';
}

function renderHotelRules(data) {
  const rules = data.rules || {};
  let md = `## 二、入离规则\n\n`;
  md += `| 项目 | 说明 |\n|------|------|\n`;
  if (rules.checkinTime) md += `| 入住时间 | ${rules.checkinTime} |\n`;
  if (rules.checkoutTime) md += `| 退房时间 | ${rules.checkoutTime} |\n`;
  if (rules.lateCheckout) md += `| 延迟退房 | ${rules.lateCheckout} |\n`;
  if (rules.luggage) md += `| 行李寄存 | ${rules.luggage} |\n`;
  if (rules.cancelPolicy) md += `| 取消政策 | ${rules.cancelPolicy} |\n`;
  if (rules.deposit) md += `| 押金 | ${rules.deposit} |\n`;
  return md;
}

function renderHotelServices(data) {
  const services = data.services || data.hotel?.services || [];
  let md = `## 三、酒店服务\n\n`;
  if (Array.isArray(services) && services.length > 0) {
    services.forEach(s => {
      md += `- **${s.name}**${s.price ? '：¥' + s.price : ''}${s.hours ? '，' + s.hours : ''}${s.description ? '。' + s.description : ''}\n`;
    });
  } else if (typeof services === 'object') {
    if (services.airport) md += `- 接机：${services.airport}\n`;
    if (services.laundry) md += `- 洗衣：${services.laundry}\n`;
    if (services.wakeup) md += `- 叫醒：${services.wakeup}\n`;
    if (services.roomService) md += `- 送餐：${services.roomService}\n`;
    if (services.business) md += `- 商务中心：${services.business}\n`;
    if (services.gym) md += `- 健身/泳池：${services.gym}\n`;
    if (services.restaurant) md += `- 餐厅：${services.restaurant}\n`;
  } else {
    md += `暂无服务信息。\n`;
  }
  return md;
}

function renderHotelMeeting(data) {
  const meeting = data.meeting || {};
  let md = `## 四、会议设施\n\n`;
  if (meeting.rooms) md += `${meeting.rooms}\n`;
  else md += `如需会议室预订请联系前台。\n`;
  return md;
}

function renderHotelContacts(data) {
  const c = data.contacts || {};
  let md = `## 五、联系方式\n\n`;
  if (c.frontDesk) md += `- **前台总机**：${c.frontDesk.phone}\n`;
  if (c.departments) {
    Object.entries(c.departments).forEach(([k, v]) => {
      md += `- **${k}**：${v}\n`;
    });
  }
  if (c.manager) md += `- **值班经理**：${c.manager.name} ${c.manager.phone}\n`;
  if (c.security) md += `- **安保**：${c.security.phone}\n`;
  if (c.emergency) md += `- **紧急电话**：${c.emergency.name || '值班'} ${c.emergency.phone}\n`;
  return md;
}

// =========================================================
// 中医馆
// =========================================================

function renderTcmKB(data) {
  const name = data.basic?.name || '中医馆';
  const sections = [];
  sections.push(renderTcmTreatments(data));
  sections.push(renderTcmPricing(data));
  sections.push(renderTcmMembership(data));
  sections.push(renderTcmBooking(data));
  sections.push(renderTcmDoctors(data));
  sections.push(renderTcmContacts(data));

  return `# ${name} — 诊疗服务知识库\n\n> 本文件由安装向导自动生成，供中医馆前台/会员客服Skill使用。\n\n---\n\n${sections.join('\n\n---\n\n')}`;
}

function renderTcmTreatments(data) {
  const list = data.treatments || data.tcm?.treatments || [];
  let md = `## 一、诊疗项目\n\n`;
  if (list.length === 0) {
    md += `暂无诊疗项目信息。\n`;
    return md;
  }
  md += `| 项目 | 科室 | 时长 | 单价 | 适应症 | 操作医师 |\n`;
  md += `|------|------|------|------|--------|----------|\n`;
  list.forEach(t => {
    md += `| ${t.name || '-'} | ${t.dept || '-'} | ${t.duration || '-'} | ¥${t.price || '-'} | ${t.indication || '-'} | ${t.doctor || '-'} |\n`;
  });
  md += `\n### 项目详情\n\n`;
  list.forEach(t => {
    md += `**${t.name}**\n`;
    if (t.dept) md += `- 科室：${t.dept}\n`;
    if (t.duration) md += `- 时长：${t.duration}\n`;
    md += `- 单价：¥${t.price}\n`;
    if (t.description) md += `- 描述：${t.description}\n`;
    if (t.indication) md += `- 适应症：${t.indication}\n`;
    if (t.doctor) md += `- 操作医师：${t.doctor}\n`;
    md += `\n`;
  });
  return md;
}

function renderTcmPricing(data) {
  const p = data.pricing || data.tcm?.pricing || {};
  let md = `## 二、收费标准\n\n`;
  md += `| 项目 | 说明 |\n|------|------|\n`;
  if (p.consultation) md += `| 诊金 | ${p.consultation} |\n`;
  if (p.singleSession) md += `| 单次价 | ${p.singleSession} |\n`;
  if (p.coursePackage) md += `| 疗程价 | ${p.coursePackage} |\n`;
  if (p.memberPrice) md += `| 会员价 | ${p.memberPrice} |\n`;
  if (p.firstTrial) md += `| 首次体验价 | ${p.firstTrial} |\n`;
  return md;
}

function renderTcmMembership(data) {
  const tiers = data.membership || data.tcm?.membership || [];
  let md = `## 三、会员权益\n\n`;
  if (tiers.length === 0) {
    md += `暂无会员等级信息。\n`;
    return md;
  }
  tiers.forEach(t => {
    md += `### ${t.name}\n`;
    md += `- 充值金额：¥${t.threshold}\n`;
    if (t.discount) md += `- 折扣：${t.discount}\n`;
    if (t.gift) md += `- 赠送：${t.gift}\n`;
    if (t.privileges) md += `- 专属权益：${t.privileges}\n`;
    if (t.validity) md += `- 有效期：${t.validity}\n`;
    md += `\n`;
  });
  return md;
}

function renderTcmBooking(data) {
  const b = data.booking || {};
  let md = `## 四、预约流程\n\n`;
  if (b.phone) md += `### 电话预约\n\n${b.phone}\n\n`;
  if (b.wechat) md += `### 微信预约\n\n${b.wechat}\n\n`;
  if (!b.phone && !b.wechat) {
    md += `请通过馆内电话或微信公众号预约，提前1天预约可优先安排时段。\n`;
  }
  return md;
}

function renderTcmDoctors(data) {
  const doctors = data.doctors || [];
  let md = `## 五、坐诊医师\n\n`;
  if (doctors.length === 0) {
    md += `暂无医师信息。\n`;
    return md;
  }
  doctors.forEach(d => {
    md += `**${d.name}**${d.title ? '（' + d.title + '）' : ''}\n`;
    if (d.specialty) md += `- 擅长：${d.specialty}\n`;
    if (d.schedule) md += `- 坐诊时间：${d.schedule}\n`;
    md += `\n`;
  });
  return md;
}

function renderTcmContacts(data) {
  const c = data.contacts || {};
  let md = `## 六、联系方式\n\n`;
  if (c.booking) md += `- **预约电话**：${c.booking.phone}\n`;
  if (c.wechat) md += `- **微信号**：${c.wechat}\n`;
  if (c.memberAdvisor) md += `- **会员顾问**：${c.memberAdvisor.name} ${c.memberAdvisor.phone}\n`;
  if (c.director) md += `- **馆长**：${c.director.name} ${c.director.phone}\n`;
  if (c.emergency) md += `- **紧急电话**：${c.emergency.name || '值班'} ${c.emergency.phone}\n`;
  return md;
}

module.exports = {
  generateKnowledgeBase,
  // 子模板（便于单独测试或外部组合）
  renderHomestayKB,
  renderApartmentKB,
  renderHotelKB,
  renderTcmKB,
};

if (require.main === module) {
  // 测试用：使用示例数据生成（默认 homestay）
  const testData = {
    basic: { name: '测试民宿', address: '杭州市西湖区xxx路', totalRooms: 5 },
    rooms: [
      { type: '山景大床房', area: '28㎡', bed: '1.8米大床', price: '528', weekendPrice: '688', feature: '独立阳台看日出', floor: '2楼201', maxGuests: '2', otaName: '山景大床', inventory: 2, minStay: 1 },
      { type: '湖景套房', area: '45㎡', bed: '1.8米大床+沙发床', price: '888', weekendPrice: '1088', feature: '落地窗湖景', floor: '3楼301', maxGuests: '3' }
    ],
    rules: { checkinTime: '14:00后', checkoutTime: '12:00前', wifi: '名称MountainView 密码88888888', parking: '免费停车位3个', cancelPolicy: '入住前1天18:00前免费取消', deposit: '200元', pets: '不可以', smoking: '室内禁烟，阳台可以' },
    surroundings: { nearestStation: '杭州东站，打车40分钟约80元', selfDrive: '导航搜民宿名即可，最后2公里山路慢行', food: '步行5分钟有农家乐', attractions: '步行10分钟到溪边戏水', tips: '山区蚊虫多建议带驱蚊水' },
    safety: { tips: '请勿在房间内使用大功率电器', nearestHospital: '镇医院车程10分钟' },
    contacts: { manager: { name: '王管家', phone: '13800001234' }, emergency: { name: '值班', phone: '13800001235' } }
  };

  generateKnowledgeBase(testData, 'homestay');
  console.log('✅ 测试知识库生成完成');
}
