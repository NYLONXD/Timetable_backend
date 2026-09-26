// src/database/mongo-errors.ts

// True when a write failed because it would break a unique index
export const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === 11000;
