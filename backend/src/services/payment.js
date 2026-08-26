import { env } from '../config/env.js';

export function splitBookingAmount(total){
  const pct = env.PLATFORM_COMMISSION_PCT;
  const commission = Math.round(total * (pct / 100) * 100) / 100;
  const merchantPayout = Math.round((total - commission) * 100) / 100;
  const advance = Math.round(total * 0.5 * 100) / 100;
  const balance = Math.round((total - advance) * 100) / 100;
  return { total, advance, balance, commission, merchantPayout };
}
