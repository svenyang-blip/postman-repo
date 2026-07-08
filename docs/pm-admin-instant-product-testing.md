# PmInstantProductController 外部测试（Postman CLI / Newman）

管理端 **`PmInstantProductController`**（`prediction-admin`）的 HTTP 契约测试，覆盖 Wiki §7.2 **A1–A7**。

| 项目 | 说明 |
|------|------|
| 控制器 | `com.zoomex.prediction.admin.controller.PmInstantProductController` |
| 路径前缀（本地直连） | `/private/v1/pm/instant-products` |
| 路径前缀（testnet 网关） | `…/gw-internal/pm-admin/v1/pm/instant-products` |
| 操作人 | 写操作在 **请求体** `operator` 字段（非 `X-Operator` 头） |

## 集合结构

| 目录 | 说明 |
|------|------|
| **00 Setup** | `GET /categories/tree` → `leafCategoryId`；`GET /instant-products` → `instantProductId`；A1 validate 缓存 |
| **A · GET 正向 [ok]** | A1 validate、A2 list（含筛选）、A6 sync-runs、A7 events/window-prices |
| **B · 参数校验 [err]** | 缺 slug、create/start/stop/sync 缺 `operator` 或必填字段 |
| **C · 边界与异常** | 假 id、重复 slug、无效 slug |
| **D · POST 正向 [ok]** | create → start → sync → sync-runs/events/window-prices → stop |

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `seriesSlug` | `btc-up-or-down-5m` | Polymarket series slug（与 event slug 不同） |
| `leafCategoryId` | Setup 自动解析 | 叶子分类 id |
| `instantProductId` | Setup / D01 写入 | 当前测试产品 id |
| `syncRunId` | D03 写入 | 最近一次手动 sync 批次 id |

## 运行

**本地（默认）**

```bash
cd /path/to/postman-repo
npm install
npm run pm:admin-instant-product:local
```

需本地已启动 `prediction-admin`（`:8080`），且服务可访问 **Gamma API**（A1 validate / create / gamma 预览依赖外网）。

报告：

- 汇总入口：`reports/index.html`
- 本 Controller：`reports/controllers/pm-admin-instant-product-local.html`

**testnet 网关（可选）**

```bash
# 复制 pm-admin-testnet.private.postman_environment.example.json 并填入 adminCookie
npm run pm:admin-instant-product:testnet
```

## 接口清单

| 编号 | 方法 | 路径 |
|------|------|------|
| A1 | GET | `/instant-products/polymarket/series/validate?slug=` |
| A2 | GET | `/instant-products?status=&asset=&keyword=` |
| A3 | POST | `/instant-products` |
| A4-1 | POST | `/instant-products/{id}/start` |
| A4-2 | POST | `/instant-products/{id}/stop` |
| A5 | POST | `/instant-products/{id}/sync` |
| A6-1 | GET | `/instant-products/{id}/sync-runs?limit=` |
| A6-2 | GET | `/instant-products/{id}/sync-runs/{runId}` |
| A7-1 | GET | `/instant-products/{id}/events?source=local\|gamma&cursor=&limit=` |
| A7-2 | GET | `/instant-products/{id}/window-prices?captureStatus=&limit=` |
