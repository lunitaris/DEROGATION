/* ================================================================
   MODAL EMAIL — Templates, ouverture, copie clipboard
================================================================ */
const EMAIL_TEMPLATES = {
  followup: d => ({
    subject: `[Dérogation ${d.ticketId}] Informations manquantes — Action requise`,
    body: `Bonjour ${d.applicant?.name||'[Porteur]'},

Je reviens vers vous concernant la demande de dérogation cybersécurité :

  Ticket : ${d.ticketId||'N/A'}
  Titre  : ${d.title||'N/A'}
  Statut : ${STATUS_LABELS[d.status]||d.status}

Afin d'instruire cette demande, merci de compléter dans le ticket ServiceNow :

• Contexte métier et IT à jour
• Raison pour laquelle une remédiation immédiate n'est pas possible
• Description des risques cyber associés
• Plan d'action précis avec des dates
• Mitigations en cours ou prévues
• Statut EDR sur l'asset
• Exposition internet de l'asset
• DIC (Disponibilité, Intégrité, Confidentialité)

Sans retour avant le ${d.dates.expiresAt?formatDate(d.dates.expiresAt):'[date]'}, la demande ne pourra pas être instruite.

Cordialement,`
  }),
  status: d => ({
    subject: `[Dérogation ${d.ticketId}] Point d'avancement mensuel`,
    body: `Bonjour ${d.applicant?.name||'[Porteur]'},

Suivi mensuel de votre demande de dérogation :

  Ticket     : ${d.ticketId||'N/A'}
  Titre      : ${d.title||'N/A'}
  Statut     : ${STATUS_LABELS[d.status]||d.status}
  Expiration : ${d.dates.expiresAt?formatDate(d.dates.expiresAt):'Non définie'}

Merci de me faire un point sur l'avancement :
• Quelles actions ont été réalisées ?
• Le planning est-il toujours tenu ?
• Y a-t-il des blocages ?

Mise à jour dans ServiceNow attendue avant le 20 du mois.

Cordialement,`
  }),
  expiry: d => ({
    subject: `[URGENT - Dérogation ${d.ticketId}] Expiration imminente`,
    body: `Bonjour ${d.applicant?.name||'[Porteur]'},

La dérogation suivante arrive à expiration :

  Ticket     : ${d.ticketId||'N/A'}
  Titre      : ${d.title||'N/A'}
  Expiration : ${d.dates.expiresAt?formatDate(d.dates.expiresAt):'Non définie'}

Merci de confirmer :
  ☐ Remédiation terminée → la dérogation peut être clôturée
  ☐ En cours → renouvellement nécessaire avant expiration
  ☐ Planning modifié → nouvelle date cible à préciser

Sans retour, la dérogation sera marquée expirée.

Cordialement,`
  })
};

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
  else {
    const el=document.createElement('textarea');
    el.value=text; document.body.appendChild(el);
    el.select(); document.execCommand('copy');
    document.body.removeChild(el);
  }
}
