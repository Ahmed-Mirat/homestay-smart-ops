---
name: apartment-inventory
description: 物资出入库记账 —— 自然语言完成入库/出库登记，库存低于阈值自动提醒补货，全程生成可查流水
---

# 物资出入库记账

## 触发方式

| 触发词 | 行为 |
|--------|------|
| "入库 [品名] [数量] [单位]" | 登记入库，更新库存 |
| "出库 [品名] [数量] [单位]" | 登记出库，低于阈值自动告警 |
| "库存" / "还有多少" | 显示当前全部库存 |
| "什么快没了" / "低库存" | 列出低于阈值的物资 |
| "出入库记录" / "流水" | 展示最近出入库记录 |
| "设置阈值 [品名] [数量]" | 自定义补货阈值 |

## 核心逻辑

Agent 解析自然语言指令，调用 `node apartment-inventory/scripts/inventory.js`。

- 入库: `inventory.js in "品名" 数量 "单位" "备注"`
- 出库: `inventory.js out "品名" 数量 "单位" "备注"`
- 列表: `inventory.js list`
- 低库存: `inventory.js low`
- 流水: `inventory.js log`
- 阈值: `inventory.js set-threshold "品名" 数量`

每次操作后自动检查阈值，低于阈值时推送告警到企业微信群。

## 数据模型

`_shared/data/inventory.json`:

```json
{
  "items": [
    {"name": "矿泉水", "qty": 8, "unit": "箱", "threshold": 5}
  ],
  "log": [
    {"time": "2026-06-10 16:03", "type": "入库", "name": "矿泉水", "qty": 10, "unit": "箱", "before": 0, "after": 10, "note": "夏季补货"}
  ],
  "thresholds": {"default": 5}
}
```
