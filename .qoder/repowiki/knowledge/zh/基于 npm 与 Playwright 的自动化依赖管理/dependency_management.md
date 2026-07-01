## 1. 依赖管理系统
本项目采用 **Node.js (npm)** 作为核心包管理器，配合 **Playwright** 进行浏览器自动化环境的依赖管理。整体策略倾向于“零接触”安装，通过自定义脚本封装底层 `npm` 和 `npx` 命令，降低用户配置门槛。

### 核心工具链
- **包管理器**: `npm` (Node Package Manager)
- **锁文件机制**: `package-lock.json` (lockfileVersion 3)，确保依赖版本的一致性。
- **自动化引擎**: `_shared/scripts/auto-install.js`，负责环境检测、依赖安装及浏览器驱动下载。
- **运行时依赖**: 
  - `playwright`: 用于 OTA 平台自动化操作及竞品数据采集。
  - `exceljs`: 用于报表生成与数据导出。
  - `node-cron`: 用于定时任务调度（如日终流程、库存预警）。

## 2. 关键文件与配置

| 文件路径 | 作用描述 |
| :--- | :--- |
| `_shared/package.json` | 定义项目元数据及生产环境依赖（`dependencies`）。 |
| `_shared/package-lock.json` | 锁定依赖树，确保在不同环境下安装的子依赖版本一致。 |
| `_shared/scripts/auto-install.js` | **核心安装脚本**。执行 Node 版本校验、磁盘空间检查、`npm install` 重试逻辑以及 Playwright Chromium 浏览器的按需安装。 |
| `_shared/scripts/check-env.js` | 环境自检脚本，用于诊断依赖是否完整安装及配置状态。 |

## 3. 架构与约定

### 集中式共享依赖
项目采用**单体共享基础设施**架构。所有功能模块（如中医馆进销存 `tcm-inventory`、民宿运营 `homestay-*`）均不独立维护 `package.json`，而是统一依赖根目录下的 `_shared/` 文件夹中的 `node_modules`。这种设计减少了冗余安装，确保了跨模块工具（如通知推送、任务调度）的版本统一。

### 智能化安装流程
传统的 `npm install` 被封装在 `auto-install.js` 中，具备以下增强特性：
1. **前置校验**：自动检查 Node.js 版本（要求 >= 18）及磁盘剩余空间（要求 >= 500MB）。
2. **容错重试**：`npm install` 失败时会自动重试最多 3 次，并针对 `EACCES`（权限）、`ENOSPC`（空间不足）、`ETIMEDOUT`（网络超时）提供具体的修复建议。
3. **按需加载**：根据商户类型（如 `homestay` 或 `tcm-clinic`）判断是否需要安装庞大的 Chromium 浏览器内核，避免不必要的资源消耗。

### 浏览器驱动管理
由于项目重度依赖浏览器自动化（OTA 操作、竞品采集），`playwright` 的安装被单独剥离。脚本通过 `npx playwright install chromium` 确保浏览器二进制文件与库版本匹配，解决了常见的驱动兼容性问题。

## 4. 开发者规范

1. **禁止手动安装**：严禁直接运行 `cd _shared && npm install`。所有环境初始化必须通过 `node _shared/scripts/auto-install.js --type <merchant_type>` 触发，以确保环境状态的完整性。
2. **依赖更新策略**：新增第三方库时，应在 `_shared/package.json` 中声明，并提交更新后的 `package-lock.json`。严禁在各子模块（如 `tcm-inventory`）中创建独立的 `package.json`。
3. **环境兼容性**：代码编写需兼容 Node.js 18+ 环境。在使用文件系统 API（如 `fs.statfsSync`）时需考虑不同操作系统的兼容性处理（已在 `auto-install.js` 中体现）。
4. **私有化部署支持**：项目设计为离线/内网友好型，依赖均通过公共 registry 获取，但通过锁文件确保了在无外网环境下可通过拷贝 `node_modules` 进行迁移。