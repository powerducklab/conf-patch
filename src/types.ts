export type ConfigFormat = "json" | "jsonc" | "yaml";

export type JsonPathSegment = string | number;

export interface JsonPatchOp {
  op: "add" | "replace" | "remove";
  path: JsonPathSegment[];
  value?: unknown;
}

export interface PatchConfigOptions {
  format?: ConfigFormat;
  strict?: boolean;
  lock?: boolean;
  lockTimeoutMs?: number;
  lockRetryDelayMs?: number;
  lockStaleThresholdMs?: number;
  /**
   * Whether stale locks can be automatically reclaimed.
   * Disable by default for Electron single main process to avoid live transaction preemption.
   */
  allowStaleRecovery?: boolean;
}

export interface FileLockOptions {
  /** Maximum time to wait for a lock. Defaults to 10 seconds. */
  timeoutMs?: number;
  /** Initial retry delay. Defaults to 25ms. */
  retryDelayMs?: number;
  /** Explicit lock age after which recovery is allowed. */
  staleThresholdMs?: number;
  /**
   * Whether stale locks can be automatically reclaimed.
   * Disable by default for Electron single main process to avoid live transaction preemption.
   */
  allowStaleRecovery?: boolean;
}
