# postman-repo

本仓库包含与 **prediction-market**（`prediction-serv`）用户端接口对齐的 Postman 示例，并用 **Newman**（Postman 官方命令行运行器）生成测试报告。

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

若要用 HTML 报告，再装 reporter（本仓库脚本已用 `htmlextra`）：

```bash
npm install -g newman-reporter-htmlextra
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
npm run pm:event-list          # CLI + JSON + JUnit + 自包含中文 HTML（见下）
npm run pm:event-list:html     # CLI + htmlextra 英文界面 HTML + JSON + 中文 HTML
npm run pm:report:zh           # 仅根据已有 JSON 重新生成中文 HTML（需先跑过 pm:event-list）
```

- **`reports/newman-summary-zh.html`**：单次运行内 **`/categories` + `/event/list`** 合并为**一页**中文报告（含汇总表与两节明细）。
- **`reports/newman-event-list.html`**：`newman-reporter-htmlextra` 生成，界面为英文且依赖外链脚本；若打开转圈，见 `reports/README.md`。

全局安装（方式 B）时，等价命令示例：

```bash
newman run postman/collections/pm-ce-testnet-event-list.postman_collection.json \
  --reporters cli,json,junit \
  --reporter-json-export reports/newman-event-list.json \
  --reporter-junit-export reports/newman-event-list.xml \
  && node scripts/newman-json-to-zh-html.mjs reports/newman-event-list.json reports/newman-summary-zh.html
```

不写 `npm install`、临时跑一遍时，可用 **方式 C**（`npx`）：

```bash
npx --yes newman@6 run postman/collections/pm-ce-testnet-event-list.postman_collection.json \
  --reporters cli,json,junit \
  --reporter-json-export reports/newman-event-list.json \
  --reporter-junit-export reports/newman-event-list.xml \
  && node scripts/newman-json-to-zh-html.mjs reports/newman-event-list.json reports/newman-summary-zh.html
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

- `postman/collections/pm-ce-testnet-event-list.postman_collection.json` — 对齐 Wiki 技术方案：**`GET /categories`** + **`GET /event/list`**，含边界/异常（约 **28** 个请求；不含「GET 误用 POST」）。

## 更完整的接口测试说明

见 **[`docs/pm-event-list-testing.md`](docs/pm-event-list-testing.md)**：分层策略、环境变量、可继续扩展的方向（Schema、性能、数据对比等）。
