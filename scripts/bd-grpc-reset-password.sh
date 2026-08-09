#!/usr/bin/env bash
# Admin 重置密码 gRPC（R-01 / 负例手工验收）
# 依赖：grpcurl
# 用法：
#   ./scripts/bd-grpc-reset-password.sh --user-id 1001 --password 'TempPass1A'
#   ./scripts/bd-grpc-reset-password.sh --user-id 0 --password 'TempPass1A'   # R-E02
set -euo pipefail

HOST="${GRPC_HOST:-127.0.0.1:9090}"
USER_ID=""
PASSWORD=""
PROTO="${PROTO_PATH:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --user-id) USER_ID="$2"; shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    --proto) PROTO="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 --user-id <id> --password <pwd> [--host host:port] [--proto path]"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$USER_ID" || -z "$PASSWORD" ]]; then
  echo "缺少 --user-id / --password" >&2
  exit 1
fi

if ! command -v grpcurl >/dev/null 2>&1; then
  echo "未安装 grpcurl，请先安装：brew install grpcurl" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -z "$PROTO" ]]; then
  CANDIDATES=(
    "$ROOT/../bd-management/bd-proto/src/main/proto/bd/placeholder.proto"
    "$HOME/IdeaProjects/bd-management/bd-proto/src/main/proto/bd/placeholder.proto"
  )
  for c in "${CANDIDATES[@]}"; do
    if [[ -f "$c" ]]; then PROTO="$c"; break; fi
  done
fi

if [[ -z "$PROTO" || ! -f "$PROTO" ]]; then
  echo "找不到 placeholder.proto，请传 --proto" >&2
  exit 1
fi

PAYLOAD=$(printf '{"bd_user_id":%s,"new_password":%s}' "$USER_ID" "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$PASSWORD")")

echo "→ bd.BdInternal/ResetPassword @ $HOST"
echo "  payload: $PAYLOAD"
grpcurl -plaintext -proto "$PROTO" -import-path "$(dirname "$PROTO")/.." \
  -d "$PAYLOAD" "$HOST" bd.BdInternal/ResetPassword
