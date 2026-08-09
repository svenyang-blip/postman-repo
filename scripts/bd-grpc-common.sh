#!/usr/bin/env bash
# 共用：解析 proto 路径、grpcurl 调用
set -euo pipefail

bd_grpc_resolve_proto() {
  local proto="${PROTO_PATH:-}"
  if [[ -n "$proto" && -f "$proto" ]]; then
    echo "$proto"
    return
  fi
  local root
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  local candidates=(
    "$root/../bd-management/bd-proto/src/main/proto/bd/placeholder.proto"
    "$HOME/IdeaProjects/bd-management/bd-proto/src/main/proto/bd/placeholder.proto"
  )
  for c in "${candidates[@]}"; do
    if [[ -f "$c" ]]; then
      echo "$c"
      return
    fi
  done
  echo "找不到 placeholder.proto，请设置 PROTO_PATH 或传 --proto" >&2
  return 1
}

bd_grpc_call() {
  local method="$1"
  local payload="$2"
  local host="${GRPC_HOST:-127.0.0.1:9090}"
  local proto
  proto="$(bd_grpc_resolve_proto)"
  local import_path
  import_path="$(dirname "$proto")/.."
  if ! command -v grpcurl >/dev/null 2>&1; then
    echo "未安装 grpcurl：brew install grpcurl" >&2
    return 1
  fi
  grpcurl -plaintext -proto "$proto" -import-path "$import_path" \
    -d "$payload" "$host" "bd.BdInternal/$method"
}

bd_grpc_expect_ok() {
  local method="$1"
  local payload="$2"
  local out
  if ! out="$(bd_grpc_call "$method" "$payload" 2>&1)"; then
    echo "FAIL $method: $out" >&2
    return 1
  fi
  echo "$out"
}

bd_grpc_expect_fail() {
  local method="$1"
  local payload="$2"
  local expect_substr="${3:-}"
  local out code
  set +e
  out="$(bd_grpc_call "$method" "$payload" 2>&1)"
  code=$?
  set -e
  if [[ $code -eq 0 ]]; then
    echo "FAIL $method: expected error but got success: $out" >&2
    return 1
  fi
  if [[ -n "$expect_substr" ]]; then
    if ! OUT="$out" PATTERN="$expect_substr" python3 - <<'PY'
import os, sys
out = os.environ.get("OUT", "")
pattern = os.environ.get("PATTERN", "")
norm_out = out.replace("_", "").lower()
for alt in (p.strip() for p in pattern.split("|") if p.strip()):
    if alt.lower() in out.lower():
        sys.exit(0)
    if alt.replace("_", "").lower() in norm_out:
        sys.exit(0)
sys.exit(1)
PY
    then
      echo "FAIL $method: output missing '$expect_substr': $out" >&2
      return 1
    fi
  fi
  echo "OK $method expected failure"
}

# 通过环境变量安全构建 JSON（避免 python3 -c 多行/空格问题）
bd_grpc_payload_create_account() {
  export _BD_NAME="${1:-}"
  export _BD_EMAIL="${2:-}"
  export _BD_ROLE="${3:-manager}"
  export _BD_REGION="${4:-kr}"
  export _BD_PARENT_ID="${5:-0}"
  export _BD_PASSWORD="${6:-Passw0rd}"
  export _BD_MUST_CHANGE="${7:-false}"
  python3 - <<'PY'
import json, os
print(json.dumps({
    "name": os.environ["_BD_NAME"],
    "email": os.environ["_BD_EMAIL"],
    "role": os.environ["_BD_ROLE"],
    "region": os.environ["_BD_REGION"],
    "parent_id": int(os.environ.get("_BD_PARENT_ID") or "0"),
    "initial_password": os.environ.get("_BD_PASSWORD") or "Passw0rd",
    "must_change_password": os.environ.get("_BD_MUST_CHANGE", "false").lower() == "true",
}))
PY
}

bd_grpc_payload_update_account() {
  export _BD_USER_ID="${1:-}"
  export _BD_NAME="${2:-}"
  export _BD_ROLE="${3:-}"
  export _BD_REGION="${4:-}"
  export _BD_PARENT_ID="${5:-}"
  export _BD_LOGIN_DISABLED="${6:-}"
  python3 - <<'PY'
import json, os
d = {"bd_user_id": int(os.environ["_BD_USER_ID"])}
if os.environ.get("_BD_NAME"):
    d["name"] = os.environ["_BD_NAME"]
if os.environ.get("_BD_ROLE"):
    d["role"] = os.environ["_BD_ROLE"]
if os.environ.get("_BD_REGION"):
    d["region"] = os.environ["_BD_REGION"]
if os.environ.get("_BD_PARENT_ID"):
    d["parent_id"] = int(os.environ["_BD_PARENT_ID"])
if os.environ.get("_BD_LOGIN_DISABLED") != "":
    d["login_disabled"] = int(os.environ["_BD_LOGIN_DISABLED"])
print(json.dumps(d))
PY
}

# grpcurl 默认 JSON 为 camelCase（userId）；部分工具为 snake_case（user_id）
bd_grpc_json_pick() {
  local json="$1"
  shift
  JSON="$json" KEYS="$*" python3 - <<'PY'
import json, os, sys
raw = os.environ.get("JSON", "").strip()
keys = os.environ.get("KEYS", "").split()
if not raw:
    sys.exit(0)
try:
    d = json.loads(raw)
except json.JSONDecodeError:
    sys.exit(0)
for k in keys:
    v = d.get(k)
    if v is not None and str(v) not in ("", "0"):
        print(v)
        break
PY
}
