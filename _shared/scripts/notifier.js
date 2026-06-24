/**
 * 民宿 Skill 套件 — 企业微信群通知脚本
 * 
 * 通过企业微信群机器人 Webhook 推送通知消息。
 * 无需审核，创建群机器人获取 Webhook URL 即可使用。
 * 
 * 用法：
 *   node notifier.js test                      发送测试消息
 *   node notifier.js send --type text --msg "消息内容"
 *   node notifier.js send --type markdown --msg "**标题**\n内容"
 * 
 * 编程接口：
 *   const { notify, notifyPriceChange, notifyNewOrder, notifyAlert } = require('./notifier');
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ============ 配置 ============

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ 配置文件不存在:', CONFIG_PATH);
    return null;
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function getWebhookUrl() {
  const config = loadConfig();
  if (!config) return null;
  const url = config.notification?.wechatWork?.webhookUrl;
  if (!url) {
    console.error('❌ 未配置企业微信 Webhook URL');
    console.error('   请在 _shared/config.json → notification.wechatWork.webhookUrl 中填入');
    return null;
  }
  // 自动启用通知：当 webhookUrl 已配置但 enabled 仍为 false 时，自动设置 enabled=true
  if (config.notification && config.notification.enabled === false && url.startsWith('http')) {
    config.notification.enabled = true;
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
      console.log('✅ 通知已自动启用（检测到 Webhook URL 已配置）');
    } catch (e) {
      console.warn('⚠️ 无法自动更新配置文件:', e.message);
    }
  }
  return url;
}

// ============ 发送函数 ============

/**
 * 发送企业微信群消息
 */
async function sendWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const data = JSON.stringify(payload);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.errcode === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `errcode: ${result.errcode}, errmsg: ${result.errmsg}` });
          }
        } catch {
          resolve({ success: false, error: body });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

// ============ 通知接口 ============

/**
 * 发送文本消息
 */
async function notify(message, options = {}) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return { success: false, error: '未配置Webhook' };

  const payload = {
    msgtype: 'text',
    text: {
      content: message,
      mentioned_list: options.mentionAll ? ['@all'] : [],
    },
  };

  return sendWebhook(webhookUrl, payload);
}

/**
 * 发送 Markdown 消息
 */
async function notifyMarkdown(content) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return { success: false, error: '未配置Webhook' };

  const payload = {
    msgtype: 'markdown',
    markdown: { content },
  };

  return sendWebhook(webhookUrl, payload);
}

/**
 * 调价通知
 */
async function notifyPriceChange(details) {
  const { roomType, platform, oldPrice, newPrice, reason } = details;
  const changePercent = ((newPrice - oldPrice) / oldPrice * 100).toFixed(1);
  const arrow = newPrice > oldPrice ? '📈' : '📉';

  const content = [
    `${arrow} **调价通知**`,
    `> 房型：${roomType}`,
    `> 平台：${platform}`,
    `> 变动：¥${oldPrice} → ¥${newPrice} (${changePercent > 0 ? '+' : ''}${changePercent}%)`,
    `> 原因：${reason || '动态调价'}`,
    `> 时间：${new Date().toLocaleString('zh-CN')}`,
  ].join('\n');

  return notifyMarkdown(content);
}

/**
 * 新订单通知
 */
async function notifyNewOrder(orderInfo) {
  const { guestName, roomType, checkIn, checkOut, platform, totalPrice } = orderInfo;

  const content = [
    `🎉 **新订单**`,
    `> 客人：${guestName}`,
    `> 房型：${roomType}`,
    `> 入住：${checkIn} ~ ${checkOut}`,
    `> 金额：¥${totalPrice}`,
    `> 来源：${platform}`,
    `> 时间：${new Date().toLocaleString('zh-CN')}`,
  ].join('\n');

  return notifyMarkdown(content);
}

/**
 * 告警通知
 */
async function notifyAlert(alertInfo) {
  const { level, title, message, suggestion } = alertInfo;
  const levelIcon = level === 'critical' ? '🚨' : level === 'warning' ? '⚠️' : 'ℹ️';

  const content = [
    `${levelIcon} **${title}**`,
    `> ${message}`,
    suggestion ? `> 建议：${suggestion}` : '',
    `> 时间：${new Date().toLocaleString('zh-CN')}`,
  ].filter(Boolean).join('\n');

  return notifyMarkdown(content);
}

/**
 * 日报摘要通知
 */
async function notifyDailyReport(summary) {
  const { date, revenue, occupancyRate, newOrders, alerts } = summary;

  const content = [
    `📊 **经营日报** (${date})`,
    `> 营收：¥${revenue}`,
    `> 入住率：${occupancyRate}%`,
    `> 新订单：${newOrders}笔`,
    alerts?.length > 0 ? `> ⚠️ ${alerts.join('；')}` : `> ✅ 各项指标正常`,
  ].join('\n');

  return notifyMarkdown(content);
}

// ============ CLI 入口 ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'test': {
      console.log('📤 发送测试消息...');
      const result = await notify('🏨 民宿Skill套件通知测试 — 如果您收到此消息，说明通知配置成功！');
      console.log(result.success ? '✅ 发送成功' : `❌ 发送失败: ${result.error}`);
      break;
    }
    case 'send': {
      const typeIdx = args.indexOf('--type');
      const msgIdx = args.indexOf('--msg');
      const type = typeIdx !== -1 ? args[typeIdx + 1] : 'text';
      const msg = msgIdx !== -1 ? args[msgIdx + 1] : '';
      if (!msg) {
        console.error('用法: node notifier.js send --type text --msg "消息内容"');
        process.exit(1);
      }
      const result = type === 'markdown' ? await notifyMarkdown(msg) : await notify(msg);
      console.log(result.success ? '✅ 发送成功' : `❌ 发送失败: ${result.error}`);
      break;
    }
    default:
      console.log(`
📢 民宿 Skill 套件 — 企业微信通知

用法:
  node notifier.js test                            发送测试消息
  node notifier.js send --type text --msg "内容"   发送文本消息
  node notifier.js send --type markdown --msg "**标题**\\n内容"  发送Markdown

配置:
  在 _shared/config.json → notification.wechatWork.webhookUrl 中填入Webhook URL

如何获取Webhook URL:
  1. 在企业微信中创建群聊
  2. 群设置 → 群机器人 → 添加机器人
  3. 复制Webhook URL填入配置
      `);
      break;
  }
}

// 导出接口
module.exports = {
  notify,
  notifyMarkdown,
  notifyPriceChange,
  notifyNewOrder,
  notifyAlert,
  notifyDailyReport,
};

if (require.main === module) {
  main().catch(err => {
    console.error('❌ 执行出错:', err.message);
    process.exit(1);
  });
}
