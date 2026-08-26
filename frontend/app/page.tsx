'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import styles from './home.module.css';

type Vehicle = {
  id: string;
  title: string;
  category: '2_wheeler' | '4_wheeler';
  seating_capacity: number;
  price_per_day: number;
  city?: string;
  image_urls: string[];
};

const CITIES = [
  { name: 'Mumbai', img: 'https://images.unsplash.com/photo-1570168007204-dfb528c6958f?w=800' },
  { name: 'Delhi', img: 'https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800' },
  { name: 'Bengaluru', img: 'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=800' },
  { name: 'Pune', img: 'https://images.unsplash.com/photo-1625730580977-7f9c7d9ff35e?w=800' },
];

const STATS = [
  { num: '120+', label: 'Vehicles' },
  { num: '30+', label: 'Verified merchants' },
  { num: '2,500+', label: 'Happy riders' },
  { num: '4.8★', label: 'Avg rating' },
];

const ROLES = [
  {
    key: 'customer',
    label: 'Customer',
    tagline: 'Book vehicles, pay in 2 stages.',
    icon: '🛵',
    img: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200&q=80',
    badge: 'For riders',
    badgeColor: '#22c55e',
    accent: '#facc15',
    benefits: ['120+ vehicles', 'Two-stage UPI (50/50)', 'Gemini AI support', 'Verified merchants'],
  },
  {
    key: 'merchant',
    label: 'Merchant',
    tagline: 'List your fleet, earn 70% per booking.',
    icon: '🚗',
    img: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=1200&q=80',
    badge: 'For owners',
    badgeColor: '#6366f1',
    accent: '#6366f1',
    benefits: ['70% payout — keep most', 'Weekly UPI transfers', 'Full fleet dashboard', 'Verified badge'],
  },
  {
    key: 'admin',
    label: 'Super Admin',
    tagline: 'Approve KYC, verify payments, monitor.',
    icon: '⚙️',
    img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80',
    badge: 'Platform',
    badgeColor: '#ef4444',
    accent: '#ef4444',
    benefits: ['One-click KYC', 'Verify payments fast', 'Finance summary', 'Full oversight'],
  },
];

