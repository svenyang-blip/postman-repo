# postman-repo

本仓库包含与 **prediction-market**（`prediction-serv`）用户端接口对齐的 Postman 示例，可用 **Newman**（Postman 官方命令行运行器）在终端跑集合。

## 安装 Newman

任选一种方式即可。

### 方式 A：安装在本项目（推荐）

与 `package.json` 里的版本一致，CI / 同事环境可复现。

```bash
cd /path/to/postman-repo
npm install
```

安装完成后，`newman` 位于 `node_modules/.bin/newman`，通过 `npm run …` 调用，无需全局安装。

### 方式 B：全局安装

任意目录可直接敲 `newman`：

```bash
npm install -g newman
newman --version
```

### 方式 C：不安装，每次用 npx

不写入 `node_modules`，适合临时跑：

```bash
npx --yes newman@6 --version
```

---

## 使用 Newman 跑本仓库集合

**先进入仓库根目录**（含 `package.json` 与 `postman/collections/`）。

已用方式 A 安装依赖时：

```bash
npm run pm:event-list          # CLI
npm run pm:admin-sync          # PmSyncController · testnet 网关（需 pm-admin-testnet.private.postman_environment.json）
npm run pm:admin-sync:local    # 可选：直连本地 prediction-admin :8080
npm run pm:admin-instant-product:local   # PmInstantProductController · 本地 :8080
npm run pm:admin-instant-product:testnet # 同上 · testnet 网关（需 private 环境 Cookie）
npm run pm:ce-updown:local               # UpdownEventController · 本地 :8080（windows/history/chart）
```

结果只看终端。

全局安装（方式 B）时，等价命令示例：

```bash
newman run postman/collections/pm-ce-testnet-event-list.postman_collection.json \
  --reporters cli
```

不写 `npm install`、临时跑一遍时，可用 **方式 C**（`npx`）：

```bash
npx --yes newman@6 run postman/collections/pm-ce-testnet-event-list.postman_collection.json \
  --reporters cli
```

说明：日常所说的 **Postman CLI** 跑集合，一般即用 **Newman**（`newman run …`）。Postman 桌面自带的 `postman collection run` 也可指向同一 JSON 集合。

---

## 接口说明（摘自代码）

| 项目 | 说明 |
|------|------|
| 控制器 | `com.zoomex.prediction.web.controller.EventController` |
| 路径 | `GET /ce/pm/v1/api/event/list` |
| 参数 | `MarketListReq`：`categoryId`、`page`、`pageSize`、`locale`、`eventStatus`、`sortBy` 等 |
| 响应壳 | `Responses<PageResp<EventVo>>` → JSON 字段 `ret_code`、`ret_msg`、`result`（分页含 `page`、`pageSize`、`total`、`list`） |
| testnet 匿名 | `application-testnet.yaml` 中 `/ce/pm/v1/api/event/list` 在 `anon-urls`，无需登录 Cookie |

## Demo URL

```text
https://api2-testnet.zoomex.com/ce/pm/v1/api/event/list?categoryId=30101&page=1&pageSize=5
```

## 集合文件

- `postman/collections/pm-ce-testnet-event-list.postman_collection.json` — **`GET /categories`** + **`GET /event/list`**（`npm run pm:event-list`）。
- `postman/collections/pm-admin-sync-controller.postman_collection.json` — **prediction-admin** `PmSyncController`（`npm run pm:admin-sync` / `pm:admin-sync:local`）。
- `postman/collections/pm-ce-updown-local.postman_collection.json` — **prediction-serv** `UpdownEventController`（`npm run pm:ce-updown:local`）。
- `postman/environments/pm-ce-local.postman_environment.json` — CE 本地环境。
- `postman/collections/bd-auth-login-reset.postman_collection.json` — **bd-management** 登录 / 重置密码（`npm run pm:bd-auth:local`）。
- `postman/collections/bd-bd-users-grpc.postman_collection.json` — **bd-management** `CreateBdAccount` / `UpdateBdAccount`（`npm run pm:bd-users-grpc:local`）。
- `postman/collections/bd-okr.postman_collection.json` — **bd-management** `OkrController` AC-36/37/38（`npm run pm:bd-okr:local` / `pm:bd-okr:testnet`）。

源文件（YAML 骨架，编译成集合）：`postman/skeletons/*.yaml`，`npm run pm:skeleton:compile`。
