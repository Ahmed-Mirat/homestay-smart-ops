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

const DATA_FILE = path.join(__dirname, '..', '_shared', 'data', 'inventory.json');
const DEFAULT_MIN_STOCK = 10;
const DEFAULT_EXPIRY_WARN_DAYS = 30;

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    return { products: [], transactions: [] };
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
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
  const d = new Date(productionDate);
  d.setMonth(d.getMonth() + parseInt(expiryMonths));
  return d.toISOString().split('T')[0];
}

// ── Commands ──

function add(data, productJson) {
  const p = JSON.parse(productJson);
  if (!p.name || !p.category) throw new Error('产品名称和分类必填');
  const product = {
    id: nextId(data),
    name: p.name,
    category: p.category || '其他',
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
  return product;
}

function stockIn(data, productId, qty, batch, productionDate, expiryMonths) {
  const product = data.products.find(p => p.id === productId || p.name === productId);
  if (!product) throw new Error(`产品不存在: ${productId}`);
  const n = parseInt(qty);
  product.stock += n;
  if (productionDate) product.productionDate = productionDate;
  if (expiryMonths) {
    product.expiryMonths = parseInt(expiryMonths);
    product.expiryDate = calcExpiry(product.productionDate || new Date().toISOString().split('T')[0], expiryMonths);
  }
  product.updatedAt = new Date().toISOString();
  data.transactions.push({ type: 'stockIn', productId: product.id, qty: n, date: new Date().toISOString(), batch: batch || '' });
  save(data);
  return product;
}

function deduct(data, productId, qty, orderId, note) {
  const product = data.products.find(p => p.id === productId || p.name === productId);
  if (!product) throw new Error(`产品不存在: ${productId}`);
  const n = parseInt(qty);
  if (product.stock < n) {
    const warn = `⚠️ ${product.name}库存仅剩${product.stock}${product.unit}，需要${n}${product.unit}，请及时补货`;
    product.stock -= n;
    product.updatedAt = new Date().toISOString();
    data.transactions.push({ type: 'deduct', productId: product.id, qty: n, date: new Date().toISOString(), orderId: orderId || '', note: note || '' });
    save(data);
    return { product, warning: warn };
  }
  product.stock -= n;
  product.updatedAt = new Date().toISOString();
  data.transactions.push({ type: 'deduct', productId: product.id, qty: n, date: new Date().toISOString(), orderId: orderId || '', note: note || '' });
  save(data);
  // Check if below min stock
  if (product.stock <= product.minStock) {
    return { product, warning: `⚠️ ${product.name}库存${product.stock}${product.unit}，低于阈值${product.minStock}${product.unit}，建议补货` };
  }
  return { product };
}

function list(data, category) {
  let products = data.products;
  if (category) products = products.filter(p => p.category === category);
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
    lowStock(data),
    '',
    expiring(data)
  ].join('\n');
}

// ── CLI ──
const [,, cmd, ...args] = process.argv;
const data = load();

try {
  switch (cmd) {
    case 'add': console.log(JSON.stringify(add(data, args[0]))); break;
    case 'stockIn': console.log(JSON.stringify(stockIn(data, args[0], args[1], args[2], args[3], args[4]))); break;
    case 'deduct': console.log(JSON.stringify(deduct(data, args[0], args[1], args[2], args[3]))); break;
    case 'list': console.log(list(data, args[0])); break;
    case 'low-stock': console.log(lowStock(data)); break;
    case 'expiring': console.log(expiring(data, args[0])); break;
    case 'check': console.log(check(data)); break;
    default: console.log('Usage: node inventory.js <add|stockIn|deduct|list|low-stock|expiring|check> [...]');
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
