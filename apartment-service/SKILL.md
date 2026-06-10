---
name: apartment-service
description: 增值服务推送 —— 根据入住时长/季节节点自动匹配推送规则，8条内置规则可自定义
---

# 增值服务推送

## 触发方式

| 触发词 | 行为 |
|--------|------|
| "增值服务" / "服务推送" | 检查所有租客，生成推送建议列表 |
| "查看推送规则" | 列出当前所有配置的规则 |
| "修改推送规则" | 编辑 `_shared/data/service-rules.json` |

## 内置规则

| 规则 | 触发条件 | 话术 |
|------|---------|------|
| 🧹 入住保洁 | 入住时 | 欢迎入住，可预约深度保洁 |
| 🏠 月度保洁 | 入住30天 | 建议全屋保洁 |
| ❄️ 空调清洗 | 5-8月 | 夏季空调清洗 |
| 💧 净水滤芯 | 入住90天 | 滤芯更换提醒 |
| 🔥 暖气检查 | 10-12月 | 冬季暖气检查 |
| 🔧 家电清洗 | 入住60天 | 洗衣机/冰箱深度清洗 |
| 🎁 续租优惠 | 入住330天 | 续租享折扣 |
| ✨ 退租保洁 | 退租前7天 | 预约退租保洁 |

## 自定义规则

编辑 `_shared/data/service-rules.json`，支持三种触发类型:
- `checkin`: 入住时触发 (days: 0)
- `stay`: 按入住天数触发 (days: 30/60/90/330)
- `season`: 按月份触发 (months: [5,6,7,8])
- `moveout`: 退租前触发 (days: -7)

## 执行

`node apartment-service/scripts/service-pusher.js check` — 批量检查
`node apartment-service/scripts/service-pusher.js rules` — 查看规则
