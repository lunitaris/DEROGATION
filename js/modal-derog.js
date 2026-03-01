/* ================================================================
   MODAL DÉROGATION — Création, édition, suppression,
                       helpers modal (open/close/overlay)
================================================================ */
let editingId = null;

function openNewModal() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Nouvelle dérogation';
  renderModalForm(null);
  openModal('derog-modal');
}
function openEditModal(id) {
  editingId = id;
  const d = Store._migrateDerog({...Store.getById(id)});
  document.getElementById('modal-title').textContent = 'Modifier la dérogation';
  renderModalForm(d);
  openModal('derog-modal');
}

function renderModalForm(d) {
  const urgencyVal = d ? (d.urgency?.level||'-') : '-';
  const edrVal  = d ? (d.risk.edrInstalled?'yes':'no') : '';
  const netVal  = d ? (d.risk.internetExposed?'yes':'no') : '';
  const remaVal = d ? (d.risk.hasRemediationPlan?'yes':'no') : '';
  const ns = d?.notesStructured || {};

  document.getElementById('modal-form-body').innerHTML = `
    <!-- IDENTIFICATION -->
    <div class="form-section">
      <div class="form-section-title">Identification</div>
      <div class="form-row">
        <div class="form-field">
          <label>Ticket ServiceNow</label>
          <input type="text" id="f-ticketId" placeholder="SNW-2024-0001" value="${esc(d?.ticketId||'')}">
        </div>
        <div class="form-field">
          <label>Urgence</label>
          <select id="f-urgency">
            <option value="-" ${urgencyVal==='-'?'selected':''}>— Aucune</option>
            <option value="p0" ${urgencyVal==='p0'?'selected':''}>P0 — Critique</option>
            <option value="p1" ${urgencyVal==='p1'?'selected':''}>P1 — Élevée</option>
          </select>
        </div>
      </div>
      <div class="form-row full">
        <div class="form-field">
          <label>Titre / Description courte *</label>
          <input type="text" id="f-title" placeholder="Ex: Exception VPN pour système OT legacy" value="${esc(d?.title||'')}">
        </div>
      </div>
    </div>

    <!-- PORTEUR -->
    <div class="form-section">
      <div class="form-section-title">Porteur</div>
      <div class="form-row">
        <div class="form-field">
          <label>Nom du porteur</label>
          <input type="text" id="f-applicantName" placeholder="Jean Dupont" value="${esc(d?.applicant?.name||'')}">
        </div>
        <div class="form-field">
          <label>Asset / Périmètre</label>
          <input type="text" id="f-asset" placeholder="Infra prod — Zone B" value="${esc(d?.asset||'')}">
        </div>
      </div>
    </div>

    <!-- WORKFLOW -->
    <div class="form-section">
      <div class="form-section-title">Workflow &amp; Statut</div>
      <div class="form-row">
        <div class="form-field">
          <label>Statut ServiceNow</label>
          <select id="f-status">
            ${Object.entries(STATUS_LABELS).map(([v,l])=>`<option value="${v}" ${(d?.status||'new')===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label>Next step — Qui doit agir</label>
          <select id="f-actionStatus" onchange="document.getElementById('f-motif-row').style.display=this.value==='attente_demandeur'?'flex':'none'">
            ${Object.entries(ACTION_LABELS).map(([v,l])=>`<option value="${v}" ${(d?.actionStatus||'a_faire')===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="f-motif-row" class="form-field" style="display:${(d?.actionStatus||'a_faire')==='attente_demandeur'?'flex':'none'}">
        <label>Motif de l'attente</label>
        <select id="f-actionMotif">
          <option value="">— Sélectionner un motif</option>
          ${MOTIF_LABELS.map(m=>`<option value="${m}" ${(d?.actionMotif||'')=== m?'selected':''}>${m}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- RISQUE -->
    <div class="form-section">
      <div class="form-section-title">Profil de risque</div>
      <div class="form-row triple">
        <div class="form-field">
          <label>EDR installé</label>
          <div class="toggle-group">
            <button class="toggle-btn${edrVal==='yes'?' selected-yes':''}" id="edr-yes" onclick="selectToggle('edr','yes')">✓ Oui</button>
            <button class="toggle-btn${edrVal==='no'?' selected-no':''}" id="edr-no" onclick="selectToggle('edr','no')">✗ Non</button>
          </div>
        </div>
        <div class="form-field">
          <label>Exposé Internet</label>
          <div class="toggle-group">
            <button class="toggle-btn${netVal==='yes'?' selected-yes':''}" id="net-yes" onclick="selectToggle('net','yes')">✓ Oui</button>
            <button class="toggle-btn${netVal==='no'?' selected-no':''}" id="net-no" onclick="selectToggle('net','no')">✗ Non</button>
          </div>
        </div>
        <div class="form-field">
          <label>Plan de remédiation</label>
          <div class="toggle-group">
            <button class="toggle-btn${remaVal==='yes'?' selected-yes':''}" id="rema-yes" onclick="selectToggle('rema','yes')">✓ Oui</button>
            <button class="toggle-btn${remaVal==='no'?' selected-no':''}" id="rema-no" onclick="selectToggle('rema','no')">✗ Non</button>
          </div>
        </div>
      </div>
      <div class="form-row triple">
        <div class="form-field"><label>Disponibilité (D)</label><select id="f-dicD"><option value="" ${!(d?.risk?.dic?.disponibilite)?'selected':''}>? — Inconnu</option>${[1,2,3,4].map(n=>`<option value="${n}" ${(d?.risk?.dic?.disponibilite||0)==n?'selected':''}>${n} — ${DIC_LABELS[n]}</option>`).join('')}</select></div>
        <div class="form-field"><label>Intégrité (I)</label><select id="f-dicI"><option value="" ${!(d?.risk?.dic?.integrite)?'selected':''}>? — Inconnu</option>${[1,2,3,4].map(n=>`<option value="${n}" ${(d?.risk?.dic?.integrite||0)==n?'selected':''}>${n} — ${DIC_LABELS[n]}</option>`).join('')}</select></div>
        <div class="form-field"><label>Confidentialité (C)</label><select id="f-dicC"><option value="" ${!(d?.risk?.dic?.confidentialite)?'selected':''}>? — Inconnu</option>${[1,2,3,4].map(n=>`<option value="${n}" ${(d?.risk?.dic?.confidentialite||0)==n?'selected':''}>${n} — ${DIC_LABELS[n]}</option>`).join('')}</select></div>
      </div>
    </div>

    <!-- DATES -->
    <div class="form-section">
      <div class="form-section-title">Dates</div>
      <div class="form-row">
        <div class="form-field"><label>Date d'expiration</label><input type="date" id="f-expiresAt" value="${toDateInputVal(d?.dates?.expiresAt)}"></div>
        <div class="form-field"><label>Prochaine relance</label><input type="date" id="f-nextFollowup" value="${toDateInputVal(d?.dates?.nextFollowup)}"></div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Dernière vérification ServiceNow</label>
          <input type="date" id="f-lastCheckedAt" value="${toDateInputVal(d?.dates?.lastCheckedAt)}">
        </div>
        <div class="form-field" style="justify-content:flex-end;">
          <label style="visibility:hidden;">—</label>
          <button type="button" class="btn-ghost" style="font-size:12px;" onclick="document.getElementById('f-lastCheckedAt').value=new Date().toISOString().split('T')[0]">✓ Aujourd'hui</button>
        </div>
      </div>
    </div>

    <!-- DOSSIER (notes structurées) -->
    <div class="form-section">
      <div class="form-section-title">Dossier</div>
      ${NOTES_SECTIONS.map(s=>{
        const colorMap = {
          contexte:    {border:'rgba(88,166,255,0.3)',  bg:'rgba(88,166,255,0.05)',  label:'#79C0FF'},
          raison:      {border:'rgba(240,136,62,0.3)',  bg:'rgba(240,136,62,0.05)',  label:'#F0883E'},
          risques:     {border:'rgba(248,81,73,0.3)',   bg:'rgba(248,81,73,0.05)',   label:'#FF7B72'},
          plan:        {border:'rgba(188,140,255,0.3)', bg:'rgba(188,140,255,0.05)', label:'#BC8CFF'},
          mitigations: {border:'rgba(56,189,193,0.3)',  bg:'rgba(56,189,193,0.05)',  label:'#39D0D4'},
          remediations:{border:'rgba(63,185,80,0.3)',   bg:'rgba(63,185,80,0.05)',   label:'#3FB950'},
        };
        const c = colorMap[s.key]||{border:'var(--border)',bg:'var(--bg-elevated)',label:'var(--text-secondary)'};
        return `<div class="form-field" style="border:1px solid ${c.border};border-radius:var(--radius-md);overflow:hidden;margin-bottom:2px;">
          <label style="display:block;padding:6px 10px 4px;font-size:11px;font-weight:700;background:${c.bg};color:${c.label};text-transform:uppercase;letter-spacing:.05em;">${s.label}</label>
          <textarea id="f-ns-${s.key}" style="min-height:64px;resize:none;overflow-y:hidden;background:${c.bg};border:none;border-radius:0;padding:8px 10px;color:var(--text-primary);font-family:var(--font);font-size:13px;width:100%;outline:none;" placeholder="${s.placeholder}" oninput="autoResizeTA(this)">${esc(ns[s.key]||'')}</textarea>
        </div>`;
      }).join('')}
    </div>
  `;

  window._toggleVals = { edr: edrVal, net: netVal, rema: remaVal };
  requestAnimationFrame(() => {
    document.querySelectorAll('#modal-form-body textarea').forEach(autoResizeTA);
  });
}

function selectToggle(group, val) {
  window._toggleVals = window._toggleVals || {};
  window._toggleVals[group] = val;
  const yBtn = document.getElementById(`${group}-yes`);
  const nBtn = document.getElementById(`${group}-no`);
  if (!yBtn||!nBtn) return;
  yBtn.className = 'toggle-btn'+(val==='yes'?' selected-yes':'');
  nBtn.className = 'toggle-btn'+(val==='no'?' selected-no':'');
}

function saveDerogation() {
  const v = window._toggleVals || {};
  const g = id => document.getElementById(id);
  const fields = {
    ticketId:          g('f-ticketId')?.value.trim()     || '',
    title:             g('f-title')?.value.trim()        || '',
    applicantName:     g('f-applicantName')?.value.trim()|| '',
    asset:             g('f-asset')?.value.trim()        || '',
    status:            g('f-status')?.value               || 'new',
    actionStatus:      g('f-actionStatus')?.value         || 'a_faire',
    actionMotif:       g('f-actionMotif')?.value          || null,
    urgency:           g('f-urgency')?.value              || '-',
    edrInstalled:      v.edr  || '',
    internetExposed:   v.net  || '',
    hasRemediationPlan:v.rema || '',
    dicD:              g('f-dicD')?.value,
    dicI:              g('f-dicI')?.value,
    dicC:              g('f-dicC')?.value,
    expiresAt:         g('f-expiresAt')?.value            || null,
    nextFollowup:      g('f-nextFollowup')?.value         || null,
    lastCheckedAt:     g('f-lastCheckedAt')?.value        || null,
    _ns: {
      contexte:    g('f-ns-contexte')?.value    || '',
      raison:      g('f-ns-raison')?.value      || '',
      risques:     g('f-ns-risques')?.value     || '',
      plan:        g('f-ns-plan')?.value        || '',
      mitigations: g('f-ns-mitigations')?.value || '',
      remediations:g('f-ns-remediations')?.value|| '',
    }
  };
  if (!fields.title) {
    const el = document.getElementById('f-title');
    if (el) { el.style.borderColor='var(--urgency-p0)'; el.focus(); setTimeout(()=>el.style.borderColor='',2000); }
    return;
  }
  let saved;
  if (editingId) {
    saved = Store.update(editingId, fields);
    if (activeSidebarId===editingId) renderSidebar(editingId);
  } else {
    saved = Store.create(fields);
    activeSidebarId = saved.id;
  }
  closeModal('derog-modal');
  renderAll();
  if (!editingId) openSidebar(saved.id);
}

/* CONFIRM / DELETE */
function confirmDelete(id) {
  const d = Store.getById(id);
  document.getElementById('confirm-title-el').textContent = 'Supprimer la dérogation';
  document.getElementById('confirm-desc-el').textContent = `Supprimer "${d?.title||id}" ? Action irréversible.`;
  document.getElementById('confirm-ok-btn').onclick = () => { Store.delete(id); closeModal('confirm-modal'); closeSidebar(); renderAll(); };
  openModal('confirm-modal');
}

/* MODAL HELPERS */
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function closeModalOnOverlay(e,id) { if(e.target===e.currentTarget) closeModal(id); }
