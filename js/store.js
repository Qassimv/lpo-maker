// Saves everything in the browser (localStorage). No server, no login.
const KEY = 'lpo-maker-v1';

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && Array.isArray(data.orders)) return data;
  } catch { /* fall through to empty */ }
  return { orders: [], counters: {} };
}

export function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}
