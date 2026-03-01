/* ================================================================
   MODAL EMAIL — Ouverture, copie clipboard
   Les templates sont définis dans render-shared.js (EMAIL_TEMPLATES)
================================================================ */

function openEmailModal(id, type) {
  const d = Store._migrateDerog({...Store.getById(id)});
  if (!d) return;
  const types = ['followup','status','expiry'];
  const tabLabels = {followup:'Relance info',status:'Point statut',expiry:'Alerte expiration'};
  document.getElementById('email-tabs').innerHTML = types.map(t=>
    `<div class="email-tab${t===type?' active':''}" onclick="openEmailModal('${id}','${t}')">${tabLabels[t]}</div>`
  ).join('');
  const tpl = EMAIL_TEMPLATES[type](d);
  document.getElementById('email-subject-label').textContent = 'Objet : '+tpl.subject;
  document.getElementById('email-textarea').value = tpl.body;
  openModal('email-modal');
}

function copyEmail() {
  copyToClipboard(document.getElementById('email-textarea').value);
  const btn = document.querySelector('#email-modal .btn-save');
  btn.textContent='✓ Copié !';
  setTimeout(()=>btn.textContent='Copier',2000);
}

function copyToClipboard(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text);
  else clipboardFallbackCopy(text);
}
