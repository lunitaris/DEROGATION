/* ================================================================
   TICKET-ACTIONS.JS — Interactions & autosave pour vue plein écran
   Préfixe tp_ pour tout (évite les conflits avec app globals)
================================================================ */

/* ── État du module ── */
let tp_currentId = null;
let tp_journal   = [];          /* copie locale du journal (source de vérité) */

/* ── Timers debounce ── */
let tp_meetingNotesSaveTimer = null;
let tp_notesSaveTimer      = null;
let tp_dossierSaveTimer    = null;
let tp_expandSaveTimer     = null;

/* ── État modale expansion ── */
let tp_expandType = null;   /* 'meeting' | 'notes' */

/* ================================================================
   THÈME (réutilise le même localStorage que l'app principale)
================================================================ */
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  Store.savePrefs({ theme: next });
}

/* ================================================================
   NAVIGATION — ouvrir le modal édition dans l'onglet principal
   (fallback : renvoie simplement vers index.html#edit)
================================================================ */
function tpOpenEdit() {
  if (!tp_currentId) return;
  /* Essaie d'appeler l'onglet parent si disponible */
  if (window.opener && window.opener.openEditModal) {
    window.opener.openEditModal(tp_currentId);
    window.opener.focus();
  } else {
    /* fallback : ouvre index.html avec un hash pour signaler l'édition */
    window.open('index.html', '_blank');
  }
}

/* ================================================================
   MEETING NOTES
================================================================ */
function tpClearMeetingNotes() {
  if (!tp_currentId) return;
  const ta = document.querySelector('.tp-meeting-ta');
  if (ta) ta.value = '';
  Store.updateMeetingNotes(tp_currentId, '');
  /* Cache la section et le panneau gauche (devenu inutile) */
  const section = document.getElementById('tp-meeting-notes');
  if (section) section.style.display = 'none';
  const pane = document.getElementById('tp-left-pane');
  if (pane) pane.style.display = 'none';
}

function tpScheduleMeetingNotesSave() {
  clearTimeout(tp_meetingNotesSaveTimer);
  tp_meetingNotesSaveTimer = setTimeout(() => {
    if (!tp_currentId) return;
    const ta = document.querySelector('.tp-meeting-ta');
    const text = ta?.value || '';
    Store.updateMeetingNotes(tp_currentId, text);
    tpHint('tp-meeting-hint');
  }, 800);
}

/* ================================================================
   NOTES LIBRES
================================================================ */
function tpScheduleNotesSave() {
  clearTimeout(tp_notesSaveTimer);
  tp_notesSaveTimer = setTimeout(() => {
    if (!tp_currentId) return;
    const ta = document.querySelector('.tp-notes-ta');
    const text = ta?.innerHTML || '';
    Store.updateNotes(tp_currentId, text);
    tpHint('tp-notes-hint');
  }, 800);
}

/* ================================================================
   JOURNAL D'ACTIONS
================================================================ */
/* Retourne les indices de tp_journal triés par date décroissante (plus récent → plus ancien) */
function _tpSortedJournalIndices() {
  return sortedActionLogIndices(tp_journal);
}

/* Génère les <option> pour le select acteur */
function _tpActorOptions(selected) {
  return Object.keys(ACTORS).map(k => {
    const a = ACTORS[k];
    return `<option value="${k}"${k === selected ? ' selected' : ''}>${a.emoji} ${a.label}</option>`;
  }).join('');
}

/* Génère les <option> pour le select type d'événement */
function _tpEtypeOptions(selected) {
  return Object.keys(ETYPES).map(k => {
    const et = ETYPES[k];
    return `<option value="${k}"${k === selected ? ' selected' : ''}>${et.emoji} ${et.label}</option>`;
  }).join('');
}

