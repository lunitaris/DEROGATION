/* ================================================================
   RENDER-SHARED — Logique de rendu partagée sidebar ↔ ticket

   Contient des helpers purs utilisés à la fois par sidebar.js
   et ticket.js pour éviter la duplication de logique métier.

   Chaque contexte garde sa propre structure HTML de haut niveau ;
   ces fonctions produisent uniquement les parties identiques.

   Dépendances (chargées avant) :
     constants.js  → STATUS_LABELS, ACTION_LABELS
     helpers.js    → dicHtml, formatDate
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
