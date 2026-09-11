'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getToken, clearAuth } from '../../lib/api';
import { formatINR, PLACEHOLDER } from '../../lib/format';
import { paymentLabel, bookingLabel, paymentToneClass, bookingToneClass, fmtDate } from '../../lib/status';
import { Pagination, Paged } from '../../lib/pagination';
import styles from './merchant.module.css';

type Merchant = {
  id: string;
  email: string;
  business_name: string;
  owner_name: string;
  city: string;
  state: string;
  is_approved: boolean;
  kyc_status: string;
};

type Vehicle = {
  id: string;
  title: string;
  category: '2_wheeler' | '4_wheeler';
  seating_capacity: number;
  price_per_day: number;
  description?: string;
  image_urls: string[];
  is_available: boolean;
  availability_status?: 'available' | 'booked' | 'unavailable';
};

type Booking = {
  id: string;
  vehicle_title?: string;
  vehicle_image?: string;
  user_name?: string;
  user_email?: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  advance_amount?: number;
  balance_amount?: number;
  payment_status: string;
  booking_status: string;
  duration_days?: number;
  advance_verified?: boolean;
  handed_over_at?: string;
  created_at?: string;
};

type SortKey = 'customer' | 'date' | 'amount' | 'status';
type SortOrder = 'asc' | 'desc';

type Screen = 'home' | 'fleet' | 'fleet-add' | 'bookings' | 'history' | 'earnings';

export default function MerchantApp() {
  const router = useRouter();
  const [token, setTok] = useState<string | null>(null);
  const [me, setMe] = useState<Merchant | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [earnings, setEarnings] = useState<any>(null);

  useEffect(() => {
    const t = getToken();
    setTok(t);
    if (!t) return;
    api('/auth/me').then(d => setMe(d.account)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    api('/merchant/vehicles').then(setVehicles).catch(() => {});
    api('/merchant/bookings').then(setBookings).catch(() => {});
    api('/merchant/earnings').then(setEarnings).catch(() => {});
  }, [token]);

  const refresh = async () => {
    if (!token) return;
    const [v, b, e] = await Promise.all([api('/merchant/vehicles'), api('/merchant/bookings'), api('/merchant/earnings')]);
    setVehicles(v); setBookings(b); setEarnings(e);
  };

  const onLogout = () => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    clearAuth();
    router.push('/');
  };

  if (!token) {
    return (
      <div className={styles.stage}>
        <header className={styles.topHeader}>
          <div className={styles.topHeaderInner}>
            <Link href="/" className={styles.topLogo}>JJ</Link>
            <strong>Journey Junction</strong>
          </div>
        </header>
        <div className={styles.phone}>
          <div className={styles.screen}>
            <div className={styles.gate}>
              <h2 className={styles.pageTitle}>Merchant Console</h2>
              <p className={styles.gateText}>You need to login to manage your fleet.</p>
              <Link href="/" className={styles.cta}>Go to Home & Login</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stage}>
      <header className={styles.topHeader}>
        <div className={styles.topHeaderInner}>
          <Link href="/" className={styles.topLogo}>JJ</Link>
          <strong>{me?.business_name || 'Merchant'}</strong>
          <div className={styles.topActions}>
            <Link href={`/merchant`} className={styles.topBtn}>Dashboard</Link>
            <button onClick={onLogout} className={styles.topBtnSolid}>Logout</button>
          </div>
        </div>
      </header>
      <div className={styles.phone}>
        <div className={styles.screen}>
          {screen === 'home' && <HomeScreen vehicles={vehicles} bookings={bookings} earnings={earnings} me={me} onFleet={() => setScreen('fleet')} onBookings={() => setScreen('bookings')} onEarnings={() => setScreen('earnings')} />}
          {screen === 'fleet' && <FleetScreen vehicles={vehicles} onAdd={() => setScreen('fleet-add')} onDelete={async (id) => { await api(`/merchant/vehicles/${id}`, { method: 'DELETE' }); refresh(); }} />}
          {screen === 'fleet-add' && <AddVehicleScreen onBack={() => setScreen('fleet')} onCreated={() => { refresh(); setScreen('fleet'); }} />}
          {screen === 'bookings' && <BookingsScreen bookings={bookings} onChanged={refresh} />}
          {screen === 'history' && <HistoryScreen bookings={bookings} />}
          {screen === 'earnings' && <EarningsScreen earnings={earnings} />}
        </div>
        <div className={styles.nav}>
          <button onClick={() => setScreen('home')} className={screen === 'home' ? styles.navActive : styles.navBtn}>🏠 Home</button>
          <button onClick={() => setScreen('fleet')} className={screen === 'fleet' ? styles.navActive : styles.navBtn}>🚗 Fleet</button>
          <button onClick={() => setScreen('bookings')} className={screen === 'bookings' ? styles.navActive : styles.navBtn}>📅 Bookings</button>
          <button onClick={() => setScreen('history')} className={screen === 'history' ? styles.navActive : styles.navBtn}>📜 History</button>
          <button onClick={() => setScreen('earnings')} className={screen === 'earnings' ? styles.navActive : styles.navBtn}>💰 Earnings</button>
        </div>
      </div>
    </div>
  );
}

