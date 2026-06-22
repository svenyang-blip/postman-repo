# Newman `htmlextra` 自定义模板

- **`htmlextra-inline-dashboard.hbs`**：`newman-reporter-htmlextra` 的 Handlebars 模板，**Allure 风格**浅色仪表盘；引用 [Google Fonts](https://fonts.google.com) 与 [Chart.js](https://www.chartjs.org) CDN（需可访问外网）。
- 在仓库根目录执行 `npm run pm:event-list` 时，通过  
  `--reporter-htmlextra-template postman/templates/htmlextra-inline-dashboard.hbs`  
  生成 **`reports/newman-dashboard.html`**（与 `newman-summary-zh.html` 并行；二者均在 `.gitignore` 中）。

## 可调 Newman 参数（节选）

见 [newman-reporter-htmlextra README](https://github.com/DannyDainton/newman-reporter-htmlextra#cli-options)。常用：

| 参数 | 作用 |
|------|------|
| `--reporter-htmlextra-omitResponseBodies` | 报告不含响应体，HTML 体积小 |
| `--reporter-htmlextra-skipSensitiveData` | 隐藏请求/响应头与 body |
| `--reporter-htmlextra-title` / `--reporter-htmlextra-browserTitle` | 页内标题与浏览器标签标题 |

## 模板里能用的数据

与官方默认 [`dashboard-template.hbs`](https://github.com/DannyDainton/newman-reporter-htmlextra/blob/main/lib/dashboard-template.hbs) 相同：根上下文含 `summary`、`aggregations`、`browserTitle`、`title`、`timestamp`、`version` 以及各 `skip*` / `omit*` 开关；`aggregations` 内为 `parent` + `executions`（含 `request`、`response`、`assertions`、`mean`、`cumulativeTests` 等）。另注册有 `totalTests`、`percent`、`inc`、`object`、`isNotIn` 等 helper。

修改样式：直接编辑本目录下 `.hbs` 内 `<style>` 即可，无需改 `package.json`。
