'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getToken, clearAuth } from '../../lib/api';
import { formatINR } from '../../lib/format';
import { paymentLabel, bookingLabel, paymentToneClass, bookingToneClass, fmtDate } from '../../lib/status';
import { Pagination, Paged } from '../../lib/pagination';
import styles from './admin.module.css';

type AdminScreen = 'overview' | 'kyc' | 'payments' | 'users' | 'merchants' | 'finance' | 'vehicles' | 'bookings' | 'history';

type KycItem = {
  id: string;
  account_type: 'user' | 'merchant';
  full_name?: string;
  business_name?: string;
  owner_name?: string;
  email: string;
  kyc_status: string;
  driving_license_url?: string;
  driving_license_front_url?: string;
  driving_license_back_url?: string;
  id_document_url?: string;
  id_document_type?: string;
  business_doc_url?: string;
  identity_doc_url?: string;
  submitted_at?: string;
};

type PaymentItem = {
  id: string;
  booking_id: string;
  stage: string;
  amount: number;
  upi_reference: string;
  verified_by_admin: boolean;
  booking_status?: string;
  payment_status?: string;
  user_name?: string;
  vehicle_title?: string;
  merchant_name?: string;
};

type AdminUser = { id: string; full_name: string; email: string; kyc_status: string; created_at?: string };
type AdminMerchant = { id: string; business_name: string; owner_name: string; email: string; city: string; state: string; is_approved: boolean; kyc_status: string };
type AdminVehicle = { id: string; title: string; category: string; price_per_day: number; merchant_name?: string; is_available: boolean; availability_status?: string };
type BookingRow = {
  id: string;
  user_name?: string;
  user_email?: string;
  vehicle_title?: string;
  merchant_name?: string;
  start_date: string;
  end_date: string;
  total_amount: number;
  payment_status: string;
  booking_status: string;
  duration_days?: number;
  created_at?: string;
  handed_over_at?: string;
};
type Finance = { gross: number; commission: number; payout: number; bookings: number; users: number; merchants: number; vehicles: number };
type SortKey = 'customer' | 'date' | 'amount' | 'status';
type SortOrder = 'asc' | 'desc';

