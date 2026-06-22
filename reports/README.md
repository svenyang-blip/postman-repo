# Newman 报告输出

由 `npm run pm:event-list` / `npm run pm:event-list:html` 生成（默认被根目录 `.gitignore` 忽略，仅存本地）。

| 文件 | 说明 |
|------|------|
| `newman-event-list.json` | Newman 完整运行导出（含请求/响应体，体积较大） |
| `newman-event-list.xml` | JUnit XML，适合 Jenkins / GitLab CI |
| `newman-event-list.html` | `newman-reporter-htmlextra`（英文界面，依赖外网 CDN） |
| `newman-summary-zh.html` | **一份合并中文报告**：页首「双接口汇总」表 +「一、categories」「二、event/list」分节明细（仍来自单次 `newman` JSON） |

运行 `npm run pm:event-list` 或 `npm run pm:event-list:html` 后会在 **`reports/newman-summary-zh.html`** 写出中文页；双击或用 `open reports/newman-summary-zh.html` 打开即可，无需外网。

## `newman-event-list.html` 一直转圈 / 空白

报告里的样式和交互脚本来自 **公网 CDN**（如 `cdnjs.cloudflare.com`、`stackpath.bootstrapcdn.com`、`cdn.datatables.net`）。若这些地址在你当前网络下 **打不开、很慢或被拦截**，浏览器标签页会长时间处于加载状态，页面也可能一直转圈或白屏。

### 建议排查

1. 用 **Chrome / Edge** 打开报告，按 **F12** → **Network（网络）**，刷新页面，看是否有资源一直处于 **Pending** 或状态为 **(failed)**。
2. 在浏览器地址栏单独访问例如：  
   `https://cdnjs.cloudflare.com/ajax/libs/jquery/3.5.1/jquery.min.js`  
   若打不开，说明是 **网络 / 代理 / 防火墙** 问题，需要先能访问这些 CDN（或换网络、开代理）。
3. **本地起 HTTP 服务**一般不能解决 CDN 被墙问题，但可以排除个别环境对 `file://` 的怪异行为，可一试：  
   `cd reports && python3 -m http.server 8765`  
   然后浏览器打开 `http://127.0.0.1:8765/newman-event-list.html`。

### 不依赖该 HTML 的替代看法

- 优先打开 **`newman-summary-zh.html`**（中文、无 CDN）。
- 看终端里 Newman 的 **CLI 表格摘要**（断言已通过/失败一目了然）。
- 用 **`newman-event-list.xml`**：IDE、CI 或任意 JUnit 查看器打开。
- 用 **`newman-event-list.json`**：在编辑器里搜索 `assertions`、`failures` 查看结构化结果。
