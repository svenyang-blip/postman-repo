# 如何更完整地测试 Wiki 关联接口

**飞书 Wiki（技术方案）**：[【预测市场】体育频道列表页全品类接入-技术方案](https://skyrocket.sg.larksuite.com/wiki/TEZgwnuyOiJ315kIRn1lypTZgce)（`GET /categories`、`GET /event/list` 等）。

本仓库集合 **`postman/collections/pm-ce-testnet-event-list.postman_collection.json`** 按 **prediction-serv 源码**（`CategoryController`、`EventController`、`MarketListReq`）重写，结构如下：

| 目录 | 接口 | 说明 |
|------|------|------|
| **00 Setup** | `/categories` | 从分类树解析叶子 `categoryId` / `categoryId2` 写入集合变量 |
| **A · GET /categories** | `/categories` | 契约、多语言 header、叶子字段、多余 query |
| **B · GET /event/list** | `/event/list` | 分页规整、状态/排序、分类筛选、热门/语言、异常 |

**不覆盖**：「约定为 GET 却用 POST」等非文档调用方式。

## 1. 分层思路

| 层级 | 内容 | 本仓库做法 |
|------|------|------------|
| **Setup** | 动态 `categoryId` | `00 Setup` 从 live 分类树取叶子 id |
| **契约** | HTTP 200、`ret_code`、`result` 壳、`Content-Type` | A 文件夹 + B01 |
| **分类 i18n** | `i18nName` 始终返回；`lang=en` 取 i18n JSON `en` key | A01、A02、A03 |
| **列表项结构** | `EventVo`；`markets[].rules=null`；`outcomes` key 无空格 | B01 |
| **体育分桶** | `sportsDisplayColumn` ∈ MONEYLINE/SPREADS/TOTALS/OTHER | B01（有数据时） |
| **参数规整** | `page`/`pageSize` 上下界 | B02 |
| **枚举** | `eventStatus` / `sortBy` 合法值与非法回退 | B03 |
| **分类** | `categoryId` / `categoryIds` / 逗号写法 / 同传优先级 | B04 |
| **业务** | `isHot`、`locale` | B05 |
| **异常** | 非法 `categoryId` / `categoryIds` 字符串 → **10001** | B06 `[err]` |

`categoryId` / `categoryIds` 无法绑定为 `Long` / `List<Long>` 时走 Spring 绑定异常，返回 **`ret_code` 10001**、`result=null`。

## 2. 集合变量与环境

- **`categoryId`** / **`categoryId2`**：由 `00 Setup` 自动写入；也可在 Environment 中手动覆盖。  
- **`baseUrl`**：testnet / staging / 本地网关分别建 Environment。  
- 集合级 prerequest 会为未带 `lang` 的请求补上 `zh-Hant`。

## 3. 仍可扩展的方向

- 多 `categoryIds` 不同 id 的并集与单 `categoryId` 结果对比（需稳定快照）。  
- 性能 SLA（Newman 外包一层 `timings` 统计）。  
- JSON Schema（`ajv`）固化 `EventVo` / `CategoryNodeVo`。

## 4. 运行

```bash
npm run pm:event-list
```

失败时查看 **`reports/newman-event-list.json`** 中 `run.failures`，或打开 **`reports/newman-summary-zh.html`**。

## 5. 中文 HTML 报告

`reports/newman-summary-zh.html` 在同一页汇总 `/categories` 与 `/event/list` 的用例数、断言与分节明细（见 `reports/README.md`）。
