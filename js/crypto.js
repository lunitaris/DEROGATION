/* ================================================================
   CRYPTO — AES-256-CCM + PBKDF2-HMAC-SHA256 (100 000 itérations)
   Dépendance : js/sjcl.min.js chargé AVANT ce fichier.

   CCM (Counter with CBC-MAC) est natif dans sjcl.min.js :
   - Chiffrement AES-CTR + authentification CBC-MAC intégrée
   - Pas besoin de patch externe (supprime core/cbc.js)
   - Protège l'intégrité nativement (pas besoin du vhash séparé*)
   * On garde vhash pour la vérification du mot de passe AVANT
     de tenter le déchiffrement (meilleure UX).

   Stockage localStorage :
     'derogmanager_crypto' → { iter, salt, vsalt, vhash }
       salt  (hex 128 bits) → sel de dérivation de la clé AES
       vsalt (hex 128 bits) → sel du hash de vérification
       vhash (hex 256 bits) → PBKDF2(mdp, vsalt) — vérifie le mdp
     'derogmanager_data'   → { v:2, iv, ct }   ← v:2 = format CCM
       iv    (hex 96 bits)  → nonce CCM aléatoire (7 octets recommandé)
       ct    (hex)          → AES-256-CCM(clé, nonce, JSON) + tag MAC

   Migration : si v:1 (ancien CBC) détecté à la lecture,
   déchiffrement CBC → re-chiffrement CCM automatique.

   Partage de clé entre onglets :
   La clé dérivée est stockée en sessionStorage (encodée hex)
   pour éviter de redemander le mot de passe à chaque ticket.html.
   sessionStorage est partagé entre onglets de même origine/session.
================================================================ */