export default function Home() {
  const [featured, setFeatured] = useState<Vehicle[]>([]);

  useEffect(() => {
    api('/vehicles/search').then((d: Vehicle[]) => setFeatured((d || []).slice(0, 4))).catch(() => {});
  }, []);

  return (
    <main className={styles.wrap}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>JJ</span>
          <strong>Journey Junction</strong>
        </Link>
        <div className={styles.navLinks}>
          <Link href="#cities">Cities</Link>
          <Link href="#fleet">Fleet</Link>
          <Link href="#how">How it works</Link>
          <Link href="/login" className={styles.navLogin}>Sign in</Link>
        </div>
      </nav>

      <div className={styles.subCta}>
        New here? <Link href="/register" className={styles.subCtaLink}>Create an account →</Link>
      </div>

      <header className={styles.hero}>
        <span className={styles.badge}>India&apos;s neighbourhood rental marketplace</span>
        <h1 className={styles.title}>Move freely.<br/>Drive on demand.</h1>
        <p className={styles.sub}>Bikes, scooters, hatchbacks, SUVs, supercars — pick up nearby, pay in two stages, no hidden fees.</p>
        <div className={styles.searchBar}>
          <span className={styles.searchIcon}>🔍</span>
          <input placeholder="Where do you want to go? Try Mumbai, Delhi…" />
          <Link href="/login" className={styles.searchCta}>Find rides →</Link>
        </div>
        <div className={styles.stats}>
          {STATS.map(s => (
            <div key={s.label}>
              <strong>{s.num}</strong>
              <small>{s.label}</small>
            </div>
          ))}
        </div>
      </header>

      <section className={styles.banner}>
        <img src="https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1600&q=80" alt="Open road" loading="lazy" />
        <div className={styles.bannerOverlay}>
          <span className={styles.bannerQuote}>“The journey is the destination.”</span>
          <Link href="/login" className={styles.bannerCta}>Start your ride →</Link>
        </div>
      </section>

      <section id="cities" className={styles.cities}>
        <p className={styles.sectionLabel}>Explore by city</p>
        <div className={styles.cityGrid}>
          {CITIES.map(c => (
            <Link key={c.name} href="/login" className={styles.cityCard}>
              <img src={c.img} alt={c.name} loading="lazy" />
              <div className={styles.cityOverlay}>
                <strong>{c.name}</strong>
                <small>Explore fleet →</small>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="fleet" className={styles.fleet}>
        <p className={styles.sectionLabel}>Featured fleet</p>
        <div className={styles.fleetGrid}>
          {featured.length === 0 ? (
            <div className={styles.fleetEmpty}>Loading vehicles…</div>
          ) : (
            featured.map(v => (
              <Link key={v.id} href="/login" className={styles.fleetCard}>
                <img src={v.image_urls?.[0] || 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=800'} alt={v.title} loading="lazy" />
                <div className={styles.fleetBody}>
                  <strong>{v.title}</strong>
                  <small>{v.city || 'India'} · {v.category === '2_wheeler' ? 'Bike' : 'Car'} · {v.seating_capacity} seats</small>
                  <span className={styles.fleetPrice}>AED {v.price_per_day}<small>/day</small></span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      <section id="roles" className={styles.roles}>
        <p className={styles.sectionLabel}>Pick your role</p>
        <h2 className={styles.rolesTitle}>Three ways to use Journey Junction</h2>
        <div className={styles.roleGrid}>
          {ROLES.map(r => (
            <Link
              key={r.key}
              href="/login"
              className={styles.roleCard}
              style={{ ['--accent' as any]: r.accent }}
            >
              <div className={styles.roleImg} style={{ backgroundImage: `url(${r.img})` }}>
                <span className={styles.roleIcon} aria-hidden>{r.icon}</span>
              </div>
              <div className={styles.roleHead}>
                <strong>{r.label}</strong>
                <span
                  className={styles.roleBadge}
                  style={{ background: `${r.badgeColor}1f`, color: r.badgeColor, borderColor: `${r.badgeColor}55` }}
                >
                  {r.badge}
                </span>
              </div>
              <p className={styles.roleTag}>{r.tagline}</p>
              <ul className={styles.roleBenefits}>
                {r.benefits.map(b => <li key={b}>✓ {b}</li>)}
              </ul>
              <span className={styles.roleCta}>Sign in as {r.label} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section id="how" className={styles.how}>
        <p className={styles.sectionLabel}>How it works</p>
        <div className={styles.howGrid}>
          <div className={styles.howStep}>
            <span className={styles.howNum}>1</span>
            <strong>Search</strong>
            <p>Browse vehicles by city, category, price.</p>
          </div>
          <div className={styles.howStep}>
            <span className={styles.howNum}>2</span>
            <strong>Book</strong>
            <p>Pick dates, pay 50% advance via UPI.</p>
          </div>
          <div className={styles.howStep}>
            <span className={styles.howNum}>3</span>
            <strong>Verify</strong>
            <p>Admin verifies payment in seconds.</p>
          </div>
          <div className={styles.howStep}>
            <span className={styles.howNum}>4</span>
            <strong>Drive</strong>
            <p>Pay balance, pick up, enjoy the ride.</p>
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <h2>Ready to ride?</h2>
        <p>Sign in to book your first vehicle in under 2 minutes.</p>
        <Link href="/login" className={styles.finalBtn}>Sign in to start →</Link>
      </section>

      <footer className={styles.foot}>
        <span>© 2026 Journey Junction</span>
        <span>Made with ⚡ in India</span>
      </footer>
    </main>
  );
}
