#!/usr/bin/env node
/**
 * 中医馆进销存管理 - 核心脚本
 * 用法:
 *   node inventory.js add <product-json>       新增产品
 *   node inventory.js stockIn <product-id> <qty> <batch> <prodDate> <expiryMonths>  入库
 *   node inventory.js deduct <product-id> <qty> [orderId] 出库扣减
 *   node inventory.js list [category]          产品列表
 *   node inventory.js check                    库存/效期检查
 *   node inventory.js low-stock                低库存查询
 *   node inventory.js expiring [days]          临期查询(默认30天)
 */

const fs = require('fs');
const path = require('path');

// ── 通知模块（优雅降级） ──
let notifyAlert = null;
try {
  const notifier = require('../../_shared/scripts/notifier');
  notifyAlert = notifier.notifyAlert || notifier.default?.notifyAlert || null;
} catch (e) {
  // 静默降级，不输出错误信息
}

const DATA_FILE = path.join(__dirname, '..', '..', '_shared', 'data', 'inventory.json');
const DEFAULT_MIN_STOCK = 10;
const DEFAULT_EXPIRY_WARN_DAYS = 30;

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return { products: [], transactions: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    console.error(`⚠️ 数据文件解析失败: ${e.message}`);
    return { products: [], transactions: [] };
  }
}

