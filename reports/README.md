# Newman 报告输出

由 **`npm run pm:event-list`** 在本地生成（根目录 `.gitignore` 已忽略这些文件，仓库内只保留本说明）。

本仓库主要可读 HTML：`newman-summary-zh.html`（中文合并报告）与 `newman-dashboard.html`（htmlextra 仪表盘）；均为 Allure 风格，字体与图表引用 Google Fonts / Chart.js CDN。另附机器可读产物便于 CI 与排错。

| 文件 | 说明 |
|------|------|
| `newman-event-list.json` | Newman 完整运行导出（含请求/响应体，体积可能较大） |
| `newman-event-list.xml` | JUnit XML，适合 Jenkins / GitLab CI |
| `newman-summary-zh.html` | **中文合并报告**：接口汇总表 + 按接口分节明细（Allure 风格） |
| `newman-dashboard.html` | **htmlextra 仪表盘**（自定义 `postman/templates/htmlextra-inline-dashboard.hbs`） |

运行：

```bash
npm run pm:event-list
```

然后在 `reports/` 下打开 **`newman-summary-zh.html`**。若仅需根据已有 JSON 重生成 HTML：`npm run pm:report:zh`。
