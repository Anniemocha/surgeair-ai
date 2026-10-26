#!/usr/bin/env bash
# Run manually using your own AWS login. Never invoked by the application.
set -euo pipefail
umask 077

ZIP="${1:-artifacts/api-server/agentcore-output/surgeair-agentcore.zip}"
PROFILE="${2:-}"
REGION="eu-north-1"
RUNTIME_ID="surgeair_ai_agent-YzOD6XHzSm"
BUCKET="bedrock-agentcore-runtime-661406599883-eu-north-1-1ihjkds6uu"
for tool in aws jq sha256sum; do command -v "$tool" >/dev/null || { echo "Missing command: $tool" >&2; exit 1; }; done
test -f "$ZIP" || { echo "ZIP not found: $ZIP" >&2; exit 1; }
AWS_ARGS=(--region "$REGION" --no-cli-pager)
if [[ -n "$PROFILE" ]]; then AWS_ARGS+=(--profile "$PROFILE"); fi
aws_cli() { aws "${AWS_ARGS[@]}" "$@"; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
echo "Deploying identity:"
aws_cli sts get-caller-identity --query Arn --output text
aws_cli bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id "$RUNTIME_ID" > "$WORK/current.json"
jq -e '.agentRuntimeArtifact.codeConfiguration.runtime == "NODE_22"
  and .agentRuntimeArtifact.codeConfiguration.entryPoint == ["app.js"]' \
  "$WORK/current.json" >/dev/null || { echo "Unexpected runtime configuration; stopped." >&2; exit 1; }
aws_cli bedrock-agentcore-control update-agent-runtime \
  --generate-cli-skeleton input > "$WORK/skeleton.json"
HASH="$(sha256sum "$ZIP" | cut -d ' ' -f 1)"
KEY="surgeair-updates/${HASH}.zip"
echo "Target: $RUNTIME_ID ($REGION)"
echo "New object: s3://$BUCKET/$KEY"
read -r -p "Type DEPLOY to upload the ZIP and update this runtime: " CONFIRM
[[ "$CONFIRM" == "DEPLOY" ]] || { echo "Stopped without AWS changes."; exit 1; }

aws_cli s3api put-object --bucket "$BUCKET" --key "$KEY" \
  --body "$ZIP" > "$WORK/upload.json"
# Retain all existing settings accepted by the installed CLI. Do not print
# current.json/update.json: environmentVariables can contain sensitive values.
jq --slurpfile schema "$WORK/skeleton.json" --slurpfile upload "$WORK/upload.json" \
  --arg id "$RUNTIME_ID" --arg bucket "$BUCKET" --arg key "$KEY" '
  with_entries(select(.value != null and (.key as $name | $schema[0] | has($name))))
  | .agentRuntimeId = $id
  | .agentRuntimeArtifact.codeConfiguration.code.s3 =
      ({bucket: $bucket, prefix: $key}
       + (if $upload[0].VersionId then {versionId: $upload[0].VersionId} else {} end))
  ' "$WORK/current.json" > "$WORK/update.json"
aws_cli bedrock-agentcore-control update-agent-runtime \
  --cli-input-json "file://$WORK/update.json" > "$WORK/result.json"
VERSION="$(jq -r '.agentRuntimeVersion' "$WORK/result.json")"
echo "Created runtime version $VERSION. Waiting for READY..."
for ((attempt=0; attempt<60; attempt++)); do
  STATUS="$(aws_cli bedrock-agentcore-control get-agent-runtime \
    --agent-runtime-id "$RUNTIME_ID" --agent-runtime-version "$VERSION" \
    --query status --output text)"
  case "$STATUS" in
    READY) echo "Runtime version $VERSION is READY. No SMS, email, or model calls were made by this script."; exit 0 ;;
    *FAILED*) echo "Runtime status: $STATUS. Inspect runtime diagnostics." >&2; exit 1 ;;
  esac
  sleep 10
done
echo "Timed out waiting for READY; inspect runtime status before retrying." >&2
exit 1
