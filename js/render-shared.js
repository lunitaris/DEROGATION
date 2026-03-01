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

/* ── HISTORIQUE ─────────────────────────────────────────────── */

/**
 * Transforme d.history[] en items enrichis prêts à l'affichage.
 * Retourne le tableau dans l'ordre chronologique inverse (plus récent en 1er).
 * Chaque appelant construit son propre HTML autour de ces données.
 *
 * @param  {Array}  history  — d.history
 * @returns {Array<{ timestamp, event, dotSuffix, label, desc }>}
 *   • timestamp  — ISO string
 *   • event      — clé brute ('created', 'status_changed', 'action_changed')
 *                  utilisée par ticket.html comme suffixe CSS
 *   • dotSuffix  — suffixe CSS court pour sidebar ('created','status','action')
 *   • label      — libellé court du type d'événement
 *   • desc       — description HTML (peut contenir <strong>)
 */
function sharedHistoryItems(history) {
  const dotSuffixMap = {
    created:        'created',
    status_changed: 'status',
    action_changed: 'action'
  };
  return [...(history || [])].reverse().map(h => {
    let label = h.event || '?';
    let desc  = h.note  || '';
    switch (h.event) {
      case 'created':
        label = 'Créée';
        desc  = `Statut : <strong>${STATUS_LABELS[h.to] || h.to || '?'}</strong>`;
        break;
      case 'status_changed':
        label = 'Statut SN';
        desc  = `${STATUS_LABELS[h.from] || h.from || '?'} → <strong>${STATUS_LABELS[h.to] || h.to || '?'}</strong>`;
        break;
      case 'action_changed':
        label = 'Next step';
        desc  = `${ACTION_LABELS[h.from] || h.from || '?'} → <strong>${ACTION_LABELS[h.to] || h.to || '?'}</strong>`;
        break;
    }
    return {
      timestamp: h.timestamp,
      event:     h.event || '',
      dotSuffix: dotSuffixMap[h.event] || '',
      label,
      desc
    };
  });
}

/* ── PROFIL DE RISQUE ───────────────────────────────────────── */

/**
 * Génère le HTML du profil de risque (EDR / Internet / REMA / DIC),
 * paramétré par les classes CSS et les fonctions de rendu du contexte.
 *
 * @param {object} risk  — d.risk
 * @param {object} p     — paramètres de rendu :
 *   • p.grid          : class du div wrapper (ex: 'info-grid' | 'tp-risk-grid')
 *   • p.row(l, v)     : fonction(label, valeurHtml) → HTML d'une ligne
 *   • p.ok(t)         : fonction(texte) → HTML chip "ok"
 *   • p.warn(t)       : fonction(texte) → HTML chip "warn"
 *   • p.danger(t)     : fonction(texte) → HTML chip "danger"
 *   • p.dicRow(l, v)  : (optionnel) idem row() mais pour la ligne DIC
 *                       (ticket a un wrapper div spécifique autour de dicHtml)
 * @returns {string} HTML complet du bloc risque
 */
function sharedRiskHtml(risk, p) {
  const r = risk || {};
  const edr  = r.edrInstalled       ? p.ok('✓ Oui')  : p.danger('✗ Non');
  const inet = r.internetExposed     ? p.warn('⚠ Oui') : p.ok('Non');
  const rema = r.hasRemediationPlan  ? p.ok('✓ Oui')  : p.danger('✗ Non');
  const dic  = dicHtml(r.dic);
  const dicRowFn = p.dicRow || p.row;
  return `<div class="${p.grid}">
    ${p.row('EDR installé', edr)}
    ${p.row('Exposé Internet', inet)}
    ${p.row('Plan de remédiation', rema)}
    ${dicRowFn('DIC', dic)}
  </div>`;
}

/**
 * Paramètres de rendu pour la SIDEBAR (classes info-grid / info-item / chip).
 * Utilisation : sharedRiskHtml(d.risk, RISK_PARAMS_SIDEBAR)
 */
const RISK_PARAMS_SIDEBAR = {
  grid:   'info-grid',
  row:    (l, v) => `<div class="info-item"><div class="info-item-label">${l}</div><div class="info-item-value">${v}</div></div>`,
  ok:     t => `<span class="chip chip-ok">${t}</span>`,
  warn:   t => `<span class="chip chip-warn">${t}</span>`,
  danger: t => `<span class="chip chip-danger">${t}</span>`
};

/**
 * Paramètres de rendu pour le TICKET PLEIN ÉCRAN (classes tp-risk-*).
 * Utilisation : sharedRiskHtml(d.risk, RISK_PARAMS_TICKET)
 */
const RISK_PARAMS_TICKET = {
  grid:   'tp-risk-grid',
  row:    (l, v) => `<div class="tp-risk-row"><span class="tp-risk-label">${l}</span>${v}</div>`,
  ok:     t => `<span class="tp-risk-val ok">${t}</span>`,
  warn:   t => `<span class="tp-risk-val warn">${t}</span>`,
  danger: t => `<span class="tp-risk-val warn">${t}</span>`,
  dicRow: (l, v) => `<div class="tp-risk-row"><span class="tp-risk-label">${l}</span><div class="tp-dic-row">${v}</div></div>`
};

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