export default function AdminApp() {
  const router = useRouter();
  const [token, setTok] = useState<string | null>(null);
  const [screen, setScreen] = useState<AdminScreen>('overview');
  const [kyc, setKyc] = useState<KycItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [vehicles, setVehicles] = useState<AdminVehicle[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [finance, setFinance] = useState<Finance | null>(null);

  useEffect(() => {
    const t = getToken();
    setTok(t);
    if (!t) return;
  }, []);

  const refresh = async () => {
    if (!token) return;
    try {
      const [k, p, u, m, v, f, b] = await Promise.all([
        api('/admin/kyc/pending').catch(() => []),
        api('/admin/payments/pending').catch(() => []),
        api('/admin/users').catch(() => []),
        api('/admin/merchants').catch(() => []),
        api('/admin/vehicles').catch(() => []),
        api('/admin/finance/summary').catch(() => null),
        api('/admin/bookings').catch(() => []),
      ]);
      setKyc(k); setPayments(p); setUsers(u); setMerchants(m); setVehicles(v); setFinance(f); setBookings(b);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { refresh(); }, [token]);

  const onLogout = () => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    clearAuth();
    router.push('/');
  };

  if (!token) {
    return (
      <div className={styles.wrap}>
        <div className={styles.gate}>
          <Link href="/" className={styles.back}>← Back</Link>
          <div className={styles.gateCard}>
            <div className={styles.gateBrand}>
              <div className={styles.logo}>JJ</div>
              <div>
                <strong>Super Admin</strong>
                <small>Journey Junction Console</small>
              </div>
            </div>
            <p>Login to access platform-wide controls: KYC approvals, payment verification, finance summary.</p>
            <Link href="/" className={styles.gateCta}>Go to Home &amp; Login</Link>
          </div>
        </div>
      </div>
    );
  }

  const approveKyc = async (account_type: 'user' | 'merchant', account_id: string) => {
    await api('/admin/kyc/approve', { method: 'POST', body: JSON.stringify({ type: account_type, id: account_id }) });
    refresh();
  };

  const rejectKyc = async (account_type: 'user' | 'merchant', account_id: string) => {
    await api('/admin/kyc/reject', { method: 'POST', body: JSON.stringify({ type: account_type, id: account_id }) });
    refresh();
  };

  const verifyPayment = async (payment_id: string) => {
    await api('/admin/payments/verify', { method: 'POST', body: JSON.stringify({ payment_id }) });
    refresh();
  };

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.logo}>JJ</div>
          <div><strong>Journey Junction</strong><small>Admin Console</small></div>
        </div>
        <nav className={styles.nav}>
          <NavBtn label="Overview" icon="📊" active={screen === 'overview'} onClick={() => setScreen('overview')} />
          <NavBtn label="KYC Queue" icon="🪪" active={screen === 'kyc'} onClick={() => setScreen('kyc')} badge={kyc.length || undefined} />
          <NavBtn label="Payments" icon="💳" active={screen === 'payments'} onClick={() => setScreen('payments')} badge={payments.length || undefined} />
          <NavBtn label="Bookings" icon="📅" active={screen === 'bookings'} onClick={() => setScreen('bookings')} badge={bookings.length || undefined} />
          <NavBtn label="History" icon="📜" active={screen === 'history'} onClick={() => setScreen('history')} badge={bookings.length || undefined} />
          <NavBtn label="Vehicles" icon="🚗" active={screen === 'vehicles'} onClick={() => setScreen('vehicles')} />
          <NavBtn label="Users" icon="👥" active={screen === 'users'} onClick={() => setScreen('users')} />
          <NavBtn label="Merchants" icon="🏪" active={screen === 'merchants'} onClick={() => setScreen('merchants')} />
          <NavBtn label="Finance" icon="💰" active={screen === 'finance'} onClick={() => setScreen('finance')} />
        </nav>
        <button onClick={onLogout} className={styles.logoutBtn}>Logout</button>
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}>
          <h2 className={styles.pageH}>{labelFor(screen)}</h2>
          <div className={styles.userBox}><div className={styles.avatar}>A</div></div>
        </header>
        <div className={styles.body}>
          {screen === 'overview' && <Overview finance={finance} kycCount={kyc.length} payCount={payments.length} bookingCount={bookings.length} onJump={(s) => setScreen(s)} />}
          {screen === 'kyc' && <Kyc kyc={kyc} onApprove={approveKyc} onReject={rejectKyc} />}
          {screen === 'payments' && <Payments payments={payments} onVerify={verifyPayment} />}
          {screen === 'users' && <Users users={users} />}
          {screen === 'merchants' && <Merchants merchants={merchants} />}
          {screen === 'vehicles' && <Vehicles vehicles={vehicles} />}
          {screen === 'bookings' && <BookingsTable bookings={bookings} />}
          {screen === 'history' && <HistoryPanel bookings={bookings} />}
          {screen === 'finance' && <FinancePanel finance={finance} />}
        </div>
      </main>
    </div>
  );
}

function labelFor(s: AdminScreen) {
  return s === 'overview' ? 'Platform Overview'
    : s === 'kyc' ? 'KYC Verification Queue'
    : s === 'payments' ? 'Payment Verification'
    : s === 'users' ? 'Customers'
    : s === 'merchants' ? 'Merchants'
    : s === 'finance' ? 'Finance Summary'
    : s === 'bookings' ? 'All Bookings'
    : s === 'history' ? 'Booking History'
    : 'Vehicles';
}

function NavBtn({ label, icon, active, onClick, badge }: { label: string; icon: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button className={active ? styles.navBtnActive : styles.navBtn} onClick={onClick}>
      <span>{icon}</span><span>{label}</span>
      {badge ? <span className={styles.badge}>{badge}</span> : null}
    </button>
  );
}