function tpRenderJournal() {
  const body = document.getElementById('tp-journal-body');
  if (!body) return;
  if (!tp_journal.length) {
    body.innerHTML = '<div class="tp-journal-empty">Aucune entrée — remplissez le formulaire ci-dessus pour commencer.</div>';
    tpRenderTimeline([]);
    return;
  }
  const sortedIdx = _tpSortedJournalIndices();
  body.innerHTML = sortedIdx.map(realIdx => {
    const entry = tp_journal[realIdx];
    const showQuality = entry.etype === 'reponse' && (entry.actor || 'team') === 'demandeur';
    const quality     = entry.quality || null;
    const qBtns = showQuality ? `
        <div class="tp-jrow-quality">
          <button class="tp-quality-btn incomplet${!quality || quality === 'incomplet' ? ' active' : ''}"
            onclick="tpUpdateJournalQuality(${realIdx},'incomplet')" title="Réponse incomplète">⚠️</button>
          <button class="tp-quality-btn complet${quality === 'complet' ? ' active' : ''}"
            onclick="tpUpdateJournalQuality(${realIdx},'complet')" title="Réponse complète">✅</button>
        </div>` : '';
    return `
    <div class="tp-jrow" data-real-idx="${realIdx}">
      <div class="tp-jrow-meta">
        <input type="date" class="action-log-date"
          value="${entry.date || ''}"
          oninput="tpUpdateJournal(${realIdx},'date',this.value)"
          onblur="tpRenderJournal()">
        <select class="tp-j-actor-sel" onchange="tpUpdateJournal(${realIdx},'actor',this.value)">
          ${_tpActorOptions(entry.actor || 'team')}
        </select>
        <select class="tp-j-etype-sel" onchange="tpUpdateJournal(${realIdx},'etype',this.value)">
          ${_tpEtypeOptions(entry.etype || 'commentaire')}
        </select>
        ${qBtns}
        <button class="action-log-btn-remove" onclick="tpRemoveJournalEntry(${realIdx})" title="Supprimer cette entrée">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <input type="text" class="action-log-text"
        value="${esc(entry.text || '')}"
        placeholder="Action, décision, échange…"
        oninput="tpUpdateJournal(${realIdx},'text',this.value)">
    </div>`;
  }).join('');
  tpRenderTimeline(tp_journal);
}

/* Initialise les selects et la date du formulaire d'ajout */
function tpInitJournalForm() {
  const fActor = document.getElementById('tp-j-actor');
  const fEtype = document.getElementById('tp-j-etype');
  const fDate  = document.getElementById('tp-j-date');
  if (fActor) fActor.innerHTML = _tpActorOptions('team');
  if (fEtype) fEtype.innerHTML = _tpEtypeOptions('commentaire');
  if (fDate)  fDate.value = new Date().toISOString().slice(0, 10);
}

function tpAddJournalEntry() {
  const actor   = document.getElementById('tp-j-actor')?.value   || 'team';
  const etype   = document.getElementById('tp-j-etype')?.value   || 'commentaire';
  const date    = document.getElementById('tp-j-date')?.value    || '';
  const msgEl   = document.getElementById('tp-j-message');
  const message = (msgEl?.value || '').trim();
  if (!message) {
    if (msgEl) { msgEl.style.borderColor = 'var(--accent)'; msgEl.focus(); }
    return;
  }
  /* Qualité — uniquement si demandeur + réponse */
  let quality = null;
  if (actor === 'demandeur' && etype === 'reponse') {
    const activeBtn = document.querySelector('#tp-j-quality .tp-quality-btn.active');
    quality = activeBtn?.classList.contains('complet') ? 'complet' : 'incomplet';
  }
  if (msgEl) { msgEl.style.borderColor = ''; msgEl.value = ''; }
  /* Réinitialiser le formulaire qualité sur défaut incomplet */
  tpSetFormQuality('incomplet');
  /* Réinitialiser les groupes car la structure peut changer */
  _tpGroupExpanded = {};
  tp_journal.push({ date, text: message, actor, etype, quality });
  tpSaveJournal();
  tpRenderJournal();
  /* AMELIORATION3 — si on vient d'ajouter une soumission, sync "Créé le" */
  if (etype === 'soumission' && date) _tpSyncCreatedFromJournal();
}

function tpRemoveJournalEntry(realIdx) {
  if (realIdx < 0 || realIdx >= tp_journal.length) return;
  tp_journal.splice(realIdx, 1);
  /* Réinitialiser les groupes car la structure peut changer */
  _tpGroupExpanded = {};
  tpRenderJournal();
  tpSaveJournal();
}

function tpUpdateJournal(realIdx, field, value) {
  if (realIdx < 0 || realIdx >= tp_journal.length) return;
  tp_journal[realIdx][field] = value;
  tpSaveJournal();
  /* Pour actor/etype : re-render pour mettre à jour le dot et la timeline */
  if (field === 'actor' || field === 'etype') {
    tpRenderJournal();
  }
  /* AMELIORATION3 — si la date ou le type d'une entrée soumission change,
     synchronise "Créé le" dans Cycle de vie */
  if (field === 'date' && tp_journal[realIdx].etype === 'soumission' && value) {
    _tpSyncCreatedFromJournal();
  }
  if (field === 'etype' && value === 'soumission') {
    _tpSyncCreatedFromJournal();
  }
}

