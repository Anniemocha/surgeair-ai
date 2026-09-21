import { logger } from "../lib/logger";

export type OperationalLogType =
  | "incoming_message"
  | "outgoing_message"
  | "tool_call"
  | "agent_decision"
  | "channel_transition"
  | "model_request"
  | "rebooking_attempt"
  | "rebooking_success"
  | "rebooking_failure"
  | "error";

export interface OperationalLogger {
  record(
    type: OperationalLogType,
    details: Record<string, string | number | boolean | null>,
  ): void;
}

export class LocalOperationalLogger implements OperationalLogger {
  record(
    type: OperationalLogType,
    details: Record<string, string | number | boolean | null>,
  ) {
    logger.info({ operationalEvent: type, ...details }, "SurgeAir operation");
  }
}