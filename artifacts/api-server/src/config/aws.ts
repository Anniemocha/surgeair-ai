function enabled(value: string | undefined) {
  return value?.toLowerCase() === "true";
}

export interface AwsReadinessConfig {
  region: string;
  bedrockModelId: string | null;
  agentCoreRuntimeName: string | null;
  conversationTableName: string | null;
  sesFromAddress: string | null;
  verified: {
    bedrock: boolean;
    agentCore: boolean;
    sms: boolean;
    ses: boolean;
  };
  channels: {
    sms: {
      provider: "aws" | "simulated";
      originationIdentity: string | null;
      simulatorDestination: string | null;
    };
    email: {
      provider: "aws" | "simulated";
      fromEmail: string | null;
      testDestination: string | null;
    };
    whatsapp: boolean;
    rcs: boolean;
  };
}

export function getAwsReadinessConfig(): AwsReadinessConfig {
  const requestedSmsProvider = process.env.SMS_PROVIDER?.trim().toLowerCase();
  const smsProvider =
    requestedSmsProvider === "aws" ||
    (!requestedSmsProvider && enabled(process.env.AWS_SMS_ENABLED))
      ? "aws"
      : "simulated";
  const requestedEmailProvider = process.env.EMAIL_PROVIDER
    ?.trim()
    .toLowerCase();
  const emailProvider =
    requestedEmailProvider === "aws" ||
    (!requestedEmailProvider && enabled(process.env.AWS_SES_ENABLED))
      ? "aws"
      : "simulated";
  const sesFromEmail =
    process.env.AWS_SES_FROM_EMAIL?.trim() ||
    process.env.SES_FROM_ADDRESS?.trim() ||
    null;
  return {
    region: process.env.AWS_REGION?.trim() || "eu-west-1",
    bedrockModelId: process.env.BEDROCK_MODEL_ID ?? null,
    agentCoreRuntimeName:
      process.env.AGENTCORE_RUNTIME_NAME?.trim() || "surgeair_ai_agent",
    conversationTableName: process.env.CONVERSATION_TABLE_NAME ?? null,
    sesFromAddress: sesFromEmail,
    verified: {
      bedrock: enabled(process.env.BEDROCK_VERIFIED),
      agentCore: enabled(process.env.AGENTCORE_VERIFIED),
      sms: enabled(process.env.SMS_VERIFIED),
      ses: enabled(process.env.SES_VERIFIED),
    },
    channels: {
      sms: {
        provider: smsProvider,
        originationIdentity:
          process.env.AWS_SMS_ORIGINATION_NUMBER?.trim() || null,
        simulatorDestination:
          process.env.AWS_SMS_SIMULATOR_DESTINATION?.trim() || null,
      },
      email: {
        provider: emailProvider,
        fromEmail: sesFromEmail,
        testDestination:
          process.env.AWS_SES_TEST_DESTINATION?.trim() || null,
      },
      whatsapp: enabled(process.env.AWS_WHATSAPP_ENABLED),
      rcs: enabled(process.env.AWS_RCS_ENABLED),
    },
  };
}

export const integrationReadiness = [
  { service: "Amazon Bedrock", status: "NOT VERIFIED" },
  { service: "Bedrock AgentCore", status: "NOT VERIFIED" },
  { service: "AWS End User Messaging SMS", status: "NOT VERIFIED" },
  { service: "Amazon SES", status: "NOT VERIFIED" },
  { service: "WhatsApp", status: "SIMULATED" },
  { service: "RCS", status: "SIMULATED" },
] as const;