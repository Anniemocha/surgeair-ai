import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

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
  | "runtime-success"
  | "runtime-failure";

interface StoredReadinessEntry {
  status: IntegrationVerificationStatus;
  source: ReadinessEvidenceSource;
}

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
    verifiedBaselines: Partial<Record<IntegrationReadinessKey, boolean>> = {},
  ) {
    this.state = this.read();
    let changed = false;
    for (const [key, verified] of Object.entries(verifiedBaselines) as Array<
      [IntegrationReadinessKey, boolean]
    >) {
      if (verified && !this.state.integrations[key]) {
        this.state.integrations[key] = {
          status: "CONNECTED",
          source: "verified-live-operation",
        };
        changed = true;
      }
    }
    if (changed) this.persist();
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
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    renameSync(temporaryPath, this.filePath);
  }
}