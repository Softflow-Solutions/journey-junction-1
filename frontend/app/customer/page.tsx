'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getToken, clearAuth } from '../../lib/api';
import { formatINR, PLACEHOLDER } from '../../lib/format';
import { paymentLabel, bookingLabel, bookingToneClass, paymentToneClass, fmtDate } from '../../lib/status';
import { Pagination, Paged } from '../../lib/pagination';
import styles from './customer.module.css';

type Vehicle = {
  id: string;
  title: string;
  category: '2_wheeler' | '4_wheeler';
  seating_capacity: number;
  price_per_day: number;
  description?: string;
  merchant_name?: string;
  city?: string;
  image_urls: string[];
  availability_status?: string;
};

function VehicleImage({ v, large }: { v: Vehicle; large?: boolean }) {
  const src = (v.image_urls && v.image_urls[0]) || PLACEHOLDER;
  return (
    <div className={large ? styles.imgLg : styles.imgSm}>
      <img src={src} alt={v.title} loading="lazy" />
    </div>
  );
}

type Screen = 'home' | 'search' | 'detail' | 'bookings' | 'history' | 'profile' | 'kyc' | 'support';

export default function CustomerApp() {
  const router = useRouter();
  const [token, setTok] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [screen, setScreen] = useState<Screen>('home');
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [catFilter, setCatFilter] = useState<'all' | '2_wheeler' | '4_wheeler'>('all');
  const [sort, setSort] = useState<'best' | 'price_low' | 'price_high'>('best');
  const [chatOpen, setChatOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => { setTok(getToken()); refresh(); }, []);

  const refresh = async () => {
    try {
      const params = new URLSearchParams();
      if (catFilter !== 'all') params.set('category', catFilter);
      const data = await api(`/vehicles/search?${params.toString()}`);
      setVehicles(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { refresh(); }, [catFilter]);

  useEffect(() => {
    if (!token) { setRecommendations([]); return; }
    api('/ai/recommendations').then(d => setRecommendations(d.recommendations || [])).catch(() => setRecommendations([]));
  }, [token]);

  let list = [...vehicles];
  if (sort === 'price_low') list.sort((a, b) => a.price_per_day - b.price_per_day);
  else if (sort === 'price_high') list.sort((a, b) => b.price_per_day - a.price_per_day);

  const onLogout = () => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    clearAuth();
    setTok(null);
    router.push('/');
  };

  const homeAvailable = list.filter(v => v.availability_status !== 'booked');
  const featured = homeAvailable[0] || null;
  const deals = homeAvailable.slice(1, 5);

  return (
    <div className={styles.stage}>
      <header className={styles.topHeader}>
        <div className={styles.topHeaderInner}>
          <Link href="/" className={styles.topLogo}>JJ</Link>
          <strong>Journey Junction</strong>
          <div className={styles.topActions}>
            {token ? (
              <>
                <button type="button" onClick={() => setScreen('profile')} className={styles.topBtn}>My Profile</button>
                <button type="button" onClick={() => setScreen('bookings')} className={styles.topBtn}>My Bookings</button>
                <button onClick={onLogout} className={styles.topBtnSolid}>Logout</button>
              </>
            ) : (
              <Link href="/" className={styles.topBtn}>Home</Link>
            )}
          </div>
        </div>
      </header>
      <div className={styles.phone}>
        <div className={styles.screen}>
          {screen === 'home' && (
            <HomeScreen
              vehicles={vehicles}
              featured={featured}
              deals={deals}
              recommendations={recommendations}
              onDetail={(v) => { setSelected(v); setScreen('detail'); }}
              onSearch={() => setScreen('search')}
              token={!!token}
            />
          )}
          {screen === 'search' && <SearchScreen vehicles={list} catFilter={catFilter} setCatFilter={setCatFilter} sort={sort} setSort={setSort} onDetail={(v) => { setSelected(v); setScreen('detail'); }} onBack={() => setScreen('home')} token={!!token} />}
          {screen === 'detail' && selected && <DetailScreen vehicle={selected} onBack={() => setScreen('search')} token={!!token} />}
          {screen === 'bookings' && <BookingsScreen token={!!token} />}
          {screen === 'history' && <HistoryScreen token={!!token} />}
          {screen === 'profile' && <ProfileScreen token={!!token} onLogout={onLogout} onKyc={() => setScreen('kyc')} onSupport={() => setScreen('support')} />}
          {screen === 'kyc' && <KycScreen token={!!token} onBack={() => setScreen('profile')} />}
          {screen === 'support' && <SupportScreen onBack={() => setScreen('profile')} />}
        </div>
        <div className={styles.nav}>
          <button onClick={() => setScreen('home')} className={screen === 'home' ? styles.navActive : styles.navBtn}>🏠 Home</button>
          <button onClick={() => setScreen('search')} className={screen === 'search' ? styles.navActive : styles.navBtn}>🔍 Search</button>
          <button onClick={() => setScreen('bookings')} className={screen === 'bookings' ? styles.navActive : styles.navBtn}>📅 Bookings</button>
          <button onClick={() => setScreen('history')} className={screen === 'history' ? styles.navActive : styles.navBtn}>📜 History</button>
          <button onClick={() => setScreen('profile')} className={screen === 'profile' ? styles.navActive : styles.navBtn}>👤 {token ? 'Account' : 'Login'}</button>
        </div>
        <button
          aria-label="Open AI assistant"
          onClick={() => setChatOpen(true)}
          className={styles.chatFab}
        >💬</button>
        {chatOpen && (
          <ChatPanel token={token} onClose={() => setChatOpen(false)} />
        )}
      </div>
    </div>
  );
}

type ChatMsg = { role: 'user' | 'assistant'; text: string };

function ChatPanel({ token, onClose }: { token: string | null; onClose: () => void }) {
  const SESSION_KEY = 'jj_chat_session';
  const [sessionId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    let s = localStorage.getItem(SESSION_KEY);
    if (!s) {
      s = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now());
      localStorage.setItem(SESSION_KEY, s);
    }
    return s;
  });
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'assistant', text: 'Hi! I am the Journey Junction AI. Ask me anything about vehicles, bookings, KYC, or payments.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    if (!token) {
      setMessages(m => [...m, { role: 'assistant', text: 'Please login first to chat with the AI.' }]);
      setInput('');
      return;
    }
    setInput('');
    setMessages(m => [...m, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const data = await api('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: q, session_id: sessionId }),
      });
      setMessages(m => [...m, { role: 'assistant', text: data.reply || 'No response.' }]);
    } catch (e: any) {
      setMessages(m => [...m, { role: 'assistant', text: 'Error: ' + (e?.message || 'AI unavailable') }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.chatOverlay} role="dialog" aria-label="AI assistant">
      <div className={styles.chatPanel}>
        <div className={styles.chatHeader}>
          <div>
            <strong>🤖 Journey Junction AI</strong>
            <small>Powered by Gemini · ask anything</small>
          </div>
          <button onClick={onClose} className={styles.chatClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.chatMsgs}>
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? styles.bubbleUser : styles.bubbleAi}>
              {m.text}
            </div>
          ))}
          {loading && <div className={styles.bubbleAi}><em>typing…</em></div>}
        </div>
        <div className={styles.chatInput}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="SUV for family trip, payment help…"
            disabled={loading}
          />
          <button onClick={send} disabled={loading || !input.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
}

