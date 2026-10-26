import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "agentcore-deploy-test-"));
try {
  const zip = join(dir, "test.zip");
  writeFileSync(zip, "fake archive");
  writeFileSync(join(dir, "aws"), `#!/usr/bin/env node
const fs = require("node:fs");
const a = process.argv.slice(2);
const has = s => a.includes(s);
const current = {
  agentRuntimeId: "surgeair_ai_agent-YzOD6XHzSm", agentRuntimeVersion:"3",
  roleArn:"existing-role", networkConfiguration:{networkMode:"PUBLIC"},
  protocolConfiguration:{serverProtocol:"HTTP"}, environmentVariables:{PRESERVE:"fixture-value"},
  agentRuntimeArtifact:{codeConfiguration:{runtime:"NODE_22",entryPoint:["app.js"],code:{s3:{bucket:"old",prefix:"old.zip"}}}}
};
if(!has("--profile") || a[a.indexOf("--profile")+1]!=="fixture-profile") process.exit(2);
if(has("get-caller-identity")) console.log("arn:aws:iam::000000000000:role/fixture");
else if(has("--generate-cli-skeleton")) console.log(JSON.stringify({...current,agentRuntimeVersion:undefined,clientToken:""}));
else if(has("get-agent-runtime")) console.log(has("--query") ? "READY" : JSON.stringify(current));
else if(has("put-object")) console.log('{"VersionId":"new-version"}');
else if(has("update-agent-runtime")) {
  const input=a[a.indexOf("--cli-input-json")+1].replace(/^file:\\/\\//,"");
  fs.copyFileSync(input,process.env.TEST_CAPTURE);
  console.log('{"agentRuntimeVersion":"4"}');
} else process.exit(3);
`, { mode: 0o700 });
  const capture = join(dir, "captured.json");
  const run = spawnSync("bash", ["scripts/deploy-agentcore.sh", zip, "fixture-profile"], {
    input: "DEPLOY\n", encoding: "utf8",
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, TEST_CAPTURE: capture },
  });
  assert.equal(run.status, 0, run.stderr);
  const input = JSON.parse(readFileSync(capture, "utf8"));
  assert.deepEqual(input.environmentVariables, { PRESERVE: "fixture-value" });
  assert.deepEqual(input.networkConfiguration, { networkMode: "PUBLIC" });
  assert.equal(input.roleArn, "existing-role");
  assert.equal(input.agentRuntimeVersion, undefined);
  assert.equal(input.agentRuntimeArtifact.codeConfiguration.code.s3.versionId, "new-version");
  assert.match(input.agentRuntimeArtifact.codeConfiguration.code.s3.prefix, /^surgeair-updates\/[a-f0-9]{64}\.zip$/);
  assert(!run.stdout.includes("fixture-value"));
  console.log("Manual deployment helper preserves settings and uses the selected profile; all AWS commands mocked.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
