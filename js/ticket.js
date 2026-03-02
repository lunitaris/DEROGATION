/* ================================================================
   TICKET.JS — Init + render de la vue plein écran
================================================================ */

/* ================================================================
   INIT
================================================================ */
function initTicketPage() {
  /* Thème */
  const prefs = Store.loadPrefs();
  if (prefs.theme) document.documentElement.setAttribute('data-theme', prefs.theme);

  /* Raccourcis Ctrl+B/I/U sur les champs rich text */
  document.addEventListener('keydown', richTextKeydown);

  /* Resize du cadre supérieur (restaure la hauteur sauvegardée + attache le handle) */
  tpInitSummaryResize();

  /* Chiffrement : hérite la clé de l'onglet parent si possible */
  _initTicketCrypto(_loadTicketById);
}

/**
 * Tente de restaurer la clé depuis sessionStorage (partagé entre onglets
 * de même origine/session). Si impossible, affiche le modal de déverrouillage.
 * @param {Function} afterUnlock  appelé une fois déverrouillé
 */
function _initTicketCrypto(afterUnlock) {
  if (!StoreCrypto.isSetup()) {
    afterUnlock();
    return;
  }

  // Tente de récupérer la clé depuis sessionStorage
  if (StoreCrypto.tryRestoreFromSession()) {
    afterUnlock();
    return;
  }

  // Sinon, demander le mot de passe
  openCryptoModal('unlock', afterUnlock);
}

function _loadTicketById() {
  /* ID depuis l'URL */
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    document.title = 'Ticket introuvable — DerogManager';
    document.body.innerHTML = '<div style="padding:40px;color:var(--text);font-family:system-ui">Aucun identifiant fourni. <a href="index.html">Retour</a></div>';
    return;
  }

  const raw = Store.getById(id);
  if (!raw) {
    document.title = 'Ticket introuvable — DerogManager';
    document.body.innerHTML = `<div style="padding:40px;color:var(--text);font-family:system-ui">Dérogation introuvable (id: ${id}). <a href="index.html">Retour</a></div>`;
    return;
  }

  const d = Store._migrateDerog({ ...raw });
  tp_currentId = id;
  tp_journal   = [...(d.actionLog || [])];

  renderTicketPage(d);

  /* Écoute les mises à jour faites depuis un autre onglet (index.html) */
  window.addEventListener('storage', e => {
    if (e.key === Store.KEY) {
      const fresh = Store.getById(id);
      if (fresh) {
        const df = Store._migrateDerog({ ...fresh });
        tp_journal = [...(df.actionLog || [])];
        renderTicketPage(df);
      }
    }
  });

  /* Rafraîchit aussi quand l'onglet reprend le focus
     (les storage events sont peu fiables en file://) */
  window.addEventListener('focus', () => {
    const fresh = Store.getById(id);
    if (!fresh) return;
    const df = Store._migrateDerog({ ...fresh });
    tp_journal = [...(df.actionLog || [])];
    renderTicketPage(df);
  });
}

/* ================================================================
   RENDER PRINCIPAL
================================================================ */
function renderTicketPage(d) {
  document.title = `${d.ticketId || '—'} — ${d.title || 'Sans titre'} — DerogManager`;

  renderTopbar(d);
  renderIdentityStrip(d);
  renderRiskProfile(d);
  renderMeetingNotes(d);
  renderQuickNotes(d);
  renderTimelineSection();
  renderJournalShell(d);
  renderDossier(d);
  renderLifecycle(d);

  /* Redimensionne les textareas après rendu (exclut celles avec data-no-autoresize) */
  requestAnimationFrame(() => {
    document.querySelectorAll('textarea:not([data-no-autoresize])').forEach(autoResizeTA);
  });
}

/* ================================================================
   TOPBAR
================================================================ */
function renderTopbar(d) {
  const ticketEl = document.getElementById('tp-breadcrumb-ticket');
  const titleEl  = document.getElementById('tp-breadcrumb-title');
  if (ticketEl) ticketEl.textContent = d.ticketId || '—';
  if (titleEl)  titleEl.textContent  = d.title    || '(Sans titre)';
}