function tpSaveJournal() {
  if (!tp_currentId) return;
  Store.updateActionLog(tp_currentId, [...tp_journal]);
}

/* ================================================================
   QUALITÉ DE RÉPONSE
================================================================ */

/**
 * Affiche/masque le bloc qualité du formulaire selon actor + etype.
 * Appelé via onchange sur les selects du formulaire d'ajout.
 */
function tpOnJFormChange() {
  const actor = document.getElementById('tp-j-actor')?.value || 'team';
  const etype = document.getElementById('tp-j-etype')?.value || 'commentaire';
  const qDiv  = document.getElementById('tp-j-quality');
  if (qDiv) qDiv.style.display = (actor === 'demandeur' && etype === 'reponse') ? 'flex' : 'none';
}

/**
 * Sélectionne la qualité dans le formulaire d'ajout (complet / incomplet).
 */
function tpSetFormQuality(val) {
  document.querySelectorAll('#tp-j-quality .tp-quality-btn').forEach(b => {
    b.classList.toggle('active', b.classList.contains(val));
  });
}

/**
 * Met à jour la qualité d'une entrée existante du journal.
 */
function tpUpdateJournalQuality(realIdx, val) {
  if (realIdx < 0 || realIdx >= tp_journal.length) return;
  tp_journal[realIdx].quality = val;
  tpSaveJournal();
  tpRenderJournal();
}

/* ================================================================
   DOSSIER STRUCTURÉ — toggle section
================================================================ */
function tpToggleNoteBlock(key) {
  const body = document.getElementById('tp-nb-body-' + key);
  const chevron = document.getElementById('tp-nb-chev-' + key);
  if (!body) return;
  const open = body.classList.toggle('open');
  if (chevron) chevron.classList.toggle('open', open);
  if (open) {
    const el = body.querySelector('[contenteditable]');
    if (el) requestAnimationFrame(() => el.focus());
  }
}

/* ================================================================
   DOSSIER STRUCTURÉ — autosave (debounce 1200ms)
================================================================ */
function tpScheduleDossierSave(key) {
  clearTimeout(tp_dossierSaveTimer);
  tp_dossierSaveTimer = setTimeout(() => {
    if (!tp_currentId) return;
    const d = Store.getById(tp_currentId);
    if (!d) return;
    const ns = { ...(d.notesStructured || {}) };
    /* Lire toutes les sections */
    NOTES_SECTIONS.forEach(s => {
      const ta = document.getElementById('tp-nb-ta-' + s.key);
      if (ta) ns[s.key] = ta.innerHTML;
    });
    Store.updateNotesStructured(tp_currentId, ns);
    tpHint('tp-dossier-hint-' + key);
    /* Mettre à jour la barre de progression */
    tpUpdateDossierProgress();
  }, 1200);
}

/* ================================================================
   DOSSIER — checkbox OK
================================================================ */
function tpToggleNoteCheck(key) {
  if (!tp_currentId) return;
  const d = Store.getById(tp_currentId);
  if (!d) return;
  const ns = Store._migrateDerog({ ...d }).notesStructured;
  ns.checks[key] = !ns.checks[key];
  Store.updateNotesStructured(tp_currentId, ns);
  /* Mettre à jour visuellement */
  const btn = document.getElementById('tp-nb-check-' + key);
  if (btn) btn.classList.toggle('checked', ns.checks[key]);
  tpUpdateDossierProgress();
}

function tpUpdateDossierProgress() {
  if (!tp_currentId) return;
  const d = Store._migrateDerog({ ...Store.getById(tp_currentId) });
  if (!d) return;
  const checks = d.notesStructured?.checks || {};
  const done   = Object.values(checks).filter(Boolean).length;
  const total  = NOTES_SECTIONS.length;
  const pct    = total ? Math.round((done / total) * 100) : 0;
  const bar    = document.querySelector('.tp-dossier-progress-bar');
  const label  = document.querySelector('.tp-dossier-progress-label');
  if (bar)   bar.style.width = pct + '%';
  if (label) label.textContent = `${done}/${total}`;
}

