'use client';

import styles from './pagination.module.css';

export type Paged<T> = { items: T[]; total: number; page: number; limit: number; pages: number };

export function Pagination({ paged, onChange }: { paged: Paged<any>; onChange: (page: number) => void }) {
  if (!paged || paged.pages <= 1) {
    return (
      <div className={styles.bar}>
        <span className={styles.info}>{paged?.total ?? 0} total</span>
      </div>
    );
  }
  const { page, pages, total, limit } = paged;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const goto = (p: number) => {
    if (p < 1 || p > pages) return;
    onChange(p);
  };
  return (
    <div className={styles.bar}>
      <span className={styles.info}>{start}–{end} of {total}</span>
      <button className={styles.btn} disabled={page === 1} onClick={() => goto(page - 1)}>‹ Prev</button>
      <span className={styles.page}>{page} / {pages}</span>
      <button className={styles.btn} disabled={page === pages} onClick={() => goto(page + 1)}>Next ›</button>
    </div>
  );
}
