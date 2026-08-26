'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { api, setToken } from '../../lib/api';
import styles from './register.module.css';

type Mode = 'customer' | 'merchant';

export default function RegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('customer');
  const [form, setForm] = useState({
    email: '',
    password: '',
    full_name: '',
    phone: '',
    business_name: '',
    owner_name: '',
    state: '',
    city: '',
    address: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const onChange = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const endpoint = mode === 'customer' ? '/auth/register/user' : '/auth/register/merchant';
      const payload = mode === 'customer'
        ? { email: form.email, password: form.password, full_name: form.full_name, phone: form.phone || undefined }
        : { email: form.email, password: form.password, business_name: form.business_name, owner_name: form.owner_name, state: form.state, city: form.city, address: form.address || undefined };
      const data = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setToken(data.token);
      localStorage.setItem('jj_role', data.role);
      localStorage.setItem('jj_user', JSON.stringify(data.user || data.merchant));
      router.push(mode === 'customer' ? '/customer' : '/merchant');
    } catch (e: any) {
      setError(e.message || 'Registration failed.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>JJ</span>
          <strong>Journey Junction</strong>
        </Link>
        <Link href="/login" className={styles.topLink}>Already have an account? Sign in</Link>
      </header>

      <div className={styles.shell}>
        <section className={styles.left}>
          <h1 className={styles.headline}>Join the<br />Journey Junction family.</h1>
          <p className={styles.sub}>{mode === 'customer'
            ? 'Find bikes, scooters, hatchbacks, SUVs, supercars near you. Pay in two stages, drive stress-free.'
            : 'List your fleet, reach thousands of riders nearby, get paid every week via UPI.'}</p>
          <ul className={styles.bullets}>
            {mode === 'customer' ? (
              <>
                <li><span>✓</span> Verified merchants only</li>
                <li><span>✓</span> Two-stage UPI payment (50/50)</li>
                <li><span>✓</span> Gemini AI for instant support</li>
                <li><span>✓</span> Real cars, real prices, no hidden fees</li>
              </>
            ) : (
              <>
                <li><span>✓</span> 70% payout — you keep the lion&apos;s share</li>
                <li><span>✓</span> Weekly UPI payouts</li>
                <li><span>✓</span> Dashboard for fleet, bookings, earnings</li>
                <li><span>✓</span> KYC verified badge on your vehicles</li>
              </>
            )}
          </ul>
        </section>

        <section className={styles.right}>
          <div className={styles.card}>
            <div className={styles.tabs} role="tablist">
              <button
                role="tab"
                aria-selected={mode === 'customer'}
                className={mode === 'customer' ? styles.tabActive : styles.tab}
                onClick={() => { setMode('customer'); setError(''); }}
              >
                I&apos;m a Customer
              </button>
              <button
                role="tab"
                aria-selected={mode === 'merchant'}
                className={mode === 'merchant' ? styles.tabActive : styles.tab}
                onClick={() => { setMode('merchant'); setError(''); }}
              >
                I&apos;m a Merchant
              </button>
            </div>
            <p className={styles.roleHint}>
              {mode === 'customer' ? 'Book vehicles, pay in 2 stages' : 'List fleet, manage bookings, track payouts'}
            </p>

            <form onSubmit={submit} className={styles.form}>
              {mode === 'customer' ? (
                <>
                  <label className={styles.label}>Full name</label>
                  <input className={styles.input} required value={form.full_name} onChange={onChange('full_name')} placeholder="Aman Verma" />

                  <label className={styles.label}>Email</label>
                  <input className={styles.input} type="email" required value={form.email} onChange={onChange('email')} placeholder="you@example.com" autoComplete="email" />

                  <label className={styles.label}>Phone <small style={{ color: '#999', fontWeight: 400 }}>(optional)</small></label>
                  <input className={styles.input} type="tel" value={form.phone} onChange={onChange('phone')} placeholder="+91 98765 43210" />

                  <label className={styles.label}>Password</label>
                  <input className={styles.input} type="password" required minLength={8} value={form.password} onChange={onChange('password')} placeholder="min 8 characters" autoComplete="new-password" />
                </>
              ) : (
                <>
                  <label className={styles.label}>Business name</label>
                  <input className={styles.input} required value={form.business_name} onChange={onChange('business_name')} placeholder="CityMotors Pvt Ltd" />

                  <label className={styles.label}>Owner name</label>
                  <input className={styles.input} required value={form.owner_name} onChange={onChange('owner_name')} placeholder="Vikram Joshi" />

                  <div className={styles.row2}>
                    <div>
                      <label className={styles.label}>State</label>
                      <input className={styles.input} required value={form.state} onChange={onChange('state')} placeholder="MH" maxLength={2} />
                    </div>
                    <div>
                      <label className={styles.label}>City</label>
                      <input className={styles.input} required value={form.city} onChange={onChange('city')} placeholder="Mumbai" />
                    </div>
                  </div>

                  <label className={styles.label}>Address <small style={{ color: '#999', fontWeight: 400 }}>(optional)</small></label>
                  <input className={styles.input} value={form.address} onChange={onChange('address')} placeholder="Andheri East" />

                  <label className={styles.label}>Email</label>
                  <input className={styles.input} type="email" required value={form.email} onChange={onChange('email')} placeholder="you@example.com" autoComplete="email" />

                  <label className={styles.label}>Password</label>
                  <input className={styles.input} type="password" required minLength={8} value={form.password} onChange={onChange('password')} placeholder="min 8 characters" autoComplete="new-password" />
                </>
              )}

              {error && <div className={styles.error}>{error}</div>}

              <button type="submit" className={styles.submit} disabled={busy}>
                {busy ? 'Creating account…' : mode === 'customer' ? 'Create customer account' : 'Create merchant account'}
              </button>
            </form>

            <p className={styles.terms}>
              By signing up you agree to Journey Junction&apos;s <a href="#">Terms</a> &amp; <a href="#">Privacy</a>.
            </p>
          </div>

          <p className={styles.bottomCta}>
            Already a member? <Link href="/login">Sign in →</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
