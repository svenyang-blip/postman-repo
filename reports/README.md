# Newman 报告输出

## 入口（推荐）

打开 **`reports/index.html`** — 汇总所有 Controller 报告，可跳转到各独立报告。

## 目录结构

| 路径 | 说明 |
|------|------|
| `reports/index.html` | **汇总页**：各 Controller 通过/失败、更新时间、链接 |
| `reports/controllers/*.html` | **每个 Controller 一份中文报告** |
| `reports/newman-*.json` | Newman 原始导出（含请求/响应体） |
| `reports/newman-*-dashboard.html` | htmlextra 英文仪表盘（可选） |

## 生成

```bash
npm run pm:admin-instant-product:local   # 示例：跑用例 + 更新 controller 报告 + 刷新 index
npm run pm:reports:index                 # 仅根据已有 JSON 刷新汇总页
npm run pm:admin-instant-product:report:zh  # 仅根据已有 JSON 重生成 instant-product 报告
```

## 单份报告内容

1. **用例一览**：HTTP、`ret_code`、从 `result` 提取的测试要点（id/status/items 等）
2. **接口汇总**：按 API 分组统计
3. **分节明细**：折叠请求/响应全文 + 断言结果

新增 Controller：在 `scripts/report-registry.json` 注册，并在 `package.json` 的 npm script 中指向 `reports/controllers/<id>.html`。
