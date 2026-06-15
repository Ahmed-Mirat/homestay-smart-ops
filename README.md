# homestay-smart-ops

民宿/公寓/酒店智能运营 Skill 套件 v4.0。通过 QoderWork + Claude Code Agent 对话式管理所有日常运营工作。

## 项目分支

| 分支 | 商户 | 类型 | 功能数 | 状态 |
|------|------|:--:|:--:|:--:|
| `master` | — | 基础套件 | 12 模块 | v3.3 稳定版 |
| `feature/zhuyueyunlu` | 竹悦云庐 | 民宿 | 竞品采集+趋势分析 | v3.4 演示版 |
| `feature/huaye-walker` | 华业沃克 | 长租公寓 | 6 项核心功能 | 开发完成 |
| `feature/yueshe-business` | 阅舍商旅 | 酒店 | 9 项核心功能 | 开发完成 |
| `feature/apartment-ops` | — | 公寓模块 | 4 个公寓模块 | 已合并至 feature/zhuyueyunlu |

## 模块架构

```
homestay-smart-ops/
├── SKILL.md                          # 套件入口（通用版）
├── homestay-suite.json               # 元配置
├── _shared/                          # 共享基础设施
│   ├── scripts/                      # task-manager, notifier, widget-data
│   ├── data/                         # 运行时数据（JSON 存储）
│   ├── setup/                        # 安装向导+知识库生成器
│   └── docs/                         # 用户手册+演示指南
├── homestay-guest/                   # 智能客服（RAG+情绪分级+差评回复）
├── homestay-workflow/                # 流程自动化（排班+任务+日终+定时调度）
├── homestay-pricing/                 # 智能定价（5因子+竞品采集五平台+趋势分析）
├── homestay-report/                  # 数据报表
├── homestay-sync/                    # 多平台同步
├── apartment-rent/                   # 公寓·房租催缴
├── apartment-inventory/              # 公寓·库存记账
├── apartment-service/                # 公寓·增值服务推送
├── huaye-walker/                     # [分支] 华业沃克·长租公寓
└── yueshe-business/                  # [分支] 阅舍商旅·酒店
```

## 核心能力矩阵

### 立即可用（无需 OTA 商家后台）

| 能力 | 民宿 | 公寓 | 酒店 |
|------|:--:|:--:|:--:|
| 智能客服（RAG 问答） | 已实现 | 已实现 | 已实现 |
| 保洁排班 | 已实现 | — | — |
| 任务看板 | 已实现 | 已实现 | 已实现 |
| 企业微信通知推送 | 已实现 | 已实现 | 已实现 |
| 日终流程 | 已实现 | 已实现 | 已实现 |
| 竞品价格采集（五平台） | 已实现 | — | 已实现 |
| 竞品促销活动分析 | 已实现 | — | 已实现 |
| 历史价格趋势分析 | 已实现 | — | 已实现 |
| 好评/差评回复 | 差评已实现 | — | 好评+差评 |
| 房租催缴（三档+AI话术） | — | 已实现 | — |
| 库存出入库记账 | — | 已实现 | — |
| 增值服务推送 | — | 已实现 | 已实现 |
| 维修工单管理（+超时预警） | — | 已实现 | — |
| 定时广播推送 | — | 已实现 | 已实现 |
| 回头客历史偏好弹窗 | — | — | 已实现 |
| 深夜自动入住指引 | — | — | 已实现 |
| 厦门旅游攻略推送 | — | — | 已实现 |
| 延迟退房定价+结算 | — | — | 已实现 |
| 问题客户预警 | — | — | 已实现 |

### 待OTA激活（需商家后台权限）

| 能力 | 状态 |
|------|:--:|
| 自动改价执行 | 待激活 |
| 全平台一键关房/开房 | 待激活 |
| 超卖预防 | 待激活 |
| 经营数据自动采集 | 待激活 |
| 活动同步 | 待激活 |

## 技术栈

- 运行时：Node.js 18+, Claude Code Agent (QoderWork)
- 存储：本地 JSON 文件（_shared/data/）
- 通知：企业微信群机器人 Webhook
- 竞品采集：Playwright Persistent Context + Chromium
- 定时调度：node-cron
- 数据看板：Chart.js + HTML Widget

## 快速开始

```
1. git clone 对应商户分支
2. cd _shared && npm install
3. 对话说"开始设置"
4. 按引导录入信息（约10分钟）
5. 所有功能立即可用
```

## 版本

- v3.3: 民宿基础套件（8核心+5待激活）
- v3.4: 竞品采集趋势分析 + 公寓模块（4个）
- v4.0: 商户定制分支（竹悦云庐/华业沃克/阅舍商旅）+ 动态定时调度
