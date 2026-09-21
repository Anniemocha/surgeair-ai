function enabled(value: string | undefined) {
  return value?.toLowerCase() === "true";
}

export interface AwsReadinessConfig {
  region: string;
  bedrockModelId: string | null;
  conversationTableName: string | null;
  sesFromAddress: string | null;
  channels: {
    sms: boolean;
    whatsapp: boolean;
    rcs: boolean;
    email: boolean;
  };
}

export function getAwsReadinessConfig(): AwsReadinessConfig {
  return {
    region: process.env.AWS_REGION ?? "eu-west-1",
    bedrockModelId: process.env.BEDROCK_MODEL_ID ?? null,
    conversationTableName: process.env.CONVERSATION_TABLE_NAME ?? null,
    sesFromAddress: process.env.SES_FROM_ADDRESS ?? null,
    channels: {
      sms: enabled(process.env.AWS_SMS_ENABLED),
      whatsapp: enabled(process.env.AWS_WHATSAPP_ENABLED),
      rcs: enabled(process.env.AWS_RCS_ENABLED),
      email: enabled(process.env.AWS_SES_ENABLED),
    },
  };
}

export const integrationReadiness = [
  { service: "Amazon Bedrock", status: "SIMULATED" },
  { service: "Bedrock AgentCore", status: "SIMULATED" },
  { service: "End User Messaging SMS", status: "SIMULATED" },
  { service: "End User Messaging RCS", status: "SIMULATED" },
  { service: "End User Messaging Social", status: "SIMULATED" },
  { service: "Amazon SES", status: "SIMULATED" },
  { service: "DynamoDB", status: "LOCAL" },
  { service: "CloudWatch", status: "LOCAL LOGGING" },
] as const;