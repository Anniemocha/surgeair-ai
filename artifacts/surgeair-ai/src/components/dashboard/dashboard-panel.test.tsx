import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Dashboard } from "@workspace/api-client-react";
import { DashboardPanel } from "./dashboard-panel";

// GET only; server rendering does not run the simulator or its sending effects.
const response = await fetch("http://127.0.0.1:8080/api/dashboard");
assert(response.ok);
const dashboard: Dashboard = await response.json();
const exactError = "RuntimeClientError: Received error (400) from runtime. Please check your CloudWatch logs for more information.";
dashboard.orchestration.executionPath = "Direct Bedrock fallback";
dashboard.orchestration.runtimeSessionId = "ui-test-session";
dashboard.orchestration.turnHistory = [{
  path: "Direct Bedrock fallback", runtimeSessionId: "ui-test-session",
  timestamp: "2026-10-26T18:54:08.403Z", fallbackReason: "RuntimeClientError",
  fallbackError: exactError, modelProvider: "amazon-bedrock",
}];
dashboard.integrationStatus = dashboard.integrationStatus.map(item =>
  item.service === "Bedrock AgentCore"
    ? { ...item, status: "Configured, fallback active" } : item);
const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
const html = renderToStaticMarkup(
  <QueryClientProvider client={client}>
    <DashboardPanel dashboard={dashboard} displayStatus="Awaiting passenger reply" />
  </QueryClientProvider>,
);
const details = html.match(/<details\b[\s\S]*?<\/details>/)?.[0];
assert(details);
assert(!/<details[^>]*\bopen(?:[ =>])/.test(details), "Details must start collapsed");
assert(details.includes(exactError), "Exact error must be retained in details");
assert(!html.replace(details, "").includes(exactError), "Exact error must not appear outside details");
assert(html.includes("Configured, fallback active"));
const readinessCard = html.match(/data-testid="card-readiness-bedrock-agentcore"[\s\S]*?<\/div>/)?.[0];
assert(readinessCard?.includes("border-amber"), "Fallback status must use non-red configured styling");
if (process.env.SURGEAIR_RENDER_FIXTURE === "1") {
  await writeFile("public/__readiness-check.html", `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/index.css"><title>Readiness UI verification</title></head><body><p style="padding:8px;font:12px sans-serif">Static UI verification fixture — no AWS requests</p><div style="height:1200px">${html}</div></body></html>`);
}
client.clear();
console.log("Readiness label, non-red styling, and collapsed exact-error details passed; no AWS sends.");
