# BD Management · testnet / 远程 dev · HTTP API（明文登录）

与 **local** 相同：`POST /api/v1/login` 的 `data` 传**明文 JSON 字符串**，无需 RSA。

| 项目 | 说明 |
|------|------|
| 集合 | `postman/collections/bd-api-testnet.postman_collection.json` |
| 环境 | `postman/environments/bd-management-testnet.postman_environment.json` |
| 私密环境 | 复制 `bd-management-testnet.private.postman_environment.example.json` → `bd-management-testnet.private.postman_environment.json` |
| testnet `apiBase` | `https://api2-testnet.zoomex.com/bd-manage` |
| 门户 `referer`（可选） | `https://affiliates-testnet.zoomex.com/bd-manage/` |

## 前提：服务端须允许明文

明文登录取决于**服务端配置**，不是 Postman 改域名就能生效：

| Profile | `allow-plain-data` | `captcha-enabled` |
|---------|-------------------|-------------------|
| **dev** | `true` | `false` |
| **testnet**（默认） | `false` | `true` |

可行做法（二选一）：

1. **远程 dev 实例**：bd-serv 以 `dev` profile 部署，Postman 只改 `apiBase` 指向该域名。
2. **testnet + Nacos 覆盖**：在 testnet Nacos（`bd-serv`）里设  
   `app.auth.allow-plain-data: true`、`app.auth.captcha-enabled: false`。

若仍是 testnet 默认配置（`allow-plain-data=false`），明文会登录失败，需改回 RSA（见 `scripts/bd-encrypt-login-data.mjs`）。

## 快速运行

```bash
# 1. 复制私密环境（apiBase 已默认 api2-testnet）
cp postman/environments/bd-management-testnet.private.postman_environment.example.json \
   postman/environments/bd-management-testnet.private.postman_environment.json

# 2. 直接跑（无需 RSA prepare）
npm run pm:bd-api:testnet
```

也可复用 **local 集合**，只换环境里的 `apiBase`：

```bash
# 编辑 bd-management-local.postman_environment.json 的 apiBase 为远程 dev 地址
npm run pm:bd-auth:local
```

## 登录请求体

```json
POST /api/v1/login
{
  "data": "{\"email\":\"aiden@zoomex.com\",\"password\":\"Passw0rd\",\"broker_id\":1}",
  "broker_id": 1
}
```

## 集合目录

| 目录 | 覆盖 |
|------|------|
| 00 Setup | apiBase / 账号检查、健康检查 |
| A | Manager / BD 明文登录 |
| B | 缺 data、错密 |
| C | `/bd-users/me`、列表、ping |
| D | 登录 → ping → logout |
| E | `GET /leads/export` CSV 导出（BD / Manager） |
| F | Lead 审批：`GET /leads/approvals`、`POST /leads/approvals/{id}/decision` |
| G | BD 看板：`GET /dashboard/bd/overview`、`GET /dashboard/bd/affiliates`（验收卡 AC-20 / AC-21） |

## YAML 骨架试点（Lead 审批）

源文件：[`postman/skeletons/bd-lead-approvals.yaml`](../postman/skeletons/bd-lead-approvals.yaml)  
生成集合：`postman/collections/bd-lead-approvals.postman_collection.json`（不要手改）

```bash
npm run pm:skeleton:compile      # YAML → Postman JSON
npm run pm:bd-approvals:local    # 编译并跑本地 Newman（含 Manager/BD 登录）
```

改用例先改 YAML 的 `given` / `when` / `then` / `asserts`，再编译。`fill: skeleton` 时可以只留 HTTP + `ret_code`，细节后补。原集合 `bd-api-testnet` 的 F 目录仍可跑全量 API，与试点并行。

## F · Lead 审批说明

对应 `LeadApprovalController`（仅 Manager）：

| 用例 | 说明 |
|------|------|
| AP-01 ~ AP-03 | 列表成功（默认分页 / `status=pending` / `page_size`） |
| AP-E01 ~ AP-E03 | 列表：无 Token、BD 无权限、非法 status |
| AP-E04 ~ AP-E08 | decision：缺/非法 action、审批单不存在、BD 无权限、无 Token |
| AP-04 | **可选写操作**：`reject`；默认跳过 |

默认不执行审批写操作。若要跑 AP-04：

1. 环境变量 `runApprovalDecision=true`
2. 提供 `pendingApprovalId`（或先跑 AP-02，有 pending 时会写入集合变量）

```bash
# 示例：显式审批单 id + 开启写操作
# 在 private 环境中增加：
#   runApprovalDecision = true
#   pendingApprovalId   = <审批单 id>
```

## G · BD 看板说明

对应 `DashboardController` 与 `bd-management/docs/acceptance/ac-bd-dashboard.md`（#20 / #21）。BD 与 Manager **都只看自己**。延后接口（OKR、链接追踪、`team/*`）不测。

未登录与现有集合一致：HTTP 200 + `ret_code=10007`（拦截器业务码，不是 HTTP 401）。

| 用例 | 说明 |
|------|------|
| AC-20-01 | overview 成功；`kpis` 仅 8 个过程卡字段 |
| AC-20-01b | overview 带 `range=lifetime` 仍成功（V1 忽略） |
| AC-20-02 | Manager token 调 overview，结构同样是自身过程卡 |
| AC-20-03 | 无 Token → `10007` |
| AC-20-04 | 空名下全零；需 `emptyDashboardEmail` / `emptyDashboardPassword`，默认跳过 |
| AC-21-01 | affiliates 默认 `range=30d`、分页 1/20；缓存首条 `affiliate_id` |
| AC-21-01b / 01c | `7d` / `90d` 成功 |
| AC-21-02 | keyword 命中本账号（可用环境变量 `dashboardKeyword`） |
| AC-21-02b | Manager 用同一 id 搜索，列表不含 BD 的代理 |
| AC-21-03 / 03b | `lifetime` / `180d` → `10001` |
| AC-21-04 | 无 Token → `10007` |

可选环境变量：

| 变量 | 说明 |
|------|------|
| `dashboardKeyword` | 覆盖 AC-21-02 的 keyword（KOL name 或数字 id） |
| `emptyDashboardEmail` / `emptyDashboardPassword` | 名下无 Lead、无已审代理的账号，用于 AC-20-04 |

## 与 local 区别

| | local | 本集合（testnet/远程 dev） |
|---|-------|---------------------------|
| 登录方式 | 明文 | 明文（相同） |
| `apiBase` | `http://127.0.0.1:8080/bd-manage` | 远程网关域名 |
| 服务端 | 本地 dev | 远程 dev 或 Nacos 已开明文 |

详见 [`bd-auth-testing.md`](bd-auth-testing.md)。
