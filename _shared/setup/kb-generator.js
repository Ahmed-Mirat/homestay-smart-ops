/**
 * 知识库自动生成器
 * 
 * 将 Setup Wizard 采集的结构化 JSON 数据转换为 knowledge-base.md
 * 生成的知识库供 homestay-guest Skill 使用（RAG问答）
 * 
 * 用法：
 *   const { generateKnowledgeBase } = require('./kb-generator');
 *   generateKnowledgeBase(setupData); // 自动写入 knowledge-base.md
 */

const fs = require('fs');
const path = require('path');

const KB_OUTPUT_PATH = path.join(__dirname, '..', '..', 'homestay-guest', 'assets', 'knowledge-base.md');

/**
 * 从引导数据生成完整的知识库 Markdown
 */
function generateKnowledgeBase(data) {
  const sections = [];

  // === 1. 房源信息 ===
  sections.push(generateRoomSection(data));

  // === 2. 入住规则 ===
  sections.push(generateRulesSection(data));

  // === 3. 周边与交通 ===
  sections.push(generateSurroundingsSection(data));

  // === 4. 政策与说明 ===
  sections.push(generatePolicySection(data));

  // === 5. 联系人 ===
  sections.push(generateContactSection(data));

  // === 6. 常见问题FAQ ===
  sections.push(generateFAQSection(data));

  // === 7. 差评回应模板 ===
  sections.push(generateReviewTemplates());

  const markdown = `# ${data.basic?.name || '民宿'} — 知识库\n\n> 本文件由安装向导自动生成，供智能客服Skill使用。\n> 更新方式：对话中告诉Agent需要修改的内容即可。\n\n---\n\n${sections.join('\n\n---\n\n')}`;

  // 确保目录存在
  const dir = path.dirname(KB_OUTPUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(KB_OUTPUT_PATH, markdown, 'utf-8');
  console.log(`✅ 知识库已生成: ${KB_OUTPUT_PATH}`);
  return KB_OUTPUT_PATH;
}

function generateRoomSection(data) {
  const rooms = data.rooms || [];
  let md = `## 一、房源信息\n\n`;
  md += `**${data.basic?.name}** 共 ${data.basic?.totalRooms || rooms.length} 间客房。\n\n`;

  if (rooms.length === 0) {
    md += `暂无房型信息。\n`;
    return md;
  }

  md += `| 房型 | 面积 | 床型 | 价格 | 特色 | 楼层/房号 | 可住人数 |\n`;
  md += `|------|------|------|------|------|----------|----------|\n`;

  rooms.forEach(room => {
    md += `| ${room.type || '-'} | ${room.area || '-'} | ${room.bed || '-'} | ¥${room.price || '-'}/晚 | ${room.feature || '-'} | ${room.floor || '-'} | ${room.maxGuests || '-'} |\n`;
  });

  md += `\n### 各房型详细介绍\n\n`;
  rooms.forEach(room => {
    md += `**${room.type}**\n`;
    md += `- 面积：${room.area || '详询管家'}\n`;
    md += `- 床型：${room.bed}\n`;
    md += `- 价格：¥${room.price}/晚（节假日可能调整）\n`;
    if (room.feature) md += `- 特色：${room.feature}\n`;
    if (room.floor) md += `- 位置：${room.floor}\n`;
    if (room.maxGuests) md += `- 最多入住：${room.maxGuests}人\n`;
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
  if (rules.wifi) md += `| WiFi | ${rules.wifi} |\n`;
  if (rules.parking) md += `| 停车 | ${rules.parking} |\n`;
  if (rules.deposit) md += `| 押金 | ${rules.deposit} |\n`;
  if (rules.pets) md += `| 宠物 | ${rules.pets} |\n`;
  if (rules.smoking) md += `| 吸烟 | ${rules.smoking} |\n`;
  if (rules.extraBed) md += `| 加床 | ${rules.extraBed} |\n`;
  if (rules.cancelPolicy) md += `| 取消政策 | ${rules.cancelPolicy} |\n`;

  return md;
}

function generateSurroundingsSection(data) {
  const surr = data.surroundings || {};
  let md = `## 三、周边与交通\n\n`;

  md += `### 如何到达\n\n`;
  if (surr.nearestStation) md += `- **高铁/火车**：${surr.nearestStation}\n`;
  if (surr.nearestAirport) md += `- **飞机**：${surr.nearestAirport}\n`;
  if (surr.selfDrive) md += `- **自驾**：${surr.selfDrive}\n`;
  md += `\n`;

  if (surr.food) {
    md += `### 周边餐饮\n\n${surr.food}\n\n`;
  }
  if (surr.attractions) {
    md += `### 周边景点/玩乐\n\n${surr.attractions}\n\n`;
  }
  if (surr.tips) {
    md += `### 温馨提醒\n\n${surr.tips}\n\n`;
  }

  return md;
}

function generatePolicySection(data) {
  const rules = data.rules || {};
  let md = `## 四、政策与说明\n\n`;

  md += `### 取消政策\n\n`;
  md += `${rules.cancelPolicy || '请联系管家确认取消政策。'}\n\n`;

  md += `### 入住须知\n\n`;
  md += `1. 入住时请出示有效身份证件\n`;
  md += `2. 请爱护房间设施，损坏需照价赔偿\n`;
  md += `3. 退房时请检查个人物品，带走垃圾\n`;
  if (rules.smoking) md += `4. 吸烟规定：${rules.smoking}\n`;
  if (rules.pets) md += `5. 宠物规定：${rules.pets}\n`;

  return md;
}

function generateContactSection(data) {
  const contacts = data.contacts || {};
  let md = `## 五、联系人\n\n`;

  if (contacts.manager) {
    md += `- **管家/负责人**：${contacts.manager.name}，电话 ${contacts.manager.phone}\n`;
  }
  md += `- 如有任何问题，请随时联系管家\n`;
  md += `- 紧急情况请直接拨打管家电话\n`;

  return md;
}

function generateFAQSection(data) {
  const rules = data.rules || {};
  const surr = data.surroundings || {};
  let md = `## 六、常见问题 FAQ\n\n`;

  const faqs = [];

  if (rules.wifi) {
    faqs.push({ q: 'WiFi密码是多少？', a: rules.wifi });
  }
  if (rules.checkinTime) {
    faqs.push({ q: '几点可以入住？', a: `${rules.checkinTime}，如需提前请联系管家确认。` });
  }
  if (rules.checkoutTime) {
    faqs.push({ q: '几点退房？', a: `${rules.checkoutTime}，如需延迟退房请提前告知。` });
  }
  if (rules.parking) {
    faqs.push({ q: '有停车位吗？', a: rules.parking });
  }
  if (surr.nearestStation) {
    faqs.push({ q: '怎么到你们那里？', a: surr.nearestStation + (surr.selfDrive ? `。自驾：${surr.selfDrive}` : '') });
  }
  if (rules.cancelPolicy) {
    faqs.push({ q: '可以取消预订吗？', a: rules.cancelPolicy });
  }
  if (rules.pets) {
    faqs.push({ q: '可以带宠物吗？', a: rules.pets });
  }
  if (surr.food) {
    faqs.push({ q: '附近有什么好吃的？', a: surr.food });
  }
  if (surr.attractions) {
    faqs.push({ q: '附近有什么好玩的？', a: surr.attractions });
  }

  // 通用FAQ
  faqs.push({ q: '有吹风机/洗衣机吗？', a: '房间配有吹风机，如需洗衣服务请联系管家。' });
  faqs.push({ q: '可以开发票吗？', a: '可以提供电子发票，请联系管家提供开票信息。' });

  faqs.forEach(faq => {
    md += `**Q：${faq.q}**\n`;
    md += `A：${faq.a}\n\n`;
  });

  return md;
}

function generateReviewTemplates() {
  let md = `## 七、差评回应参考模板\n\n`;

  md += `### 卫生类差评\n\n`;
  md += `> 尊敬的客人，非常抱歉给您带来不好的体验。我们已经加强了保洁标准和检查流程，确保每位客人入住前房间达到最佳状态。期待您给我们一次改正的机会。\n\n`;

  md += `### 设施类差评\n\n`;
  md += `> 感谢您的反馈，对于设施问题给您造成的不便深表歉意。我们已安排维修并升级了相关设施，后续会加强定期检查。欢迎您再次体验。\n\n`;

  md += `### 服务类差评\n\n`;
  md += `> 非常抱歉未能提供满意的服务体验。我们已针对您提到的问题进行了团队培训和流程优化。感谢您帮助我们变得更好，期待有机会重新为您服务。\n\n`;

  md += `### 噪音/位置类差评\n\n`;
  md += `> 感谢您的入住，对于[噪音/交通]问题给您造成的困扰十分抱歉。我们已[采取措施描述]。如果您下次入住，我们可以为您安排更安静的房间。\n\n`;

  return md;
}

module.exports = { generateKnowledgeBase };

if (require.main === module) {
  // 测试用：使用示例数据生成
  const testData = {
    basic: { name: '测试民宿', address: '杭州市西湖区xxx路', totalRooms: 5 },
    rooms: [
      { type: '山景大床房', area: '28㎡', bed: '1.8米大床', price: '528', feature: '独立阳台看日出', floor: '2楼201', maxGuests: '2' },
      { type: '湖景套房', area: '45㎡', bed: '1.8米大床+沙发床', price: '888', feature: '落地窗湖景', floor: '3楼301', maxGuests: '3' }
    ],
    rules: { checkinTime: '14:00后', checkoutTime: '12:00前', wifi: '名称MountainView 密码88888888', parking: '免费停车位3个', cancelPolicy: '入住前1天18:00前免费取消', deposit: '200元', pets: '不可以', smoking: '室内禁烟，阳台可以' },
    surroundings: { nearestStation: '杭州东站，打车40分钟约80元', selfDrive: '导航搜民宿名即可，最后2公里山路慢行', food: '步行5分钟有农家乐，推荐土鸡煲', attractions: '步行10分钟到溪边戏水', tips: '山区蚊虫多建议带驱蚊水' },
    contacts: { manager: { name: '王管家', phone: '138xxxx1234' } }
  };

  generateKnowledgeBase(testData);
  console.log('✅ 测试知识库生成完成');
}
