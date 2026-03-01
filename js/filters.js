/* ================================================================
   FILTERS — État UI, filtres, stats bar, today panel,
             renderCards, renderList, renderAll, setView
================================================================ */

/* UI STATE */
let currentView = 'card';
let activeSidebarId = null;
let filteredIds = [];
let notesSaveTimer = null;
let quickNotesSaveTimer = null;
let meetingNotesSaveTimer = null;
let actionLogSaveTimer = null;
let filters = { status: '', action: '', expiry: '', search: '' };
let sortKey = 'updatedAt';

/* FILTER & SORT */
function getFiltered() {
  let list = Store.getAll().map(d => Store._migrateDerog({...d}));
  const f = filters;
  if (f.status) list = list.filter(d => d.status === f.status);
  if (f.action) list = list.filter(d => d.actionStatus === f.action);
  if (f.expiry === 'week')  list = list.filter(d => { const v=daysUntil(d.dates.expiresAt); return v!==null&&v>=0&&v<=7; });
  if (f.expiry === 'month') list = list.filter(d => { const v=daysUntil(d.dates.expiresAt); return v!==null&&v>=0&&v<=30; });
  if (f.expiry === 'past')  list = list.filter(d => { const v=daysUntil(d.dates.expiresAt); return v!==null&&v<0; });
  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(d =>
      (d.ticketId||'').toLowerCase().includes(q) ||
      (d.title||'').toLowerCase().includes(q) ||
      (d.applicant?.name||'').toLowerCase().includes(q) ||
      (d.asset||'').toLowerCase().includes(q)
    );
  }
  list.sort((a,b) => {
    if (sortKey === 'ticketId') return (a.ticketId||'').localeCompare(b.ticketId||'');
    if (sortKey === 'expiresAt') return (a.dates.expiresAt||'9999').localeCompare(b.dates.expiresAt||'9999');
    return (b.dates[sortKey]||'').localeCompare(a.dates[sortKey]||'');
  });
  return list;
}