function Overview({ finance, kycCount, payCount, bookingCount, onJump }: { finance: Finance | null; kycCount: number; payCount: number; bookingCount: number; onJump: (s: AdminScreen) => void }) {
  return (
    <>
      <div className={styles.stats}>
        <Stat label="Total Users" value={finance?.users ?? 0} icon="👥" />
        <Stat label="Merchants" value={finance?.merchants ?? 0} icon="🏪" />
        <Stat label="Vehicles" value={finance?.vehicles ?? 0} icon="🚗" />
        <Stat label="Bookings" value={bookingCount} icon="📅" />
        <Stat label="Gross Volume" value={formatINR(finance?.gross ?? 0)} icon="💰" yellow />
        <Stat label="Commission (30%)" value={formatINR(finance?.commission ?? 0)} icon="💼" yellow />
        <Stat label="Merchant Payout" value={formatINR(finance?.payout ?? 0)} icon="💸" yellow />
        <Stat label="Pending KYC" value={kycCount} icon="🪪" />
        <Stat label="Pending Payments" value={payCount} icon="💳" />
      </div>
      <div className={styles.split}>
        <button onClick={() => onJump('kyc')} className={styles.quickBtn}>🪪 Review KYC Queue ({kycCount})</button>
        <button onClick={() => onJump('payments')} className={styles.quickBtn}>💳 Verify Payments ({payCount})</button>
        <button onClick={() => onJump('bookings')} className={styles.quickBtn}>📅 All Bookings ({bookingCount})</button>
        <button onClick={() => onJump('finance')} className={styles.quickBtn}>💰 Finance Summary</button>
      </div>
    </>
  );
}

function Stat({ label, value, icon, yellow }: { label: string; value: string | number; icon: string; yellow?: boolean }) {
  return (
    <div className={styles.statCard}>
      <div><div className={styles.statLabel}>{label}</div><div className={styles.statValue}>{value}</div></div>
      <div className={yellow ? styles.statIconYellow : styles.statIcon}>{icon}</div>
    </div>
  );
}

