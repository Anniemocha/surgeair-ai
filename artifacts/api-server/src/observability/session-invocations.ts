import type { OperationalLogType } from "./operational-logger";

export class SessionInvocations {
  private successes = new Map<string, string>();
  private failures = new Set<string>();
  record(type: OperationalLogType, metadata: Record<string, unknown>) {
    const services: Partial<Record<OperationalLogType, string>> = {
      agentcore_invocation_succeeded: "Bedrock AgentCore",
      agentcore_invocation_failed: "Bedrock AgentCore",
      sms_send_succeeded: "AWS End User Messaging SMS",
      sms_send_failed: "AWS End User Messaging SMS",
      ses_send_succeeded: "Amazon SES",
      ses_send_failed: "Amazon SES",
      bedrock_invocation_failed: "Amazon Bedrock",
    };
    const service = services[type];
    if (service) {
      if (type.endsWith("succeeded")) this.success(service);
      else if (metadata.attempted !== false) this.failures.add(service);
    }
    if (type === "model_request" && metadata.status === "succeeded") this.success("Amazon Bedrock");
    if (type === "agentcore_invocation_succeeded" && metadata.bedrockInvoked === true) this.success("Amazon Bedrock");
  }
  private success(service: string) {
    if (!this.successes.has(service)) this.successes.set(service, new Date().toISOString());
  }
  clear() { this.successes.clear(); this.failures.clear(); }
  readiness(service: string, configured: boolean, simulated = false) {
    const invokedAt = this.successes.get(service);
    return {
      service,
      status: invokedAt ? "INVOKED" : simulated ? "SIMULATED" : this.failures.has(service) ? "ERROR" : configured ? "CONFIGURED" : "NOT INVOKED YET",
      ...(invokedAt ? { invokedAt } : {}),
    };
  }
}
