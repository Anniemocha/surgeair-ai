import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { logger } from "../lib/logger";

export type IntegrationReadinessKey =
  | "bedrock"
  | "agentCore"
  | "sms"
  | "ses";
export type IntegrationVerificationStatus =
  | "CONNECTED"
  | "NOT VERIFIED"
  | "ERROR";
export type ReadinessEvidenceSource =
  | "verified-live-operation"
  | "previous-live-runtime-verification"
  | "runtime-success"
  | "runtime-failure";

export interface StoredReadinessEntry {
  status: IntegrationVerificationStatus;
  source: ReadinessEvidenceSource;
}

export type ReadinessSeed = Partial<
  Record<IntegrationReadinessKey, StoredReadinessEntry>
>;

interface StoredReadinessDocument {
  version: 1;
  integrations: Partial<
    Record<IntegrationReadinessKey, StoredReadinessEntry>
  >;
}

export interface ReadinessStateStore {
  get(key: IntegrationReadinessKey): IntegrationVerificationStatus | null;
  set(
    key: IntegrationReadinessKey,
    status: IntegrationVerificationStatus,
    source: ReadinessEvidenceSource,
  ): void;
}

export class JsonReadinessStateStore implements ReadinessStateStore {
  private state: StoredReadinessDocument;

  constructor(
    private readonly filePath: string,
    seed: ReadinessSeed = {},
  ) {
    const runtimeState = this.read();
    this.state = {
      version: 1,
      integrations: {
        ...seed,
        ...runtimeState.integrations,
      },
    };
  }

  get(key: IntegrationReadinessKey) {
    return this.state.integrations[key]?.status ?? null;
  }

  set(
    key: IntegrationReadinessKey,
    status: IntegrationVerificationStatus,
    source: ReadinessEvidenceSource,
  ) {
    this.state.integrations[key] = { status, source };
    this.persist();
  }

  private read(): StoredReadinessDocument {
    try {
      const parsed = JSON.parse(
        readFileSync(this.filePath, "utf8"),
      ) as StoredReadinessDocument;
      if (parsed.version === 1 && parsed.integrations) {
        return parsed;
      }
    } catch {
      // A missing or invalid file starts empty and is repaired on first write.
    }
    return { version: 1, integrations: {} };
  }

  private persist() {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(temporaryPath, this.filePath);
    } catch (error) {
      logger.warn(
        {
          errorName: error instanceof Error ? error.name : "UnknownError",
          persistenceMode: "memory-only",
        },
        "Integration readiness runtime overlay could not be persisted",
      );
    }
  }
}