function AiRecommendations({ recs, onDetail }: { recs: any[]; onDetail: (v: any) => void }) {
  if (!recs || recs.length === 0) return null;
  return (
    <>
      <div className={styles.sectionHeader}>
        <h3>✨ Recommended for You</h3>
        <small style={{ color: '#6b7280' }}>based on your history</small>
      </div>
      <div className={styles.recoStrip}>
        {recs.map((r: any) => (
          <div key={r.id} className={styles.recoCard} onClick={() => onDetail(r)}>
            <img src={(r.image_urls && r.image_urls[0]) || PLACEHOLDER} alt={r.title} loading="lazy" />
            <strong>{r.title}</strong>
            <small>{r.reason || 'Recommended match'}</small>
            <span>{formatINR(r.price_per_day)}/day</span>
          </div>
        ))}
      </div>
    </>
  );
}

function HomeScreen({ vehicles, featured, deals, recommendations, onDetail, onSearch, token }: { vehicles: Vehicle[]; featured: Vehicle | null; deals: Vehicle[]; recommendations: any[]; onDetail: (v: any) => void; onSearch: () => void; token: boolean }) {
  const availableVehicles = vehicles.filter(v => v.availability_status !== 'booked');
  return (
    <div className={styles.scroll}>
      <div className={styles.header}>
        <div className={styles.greet}>
          <span className={styles.wave}>👋</span>
          <div>
            <strong>Hello, Traveler</strong>
            <small>Find your next ride across India</small>
          </div>
        </div>
      </div>
      {token && recommendations.length > 0 && <AiRecommendations recs={recommendations} onDetail={onDetail} />}
      {featured ? (
        <div className={styles.featured} onClick={() => onDetail(featured)}>
          <VehicleImage v={featured} large />
          <div className={styles.featuredBody}>
            <div>
              <strong>{featured.title}</strong>
              <small>{featured.merchant_name} · {featured.city}</small>
            </div>
            <span className={styles.featuredPrice}>{formatINR(featured.price_per_day)}<small>/day</small></span>
          </div>
          <span className={styles.badgeAvailable} style={{ marginTop: 8 }}>🟢 Available</span>
        </div>
      ) : (
        <div className={styles.featured}><div className={styles.empty}>No vehicles available right now. Check back soon or browse all.</div></div>
      )}
      <div className={styles.availableCard} onClick={onSearch}>
        <div>
          <strong>Explore All Vehicles</strong>
          <p>2-wheelers &amp; 4-wheelers · Long &amp; short term</p>
        </div>
        <span className={styles.arrow}>→</span>
      </div>
      <div className={styles.sectionHeader}>
        <h3>Popular Picks ({availableVehicles.length})</h3>
        <span onClick={onSearch}>View all ›</span>
      </div>
      <div className={styles.dealList}>
        {deals.length === 0 && availableVehicles.length === 0 ? (
          <div className={styles.emptyCard}>No vehicles available right now. Check back soon.</div>
        ) : deals.map(v => (
          <div key={v.id} className={styles.dealCard} onClick={() => onDetail(v)}>
            <VehicleImage v={v} />
            <strong>{v.title}</strong>
            <small>{v.merchant_name}</small>
            <span className={styles.badgeAvailable}>🟢 Available</span>
            <div className={styles.dealPrice}>{formatINR(v.price_per_day)}<span>/day</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SearchScreen({ vehicles, catFilter, setCatFilter, sort, setSort, onDetail, onBack, token }: { vehicles: Vehicle[]; catFilter: 'all' | '2_wheeler' | '4_wheeler'; setCatFilter: (c: any) => void; sort: 'best' | 'price_low' | 'price_high'; setSort: (s: any) => void; onDetail: (v: Vehicle) => void; onBack: () => void; token: boolean }) {
  return (
    <div className={styles.scroll}>
      <div className={styles.searchHeader}>
        <button onClick={onBack} className={styles.backBtn}>←</button>
        <h2>All Vehicles ({vehicles.length})</h2>
      </div>
      <div className={styles.chips}>
        <button className={catFilter === 'all' ? styles.chipActive : styles.chip} onClick={() => setCatFilter('all')}>All</button>
        <button className={catFilter === '4_wheeler' ? styles.chipActive : styles.chip} onClick={() => setCatFilter('4_wheeler')}>4-Wheeler</button>
        <button className={catFilter === '2_wheeler' ? styles.chipActive : styles.chip} onClick={() => setCatFilter('2_wheeler')}>2-Wheeler</button>
      </div>
      <div className={styles.searchList}>
        {vehicles.length === 0 && <div className={styles.emptyCard}>No vehicles match this filter.</div>}
        {vehicles.map(v => (
          <div
            key={v.id}
            className={styles.searchCard}
            onClick={() => v.availability_status !== 'booked' && onDetail(v)}
            style={v.availability_status === 'booked' ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
          >
            <VehicleImage v={v} />
            <strong>{v.title}</strong>
            <small>{v.merchant_name} · {v.city}</small>
            {v.availability_status === 'booked'
              ? <span className={styles.badgeBooked}>🔴 Booked</span>
              : <span className={styles.badgeAvailable}>🟢 Available</span>}
            <div className={styles.searchPrice}>{formatINR(v.price_per_day)}<span>/day</span></div>
          </div>
        ))}
      </div>
      <div className={styles.filterBar}>
        <button className={sort === 'best' ? styles.filterActive : styles.filterBtn} onClick={() => setSort('best')}>📊 Best Match</button>
        <button className={sort === 'price_high' ? styles.filterActive : styles.filterBtn} onClick={() => setSort('price_high')}>Highest Price</button>
        <button className={sort === 'price_low' ? styles.filterActive : styles.filterBtn} onClick={() => setSort('price_low')}>Lowest Price</button>
      </div>
    </div>
  );
}

function DetailScreen({ vehicle, onBack, token }: { vehicle: Vehicle; onBack: () => void; token: boolean }) {
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [upi, setUpi] = useState('');
  const [error, setError] = useState('');

  const book = async () => {
    if (!token) { window.location.href = '/'; return; }
    if (!start || !end) { setError('Pick start and end dates'); return; }
    if (!upi || upi.trim().length < 4) { setError('Enter a valid UPI reference (min 4 chars)'); return; }
    setLoading(true); setError('');
    try {
      const data = await api('/bookings', { method: 'POST', body: JSON.stringify({ vehicle_id: vehicle.id, start_date: start, end_date: end, upi_reference: upi.trim() }) });
      setBooking(data);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className={styles.scroll}>
      <div className={styles.detailHeader}>
        <button onClick={onBack} className={styles.backBtn}>←</button>
        <strong style={{ fontSize: 16 }}>Detail</strong>
      </div>
      <div style={{ background: 'white', borderRadius: 16, padding: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
        <VehicleImage v={vehicle} large />
      </div>
      <h2 className={styles.detailTitle}>{vehicle.title}</h2>
      <p className={styles.detailMerchant}>{vehicle.merchant_name} · {vehicle.city}</p>
      <p className={styles.desc}>{vehicle.description}</p>
      <div className={styles.priceCard}>
        <span>Per day</span>
        <strong>{formatINR(vehicle.price_per_day)}</strong>
      </div>
      {vehicle.availability_status === 'booked' ? (
        <div className={styles.bookForm}>
          <div className={styles.badgeBooked} style={{ fontSize: 14, padding: '8px 14px' }}>🔴 Currently Booked</div>
          <p className={styles.fineprint}>This vehicle is on an active rental. It will become available once the merchant marks the booking as completed.</p>
        </div>
      ) : !booking ? (
        <div className={styles.bookForm}>
          <h4>Book this vehicle</h4>
          <p className={styles.fineprint} style={{ marginTop: 0, marginBottom: 12 }}>Pay 50% advance now to reserve this vehicle. Your booking will be confirmed only after admin verifies your advance payment.</p>
          <label>Start date<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label>End date<input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
          <label>UPI reference<input type="text" value={upi} onChange={e => setUpi(e.target.value)} placeholder="e.g. UPI/1234567890/PAY" /></label>
          {error && <div className={styles.err}>{error}</div>}
          <button onClick={book} disabled={loading} className={styles.cta}>{loading ? 'Submitting...' : 'Pay Advance & Reserve'}</button>
        </div>
      ) : (
        <div className={styles.bookForm}>
          <h4>Booking Submitted ⏳</h4>
          <div className={styles.bookInfo}><span>Total</span><strong>{formatINR(booking.total_amount)}</strong></div>
          <div className={styles.bookInfo}><span>Advance (50%)</span><strong>{formatINR(booking.advance_amount)}</strong></div>
          <div className={styles.bookInfo}><span>Balance (50%)</span><strong>{formatINR(booking.balance_amount)}</strong></div>
          <div className={styles.bookInfo}><span>Duration</span><strong>{booking.duration_days} day{booking.duration_days > 1 ? 's' : ''}</strong></div>
          <div className={styles.bookInfo}><span>Payment</span><strong className={paymentToneClass(booking.payment_status, styles)}>{paymentLabel(booking.payment_status)}</strong></div>
          <div className={styles.bookInfo}><span>Status</span><strong className={bookingToneClass(booking.booking_status, styles)}>{bookingLabel(booking.booking_status)}</strong></div>
          <p className={styles.fineprint}>Your advance payment reference is submitted. <strong>Status: Advance Paid.</strong> Admin will verify your advance payment within 24 hours. Once verified, this booking will appear in My Bookings and the merchant will hand over the vehicle.</p>
        </div>
      )}
    </div>
  );
}

function BookingsScreen({ token }: { token: boolean }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api('/user/bookings?limit=100').then(d => {
      const items = Array.isArray(d) ? d : (d?.items || []);
      setBookings(items);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [token]);
  if (!token) return <div className={styles.scroll}><div className={styles.emptyCard}>Please login from home to view bookings.</div></div>;
  if (loading) return <div className={styles.scroll}><div className={styles.emptyCard}>Loading...</div></div>;
  const confirmed = bookings.filter(b => b.booking_status !== 'awaiting_payment');
  const pendingCount = bookings.filter(b => b.booking_status === 'awaiting_payment').length;
  if (!bookings.length) return <div className={styles.scroll}><div className={styles.emptyCard}>No bookings yet. Browse vehicles to book.</div></div>;
  return (
    <div className={styles.scroll}>
      <h2 className={styles.pageTitle}>My Bookings</h2>
      {pendingCount > 0 && (
        <div className={styles.pendingCard}>
          ⏳ {pendingCount} booking{pendingCount > 1 ? 's' : ''} with advance paid, pending verification. They will appear here once confirmed.
        </div>
      )}
      {confirmed.length === 0 && (
        <div className={styles.emptyCard}>No confirmed bookings yet.</div>
      )}
      {confirmed.map(b => (
        <div key={b.id} className={styles.bookingCard}>
          <div className={styles.bookingImg}><img src={b.vehicle_image || PLACEHOLDER} alt={b.vehicle_title} loading="lazy" /></div>
          <div className={styles.bookingInfo}>
            <strong>{b.vehicle_title}</strong>
            <p>{fmtDate(b.start_date)} → {fmtDate(b.end_date)} <small style={{ color:'#6b7280' }}>({b.duration_days} day{b.duration_days > 1 ? 's' : ''})</small></p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <span className={paymentToneClass(b.payment_status, styles)}>{paymentLabel(b.payment_status)}</span>
              <span className={bookingToneClass(b.booking_status, styles)}>{bookingLabel(b.booking_status)}</span>
            </div>
            {b.handed_over_at && <small style={{ color:'#16a34a' }}>✅ Vehicle handed over on {fmtDate(b.handed_over_at)}</small>}
          </div>
          <strong>{formatINR(b.total_amount)}</strong>
        </div>
      ))}
    </div>
  );
}

type SortKey = 'date' | 'amount' | 'status' | 'duration';
type SortOrder = 'asc' | 'desc';

function HistoryScreen({ token }: { token: boolean }) {
  const [paged, setPaged] = useState<Paged<any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [pendingCount, setPendingCount] = useState(0);

  const load = (p: number) => {
    if (!token) return;
    setLoading(true);
    api(`/user/bookings?page=${p}&limit=5`).then(d => { setPaged(d); setLoading(false); }).catch(() => setLoading(false));
    api(`/user/bookings?limit=100`).then(d => {
      const items = Array.isArray(d) ? d : (d?.items || []);
      setPendingCount(items.filter(b => b.booking_status === 'awaiting_payment').length);
    }).catch(() => setPendingCount(0));
  };

  useEffect(() => { load(page); }, [token, page]);

  const sortedItems = useMemo(() => {
    if (!paged) return [];
    const arr = [...paged.items].filter(b => b.booking_status !== 'awaiting_payment');
    const mult = sortOrder === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case 'amount':
          av = a.total_amount || 0; bv = b.total_amount || 0; break;
        case 'status':
          av = `${a.payment_status}|${a.booking_status}`;
          bv = `${b.payment_status}|${b.booking_status}`; break;
        case 'duration':
          av = a.duration_days || 0; bv = b.duration_days || 0; break;
        case 'date':
        default:
          av = a.created_at || a.start_date || '';
          bv = b.created_at || b.start_date || '';
          break;
      }
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return 0;
    });
    return arr;
  }, [paged, sortKey, sortOrder]);

  if (!token) return <div className={styles.scroll}><div className={styles.emptyCard}>Please login from home to view history.</div></div>;
  if (loading && !paged) return <div className={styles.scroll}><div className={styles.emptyCard}>Loading...</div></div>;
  if (paged && paged.total === 0) return <div className={styles.scroll}><div className={styles.emptyCard}>No booking history yet. Browse vehicles to make your first booking.</div></div>;
  if (!paged) return null;

  const confirmedTotal = paged.total - pendingCount;

  return (
    <div className={styles.scroll}>
      <h2 className={styles.pageTitle}>📜 Booking History</h2>
      {pendingCount > 0 && (
        <div className={styles.pendingCard}>
          ⏳ {pendingCount} booking{pendingCount > 1 ? 's' : ''} with advance paid, pending verification. They will appear here once confirmed.
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
        <div className={styles.statCard} style={{ padding:10 }}>
          <div className={styles.statLabel}>Total Confirmed</div>
          <div className={styles.statValue} style={{ fontSize:18 }}>{confirmedTotal}</div>
        </div>
        <div className={styles.statCard} style={{ padding:10 }}>
          <div className={styles.statLabel}>Total Spent</div>
          <div className={styles.statValue} style={{ fontSize:18 }}>{formatINR(sortedItems.reduce((s, b) => s + (b.total_amount || 0), 0))}</div>
        </div>
      </div>
      <div className={styles.sortBar}>
        <select value={sortKey} onChange={e => { setSortKey(e.target.value as SortKey); }} className={styles.sortSelect}>
          <option value="date">Sort: Date</option>
          <option value="amount">Sort: Amount</option>
          <option value="duration">Sort: Duration</option>
          <option value="status">Sort: Status</option>
        </select>
        <button className={styles.sortOrderBtn} onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}>
          {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
      </div>
      {sortedItems.length === 0 && (
        <div className={styles.emptyCard}>No confirmed bookings to show yet.</div>
      )}
      {sortedItems.map(b => (
        <div key={b.id} className={styles.bookingCard}>
          <div className={styles.bookingImg}><img src={b.vehicle_image || PLACEHOLDER} alt={b.vehicle_title} loading="lazy" /></div>
          <div className={styles.bookingInfo}>
            <strong>{b.vehicle_title}</strong>
            <p>📅 {fmtDate(b.start_date)} → {fmtDate(b.end_date)} <small style={{ color:'#6b7280' }}>({b.duration_days} day{b.duration_days > 1 ? 's' : ''})</small></p>
            <p style={{ fontSize:11, color:'#9ca3af' }}>Booked on {fmtDate(b.created_at)} · {b.merchant_name}</p>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <span className={paymentToneClass(b.payment_status, styles)}>{paymentLabel(b.payment_status)}</span>
              <span className={bookingToneClass(b.booking_status, styles)}>{bookingLabel(b.booking_status)}</span>
            </div>
            {b.handed_over_at && <small style={{ color:'#16a34a' }}>✅ Handed over {fmtDate(b.handed_over_at)}</small>}
          </div>
          <strong>{formatINR(b.total_amount)}</strong>
        </div>
      ))}
      <Pagination paged={paged} onChange={setPage} />
    </div>
  );
}

function ProfileScreen({ token, onLogout, onKyc, onSupport }: { token: boolean; onLogout: () => void; onKyc: () => void; onSupport: () => void }) {
  if (!token) {
    return (
      <div className={styles.scroll}>
        <div className={styles.emptyCard}>
          <p style={{ marginBottom: 12 }}>You're not logged in.</p>
          <Link href="/" className={styles.cta} style={{ display: 'inline-block', textDecoration: 'none' }}>Go to Home</Link>
        </div>
      </div>
    );
  }
  const u = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('jj_user') || 'null') : null;
  return (
    <div className={styles.scroll}>
      <h2 className={styles.pageTitle}>My Profile</h2>
      <div className={styles.profileCard}>
        <div className={styles.avatarLg}>{(u?.full_name?.[0] || 'U').toUpperCase()}</div>
        <strong>{u?.full_name || 'User'}</strong>
        <small>{u?.email}</small>
        <span className={u?.kyc_status === 'approved' ? styles.statusGreen : styles.statusMuted}>KYC: {u?.kyc_status || 'pending'}</span>
      </div>
      <div className={styles.menuList}>
        <Link href="/customer" className={styles.menuItem}>My Bookings <span>›</span></Link>
        <div className={styles.menuItem} onClick={onKyc}>Driving Licence <span>›</span></div>
        <div className={styles.menuItem} onClick={onSupport}>Help &amp; Support <span>›</span></div>
        <button onClick={onLogout} className={styles.menuItemLogout}>Logout <span>›</span></button>
      </div>
    </div>
  );
}

function KycScreen({ token, onBack }: { token: boolean; onBack: () => void }) {
  const [front, setFront] = useState<string>('');
  const [back, setBack] = useState<string>('');
  const [idUrl, setIdUrl] = useState<string>('');
  const [idType, setIdType] = useState<string>('Aadhaar');
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [open, setOpen] = useState<'front' | 'back' | 'id' | null>(null);

  const readFile = (f: File | null): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!f) return reject(new Error('No file'));
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(r.error || new Error('read failed'));
      r.readAsDataURL(f);
    });

  const loadStatus = async () => {
    if (!token) return;
    try {
      const p = await api('/user/profile');
      setStatus(p.kyc_status || 'pending');
      setFront(p.driving_license_front_url || p.driving_license_url || '');
      setBack(p.driving_license_back_url || '');
      setIdUrl(p.id_document_url || '');
      setIdType(p.id_document_type || 'Aadhaar');
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { loadStatus(); }, [token]);

  const submit = async () => {
    if (!token) { setMsg('Please login first.'); return; }
    if (!front || !back || !idUrl) { setMsg('All 3 documents required.'); return; }
    setBusy(true); setMsg('');
    try {
      const data = await api('/user/kyc/submit', {
        method: 'POST',
        body: JSON.stringify({
          driving_license_front_url: front,
          driving_license_back_url: back,
          id_document_url: idUrl,
          id_document_type: idType,
        }),
      });
      setStatus(data.kyc_status || 'pending');
      setMsg('Submitted. Admin will verify shortly.');
    } catch (e: any) {
      setMsg(e.message || 'Submit failed.');
    } finally { setBusy(false); }
  };

  const statusTone = status === 'approved' ? styles.statusOk : status === 'rejected' ? styles.statusMuted : styles.statusYellow;
  const statusLabel = status ? status.replace('_', ' ') : 'pending';

  return (
    <div className={styles.profile}>
      <div className={styles.profileTop}>
        <button onClick={onBack} className={styles.back}>← Back</button>
        <h2 className={styles.profileTitle}>Driving Licence &amp; KYC</h2>
      </div>

      <div className={styles.kycStatus}>
        <span className={statusTone}>{statusLabel}</span>
      </div>

      <Field
        label="Driving Licence — Front"
        url={front}
        onPick={async (f) => { try { setFront(await readFile(f)); } catch {} }}
        onClear={() => setFront('')}
        open={open === 'front'}
        onPreview={() => setOpen(open === 'front' ? null : 'front')}
      />
      <Field
        label="Driving Licence — Back"
        url={back}
        onPick={async (f) => { try { setBack(await readFile(f)); } catch {} }}
        onClear={() => setBack('')}
        open={open === 'back'}
        onPreview={() => setOpen(open === 'back' ? null : 'back')}
      />
      <Field
        label={`ID Document — ${idType}`}
        url={idUrl}
        onPick={async (f) => { try { setIdUrl(await readFile(f)); } catch {} }}
        onClear={() => setIdUrl('')}
        open={open === 'id'}
        onPreview={() => setOpen(open === 'id' ? null : 'id')}
      />

      <label className={styles.label}>ID Type</label>
      <select className={styles.input} value={idType} onChange={e => setIdType(e.target.value)}>
        <option>Aadhaar</option>
        <option>PAN</option>
        <option>Passport</option>
        <option>Voter ID</option>
      </select>

      {msg && <div className={styles.msgInfo}>{msg}</div>}

      <button className={styles.submit} onClick={submit} disabled={busy}>
        {busy ? 'Submitting…' : status === 'rejected' ? 'Resubmit KYC' : 'Submit KYC'}
      </button>
    </div>
  );
}

function Field({ label, url, onPick, onClear, open, onPreview }: {
  label: string;
  url: string;
  onPick: (f: File | null) => void;
  onClear: () => void;
  open: boolean;
  onPreview: () => void;
}) {
  return (
    <div className={styles.kycField}>
      <div className={styles.kycFieldHead}>
        <span className={styles.kycLabel}>{label}</span>
        {url && <button type="button" className={styles.kycPreview} onClick={onPreview}>{open ? 'Hide' : 'Preview'}</button>}
      </div>
      {open && url && <img src={url} alt={label} className={styles.kycImg} />}
      <div className={styles.kycRow}>
        <label className={styles.kycPick}>
          {url ? 'Replace' : 'Upload'}
          <input type="file" accept="image/*" onChange={e => onPick(e.target.files?.[0] || null)} hidden />
        </label>
        {url && <button type="button" className={styles.kycClear} onClick={onClear}>Remove</button>}
      </div>
    </div>
  );
}

function SupportScreen({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState<number | null>(0);
  const faqs = [
    { q: 'How does the 2-stage payment work?', a: 'Pay 50% advance via UPI to confirm the booking. Admin verifies within minutes. Pay the remaining 50% balance at vehicle handover.' },
    { q: 'When does a vehicle become available again?', a: 'When the merchant marks the booking completed after you return the vehicle. The vehicle reappears in search immediately.' },
    { q: 'What documents are needed?', a: 'Driving licence (front + back) and one government ID (Aadhaar/PAN/Passport/Voter ID). Submit from My Profile → Driving Licence. Admin verifies.' },
    { q: 'How long does KYC take?', a: 'Usually under 24 hours. You will see status updated on the same page after admin review.' },
    { q: 'Can I cancel a booking?', a: 'Yes. Open the booking from My Bookings and use Cancel. Refund rules apply per the cancellation policy shown at booking.' },
    { q: 'How do I contact support?', a: 'Call +91 80000 12345 (24x7) or email support@journeyjunction.com. AI chatbot available bottom-right for instant help.' },
  ];

  return (
    <div className={styles.profile}>
      <div className={styles.profileTop}>
        <button onClick={onBack} className={styles.back}>← Back</button>
        <h2 className={styles.profileTitle}>Help &amp; Support</h2>
      </div>

      <div className={styles.supportContact}>
        <a href="tel:+918000012345" className={styles.supportCard}>
          <span className={styles.supportIcon}>📞</span>
          <div>
            <strong>Call us</strong>
            <small>+91 80000 12345 · 24x7</small>
          </div>
        </a>
        <a href="mailto:support@journeyjunction.com" className={styles.supportCard}>
          <span className={styles.supportIcon}>✉️</span>
          <div>
            <strong>Email us</strong>
            <small>support@journeyjunction.com</small>
          </div>
        </a>
        <a href="https://wa.me/918000012345" target="_blank" rel="noreferrer" className={styles.supportCard}>
          <span className={styles.supportIcon}>💬</span>
          <div>
            <strong>WhatsApp</strong>
            <small>+91 80000 12345</small>
          </div>
        </a>
      </div>

      <h3 className={styles.supportH}>FAQs</h3>
      <div className={styles.faqList}>
        {faqs.map((f, i) => (
          <div key={i} className={styles.faqItem}>
            <button className={styles.faqQ} onClick={() => setOpen(open === i ? null : i)}>
              <span>{f.q}</span>
              <span className={styles.faqChev}>{open === i ? '−' : '+'}</span>
            </button>
            {open === i && <div className={styles.faqA}>{f.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
