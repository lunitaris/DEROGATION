/* ================================================================
   HELPERS — Fonctions utilitaires, badges HTML, formatage dates
================================================================ */

/* DATE & EXPIRY */
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}
function expiryClass(d) {
  if (d === null) return '';
  if (d < 0) return 'expiry-past';
  if (d <= 7) return 'expiry-danger';
  if (d <= 30) return 'expiry-warn';
  return 'expiry-ok';
}
function expiryLabel(iso) {
  if (!iso) return '—';
  const d = daysUntil(iso);
  const cls = expiryClass(d);
  if (d < 0) return `<span class="${cls}">Expirée (${formatDate(iso)})</span>`;
  if (d === 0) return `<span class="${cls}">Expire aujourd'hui !</span>`;
  if (d <= 30) return `<span class="${cls}">J-${d} (${formatDate(iso)})</span>`;
  return `<span class="${cls}">${formatDate(iso)}</span>`;
}

/* DIC */
function dicVal(v, prefix) {
  if (!v || v === 0) return `<span class="dic-val dic-unknown" title="${prefix} — non renseigné">${prefix}—</span>`;
  return `<span class="dic-val dic-${v}" title="${prefix}">${prefix}${v}</span>`;
}
function dicHtml(dic) {
  if (!dic) return `<span class="dic-row">${dicVal(0,'D')}${dicVal(0,'I')}${dicVal(0,'C')}</span>`;
  return `<span class="dic-row">${dicVal(dic.disponibilite,'D')}${dicVal(dic.integrite,'I')}${dicVal(dic.confidentialite,'C')}</span>`;
}

/* BADGES */
function statusBadge(s) {
  return `<span class="badge badge-${s}"><span class="badge-dot"></span>${STATUS_LABELS[s]||s}</span>`;
}
function actionBadge(a) {
  return `<span class="card-action-status action-${a}"><span class="action-dot"></span>${ACTION_SHORT[a]||ACTION_LABELS[a]||a}</span>`;
}

function motifBadge(d) {
  if (d.actionStatus !== 'attente_demandeur' || !d.actionMotif) return '';
  return `<span class="badge-motif">⏸ ${esc(d.actionMotif)}</span>`;
}
function motifCell(d) {
  if (d.actionStatus !== 'attente_demandeur' || !d.actionMotif)
    return '<span style="color:var(--text-muted)">—</span>';
  return `<span class="badge-motif">⏸ ${esc(d.actionMotif)}</span>`;
}
function urgencyBadge(d) {
  const lvl = d.urgency?.level || (d.urgency?.p0Linked ? 'p0' : d.urgency?.p1Linked ? 'p1' : '-');
  if (lvl === 'p0') return '<span class="urgency-badge urgency-p0">P0</span>';
  if (lvl === 'p1') return '<span class="urgency-badge urgency-p1">P1</span>';
  return '';
}
function riskChips(risk) {
  let h = '';
  if (!risk.edrInstalled) h += '<span class="chip chip-danger">⚠ Sans EDR</span>';
  if (risk.internetExposed) h += '<span class="chip chip-warn">🌐 Exposé Internet</span>';
  if (!risk.hasRemediationPlan) h += '<span class="chip chip-muted">Pas de REMA</span>';
  return h;
}

/* UTILITIES */
function toDateInputVal(iso) { return iso ? iso.split('T')[0] : ''; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function autoResizeTA(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

/* ACTION LOG — TRI & PRESSE-PAPIERS */

/**
 * Retourne les indices d'un tableau actionLog triés par date décroissante.
 * Les entrées sans date apparaissent en fin de liste.
 * Utilisé par sidebar.js et ticket-actions.js.
 *
 * @param {Array} log — tableau d'entrées { date, text, actor, etype }
 * @returns {number[]} indices triés
 */
function sortedActionLogIndices(log) {
  return log
    .map((_, i) => i)
    .sort((a, b) => {
      const da = log[a].date || '';
      const db = log[b].date || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da); /* décroissant — plus récent en premier */
    });
}

/**
 * Copie du texte dans le presse-papiers via execCommand (fallback).
 * Appelé quand l'API navigator.clipboard n'est pas disponible ou échoue.
 *
 * @param {string}   text      — texte à copier
 * @param {Function} onSuccess — callback appelé si la copie réussit
 * @param {Function} onError   — callback appelé si la copie échoue
 */
function clipboardFallbackCopy(text, onSuccess, onError) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    if (onSuccess) onSuccess();
  } catch {
    if (onError) onError();
  }
  document.body.removeChild(ta);
}

/* LAST CHECK */
function lastCheckClass(iso) {
  if (!iso) return 'last-check-none';
  const days = Math.floor((new Date() - new Date(iso)) / 86400000);
  if (days <= 7) return 'last-check-ok';
  if (days <= 21) return 'last-check-warn';
  return 'last-check-danger';
}
function lastCheckSuffix(iso) {
  if (!iso) return '';
  const days = Math.floor((new Date() - new Date(iso)) / 86400000);
  if (days === 0) return ' (aujourd\'hui)';
  if (days === 1) return ' (hier)';
  return ` (J+${days})`;
}
function markCheckedNow(id) {
  Store.update(id, { lastCheckedAt: new Date().toISOString().split('T')[0] });
  renderAll();
}
