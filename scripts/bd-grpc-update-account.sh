#!/usr/bin/env bash
# gRPC UpdateBdAccount（UA-01 等）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=bd-grpc-common.sh
source "$SCRIPT_DIR/bd-grpc-common.sh"

HOST="${GRPC_HOST:-127.0.0.1:9090}"
USER_ID=""
NAME=""
ROLE=""
REGION=""
PARENT_ID=""
LOGIN_DISABLED=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; GRPC_HOST="$2"; shift 2 ;;
    --user-id) USER_ID="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --role) ROLE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --parent-id) PARENT_ID="$2"; shift 2 ;;
    --login-disabled) LOGIN_DISABLED="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: bd-grpc-update-account.sh --user-id <id> [--name] [--role] [--region] [--parent-id] [--login-disabled 0|1]"
      exit 0
      ;;
    *) echo "Unknown: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$USER_ID" ]]; then
  echo "缺少 --user-id" >&2
  exit 1
fi

PAYLOAD=$(bd_grpc_payload_update_account "$USER_ID" "$NAME" "$ROLE" "$REGION" "$PARENT_ID" "$LOGIN_DISABLED")

echo "→ bd.BdInternal/UpdateBdAccount @ $HOST"
echo "  payload: $PAYLOAD"
bd_grpc_call UpdateBdAccount "$PAYLOAD"
