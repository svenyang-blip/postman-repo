# Affiliate 自助佣金 MP 接口 · 业务功能测试

依据 Wiki [Affiliate 自助佣金设置 — MP 接口纵览](https://skyrocket.sg.larksuite.com/wiki/OIXuw7VQCiBX08kxqwYl2apEgWc) 与子文档，对 `ls_affliate_mp_go` 五个 Admin 接口做 **Cookie 鉴权** 的业务契约测试。

| 项目 | 说明 |
|------|------|
| 模块 | `ls_affliate_mp_go` |
| 路径前缀 | `/api/v1`（testnet 网关：`…/ls-affiliate-mp/papi/api/v1`） |
| 鉴权 | 浏览器 **Cookie**（`paas-testnet` + `BubbleAppCookie`）；`CheckLogin()` + `DetailFilter`（Profile 读写） |
| 统一响应 | `ret_code`、`ret_msg`、`result`、`token` |
| 测试代理商 | 环境变量 `affiliationId`（默认 `900483`） |
| 集合 | `postman/collections/ls-affiliate-commission.postman_collection.json` |

## 交付切片与能力对照（Wiki）

| 切片 | 接口 | 优先级 | 业务能力 |
|------|------|--------|----------|
| **G0** | Profile 查询 / 更新 | P0 | 自助开关、最高比例；无行默认 **开 + 50%** |
| **G3** | 覆盖 / 停用 / 日志 | P0 | share `5=Overridden` / `6=Disabled`；写 `setting_log` |
| — | 下级改佣审核 | — | **不在本 5 接口内**（沿用现网 `operation_records`） |

## 集合目录结构

| 目录 | Wiki 对齐 | 说明 |
|------|-----------|------|
| **00 Setup** | — | Cookie 环境、`affiliationId`、缓存 Profile 初始值、预取 `shareRelatedId` |
| **G0 · Profile 查询** | [Profile 查询](https://skyrocket.sg.larksuite.com/wiki/EobswiA28il8PgkCHF4lU7mrgJc) | 默认结构、已有行、缺参/权限 |
| **G0 · Profile 更新** | [Profile 更新](https://skyrocket.sg.larksuite.com/wiki/JkBMwwIkmiEdblkJuUXlHwrqg1e) | Upsert、关开关、边界、恢复 |
| **G3 · 操作日志** | [操作日志查询](https://skyrocket.sg.larksuite.com/wiki/ADZHwPm0yibwHokvXtSlpqAAg4f) | 分页、scope/action/display_status/日期 |
| **G3 · Admin 覆盖** | [Admin 覆盖](https://skyrocket.sg.larksuite.com/wiki/CYQHwSKNDijtBvkt7trl7HHhgHb) | 改比例、Overridden(5)、写 log |
| **G3 · Admin 停用** | [Admin 停用](https://skyrocket.sg.larksuite.com/wiki/EOykw8YkLiOZCvk4tlnlhxVhgHe) | Disabled(6)、写 log |
| **E2E · 业务流程** | PRD R08 | 更新 Profile → 覆盖 → 查日志 → 停用 |

## 业务用例矩阵

### G0 · Profile 查询 `GET /affiliate/commission_profile`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| P-Q01 | 无库行默认结构 | 目标 AID 无 `affiliate_commission_profile` 行 | GET `affiliation_id=AID` | `ret_code=0`；`exists=false`；`affiliation_id=AID`；`self_serve_enabled=1`；`max_commission_rate_e6=500000`；`max_commission_rate="50.0"` |
| P-Q02 | 已有 Profile | 库中已有完整 Profile | GET | `exists=true`；字段与库一致；含 `updated_by`、`created_at`/`updated_at`（若有） |
| P-Q03 | 缺 affiliation_id | 已登录 | GET 无 query | `ret_code` 为 `6`（无数据权限）或 `1001` |
| P-Q04 | 无数据权限 AID | BD 不可见代理商 | GET 其他 BD 的 AID | `ret_code=6` |
| P-Q05 | 响应壳字段 | 合法 AID | GET | 含 `ret_code`、`ret_msg`、`result`；`result` 含 Wiki `AffiliateCommissionProfile` 全字段 |

### G0 · Profile 更新 `POST /affiliate/commission_profile`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| P-U01 | 首次 Upsert 开启 | 无 Profile 行 | POST `self_serve_enabled=1`，`max_commission_rate_e6=500000` | `ret_code=0`；`exists=true`；回显请求值；Portal 可读新上限 |
| P-U02 | 关闭自助开关 | 已有 Profile | POST `self_serve_enabled=0` | `self_serve_enabled=0`；Portal 自助入口置灰（前端验收） |
| P-U03 | 调整 Admin 意向比例 | 已有 Profile | POST 带 `admin_set_share_rate_e6=100000` | 回显 `admin_set_share_rate_e6` / `admin_set_share_rate="10.0"` |
| P-U04 | 不传意向比例 | 已有 `admin_set_share_rate_e6` | POST 不带该字段 | 保留原 `admin_set_share_rate_e6` |
| P-U05 | 上限边界合法 | — | POST `max_commission_rate_e6=0` 与 `500000` | `ret_code=0` |
| P-U06 | 上限超界 | — | POST `max_commission_rate_e6=600000` | `ret_code=1001` |
| P-U07 | 非法开关值 | — | POST `self_serve_enabled=2` | `ret_code=1001` |
| P-U08 | 备注超长 | — | POST `remark` >512 字符 | `ret_code=1001` |
| P-U09 | 更新后查询一致 | P-U01 成功 | 紧接 GET Profile | GET 结果与 POST 回显一致 |

### G3 · 操作日志 `GET /affiliate/commission_setting/logs`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| L-Q01 | 按 AID 分页 | 有历史日志 | GET `affiliation_id`、`page=1`、`page_size=10` | `list` 数组；`page`/`page_size`/`total`；单条含 Wiki `CommissionSettingLogItem` 核心字段 |
| L-Q02 | scope + action 筛选 | 有 override 日志 | GET `scope=direct_client`、`action=override` | 每条 `scope`/`action` 匹配（有值时） |
| L-Q03 | display_status 筛选 | 有 overridden 记录 | GET `display_status=overridden` | 列表项 `display_status=overridden` |
| L-Q04 | 默认分页 | — | GET 仅 `page=1` | `page_size=20` |
| L-Q05 | page_size 上限 | — | GET `page_size=100` | `ret_code=0`；`page_size≤100` |
| L-Q06 | 全量软过滤 | Admin 有权限 | GET 不传 `affiliation_id` | `ret_code=0`；按权限返回列表 |
| L-Q07 | 日期范围 | — | GET `start_date`、`end_date` | `ret_code=0`；结果在日期范围内（有数据时） |

### G3 · Admin 覆盖 `POST /affiliate/commission_setting/override`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| O-01 | 覆盖可操作 share | share 状态 Approve 或 Overridden | POST `related_id` + `rate_after_e6` | `action=override`；`share_status=5`；`display_status=overridden`；`rate_after_e6` 为请求值；`rate_before_e6` 为变更前 |
| O-02 | 指定生效日 | 可操作 share | POST `effective_start=yyyy-MM-dd` | `ret_code=0`；share `effected_at` 对齐（库表验收） |
| O-03 | 非法比例 | — | POST `rate_after_e6=600000` | `ret_code=1001` |
| O-04 | 非法日期格式 | — | POST `effective_start=2026/07/28` | `ret_code=1001` |
| O-05 | 缺 affiliation_id | — | POST 无 `affiliation_id` | `ret_code=1001` |
| O-06 | 无可操作 share | 无 Approve/Overridden share | POST | `ret_code=3`（未找到） |
| O-07 | 写审计日志 | O-01 成功 | GET logs `action=override` | 存在对应 `affiliation_id` 的 override 日志；`operator_role=admin` |

### G3 · Admin 停用 `POST /affiliate/commission_setting/disable`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| D-01 | 停用已覆盖 share | O-01 成功后 | POST `related_id` + `remark` | `action=disable`；`share_status=6`；`display_status=disabled` |
| D-02 | 缺 affiliation_id | — | POST 无 `affiliation_id` | `ret_code=1001` |
| D-03 | 无可操作 share | 无可用 share | POST | `ret_code=3` 或跳过（依赖数据） |
| D-04 | 写审计日志 | D-01 成功 | GET logs `action=disable` | 存在 disable 日志 |

### E2E · 业务流程（R08 Admin 配置台）

| ID | 流程 | 步骤 | 业务验收点 |
|----|------|------|------------|
| F-01 | 配置 + 干预闭环 | Profile 开启 → 覆盖 → 查 override 日志 → 停用 → 查 disable 日志 | share 状态链 `Approve/Overridden→Overridden(5)→Disabled(6)`；日志 `action` 连续可追溯 |
| F-02 | Profile 往返 | GET 默认/已有 → POST 修改 → GET 校验 → POST 恢复 Setup 缓存值 | MP 详情页展示与 API 一致 |

## 运行

```bash
cp postman/environments/ls-affiliate-mp-testnet.private.postman_environment.example.json \
   postman/environments/ls-affiliate-mp-testnet.private.postman_environment.json
# 填入 adminCookie（DevTools → Cookie 整段）

npm run pm:ls-affiliate-commission:testnet
```

报告：`reports/controllers/ls-affiliate-commission-testnet.html`

## 接口清单

| # | 方法 | 路径 |
|---|------|------|
| 1 | GET | `/affiliate/commission_profile` |
| 2 | POST | `/affiliate/commission_profile` |
| 3 | POST | `/affiliate/commission_setting/override` |
| 4 | POST | `/affiliate/commission_setting/disable` |
| 5 | GET | `/affiliate/commission_setting/logs` |
