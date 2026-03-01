/* ================================================================
   RENDER-SHARED — Logique de rendu partagée sidebar ↔ ticket

   Contient des helpers purs utilisés à la fois par sidebar.js
   et ticket.js pour éviter la duplication de logique métier.

   Chaque contexte garde sa propre structure HTML de haut niveau ;
   ces fonctions produisent uniquement les parties identiques.

   Dépendances (chargées avant) :
     constants.js  → STATUS_LABELS, ACTION_LABELS, ACTORS, ETYPES
     helpers.js    → dicHtml, formatDate, esc
================================================================ */

/* ── INDICATEURS (partagé sidebar ↔ ticket) ─────────────────── */

/**
 * Génère le HTML du bloc Indicateurs (grille 3×2 compacte).
 * Identique sur sidebar et ticket plein écran — pas de paramétrage CSS.
 *
 * Sources des données :
 *   • Mitigations     → notesStructured.checks.mitigations (bool)
 *   • Plan d'action   → notesStructured.checks.plan (bool)
 *   • EDR installé    → risk.edrInstalled (bool | null/undefined = N/A)
 *   • Exposé internet → risk.internetExposed (bool | null/undefined = N/A)
 *   • DIC             → risk.dic via dicHtml()
 *
 * @param {object} risk — d.risk
 * @param {object} ns   — d.notesStructured
 * @returns {string} HTML du bloc indicateurs
 */
/* ── DERNIÈRE ACTION JOURNAL (partagé sidebar ↔ ticket) ────── */

/**
 * Génère le HTML du bloc "Dernière action journal".
 * Utilisé dans le Cycle de vie (sidebar + ticket plein écran).
 *
 * @param {Array} actionLog — d.actionLog
 * @returns {string} HTML du bloc
 */
function sharedLastActionHtml(actionLog) {
  const log = actionLog || [];
  if (!log.length) {
    return `
        <div class="tp-lastaction-row">
          <div class="tp-lastaction-header">
            <span class="lc-label">Dernière action journal</span>
          </div>
          <span class="lc-val muted">—</span>
        </div>`;
  }
  const la    = [...log].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const actor = ACTORS[la.actor || 'team'] || ACTORS.team;
  const et    = ETYPES[la.etype || 'commentaire'] || ETYPES.commentaire;
  const laText = la.text ? (la.text.length > 80 ? la.text.substring(0, 80) + '…' : la.text) : '';
  return `
        <div class="tp-lastaction-row">
          <div class="tp-lastaction-header">
            <span class="lc-label">Dernière action journal</span>
            <span class="lc-label tp-lastaction-date">${la.date ? formatDate(la.date) : '—'}</span>
          </div>
          <div class="tp-lastaction-body">
            <span class="tp-lastaction-meta">
              <span style="color:${actor.color}">${actor.emoji} ${actor.label}</span>
              <span style="color:${et.color}">${et.emoji} ${et.label}</span>
            </span>
            ${laText ? `<span class="tp-lastaction-text">${esc(laText)}</span>` : ''}
          </div>
        </div>`;
}

/* ── TEMPLATES EMAIL (partagé sidebar ↔ ticket) ─────────────── */

/**
 * Templates d'email pour les 3 types de communication.
 * Chaque clé est une fonction (d) => { label, subject, body }.
 * Utilisé par modal-email.js (index.html) et ticket-actions.js (ticket.html).
 */
const EMAIL_TEMPLATES = {
  followup: d => ({
    label: 'Relance info',
    subject: `[Dérogation ${d.ticketId}] Informations manquantes — Action requise`,
    body: `Bonjour ${d.applicant?.name||'[Porteur]'},

Je reviens vers vous concernant la demande de dérogation cybersécurité :

  Ticket : ${d.ticketId||'N/A'}
  Titre  : ${d.title||'N/A'}
  Statut : ${STATUS_LABELS[d.status]||d.status}

Afin d'instruire cette demande, merci de compléter dans le ticket ServiceNow :

• Contexte métier et IT à jour
• Raison pour laquelle une remédiation immédiate n'est pas possible
• Description des risques cyber associés
• Plan d'action précis avec des dates
• Mitigations en cours ou prévues
• Statut EDR sur l'asset
• Exposition internet de l'asset
• DIC (Disponibilité, Intégrité, Confidentialité)

Sans retour avant le ${d.dates.expiresAt?formatDate(d.dates.expiresAt):'[date]'}, la demande ne pourra pas être instruite.

Cordialement,`
  }),
  status: d => ({
    label: 'Point statut',
    subject: `[Dérogation ${d.ticketId}] Point d'avancement mensuel`,
    body: `Bonjour ${d.applicant?.name||'[Porteur]'},

Suivi mensuel de votre demande de dérogation :

  Ticket     : ${d.ticketId||'N/A'}
  Titre      : ${d.title||'N/A'}
  Statut     : ${STATUS_LABELS[d.status]||d.status}
  Expiration : ${d.dates.expiresAt?formatDate(d.dates.expiresAt):'Non définie'}

Merci de me faire un point sur l'avancement :
• Quelles actions ont été réalisées ?
• Le planning est-il toujours tenu ?
• Y a-t-il des blocages ?

Mise à jour dans ServiceNow attendue avant le 20 du mois.

Cordialement,`
  }),
  expiry: d => ({
    label: 'Alerte expiration',
    subject: `[URGENT - Dérogation ${d.ticketId}] Expiration imminente`,
    body: `Bonjour ${d.applicant?.name||'[Porteur]'},

La dérogation suivante arrive à expiration :

  Ticket     : ${d.ticketId||'N/A'}
  Titre      : ${d.title||'N/A'}
  Expiration : ${d.dates.expiresAt?formatDate(d.dates.expiresAt):'Non définie'}

Merci de confirmer :
  ☐ Remédiation terminée → la dérogation peut être clôturée
  ☐ En cours → renouvellement nécessaire avant expiration
  ☐ Planning modifié → nouvelle date cible à préciser

Sans retour, la dérogation sera marquée expirée.

Cordialement,`
  })
};

/* ── INDICATEURS (partagé sidebar ↔ ticket) ─────────────────── */

function sharedIndicatorsHtml(risk, ns) {
  const r  = risk || {};
  const n  = ns   || {};
  const ch = n.checks || {};

  /* — Dossier ————————————————————————————————————————————————— */
  const mitig = ch.mitigations
    ? `<span class="risk-ind-yes">✓ Oui</span>`
    : `<span class="risk-ind-no">✗ Non</span>`;

  const plan = ch.plan
    ? `<span class="risk-ind-yes">✓ Oui</span>`
    : `<span class="risk-ind-no">✗ Non</span>`;

  /* — Technique (tri-state), DIC —————————————————————————————— */
  const inetVal = r.internetExposed == null
    ? `<span class="risk-ind-na">N/A</span>`
    : r.internetExposed
      ? `<span class="risk-ind-warn">⚠ Oui</span>`
      : `<span class="risk-ind-yes">✓ Non</span>`;

  const dic = dicHtml(r.dic);

  return `<div class="risk-ind-list">
    <div class="risk-ind-row"><span class="risk-ind-label">Mitigations</span>${mitig}</div>
    <div class="risk-ind-row"><span class="risk-ind-label">Plan d'action</span>${plan}</div>
    <div class="risk-ind-row"><span class="risk-ind-label">Exposé internet</span>${inetVal}</div>
    <div class="risk-ind-row"><span class="risk-ind-label">DIC</span>${dic}</div>
  </div>`;
}