/* ================================================================
   BANDEAU IDENTITÉ
================================================================ */
function renderIdentityStrip(d) {
  const el = document.getElementById('tp-identity-content');
  if (!el) return;
  const days   = daysUntil(d.dates.expiresAt);
  const eCls   = expiryClass(days);
  const eLabel = days === null ? '—' : (days < 0 ? 'Expirée' : `J-${days}`);

  /* Seul chip conservé : Exposé Internet (EDR et REMA supprimés) */
  const internetChip = (d.risk && d.risk.internetExposed)
    ? '<span class="chip chip-warn">🌐 Exposé Internet</span>'
    : '';

  /* Dernière action journal — format inline court */
  const log = d.actionLog || [];
  let laHtml = '<span class="tp-id-la-empty">Aucune action</span>';
  if (log.length) {
    const la    = [...log].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const actor = ACTORS[la.actor || 'team'] || ACTORS.team;
    const et    = ETYPES[la.etype  || 'commentaire'] || ETYPES.commentaire;
    const txt   = la.text ? (la.text.length > 55 ? la.text.substring(0, 55) + '…' : la.text) : '';
    const dStr  = la.date ? formatDate(la.date) : '';
    laHtml = `
      <span class="tp-id-la-actor" style="color:${actor.color}">${actor.emoji}</span>
      <span class="tp-id-la-etype" style="color:${et.color}">${et.emoji} ${et.label}</span>
      ${txt  ? `<span class="tp-id-la-text">${esc(txt)}</span>` : ''}
      ${dStr ? `<span class="tp-id-la-date">${dStr}</span>` : ''}`;
  }

  /* Dernière vérif. ServiceNow */
  const lcCls   = lastCheckClass(d.dates.lastCheckedAt);
  const lcLabel = d.dates.lastCheckedAt
    ? formatDate(d.dates.lastCheckedAt) + lastCheckSuffix(d.dates.lastCheckedAt)
    : 'Jamais vérifié';

  el.innerHTML = `
    <div class="tp-id-left">
      <div class="tp-id-badge-wrap">
        ${statusBadge(d.status)}
        ${actionBadge(d.actionStatus)}
        ${d.actionMotif && d.actionStatus === 'attente_demandeur' ? motifBadge(d) : ''}
        ${reviewDateTagHtml(d.actionLog)}
      </div>
      <div class="tp-id-sep"></div>
      <div class="tp-id-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <strong>${esc(d.applicant?.name) || '—'}</strong>
      </div>
      ${d.asset ? `
      <div class="tp-id-sep"></div>
      <div class="tp-id-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <strong>${esc(d.asset)}</strong>
      </div>` : ''}
      <div class="tp-id-sep"></div>
      <div class="tp-id-meta">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Expire : <strong class="${eCls}">${eLabel}</strong>
      </div>
      ${internetChip ? `<div class="tp-id-sep"></div><div class="tp-id-meta">${internetChip}</div>` : ''}
    </div>
    <div class="tp-id-middle">${laHtml}</div>
    <div class="tp-id-right">
      <span class="tp-id-lastcheck ${lcCls}" id="tp-lastcheck-val">${lcLabel}</span>
      <button class="lc-check-btn tp-id-verify-btn" onclick="tpMarkCheckedNow()">✓ Vérifier</button>
    </div>
  `;
}

/* ================================================================
   MEETING NOTES (panneau gauche) — fond orange
================================================================ */
function renderMeetingNotes(d) {
  const el = document.getElementById('tp-meeting-notes');
  if (!el) return;
  const hasMeeting = !!(d.meetingNotes && d.meetingNotes.trim());
  el.style.display = hasMeeting ? 'block' : 'none';
  /* Le panneau gauche n'est utile que si des meeting notes sont présentes */
  const pane = document.getElementById('tp-left-pane');
  if (pane) pane.style.display = hasMeeting ? 'flex' : 'none';
  el.innerHTML = `
    <div class="tp-meeting-wrap">
      <div class="tp-meeting-header">
        <span class="tp-meeting-title">📋 Préparation réunion</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="tp-expand-btn" onclick="tpOpenExpandModal('meeting')" title="Agrandir">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
          <button class="tp-meeting-clear" onclick="tpClearMeetingNotes()">✕ Effacer</button>
        </div>
      </div>
      <textarea class="tp-meeting-ta"
        placeholder="Notes de préparation, points à aborder, questions…"
        oninput="autoResizeTA(this); tpScheduleMeetingNotesSave()"
        >${esc(d.meetingNotes || '')}</textarea>
      <div class="tp-meeting-hint" id="tp-meeting-hint">✓ Sauvegardé</div>
    </div>`;
}


