# AgentCore runtime: contract and manual update

## Verified deployment facts

Read-only `GetAgentRuntime` on 2026-10-26 reported runtime
`surgeair_ai_agent-YzOD6XHzSm`, region `eu-north-1`, version **3**, status
**READY**, Node **NODE_22**, entry point **app.js**, HTTP protocol and public
network mode.

Its ZIP is:

```text
s3://bedrock-agentcore-runtime-661406599883-eu-north-1-1ihjkds6uu/1790003435921-x1dczu-surgeair-agentcore.zip
```

The application IAM user cannot read that object (`s3:GetObject` is denied).
Consequently the deployed source, exact input contract, and byte-for-byte
comparison with the updated local package **cannot be independently verified
using the application's current permissions**.

The deployed runtime rejects the app's capability probe with:

```text
RuntimeClientError: Received error (400) from runtime. Please check your CloudWatch logs for more information.
```

The API response is HTTP 424, wrapping the runtime's HTTP 400. That establishes
an incompatible or failing capability endpoint, not the underlying source
error. The updated local handler accepts this probe.

## Legacy contract versus the current app

The legacy source retained in local Git history expects passenger text, e.g.:

```json
{"message":"Arrive before 18:00"}
```

That local legacy handler also accepts a JSON string, `prompt`, `text`,
`inputText`, or recursively nested `input`. With no passenger message it throws
`Invocation must include a passenger message.` This is the **local legacy
contract**, not an independently confirmed extraction of the deployed ZIP.
It can execute booking actions; do not remove the safety probe to accommodate it.

The running app first sends exactly:

```json
{"mode":"capabilities"}
```

The updated local runtime returns:

```json
{"mode":"capabilities","protocolVersion":1,"interpretationOnly":true}
```

Only after that succeeds does the app send passenger turns:

```json
{
  "mode": "interpret",
  "message": "Arrive before 18:00",
  "context": {
    "passengerName": "<active passenger name>",
    "bookingReference": "SG4821",
    "currentFlight": "SA204",
    "origin": "LIS",
    "destination": "EDI",
    "disruptionStatus": "Delayed",
    "presentedAlternatives": [],
    "selectedFlight": null,
    "confirmationStatus": "Not requested"
  }
}
```

The context values are taken from the active booking/turn; the example is not a
fixed passenger record. `presentedAlternatives` is the current request's list.
The runtime session ID and `DEFAULT` qualifier are invocation API fields,
**not JSON payload fields**. The new mode returns interpretation only; the API
retains booking authority. Today the failed probe means no interpret-mode
payload reaches the deployed runtime.

## Shortest safe update

These are **manual instructions**. No AWS updates were performed while preparing
them.

1. Build in the project checkout:

   ```bash
   pnpm --filter @workspace/api-server run build:agentcore
   ```

2. Use a current AWS CLI v2, `jq`, and `sha256sum` in a terminal authenticated
   with **your own deployment login**. Do not use the app's AWS credentials.
   If using IAM Identity Center locally:

   ```bash
   aws sso login --profile YOUR_DEPLOY_PROFILE
   bash scripts/deploy-agentcore.sh \
     artifacts/api-server/agentcore-output/surgeair-agentcore.zip \
     YOUR_DEPLOY_PROFILE
   ```

   Alternatively, copy the ZIP and `scripts/deploy-agentcore.sh` to your AWS
   CloudShell, which already uses your console identity:

   ```bash
   bash deploy-agentcore.sh ./surgeair-agentcore.zip
   ```

3. Verify the identity printed by the script, then type `DEPLOY`. It uploads a
   new content-addressed object, preserves the existing runtime settings and
   execution role, updates the runtime, and waits for the new version to become
   `READY`. The existing `DEFAULT` endpoint follows the latest runtime version;
   no endpoint creation, runtime creation, or role creation is needed.

The script does not invoke the runtime, send SMS/email, or publish the web app.
After deployment, a single capability-only invocation can verify protocol
support before another live conversation.

Use Reset Demo when you are ready to test a fresh conversation; it allocates a
new runtime session and automatically sends a real disruption simulator SMS.

## Minimum deployment-login policy

Attach to **your deploying user/role**, not automatically to
`surgeair-sms-replit`. It grants no IAM policy-editing permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:GetAgentRuntime",
        "bedrock-agentcore:UpdateAgentRuntime"
      ],
      "Resource": "arn:aws:bedrock-agentcore:eu-north-1:661406599883:runtime/surgeair_ai_agent-YzOD6XHzSm"
    },
    {
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::661406599883:role/service-role/AmazonBedrockAgentCoreRuntimeDefaultServiceRole-xsixa",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "bedrock-agentcore.amazonaws.com"
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::bedrock-agentcore-runtime-661406599883-eu-north-1-1ihjkds6uu/surgeair-updates/*"
    }
  ]
}
```

The **existing runtime execution role**, separately, must be able to read the
new ZIP (`s3:GetObject`, and `s3:GetObjectVersion` if version-pinned), and invoke
its configured Bedrock model. Those permissions are not granted by the policy
above. If the bucket uses a customer-managed KMS key, additional narrowly scoped
KMS access may be needed for the uploader and runtime role. Explicit denies in
organization, boundary, bucket, or key policies still apply.

For an independent comparison before deploying, your login additionally needs
`s3:GetObject` on the original ZIP object. Download it without printing its
contents, then compare bundle hashes:

```bash
aws --profile YOUR_DEPLOY_PROFILE --region eu-north-1 s3api get-object \
  --bucket bedrock-agentcore-runtime-661406599883-eu-north-1-1ihjkds6uu \
  --key 1790003435921-x1dczu-surgeair-agentcore.zip \
  /tmp/surgeair-deployed.zip >/dev/null
unzip -p /tmp/surgeair-deployed.zip app.js | sha256sum
sha256sum artifacts/api-server/agentcore-output/app.js
```

Different bundle hashes establish that the artifacts differ, not which source
change caused the difference. Do not paste bundle contents or runtime
configuration files into chat; they could contain sensitive configuration.

References:
- https://docs.aws.amazon.com/cli/latest/reference/bedrock-agentcore-control/update-agent-runtime.html
- https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/resource-based-policies.html
