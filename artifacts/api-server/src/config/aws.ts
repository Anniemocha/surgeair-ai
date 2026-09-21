function enabled(value: string | undefined) {
  return value?.toLowerCase() === "true";
}

export interface AwsReadinessConfig {
  region: string;
  bedrockModelId: string | null;
  conversationTableName: string | null;
  sesFromAddress: string | null;
  channels: {
    sms: {
      provider: "aws" | "simulated";
      originationIdentity: string | null;
      simulatorDestination: string | null;
    };
    whatsapp: boolean;
    rcs: boolean;
    email: boolean;
  };
}

export function getAwsReadinessConfig(): AwsReadinessConfig {
  const requestedSmsProvider = process.env.SMS_PROVIDER?.trim().toLowerCase();
  const smsProvider =
    requestedSmsProvider === "aws" ||
    (!requestedSmsProvider && enabled(process.env.AWS_SMS_ENABLED))
      ? "aws"
      : "simulated";
  return {
    region: process.env.AWS_REGION?.trim() || "eu-west-1",
    bedrockModelId: process.env.BEDROCK_MODEL_ID ?? null,
    conversationTableName: process.env.CONVERSATION_TABLE_NAME ?? null,
    sesFromAddress: process.env.SES_FROM_ADDRESS ?? null,
    channels: {
      sms: {
        provider: smsProvider,
        originationIdentity:
          process.env.AWS_SMS_ORIGINATION_NUMBER?.trim() || null,
        simulatorDestination:
          process.env.AWS_SMS_SIMULATOR_DESTINATION?.trim() || null,
      },
      whatsapp: enabled(process.env.AWS_WHATSAPP_ENABLED),
      rcs: enabled(process.env.AWS_RCS_ENABLED),
      email: enabled(process.env.AWS_SES_ENABLED),
    },
  };
}

export const integrationReadiness = [
  { service: "Amazon Bedrock", status: "SIMULATED" },
  { service: "Bedrock AgentCore", status: "SIMULATED" },
  { service: "AWS End User Messaging SMS", status: "NOT VERIFIED" },
  { service: "End User Messaging RCS", status: "SIMULATED" },
  { service: "End User Messaging Social", status: "SIMULATED" },
  { service: "Amazon SES", status: "SIMULATED" },
  { service: "DynamoDB", status: "LOCAL" },
  { service: "CloudWatch", status: "LOCAL LOGGING" },
] as const;