const StoreCrypto = (function () {
  'use strict';

  const ITER      = 100000;
  const KEY_BITS  = 256;
  const CONF_KEY  = 'derogmanager_crypto';
  const SESSION_KEY = 'derogmanager_session_key';

  /* ─── helpers privés ──────────────────────────────────────────── */

  /** Génère N bits aléatoires via crypto.getRandomValues. */
  function randBits(bits) {
    const bytes = bits / 8;
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    // Convertir Uint8Array → hex → bitArray SJCL
    let hex = '';
    buf.forEach(b => hex += b.toString(16).padStart(2, '0'));
    return sjcl.codec.hex.toBits(hex);
  }

  /** SJCL bitArray → chaîne hex sans espaces. */
  function toHex(bits) {
    return sjcl.codec.hex.fromBits(bits).replace(/ /g, '');
  }

  /** Chaîne hex → SJCL bitArray. */
  function fromHex(h) {
    return sjcl.codec.hex.toBits(h);
  }

  /**
   * PBKDF2-HMAC-SHA256.
   * ⚠️ BLOQUANT ~1-3 s pour ITER=100000.
   * Toujours appeler depuis setTimeout(fn, 20).
   */
  function derive(password, saltBits, bits) {
    return sjcl.misc.pbkdf2(password, saltBits, ITER, bits || KEY_BITS);
  }

  /** Persiste la clé en sessionStorage pour les autres onglets. */
  function _saveKeyToSession(keyBits) {
    try {
      sessionStorage.setItem(SESSION_KEY, toHex(keyBits));
    } catch(e) {
      // sessionStorage peut être indisponible en file:// sur certains
      // navigateurs avec des configs restrictives — non bloquant
      console.warn('StoreCrypto: sessionStorage indisponible', e);
    }
  }

  /** Lit la clé depuis sessionStorage. Retourne null si absente. */
  function _loadKeyFromSession() {
    try {
      const hex = sessionStorage.getItem(SESSION_KEY);
      return hex ? fromHex(hex) : null;
    } catch(e) {
      return null;
    }
  }

  /* ─── Migration CBC → CCM ─────────────────────────────────────── */

  /**
   * Déchiffre un blob v:1 (ancien format CBC).
   * Utilisé UNIQUEMENT pendant la migration.
   * Nécessite que sjcl.beware CBC soit activé.
   */
  function _decryptCBC(keyBits, blobStr) {
    // Opt-in CBC pour la migration (on accepte l'absence d'intégrité
    // car on vérifie le mdp via vhash avant d'arriver ici)
    if (sjcl.beware) {
      sjcl.beware["CBC mode is dangerous because it doesn't protect message integrity."]();
    }
    const { iv, ct } = JSON.parse(blobStr);
    const cipher = new sjcl.cipher.aes(keyBits);
    const ptBits = sjcl.mode.cbc.decrypt(cipher, fromHex(ct), fromHex(iv));
    return JSON.parse(sjcl.codec.utf8String.fromBits(ptBits));
  }

  /* ─── API publique ────────────────────────────────────────────── */
  return {
    /** Clé AES 256 bits — RAM uniquement, jamais persistée dans localStorage. */
    _key: null,

    /** true si la config crypto est présente dans localStorage. */
    isSetup()  { return !!localStorage.getItem(CONF_KEY); },

    /** true si aucune clé chargée en mémoire. */
    isLocked() { return this._key === null; },

    /** Efface la clé de la RAM et de sessionStorage. */
    lock() {
      this._key = null;
      try { sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
    },

    /**
     * Tente de récupérer la clé depuis sessionStorage (onglet ticket.html).
     * Appeler au chargement de ticket.html avant de demander le mot de passe.
     * @returns {boolean} true si la clé a été récupérée
     */
    tryRestoreFromSession() {
      const key = _loadKeyFromSession();
      if (key) {
        this._key = key;
        return true;
      }
      return false;
    },

    /* ── Initialisation ─────────────────────────────────────────── */

    /**
     * Première configuration.
     * DEUX appels PBKDF2 → durée ~2-6 s.
     * Appeler depuis setTimeout(fn, 20).
     *
     * @param {string}      password
     * @param {object|null} existingData — objet en clair à chiffrer
     */
    setup(password, existingData) {
      const salt  = randBits(128);
      const vsalt = randBits(128);
      const key   = derive(password, salt);
      const vhash = derive(password, vsalt);

      localStorage.setItem(CONF_KEY, JSON.stringify({
        iter:  ITER,
        salt:  toHex(salt),
        vsalt: toHex(vsalt),
        vhash: toHex(vhash)
      }));

      this._key = key;
      _saveKeyToSession(key);

      if (existingData != null) {
        localStorage.setItem('derogmanager_data', this._encryptJSON(existingData));
      }
    },

    /* ── Déverrouillage ─────────────────────────────────────────── */

    /**
     * Vérifie le mot de passe puis dérive la clé AES.
     * DEUX appels PBKDF2 → durée ~2-6 s.
     * Appeler depuis setTimeout(fn, 20).
     *
     * Après unlock réussi, la clé est sauvée en sessionStorage
     * → ticket.html peut la récupérer via tryRestoreFromSession().
     *
     * @param  {string}  password
     * @returns {boolean} true si correct
     */
    unlock(password) {
      const raw = localStorage.getItem(CONF_KEY);
      if (!raw) return false;

      const cfg = JSON.parse(raw);

      // Vérification du mot de passe via vhash
      const vhash = derive(password, fromHex(cfg.vsalt));
      if (toHex(vhash) !== cfg.vhash) return false;

      // Dérivation de la clé AES réelle
      this._key = derive(password, fromHex(cfg.salt));
      _saveKeyToSession(this._key);

      // Migration automatique v1 (CBC) → v2 (CCM)
      this._migrateIfNeeded();

      return true;
    },

    /* ── Migration ──────────────────────────────────────────────── */

    /**
     * Si les données sont au format v:1 (CBC), les migre vers v:2 (CCM).
     * Appelé automatiquement après un unlock réussi.
     */
    _migrateIfNeeded() {
      const raw = localStorage.getItem('derogmanager_data');
      if (!raw) return;

      let blob;
      try { blob = JSON.parse(raw); } catch(e) { return; }

      if (blob.v === 1) {
        console.info('StoreCrypto: migration v1 (CBC) → v2 (CCM)...');
        try {
          const data = _decryptCBC(this._key, raw);
          localStorage.setItem('derogmanager_data', this._encryptJSON(data));
          console.info('StoreCrypto: migration terminée.');
        } catch(e) {
          console.error('StoreCrypto: échec migration CBC→CCM', e);
        }
      }
    },

    /* ── Chiffrement / déchiffrement ────────────────────────────── */

    /**
     * Chiffre un objet JS → blob JSON {v:2, iv, ct}.
     * Nonce 96 bits aléatoire à chaque appel.
     * CCM inclut un tag d'authentification → intégrité garantie.
     *
     * @throws {Error} si verrouillé
     */
    _encryptJSON(obj) {
      if (!this._key) throw new Error('StoreCrypto: verrouillé — appelez unlock() d\'abord');

      const nonce  = randBits(96);   // 96 bits = taille recommandée pour CCM
      const ptBits = sjcl.codec.utf8String.toBits(JSON.stringify(obj));
      const cipher = new sjcl.cipher.aes(this._key);

      // sjcl.mode.ccm.encrypt(cipher, plaintext, nonce, adata, tlen)
      // tlen = 64 bits (tag MAC 8 octets) — bon compromis taille/sécurité
      const ctBits = sjcl.mode.ccm.encrypt(cipher, ptBits, nonce, [], 64);

      return JSON.stringify({ v: 2, iv: toHex(nonce), ct: toHex(ctBits) });
    },

    /**
     * Déchiffre un blob JSON → objet JS.
     * Vérifie l'intégrité via le tag CCM (lance une exception si altéré).
     *
     * @throws {Error} si verrouillé, blob invalide ou tag incorrect
     */
    _decryptJSON(blob) {
      if (!this._key) throw new Error('StoreCrypto: verrouillé');

      const parsed = JSON.parse(blob);

      // Sécurité : refuser le déchiffrement CBC direct (format legacy)
      // — ne devrait pas arriver car _migrateIfNeeded() est appelé à l'unlock
      if (parsed.v === 1) {
        throw new Error('StoreCrypto: format v1 (CBC) détecté — relancez unlock() pour migrer');
      }

      const { iv, ct } = parsed;
      const cipher = new sjcl.cipher.aes(this._key);
      const ptBits = sjcl.mode.ccm.decrypt(cipher, fromHex(ct), fromHex(iv), [], 64);

      return JSON.parse(sjcl.codec.utf8String.fromBits(ptBits));
    },

    /* ── Changement de mot de passe ─────────────────────────────── */

    /**
     * @param {string} oldPwd
     * @param {string} newPwd
     * @param {object} currentData — données déchiffrées courantes
     * @returns {boolean} false si ancien mot de passe incorrect
     */
    changePassword(oldPwd, newPwd, currentData) {
      const raw = localStorage.getItem(CONF_KEY);
      if (!raw) return false;
      const cfg   = JSON.parse(raw);
      const vhash = derive(oldPwd, fromHex(cfg.vsalt));
      if (toHex(vhash) !== cfg.vhash) return false;
      this.setup(newPwd, currentData);
      return true;
    }
  };
})();
