# 如何更完整地测试 `GET /ce/pm/v1/api/event/list`

对应后端：`prediction-serv` 的 `EventController#listEvents` 与 `MarketListReq`。

## 1. 分层思路

| 层级 | 内容 | 本仓库做法 |
|------|------|------------|
| **契约** | HTTP 200、`ret_code`、`result` 分页壳、`Content-Type` | 文件夹「04 响应契约」+ 各文件夹通用断言 |
| **参数规整** | `page`/`pageSize` 上下界、`eventStatus`/`sortBy` 非法回退 | 「01」「02」中带断言的请求 |
| **业务组合** | `ALL` / `SETTLED`、`sortBy`、`isHot`、`locale`、`categoryIds` | 「02」「03」 |
| **列表项结构** | 有数据时 `EventVo` 必有字段 | 「指定分类 + 小分页」中条件断言 |

当前接口为 **匿名 GET**，一般不会返回 4xx 参数错误；非法 query 多在服务端**静默回退默认值**，测试重点是 **行为与结构**，而不是期待错误码。

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

## 5. 中文 HTML 报告中的折叠

`reports/newman-summary-zh.html` 按 Postman **文件夹**与**单条请求**两级 **`<details>`** 展示：默认全部折叠（有失败时失败组/失败用例会 `open` 展开）。便于在同一接口的多用例间快速浏览。
