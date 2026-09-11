// Base URL for the API. Set NEXT_PUBLIC_API_URL on Vercel to the Render backend URL,
// e.g. https://journey-junction-api.onrender.com/api
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('jj_token');
}

export function setToken(token: string) {
  localStorage.setItem('jj_token', token);
}

export function clearAuth() {
  localStorage.removeItem('jj_token');
  localStorage.removeItem('jj_role');
  localStorage.removeItem('jj_user');
}

export function getRole(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('jj_role');
}

export function getUser(): any {
  if (typeof window === 'undefined') return null;
  const u = localStorage.getItem('jj_user');
  return u ? JSON.parse(u) : null;
}

export async function api(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: any = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
