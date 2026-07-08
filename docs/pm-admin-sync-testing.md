# PmSyncController 外部测试（Postman CLI / Newman）

管理端 **`PmSyncController`**（`prediction-admin`）的 HTTP 契约测试，通过 **Newman** 对运行中的服务发真实请求。

| 项目 | 说明 |
|------|------|
| 控制器 | `com.zoomex.prediction.admin.controller.PmSyncController` |
| 路径前缀（testnet 网关） | `…/gw-internal/pm-admin/v1/pm` |
| 路径前缀（本地直连） | `/private/v1/pm` |
| 列表 | `GET /sync/events?tab=ONLINE\|MANUAL\|BLOCKED&pageSize=…` → `id` 为 `t_event_staging.id` |
| 操作人 | 写操作需请求头 **`X-Operator`** |

## 集合结构

| 目录 | 说明 |
|------|------|
| **00 Setup** | `GET /sync/setting`；`GET /sync/events` 按 tab 写入 staging/event id |
| **A · GET 正向 [ok]** | `setting`、`stat-cards`、`sync/events` |
| **B · 参数校验 [err]** | 缺 operator、`@Valid`、缺/非法 `tab`、bootstrap 缺 operator |
| **C · 边界与异常** | 假 id 批量失败明细、edit 不存在 staging |
| **D · POST 正向 [ok]** | setting 往返、edit、四条批量链、bootstrap 限流 |

### Setup 从 `GET /sync/events` 解析的变量

| 请求 | 写入变量 | 用途 |
|------|----------|------|
| `tab=MANUAL` | `stagingIdForOnline`（第 1 条）、`stagingIdToManual`（第 2 条） | D04 online / D05 intercept |
| `tab=ONLINE` | `stagingIdForEdit`（`id`）、`positiveEventId`（`eventId`） | D03 edit |
| `tab=BLOCKED` | `stagingIdBlocked` | D06 restore |
| 回退 `GET /events` | `positiveEventId` | ONLINE 池无 `eventId` 时 |

## 运行

**testnet（默认）**

```bash
cd /path/to/postman-repo
npm install
# 复制 pm-admin-testnet.private.postman_environment.example.json 并填入 adminCookie
npm run pm:admin-sync
```

鉴权：`adminCookie` + `Referer` + `User-Agent`（集合 prerequest 自动注入）。

报告：`reports/index.html` → `reports/controllers/pm-admin-sync-local.html`（本地）/ `pm-admin-sync-testnet.html`（testnet）

**本地直连（可选）**

```bash
npm run pm:admin-sync:local
```

需本地已启动 `prediction-admin`（`:8080`）。

## 接口清单

| 方法 | 路径 |
|------|------|
| GET | `/private/v1/pm/sync/setting` |
| GET | `/private/v1/pm/sync/stat-cards` |
| GET | `/private/v1/pm/sync/events` |
| POST | `/private/v1/pm/sync/setting/switch` |
| POST | `/private/v1/pm/sync/setting/threshold` |
| POST | `/private/v1/pm/sync/events/bootstrap` |
| POST | `/private/v1/pm/sync/events/intercept/batch` |
| POST | `/private/v1/pm/sync/events/online/batch` |
| POST | `/private/v1/pm/sync/events/offline/batch` |
| POST | `/private/v1/pm/sync/events/edit` |
| POST | `/private/v1/pm/sync/events/restore/batch` |
