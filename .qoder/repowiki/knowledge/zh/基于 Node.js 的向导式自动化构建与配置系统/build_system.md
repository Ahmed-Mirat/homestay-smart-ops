## 1. 核心构建与初始化策略
本项目采用 **Node.js 脚本驱动** 的轻量级构建模式，摒弃了传统的 Makefile 或 Docker 容器化方案。其核心逻辑是通过一系列 JavaScript 脚本实现环境检测、依赖安装、浏览器引擎配置及业务数据的向导式录入。

- **一键环境安装**：通过 `_shared/scripts/auto-install.js` 实现。该脚本不仅执行 `npm install`，还内置了 Node.js 版本校验（>=18）、磁盘空间检测（>=500MB）以及 Playwright Chromium 浏览器的按需安装逻辑。支持 `--check-only` 和 `--type <merchant_type>` 参数，确保不同业态（如民宿需浏览器，中医馆可选）的环境最小化配置。
- **多业态分支构建**：项目支持民宿、公寓、酒店、中医馆四种业态。构建过程会根据 `config.json` 中的 `propertyType` 动态加载不同的配置模板和数据文件结构（如中医馆自动初始化 `members.json` 和 `inventory.json`）。

## 2. 关键构建文件与工具链

| 文件路径 | 功能描述 |
| :--- | :--- |
| `_shared/package.json` | 定义核心依赖（Playwright, node-cron, exceljs）及初始化脚本入口。 |
| `_shared/scripts/auto-install.js` | 核心安装器，负责环境自检、依赖重试安装（最多3次）及浏览器引擎下载。 |
| `_shared/scripts/browser-init.js` | OTA 平台（携程/美团等）商家后台的登录态持久化工具，利用 Playwright Persistent Context 保存 Cookie/Storage。 |
| `_shared/setup/config-writer.js` | 配置写入引擎，提供统一的 API（如 `addRoom`, `addTreatment`）用于安全地修改 JSON 配置文件，避免手动编辑导致的格式错误。 |
| `_shared/scripts/check-env.js` | 10项环境自检工具，涵盖基础环境、配置完整性、知识库生成状态及网络连通性。 |

## 3. 架构设计与约定

- **配置即代码 (Configuration as Code)**：所有业务规则（房型、诊疗项目、员工信息）均存储在 `_shared/config.json` 和 `_shared/data/*.json` 中。严禁商户直接编辑 JSON 文件，必须通过 `config-writer.js` 提供的接口进行变更，以确保数据一致性和触发后续的知识库重建。
- **向导式装配 (Wizard-driven Setup)**：通过 `_shared/setup/SETUP-WIZARD.md` 定义的 5 步流程（基础信息 -> 业务详情 -> 规则标准 -> 环境服务 -> 团队通知），将复杂的系统初始化转化为对话式交互。每一步完成后会自动更新 `setup-state.json` 并推进进度。
- **状态持久化与断点续传**：`setup-state.json` 记录了向导的完成状态。若安装中断，用户可通过“继续设置”指令从断点处恢复，无需重新开始。

## 4. 开发者与维护规范

- **依赖管理**：新增依赖需在 `_shared/package.json` 中声明，并确保 `auto-install.js` 能正确处理其安装逻辑（特别是涉及二进制下载的依赖如 Playwright）。
- **配置扩展**：若为新业态添加配置项，必须在 `config-writer.js` 中增加对应的验证方法（如 `isValidTime`, `isValidPhone`）和写入接口，同时在 `SETUP-WIZARD.md` 中补充相应的问卷逻辑。
- **环境兼容性**：所有脚本必须兼容 Node.js v18+。在进行文件系统操作时，需处理权限不足或磁盘空间满等异常，并提供明确的修复建议（如 `auto-install.js` 中的错误诊断逻辑）。
- **测试与验证**：每次配置变更后，应运行 `node _shared/scripts/check-env.js` 验证环境健康度。对于涉及 OTA 自动化的功能，需定期通过 `browser-init.js check-all` 确认登录态有效性。