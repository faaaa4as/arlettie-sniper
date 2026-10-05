import {
  CFG,
  getVente,
  findSlot,
  freeOf,
  isBooked,
  register,
  notify,
  paris,
  nowParis,
  authOk,
  sleep,
} from './_lib.js';

// Hobby plan caps function duration at 60s. One invocation runs an internal
// loop so a 1-minute external trigger yields a true ~30s check cadence.
export const maxDuration = 60;

function recapDue() {
  // Fire the 3-hour digest from the first loop iteration only, near the top of
  // the hour, so a same-minute follow-up invocation does not duplicate it.
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((x) => x.type === t)?.value);
  return get('hour') % 3 === 0 && get('minute') === 0 && get('second') < 30;
}

async function buildRecap() {
  const vente = await getVente();
  const slot = findSlot(vente, CFG.slotId);
  const free = freeOf(slot);
  const booked = isBooked(vente, CFG.slotId);
  const others = (vente.slots || [])
    .filter((s) => freeOf(s) > 0)
    .slice(0, 8)
    .map((s) => `- ${paris(s.begins)} (Paris) : ${freeOf(s)} libre(s)`);

  return {
    booked,
    title: booked ? 'Recap Arlettie : RESERVE' : 'Recap Arlettie',
    body: [
      `Cible : ${slot ? paris(slot.begins) + ' (Paris)' : 'introuvable'} [slot ${CFG.slotId}]`,
      `Etat : ${booked ? 'RESERVE' : free > 0 ? `${free} place(s) libre(s)` : 'complet'}`,
      slot ? `Jauge : ${slot.registrations}/${slot.maxRegistrations}` : '',
      `Statut compte : ${vente.rawStatus || vente.accountStatus || '?'}`,
      '',
      others.length ? 'Autres creneaux libres :\n' + others.join('\n') : 'Aucun autre creneau libre.',
      '',
      `Verifie : ${nowParis()} (Paris)`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

export default async function handler(req, res) {
  if (!authOk(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const started = Date.now();
  const log = [];
  let booked = false;
  let recapSent = false;
  let iter = 0;

  // Always run at least one check; when SNIPE_BUDGET_MS=0 a single check runs
  // per invocation (use this when an external scheduler drives the 30s cadence).
  while (true) {
    const loopStart = Date.now();
    try {
      if (iter === 0 && recapDue()) {
        const r = await buildRecap();
        const s = await notify(r.title, r.body, {
          priority: r.booked ? 'high' : 'default',
          tags: ['clipboard'],
          click: `${CFG.site}/fr/fr/slots/${CFG.saleSfid}`,
        });
        recapSent = true;
        log.push({ status: 'recap', ntfy: s });
      }

      const vente = await getVente();

      if (isBooked(vente, CFG.slotId)) {
        log.push({ status: 'already-booked' });
        break;
      }

      const slot = findSlot(vente, CFG.slotId);
      if (!slot) {
        log.push({ status: 'slot-not-found' });
        break;
      }

      const free = freeOf(slot);
      log.push({ status: 'checked', free, registrations: slot.registrations, max: slot.maxRegistrations });

      if (free > 0) {
        const r = await register(CFG.slotId);
        log.push({ status: 'register', response: r });

        if (!r.error) {
          booked = true;
          await notify(
            'Creneau reserve',
            `Ralph Lauren - ${paris(slot.begins)} (Paris)\nSlot ${CFG.slotId} : reservation confirmee.`,
            { priority: 'high', tags: ['white_check_mark'], click: `${CFG.site}/fr/fr/slots/${CFG.saleSfid}` }
          );
          break;
        }
        if (r.error === 'slot-full') {
          // Lost the race; keep looping.
        } else {
          await notify('Sniper Arlettie : erreur', `Reponse inattendue : ${JSON.stringify(r)}`, {
            priority: 'high',
            tags: ['warning'],
          });
          break;
        }
      }
    } catch (e) {
      log.push({ status: 'error', message: String(e) });
    }

    iter += 1;
    const elapsed = Date.now() - loopStart;
    const wait = CFG.intervalMs - elapsed;
    if (Date.now() - started + wait >= CFG.budgetMs) break;
    await sleep(wait);
  }

  res.status(200).json({ ok: true, booked, recapSent, checks: log.length, elapsedMs: Date.now() - started, log });
}
