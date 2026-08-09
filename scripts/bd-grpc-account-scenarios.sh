#!/usr/bin/env bash
# CreateBdAccount / UpdateBdAccount gRPC 场景（CA-* / UA-* / 负例）
# 成功后将 grpcCreated* 写入 Postman 环境，供 HTTP 验收集合使用
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=bd-grpc-common.sh
source "$SCRIPT_DIR/bd-grpc-common.sh"

ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../postman/environments/bd-management-local.postman_environment.json}"
TS="$(date +%s)"
CREATE_EMAIL="mgr.grpc.${TS}@zoomex.com"
CREATE_NAME="Manager GRPC ${TS}"

patch_env() {
  local key="$1"
  local value="$2"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "环境文件不存在: $ENV_FILE" >&2
    return 1
  fi
  ENV_FILE="$ENV_FILE" KEY="$key" VAL="$value" python3 - <<'PY'
import json, os
path = os.environ["ENV_FILE"]
key = os.environ["KEY"]
val = os.environ["VAL"]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
for item in data.get("values", []):
    if item.get("key") == key:
        item["value"] = val
        break
else:
    data.setdefault("values", []).append({"key": key, "value": val, "type": "default", "enabled": True})
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
PY
}

echo "=== CA-01 CreateBdAccount 创建韩国 Manager ==="
CREATE_PAYLOAD=$(bd_grpc_payload_create_account "$CREATE_NAME" "$CREATE_EMAIL" manager kr 0 Passw0rd false)
CREATE_RESP=$(bd_grpc_expect_ok CreateBdAccount "$CREATE_PAYLOAD")
USER_ID=$(bd_grpc_json_pick "$CREATE_RESP" user_id userId)
echo "$CREATE_RESP"
if [[ -z "$USER_ID" || "$USER_ID" == "0" ]]; then
  echo "FAIL: user_id empty (parsed from userId/user_id)" >&2
  exit 1
fi
patch_env grpcCreatedEmail "$CREATE_EMAIL"
CREATED_PWD=$(bd_grpc_json_pick "$CREATE_RESP" initial_password initialPassword)
patch_env grpcCreatedPassword "${CREATED_PWD:-Passw0rd}"
patch_env grpcCreatedUserId "$USER_ID"
patch_env grpcCreatedName "$CREATE_NAME"
CREATED_ROLE=$(bd_grpc_json_pick "$CREATE_RESP" user_role userRole)
patch_env grpcCreatedRole "${CREATED_ROLE:-MANAGER_KR}"
CREATED_REGION=$(bd_grpc_json_pick "$CREATE_RESP" region)
patch_env grpcCreatedRegion "${CREATED_REGION:-KR}"

echo "=== CA-E01 重复邮箱 ==="
DUP_PAYLOAD=$(bd_grpc_payload_create_account "Dup" "$CREATE_EMAIL" manager kr)
bd_grpc_expect_fail CreateBdAccount "$DUP_PAYLOAD" "already exists"

echo "=== CA-E02 弱密码 ==="
bd_grpc_expect_fail CreateBdAccount '{"name":"X","email":"weak@zoomex.com","role":"manager","region":"kr","initial_password":"weak"}' "password"

echo "=== CA-E03 缺 name/email ==="
bd_grpc_expect_fail CreateBdAccount '{"role":"manager","region":"kr"}' "required"

echo "=== UA-01 UpdateBdAccount 改名 ==="
RENAMED="Manager GRPC Renamed ${TS}"
UPDATE_PAYLOAD=$(bd_grpc_payload_update_account "$USER_ID" "$RENAMED")
UPDATE_RESP=$(bd_grpc_expect_ok UpdateBdAccount "$UPDATE_PAYLOAD")
echo "$UPDATE_RESP"
patch_env grpcUpdatedName "$RENAMED"

echo "=== UA-02 UpdateBdAccount 停用登录 ==="
DISABLE_PAYLOAD=$(bd_grpc_payload_update_account "$USER_ID" "" "" "" "" 1)
bd_grpc_expect_ok UpdateBdAccount "$DISABLE_PAYLOAD" >/dev/null
patch_env grpcLoginDisabled "1"

echo "=== UA-E01 用户不存在 ==="
bd_grpc_expect_fail UpdateBdAccount '{"bd_user_id":999999999,"name":"x"}' "NOT_FOUND|bd user not found"

echo "=== UA-E02 bd_user_id 无效 ==="
bd_grpc_expect_fail UpdateBdAccount '{"bd_user_id":0,"name":"x"}' "required|InvalidArgument|invalid"

echo "=== UA-03 恢复登录（供后续 HTTP 可选） ==="
ENABLE_PAYLOAD=$(bd_grpc_payload_update_account "$USER_ID" "" "" "" "" 0)
bd_grpc_expect_ok UpdateBdAccount "$ENABLE_PAYLOAD" >/dev/null
patch_env grpcLoginDisabled "0"

echo "=== gRPC 场景完成；已写入环境: $ENV_FILE ==="
