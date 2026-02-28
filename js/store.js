/* ================================================================
   STORE — Couche données (localStorage) avec chiffrement AES-256-CBC.
   Dépend de StoreCrypto (js/crypto.js) chargé avant ce fichier.

   Comportement selon l'état du chiffrement :
     • Chiffrement configuré + déverrouillé  → load() déchiffre, save() chiffre
     • Chiffrement configuré + verrouillé    → load() retourne { version:2, derogations:[] }
     • Chiffrement non configuré             → load()/save() travaillent en JSON clair
       (cas migration : données existantes re-chiffrées à la 1ère ouverture)

   Convention autosave silencieux :
     _silentSave() écrit dans localStorage SANS déclencher l'événement
     'derogmanager:updated' et SANS re-render — évite le clignotement UI.
     Utilisé par toutes les méthodes updateXxx().
================================================================ */
const Store = {
  KEY:       'derogmanager_data',
  PREFS_KEY: 'derogmanager_prefs',

  /** Erreur de lecture détectée lors du dernier load() — null si tout va bien. */
  _loadError: null,

  /* ─── Détection de format ─────────────────────────────────────── */

  /**
   * Retourne true si la chaîne raw est un blob chiffré par StoreCrypto.
   * Un blob chiffré est { v:1, iv:"hex", ct:"hex" }.
   * Les données en clair ont { version:2, derogations:[...] }.
   */
  _isEncryptedBlob(raw) {
    if (!raw) return false;
    try {
      const o = JSON.parse(raw);
      return o !== null && typeof o.iv === 'string' && typeof o.ct === 'string';
    } catch { return false; }
  },

  /* ─── Lecture / écriture ──────────────────────────────────────── */

  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(this.KEY);
      if (!raw) { this._loadError = null; return { version: 2, derogations: [] }; }

      if (this._isEncryptedBlob(raw)) {
        if (StoreCrypto.isLocked()) { this._loadError = null; return { version: 2, derogations: [] }; }
        const decrypted = StoreCrypto._decryptJSON(raw);
        this._loadError = null;
        return decrypted;
      }

      // Données en clair (avant configuration du chiffrement)
      const data = JSON.parse(raw);
      this._loadError = null;
      return data;
    } catch(e) {
      console.error('Store.load — données corrompues :', e);
      this._loadError = { message: e.message, snippet: (raw || '').slice(0, 300) };
      return { version: 2, derogations: [] };
    }
  },

  /** Sauvegarde avec événement (utilisé par create/update/delete). */
  save(data) {
    localStorage.setItem(this.KEY, this._serialize(data));
    document.dispatchEvent(new CustomEvent('derogmanager:updated'));
  },

  /**
   * Sauvegarde silencieuse sans événement (autosave interne).
   * Chiffre si StoreCrypto est configuré et déverrouillé.
   */
  _silentSave(data) {
    localStorage.setItem(this.KEY, this._serialize(data));
  },

  /** Sérialise (chiffré ou JSON clair selon l'état de StoreCrypto). */
  _serialize(data) {
    if (StoreCrypto.isSetup() && !StoreCrypto.isLocked()) {
      return StoreCrypto._encryptJSON(data);
    }
    return JSON.stringify(data);
  },

  /* ─── CRUD ────────────────────────────────────────────────────── */

  getAll()     { return this.load().derogations; },
  getById(id)  { return this.getAll().find(d => d.id === id); },

  _migrateDerog(d) {
    const map = {
      waiting_info: 'attente_demandeur', ready_for_review: 'attente_validation',
      waiting_boss: 'attente_validation', done: 'termine',
      ticket_incomplet: 'a_faire', attente_info: 'attente_demandeur',
      a_relancer: 'attente_demandeur', pret_review: 'attente_validation', cloture: 'termine'
    };
    if (map[d.actionStatus]) d.actionStatus = map[d.actionStatus];
    const statusMap = { branch_review: 'en_revue', rejected: 'en_revue' };
    if (statusMap[d.status]) d.status = statusMap[d.status];
    if (typeof d.notes === 'string' && d.notes.trim() !== '') {
      d.notesStructured = {
        contexte: d.notes, raison: '', risques: '', plan: '', mitigations: '', remediations: '',
        checks: { contexte: false, raison: false, risques: false, plan: false, mitigations: false, remediations: false }
      };
      d.notes = '';
    }
    if (!d.notesStructured) {
      d.notesStructured = {
        contexte: '', raison: '', risques: '', plan: '', mitigations: '', remediations: '',
        checks: { contexte: false, raison: false, risques: false, plan: false, mitigations: false, remediations: false }
      };
    }
    if (!d.notesStructured.checks) {
      d.notesStructured.checks = { contexte: false, raison: false, risques: false, plan: false, mitigations: false, remediations: false };
    }
    if (!d.actionDetail) d.actionDetail = '';
    if (!d.actionDueDate) d.actionDueDate = null;
    if (!('actionMotif' in d)) d.actionMotif = null;
    if (!d.dates) d.dates = {};
    if (!('lastCheckedAt' in d.dates)) d.dates.lastCheckedAt = null;
    if (!d.risk) d.risk = { edrInstalled: false, internetExposed: false, hasRemediationPlan: false, dic: { disponibilite: 0, integrite: 0, confidentialite: 0 } };
    if (!d.risk.dic) d.risk.dic = { disponibilite: 0, integrite: 0, confidentialite: 0 };
    if (!d.applicant) d.applicant = { name: '' };
    if (!('meetingNotes' in d)) d.meetingNotes = '';
    if (!d.actionLog) d.actionLog = [];
    d.actionLog = d.actionLog.map(function(e) {
      if (!e.actor) e.actor = 'team';
      if (!e.etype) e.etype = 'commentaire';
      return e;
    });
    return d;
  },

  create(fields) {
    const data = this.load();
    const now = new Date().toISOString();
    const d = {
      id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2),
      ticketId: fields.ticketId || '',
      title: fields.title || '',
      applicant: { name: fields.applicantName || '' },
      asset: fields.asset || '',
      status: fields.status || 'new',
      actionStatus: fields.actionStatus || 'a_faire',
      actionDetail: fields.actionDetail || '',
      actionDueDate: fields.actionDueDate || null,
      actionMotif: fields.actionMotif || null,
      risk: {
        edrInstalled: fields.edrInstalled === 'yes',
        internetExposed: fields.internetExposed === 'yes',
        hasRemediationPlan: fields.hasRemediationPlan === 'yes',
        dic: {
          disponibilite: fields.dicD ? parseInt(fields.dicD) : 0,
          integrite: fields.dicI ? parseInt(fields.dicI) : 0,
          confidentialite: fields.dicC ? parseInt(fields.dicC) : 0
        }
      },
      urgency: { level: fields.urgency || '-' },
      dates: {
        createdAt: now, updatedAt: now,
        expiresAt: fields.expiresAt ? new Date(fields.expiresAt).toISOString() : null,
        nextFollowup: fields.nextFollowup ? new Date(fields.nextFollowup).toISOString() : null,
        lastCheckedAt: fields.lastCheckedAt ? new Date(fields.lastCheckedAt).toISOString() : null
      },
      notes: '',
      meetingNotes: '',
      actionLog: [],
      notesStructured: {
        contexte:    (fields._ns?.contexte    || fields.ns_contexte    || ''),
        raison:      (fields._ns?.raison      || fields.ns_raison      || ''),
        risques:     (fields._ns?.risques     || fields.ns_risques     || ''),
        plan:        (fields._ns?.plan        || fields.ns_plan        || ''),
        mitigations: (fields._ns?.mitigations || fields.ns_mitigations || ''),
        remediations:(fields._ns?.remediations|| fields.ns_remediations|| ''),
        checks: { contexte:false, raison:false, risques:false, plan:false, mitigations:false, remediations:false }
      },
      history: [{ timestamp: now, event: 'created', from: null, to: fields.status || 'new', note: '' }]
    };
    data.derogations.unshift(d);
    this.save(data);
    return d;
  },

  update(id, fields) {
    const data = this.load();
    const idx = data.derogations.findIndex(d => d.id === id);
    if (idx === -1) return;
    const d = this._migrateDerog({ ...data.derogations[idx] });
    const now = new Date().toISOString();
    const history = [...d.history];
    if (fields.status && fields.status !== d.status)
      history.push({ timestamp: now, event: 'status_changed', from: d.status, to: fields.status, note: '' });
    if (fields.actionStatus && fields.actionStatus !== d.actionStatus)
      history.push({ timestamp: now, event: 'action_changed', from: d.actionStatus, to: fields.actionStatus, note: '' });
    data.derogations[idx] = {
      ...d,
      ticketId: fields.ticketId ?? d.ticketId,
      title: fields.title ?? d.title,
      applicant: { name: fields.applicantName ?? d.applicant.name },
      asset: fields.asset ?? d.asset,
      status: fields.status ?? d.status,
      actionStatus: fields.actionStatus ?? d.actionStatus,
      actionDetail: fields.actionDetail !== undefined ? fields.actionDetail : d.actionDetail,
      actionDueDate: fields.actionDueDate !== undefined ? fields.actionDueDate : d.actionDueDate,
      actionMotif: fields.actionMotif !== undefined ? fields.actionMotif : d.actionMotif,
      risk: {
        edrInstalled: fields.edrInstalled !== undefined ? fields.edrInstalled === 'yes' : d.risk.edrInstalled,
        internetExposed: fields.internetExposed !== undefined ? fields.internetExposed === 'yes' : d.risk.internetExposed,
        hasRemediationPlan: fields.hasRemediationPlan !== undefined ? fields.hasRemediationPlan === 'yes' : d.risk.hasRemediationPlan,
        dic: {
          disponibilite: fields.dicD !== undefined ? (fields.dicD ? parseInt(fields.dicD) : 0) : d.risk.dic.disponibilite,
          integrite: fields.dicI !== undefined ? (fields.dicI ? parseInt(fields.dicI) : 0) : d.risk.dic.integrite,
          confidentialite: fields.dicC !== undefined ? (fields.dicC ? parseInt(fields.dicC) : 0) : d.risk.dic.confidentialite
        }
      },
      urgency: { level: fields.urgency !== undefined ? fields.urgency : (d.urgency?.level || '-') },
      dates: {
        createdAt: d.dates.createdAt, updatedAt: now,
        expiresAt: fields.expiresAt !== undefined ? (fields.expiresAt ? new Date(fields.expiresAt).toISOString() : null) : d.dates.expiresAt,
        nextFollowup: fields.nextFollowup !== undefined ? (fields.nextFollowup ? new Date(fields.nextFollowup).toISOString() : null) : d.dates.nextFollowup,
        lastCheckedAt: fields.lastCheckedAt !== undefined ? (fields.lastCheckedAt ? new Date(fields.lastCheckedAt).toISOString() : null) : (d.dates.lastCheckedAt || null)
      },
      notesStructured: fields._ns ? {
        contexte:    fields._ns.contexte    ?? d.notesStructured?.contexte    ?? '',
        raison:      fields._ns.raison      ?? d.notesStructured?.raison      ?? '',
        risques:     fields._ns.risques     ?? d.notesStructured?.risques     ?? '',
        plan:        fields._ns.plan        ?? d.notesStructured?.plan        ?? '',
        mitigations: fields._ns.mitigations ?? d.notesStructured?.mitigations ?? '',
        remediations:fields._ns.remediations?? d.notesStructured?.remediations?? '',
        checks: d.notesStructured?.checks   ?? { contexte:false, raison:false, risques:false, plan:false, mitigations:false, remediations:false }
      } : (d.notesStructured ?? {}),
      history
    };
    this.save(data);
    return data.derogations[idx];
  },

  /* ─── Autosaves silencieux ────────────────────────────────────── */

  updateNotesStructured(id, ns) {
    const data = this.load();
    const idx = data.derogations.findIndex(d => d.id === id);
    if (idx === -1) return;
    data.derogations[idx] = this._migrateDerog({ ...data.derogations[idx] });
    data.derogations[idx].notesStructured = { ...data.derogations[idx].notesStructured, ...ns };
    data.derogations[idx].dates.updatedAt = new Date().toISOString();
    this._silentSave(data);
  },

  updateActionBloc(id, detail, dueDate, motif) {
    const data = this.load();
    const idx = data.derogations.findIndex(d => d.id === id);
    if (idx === -1) return;
    data.derogations[idx].actionDetail = detail;
    data.derogations[idx].actionDueDate = dueDate || null;
    data.derogations[idx].actionMotif = motif !== undefined ? motif : (data.derogations[idx].actionMotif || null);
    data.derogations[idx].dates.updatedAt = new Date().toISOString();
    this._silentSave(data);
  },

  updateNotes(id, text) {
    const data = this.load();
    const idx = data.derogations.findIndex(d => d.id === id);
    if (idx === -1) return;
    data.derogations[idx].notes = text;
    data.derogations[idx].dates.updatedAt = new Date().toISOString();
    this._silentSave(data);
  },

  updateMeetingNotes(id, text) {
    const data = this.load();
    const idx = data.derogations.findIndex(d => d.id === id);
    if (idx === -1) return;
    data.derogations[idx].meetingNotes = text;
    data.derogations[idx].dates.updatedAt = new Date().toISOString();
    this._silentSave(data);
  },

  updateActionLog(id, log) {
    const data = this.load();
    const idx = data.derogations.findIndex(d => d.id === id);
    if (idx === -1) return;
    data.derogations[idx].actionLog = log;
    data.derogations[idx].dates.updatedAt = new Date().toISOString();
    this._silentSave(data);
  },

  delete(id) {
    const data = this.load();
    data.derogations = data.derogations.filter(d => d.id !== id);
    this.save(data);
  },

  /* ─── Export / Import ─────────────────────────────────────────── */

  /**
   * Retourne les données déchiffrées sous forme de JSON indenté.
   * Utilisé par exportData() dans app.js — le téléchargement reste en clair.
   */
  exportClear() {
    return JSON.stringify(this.load(), null, 2);
  },

  /**
   * Importe des données en clair (fichier backup) et les re-chiffre.
   * @throws {Error} si la structure est invalide
   */
  importFromClear(parsed) {
    if (!parsed || !Array.isArray(parsed.derogations))
      throw new Error('Structure JSON invalide — clé "derogations" manquante');
    this.save(parsed); // save() chiffre automatiquement si StoreCrypto est actif
  },

  /* ─── Prefs (non chiffrées, pas de données sensibles) ──────────── */

  loadPrefs() { try { return JSON.parse(localStorage.getItem(this.PREFS_KEY)) || {}; } catch { return {}; } },
  savePrefs(p) { localStorage.setItem(this.PREFS_KEY, JSON.stringify({ ...this.loadPrefs(), ...p })); }
};