function HomeScreen({ vehicles, bookings, earnings, me, onFleet, onBookings, onEarnings }: { vehicles: Vehicle[]; bookings: Booking[]; earnings: any; me: Merchant | null; onFleet: () => void; onBookings: () => void; onEarnings: () => void }) {
  if (!me?.is_approved) {
    return (
      <div className={styles.scroll}>
        <div className={styles.pendingCard}>
          <h3>⏳ Awaiting Admin Approval</h3>
          <p>Your merchant account is not yet approved. Once admin approves, you'll be able to add vehicles and accept bookings.</p>
        </div>
      </div>
    );
  }
  const pending = bookings.filter(b => b.payment_status === 'advance_paid' && b.advance_verified && b.booking_status === 'confirmed');
  return (
    <div className={styles.scroll}>
      <div className={styles.stats}>
        <Stat icon="🚗" label="Fleet" value={vehicles.length} />
        <Stat icon="📅" label="Bookings" value={bookings.length} />
        <Stat icon="💰" label="Earnings" value={formatINR(earnings?.payout || 0)} yellow />
      </div>
      {pending.length > 0 && (
        <div className={styles.pendingCard}>
          <h3>🔑 {pending.length} vehicle{pending.length > 1 ? 's' : ''} ready for handover</h3>
          <p>Customer has paid advance, admin verified. Mark vehicle as handed over to begin rental.</p>
          <button className={styles.cta} onClick={onBookings}>Open Bookings →</button>
        </div>
      )}
      <div className={styles.featured} onClick={onFleet}>
        <div>
          <strong>Manage Your Fleet</strong>
          <p>Add new vehicles or update existing ones</p>
        </div>
        <span className={styles.arrow}>→</span>
      </div>
      <div className={styles.sectionHeader}>
        <h3>Recent Bookings</h3>
        <span onClick={onBookings}>View all ›</span>
      </div>
      {bookings.length === 0 ? (
        <div className={styles.emptyCard}>No bookings yet. Once customers book, they'll appear here.</div>
      ) : (
        <div className={styles.dealList}>
          {bookings.slice(0, 4).map(b => (
            <div key={b.id} className={styles.dealCard}>
              {b.vehicle_image ? (
                <div className={styles.imgSm}><img src={b.vehicle_image} alt={b.vehicle_title} loading="lazy" /></div>
              ) : (
                <div className={styles.imgSm}><img src={PLACEHOLDER} alt={b.vehicle_title} loading="lazy" /></div>
              )}
              <strong>{b.user_name || 'Customer'}</strong>
              <small>{b.vehicle_title}</small>
              <div className={styles.dealPrice}>{formatINR(b.total_amount)}<span>/booking</span></div>
            </div>
          ))}
        </div>
      )}
      <div className={styles.sectionHeader}>
        <h3>Quick Actions</h3>
      </div>
      <div className={styles.actionGrid}>
        <button onClick={onFleet} className={styles.actionBtn}>🚗 Add Vehicle</button>
        <button onClick={onBookings} className={styles.actionBtn}>📅 View Bookings</button>
        <button onClick={onEarnings} className={styles.actionBtn}>💰 See Earnings</button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, yellow }: { icon: string; label: string; value: string | number; yellow?: boolean }) {
  return (
    <div className={styles.statCard}>
      <div>
        <div className={styles.statLabel}>{label}</div>
        <div className={styles.statValue}>{value}</div>
      </div>
      <div className={yellow ? styles.statIconYellow : styles.statIcon}>{icon}</div>
    </div>
  );
}

