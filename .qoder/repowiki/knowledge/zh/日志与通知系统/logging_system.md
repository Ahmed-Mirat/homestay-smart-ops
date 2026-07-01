该仓库未引入专用的日志框架（如 Winston、Pino 等），而是采用 **Node.js 原生 `console` 对象**作为全栈统一的日志输出机制。日志策略主要服务于 CLI 脚本的执行反馈、自动化任务的存证记录以及关键业务状态的企业微信通知。

### 1. 核心实现方式
- **控制台日志 (Console Logging)**：所有脚本（`auto-install.js`, `task-manager.js`, `ota-operator.js` 等）均直接使用 `console.log` 输出进度、结果和调试信息，使用 `console.error` 输出错误堆栈或致命异常。
- **结构化操作日志 (Operation Log)**：在 `ota-operator.js` 中实现了基于 JSON 文件的持久化日志系统 (`data/operation-log.json`)。每次 OTA 平台操作（改价、关房等）都会记录时间、操作类型、平台、参数、结果状态及截图路径，并保留最近 100 条记录。
- **外部通知通道 (Notification System)**：通过 `notifier.js` 封装了企业微信 Webhook 接口，支持发送文本、Markdown 格式的消息。定义了标准化的通知模板，如调价通知、新订单通知、告警通知和经营日报。

### 2. 日志级别与规范
虽然没有显式的日志级别配置，但代码中形成了隐式的约定：
- **INFO/DEBUG**: 使用 `console.log` 配合 Emoji 图标（如 `✅`, `📦`, `📋`）区分不同业务阶段（安装、任务创建、操作执行）。
- **ERROR**: 使用 `console.error` 处理配置缺失、网络异常或逻辑错误，并在 CLI 入口捕获未处理异常。
- **WARN**: 通过 `console.log` 输出带 `⚠️` 的警告信息（如库存不足、登录态过期）。

### 3. 关键文件
- `_shared/scripts/notifier.js`: 企业微信通知核心逻辑，包含消息模板构建与 HTTP 推送。
- `_shared/scripts/ota-operator.js`: 包含 `appendOperationLog` 函数，负责将自动化操作结果持久化到 JSON 文件。
- `_shared/scripts/task-manager.js`: 任务生命周期管理，通过 `console.log` 反馈任务创建与完成状态。
- `_shared/scripts/auto-install.js`: 环境安装脚本，提供详细的步骤日志与故障排查提示。

### 4. 开发建议
- **保持 CLI 友好性**：继续使用 `console.log` 配合 Emoji 增强可读性，确保用户在终端执行脚本时能获得清晰的视觉反馈。
- **扩展持久化日志**：若需审计更多业务行为，可参考 `ota-operator.js` 的模式，在 `_shared/data/` 下建立对应的 JSON 日志文件。
- **统一通知接口**：业务模块触发告警或状态变更时，应直接调用 `notifier.js` 导出的 `notifyAlert` 或 `notifyMarkdown` 方法，而非自行实现 HTTP 请求。