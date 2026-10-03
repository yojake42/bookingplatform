import type { CancellationPolicy } from '@prisma/client';

const hour = 60 * 60 * 1000;
const day = 24 * hour;

export const cancellationPolicyText: Record<CancellationPolicy, string> = {
  FLEXIBLE: 'Full refund if you cancel at least 24 hours before check-in. No refund after that.',
  MODERATE: 'Full refund if you cancel at least 5 days before check-in. 50% refund after that, until check-in.',
  STRICT:
    'Full refund if you cancel within 48 hours of booking and check-in is at least 14 days away. 50% refund if you cancel at least 7 days before check-in. No refund after that.',
};

export type RefundDecision = {
  /** Minor units to refund. */
  amount: number;
  percent: 0 | 50 | 100;
  /** Human-readable explanation of which rule applied. */
  rule: string;
  /** Last moment a full refund is available, if one still is. */
  fullRefundUntil: Date | null;
};

/**
 * Refund owed under a cancellation policy. `checkInAt` is the check-in *instant* (check-in date plus
 * check-in time in the home's time zone), so deadlines like "24 hours before" are exact.
 */
export function policyRefund(input: {
  policy: CancellationPolicy;
  paid: number;
  checkInAt: Date;
  bookedAt: Date;
  now?: Date;
}): RefundDecision {
  const now = (input.now ?? new Date()).getTime();
  const checkIn = input.checkInAt.getTime();
  const booked = input.bookedAt.getTime();
  const decide = (percent: 0 | 50 | 100, rule: string, fullUntil: number | null): RefundDecision => ({
    amount: Math.floor((input.paid * percent) / 100),
    percent,
    rule,
    fullRefundUntil: fullUntil != null && fullUntil > now ? new Date(fullUntil) : null,
  });

  if (now >= checkIn) return decide(0, 'The stay has already started.', null);

  switch (input.policy) {
    case 'FLEXIBLE': {
      const deadline = checkIn - day;
      return now <= deadline
        ? decide(100, 'Cancelled at least 24 hours before check-in.', deadline)
        : decide(0, 'Cancelled less than 24 hours before check-in.', null);
    }
    case 'MODERATE': {
      const deadline = checkIn - 5 * day;
      return now <= deadline
        ? decide(100, 'Cancelled at least 5 days before check-in.', deadline)
        : decide(50, 'Cancelled less than 5 days before check-in.', null);
    }
    case 'STRICT': {
      const graceEnds = booked + 48 * hour;
      const graceApplies = checkIn - booked >= 14 * day;
      if (graceApplies && now <= graceEnds) return decide(100, 'Cancelled within 48 hours of booking.', graceEnds);
      if (now <= checkIn - 7 * day) return decide(50, 'Cancelled at least 7 days before check-in.', null);
      return decide(0, 'Cancelled less than 7 days before check-in.', null);
    }
  }
}