function FleetScreen({ vehicles, onAdd, onDelete }: { vehicles: Vehicle[]; onAdd: () => void; onDelete: (id: string) => void }) {
  return (
    <div className={styles.scroll}>
      <div className={styles.titleRow}>
        <h2 className={styles.pageTitle}>My Fleet</h2>
        <button onClick={onAdd} className={styles.btnPrimary}>+ Add</button>
      </div>
      {vehicles.length === 0 ? (
        <div className={styles.emptyCard}>No vehicles yet. Click "+ Add" to add your first.</div>
      ) : (
        <div className={styles.searchList}>
          {vehicles.map(v => (
            <div key={v.id} className={styles.searchCard}>
              {v.image_urls && v.image_urls[0] ? (
                <div className={styles.imgSm}><img src={v.image_urls[0]} alt={v.title} loading="lazy" /></div>
              ) : (
                <div className={styles.imgSm}><img src={PLACEHOLDER} alt={v.title} loading="lazy" /></div>
              )}
              <strong>{v.title}</strong>
              <small>{v.category} · {v.seating_capacity} seats</small>
              {v.availability_status === 'booked'
                ? <span className={styles.badgeBooked}>🔴 Booked</span>
                : v.availability_status === 'unavailable'
                ? <span className={styles.badgeBooked}>⚪ Unavailable</span>
                : <span className={styles.badgeAvailable}>🟢 Available</span>}
              <div className={styles.dealPrice}>{formatINR(v.price_per_day)}<span>/day</span></div>
              <button onClick={() => { if (confirm('Delete ' + v.title + '?')) onDelete(v.id); }} className={styles.btnDanger}>Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddVehicleScreen({ onBack, onCreated }: { onBack: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', category: '4_wheeler', seating_capacity: 5, price_per_day: 1500, description: '', image_url: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api('/merchant/vehicles', { method: 'POST', body: JSON.stringify({ ...form, image_urls: form.image_url ? [form.image_url] : [], is_available: true }) });
      onCreated();
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  return (
    <form onSubmit={submit} className={styles.addForm}>
      <div className={styles.searchHeader}>
        <button type="button" onClick={onBack} className={styles.backBtn}>←</button>
        <h2 className={styles.pageTitle}>Add Vehicle</h2>
      </div>
      <label className={styles.field}>
        <span>Title</span>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Honda City 2024" required />
      </label>
      <div className={styles.formRow}>
        <label className={styles.field}>
          <span>Category</span>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as any })} className={styles.input}>
            <option value="4_wheeler">4-Wheeler</option>
            <option value="2_wheeler">2-Wheeler</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Seats</span>
          <input type="number" value={form.seating_capacity} onChange={e => setForm({ ...form, seating_capacity: +e.target.value })} />
        </label>
      </div>
      <label className={styles.field}>
        <span>Price per day (₹ INR)</span>
        <input type="number" value={form.price_per_day} onChange={e => setForm({ ...form, price_per_day: +e.target.value })} required />
      </label>
      <label className={styles.field}>
        <span>Image URL (optional)</span>
        <input value={form.image_url} onChange={e => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
      </label>
      <label className={styles.field}>
        <span>Description</span>
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="AC, music system, automatic..." />
      </label>
      {error && <div className={styles.err}>{error}</div>}
      <button type="submit" disabled={loading} className={styles.cta}>{loading ? 'Publishing...' : 'Publish Vehicle'}</button>
    </form>
  );
}

function BookingsScreen({ bookings, onChanged }: { bookings: Booking[]; onChanged: () => void }) {
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...bookings];
    const mult = sortOrder === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'customer':
          av = (a.user_name || '').toLowerCase();
          bv = (b.user_name || '').toLowerCase();
          break;
        case 'amount':
          av = a.total_amount || 0;
          bv = b.total_amount || 0;
          break;
        case 'status':
          av = `${a.payment_status}|${a.booking_status}`;
          bv = `${b.payment_status}|${b.booking_status}`;
          break;
        case 'date':
        default:
          av = a.created_at || '';
          bv = b.created_at || '';
          break;
      }
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return 0;
    });
    return arr;
  }, [bookings, sortKey, sortOrder]);

  const handover = async (id: string) => {
    setBusy(id);
    try {
      await api(`/bookings/${id}/handover`, { method: 'POST' });
      await onChanged();
    } catch (e: any) {
      alert('Handover failed: ' + (e?.message || 'unknown'));
    }
    setBusy(null);
  };

  const complete = async (id: string) => {
    setBusy(id);
    try {
      await api(`/bookings/${id}/complete`, { method: 'POST' });
      await onChanged();
    } catch (e: any) {
      alert('Complete failed: ' + (e?.message || 'unknown'));
    }
    setBusy(null);
  };

  if (!bookings.length) return <div className={styles.scroll}><div className={styles.emptyCard}>No bookings yet.</div></div>;

  return (
    <div className={styles.scroll}>
      <h2 className={styles.pageTitle}>Bookings ({bookings.length})</h2>
      <div className={styles.sortBar}>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className={styles.sortSelect}>
          <option value="date">Sort: Date</option>
          <option value="customer">Sort: Customer</option>
          <option value="amount">Sort: Amount</option>
          <option value="status">Sort: Status</option>
        </select>
        <button className={styles.sortOrderBtn} onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} aria-label="toggle sort order">
          {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
      </div>
      <div className={styles.searchList}>
        {sorted.map(b => {
          const canHandover = b.payment_status === 'advance_paid' && b.advance_verified && b.booking_status === 'confirmed';
          const canComplete = b.booking_status === 'ongoing';
          return (
            <div key={b.id} className={styles.searchCard}>
              {b.vehicle_image ? (
                <div className={styles.imgSm}><img src={b.vehicle_image} alt={b.vehicle_title} loading="lazy" /></div>
              ) : (
                <div className={styles.imgSm}><img src={PLACEHOLDER} alt={b.vehicle_title} loading="lazy" /></div>
              )}
              <strong>{b.vehicle_title}</strong>
              <small>{b.user_name || b.user_email || 'Customer'} · {fmtDate(b.start_date)} → {fmtDate(b.end_date)} ({b.duration_days || 1} day{(b.duration_days || 1) > 1 ? 's' : ''})</small>
              <div className={styles.dealPrice}>{formatINR(b.total_amount)}<span>/total</span></div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <span className={paymentToneClass(b.payment_status, styles)}>{paymentLabel(b.payment_status)}</span>
                <span className={bookingToneClass(b.booking_status, styles)}>{bookingLabel(b.booking_status)}</span>
              </div>
              {!b.advance_verified && b.payment_status === 'advance_paid' && (
                <small style={{ color: '#92400e' }}>⏳ Awaiting admin verification of advance</small>
              )}
              {b.handed_over_at && (
                <small style={{ color: '#15803d' }}>✅ Handed over on {fmtDate(b.handed_over_at)}</small>
              )}
              {canHandover && (
                <button onClick={() => handover(b.id)} disabled={busy === b.id} className={styles.cta}>
                  {busy === b.id ? 'Marking...' : '🔑 Mark Handed Over'}
                </button>
              )}
              {canComplete && (
                <button onClick={() => complete(b.id)} disabled={busy === b.id} className={styles.btnPrimary}>
                  {busy === b.id ? 'Marking...' : '✓ Mark Completed'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryScreen({ bookings }: { bookings: Booking[] }) {
  const [paged, setPaged] = useState<Paged<any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const load = (p: number) => {
    setLoading(true);
    api(`/merchant/bookings?page=${p}&limit=5&sort=${sortKey}&order=${sortOrder}`).then(d => { setPaged(d); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page, sortKey, sortOrder]);

  const items = paged?.items || [];

  if (loading && !paged) return <div className={styles.scroll}><div className={styles.emptyCard}>Loading...</div></div>;
  if (paged && paged.total === 0) return <div className={styles.scroll}><div className={styles.emptyCard}>📜 No booking history yet.</div></div>;
  if (!paged) return null;

  return (
    <div className={styles.scroll}>
      <h2 className={styles.pageTitle}>📜 Booking History</h2>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
        <div className={styles.statCard} style={{ padding:10 }}>
          <div className={styles.statLabel}>Total</div>
          <div className={styles.statValue} style={{ fontSize:18 }}>{paged.total}</div>
        </div>
        <div className={styles.statCard} style={{ padding:10 }}>
          <div className={styles.statLabel}>On Page</div>
          <div className={styles.statValue} style={{ fontSize:18 }}>{items.length}</div>
        </div>
        <div className={styles.statCard} style={{ padding:10 }}>
          <div className={styles.statLabel}>Handed</div>
          <div className={styles.statValue} style={{ fontSize:18 }}>{items.filter(b => b.booking_status === 'ongoing' || b.booking_status === 'completed').length}</div>
        </div>
      </div>
      <div className={styles.sortBar}>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} className={styles.sortSelect}>
          <option value="date">Sort: Date</option>
          <option value="customer">Sort: Customer</option>
          <option value="amount">Sort: Amount</option>
          <option value="status">Sort: Status</option>
        </select>
        <button className={styles.sortOrderBtn} onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
          {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
      </div>
      <div className={styles.searchList}>
        {items.map(b => (
          <div key={b.id} className={styles.searchCard}>
            {b.vehicle_image ? (
              <div className={styles.imgSm}><img src={b.vehicle_image} alt={b.vehicle_title} loading="lazy" /></div>
            ) : (
              <div className={styles.imgSm}><img src={PLACEHOLDER} alt={b.vehicle_title} loading="lazy" /></div>
            )}
            <strong>{b.vehicle_title}</strong>
            <small>{b.user_name || b.user_email || 'Customer'} · {fmtDate(b.start_date)} → {fmtDate(b.end_date)} ({b.duration_days || 1}d)</small>
            <p style={{ fontSize:11, color:'#9ca3af', margin:0 }}>Booked {fmtDate(b.created_at)}</p>
            <div className={styles.dealPrice}>{formatINR(b.total_amount)}<span>/total</span></div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <span className={paymentToneClass(b.payment_status, styles)}>{paymentLabel(b.payment_status)}</span>
              <span className={bookingToneClass(b.booking_status, styles)}>{bookingLabel(b.booking_status)}</span>
            </div>
            {b.handed_over_at && <small style={{ color:'#15803d' }}>✅ Handed over {fmtDate(b.handed_over_at)}</small>}
          </div>
        ))}
      </div>
      <Pagination paged={paged} onChange={setPage} />
    </div>
  );
}

function EarningsScreen({ earnings }: { earnings: any }) {
  return (
    <div className={styles.scroll}>
      <h2 className={styles.pageTitle}>Earnings</h2>
      <div className={styles.stats}>
        <Stat icon="📈" label="Gross" value={formatINR(earnings?.gross || 0)} />
        <Stat icon="💼" label="Commission (30%)" value={formatINR(earnings?.commission || 0)} yellow />
        <Stat icon="💸" label="Payout (70%)" value={formatINR(earnings?.payout || 0)} yellow />
        <Stat icon="📅" label="Bookings" value={earnings?.bookings || 0} />
        <Stat icon="✅" label="Paid out" value={formatINR(earnings?.paid_payout || 0)} />
        <Stat icon="🧾" label="Paid bookings" value={earnings?.paid_count || 0} yellow />
      </div>
      <div className={styles.emptyCard} style={{ marginTop: 16 }}>
        Commission split: 30% platform / 70% merchant. Calculated at booking creation. Currency: INR (₹).
      </div>
    </div>
  );
}
