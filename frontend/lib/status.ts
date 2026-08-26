export type BookingStatus =
  | 'pending_advance' | 'advance_paid' | 'fully_paid'
  | 'awaiting_payment' | 'confirmed' | 'ongoing' | 'completed' | 'cancelled';

export function paymentLabel(s: string): string {
  return ({
    pending_advance: 'Advance Paid',
    advance_paid: 'Advance Paid',
    fully_paid: 'Fully Paid',
  } as Record<string, string>)[s] ?? s.replace('_', ' ');
}

export function bookingLabel(s: string): string {
  return ({
    awaiting_payment: 'Advance Paid',
    confirmed: 'Confirmed',
    ongoing: 'Vehicle Handed Over',
    completed: 'Completed',
    cancelled: 'Cancelled',
  } as Record<string, string>)[s] ?? s.replace('_', ' ');
}

export function paymentToneClass(s: string, base: Record<string, string>): string {
  if (s === 'fully_paid') return base.statusOk || base.statusGreen || '';
  if (s === 'advance_paid' || s === 'pending_advance') return base.statusYellow || '';
  return base.statusMuted || '';
}

export function bookingToneClass(s: string, base: Record<string, string>): string {
  if (s === 'ongoing') return base.statusOngoing || base.statusYellow || '';
  if (s === 'completed') return base.statusOk || base.statusGreen || '';
  if (s === 'cancelled') return base.statusMuted || '';
  if (s === 'confirmed') return base.statusOk || base.statusGreen || '';
  if (s === 'awaiting_payment') return base.statusYellow || '';
  return base.statusMuted || '';
}

export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
