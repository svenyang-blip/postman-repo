# BD Management · 登录 / Admin 重置密码 · 场景测试

依据 `bd-management` 源码与 [`docs/api/01-auth.md`](../../bd-management/docs/api/01-auth.md)，对 **HTTP 登录** 与 **内部 gRPC 重置密码** 做场景契约测试。

| 项目 | 说明 |
|------|------|
| 模块 | `bd-management`（`LoginController` / `BdInternalGrpcService`） |
| 登录 | `POST /api/v1/login`（匿名；本地 `allow-plain-data=true` 可传明文 JSON 字符串） |
| 重置密码 | gRPC `bd.BdInternal/ResetPassword`（默认 `:9090`，不对公网 HTTP 暴露） |
| 统一响应（HTTP） | `ret_code` / `ret_msg` / `result` / `token` / `time_now` |
| 业务错误码 | `AUTH_FAILED=20101`、`LOGIN_DISABLED=20102`、`BD_USER_NOT_FOUND=20105` |
| 集合 | `postman/collections/bd-auth-login-reset.postman_collection.json` |
| 环境 | `postman/environments/bd-management-local.postman_environment.json` |

## 集合目录结构

| 目录 | 说明 |
|------|------|
| **00 Setup** | 校验环境变量；可选探活 |
| **A · Login 正向 [ok]** | 正确账密、响应壳、`mustChangePassword` |
| **B · Login 异常 [err]** | 缺参、错密、用户不存在等 |
| **C · ResetPassword 效果 [ok]** | gRPC 重置后 HTTP 登录验收（`mustChangePassword=true`） |
| **D · E2E 流程** | 登录 → ping → logout；改密后旧 token 失效 |

> **说明**：Newman 只跑 HTTP。gRPC 负例 / 正例调用见下文「gRPC 场景」与 `scripts/bd-grpc-reset-password.sh`；C 目录用「先 grpcurl 再 login」验收业务结果。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `apiBase` | `http://127.0.0.1:8080` | HTTP |
| `grpcHost` | `127.0.0.1:9090` | gRPC（plaintext） |
| `bdEmail` / `bdPassword` / `brokerId` | 需填 | 可登录测试账号 |
| `bdUserId` | 需填 | 与上账号对应的 `bd_users.id`（重置用） |
| `tempPassword` | `TempPass1A` | 重置后的临时密码（满足 8–50 + 大小写数字） |
| `disabledEmail` / `loginDisabledEmail` | 空 | 可选：用户禁用 / 登录停用账号；空则对应用例 skip |

本地需 `application-dev`：`app.auth.allow-plain-data=true`、`captcha-enabled=false`。

---

## 业务用例矩阵

### A · 登录正向 `POST /api/v1/login`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| L-01 | 正确账密登录 | 用户 `status=1`、auth 正常、密码正确 | POST `data`=明文 `{email,password,broker_id}` | `ret_code=0`；`result.token` 与顶层 `token` 同值非空；缓存 `accessToken` |
| L-02 | 响应壳字段 | L-01 成功 | 同 L-01 | 含 `ret_code`/`ret_msg`/`result`/`time_now`；`result` 含 `token`、`mustChangePassword`（boolean） |
| L-03 | 强制改密标记 | 账号 `must_change_password=1`（可由 R-01 预置） | POST 正确账密 | `ret_code=0`；`result.mustChangePassword=true` |

### B · 登录异常 `POST /api/v1/login`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| L-E01 | 缺 data | — | POST `{}` 或无 `data` | HTTP 200；`ret_code=20101` |
| L-E02 | data 非 JSON | — | POST `data="not-json"` | `ret_code=20101` |
| L-E03 | 缺 email/password | — | POST `data={"broker_id":1}` | `ret_code=20101` |
| L-E04 | 邮箱不存在 | — | POST 随机邮箱 | `ret_code=20101` |
| L-E05 | 密码错误 | 邮箱存在 | POST 错误密码 | `ret_code=20101`；无顶层有效业务 token |
| L-E06 | 用户禁用 | `status≠1` 账号（`disabledEmail`） | POST | `ret_code=20101`；未配账号则 skip |
| L-E07 | 登录停用 | `login_disabled=1`（`loginDisabledEmail`） | POST | `ret_code=20102`；未配账号则 skip |

### C · Admin 重置密码 gRPC `bd.BdInternal/ResetPassword`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| R-01 | 重置成功 | 合法 `bd_user_id` + 强密码 | gRPC ResetPassword | `must_change_password=true`；库 `must_change_password=1` |
| R-02 | 重置后登录须改密 | R-01 成功 | HTTP 用 `tempPassword` 登录 | `ret_code=0`；`mustChangePassword=true` |
| R-03 | 旧 JWT 失效 | R-01 前已登录拿到旧 token | 重置后再用旧 Bearer 调需鉴权接口 | `ret_code` 为未登录类（如 `10007`/`20100`/`20104`） |
| R-E01 | 用户不存在 | `bd_user_id` 不存在 | gRPC | `NOT_FOUND` |
| R-E02 | id≤0 | `bd_user_id=0` | gRPC | `NOT_FOUND` |
| R-E03 | 空密码 | `new_password=""` | gRPC | `INVALID_ARGUMENT` |
| R-E04 | 弱密码 | `new_password="weak"` | gRPC | `INVALID_ARGUMENT` |

### D · E2E

| ID | 流程 | 步骤 | 业务验收点 |
|----|------|------|------------|
| F-01 | 登录会话 | login → `GET /api/v1/bd-users/ping` → logout → 再 ping | ping 成功 `result=bd-auth`；logout 后鉴权失败 |
| F-02 | 改密闭环 | login → `change_password` → 旧 token ping 失败 → 新密 login | 改密 `ret_code=0`；旧 JWT 失效；新密可登录且 `mustChangePassword=false` |

---

## gRPC 调用示例（R-01 / 负例）

```bash
# 正例 R-01
./scripts/bd-grpc-reset-password.sh \
  --host 127.0.0.1:9090 \
  --user-id "$BD_USER_ID" \
  --password 'TempPass1A'

# 或 grpcurl 直调（需安装 grpcurl）
grpcurl -plaintext \
  -proto /path/to/bd-management/bd-proto/src/main/proto/bd/placeholder.proto \
  -d '{"bd_user_id":1001,"new_password":"TempPass1A"}' \
  127.0.0.1:9090 bd.BdInternal/ResetPassword
```

负例将 `-d` 换成对应 payload，断言 gRPC status：`NOT_FOUND` / `INVALID_ARGUMENT`。

---

## 运行

```bash
cd /path/to/postman-repo
# 编辑环境：填入 bdEmail / bdPassword / brokerId / bdUserId
npm run pm:bd-auth:local
```

可选：先执行 `scripts/bd-grpc-reset-password.sh` 再跑集合（覆盖 L-03 / R-02）。

报告：`reports/controllers/bd-auth-local.html`

## 接口清单

| # | 方式 | 路径 / 方法 |
|---|------|-------------|
| 1 | POST | `/api/v1/login` |
| 2 | POST | `/api/v1/logout` |
| 3 | POST | `/api/v1/change_password` |
| 4 | GET | `/api/v1/bd-users/ping` |
| 5 | gRPC | `bd.BdInternal/ResetPassword` |
