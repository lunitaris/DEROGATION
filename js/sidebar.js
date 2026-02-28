/* ================================================================
   SIDEBAR — Ouverture, navigation, rendu, interactions,
             autosave (action, notes, quick notes)
================================================================ */

/* MODULE STATE — journal d'actions */
let _actionLog = [];
let actionLogExpanded = false;

function openSidebar(id) {
  if (id !== activeSidebarId) actionLogExpanded = false;
  activeSidebarId = id;
  document.getElementById('detail-sidebar').classList.add('open');
  document.getElementById('app-body').classList.add('sidebar-open');
  renderSidebar(id);
  document.querySelectorAll('.derog-card,.derog-card tbody tr,[data-id]').forEach(el=>{
    el.classList.toggle('selected', el.dataset.id===id);
  });
}
function closeSidebar() {
  activeSidebarId = null;
  document.getElementById('detail-sidebar').classList.remove('open');
  document.getElementById('app-body').classList.remove('sidebar-open');
  document.querySelectorAll('.selected').forEach(el=>el.classList.remove('selected'));
}
function navigateSidebar(dir) {
  if (!activeSidebarId||!filteredIds.length) return;
  const i = filteredIds.indexOf(activeSidebarId)+dir;
  if (i>=0&&i<filteredIds.length) openSidebar(filteredIds[i]);
}

