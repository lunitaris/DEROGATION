/* ================================================================
   PILOTAGE — Vue tableau dense avec tri, édition inline
================================================================ */
let pilotageSortKey = 'expiresAt';
let pilotageSortAsc = true;

function renderPilotage(list) {
  if (!list.length) return `<div class="empty-state"><h3>Aucune dérogation</h3><p>Créez-en une ou modifiez les filtres.</p></div>`;

  const sorted = [...list].sort((a,b) => {
    let va, vb;
    switch (pilotageSortKey) {
      case 'expiresAt':    va=a.dates.expiresAt||'9999';     vb=b.dates.expiresAt||'9999'; break;
      case 'lastChecked':  va=a.dates.lastCheckedAt||'0000'; vb=b.dates.lastCheckedAt||'0000'; break;
      case 'status':       va=a.status||'';                  vb=b.status||''; break;
      case 'porteur':      va=a.applicant?.name||'';         vb=b.applicant?.name||''; break;
      default:             va=a.ticketId||'';                vb=b.ticketId||''; break;
    }
    return pilotageSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  function thSort(label, key, extra='') {
    const active = pilotageSortKey === key;
    const arrow = active ? (pilotageSortAsc ? '↑' : '↓') : '↕';
    return `<th class="${active?'sorted':''}" onclick="setPilotageSort('${key}')" ${extra}>${label} <span class="sort-arrow">${arrow}</span></th>`;
  }
  function dueBadge(iso) {
    if (!iso) return '<span class="due-ok">—</span>';
    const d = daysUntil(iso);
    if (d < 0) return `<span class="due-late" title="${formatDate(iso)}">J+${Math.abs(d)}</span>`;
    if (d <= 5) return `<span class="due-soon" title="${formatDate(iso)}">J-${d}</span>`;
    return `<span class="due-ok" title="${formatDate(iso)}">${formatDate(iso).slice(0,5)}</span>`;
  }
  function lastCheckCell(iso) {
    if (!iso) return '<span class="last-check-none">—</span>';
    const days = Math.floor((new Date() - new Date(iso)) / 86400000);
    const label = days === 0 ? "auj." : days === 1 ? "hier" : `J+${days}`;
    return `<span class="${lastCheckClass(iso)}" title="${formatDate(iso)}">${label}</span>`;
  }
  function completudeCell(d) {
    const ns = d.notesStructured || {};
    const chk = ns.checks || {};
    const KEYS = ['contexte','raison','risques','plan','mitigations','remediations'];
    const pips = KEYS.map(k => {
      const hasContent = (ns[k]||'').trim().length > 0;
      const isChecked = chk[k];
      return `<span class="completude-pip${isChecked?' checked':hasContent?' filled':''}" title="${k}"></span>`;
    }).join('');
    return `<div class="completude-bar">${pips}</div>`;
  }
  function expiryShort(iso) {
    if (!iso) return '<span class="due-ok">—</span>';
    const d = daysUntil(iso);
    const cls = expiryClass(d);
    if (d < 0) return `<span class="${cls}" title="${formatDate(iso)}">Exp.</span>`;
    if (d === 0) return `<span class="${cls}" title="${formatDate(iso)}">Auj.</span>`;
    return `<span class="${cls}" title="${formatDate(iso)}">J-${d}</span>`;
  }

  const rows = sorted.map(d => {
    /* Dernière entrée du journal (la plus récente par date) */
    const actionLog = d.actionLog || [];
    let lastJournalHtml = '<span style="color:var(--text-muted)">—</span>';
    let lastJournalTitle = '';
    if (actionLog.length > 0) {
      const la = [...actionLog].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      const et = ETYPES && ETYPES[la.etype || 'commentaire'];
      const text = (la.text || '').slice(0, 50) + ((la.text || '').length > 50 ? '…' : '');
      lastJournalTitle = (la.date ? la.date + ' · ' : '') + (la.text || '');
      lastJournalHtml = `${et ? `<span style="opacity:.75">${et.emoji}</span> ` : ''}${esc(text) || '<span style="color:var(--text-muted)">—</span>'}`;
    }
    return `<tr class="${activeSidebarId===d.id?'selected':''}" data-id="${d.id}" onclick="openSidebar('${d.id}')" onauxclick="if(event.button===1){event.preventDefault();openFullscreen('${d.id}')}">
      <td class="pt-fs" onclick="event.stopPropagation()"><button class="pt-fullscreen" onclick="openFullscreen('${d.id}')" title="Ouvrir en plein écran"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button></td>
      <td class="pt-ticket">${esc(d.ticketId)||'—'}</td>
      <td class="pt-title" title="${esc(d.title)}">${esc(d.title)||'(Sans titre)'}</td>
      <td class="pt-porteur" style="font-size:12px;" title="${esc(d.applicant?.name)}">${esc(d.applicant?.name)||'—'}</td>
      <td class="pt-statut">${statusBadge(d.status)}</td>
      <td class="pt-lastjournal" title="${esc(lastJournalTitle)}">${lastJournalHtml}</td>
      <td class="pt-check">${completudeCell(d)}</td>
      <td class="pt-last" onclick="event.stopPropagation()">
        <input type="date" class="inline-date" value="${toDateInputVal(d.dates.lastCheckedAt)}"
          onchange="Store.update('${d.id}',{lastCheckedAt:this.value});renderAll();"
          title="Dernière vérification ServiceNow">
      </td>
      <td class="pt-relance" style="font-size:11px;">
        ${d.dates.nextFollowup ? `<span class="${daysUntil(d.dates.nextFollowup)<0?'expiry-danger':daysUntil(d.dates.nextFollowup)<=7?'expiry-warn':'due-ok'}" title="${formatDate(d.dates.nextFollowup)}">${daysUntil(d.dates.nextFollowup)<0?'Dépassée':'J-'+daysUntil(d.dates.nextFollowup)}</span>` : '<span class="due-ok">—</span>'}
      </td>
    </tr>`;
  }).join('');

  return `<div id="pilotage-wrap"><table class="pilotage-table">
    <thead><tr>
      <th class="pt-fs"></th>
      ${thSort('Ticket','ticketId','class="pt-ticket"')}
      <th class="pt-title">Titre</th>
      ${thSort('Porteur','porteur','class="pt-porteur"')}
      ${thSort('Statut','status','class="pt-statut"')}
      <th class="pt-lastjournal">Dernière action journal</th>
      <th class="pt-check" title="Complétude dossier (6 sections)">Dossier</th>
      ${thSort('Vérifié','lastChecked','class="pt-last"')}
      <th class="pt-relance">Relance</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function setPilotageSort(key) {
  if (pilotageSortKey === key) pilotageSortAsc = !pilotageSortAsc;
  else { pilotageSortKey = key; pilotageSortAsc = true; }
  renderList();
}
