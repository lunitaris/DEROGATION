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
  renderNextSteps(d);
  renderMeetingNotes(d);
  renderQuickNotes(d);
  renderTimelineSection();
  renderJournalShell(d);
  renderDossier(d);
  renderLifecycle(d);
  renderAutoHistory(d);

  /* Redimensionne toutes les textareas après rendu */
  requestAnimationFrame(() => {
    document.querySelectorAll('textarea').forEach(autoResizeTA);
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
  const days  = daysUntil(d.dates.expiresAt);
  const eCls  = expiryClass(days);
  const eLabel = days === null ? '—' : (days < 0 ? 'Expirée' : `J-${days}`);

  el.innerHTML = `
    <div class="tp-id-badge-wrap">
      ${statusBadge(d.status)}
      ${actionBadge(d.actionStatus)}
      ${d.actionMotif && d.actionStatus === 'attente_demandeur' ? motifBadge(d) : ''}
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
    ${d.risk ? `
    <div class="tp-id-sep"></div>
    <div class="tp-id-meta">${riskChips(d.risk)}</div>` : ''}
  `;
}

/* ================================================================
   NEXT STEPS (panneau gauche)
================================================================ */
function renderNextSteps(d) {
  const el = document.getElementById('tp-next-steps');
  if (!el) return;
  const ns = d.notesStructured || {};

  /* Construit les options select actionStatus */
  const actionOptions = Object.entries(ACTION_LABELS).map(([k, v]) =>
    `<option value="${k}" ${d.actionStatus === k ? 'selected' : ''}>${v}</option>`
  ).join('');

  /* Options motif */
  const motifOptions = [
    `<option value="">— Motif —</option>`,
    ...Object.entries(MOTIF_LABELS).map(([k, v]) =>
      `<option value="${k}" ${d.actionMotif === k ? 'selected' : ''}>${v}</option>`)
  ].join('');

  const showMotif = d.actionStatus === 'attente_demandeur';
  const dueVal    = d.actionDueDate ? d.actionDueDate.slice(0, 10) : '';

  el.innerHTML = `
    <div class="tp-section">
      <div class="tp-section-title">Next Steps</div>
      <div class="tp-next-steps-grid">

        <div class="tp-field-row">
          <span class="tp-field-label">Qui doit agir</span>
          <select id="tp-action-status"
            onchange="tpOnActionStatusChange(this.value)">
            ${actionOptions}
          </select>
        </div>

        <div class="tp-field-row" id="tp-motif-row" style="display:${showMotif ? 'flex' : 'none'}">
          <span class="tp-field-label">Motif</span>
          <select id="tp-action-motif"
            onchange="tpScheduleActionSave()">
            ${motifOptions}
          </select>
        </div>

        <div class="tp-field-row">
          <span class="tp-field-label">Dernière action / Contexte</span>
          <textarea id="tp-action-detail"
            placeholder="Décris la dernière action ou le contexte actuel…"
            oninput="autoResizeTA(this); tpScheduleActionSave()"
            >${esc(d.actionDetail || '')}</textarea>
        </div>

        <div class="tp-field-row">
          <span class="tp-field-label">Échéance prévisionnelle</span>
          <input type="date" id="tp-action-due"
            value="${dueVal}"
            onchange="tpScheduleActionSave()">
        </div>

        <div class="tp-save-hint" id="tp-action-save-hint">✓ Sauvegardé</div>
      </div>
    </div>`;
}

/* ================================================================
   MEETING NOTES (panneau gauche) — fond orange
================================================================ */
function renderMeetingNotes(d) {
  const el = document.getElementById('tp-meeting-notes');
  if (!el) return;
  const hasMeeting = !!(d.meetingNotes && d.meetingNotes.trim());
  el.style.display = hasMeeting ? 'block' : 'none';
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

/* Bouton d'activation dans la topbar des notes ou via raccourci */
function tpShowMeetingNotes() {
  const section = document.getElementById('tp-meeting-notes');
  if (!section) return;
  section.style.display = 'block';
  const ta = section.querySelector('.tp-meeting-ta');
  if (ta) {
    ta.focus();
    requestAnimationFrame(() => autoResizeTA(ta));
  }
}

/* ================================================================
   NOTES LIBRES (panneau gauche) — fond jaune post-it
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
      <textarea class="tp-notes-ta"
        placeholder="Notes rapides, post-it…"
        oninput="autoResizeTA(this); tpScheduleNotesSave()"
        >${esc(d.notes || '')}</textarea>
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
    <div class="tp-section">
      <div class="tp-section-title">Profil de risque</div>
      ${sharedRiskHtml(d.risk, RISK_PARAMS_TICKET)}
    </div>`;
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
          <select id="tp-j-actor"></select>
          <select id="tp-j-etype"></select>
          <input type="date" id="tp-j-date">
          <button class="tp-j-add-btn" onclick="tpAddJournalEntry()">+ Ajouter</button>
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
          <textarea class="tp-notes-block-ta" id="tp-nb-ta-${s.key}"
            placeholder="${s.label}…"
            oninput="autoResizeTA(this); tpScheduleDossierSave('${s.key}')"
            >${esc(content)}</textarea>
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
  const dates    = d.dates || {};
  const lcCls    = lastCheckClass(dates.lastCheckedAt);
  const lcSuffix = lastCheckSuffix(dates.lastCheckedAt);

  /* ── Dernière action du journal (la plus récente par date) ── */
  const actionLog = d.actionLog || [];
  let lastActionHtml = '';
  if (actionLog.length > 0) {
    const la    = [...actionLog].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const actor = ACTORS[la.actor || 'team'] || ACTORS.team;
    const et    = ETYPES[la.etype || 'commentaire'] || ETYPES.commentaire;
    const laText = la.text
      ? (la.text.length > 80 ? la.text.substring(0, 80) + '…' : la.text)
      : '';
    lastActionHtml = `
        <div class="tp-lastaction-row">
          <div class="tp-lastaction-header">
            <span class="tp-lc-label">Dernière action journal</span>
            <span class="tp-lc-label tp-lastaction-date">${formatDate(la.date)}</span>
          </div>
          <div class="tp-lastaction-body">
            <span class="tp-lastaction-meta">
              <span style="color:${actor.color}">${actor.emoji} ${actor.label}</span>
              <span style="color:${et.color}">${et.emoji} ${et.label}</span>
            </span>
            ${laText ? `<span class="tp-lastaction-text">${esc(laText)}</span>` : ''}
          </div>
        </div>`;
  } else {
    lastActionHtml = `
        <div class="tp-lastaction-row">
          <div class="tp-lastaction-header">
            <span class="tp-lc-label">Dernière action journal</span>
          </div>
          <div class="tp-lc-val muted">—</div>
        </div>`;
  }

  el.innerHTML = `
    <div class="tp-section">
      <div class="tp-section-title">Cycle de vie</div>
      <div class="tp-lifecycle-grid">
        <div class="tp-lc-item">
          <span class="tp-lc-label">Créé le</span>
          <span class="tp-lc-val">${formatDate(dates.createdAt) || '—'}</span>
        </div>
        <div class="tp-lc-item">
          <span class="tp-lc-label">Mis à jour</span>
          <span class="tp-lc-val">${formatDate(dates.updatedAt) || '—'}</span>
        </div>
        <div class="tp-lc-item">
          <span class="tp-lc-label">Expire le</span>
          <span class="tp-lc-val ${expiryClass(daysUntil(dates.expiresAt))}">${formatDate(dates.expiresAt) || '—'}</span>
        </div>
        <div class="tp-lc-item">
          <span class="tp-lc-label">Prochaine relance</span>
          <span class="tp-lc-val ${dates.nextFollowup ? '' : 'muted'}">${formatDate(dates.nextFollowup) || '—'}</span>
        </div>
        ${lastActionHtml}
        <div class="tp-lastcheck-row">
          <div class="tp-lastcheck-info">
            <div class="tp-lc-label">Dernière vérif. ServiceNow</div>
            <div class="tp-lc-val ${lcCls}" id="tp-lastcheck-val">
              ${dates.lastCheckedAt ? formatDate(dates.lastCheckedAt) + lcSuffix : '—'}
            </div>
          </div>
          <button class="tp-lastcheck-btn" onclick="tpMarkCheckedNow()">✓ Vérifier maintenant</button>
        </div>
      </div>
    </div>`;
}

/* ================================================================
   HISTORIQUE AUTOMATIQUE (panneau droit)
================================================================ */
function renderAutoHistory(d) {
  const el = document.getElementById('tp-auto-history');
  if (!el) return;
  const rows = sharedHistoryItems(d.history).map(({timestamp, event, label, desc}) => `
      <div class="tp-history-item">
        <div class="tp-history-dot ${event}"></div>
        <div>
          <span class="tp-history-meta">${formatDate(timestamp) || '—'} · ${label}</span>
          ${desc ? `<span class="tp-history-desc"> — ${desc}</span>` : ''}
        </div>
      </div>`).join('');

  el.innerHTML = `
    <div class="tp-section">
      <div class="tp-section-title">Historique</div>
      <div class="tp-history-list">
        ${rows || '<div class="tp-journal-empty">Aucun événement.</div>'}
      </div>
    </div>`;
}

/* ================================================================
   LANCEMENT
================================================================ */
document.addEventListener('DOMContentLoaded', initTicketPage);
