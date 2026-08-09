#!/usr/bin/env bash
# gRPC CreateBdAccount（CA-01 等）
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=bd-grpc-common.sh
source "$SCRIPT_DIR/bd-grpc-common.sh"

HOST="${GRPC_HOST:-127.0.0.1:9090}"
NAME=""
EMAIL=""
ROLE="manager"
REGION="kr"
PARENT_ID="0"
INITIAL_PASSWORD="Passw0rd"
MUST_CHANGE="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; GRPC_HOST="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --role) ROLE="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --parent-id) PARENT_ID="$2"; shift 2 ;;
    --password) INITIAL_PASSWORD="$2"; shift 2 ;;
    --must-change) MUST_CHANGE="$2"; shift 2 ;;
    -h|--help)
      cat <<'EOF'
Usage: bd-grpc-create-account.sh --name <n> --email <e> [options]
  --role bd|manager     (default: manager)
  --region kr|non_kr    (default: kr)
  --parent-id <id>      (default: 0)
  --password <pwd>      (default: Passw0rd)
  --must-change true|false
EOF
      exit 0
      ;;
    *) echo "Unknown: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$NAME" || -z "$EMAIL" ]]; then
  echo "缺少 --name / --email" >&2
  exit 1
fi

PAYLOAD=$(bd_grpc_payload_create_account "$NAME" "$EMAIL" "$ROLE" "$REGION" "$PARENT_ID" "$INITIAL_PASSWORD" "$MUST_CHANGE")

echo "→ bd.BdInternal/CreateBdAccount @ $HOST"
echo "  payload: $PAYLOAD"
bd_grpc_call CreateBdAccount "$PAYLOAD"