/* ================================================================
   CYCLE DE VIE — dates éditables + "Vérifier maintenant"
================================================================ */
function tpUpdateDate(field, val) {
  if (!tp_currentId) return;
  Store.update(tp_currentId, { [field]: val || null });
  /* Ne pas appeler renderLifecycle() : ça détruirait les inputs date actifs
     (Chrome fire change pour chaque chiffre saisi dans le champ année).
     On met à jour uniquement le bandeau identité et la classe CSS expiresAt. */
  const d = Store.getById(tp_currentId);
  if (!d) return;
  renderIdentityStrip(d);
  if (field === 'expiresAt') {
    const inp = document.getElementById('tp-lc-expires');
    if (inp) inp.className = 'lc-date-input ' + expiryClass(daysUntil(val));
  }
  /* AMELIORATION3 — sync entrée soumission ↔ date d'ouverture */
  if (field === 'createdAt' && val) _tpSyncSoumissionFromCreated(val);
}

function tpMarkCheckedNow() {
  if (!tp_currentId) return;
  const now = new Date().toISOString();
  Store.update(tp_currentId, { lastCheckedAt: now });
  const fresh = Store.getById(tp_currentId);
  if (fresh) renderIdentityStrip(Store._migrateDerog({ ...fresh }));
  tpShowToast('✓ Dernière vérification mise à jour');
}

/* ================================================================
   SUPPRESSION
================================================================ */
function tpConfirmDelete() {
  if (!tp_currentId) return;
  const overlay = document.getElementById('tp-confirm-overlay');
  const okBtn   = document.getElementById('tp-confirm-ok');
  if (!overlay || !okBtn) return;
  overlay.style.display = 'flex';
  okBtn.onclick = () => {
    Store.delete(tp_currentId);
    window.location.href = 'index.html';
  };
}

/* ================================================================
   EMAILS — copie dans le presse-papiers
================================================================ */
function tpCopyEmail(type) {
  if (!tp_currentId) return;
  const d = Store._migrateDerog({ ...Store.getById(tp_currentId) });
  if (!d) return;
  /* 'info' (bouton HTML) correspond à 'followup' dans EMAIL_TEMPLATES */
  const templateKey = type === 'info' ? 'followup' : type;
  const tpl = EMAIL_TEMPLATES[templateKey]?.(d);
  if (!tpl) return;
  const full = `Objet : ${tpl.subject}\n\n${tpl.body}`;
  tpCopyToClipboard(full, `Email « ${tpl.label} » copié !`);
}

function tpCopyToClipboard(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => tpShowToast(successMsg || '✓ Copié !'),
      () => tpFallbackCopy(text, successMsg)
    );
  } else {
    tpFallbackCopy(text, successMsg);
  }
}

function tpFallbackCopy(text, successMsg) {
  clipboardFallbackCopy(
    text,
    () => tpShowToast(successMsg || '✓ Copié !'),
    () => tpShowToast('⚠ Impossible de copier')
  );
}

/* ================================================================
   MODALE EXPANSION — notes libres & préparation réunion
================================================================ */
function tpOpenExpandModal(type) {
  if (!tp_currentId) return;
  tp_expandType = type;

  const overlay = document.getElementById('tp-expand-modal');
  const ta      = document.getElementById('tp-expand-ta');
  const title   = document.getElementById('tp-expand-title');
  if (!overlay || !ta) return;

  if (type === 'meeting') {
    if (title) title.textContent = '📋 Préparation réunion';
    ta.placeholder = 'Points à aborder, questions à poser, décisions à prendre…';
    const src = document.querySelector('.tp-meeting-ta');
    ta.value = src ? src.value : '';
  } else {
    if (title) title.textContent = '📝 Notes';
    ta.placeholder = 'Notes rapides, post-it, idées, contexte informel…';
    const src = document.querySelector('.tp-notes-ta');
    ta.value = src ? src.innerText : '';
  }

  /* Reset hint */
  const hint = document.getElementById('tp-expand-hint');
  if (hint) { hint.textContent = ''; hint.className = 'tp-expand-hint'; }

  overlay.style.display = 'flex';

  /* Focus, curseur en fin de texte */
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });

  /* Fermeture sur Échap */
  document._tpExpandKeyHandler = e => { if (e.key === 'Escape') tpCloseExpandModal(); };
  document.addEventListener('keydown', document._tpExpandKeyHandler);
}

