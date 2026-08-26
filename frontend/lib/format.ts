export function formatINR(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  if (!isFinite(n)) return '₹0';
  return `₹${n.toLocaleString('en-IN')}`;
}

export const PLACEHOLDER = 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800';
