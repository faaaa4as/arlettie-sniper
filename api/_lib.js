// Shared helpers for the Arlettie slot sniper.
// No external deps: uses global fetch (Node 20+ / Vercel).

export const CFG = {
  proxy: 'https://www.arlettie.com/proxy',
  site: 'https://www.arlettie.com',
  saleSfid: process.env.ARLETTIE_SALE_SFID || 'a0FMI00000AhoLZ2AZ',
  slotId: Number(process.env.ARLETTIE_SLOT_ID || 45662),
  apiKey: process.env.ARLETTIE_API_KEY || '',
  brand: process.env.ARLETTIE_BRAND || '',
  ntfyUrl: process.env.NTFY_URL || 'https://ntfy.sh',
  ntfyTopic: process.env.NTFY_TOPIC || 'arletti-sniper-6814',
  ntfyToken: process.env.NTFY_TOKEN || '',
  intervalMs: Number(process.env.SNIPE_INTERVAL_MS || 30000),
  budgetMs: Number(process.env.SNIPE_BUDGET_MS || 55000),
  cronSecret: process.env.CRON_SECRET || '',
};

function headers() {
  return {
    Referer: `${CFG.site}/fr/fr/slots/${CFG.saleSfid}?api_key=${CFG.apiKey}`,
    Origin: CFG.site,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'application/json',
  };
}

export async function getVente() {
  const url = `${CFG.proxy}/vente/${CFG.saleSfid}?api_key=${encodeURIComponent(CFG.apiKey)}&brand=${encodeURIComponent(CFG.brand)}`;
  const r = await fetch(url, { headers: headers(), cache: 'no-store' });
  if (!r.ok) throw new Error(`GET vente -> HTTP ${r.status}`);
  const j = await r.json();
  if (!j || !j.vente) throw new Error('GET vente -> no vente payload');
  return j.vente;
}

export function findSlot(vente, id) {
  return (vente.slots || []).find((s) => s.id === id) || null;
}

export function freeOf(slot) {
  return slot ? slot.maxRegistrations - slot.registrations : 0;
}

export function isBooked(vente, id) {
  return !!(vente.currentSlot && Number(vente.currentSlot.slotId) === id);
}

export async function register(slotId) {
  const url = `${CFG.proxy}/vente/${CFG.saleSfid}/register?api_key=${encodeURIComponent(CFG.apiKey)}&slot_id=${slotId}&brand=${encodeURIComponent(CFG.brand)}`;
  const r = await fetch(url, { method: 'POST', headers: headers(), cache: 'no-store' });
  let body;
  try {
    body = await r.json();
  } catch {
    body = { raw: await r.text().catch(() => '') };
  }
  return { http: r.status, ...body };
}

export async function notify(title, message, { priority = 'default', tags = [], click } = {}) {
  const h = { Title: title, Priority: priority };
  if (tags.length) h.Tags = tags.join(',');
  if (click) h.Click = click;
  if (CFG.ntfyToken) h.Authorization = `Bearer ${CFG.ntfyToken}`;
  try {
    const r = await fetch(`${CFG.ntfyUrl}/${encodeURIComponent(CFG.ntfyTopic)}`, {
      method: 'POST',
      headers: h,
      body: message,
    });
    return r.status;
  } catch (e) {
    return `notify-error: ${e}`;
  }
}

export function paris(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return String(iso);
  }
}

export function nowParis() {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

// Protect the endpoints with ?secret= or Authorization: Bearer <CRON_SECRET>.
export function authOk(req) {
  if (!CFG.cronSecret) return true;
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  let q = '';
  try {
    q = new URL(req.url, 'http://localhost').searchParams.get('secret') || '';
  } catch {}
  return h === `Bearer ${CFG.cronSecret}` || q === CFG.cronSecret;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