function tpCloseExpandModal() {
  const overlay = document.getElementById('tp-expand-modal');
  if (overlay) overlay.style.display = 'none';

  /* Sauvegarde immédiate + sync vers la source */
  clearTimeout(tp_expandSaveTimer);
  _tpFlushExpand();

  /* Retire l'écouteur Échap */
  if (document._tpExpandKeyHandler) {
    document.removeEventListener('keydown', document._tpExpandKeyHandler);
    document._tpExpandKeyHandler = null;
  }
  tp_expandType = null;
}

/* Sync le contenu de la modale → textarea source + localStorage */
function _tpFlushExpand() {
  const ta = document.getElementById('tp-expand-ta');
  if (!ta || !tp_expandType || !tp_currentId) return;
  const val = ta.value;

  if (tp_expandType === 'meeting') {
    const src = document.querySelector('.tp-meeting-ta');
    if (src) { src.value = val; requestAnimationFrame(() => autoResizeTA(src)); }
    Store.updateMeetingNotes(tp_currentId, val);
    tpHint('tp-meeting-hint');
  } else {
    const src = document.querySelector('.tp-notes-ta');
    if (src) src.innerHTML = plainToRichHtml(val);
    Store.updateNotes(tp_currentId, plainToRichHtml(val));
    tpHint('tp-notes-hint');
  }
}

/* Autosave debounce 800ms depuis la modale */
function tpScheduleExpandSave() {
  clearTimeout(tp_expandSaveTimer);
  const hint = document.getElementById('tp-expand-hint');
  if (hint) { hint.textContent = 'En cours…'; hint.className = 'tp-expand-hint'; }
  tp_expandSaveTimer = setTimeout(() => {
    _tpFlushExpand();
    const h2 = document.getElementById('tp-expand-hint');
    if (h2) { h2.textContent = '✓ Sauvegardé'; h2.className = 'tp-expand-hint saved'; }
  }, 800);
}

/* ================================================================
   UI HELPERS
================================================================ */
function tpHint(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2000);
}

let tp_toastTimer = null;
function tpShowToast(msg) {
  const el = document.getElementById('tp-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(tp_toastTimer);
  tp_toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ================================================================
   AMELIORATION3 — Synchronisation "Créé le" ↔ entrée soumission journal
================================================================ */

/**
 * Lit la date de la 1ʳᵉ entrée soumission (ordre chronologique)
 * et met à jour "Créé le" dans le store + dans l'input DOM.
 */
function _tpSyncCreatedFromJournal() {
  if (!tp_currentId) return;
  const soumEntries = tp_journal.filter(e => e.etype === 'soumission' && e.date);
  if (!soumEntries.length) return;
  soumEntries.sort((a, b) => a.date.localeCompare(b.date));
  const date = soumEntries[0].date;
  const d = Store.getById(tp_currentId);
  if (d && toDateInputVal(d.dates.createdAt) === date) return; /* déjà en phase */
  Store.update(tp_currentId, { createdAt: date });
  const inp = document.getElementById('tp-lc-created');
  if (inp) inp.value = date;
}

/**
 * Met à jour (ou crée) l'entrée soumission dans tp_journal pour qu'elle
 * reflète la nouvelle date d'ouverture `date`.
 */
function _tpSyncSoumissionFromCreated(date) {
  if (!date || !tp_currentId) return;
  const soumIdx = tp_journal.findIndex(e => e.etype === 'soumission');
  if (soumIdx >= 0) {
    if (tp_journal[soumIdx].date === date) return; /* déjà en phase */
    tp_journal[soumIdx].date = date;
  } else {
    tp_journal.push({ date, text: 'Soumission du ticket', actor: 'demandeur', etype: 'soumission' });
  }
  tpSaveJournal();
  tpRenderJournal();
}

/* ================================================================
   RESIZE DU CADRE SUPÉRIEUR (drag handle)
================================================================ */
function tpInitSummaryResize() {
  const handle = document.getElementById('tp-summary-handle');
  if (!handle) return;

  handle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    const summaryEl = document.getElementById('tp-summary');
    const startY = e.clientY;
    const startH = summaryEl.getBoundingClientRect().height;

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const newH = Math.max(80, Math.min(500, startH + (e.clientY - startY)));
      document.documentElement.style.setProperty('--tp-summary-h', newH + 'px');
    }

    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