/* ================================================================
   NOTES LIBRES (cadre supérieur) — fond jaune post-it
================================================================ */
function renderQuickNotes(d) {
  const el = document.getElementById('tp-quick-notes');
  if (!el) return;
  el.innerHTML = `
    <div class="tp-notes-wrap">
      <div class="tp-notes-title">
        <span>📝 Notes</span>
        <button class="tp-expand-btn" onclick="tpOpenExpandModal('notes')" title="Agrandir">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
        </button>
      </div>
      <div contenteditable="true" class="tp-notes-ta"
        data-placeholder="Notes rapides, post-it…"
        oninput="tpScheduleNotesSave()"
        >${plainToRichHtml(d.notes || '')}</div>
      <div class="tp-notes-hint" id="tp-notes-hint">✓ Sauvegardé</div>
    </div>`;
}

/* ================================================================
   PROFIL DE RISQUE (panneau gauche)
================================================================ */
function renderRiskProfile(d) {
  const el = document.getElementById('tp-risk-profile');
  if (!el) return;
  el.innerHTML = `
    <div class="tp-summary-col-title">Indicateurs</div>
    ${sharedIndicatorsHtml(d.risk, d.notesStructured)}`;
}

/* ================================================================
   TIMELINE VISUELLE (panneau droit) — crée #tp-timeline-wrap
   Doit être appelée AVANT renderJournalShell pour que tpRenderJournal()
   puisse y injecter le SVG
================================================================ */
function renderTimelineSection() {
  const el = document.getElementById('tp-timeline');
  if (!el) return;
  el.innerHTML =
    '<div class="tp-section">' +
      '<div class="tp-section-title">Timeline visuelle</div>' +
      '<div id="tp-timeline-wrap"></div>' +
    '</div>';
}

/* ================================================================
   JOURNAL D'ACTIONS (panneau droit)
================================================================ */
function renderJournalShell(d) {
  const el = document.getElementById('tp-journal');
  if (!el) return;
  el.innerHTML = `
    <div class="tp-section">
      <div class="tp-section-title">Journal d'actions</div>
      <div class="tp-j-addform">
        <div class="tp-j-addform-row">
          <select id="tp-j-actor" onchange="tpOnJFormChange()"></select>
          <select id="tp-j-etype" onchange="tpOnJFormChange()"></select>
          <input type="date" id="tp-j-date">
          <button class="tp-j-add-btn" onclick="tpAddJournalEntry()">+ Ajouter</button>
        </div>
        <div id="tp-j-quality" class="tp-j-quality-row" style="display:none">
          <span class="tp-j-quality-label">Qualité :</span>
          <button class="tp-quality-btn incomplet active" onclick="tpSetFormQuality('incomplet')">⚠️ Incomplet</button>
          <button class="tp-quality-btn complet" onclick="tpSetFormQuality('complet')">✅ Complet</button>
        </div>
        <div id="tp-j-meeting-status" class="tp-j-ms-row" style="display:none">
          <span class="tp-j-quality-label">Statut :</span>
          <button class="tp-ms-btn active" data-ms="planned" onclick="tpSetFormMeetingStatus('planned')">📅 Planifiée</button>
          <button class="tp-ms-btn" data-ms="held" onclick="tpSetFormMeetingStatus('held')">✅ Tenue</button>
          <button class="tp-ms-btn" data-ms="cancelled" onclick="tpSetFormMeetingStatus('cancelled')">✗ Annulée</button>
        </div>
        <div id="tp-j-review-date" class="tp-j-rd-row" style="display:none">
          <span class="tp-j-quality-label">Date review :</span>
          <input type="date" id="tp-j-review-date-input" class="tp-j-rd-input">
        </div>
        <textarea id="tp-j-message" class="tp-j-message"
          placeholder="Décrivez l'action ou la décision\u2026"
          rows="1"></textarea>
      </div>
      <div id="tp-journal-body"></div>
    </div>`;
  tpInitJournalForm();
  tpRenderJournal();
}

