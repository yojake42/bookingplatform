import { Prisma } from '@prisma/client';

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const meta = (error as { meta?: unknown }).meta;
  return `${error.message} ${meta ? JSON.stringify(meta) : ''}`;
}

/** True when Postgres rejected a calendar hold because it overlaps an existing one (SQLSTATE 23P01). */
export function isHoldOverlapError(error: unknown): boolean {
  const text = errorText(error);
  return text.includes('CalendarHold_no_overlap') || text.includes('23P01');
}

/** Deadlock (40P01) or serialization failure (40001): safe to retry the whole transaction. */
export function isRetryableTransactionError(error: unknown): boolean {
  const text = errorText(error);
  return text.includes('40P01') || text.includes('40001') || text.includes('deadlock detected');
}

/**
 * Serializes calendar writes for one listing for the rest of the transaction (works across replicas).
 * Without it, concurrent inserts that conflict on the exclusion constraint can deadlock each other,
 * so nobody wins. With it they queue: the first commits, the rest get a clean overlap error.
 * The exclusion constraint remains the actual guarantee.
 */
export async function lockListingCalendar(tx: Prisma.TransactionClient, listingId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`calendar:${listingId}`}, 0))`;
}

/** True for a unique-constraint violation, optionally on a specific column. */
export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  if (!field) return true;
  const target = (error.meta as { target?: string[] | string } | undefined)?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? '').includes(field);
}
