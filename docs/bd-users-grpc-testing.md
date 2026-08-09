# BD Management · CreateBdAccount / UpdateBdAccount · 场景测试

依据 `bd-management` 内部 gRPC `bd.BdInternal` 与 HTTP `/api/v1/bd-users` 权限边界。

| 项目 | 说明 |
|------|------|
| gRPC 创建 | `bd.BdInternal/CreateBdAccount`（**Manager 必须走 gRPC**） |
| gRPC 编辑 | `bd.BdInternal/UpdateBdAccount`（含 `login_disabled`） |
| HTTP | Manager 仅可创建/编辑本区域 **BD**；`role=manager` 返回 `permission denied` |
| 集合 | `postman/collections/bd-bd-users-grpc.postman_collection.json` |
| 环境 | `postman/environments/bd-management-local.postman_environment.json` |

## 集合目录

| 目录 | 场景 ID | 说明 |
|------|---------|------|
| **00 Setup** | — | Manager 登录、缓存 `managerToken` |
| **A · HTTP Manager** | H-01~H-04 | HTTP 创建 BD、禁止创建 Manager |
| **B · gRPC CreateBdAccount 验收** | CA-02~CA-03 | 依赖 `scripts/bd-grpc-account-scenarios.sh` 写入的 `grpcCreated*` |
| **C · gRPC UpdateBdAccount 验收** | UA-03~UA-05 | 改名 / 停用登录 / 恢复 |
| **D · HTTP 权限边界** | H-E01~H-E02 | HTTP 不可编辑 Manager |

## 业务用例矩阵

### CreateBdAccount `bd.BdInternal/CreateBdAccount`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| CA-01 | 创建韩国 Manager | 邮箱未占用 | gRPC `role=manager, region=kr` | `user_id>0`；`user_role=MANAGER_KR`；`region=KR`；回传 `initial_password` |
| CA-02 | 新账号可登录 | CA-01 成功 | HTTP `POST /login` | `ret_code=0`；签发 token |
| CA-03 | /me 角色一致 | CA-02 成功 | `GET /bd-users/me` | `user_role=MANAGER_KR`；`email` 匹配 |
| CA-04 | 创建 Global Manager | — | `region=non_kr` | `user_role=MANAGER_GLOBAL`；`region=NON_KR` |
| CA-05 | 创建 BD（gRPC） | — | `role=bd, region=kr` | `user_role=BD` |
| CA-E01 | 重复邮箱 | 邮箱已存在 | gRPC 同邮箱 | gRPC `INVALID_ARGUMENT` / already exists |
| CA-E02 | 弱密码 | — | `initial_password=weak` | `INVALID_ARGUMENT` |
| CA-E03 | 缺 name/email | — | 空 body 字段 | `INVALID_ARGUMENT` |

### UpdateBdAccount `bd.BdInternal/UpdateBdAccount`

| ID | 场景 | Given | When | Then |
|----|------|-------|------|------|
| UA-01 | 改名 | 用户存在 | gRPC `name` | 响应 `bd_user_id`；HTTP `/me` 名称更新 |
| UA-02 | 停用登录 | 用户存在 | `login_disabled=1` | gRPC 成功；HTTP login `ret_code=20102` |
| UA-03 | 恢复登录 | UA-02 后 | `login_disabled=0` | login 恢复 `ret_code=0` |
| UA-04 | 改角色/区域 | Manager 账号 | `role`+`region` | 响应 `user_role`/`region` 更新 |
| UA-E01 | 用户不存在 | — | `bd_user_id=999999999` | `NOT_FOUND` |
| UA-E02 | id 无效 | — | `bd_user_id=0` | `INVALID_ARGUMENT` |
| UA-E03 | login_disabled 非法 | — | `login_disabled=2` | `INVALID_ARGUMENT` |

### HTTP 权限（对照）

| ID | 场景 | When | Then |
|----|------|------|------|
| H-01 | Manager 创建 BD | `POST /bd-users` `role=bd` | `ret_code=0`；`user_role=BD` |
| H-E01 | HTTP 创建 Manager | `role=manager` | `ret_code=10005` permission denied |
| H-E02 | HTTP 编辑 Manager | `PUT /bd-users/{mgrId}` | `ret_code=10005` |

## 排错

### `CreateBdAccount` → `create bd_users failed`

多为 MyBatis `insertSelective` 未配置 `useGeneratedKeys`，插入成功但未回填 `id`。已在 `BdUsersMapper.xml` 修复；**重启 bd-serv** 后重试：

```bash
./scripts/bd-grpc-account-scenarios.sh
```

若仍失败，确认 MySQL 可连、表 `bd_users` / `bd_user_auth` 存在，且 dev 种子账号能登录。

## 运行

```bash
cd postman-repo

# 1) gRPC 场景（写 grpcCreated* 到环境）
chmod +x scripts/bd-grpc-*.sh
./scripts/bd-grpc-account-scenarios.sh

# 2) HTTP 验收（Newman）
npm run pm:bd-users-grpc:local
```

单条 gRPC：

```bash
./scripts/bd-grpc-create-account.sh \
  --name "Manager KR 2" --email "mgr.kr2@zoomex.com" \
  --role manager --region kr

./scripts/bd-grpc-update-account.sh \
  --user-id 2 --name "Renamed" --login-disabled 0
```

Postman Desktop：Import proto `bd-management/bd-proto/.../placeholder.proto` → `127.0.0.1:9090` → 选 `CreateBdAccount` / `UpdateBdAccount`。

报告：`reports/controllers/bd-bd-users-grpc-local.html`

## dev 种子账号

| 邮箱 | 角色 | 密码 |
|------|------|------|
| `mgr.global@zoomex.com` | MANAGER_GLOBAL | Passw0rd |
| `mgr.kr@zoomex.com` | MANAGER_KR | Passw0rd |
| `aiden@zoomex.com` | BD | Passw0rd |
