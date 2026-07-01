### 1. 核心系统与策略
该仓库的前端界面主要采用 **原生 HTML/CSS/JavaScript** 技术栈，未引入任何第三方 CSS 框架（如 Tailwind CSS、Bootstrap）或组件库（如 Material UI、Ant Design）。样式管理遵循 **内联样式表 (Inline Stylesheet)** 模式，所有视觉定义均集中在单个 HTML 文件的 `<style>` 标签内。

### 2. 关键文件与实现
- **核心 UI 文件**: `_shared/assets/workspace-widget.html`
  - 这是目前仓库中唯一包含完整前端视觉定义的入口文件。
  - 采用了 **CSS Grid** (`grid-template-columns`) 和 **Flexbox** (`display: flex`) 进行响应式布局。
  - 实现了基础的 **深色模式 (Dark Mode)** 支持，通过 `@media (prefers-color-scheme: dark)` 媒体查询自动切换背景色、文字颜色及卡片阴影。

### 3. 架构与设计约定
- **视觉风格**: 采用现代简约的卡片式设计（Card-based Design）。
  - **色彩体系**: 使用硬编码的十六进制颜色值。主色调为蓝色系（`#3b82f6`），辅助色包括成功绿（`#10b981`）、警告黄（`#fef3c7`）和错误红（`#fee2e2`）。
  - **排版**: 优先使用系统字体栈 (`-apple-system, BlinkMacSystemFont, 'Segoe UI'`) 以确保跨平台一致性。
  - **交互反馈**: 按钮和卡片定义了简单的 `hover` 状态（如背景色微变、轻微位移 `transform: translateY(-1px)`）。
- **数据驱动渲染**: UI 并非静态 HTML，而是通过 JavaScript 动态注入数据。脚本读取 `window.__WIDGET_DATA__` 对象，并根据数据状态（如任务类型、告警级别）动态添加 CSS 类名（如 `.task-icon.clean`, `.alert-item.warning`）。

### 4. 开发者规范与建议
- **样式修改**: 由于缺乏 CSS 预处理器或模块化方案，修改样式需直接编辑 `workspace-widget.html` 中的 `<style>` 块。建议保持选择器的语义化命名（如 `.kpi-card`, `.section-title`）。
- **扩展新组件**: 若需新增 UI 模块，应复用现有的 `.section` 容器类和 `.action-btn` 等原子化类名，以维持视觉统一性。
- **主题适配**: 当前深色模式仅覆盖了基础元素。若增加新组件，务必在 `@media (prefers-color-scheme: dark)` 块中补充对应的深色样式定义。
- **局限性注意**: 目前样式逻辑与业务逻辑（JS）及结构（HTML）高度耦合。在扩展复杂交互时，需注意避免样式冲突，因为不存在 CSS 作用域隔离机制。