function applyFilters() {
  filters.status = document.getElementById('filter-status').value;
  filters.action = document.getElementById('filter-action').value;
  filters.expiry = document.getElementById('filter-expiry').value;
  sortKey = document.getElementById('sort-select').value;
  updateFilterBarState();
  renderAll();
}
function clearFilters() {
  filters = { status:'',action:'',expiry:'',search:'' };
  ['filter-status','filter-action','filter-expiry'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('search-input').value='';
  updateFilterBarState();
  renderAll();
}
function updateFilterBarState() {
  const hasActive = !!(filters.status || filters.action || filters.expiry || filters.search);
  document.getElementById('filter-bar').classList.toggle('has-filters', hasActive);
}

/* STATS BAR */
function renderStats() {
  const all = Store.getAll().map(d=>Store._migrateDerog({...d}));
  const sc = { new:'var(--status-new-text)', en_revue:'var(--status-review-text)', validated:'var(--status-validated-text)', expired:'var(--status-expired-text)' };
  const expSoon = all.filter(d=>{ const v=daysUntil(d.dates.expiresAt); return v!==null&&v>=0&&v<=7&&d.status!=='validated'&&d.status!=='expired'; }).length;
  const aFaire = all.filter(d=>d.actionStatus==='a_faire'&&d.status!=='validated'&&d.status!=='expired').length;
  const curStatus = filters.status, curExpiry = filters.expiry, curAction = filters.action;
  let html = Object.keys(STATUS_LABELS).map(s=>{
    const active = curStatus===s;
    const dotCls = s==='expired' ? 'stat-dot stat-dot-expired' : 'stat-dot';
    return `<button class="stat-pill${active?' stat-pill-active':''}" onclick="quickFilterStatus('${s}')" title="${active?'Cliquer pour désactiver':'Filtrer par statut SN'}"><span class="${dotCls}" style="background:${sc[s]}"></span>${STATUS_LABELS[s]} <span class="stat-num">${all.filter(d=>d.status===s).length}</span></button>`;
  }).join('');
  html += `<div class="filter-sep" style="height:20px;width:1px;background:var(--border);flex-shrink:0;"></div>`;
  html += `<button class="stat-pill${curAction==='a_faire'?' stat-pill-active':''}" onclick="quickFilterAction('a_faire')" style="${aFaire>0&&curAction!=='a_faire'?'border-color:var(--action-a-faire)':''}" title="Tickets où tu dois agir"><span class="stat-dot" style="background:var(--action-a-faire)"></span>À faire par moi <span class="stat-num${aFaire>0?' stat-num-danger':''}">${aFaire}</span></button>`;
  html += `<button class="stat-pill${curExpiry==='week'?' stat-pill-active':''}" onclick="quickFilterExpiry()" style="${expSoon>0&&curExpiry!=='week'?'border-color:var(--urgency-p1)':''}" title="Expire dans moins de 7 jours"><span class="stat-dot" style="background:var(--urgency-p1)"></span>Expire &lt;7j <span class="stat-num${expSoon>0?' stat-num-warn':''}">${expSoon}</span></button>`;
  document.getElementById('stats-bar').innerHTML = html;
}
function quickFilterStatus(s) { const same = filters.status===s; document.getElementById('filter-status').value=same?'':s; applyFilters(); }
function quickFilterAction(a) { const same = filters.action===a; document.getElementById('filter-action').value=same?'':a; applyFilters(); }
function quickFilterExpiry() { const same = filters.expiry==='week'; document.getElementById('filter-expiry').value=same?'':'week'; applyFilters(); }

/* TODAY PANEL */
function getTodayItems() {
  const all = Store.getAll().map(d=>Store._migrateDerog({...d}));
  const now = new Date();
  const items = [];
  all.forEach(d => {
    if (d.status === 'validated') return;
    const days = daysUntil(d.dates.expiresAt);
    if (d.actionStatus === 'a_faire') items.push({ d, reason: 'Action requise de ta part', cls: 'relancer' });
    if (d.actionStatus === 'reunion_prevue') items.push({ d, reason: 'Réunion prévue — à préparer', cls: 'ok' });
    if (days !== null && days >= 0 && days <= 7) items.push({ d, reason: `Expire dans ${days===0?"aujourd'hui":days+' jours'}`, cls: 'expiring' });
    if (d.dates.nextFollowup && new Date(d.dates.nextFollowup) <= now && d.actionStatus !== 'termine')
      items.push({ d, reason: 'Date de relance dépassée', cls: 'followup' });
    if (['p0','p1'].includes(d.urgency?.level||'') && ['a_faire','attente_demandeur'].includes(d.actionStatus))
      items.push({ d, reason: `Urgence ${(d.urgency?.level||'').toUpperCase()} — action requise`, cls: '' });
  });
  const seen = new Set();
  return items.filter(i => { if(seen.has(i.d.id)) return false; seen.add(i.d.id); return true; });
}

function renderTodayPanel() {
  const items = getTodayItems();
  const ce = document.getElementById('today-count');
  const be = document.getElementById('today-body');
  ce.textContent = items.length;
  ce.className = 'today-count' + (items.length===0?' zero':'');
  const titleEl = document.getElementById('today-title-text');
  if (titleEl) titleEl.firstChild.textContent = items.length===0 ? 'Tout est à jour ' : 'À traiter aujourd\'hui ';

  /* Rappel export — affiché si aucun export depuis ≥7 jours (ou jamais exporté) */
  const prefs = Store.loadPrefs();
  const lastExport = prefs.lastExportAt || null;
  const daysSinceExport = lastExport
    ? Math.floor((Date.now() - new Date(lastExport)) / 86400000)
    : null;
  const needsExport = daysSinceExport === null || daysSinceExport >= 7;
  const exportMsg = daysSinceExport === null
    ? 'Aucun export effectué — pensez à sauvegarder vos données'
    : `Dernier export il y a ${daysSinceExport} jour${daysSinceExport>1?'s':''} — cliquez pour exporter`;
  const exportHtml = needsExport ? `
    <div class="today-alert export-reminder" onclick="exportData()" title="Exporter maintenant">
      <div class="today-alert-info">
        <div class="today-alert-ticket">💾 Backup</div>
        <div class="today-alert-title">Exporter les données</div>
        <div class="today-alert-reason">${exportMsg}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
    </div>` : '';

  if (items.length===0) {
    be.innerHTML = exportHtml + (needsExport ? '' : '<p class="today-empty">✓ Rien d\'urgent — tableau de bord propre !</p>');
    return;
  }
  be.innerHTML = exportHtml + items.map(({d,reason,cls})=>`
    <div class="today-alert ${cls}" onclick="openSidebar('${d.id}')">
      <div class="today-alert-info">
        <div class="today-alert-ticket">${esc(d.ticketId)||'Sans ticket'}</div>
        <div class="today-alert-title">${esc(d.title)||'(Sans titre)'}</div>
        <div class="today-alert-reason">${reason}</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
    </div>`).join('');
}

function toggleTodayPanel() {
  const b=document.getElementById('today-body'), c=document.getElementById('today-chevron');
  const open=!b.classList.contains('hidden');
  b.classList.toggle('hidden',open); c.classList.toggle('open',!open);
  Store.savePrefs({todayPanelCollapsed:open});
}

/* CARDS */
function renderCards(list) {
  if (!list.length) return `<div class="empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><h3>Aucune dérogation</h3><p>Créez-en une ou modifiez les filtres.</p></div>`;
  return `<div id="card-grid">${list.map(d=>{
    const days=daysUntil(d.dates.expiresAt), eCls=expiryClass(days);
    const eLabel=days===null?'—':(days<0?'Expirée':`J-${days}`);
    return `<div class="derog-card${activeSidebarId===d.id?' selected':''}" data-status="${d.status}" data-id="${d.id}" onclick="openSidebar('${d.id}')" onauxclick="if(event.button===1){event.preventDefault();openFullscreen('${d.id}')}">
      <button class="btn-fullscreen" onclick="event.stopPropagation();openFullscreen('${d.id}')" title="Ouvrir en plein écran"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>
      <div class="card-top"><span class="card-ticket">${esc(d.ticketId)||'—'}</span>${statusBadge(d.status)}</div>
      <div class="card-title">${esc(d.title)||'(Sans titre)'}</div>
      <div class="card-meta"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${esc(d.applicant?.name)||'—'}${d.asset?`<span style="color:var(--border)">·</span>${esc(d.asset)}`:''}
      </div>
      <div class="card-bottom">${actionBadge(d.actionStatus)}${motifBadge(d)}<span class="card-expiry ${eCls}">${eLabel}</span></div>
    </div>`;
  }).join('')}</div>`;
}

/* RENDER */
function renderList() {
  const list = getFiltered();
  filteredIds = list.map(d=>d.id);
  const html = currentView === 'card' ? renderCards(list) : renderPilotage(list);
  document.getElementById('list-container').innerHTML = html;
}

function renderAll() {
  // Banner données corrompues (affiché si Store._loadError est défini)
  const banner = document.getElementById('data-error-banner');
  if (banner) banner.style.display = Store._loadError ? '' : 'none';
  renderStats();
  renderTodayPanel();
  renderList();
  if (activeSidebarId) renderSidebar(activeSidebarId);
}

function setView(v) {
  if (v === 'table') v = 'pilotage';
  currentView = v;
  document.getElementById('btn-card-view').classList.toggle('active', v==='card');
  document.getElementById('btn-pilotage-view').classList.toggle('active', v==='pilotage');
  Store.savePrefs({defaultView:v});
  renderList();
}
