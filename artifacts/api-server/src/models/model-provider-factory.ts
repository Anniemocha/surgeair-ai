import type { OperationalLogger } from "../observability/operational-logger";
import { BedrockModelProvider } from "./bedrock-model-provider";
import { LocalModelProvider, type ModelProvider } from "./model-provider";

export interface ModelProviderConfiguration {
  requestedProvider: string;
  selectedProvider: "local" | "amazon-bedrock";
  region: string | null;
  modelIdConfigured: boolean;
  bearerTokenPresent: boolean;
  credentialMode: "default-aws-credentials" | "bearer-token";
}

export interface ModelProviderConfigurationInput {
  requestedProvider?: string;
  region?: string;
  modelId?: string;
  bearerToken?: string;
}

export function getModelProviderConfiguration(
  input: ModelProviderConfigurationInput,
): ModelProviderConfiguration {
  const requestedProvider =
    input.requestedProvider?.trim().toLowerCase() || "local";
  const region = input.region?.trim() || null;
  const modelIdConfigured = Boolean(input.modelId?.trim());
  const bearerTokenPresent = Boolean(input.bearerToken);

  return {
    requestedProvider,
    selectedProvider:
      requestedProvider === "bedrock" && region && modelIdConfigured
        ? "amazon-bedrock"
        : "local",
    region,
    modelIdConfigured,
    bearerTokenPresent,
    credentialMode: bearerTokenPresent
      ? "bearer-token"
      : "default-aws-credentials",
  };
}

export function createModelProvider(
  logger: OperationalLogger,
): ModelProvider {
  const fallback = new LocalModelProvider();
  const bearerToken =
    process.env.AWS_BEARER_TOKEN_BEDROCK?.trim() || undefined;
  const modelId = process.env.BEDROCK_MODEL_ID?.trim();
  const configuration = getModelProviderConfiguration({
    requestedProvider: process.env.MODEL_PROVIDER,
    region: process.env.AWS_REGION,
    modelId,
    bearerToken,
  });
  if (configuration.requestedProvider !== "bedrock") {
    if (configuration.requestedProvider !== "local") {
      logger.record("error", {
        component: "model_provider",
        errorCategory: "unsupported_provider",
      });
    }
    return fallback;
  }

  const region = configuration.region;
  if (
    configuration.selectedProvider !== "amazon-bedrock" ||
    !modelId ||
    !region
  ) {
    logger.record("error", {
      component: "model_provider",
      errorCategory: "missing_bedrock_configuration",
    });
    return fallback;
  }

  return new BedrockModelProvider({
    region,
    modelId,
    bearerToken,
    logger,
    fallback,
  });
}