// Sends rows to Supabase (REST API). Rows go out one by one in order (the session
// before its trials) and are retried until they succeed, so a short loss of
// connection does not lose data.

import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=0433a87';

async function insert(table, row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, // publishable keys go only in the apikey header
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  // 409: the row already exists (an earlier attempt succeeded but the answer was lost)
  if (res.ok || res.status === 409) return;
  const text = await res.text().catch(() => '');
  const err = new Error(`${table}: HTTP ${res.status} ${text.slice(0, 200)}`);
  err.permanent = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
  throw err;
}

export class Uploader {
  constructor({ onChange } = {}) {
    this.queue = [];
    this.busy = false;
    this.failures = 0;
    this.lastError = null;
    this.sent = 0;
    this.onChange = onChange ?? (() => {});
  }

  get pending() {
    return this.queue.length;
  }

  add(table, row) {
    this.queue.push({ table, row });
    this.onChange(this);
    this.run();
  }

  async run() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const item = this.queue[0];
      try {
        await insert(item.table, item.row);
        this.queue.shift();
        this.sent++;
        this.failures = 0;
        this.lastError = null;
      } catch (e) {
        this.failures++;
        this.lastError = e;
        console.error(e);
        if (e.permanent && this.failures >= 3) {
          // the database refuses this row (e.g. a check failed): keep the rest going
          this.queue.shift();
          this.failures = 0;
        } else {
          await new Promise((r) => setTimeout(r, Math.min(15000, 1000 * 2 ** Math.min(this.failures, 4))));
        }
      }
      this.onChange(this);
    }
    this.busy = false;
    this.onChange(this);
  }
}