function Kyc({ kyc, onApprove, onReject }: { kyc: KycItem[]; onApprove: (t: 'user' | 'merchant', id: string) => void; onReject: (t: 'user' | 'merchant', id: string) => void }) {
  if (!kyc.length) return <div className={styles.empty}>✓ No pending KYC. All accounts are verified.</div>;
  return (
    <div className={styles.cardList}>
      {kyc.map(k => (
        <div key={k.id + k.account_type} className={styles.kycCard}>
          <div>
            <div className={styles.kycHeader}>
              <span className={k.account_type === 'merchant' ? styles.tagMerchant : styles.tagUser}>{k.account_type}</span>
              <strong>{k.full_name || k.business_name || k.email}</strong>
            </div>
            <p className={styles.email}>{k.email}</p>
            <p className={styles.muted}>{k.account_type === 'user' ? `${k.id_document_type || 'ID'} · ${k.driving_license_front_url ? 'DL front ✓' : 'no DL front'} · ${k.driving_license_back_url ? 'back ✓' : 'no DL back'}` : `${k.business_doc_url ? 'GST/PAN ✓' : 'no docs'} · ${k.identity_doc_url ? 'ID ✓' : 'no ID'}`}</p>
            {k.account_type === 'user' && (k.driving_license_front_url || k.driving_license_back_url) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {k.driving_license_front_url && (
                  <a href={k.driving_license_front_url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                    <img src={k.driving_license_front_url} alt="DL front" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                    <small style={{ display: 'block', textAlign: 'center', color: '#6b7280' }}>DL Front</small>
                  </a>
                )}
                {k.driving_license_back_url && (
                  <a href={k.driving_license_back_url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                    <img src={k.driving_license_back_url} alt="DL back" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                    <small style={{ display: 'block', textAlign: 'center', color: '#6b7280' }}>DL Back</small>
                  </a>
                )}
              </div>
            )}
          </div>
          <div className={styles.actions}>
            <button onClick={() => onApprove(k.account_type, k.id)} className={styles.btnApprove}>Approve</button>
            <button onClick={() => onReject(k.account_type, k.id)} className={styles.btnReject}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Payments({ payments, onVerify }: { payments: PaymentItem[]; onVerify: (id: string) => void }) {
  if (!payments.length) return <div className={styles.empty}>✓ No payments awaiting verification.</div>;
  return (
    <div className={styles.cardList}>
      {payments.map(p => (
        <div key={p.id} className={styles.payCard}>
          <div>
            <div className={styles.kycHeader}>
              <span className={styles.tagYellow}>{p.stage === 'advance' ? '50% Advance' : 'Balance'}</span>
              <strong>Booking {p.booking_id.slice(0, 8)}</strong>
            </div>
            <p className={styles.email}>{p.user_name} · {p.vehicle_title}</p>
            {p.booking_status && <p className={styles.muted}>Booking status: <strong>{p.booking_status}</strong> · payment: {p.payment_status}</p>}
            <p className={styles.muted}>UPI ref: <code>{p.upi_reference}</code></p>
          </div>
          <div className={styles.payRight}>
            <strong className={styles.payAmt}>{formatINR(p.amount)}</strong>
            <button onClick={() => onVerify(p.id)} className={styles.btnApprove}>Verify</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Users({ users }: { users: AdminUser[] }) {
  if (!users.length) return <div className={styles.empty}>No users yet.</div>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Name</th><th>Email</th><th>KYC</th><th>Joined</th></tr></thead>
        <tbody>{users.map(u => (<tr key={u.id}><td>{u.full_name}</td><td>{u.email}</td><td><span className={u.kyc_status === 'approved' ? styles.statusOk : styles.statusMuted}>{u.kyc_status}</span></td><td>{u.created_at?.slice(0, 10)}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

function Merchants({ merchants }: { merchants: AdminMerchant[] }) {
  if (!merchants.length) return <div className={styles.empty}>No merchants registered.</div>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Business</th><th>Owner</th><th>Email</th><th>City</th><th>State</th><th>Status</th></tr></thead>
        <tbody>{merchants.map(m => (<tr key={m.id}><td>{m.business_name}</td><td>{m.owner_name}</td><td>{m.email}</td><td>{m.city}</td><td>{m.state}</td><td><span className={m.is_approved ? styles.statusOk : styles.statusMuted}>{m.kyc_status}</span></td></tr>))}</tbody>
      </table>
    </div>
  );
}

function Vehicles({ vehicles }: { vehicles: AdminVehicle[] }) {
  if (!vehicles.length) return <div className={styles.empty}>No vehicles in catalog.</div>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Title</th><th>Category</th><th>Price/Day</th><th>Merchant</th><th>Available</th></tr></thead>
        <tbody>{vehicles.map(v => (
          <tr key={v.id}>
            <td>{v.title}</td>
            <td>{v.category}</td>
            <td>{formatINR(v.price_per_day)}</td>
            <td>{v.merchant_name}</td>
            <td>
              <span className={v.availability_status === 'booked' ? styles.statusWarn : v.is_available ? styles.statusOk : styles.statusMuted}>
                {v.availability_status === 'booked' ? '🔴 Booked' : v.is_available ? '🟢 Available' : '⚪ Unavailable'}
              </span>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function BookingsTable({ bookings }: { bookings: BookingRow[] }) {
  const [page, setPage] = useState(1);
  const [paged, setPaged] = useState<Paged<BookingRow> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = (p: number) => {
    setLoading(true);
    api(`/admin/bookings?page=${p}&limit=10`).then(d => { setPaged(d); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  const sortHeader = (key: SortKey, label: string) => (
    <th style={{ cursor: 'default', whiteSpace: 'nowrap' }}>{label}</th>
  );

  if (!paged || loading) return <div className={styles.empty}>{loading ? 'Loading...' : 'No bookings yet.'}</div>;
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {sortHeader('customer', 'Customer')}
              <th>Vehicle</th>
              <th>Merchant</th>
              {sortHeader('date', 'Dates')}
              <th>Duration</th>
              {sortHeader('amount', 'Amount')}
              {sortHeader('status', 'Status')}
            </tr>
          </thead>
          <tbody>
            {paged.items.map(b => (
              <tr key={b.id}>
                <td>{b.user_name || b.user_email || '—'}</td>
                <td>{b.vehicle_title}</td>
                <td>{b.merchant_name}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.start_date)} → {fmtDate(b.end_date)}</td>
                <td>{b.duration_days || 1}d</td>
                <td>{formatINR(b.total_amount)}</td>
                <td>
                  <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-start' }}>
                    <span className={paymentToneClass(b.payment_status, styles)}>{paymentLabel(b.payment_status)}</span>
                    <span className={bookingToneClass(b.booking_status, styles)}>{bookingLabel(b.booking_status)}</span>
                    {b.handed_over_at && <small style={{ color:'#15803d' }}>✅ {fmtDate(b.handed_over_at)}</small>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination paged={paged} onChange={setPage} />
    </>
  );
}

function HistoryPanel({ bookings }: { bookings: BookingRow[] }) {
  const [page, setPage] = useState(1);
  const [paged, setPaged] = useState<Paged<BookingRow> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = (p: number) => {
    setLoading(true);
    api(`/admin/bookings?page=${p}&limit=10`).then(d => { setPaged(d); setLoading(false); }).catch(() => setLoading(false));
  };

  useEffect(() => { load(page); }, [page]);

  if (!paged || loading) return <div className={styles.empty}>{loading ? 'Loading...' : 'No booking history yet.'}</div>;

  const sortHeader = (key: SortKey, label: string) => (
    <th style={{ cursor: 'default', whiteSpace: 'nowrap' }}>{label}</th>
  );

  return (
    <>
      <div className={styles.stats} style={{ marginBottom: 16 }}>
        <Stat label="Total Bookings" value={paged.total} icon="📅" />
        <Stat label="On Page" value={paged.items.length} icon="📄" />
        <Stat label="Handed Over" value={paged.items.filter(b => b.booking_status === 'ongoing' || b.booking_status === 'completed').length} icon="🔑" />
        <Stat label="Pending" value={paged.items.filter(b => b.payment_status === 'pending_advance').length} icon="⏳" />
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {sortHeader('customer', 'Customer')}
              <th>Vehicle</th>
              <th>Merchant</th>
              {sortHeader('date', 'Dates')}
              <th>Duration</th>
              {sortHeader('amount', 'Amount')}
              {sortHeader('status', 'Status')}
            </tr>
          </thead>
          <tbody>
            {paged.items.map(b => (
              <tr key={b.id}>
                <td>{b.user_name || b.user_email || '—'}</td>
                <td>{b.vehicle_title}</td>
                <td>{b.merchant_name}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(b.start_date)} → {fmtDate(b.end_date)}</td>
                <td>{b.duration_days || 1}d</td>
                <td>{formatINR(b.total_amount)}</td>
                <td>
                  <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-start' }}>
                    <span className={paymentToneClass(b.payment_status, styles)}>{paymentLabel(b.payment_status)}</span>
                    <span className={bookingToneClass(b.booking_status, styles)}>{bookingLabel(b.booking_status)}</span>
                    {b.handed_over_at && <small style={{ color:'#15803d' }}>✅ {fmtDate(b.handed_over_at)}</small>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination paged={paged} onChange={setPage} />
    </>
  );
}

function FinancePanel({ finance }: { finance: Finance | null }) {
  if (!finance) return <div className={styles.empty}>No finance data.</div>;
  return (
    <div className={styles.financeGrid}>
      <div className={styles.financeCard}><span>Total Bookings</span><strong>{finance.bookings}</strong></div>
      <div className={styles.financeCard}><span>Gross Volume</span><strong>{formatINR(finance.gross)}</strong></div>
      <div className={styles.financeCardYellow}><span>Platform Commission (30%)</span><strong>{formatINR(finance.commission)}</strong></div>
      <div className={styles.financeCardYellow}><span>Merchant Payout (70%)</span><strong>{formatINR(finance.payout)}</strong></div>
      <div className={styles.financeCard}><span>Active Users</span><strong>{finance.users}</strong></div>
      <div className={styles.financeCard}><span>Active Merchants</span><strong>{finance.merchants}</strong></div>
      <div className={styles.financeCard}><span>Listed Vehicles</span><strong>{finance.vehicles}</strong></div>
    </div>
  );
}
