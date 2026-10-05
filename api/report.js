import { CFG, getVente, findSlot, freeOf, isBooked, notify, paris, nowParis, authOk } from './_lib.js';

export const maxDuration = 30;

export default async function handler(req, res) {
  if (!authOk(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const vente = await getVente();
    const slot = findSlot(vente, CFG.slotId);
    const free = freeOf(slot);
    const booked = isBooked(vente, CFG.slotId);
    const others = (vente.slots || [])
      .filter((s) => freeOf(s) > 0)
      .slice(0, 8)
      .map((s) => `- ${paris(s.begins)} (Paris) : ${freeOf(s)} libre(s)`);

    const body = [
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
      .join('\n');

    const ntfy = await notify(booked ? 'Recap Arlettie : RESERVE' : 'Recap Arlettie', body, {
      priority: booked ? 'high' : 'default',
      tags: ['clipboard'],
      click: `${CFG.site}/fr/fr/slots/${CFG.saleSfid}`,
    });

    res.status(200).json({ ok: true, ntfy, booked, free, saleSfid: CFG.saleSfid, slotId: CFG.slotId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
}