function save(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function nextId(data) {
  const max = data.products.reduce((m, p) => Math.max(m, parseInt((p.id || 'inv-000').split('-')[1]) || 0), 0);
  return `inv-${String(max + 1).padStart(3, '0')}`;
}

function calcExpiry(productionDate, expiryMonths) {
  const [year, month, day] = productionDate.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setMonth(d.getMonth() + parseInt(expiryMonths));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// ── 产品查找（唯一性校验） ──

function findProduct(data, productId) {
  // 优先精确匹配 id
  const byId = data.products.find(p => p.id === productId);
  if (byId) return byId;
  // 按名称匹配
  const byName = data.products.filter(p => p.name === productId);
  if (byName.length > 1) {
    throw new Error(`存在${byName.length}个同名产品"${productId}"，请使用产品ID进行操作`);
  }
  return byName[0] || null;
}

// ── Commands ──

function add(data, productJson) {
  let p;
  try {
    p = typeof productJson === 'string' ? JSON.parse(productJson) : productJson;
  } catch (e) {
    throw new Error(`产品JSON格式错误: ${e.message}`);
  }
  if (!p.name || !String(p.name).trim()) throw new Error('产品名称(name)为必填项');
  if (!p.category || !String(p.category).trim()) throw new Error('产品分类(category)为必填项');
  const product = {
    id: nextId(data),
    name: p.name,
    category: p.category,
    purchasePrice: parseFloat(p.purchasePrice) || 0,
    sellPrice: parseFloat(p.sellPrice) || 0,
    stock: parseInt(p.stock) || 0,
    unit: p.unit || '个',
    productionDate: p.productionDate || null,
    expiryMonths: parseInt(p.expiryMonths) || null,
    expiryDate: (p.productionDate && p.expiryMonths) ? calcExpiry(p.productionDate, p.expiryMonths) : null,
    minStock: parseInt(p.minStock) || DEFAULT_MIN_STOCK,
    updatedAt: new Date().toISOString()
  };
  data.products.push(product);
  save(data);
  console.log(`✅ 产品已添加: ${product.name} (${product.id})`);
  return product;
}

function stockIn(data, productId, qty, batch, productionDate, expiryMonths) {
  const product = findProduct(data, productId);
  if (!product) throw new Error(`产品不存在: ${productId}`);
  const n = parseInt(qty);
  if (isNaN(n) || n <= 0) throw new Error(`入库数量无效: ${qty}`);
  product.stock += n;
  if (productionDate) product.productionDate = productionDate;
  if (expiryMonths) {
    product.expiryMonths = parseInt(expiryMonths);
    product.expiryDate = calcExpiry(product.productionDate || new Date().toISOString().split('T')[0], expiryMonths);
  }
  product.updatedAt = new Date().toISOString();
  data.transactions.push({ type: 'stockIn', productId: product.id, qty: n, date: new Date().toISOString(), batch: batch || '' });
  save(data);
  console.log(`📦 入库成功: ${product.name} +${n}${product.unit}，当前库存${product.stock}${product.unit}`);
  return product;
}

function deduct(data, productId, qty, orderId, note) {
  const product = findProduct(data, productId);
  if (!product) throw new Error(`产品不存在: ${productId}`);
  const n = parseInt(qty);
  if (isNaN(n) || n <= 0) throw new Error(`扣减数量无效: ${qty}`);
  if (product.stock < n) {
    return {
      success: false,
      product,
      warning: `⚠️ ${product.name}库存不足（需${n}${product.unit}，仅剩${product.stock}${product.unit}），请先补货`
    };
  }
  product.stock -= n;
  product.updatedAt = new Date().toISOString();
  data.transactions.push({ type: 'deduct', productId: product.id, qty: n, date: new Date().toISOString(), orderId: orderId || '', note: note || '' });
  save(data);

  // 扣减成功后检查是否需要预警
  if (product.stock <= (product.minStock || 0)) {
    // 通知推送（异步，不阻塞主流程）
    if (notifyAlert) {
      notifyAlert({
        level: 'warning',
        title: '库存预警',
        message: `${product.name}库存${product.stock}${product.unit}，低于安全阈值${product.minStock || 0}${product.unit}，请及时补货`
      }).catch(err => console.log(`⚠️ 预警通知发送失败: ${err.message}`));
    }
    return { success: true, product, warning: `⚠️ ${product.name}库存${product.stock}${product.unit}，低于阈值${product.minStock}${product.unit}，建议补货` };
  }
  return { success: true, product };
}

function list(data, category) {
  let products = data.products;
  if (category) {
    // 如果 category 匹配某个产品 ID 或名称，视为单品查询
    const single = findProduct(data, category);
    if (single) {
      const status = single.stock <= 0 ? '🔴断货' : single.stock <= single.minStock ? '⚠️低库存' : '✅';
      const expiry = single.expiryDate ? ` 效期至${single.expiryDate}` : '';
      return `${status} ${single.name} ${single.stock}${single.unit} 售价¥${single.sellPrice}${expiry}`;
    }
    products = products.filter(p => p.category === category);
  }
  if (products.length === 0) return '📭 暂无匹配产品';
  return products.map(p => {
    const status = p.stock <= 0 ? '🔴断货' : p.stock <= p.minStock ? '⚠️低库存' : '✅';
    const expiry = p.expiryDate ? ` 效期至${p.expiryDate}` : '';
    return `${status} ${p.name} ${p.stock}${p.unit} 售价¥${p.sellPrice}${expiry}`;
  }).join('\n');
}

function lowStock(data) {
  return data.products
    .filter(p => p.stock <= p.minStock)
    .map(p => `⚠️ ${p.name}: ${p.stock}${p.unit}(阈值${p.minStock})`)
    .join('\n') || '✅ 无低库存产品';
}

function expiring(data, days) {
  const warnDays = parseInt(days) || DEFAULT_EXPIRY_WARN_DAYS;
  const now = new Date();
  const warnDate = new Date(now.getTime() + warnDays * 86400000);
  return data.products
    .filter(p => p.expiryDate)
    .map(p => {
      const exp = new Date(p.expiryDate);
      if (exp < now) return { product: p, status: '🔴已过期', days: Math.floor((now - exp) / 86400000) };
      if (exp <= warnDate) return { product: p, status: '⚠️临期', days: Math.floor((exp - now) / 86400000) };
      return null;
    })
    .filter(Boolean)
    .map(r => `${r.status} ${r.product.name} 有效期至${r.product.expiryDate}(${r.days}天)`)
    .join('\n') || '✅ 无过期/临期产品';
}

function check(data) {
  return [
    '── 库存预警 ──',
    lowStock(data),
    '',
    '── 效期预警 ──',
    expiring(data)
  ].join('\n');
}

module.exports = {
  add,
  stockIn,
  deduct,
  list,
  lowStock,
  expiring,
  check,
  findProduct,
};

// ── CLI ──
if (require.main === module) {
  const [,, cmd, ...args] = process.argv;
  const data = load();

  if (!cmd) {
    console.log(`
📦 中医馆进销存管理

用法:
  node inventory.js add '<product-json>'                              新增产品
  node inventory.js stockIn <product-id> <qty> <batch> <prodDate> <expiryMonths>  入库
  node inventory.js deduct <product-id> <qty> [orderId] [note]       出库扣减
  node inventory.js list [category]                                   产品列表
  node inventory.js check                                             库存/效期检查
  node inventory.js low-stock                                         低库存查询
  node inventory.js expiring [days]                                   临期查询(默认30天)

示例:
  node inventory.js add '{"name":"\u5f53\u5f52","category":"\u4e2d\u836f\u996e\u7247","purchasePrice":30,"sellPrice":45,"unit":"\u514b","minStock":500}'
  node inventory.js stockIn inv-001 1000 "batch-2026-07" "2026-06-15" 24
  node inventory.js deduct inv-001 50 "ORD-001"
    `);
    process.exit(0);
  }

  try {
    switch (cmd) {
      case 'add':
        if (!args[0]) throw new Error('缺少产品JSON参数，用法: node inventory.js add \'{"name":"...","category":"..."}\'');
        console.log(JSON.stringify(add(data, args[0]), null, 2));
        break;
      case 'stockIn':
        if (!args[0] || !args[1]) throw new Error('缺少参数，用法: node inventory.js stockIn <product-id> <qty> [batch] [prodDate] [expiryMonths]');
        console.log(JSON.stringify(stockIn(data, args[0], args[1], args[2], args[3], args[4]), null, 2));
        break;
      case 'deduct':
        if (!args[0] || !args[1]) throw new Error('缺少参数，用法: node inventory.js deduct <product-id> <qty> [orderId] [note]');
        console.log(JSON.stringify(deduct(data, args[0], args[1], args[2], args[3]), null, 2));
        break;
      case 'list':
        console.log(list(data, args[0]));
        break;
      case 'low-stock':
        console.log(lowStock(data));
        break;
      case 'expiring':
        console.log(expiring(data, args[0]));
        break;
      case 'check':
        console.log(check(data));
        break;
      default:
        console.error(`❌ 未知命令: ${cmd}`);
        console.error('   运行 node inventory.js 查看用法说明');
        process.exit(1);
    }
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
