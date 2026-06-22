# 如何更完整地测试 Wiki 关联接口

**飞书 Wiki（技术方案）**：[【预测市场】体育频道列表页全品类接入-技术方案](https://skyrocket.sg.larksuite.com/wiki/TEZgwnuyOiJ315kIRn1lypTZgce)（`GET /categories`、`GET /event/list` 等）。

本仓库集合 **`postman/collections/pm-ce-testnet-event-list.postman_collection.json`** 已按该文档扩展：`00` 分类树、`01`–`04` 事件列表与契约、`05` Wiki 边界（含文档示例 **`categoryIds` 逗号**、`categoryId` 非数字绑定失败 **`ret_code` 10001** 等）。**不覆盖**「约定为 GET 却用 POST」等非文档场景。

## 1. 分层思路

| 层级 | 内容 | 本仓库做法 |
|------|------|------------|
| **契约** | HTTP 200、`ret_code`、`result` 分页壳、`Content-Type` | 文件夹「04 响应契约」+ 各文件夹通用断言 |
| **参数规整** | `page`/`pageSize` 上下界、`eventStatus`/`sortBy` 非法回退 | 「01」「02」中带断言的请求 |
| **业务组合** | `ALL` / `SETTLED` / `UPCOMING` / `LIVE` / `LOCKED`、`sortBy`、`isHot`、`locale`、`categoryIds` | 「02」「03」 |
| **列表项结构** | 有数据时 `EventVo` 必有字段 | 「指定分类 + 小分页」中条件断言 |
| **异常** | 非法 `categoryId` 类型 → **10001**（见「05」） | 「05」 |

多数 **query 枚举非法值** 会在 `MarketListReq` 中**回退默认**仍返回 `ret_code=0`；但 **`categoryId` 无法绑定为 `Long`**（如 `abc`）会走 Spring 绑定异常，返回 **`ret_code` 10001**、`result=null`（见集合「05」用例）。

## 2. 集合变量与环境

- 集合变量 **`categoryId`**（默认 `30101`）：在 Postman / Newman 里改为当前环境真实存在的**叶子分类** id。  
- 可先调 `GET /ce/pm/v1/api/categories`（同项目 `anon-urls`）拿到 id，再写进 **Environment** 覆盖集合变量。  
- **`baseUrl`**：testnet / staging / 本地网关分别建 Environment，避免把 URL 写死在用例里。

## 3. 仍可扩展的方向（未全部自动化）

- **多 `categoryIds` 不同 id**：并集与单 `categoryId` 结果对比（需稳定测试数据或快照）。  
- **分页边界**：`page` 很大时 `list` 为空且 `total` 不变。  
- **性能**：Newman 无内置 SLA，可在 CI 外包一层统计 `timings.responseAverage`。  
- **安全**：若有带 Cookie 的私有环境，另建文件夹测鉴权路径，与匿名路径分开。  
- **契约固化**：用 JSON Schema（`ajv`）在 Newman `afterResponse` 或独立 CI 步骤校验响应。

## 4. 运行

```bash
npm run pm:event-list
```

失败时结合 **`reports/newman-event-list.json`** 里 `run.failures` 定位请求名与断言信息。

## 5. 中文 HTML：单份报告、多接口汇总

`reports/newman-summary-zh.html` 由**单次** `npm run pm:event-list` 产生的 `newman-event-list.json` 生成，在同一页内包含：

- **接口汇总**表（`GET /categories` 与 `GET /event/list` 各自的用例数、断言数、失败数）；  
- **一、categories** / **二、event/list** 两节明细（原 Postman 文件夹折叠结构保留）；  
- 若有无法按 URL 归类的请求，会出现在 **「其它请求」**。

默认全部折叠（有失败时相关块默认展开）。仍不依赖外网 CDN。
