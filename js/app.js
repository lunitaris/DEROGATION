/* ================================================================
   APP — Thème, export/import, shortcuts bar,
          keyboard shortcuts, recherche, init
================================================================ */

function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  Store.savePrefs({theme:next});
}

function openFullscreen(id) {
  window.open('ticket.html?id=' + id, '_blank');
}

function toggleShortcutsBar() {
  const bar = document.getElementById('shortcuts-bar');
  const hidden = bar.classList.toggle('hidden');
  document.body.classList.toggle('shortcuts-open', !hidden);
}

function exportData() {
  const blob = new Blob([Store.exportClear()],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=`derogations-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
  Store.savePrefs({ lastExportAt: new Date().toISOString() });
  renderTodayPanel(); // Actualise le rappel export dans le Today Panel
}

/** Affiche le détail d'une erreur de données corrompues (Store._loadError). */
function showDataError() {
  const e = Store._loadError;
  if (!e) return;
  alert(
    'Erreur de lecture localStorage :\n' + e.message +
    '\n\nDébut du contenu corrompu :\n' + (e.snippet || '(vide)')
  );
}

function triggerImport() {
  const input = document.getElementById('import-file-input');
  input.value = '';
  input.click();
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || !Array.isArray(parsed.derogations)) {
        alert('Fichier invalide : structure JSON non reconnue (clé "derogations" manquante).');
        return;
      }
      const count = parsed.derogations.length;
      if (!confirm(`Importer ce fichier va remplacer toutes vos données actuelles par ${count} dérogation${count>1?'s':''}.\n\nContinuer ?`)) return;
      Store.importFromClear(parsed); // re-chiffre automatiquement si chiffrement actif
      renderAll();
      const btn = document.querySelector('[onclick="triggerImport()"]');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
        btn.style.color = 'var(--status-validated-text)';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
      }
    } catch {
      alert('Erreur : impossible de lire le fichier JSON. Vérifiez qu\'il n\'est pas corrompu.');
    }
  };
  reader.readAsText(file);
}

/* KEYBOARD */
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
  if (e.key==='Escape') { closeSidebar(); closeModal('derog-modal'); closeModal('email-modal'); closeModal('confirm-modal'); }
  if (e.key==='n'||e.key==='N') openNewModal();
  if (e.key==='/') { e.preventDefault(); document.getElementById('search-input').focus(); }
  if (e.key==='j'||e.key==='ArrowDown') navigateSidebar(1);
  if (e.key==='k'||e.key==='ArrowUp') navigateSidebar(-1);
});

document.getElementById('search-input').addEventListener('input', e => {
  filters.search = e.target.value;
  renderList();
});

/* INIT */
function init() {
  const p = Store.loadPrefs();
  if (p.theme) document.documentElement.setAttribute('data-theme',p.theme);
  if (p.defaultView) {
    currentView = p.defaultView;
    setView(p.defaultView);
  }
  if (p.todayPanelCollapsed) {
    document.getElementById('today-body').classList.add('hidden');
    document.getElementById('today-chevron').classList.remove('open');
  }
  document.addEventListener('derogmanager:updated', renderAll);

  // Chiffrement : délègue le démarrage à initCrypto()
  initCrypto(renderAll);
}

/**
 * Gère le flux d'initialisation du chiffrement avant le premier renderAll().
 * - Chiffrement configuré   → modal "Déverrouiller"
 * - Données en clair exist. → modal "Configurer le chiffrement (migration)"
 * - Rien du tout            → modal "Configurer le chiffrement"
 * @param {Function} callback  appelé après déverrouillage/configuration réussi
 */
function initCrypto(callback) {
  if (StoreCrypto.isSetup()) {
    openCryptoModal('unlock', callback);
    return;
  }
  // Pas encore configuré : existe-t-il des données en clair à migrer ?
  const raw = localStorage.getItem(Store.KEY);
  const hasPlaintext = raw && !Store._isEncryptedBlob(raw);
  openCryptoModal(hasPlaintext ? 'setup-migrate' : 'setup', callback);
}

init();