/* ================================================================
   DOSSIER STRUCTURÉ (panneau droit)
================================================================ */
function renderDossier(d) {
  const el = document.getElementById('tp-dossier');
  if (!el) return;
  const ns     = d.notesStructured || {};
  const checks = ns.checks || {};
  const done   = Object.values(checks).filter(Boolean).length;
  const total  = NOTES_SECTIONS.length;
  const pct    = total ? Math.round((done / total) * 100) : 0;

  const sectionsHtml = NOTES_SECTIONS.map(s => {
    const isChecked = !!checks[s.key];
    const content   = ns[s.key] || '';
    return `
      <div class="tp-notes-block" id="tp-nb-${s.key}">
        <div class="tp-notes-block-header" onclick="tpToggleNoteBlock('${s.key}')">
          <div class="tp-notes-block-left">
            <div class="tp-notes-block-check ${isChecked ? 'checked' : ''}"
              id="tp-nb-check-${s.key}"
              onclick="event.stopPropagation(); tpToggleNoteCheck('${s.key}')"></div>
            <span class="tp-notes-block-title">${s.label}</span>
          </div>
          <svg class="tp-nb-chevron open" id="tp-nb-chev-${s.key}"
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
        <div class="tp-notes-block-body open" id="tp-nb-body-${s.key}">
          <div contenteditable="true" class="tp-notes-block-ta" id="tp-nb-ta-${s.key}"
            data-placeholder="${s.label}…"
            oninput="tpScheduleDossierSave('${s.key}')"
            >${plainToRichHtml(content)}</div>
          <div class="tp-save-hint" id="tp-dossier-hint-${s.key}" style="margin-top:4px">✓ Sauvegardé</div>
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="tp-section">
      <div class="tp-section-title">Dossier</div>
      <div class="tp-dossier-progress">
        <div class="tp-dossier-progress-bar-wrap">
          <div class="tp-dossier-progress-bar" style="width:${pct}%"></div>
        </div>
        <span class="tp-dossier-progress-label">${done}/${total}</span>
      </div>
      ${sectionsHtml}
    </div>`;
}

/* ================================================================
   CYCLE DE VIE (panneau droit)
================================================================ */
function renderLifecycle(d) {
  const el = document.getElementById('tp-lifecycle');
  if (!el) return;
  const dates = d.dates || {};
  /* AMELIORATION3 — si une entrée soumission existe dans le journal,
     "Créé le" affiche sa date (la plus ancienne soumission). */
  const log = d.actionLog || [];
  const soumEntry = log.filter(e => e.etype === 'soumission' && e.date)
                       .sort((a, b) => a.date.localeCompare(b.date))[0];
  const createdVal = soumEntry ? soumEntry.date : toDateInputVal(dates.createdAt);

  el.innerHTML = `
    <div class="tp-summary-col-title">Cycle de vie</div>
    <div class="lc-grid">
      <div class="lc-item">
        <span class="lc-label">Créé le</span>
        <input type="date" id="tp-lc-created" class="lc-date-input" value="${createdVal}" onchange="tpUpdateDate('createdAt',this.value)">
      </div>
      <div class="lc-item">
        <span class="lc-label">Mis à jour</span>
        <span class="lc-val muted">${formatDate(dates.updatedAt) || '—'}</span>
      </div>
      <div class="lc-item">
        <span class="lc-label">Expire le</span>
        <input type="date" id="tp-lc-expires" class="lc-date-input ${expiryClass(daysUntil(dates.expiresAt))}" value="${toDateInputVal(dates.expiresAt)}" onchange="tpUpdateDate('expiresAt',this.value)">
      </div>
      <div class="lc-item">
        <span class="lc-label">Next date clé</span>
        <input type="date" class="lc-date-input" value="${toDateInputVal(dates.nextFollowup)}" onchange="tpUpdateDate('nextFollowup',this.value)">
      </div>
    </div>`;
}

/* ================================================================
   LANCEMENT
================================================================ */
document.addEventListener('DOMContentLoaded', initTicketPage);
