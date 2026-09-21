import { timingSafeEqual } from "node:crypto";

export function isAuthorizedSmsTestRequest(
  providedToken: string | undefined,
  configuredToken: string | undefined,
) {
  const provided = providedToken?.trim();
  const configured = configuredToken?.trim();
  if (!provided || !configured) return false;
  const providedBytes = Buffer.from(provided);
  const configuredBytes = Buffer.from(configured);
  return (
    providedBytes.length === configuredBytes.length &&
    timingSafeEqual(providedBytes, configuredBytes)
  );
}

export class SmsTestRateLimiter {
  private lastAttemptAt = 0;

  constructor(private readonly minimumIntervalMs: number) {}

  tryAcquire(now = Date.now()) {
    if (now - this.lastAttemptAt < this.minimumIntervalMs) return false;
    this.lastAttemptAt = now;
    return true;
  }
}