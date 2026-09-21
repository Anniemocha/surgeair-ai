import type { OperationalLogger } from "../observability/operational-logger";
import { BedrockModelProvider } from "./bedrock-model-provider";
import { LocalModelProvider, type ModelProvider } from "./model-provider";

export function createModelProvider(
  logger: OperationalLogger,
): ModelProvider {
  const fallback = new LocalModelProvider();
  const selected = process.env.MODEL_PROVIDER?.toLowerCase() ?? "local";
  if (selected !== "bedrock") {
    if (selected !== "local") {
      logger.record("error", {
        component: "model_provider",
        errorCategory: "unsupported_provider",
      });
    }
    return fallback;
  }

  const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const modelId = process.env.BEDROCK_MODEL_ID;
  const region = process.env.AWS_REGION;
  if (!modelId || !region) {
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