function renderSidebar(id) {
  const raw = Store.getById(id);
  if (!raw) { closeSidebar(); return; }
  const d = Store._migrateDerog({...raw});

  const idx = filteredIds.indexOf(id);
  document.getElementById('btn-prev').disabled = idx<=0;
  document.getElementById('btn-next').disabled = idx>=filteredIds.length-1;

  const days = daysUntil(d.dates.expiresAt);
  const followupDays = daysUntil(d.dates.nextFollowup);
  const actionDueDays = daysUntil(d.actionDueDate);
  const ns = d.notesStructured || {};
  const checks = ns.checks || {};
  const totalSections = NOTES_SECTIONS.length;
  const filledSections = NOTES_SECTIONS.filter(s => (ns[s.key]||'').trim().length > 0).length;
  const checkedSections = NOTES_SECTIONS.filter(s => checks[s.key]).length;
  const avatarLetter = (d.applicant?.name||'?')[0].toUpperCase();
  const hasMeetingNotes = (d.meetingNotes||'').trim().length > 0;

  const _sidebarBodyEl = document.getElementById('sidebar-body');
  _sidebarBodyEl.innerHTML = `
    <!-- HERO -->
    <div class="sidebar-hero">
      <div class="sidebar-hero-top">${urgencyBadge(d)}${statusBadge(d.status)}</div>
      <div class="sidebar-title">${esc(d.title)||'(Sans titre)'}</div>
      <div class="sidebar-ticket-row">
        <span class="sidebar-ticket">${esc(d.ticketId)||'Sans ticket ID'}</span>
        <button class="btn-meeting${hasMeetingNotes?' has-content':''}" onclick="toggleMeetingNotes('${id}')" title="${hasMeetingNotes?'Notes de réunion en cours':'Préparer une réunion'}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Réunion${hasMeetingNotes?' <span class="meeting-dot"></span>':''}
        </button>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- PORTEUR + ASSET -->
    <div class="sidebar-section">
      <div class="section-label">Porteur &amp; Périmètre</div>
      <div class="porteur-card">
        <div class="porteur-avatar">${avatarLetter}</div>
        <div class="porteur-info">
          <div class="porteur-name">${esc(d.applicant?.name)||'—'}</div>
          ${d.asset ? `<div class="porteur-asset" title="${esc(d.asset)}">📦 ${esc(d.asset)}</div>` : '<div class="porteur-asset" style="color:var(--text-muted)">Aucun asset renseigné</div>'}
        </div>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- STATUT SN -->
    <div class="sidebar-section">
      <div class="section-label">Cycle de vie ServiceNow</div>
      <div class="status-bloc">
        <div class="status-bloc-label">Statut SN</div>
        <select class="status-select-inline" style="flex:1;" onchange="quickUpdate('${id}','status',this.value)">
          ${Object.entries(STATUS_LABELS).map(([v,l])=>`<option value="${v}" ${d.status===v?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- JOURNAL D'ACTIONS -->
    <div class="sidebar-section">
      <div class="section-label">Journal</div>
      <div class="action-log-wrap">
        <div class="action-log-header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Suivi des actions
        </div>
        <div id="action-log-body" class="action-log-body"></div>
        <button class="action-log-more" id="action-log-more" onclick="toggleActionLog('${id}')" style="display:none"></button>
      </div>
      <div class="action-log-hint" id="action-log-hint"></div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- NEXT STEPS -->
    <div class="sidebar-section">
      <div class="section-label">Next steps</div>
      <div class="action-bloc">
        <div>
          <div class="action-date-label" style="margin-bottom:4px;">Qui doit agir / Prochaine étape</div>
          <select class="status-select-inline" onchange="onActionStatusChange('${id}',this.value)">
            ${Object.entries(ACTION_LABELS).map(([v,l])=>`<option value="${v}" ${d.actionStatus===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div id="motif-row" style="display:${d.actionStatus==='attente_demandeur'?'block':'none'}">
          <div class="action-date-label" style="margin-bottom:4px;">Motif de l'attente</div>
          <select class="status-select-inline" id="action-motif" onchange="scheduleActionSave('${id}')">
            <option value="">— Sélectionner un motif</option>
            ${MOTIF_LABELS.map(m=>`<option value="${m}" ${d.actionMotif===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="action-date-label" style="margin-bottom:4px;">Dernière action / Contexte</div>
          <textarea class="action-detail-input" id="action-detail" placeholder="Ex: 15/03 — relancé Jean Dupont par mail, attente DIC. Prochaine étape : réunion si pas de retour avant le 22…" oninput="scheduleActionSave('${id}')">${esc(d.actionDetail)}</textarea>
        </div>
        <div>
          <div class="action-date-label">Date prévisionnelle <span style="color:var(--text-muted);font-weight:400;">(relance / échéance / prochaine action)</span></div>
          <input type="date" class="action-date-input" id="action-due-date" value="${toDateInputVal(d.actionDueDate)}" onchange="scheduleActionSave('${id}')" ${actionDueDays!==null&&actionDueDays<0?'style="color:var(--urgency-p0)"':''}>
        </div>
        <div class="action-save-hint" id="action-save-hint"></div>
      </div>
    </div>

    <!-- NOTES RÉUNION (masqué par défaut si vide) -->
    <div id="meeting-notes-section" style="${hasMeetingNotes?'':'display:none'}">
      <div class="sidebar-divider"></div>
      <div class="sidebar-section">
        <div class="section-label">Préparation réunion</div>
        <div class="meeting-notes-wrap">
          <div class="meeting-notes-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Réunion en cours
            <button class="meeting-notes-clear" onclick="clearMeetingNotes('${id}')" title="Effacer et masquer">✕ Effacer</button>
          </div>
          <textarea class="meeting-notes-textarea" id="meeting-notes" placeholder="Points à aborder, questions à poser, décisions à prendre…" oninput="autoResizeTA(this);scheduleMeetingNotesSave('${id}')">${esc(d.meetingNotes||'')}</textarea>
        </div>
        <div class="meeting-notes-hint" id="meeting-notes-hint"></div>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- NOTES LIBRES -->
    <div class="sidebar-section">
      <div class="section-label">Notes</div>
      <div class="quick-notes-wrap">
        <div class="quick-notes-header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Notes libres
        </div>
        <textarea class="quick-notes-textarea" id="quick-notes" placeholder="Idées, rappels, contexte informel, liens utiles…" oninput="autoResizeTA(this);scheduleQuickNotesSave('${id}')">${esc(d.notes||'')}</textarea>
      </div>
      <div class="quick-notes-hint" id="quick-notes-hint"></div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- RISQUE -->
    <div class="sidebar-section">
      <div class="section-label">Profil de risque</div>
      ${sharedRiskHtml(d.risk, RISK_PARAMS_SIDEBAR)}
    </div>

    <div class="sidebar-divider"></div>

    <!-- DATES -->
    <div class="sidebar-section">
      <div class="section-label">Cycle de vie</div>
      <div class="info-grid">
        <div class="info-item"><div class="info-item-label">Créée le</div><div class="info-item-value">${formatDate(d.dates.createdAt)}</div></div>
        <div class="info-item"><div class="info-item-label">Mise à jour</div><div class="info-item-value">${formatDate(d.dates.updatedAt)}</div></div>
        <div class="info-item"><div class="info-item-label">Expiration</div><div class="info-item-value">${expiryLabel(d.dates.expiresAt)}</div></div>
        <div class="info-item"><div class="info-item-label">Prochaine relance</div><div class="info-item-value ${followupDays!==null&&followupDays<0?'expiry-danger':''}">${d.dates.nextFollowup?formatDate(d.dates.nextFollowup)+(followupDays!==null&&followupDays<0?' ⚠':''):'—'}</div></div>
        <div class="info-item" style="grid-column:1/-1;">
          <div class="info-item-label">Dernière vérification ServiceNow</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:3px;">
            <span class="info-item-value ${lastCheckClass(d.dates.lastCheckedAt)}">${d.dates.lastCheckedAt?formatDate(d.dates.lastCheckedAt)+lastCheckSuffix(d.dates.lastCheckedAt):'Jamais vérifié'}</span>
            <button class="btn-ghost" style="font-size:11px;padding:3px 10px;" onclick="markCheckedNow('${d.id}')">✓ Vérifier maintenant</button>
          </div>
        </div>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- NOTES STRUCTURÉES -->
    <div class="sidebar-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div class="section-label" style="margin-bottom:0;">Dossier</div>
        <span style="font-size:11px;color:var(--text-muted);">${checkedSections}/${totalSections} validés</span>
      </div>
      <div class="dossier-progress" style="margin-bottom:10px;">
        <div class="dossier-progress-bar-wrap">
          <div class="dossier-progress-bar${filledSections===totalSections?' complete':''}" style="width:${Math.round(filledSections/totalSections*100)}%"></div>
        </div>
        <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">${filledSections}/${totalSections} remplis</span>
      </div>
      <div class="notes-section" id="notes-section-wrap">
        ${NOTES_SECTIONS.map(s => {
          const val = ns[s.key]||'';
          const chk = checks[s.key]||false;
          const hasContent = val.trim().length > 0;
          return `<div class="notes-block" id="nb-${s.key}">
            <div class="notes-block-header" onclick="toggleNotesBlock('${s.key}')">
              <span style="font-size:14px;margin-right:2px;">${hasContent?(chk?'✅':'📝'):'⬜'}</span>
              <span class="notes-block-title">${s.label}</span>
              <button class="notes-block-check${chk?' checked':''}" onclick="event.stopPropagation();toggleNoteCheck('${id}','${s.key}')" title="${chk?'Marquer non validé':'Marquer validé'}">${chk?'✓ OK':'À valider'}</button>
              <svg class="notes-block-chevron open" id="chev-${s.key}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="notes-block-body" id="nbb-${s.key}">
              <textarea class="notes-textarea" id="nt-${s.key}" placeholder="${s.placeholder}" oninput="autoResizeTA(this);scheduleNotesSave('${id}')">${esc(val)}</textarea>
            </div>
          </div>`;
        }).join('')}
        <div class="notes-global-hint" id="notes-global-hint"></div>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- QUICK ACTIONS -->
    <div class="sidebar-section">
      <div class="section-label">Actions rapides</div>
      <div class="quick-actions">
        <button class="btn-action" onclick="openEmailModal('${id}','followup')">✉ Relance info</button>
        <button class="btn-action" onclick="openEmailModal('${id}','status')">✉ Point statut</button>
        <button class="btn-action full-width" onclick="openEmailModal('${id}','expiry')">✉ Alerte expiration</button>
        <button class="btn-action danger full-width" onclick="confirmDelete('${id}')">🗑 Supprimer cette dérogation</button>
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <!-- HISTORIQUE -->
    <div class="sidebar-section">
      <div class="section-label">Historique</div>
      <div class="history-list">
        ${sharedHistoryItems(d.history).map(({timestamp,dotSuffix,label,desc})=>
          `<div class="history-item"><div class="history-dot${dotSuffix?' history-dot-'+dotSuffix:''}"></div><div style="flex:1"><div class="history-desc">${label}${desc?' — '+desc:''}</div><div class="history-time">${formatDate(timestamp)}</div></div></div>`
        ).join('')}
      </div>
    </div>
  `;

  // Initialiser le journal d'actions
  _actionLog = [...(d.actionLog || [])];
  renderActionLogSection(id);

  // Auto-resize toutes les textareas après rendu
  requestAnimationFrame(() => {
    _sidebarBodyEl.querySelectorAll('textarea').forEach(autoResizeTA);
  });
}

/* SIDEBAR INTERACTIONS */
function quickUpdate(id, field, value) {
  Store.update(id, { [field]: value });
  renderAll();
}

function toggleNotesBlock(key) {
  const body = document.getElementById(`nbb-${key}`);
  const chev = document.getElementById(`chev-${key}`);
  if (!body) return;
  const isOpen = !body.classList.contains('collapsed');
  body.classList.toggle('collapsed', isOpen);
  if (chev) chev.classList.toggle('open', !isOpen);
  if (!isOpen) {
    requestAnimationFrame(() => {
      const ta = body.querySelector('textarea');
      if (ta) autoResizeTA(ta);
    });
  }
}

function toggleNoteCheck(id, key) {
  const raw = Store.getById(id);
  if (!raw) return;
  const d = Store._migrateDerog({...raw});
  const ns = {...d.notesStructured};
  NOTES_SECTIONS.forEach(s => {
    const el = document.getElementById(`nt-${s.key}`);
    if (el) ns[s.key] = el.value;
  });
  ns.checks = {...(ns.checks||{})};
  ns.checks[key] = !ns.checks[key];
  Store.updateNotesStructured(id, ns);
  renderSidebar(id);
}

/* AUTOSAVE — notes structurées (debounce 1200ms) */
function scheduleNotesSave(id) {
  clearTimeout(notesSaveTimer);
  const hint = document.getElementById('notes-global-hint');
  if (hint) { hint.textContent = 'En cours…'; hint.className = 'notes-global-hint'; }
  notesSaveTimer = setTimeout(() => {
    const ns = {};
    NOTES_SECTIONS.forEach(s => {
      const el = document.getElementById(`nt-${s.key}`);
      ns[s.key] = el ? el.value : '';
    });
    const raw = Store.getById(id);
    ns.checks = raw ? (Store._migrateDerog({...raw}).notesStructured?.checks || {}) : {};
    Store.updateNotesStructured(id, ns);
    const h2 = document.getElementById('notes-global-hint');
    if (h2) { h2.textContent = '✓ Sauvegardé'; h2.className = 'notes-global-hint saved'; }
    NOTES_SECTIONS.forEach(s => {
      const blockEl = document.getElementById(`nb-${s.key}`);
      if (!blockEl) return;
      const val = (ns[s.key] || '').trim();
      const chk = ns.checks[s.key] || false;
      const iconEl = blockEl.querySelector('.notes-block-header span:first-child');
      if (iconEl) iconEl.textContent = val ? (chk ? '✅' : '📝') : '⬜';
    });
  }, 400);
}

/* AUTOSAVE — action bloc (debounce 800ms) */
function scheduleActionSave(id) {
  clearTimeout(actionSaveTimer);
  const hint = document.getElementById('action-save-hint');
  if (hint) { hint.textContent='En cours…'; hint.className='action-save-hint'; }
  actionSaveTimer = setTimeout(() => {
    const detail = document.getElementById('action-detail')?.value||'';
    const dueDate = document.getElementById('action-due-date')?.value||null;
    const motif = document.getElementById('action-motif')?.value||null;
    Store.updateActionBloc(id, detail, dueDate, motif);
    renderStats();
    renderTodayPanel();
    const h2 = document.getElementById('action-save-hint');
    if (h2) { h2.textContent='✓ Sauvegardé'; h2.className='action-save-hint saved'; }
  }, 800);
}

/* AUTOSAVE — quick notes (debounce 800ms) */
function scheduleQuickNotesSave(id) {
  clearTimeout(quickNotesSaveTimer);
  const hint = document.getElementById('quick-notes-hint');
  if (hint) { hint.textContent = 'En cours…'; hint.className = 'quick-notes-hint'; }
  quickNotesSaveTimer = setTimeout(() => {
    const text = document.getElementById('quick-notes')?.value || '';
    Store.updateNotes(id, text);
    const h2 = document.getElementById('quick-notes-hint');
    if (h2) { h2.textContent = '✓ Sauvegardé'; h2.className = 'quick-notes-hint saved'; }
  }, 800);
}

/* MEETING NOTES — toggle, clear, autosave */
function toggleMeetingNotes(id) {
  const section = document.getElementById('meeting-notes-section');
  if (!section) return;
  const isHidden = section.style.display === 'none';
  section.style.display = isHidden ? '' : 'none';
  if (isHidden) {
    requestAnimationFrame(() => {
      const ta = document.getElementById('meeting-notes');
      if (ta) { autoResizeTA(ta); ta.focus(); }
    });
  }
}

function clearMeetingNotes(id) {
  Store.updateMeetingNotes(id, '');
  const ta = document.getElementById('meeting-notes');
  if (ta) { ta.value = ''; autoResizeTA(ta); }
  const section = document.getElementById('meeting-notes-section');
  if (section) section.style.display = 'none';
  const btn = document.querySelector('.btn-meeting');
  if (btn) { btn.classList.remove('has-content'); btn.title = 'Préparer une réunion'; }
}

/* AUTOSAVE — meeting notes (debounce 800ms) */
function scheduleMeetingNotesSave(id) {
  clearTimeout(meetingNotesSaveTimer);
  const hint = document.getElementById('meeting-notes-hint');
  if (hint) { hint.textContent = 'En cours…'; hint.className = 'meeting-notes-hint'; }
  meetingNotesSaveTimer = setTimeout(() => {
    const text = document.getElementById('meeting-notes')?.value || '';
    Store.updateMeetingNotes(id, text);
    // Mettre à jour l'indicateur sur le bouton
    const btn = document.querySelector('.btn-meeting');
    const hasDot = btn?.querySelector('.meeting-dot');
    if (btn) {
      if (text.trim()) {
        btn.classList.add('has-content');
        btn.title = 'Notes de réunion en cours';
        if (!hasDot) btn.insertAdjacentHTML('beforeend', ' <span class="meeting-dot"></span>');
      } else {
        btn.classList.remove('has-content');
        btn.title = 'Préparer une réunion';
        if (hasDot) hasDot.remove();
      }
    }
    const h2 = document.getElementById('meeting-notes-hint');
    if (h2) { h2.textContent = '✓ Sauvegardé'; h2.className = 'meeting-notes-hint saved'; }
  }, 800);
}

/* JOURNAL D'ACTIONS — rendu, ajout, mise à jour, toggle */
/* Retourne les indices de _actionLog triés par date croissante (sans date → fin) */
function _sortedActionLogIndices() {
  return _actionLog
    .map((_, i) => i)
    .sort((a, b) => {
      const da = _actionLog[a].date || '';
      const db = _actionLog[b].date || '';
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.localeCompare(db);
    });
}

function renderActionLogSection(id) {
  const body = document.getElementById('action-log-body');
  const moreBtn = document.getElementById('action-log-more');
  if (!body) return;

  const total = _actionLog.length;
  const sortedIdx = _sortedActionLogIndices();
  /* Collapse : montre les 4 entrées les plus récentes (fin du tri croissant) */
  const startPos = (!actionLogExpanded && total > 4) ? total - 4 : 0;
  const visibleSortedIdx = sortedIdx.slice(startPos);
  const hiddenCount = startPos;

  if (total === 0) {
    body.innerHTML = `<div class="action-log-empty"><button class="action-log-btn-new" onclick="addActionLogEntry('${id}')">+ Ajouter une entrée</button></div>`;
  } else {
    body.innerHTML = visibleSortedIdx.map(realIdx => {
      const entry = _actionLog[realIdx];
      return `<div class="action-log-row" data-real-idx="${realIdx}">
        <input type="date" class="action-log-date" value="${esc(entry.date||'')}" oninput="updateActionLogEntry('${id}', ${realIdx}, 'date', this.value)">
        <input type="text" class="action-log-text" value="${esc(entry.text||'')}" placeholder="Action, décision, note…" oninput="updateActionLogEntry('${id}', ${realIdx}, 'text', this.value)">
        <button class="action-log-btn-add" onclick="addActionLogEntry('${id}')" title="Ajouter une entrée">+</button>
        <button class="action-log-btn-remove" onclick="removeActionLogEntry('${id}', ${realIdx})" title="Supprimer cette ligne">×</button>
      </div>`;
    }).join('');
  }

  if (moreBtn) {
    if (!actionLogExpanded && total > 4) {
      moreBtn.style.display = '';
      moreBtn.textContent = `▼ ${hiddenCount} entrée${hiddenCount > 1 ? 's' : ''} plus ancienne${hiddenCount > 1 ? 's' : ''}`;
    } else if (actionLogExpanded && total > 4) {
      moreBtn.style.display = '';
      moreBtn.textContent = '▲ Réduire';
    } else {
      moreBtn.style.display = 'none';
    }
  }
}

function addActionLogEntry(id) {
  const today = new Date().toISOString().slice(0, 10);
  _actionLog.push({ date: today, text: '' });
  const newRealIdx = _actionLog.length - 1;
  Store.updateActionLog(id, _actionLog);
  if (_actionLog.length > 4) actionLogExpanded = true;
  renderActionLogSection(id);
  requestAnimationFrame(() => {
    const row = document.querySelector(`#action-log-body .action-log-row[data-real-idx="${newRealIdx}"]`);
    if (row) row.querySelector('.action-log-text')?.focus();
  });
}

function removeActionLogEntry(id, realIdx) {
  _actionLog.splice(realIdx, 1);
  Store.updateActionLog(id, _actionLog);
  if (_actionLog.length <= 4) actionLogExpanded = false;
  renderActionLogSection(id);
}

function updateActionLogEntry(id, idx, field, value) {
  if (_actionLog[idx]) _actionLog[idx][field] = value;
  clearTimeout(actionLogSaveTimer);
  const hint = document.getElementById('action-log-hint');
  if (hint) { hint.textContent = 'En cours…'; hint.className = 'action-log-hint'; }
  actionLogSaveTimer = setTimeout(() => {
    Store.updateActionLog(id, _actionLog);
    const h2 = document.getElementById('action-log-hint');
    if (h2) { h2.textContent = '✓ Sauvegardé'; h2.className = 'action-log-hint saved'; }
  }, 800);
}

function toggleActionLog(id) {
  actionLogExpanded = !actionLogExpanded;
  renderActionLogSection(id);
}

function onActionStatusChange(id, val) {
  quickUpdate(id, 'actionStatus', val);
  const row = document.getElementById('motif-row');
  if (row) row.style.display = val === 'attente_demandeur' ? 'block' : 'none';
  if (val !== 'attente_demandeur') {
    Store.update(id, { actionMotif: null });
    const sel = document.getElementById('action-motif');
    if (sel) sel.value = '';
  }
}
