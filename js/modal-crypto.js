/* ================================================================
   MODAL-CRYPTO — Modal mot de passe maître
   Utilisé par index.html (init) et ticket.html (unlock hérité ou manuel).

   Modes :
     'setup'         → Première fois, aucune donnée existante
     'setup-migrate' → Première fois, données en clair à re-chiffrer
     'unlock'        → Déverrouiller l'app (données déjà chiffrées)

   Usage : openCryptoModal('unlock', callback)
           openCryptoModal('setup', callback)
           openCryptoModal('setup-migrate', callback)
================================================================ */

/** @type {Function|null} Callback appelé après succès */
let _cryptoCallback = null;
/** @type {string} Mode courant */
let _cryptoMode = 'unlock';

/**
 * Ouvre le modal et attend que l'utilisateur saisisse son mot de passe.
 * @param {'setup'|'setup-migrate'|'unlock'} mode
 * @param {Function} callback  Appelé sans argument si succès
 */
function openCryptoModal(mode, callback) {
  _cryptoMode     = mode;
  _cryptoCallback = callback;

  const el = document.getElementById('modal-crypto');
  if (!el) { console.error('modal-crypto introuvable dans le DOM'); return; }

  el.classList.remove('hidden');
  _renderCryptoModal();

  // Focus automatique sur le champ mot de passe
  setTimeout(() => {
    const pwd = document.getElementById('crypto-pwd');
    if (pwd) pwd.focus();
  }, 80);
}

/** Ferme le modal (ne peut pas être appelé par l'utilisateur — obligatoire). */
function _closeCryptoModal() {
  const el = document.getElementById('modal-crypto');
  if (el) el.classList.add('hidden');
}

/** (Re-)génère le contenu du modal selon le mode courant. */
function _renderCryptoModal() {
  const isSetup = _cryptoMode === 'setup' || _cryptoMode === 'setup-migrate';

  const title    = isSetup ? 'Chiffrer mes données' : 'Déverrouiller DerogManager';
  const subtitle = isSetup
    ? (_cryptoMode === 'setup-migrate'
        ? 'Des données existent en clair. Choisissez un mot de passe pour les chiffrer.'
        : 'Choisissez un mot de passe maître pour protéger vos dérogations.')
    : 'Saisissez votre mot de passe maître pour accéder à vos dérogations.';
  const btnLabel = isSetup ? 'Chiffrer et accéder' : 'Déverrouiller';

  document.getElementById('modal-crypto').querySelector('.crypto-box').innerHTML = `
    <h2>${title}</h2>
    <p class="crypto-subtitle">${subtitle}</p>

    <label for="crypto-pwd">Mot de passe</label>
    <input type="password" id="crypto-pwd" placeholder="••••••••••••"
           autocomplete="${isSetup ? 'new-password' : 'current-password'}"
           onkeydown="if(event.key==='Enter')_submitCryptoModal()"
           ${isSetup ? 'oninput="_updateStrength()"' : ''}>

    ${isSetup ? `
    <div class="crypto-strength"><div class="crypto-strength-bar" id="crypto-strength-bar"></div></div>
    <div class="crypto-hint" id="crypto-strength-hint">Entrez un mot de passe</div>

    <label for="crypto-pwd2">Confirmation</label>
    <input type="password" id="crypto-pwd2" placeholder="••••••••••••"
           autocomplete="new-password"
           onkeydown="if(event.key==='Enter')_submitCryptoModal()">
    ` : ''}

    <div class="crypto-error" id="crypto-error"></div>
    <button class="crypto-btn" id="crypto-submit-btn" onclick="_submitCryptoModal()">${btnLabel}</button>

    <div class="crypto-spinner" id="crypto-spinner">
      <span class="crypto-spinner-dot"></span>
      <span class="crypto-spinner-dot"></span>
      <span class="crypto-spinner-dot"></span>
      <span>Dérivation de la clé en cours…</span>
    </div>
  `;
}

/** Calcule et affiche la force du mot de passe (mode setup uniquement). */
function _updateStrength() {
  const pwd  = document.getElementById('crypto-pwd');
  const bar  = document.getElementById('crypto-strength-bar');
  const hint = document.getElementById('crypto-strength-hint');
  if (!pwd || !bar || !hint) return;

  const v = pwd.value;
  let score = 0;
  if (v.length >= 8)  score++;
  if (v.length >= 12) score++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
  if (/\d/.test(v))   score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;

  const levels = [
    { pct: '0%',   color: 'transparent', label: 'Entrez un mot de passe' },
    { pct: '25%',  color: '#f85149',     label: 'Trop faible' },
    { pct: '50%',  color: '#e3b341',     label: 'Faible' },
    { pct: '70%',  color: '#f0883e',     label: 'Moyen' },
    { pct: '88%',  color: '#58a6ff',     label: 'Bon' },
    { pct: '100%', color: '#3fb950',     label: 'Excellent' }
  ];
  const l = levels[Math.min(score, levels.length - 1)];
  bar.style.width     = l.pct;
  bar.style.background = l.color;
  hint.textContent    = l.label;
  hint.style.color    = l.color || 'var(--text-muted)';
}

/** Valide et soumet le formulaire. */
function _submitCryptoModal() {
  const pwdEl  = document.getElementById('crypto-pwd');
  const errEl  = document.getElementById('crypto-error');
  const btnEl  = document.getElementById('crypto-submit-btn');
  const spin   = document.getElementById('crypto-spinner');

  if (!pwdEl) return;
  const pwd = pwdEl.value;

  // Validations synchrones (avant de bloquer le thread)
  if (!pwd) {
    errEl.textContent = 'Veuillez saisir un mot de passe.';
    return;
  }

  const isSetup = _cryptoMode === 'setup' || _cryptoMode === 'setup-migrate';

  if (isSetup) {
    const pwd2El = document.getElementById('crypto-pwd2');
    if (pwd2El && pwd !== pwd2El.value) {
      errEl.textContent = 'Les deux mots de passe ne correspondent pas.';
      return;
    }
    if (pwd.length < 8) {
      errEl.textContent = 'Le mot de passe doit faire au moins 8 caractères.';
      return;
    }
  }

  // Affiche le spinner, désactive le bouton, puis lance PBKDF2 (bloquant)
  errEl.textContent      = '';
  btnEl.disabled         = true;
  spin.classList.add('visible');

  setTimeout(function () {
    try {
      if (isSetup) {
        // Récupère les données en clair existantes (null si aucune)
        let existing = null;
        if (_cryptoMode === 'setup-migrate') {
          const raw = localStorage.getItem(Store.KEY);
          if (raw && !Store._isEncryptedBlob(raw)) {
            try { existing = JSON.parse(raw); } catch(e) {}
          }
        }
        StoreCrypto.setup(pwd, existing);
      } else {
        const ok = StoreCrypto.unlock(pwd);
        if (!ok) {
          errEl.textContent   = 'Mot de passe incorrect.';
          btnEl.disabled      = false;
          spin.classList.remove('visible');
          pwdEl.value = '';
          pwdEl.focus();
          return;
        }
      }

      // Succès
      _closeCryptoModal();
      if (typeof _cryptoCallback === 'function') {
        _cryptoCallback();
        _cryptoCallback = null;
      }
    } catch (e) {
      errEl.textContent   = 'Erreur inattendue : ' + e.message;
      btnEl.disabled      = false;
      spin.classList.remove('visible');
    }
  }, 20); // 20 ms → laisse le temps au navigateur de peindre le spinner
}
