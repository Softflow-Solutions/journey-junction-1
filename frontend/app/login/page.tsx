'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { api, setToken } from '../../lib/api';
import styles from './login.module.css';

type RoleKey = 'customer' | 'merchant' | 'admin';

const ROLES: Array<{
  key: RoleKey;
  label: string;
  tagline: string;
  email: string;
  dest: string;
  img: string;
  icon: string;
  badge: string;
  badgeColor: string;
  accent: string;
  benefits: string[];
}> = [
  {
    key: 'customer',
    label: 'Customer',
    tagline: 'Book vehicles, pay in 2 stages.',
    email: 'aman@example.com',
    dest: '/customer',
    img: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&q=80',
    icon: '🛵',
    badge: 'For riders',
    badgeColor: '#22c55e',
    accent: '#facc15',
    benefits: ['120+ vehicles across India', 'Two-stage UPI (50/50)', 'Gemini AI support', 'Verified merchants'],
  },
  {
    key: 'merchant',
    label: 'Merchant',
    tagline: 'List fleet, manage bookings, earn 70%.',
    email: 'fleet@approved.com',
    dest: '/merchant',
    img: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1200&q=80',
    icon: '🚗',
    badge: 'For owners',
    badgeColor: '#6366f1',
    accent: '#6366f1',
    benefits: ['70% payout — keep the lion’s share', 'Weekly UPI transfers', 'Full fleet dashboard', 'Verified badge on vehicles'],
  },
  {
    key: 'admin',
    label: 'Super Admin',
    tagline: 'Approve KYC, verify payments.',
    email: 'admin@journeyjunction.com',
    dest: '/admin',
    img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80',
    icon: '⚙️',
    badge: 'Platform',
    badgeColor: '#ef4444',
    accent: '#ef4444',
    benefits: ['One-click KYC approvals', 'Verify payments in seconds', 'Real-time finance summary', 'Full platform oversight'],
  },
];

const HERO_IMG =
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&q=80';

export default function LoginPage() {
  const router = useRouter();
  const [picked, setPicked] = useState<RoleKey | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = (key: RoleKey) => {
    const found = ROLES.find(r => r.key === key);
    if (found) {
      setEmail(found.email);
      setPassword(key === 'admin' ? 'admin1234' : 'demo1234');
    }
    setPicked(key);
    setError('');
  };

  const reset = () => {
    setPicked(null);
    setEmail('');
    setPassword('');
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    setError('');
    if (!email) { setError('Email required.'); return; }
    setBusy(true);
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setToken(data.token);
      localStorage.setItem('jj_role', data.role);
      localStorage.setItem('jj_user', JSON.stringify(data.user || data.merchant));
      const dest = ROLES.find(r => r.key === picked)?.dest || '/';
      router.push(dest);
    } catch (e: any) {
      setError(e.message || 'Login failed.');
      setBusy(false);
    }
  };

  const current = picked ? ROLES.find(r => r.key === picked)! : null;

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>JJ</span>
          <strong>Journey Junction</strong>
        </Link>
        <div className={styles.topRight}>
          <span>New here?</span>
          <Link href="/register" className={styles.topCta}>Create account</Link>
        </div>
      </header>

      <div className={styles.shell}>
        <section className={styles.left}>
          <img src={HERO_IMG} alt="Open road" className={styles.leftImg} />
          <div className={styles.leftOverlay} />
          <div className={styles.leftContent}>
            <div className={styles.leftTop}>
              <span className={styles.leftDot} />
              <span>Live across India · 30+ cities</span>
            </div>
            <div className={styles.leftBottom}>
              <span className={styles.leftTag}>Neighbourhood rentals</span>
              <h1 className={styles.headline}>Move freely.<br />Drive on demand.</h1>
              <p className={styles.sub}>India&apos;s neighbourhood vehicle rental marketplace — bikes, scooters, hatchbacks, SUVs, supercars. Pick up nearby, pay in two stages, no hidden fees.</p>
              <ul className={styles.bullets}>
                <li><span>✓</span> 30+ verified fleet owners</li>
                <li><span>✓</span> Two-stage UPI payment</li>
                <li><span>✓</span> Gemini AI support</li>
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.right}>
          {!current ? (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Pick your role to sign in</h2>
              <p className={styles.cardSub}>Choose how you&apos;ll use Journey Junction. You can switch roles later.</p>
              <div className={styles.roleGrid}>
                {ROLES.map(r => (
                  <button
                    key={r.key}
                    className={styles.roleCard}
                    style={{ ['--accent' as any]: r.accent }}
                    onClick={() => pick(r.key)}
                  >
                    <div className={styles.roleImg} style={{ backgroundImage: `url(${r.img})` }}>
                      <span className={styles.roleIcon} aria-hidden>{r.icon}</span>
                    </div>
                    <div className={styles.roleBody}>
                      <div className={styles.roleHead}>
                        <strong>{r.label}</strong>
                        <span
                          className={styles.roleBadge}
                          style={{ background: `${r.badgeColor}15`, color: r.badgeColor, borderColor: `${r.badgeColor}35` }}
                        >
                          {r.badge}
                        </span>
                      </div>
                      <small>{r.tagline}</small>
                      <div className={styles.roleBenefits}>
                        {r.benefits.slice(0, 2).map(b => (
                          <span key={b}>✓ {b}</span>
                        ))}
                      </div>
                    </div>
                    <span className={styles.roleArrow}>→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.card} key={current.key}>
              <button className={styles.back} onClick={reset}>← Back to roles</button>
              <div className={styles.formHead}>
                <img src={current.img} alt={current.label} className={styles.formHeadImg} />
                <div className={styles.formHeadOverlay} />
                <div className={styles.formHeadBody}>
                  <span className={styles.formTag}>{current.label} portal</span>
                  <h2 className={styles.formTitle}>{current.label} login</h2>
                </div>
              </div>

              <form onSubmit={submit} className={styles.form}>
                <label className={styles.label}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={styles.input}
                  autoComplete="email"
                  required
                />

                <label className={styles.label}>
                  Password
                  <small style={{ color: '#999', fontWeight: 400 }}>(demo: <code>demo1234</code> · admin: <code>admin1234</code>)</small>
                </label>
                <input
                  type="password"
                  placeholder="demo1234"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={styles.input}
                  autoComplete="current-password"
                />

                {error && <div className={styles.error}>{error}</div>}

                <button type="submit" className={styles.submit} disabled={busy}>
                  {busy ? 'Signing in…' : `Sign in as ${current.label}`}
                </button>
              </form>

              <p className={styles.demoLine}>
                Demo: <code>{current.email}</code> · password <code>demo1234</code> (admin uses <code>admin1234</code>)
              </p>

              <p className={styles.terms}>
                By continuing you agree to Journey Junction&apos;s <a href="#">Terms</a> &amp; <a href="#">Privacy</a>.
              </p>
            </div>
          )}

          <p className={styles.bottomCta}>
            Just browsing? <Link href="/">Continue as guest →</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
