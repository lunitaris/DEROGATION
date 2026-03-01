# DerogManager — Fiche projet pour Claude

## Contexte métier
Application de pilotage des **demandes de dérogations cybersécurité** pour un grand compte.
Une dérogation = tolérance temporaire d'une non-conformité au Référentiel SSI, max 1 an, renouvelable.
L'utilisateur (Maël) gère ces tickets dans ServiceNow mais se sert de cette appli comme tableau de bord personnel.

## Architecture modulaire

**Zéro dépendance** à installer. Données en `localStorage` (JSON).
Polices : Google Fonts CDN (Inter + JetBrains Mono) — optionnel, fallback system-ui.
Fonctionne en `file://` — **pas d'ES modules** (`import`/`export`), scripts classiques uniquement.

```
/DEROG/
├── index.html              (~110 lignes — structure HTML uniquement)
├── ticket.html             (~130 lignes — vue plein écran d'une dérogation)
├── css/
│   ├── base.css            (variables CSS :root, thème light, reset)
│   ├── layout.css          (topbar, today panel, stats, filter bar, sidebar layout, shortcuts)
│   ├── components.css      (cartes, badges, notes, quick-notes, action log, indicateurs)
│   ├── views.css           (vue pilotage, couleurs notes, modals, forms, animations, responsive)
│   ├── ticket.css          (layout 2 panneaux plein écran, topbar ticket, bandeau identité, toast)
│   └── timeline.css        (journal enrichi actor/etype, timeline SVG, tooltip — ticket.html only)
└── js/
    ├── constants.js        (STATUS_LABELS, ACTION_LABELS, MOTIF_LABELS, NOTES_SECTIONS, DIC_LABELS, ACTORS, ETYPES)
    ├── store.js            (Store object — load/save/create/update/migrate/delete/prefs)
    ├── helpers.js          (formatDate, daysUntil, badges, esc, autoResizeTA, lastCheck*)
    ├── filters.js          (UI state, getFiltered, applyFilters, renderStats, renderCards, renderAll…)
    ├── sidebar.js          (openSidebar, renderSidebar, quickUpdate, autosave, renderActionLogSection)
    ├── pilotage.js         (renderPilotage, setPilotageSort — colonne ↗ plein écran)
    ├── modal-derog.js      (openNewModal, openEditModal, saveDerogation, confirmDelete, openModal…)
    ├── modal-email.js      (EMAIL_TEMPLATES, openEmailModal, copyEmail)
    ├── modal-crypto.js     (openCryptoModal, _submitCryptoModal — modal mot de passe partagé index+ticket)
    ├── render-shared.js    (sharedIndicatorsHtml — partagé index+ticket)
    ├── app.js              (toggleTheme, exportData, importData, showDataError, openFullscreen, keydown, search, init, initCrypto)
    ├── ticket-actions.js   (tp_ — autosave & interactions pour ticket.html)
    ├── ticket-timeline.js  (tpRenderTimeline, tooltip SVG — ticket.html only)
    └── ticket.js           (initTicketPage→_initTicketCrypto+_loadTicketById, renderTicketPage, renderTopbar…)

Librairie crypto (externe) :
    js/sjcl.min.js          (SJCL 1.0.8 — build cdnjs standard, pas de patch — CCM est natif)
    js/crypto.js            (StoreCrypto — AES-256-CCM + PBKDF2-HMAC-SHA256 100k itérations)
```

### Ordre de chargement des `<script>` (dépendances)
```
index.html :  sjcl → crypto → constants → store → helpers → render-shared → filters → sidebar → pilotage → modal-derog → modal-email → modal-crypto → app
ticket.html : sjcl → crypto → constants → store → helpers → render-shared → modal-crypto → ticket-actions → ticket-timeline → ticket
```
Les `function` déclarées sont hoistées dans leur script. Les appels croisés fonctionnent car
ils s'exécutent après le chargement de tous les scripts (appelés depuis des corps de fonctions).

---

## Architecture JS

### Data model (localStorage key: `derogmanager_data`)
```json
{
  "version": 2,
  "derogations": [{
    "id": "uuid",
    "ticketId": "SNW-2024-0001",
    "title": "...",
    "applicant": { "name": "Jean Dupont" },
    "asset": "Infra prod Zone B",
    "status": "new | en_revue | validated | expired",
    "actionStatus": "a_faire | attente_demandeur | reunion_prevue | suivi_date | attente_validation | termine",
    "actionDetail": "texte libre — champ legacy, plus affiché dans l'UI",
    "actionDueDate": "ISO date ou null — champ legacy, plus affiché dans l'UI",
    "actionMotif": "string ou null  ← visible seulement si actionStatus = attente_demandeur",
    "risk": {
      "edrInstalled": false,
      "internetExposed": true,
      "hasRemediationPlan": false,
      "dic": { "disponibilite": 3, "integrite": 3, "confidentialite": 2 }
      // DIC : 0 = inconnu/non renseigné, 1-4 = valeur connue
    },
    "urgency": { "level": "- | p0 | p1" },
    "dates": {
      "createdAt": "ISO",
      "updatedAt": "ISO",
      "expiresAt": "ISO ou null",
      "nextFollowup": "ISO ou null",
      "lastCheckedAt": "ISO ou null  ← dernière vérification manuelle dans ServiceNow"
    },
    "notes": "",                  // ← string libre (post-it sidebar) — distinct de notesStructured
    "actionLog": [{ "date": "YYYY-MM-DD", "text": "...", "actor": "team", "etype": "commentaire" }],  // ← journal manuel des actions ; actor/etype ajoutés v3, migrés depuis { date, text } avec valeurs par défaut
    "meetingNotes": "",           // ← notes de préparation de réunion (fond orange, masqué si vide)
    "notesStructured": {
      "contexte": "",
      "raison": "",
      "risques": "",
      "plan": "",
      "mitigations": "",
      "remediations": "",
      "checks": {
        "contexte": false, "raison": false, "risques": false,
        "plan": false, "mitigations": false, "remediations": false
      }
    },
    "history": [{ "timestamp": "ISO", "event": "created|status_changed|action_changed", "from": null, "to": "new", "note": "" }]
  }]
}
```

### Prefs (localStorage key: `derogmanager_prefs`)
```json
{ "theme": "dark|light", "defaultView": "card|table", "todayPanelCollapsed": false, "lastExportAt": "ISO ou absent" }
```
`lastExportAt` est mis à jour par `exportData()` (app.js). Si absent ou > 7 jours, un rappel "💾 Backup" apparaît dans le Today Panel.

### Store API (objet JS `Store`)
- `Store.getAll()` — liste toutes les dérogations (migrées)
- `Store.getById(id)`
- `Store.create(fields)` → crée + sauvegarde
- `Store.update(id, fields)` → met à jour + sauvegarde
- `Store.updateNotesStructured(id, ns)` — sauvegarde autosave des notes
- `Store.updateNotes(id, text)` — sauvegarde autosave notes libres (champ `notes`)
- `Store.updateMeetingNotes(id, text)` — sauvegarde autosave notes réunion (champ `meetingNotes`)
- `Store.updateActionLog(id, log)` — sauvegarde autosave journal d'actions (champ `actionLog`)
- `Store.delete(id)`
- `Store._migrateDerog(d)` — migration old format vers v2 (appelée systématiquement)
- `Store.exportClear()` → string JSON indenté déchiffré — utilisé par `exportData()`
- `Store.importFromClear(parsed)` → valide + sauvegarde (re-chiffre auto si StoreCrypto actif). ⚠️ **Écrase toutes les données sans confirmation supplémentaire** — la confirmation `confirm()` est faite en amont dans `importData()` (app.js)
- `Store._isEncryptedBlob(raw)` → détecte si une chaîne localStorage est un blob chiffré `{v,iv,ct}`
- `Store._silentSave(data)` → sauvegarde interne (chiffrée si actif) sans event — utilisée par tous les `updateXxx()`
- `Store._loadError` → `null` si le dernier `load()` a réussi ; `{ message, snippet }` si JSON.parse a échoué (données corrompues). Affiché dans `#data-error-banner` par `renderAll()`. Se réinitialise à `null` à chaque `load()` réussi.

> **Convention autosave "silencieux"** : `updateNotes`, `updateNotesStructured`, `updateActionLog` passent par `_silentSave()` — chiffre automatiquement si StoreCrypto actif, **sans** déclencher de re-render ni d'événement. Ne jamais appeler `renderAll()` depuis ces chemins. Ne jamais écrire `localStorage.setItem(Store.KEY, ...)` directement.

### Zones de texte par dérogation (récapitulatif)
4 champs texte distincts, comportements différents :

| Champ | Fond | Visible dans | Autosave | Méthode Store |
|-------|------|-------------|----------|---------------|
| `notes` | Jaune post-it | Sidebar + Ticket (gauche) | 800 ms | `updateNotes` |
| `meetingNotes` | Orange | Sidebar + Ticket (gauche) — **masqué si vide** | 800 ms | `updateMeetingNotes` |
| `actionLog[]` | Gris | Sidebar + Ticket (droite) | Manuel (bouton Ajouter) | `updateActionLog` |
| `notesStructured` | Sémantique (6 couleurs) | Sidebar + Ticket (droite) | 1 200 ms | `updateNotesStructured` |

---

## Constantes importantes

### ACTORS (journal d'actions — index.html et ticket.html)
| Clé | Libellé | Emoji | Couleur |
|-----|---------|-------|---------|
| `demandeur` | Demandeur | 👤 | `#42a5f5` (bleu) |
| `team` | Team Dérog | 🛡 | `#4caf50` (vert) |

### ETYPES (types d'événements journal — index.html et ticket.html)
10 types : `soumission` 📤 · `question` ❓ · `reponse` 💬 · `validation` ✅ · `escalade` ⭐ (Review) · `final_review` 💎 (Final Review) · `acceptation` 🎉 · `refus` ❌ · `complement` 📎 · `commentaire` 💡
Chaque type a : `id`, `label`, `emoji`, `color`, `triggersStatus` (string d'état ou null).
⚠️ L'etype `escalade` conserve son `id: 'escalade'` pour la compat des données existantes ; son label est "Review" et son emoji ⭐.
`final_review` : `triggersStatus: null`, couleur `#F1C40F` (ambre/or) — déclenche un segment ambre dans la timeline jusqu'au prochain changement d'état.

### STATUS_LABELS (status)
| Clé | Libellé | Couleur |
|-----|---------|---------|
| `new` | New | Bleu |
| `en_revue` | En revue | Ambre |
| `validated` | Validé | Vert |
| `expired` | Expiré | Gris (opacité 0.75 sur les cartes) |

### ACTION_LABELS (actionStatus) — "Next steps"
| Clé | Libellé |
|-----|---------|
| `a_faire` | À faire par moi |
| `attente_demandeur` | En attente retour demandeur |
| `reunion_prevue` | Réunion prévue |
| `suivi_date` | Suivi à date |
| `attente_validation` | En attente validation interne |
| `termine` | Terminé / rien à faire |

### MOTIF_LABELS (actionMotif)
Affiché uniquement si `actionStatus === 'attente_demandeur'`.
Valeurs : `Ticket incomplet` / `Demande d'informations` / `Confirmation ticket ancien` / `Confirmation échéance` / `Suivi avancement` / `Autre`

### NOTES_SECTIONS (dossier structuré)
Clés : `contexte`, `raison`, `risques`, `plan`, `mitigations`, `remediations`
Chaque section a une textarea + un bouton checkbox "OK / À valider".

### Urgence
Valeurs : `-` (aucune), `p0`, `p1`.
- Affiché **uniquement dans la sidebar** (section hero) : badge coloré selon `urgency.level`
- CSS : variable `--urgency-p0` (rouge) / `--urgency-p1` (orange) définies dans `base.css`
- **Absent** des cartes, du tableau, de la vue Pilotage, du Today Panel et des filtres
- Modifiable uniquement via la modal de création/édition (champ select dans modal-derog.js)

---

## UI Layout

```
TOPBAR (fixe) — logo + recherche + boutons
├── TODAY PANEL (collapsible) — items urgents auto-calculés
├── STATS BAR — pills cliquables : New · En revue · Validé · Expiré · À faire par moi · Expire <7j
├── FILTER BAR — dropdowns (statut SN, next step, expiry) + toggle card/table/pilotage
└── LIST CONTAINER — cartes | tableau compact | vue Pilotage

VUE CARD — chaque carte affiche :
  Ticket · Statut SN · Titre · Porteur + Asset
  Next step badge · Motif badge (orange, si attente_demandeur + motif renseigné) · Expiration
  Bouton ↗ (visible au hover) → ouvre ticket.html en nouvel onglet
  Clic molette → ouvre aussi ticket.html en nouvel onglet

VUE TABLE — colonnes :
  Ticket · Titre · Porteur · Statut SN · Next step · Motif · Expiration

VUE PILOTAGE — tableau dense :
  ↗ · Ticket · Titre · Porteur · Statut · Dernière action journal (emoji + texte 50c) ·
  Dossier (pips) · Dernière vérif. (inline éditable) · Prochaine relance
  Bouton ↗ et clic molette → ouvre ticket.html en nouvel onglet

VUE TICKET PLEIN ÉCRAN (ticket.html?id=…)
  Topbar fixe : ← retour · breadcrumb · 3 boutons email (copie presse-papiers) · Modifier · Thème · Supprimer
  Bandeau identité fixe : badges statut/action/motif · porteur · asset · expiration · risk chips
  Cadre supérieur fusionné (tp-summary-inner) — 3 colonnes côte à côte :
    1. Profil de risque (185px) — grille indicateurs (Mitigations, Plan d'action, Exposé internet, DIC)
    2. Notes libres (flex:1, fond jaune) — textarea autosave 800ms
    3. Cycle de vie (270px) — dates + dernière action journal + bouton "Vérifier maintenant"
  Panneau gauche (390px, scroll indépendant) — ordre exact :
    1. Préparation réunion (fond orange) — affiché si meetingNotes non vide, bouton ✕ Effacer
    2. (autres sections futures éventuelles)
  Panneau droit (flex:1, scroll indépendant) — ordre exact :
    1. #tp-dossier-row (flex row) :
       ├── Dossier (flex:1) — 6 sections ouvertes par défaut, couleurs sémantiques, checkbox OK, barre progression
       └── Timeline SVG (340px, sticky) — colonnes par acteur, points bezier, tooltip au survol
    2. Journal d'actions — formulaire enrichi (date + acteur + type + message) ; entrées triées ↓ (plus récent en haut) ; [×] supprimer par ligne

DETAIL SIDEBAR (droite, 440px) — slide-in — ordre exact des sections :
  ├── Hero (titre, badge urgence, statut SN, ticket ID, bouton 📋 Réunion)
  ├── Porteur + Asset
  ├── Statut ServiceNow (select inline)
  ├── Journal (fond gris) — lignes : date | actor-emoji | etype-emoji | texte, triées chrono ↑
  │     [+] dans le header du bloc ; 4 plus récentes par défaut, expand/collapse ; [×] par ligne
  │     autosave debounce 800ms → champ `actionLog`
  ├── Dernière action journal (carte résumé, sous le journal interactif)
  │     affiche la plus récente : actor + etype + texte tronqué 100c
  ├── Préparation réunion (fond orange, masqué par défaut)
  │     affiché si meetingNotes non vide OU si bouton cliqué ; indicateur ● orange si contenu présent
  │     bouton "✕ Effacer" vide et masque → champ `meetingNotes`
  ├── Notes (fond jaune post-it) — textarea libre, autosave 800ms → champ `notes`
  ├── Profil de risque (indicateurs : Mitigations, Plan d'action, Exposé internet, DIC)
  ├── Cycle de vie (dates + lastCheckedAt + bouton "Vérifier maintenant")
  ├── Dossier (6 sections notes structurées) — autosave 1200ms, checkbox par section
  └── Actions rapides (emails, modifier, supprimer)

MODAL new/edit — tous les champs
  ↳ Motif conditionnel : visible si f-actionStatus = attente_demandeur (onchange inline)
MODAL email — 3 templates (relance info, point statut, alerte expiration)
MODAL confirm — suppression
```

---

## Raccourcis clavier
- `N` — nouvelle dérogation
- `/` — focus recherche
- `Esc` — fermer sidebar/modal
- `J` / `↓` — dérogation suivante dans sidebar
- `K` / `↑` — dérogation précédente dans sidebar

---

## Today Panel — logique d'alertes
- `a_faire` → "À faire par moi"
- `reunion_prevue` → "Réunion prévue"
- `attente_demandeur` (sans date ou date dépassée) → alerte relance
- Expire ≤7j ET statut ≠ validated ET ≠ expired → "Expire dans N jours"
- nextFollowup ≤ aujourd'hui ET pas terminé → "Date de relance dépassée"

---

## Helpers UI importants
- `actionBadge(actionStatus)` — badge coloré Next step (cartes + table uniquement)
- `motifBadge(d)` — badge orange motif (carte uniquement, si attente_demandeur + motif)
- `motifCell(d)` — idem pour table (affiche `—` si vide)
- `statusBadge(status)` — badge statut SN
- `autoResizeTA(el)` — `el.style.height='auto'; el.style.height=el.scrollHeight+'px'` ; toujours appeler via `requestAnimationFrame` après un `innerHTML=` ; nécessite `resize:none; overflow-y:hidden` sur la textarea

---

## Conventions de code

Règles implicites à respecter dans **tout** nouveau code :

1. **Préfixe `tp_`** — toutes les fonctions globales de `ticket-actions.js` sont préfixées `tp` (ex: `tpScheduleNotesSave`). Les helpers privés sont préfixés `_tp`.
2. **Autosave via `_silentSave()` uniquement** — ne jamais écrire `localStorage.setItem(Store.KEY, ...)` directement. Toujours passer par une méthode `Store.updateXxx()`.
3. **`setTimeout(fn, 20)` avant PBKDF2** — tout appel bloquant à `StoreCrypto.unlock()` ou `StoreCrypto.setup()` doit être enveloppé dans un `setTimeout(fn, 20)` pour permettre au spinner de s'afficher.
4. **`requestAnimationFrame` avant `autoResizeTA()`** — après un `innerHTML=`, toujours différer `autoResizeTA()` dans un `requestAnimationFrame` (le layout n'est pas encore calculé au moment de l'injection).
5. **Jamais `renderAll()` depuis un chemin autosave** — les méthodes `updateXxx()` sont silencieuses par convention ; les appeler depuis un callback autosave ne doit pas déclencher de re-render global.

---

## Migrations
`Store._migrateDerog(d)` gère :
- Old `actionStatus` values gen1→2→3 : `waiting_info/ready_for_review/done` → gen2, puis `ticket_incomplet/attente_info/a_relancer/pret_review/cloture` → gen3
- Old `status` values : `branch_review/rejected` → `en_revue` ; `expired` conservé tel quel (statut valide)
- `notes` string → `notesStructured` object
- Champs manquants : `actionDetail`, `actionDueDate`, `actionMotif`, `notesStructured.checks`, `lastCheckedAt`
- Old `urgency.p0Linked/p1Linked` → `urgency.level`
- Old `actionLog` entries `{ date, text }` → `{ date, text, actor: 'team', etype: 'commentaire' }` (valeurs neutres par défaut)

---

## Stats bar — comportement des compteurs
- **New / En revue / Validé / Expiré** : compteur brut par statut, clic = filtre rapide (toggle)
- **À faire par moi** : exclut `validated` et `expired`, rouge si > 0
- **Expire <7j** : exclut `validated` et `expired`, orange si > 0

---

## Vue plein écran (ticket.html)

### Ouverture
- Bouton ↗ au hover sur une carte → `openFullscreen(id)` → `window.open('ticket.html?id='+id, '_blank')`
- Clic molette sur une carte → même chose via `onauxclick`
- Colonne ↗ dans la vue Pilotage

### Fonctions dans render-shared.js (partagées sidebar ↔ ticket)
- `sharedIndicatorsHtml(risk, ns)` → HTML du bloc Indicateurs (Mitigations, Plan d'action, Exposé internet, DIC). Classes CSS générées : `risk-ind-list`, `risk-ind-row`, `risk-ind-label`, `risk-ind-yes`, `risk-ind-no`, `risk-ind-na`, `risk-ind-warn`. Appelée depuis `renderRiskProfile()` (ticket.js) et `renderSidebar()` (sidebar.js).

### Fonctions dans ticket-actions.js (préfixe `tp_`)
- `tpClearMeetingNotes()` — vide + masque l'encart réunion
- `tpScheduleMeetingNotesSave()` — debounce 800ms → `Store.updateMeetingNotes`
- `tpScheduleNotesSave()` — debounce 800ms → `Store.updateNotes`
- `tpInitJournalForm()` — peuple #tp-j-actor / #tp-j-etype depuis ACTORS/ETYPES, fixe #tp-j-date à today ; appelée depuis `renderJournalShell()`
- `_tpActorOptions(selected)` / `_tpEtypeOptions(selected)` — génèrent les `<option>` HTML pour les selects journal
- `tpAddJournalEntry()` — lit le formulaire (#tp-j-actor/etype/date/message), pousse `{ date, text, actor, etype }` dans `tp_journal`
- `tpRemoveJournalEntry(realIdx)` / `tpUpdateJournal(realIdx, field, val)`
- `tpSaveJournal()` — `Store.updateActionLog`, synchrone
- `tpRenderJournal()` — re-render du journal (tri chronologique, sans recréer le shell) + appelle `tpRenderTimeline(tp_journal)`
- `_tpSortedJournalIndices()` — retourne les indices de `tp_journal` triés par date **↓** (plus récent en haut — `db.localeCompare(da)`) ; sans date → fin
- `tpToggleNoteBlock(key)` — expand/collapse section dossier
- `tpScheduleDossierSave(key)` — debounce 1200ms → `Store.updateNotesStructured`
- `tpToggleNoteCheck(key)` — toggle checkbox OK section dossier
- `tpMarkCheckedNow()` — `Store.update({lastCheckedAt: now})`
- `tpConfirmDelete()` — dialog confirm → `Store.delete` → `window.location.href='index.html'`
- `tpCopyEmail(type)` — copie email dans presse-papiers (types: info, status, expiry) — implémentation locale dans ticket-actions.js (modal-email.js n'est pas chargé dans ticket.html)
- `tpShowToast(msg)` — toast 2.5s en bas de page

### Fonctions dans ticket-timeline.js
- `tpRenderTimeline(entries)` — cible `#tp-timeline-wrap` ; SVG 2 colonnes (120px/col) × acteur, points bezier ; flèches bezier cubique (couleur acteur source, marqueur chevron ouvert, endpoint = `y2-dotR-2`) ; ball-in-court : ambre `#F1C40F` si etype `final_review` (Final Review), orange `#f59e42` si etype `escalade` (Review), bleu `#42a5f5` si ball sur demandeur, rouge `#e53935` si ball sur team ; attache tooltip aux `.tl-dot`
- `tpShowTip(e, entry)` / `tpMoveTip(e)` / `tpHideTip()` — tooltip fixe ciblant `#tp-tooltip`
- `_tpFormatDateShort(d)` — helper date courte (`"2025-03-15"` → `"15 mar"`)

### Fonctions dans ticket.js
- `initTicketPage()` — charge le thème, délègue à `_initTicketCrypto(_loadTicketById)`
- `_initTicketCrypto(afterUnlock)` — tente `StoreCrypto.tryRestoreFromSession()` (sessionStorage, sans PBKDF2), sinon `openCryptoModal('unlock', cb)`
- `_loadTicketById()` — lit ?id=, initialise `tp_journal`, écoute `storage` + `focus` (closure sur `id`)
- `renderTicketPage(d)` — appelle tous les render* + redimensionne les textareas ; **`renderTimelineSection()` doit être appelé avant `renderJournalShell()`** (crée #tp-timeline-wrap avant que tpRenderJournal() le peuple)
- `renderTopbar(d)`, `renderIdentityStrip(d)`
- `renderRiskProfile(d)`, `renderMeetingNotes(d)`, `renderQuickNotes(d)`
- `renderTimelineSection()` — crée `#tp-timeline-wrap` dans `#tp-timeline`
- `renderJournalShell(d)` + `tpRenderJournal()` (séparé pour re-render sans recréer le shell)
- `renderDossier(d)`, `renderLifecycle(d)` (inclut dernière entrée `actionLog` triée desc par date)

### Synchronisation inter-onglets
Deux mécanismes dans `_loadTicketById` :
1. `window.addEventListener('storage', ...)` — re-render si index.html modifie le Store (fonctionne entre origines différentes ou même origine selon le navigateur)
2. `window.addEventListener('focus', ...)` — re-render quand ticket.html reprend le focus **(compensate pour la peu fiabilité des storage events en `file://`)**

### Journal d'actions — tri chronologique
- **Ticket plein écran** : tri **décroissant** — `_tpSortedJournalIndices()` → `db.localeCompare(da)` (plus récent en haut)
- **Sidebar** : tri **croissant** — `_sortedActionLogIndices()` → `da.localeCompare(db)` (les 4 plus récentes = fin de liste, collapse = tranche finale)
- Les entrées **sans date** apparaissent en fin de liste dans les deux cas
- Le tableau `tp_journal` (plein écran) et `_actionLog` (sidebar) conservent l'ordre d'insertion ; seul le rendu est trié
- Technique : chaque ligne DOM reçoit `data-real-idx="${realIdx}"` ; tous les onclick passent le vrai index du tableau
- Quand une date est modifiée (`onchange`), `tpRenderJournal()` est appelé pour re-trier

---

## CSS — Variables et pièges

### Variables CSS correctes (définies dans base.css)
```
Fonds    : --bg-surface, --bg-elevated, --bg-hover, --bg-input
Texte    : --text-primary, --text-secondary, --text-muted
Bordures : --border, --border-muted
Rayon    : --radius-sm, --radius-md, --radius-lg
Autres   : --accent, --transition, --font-mono
```
**Ne jamais utiliser** `--surface`, `--text`, `--radius`, `--surface-2`, `--surface-hover` — ces variables n'existent pas.

### Piège : `base.css` impose `width: 100%` sur tous les form elements
`base.css` ligne ~75 : `input, select, textarea { width: 100%; }` — règle globale.
Tout nouvel élément `<input>` ou `<select>` inline (ex: dans une flex row) sera écrasé à pleine largeur.
**Fix obligatoire** : ajouter `width: auto; flex: 0 0 auto;` dans le sélecteur CSS et `flex-wrap: nowrap` sur le conteneur flex.

### Piège : classe `inline-date`
La classe `.inline-date` (définie dans `views.css` pour la vue Pilotage) impose `width: 100%`.
**Ne jamais l'ajouter aux inputs date du journal** (`action-log-date`) — elle écraserait la largeur fixe et compresserait le texte et les boutons de la ligne à zéro.

### Couleurs sémantiques du dossier
Chaque section du dossier a un `id` (ex: `id="nb-contexte"` en sidebar, `id="tp-nb-contexte"` en plein écran) qui reçoit une couleur de bordure/fond/titre spécifique via CSS :
- `contexte` → bleu `#79C0FF`
- `raison` → orange `#F0883E`
- `risques` → rouge `#FF7B72`
- `plan` → violet `#BC8CFF`
- `mitigations` → cyan `#39D0D4`
- `remediations` → vert `#3FB950`

---

## Chiffrement (StoreCrypto)

Algorithme : **AES-256-CCM** (Counter with CBC-MAC) — natif dans sjcl, intégrité garantie par tag MAC.
**Pas de patch `core/cbc.js`** — supprimé. L'opt-in CBC reste dans `crypto.js` uniquement pour la migration automatique des données v:1 (legacy) → v:2.

Stockage :
- `derogmanager_crypto` (localStorage) → `{ iter:100000, salt, vsalt, vhash }` — config, jamais la clé
- `derogmanager_data` (localStorage) → `{ v:2, iv, ct }` quand chiffré (`iv` = nonce 96 bits), JSON ordinaire sinon
  - v:1 = ancien format CBC (migré automatiquement au premier `unlock()`)
- `derogmanager_session_key` (**sessionStorage**) → clé AES hex — partagée entre onglets de même session, effacée à la fermeture du navigateur
- `derogmanager_prefs` → non chiffré

API `StoreCrypto` (global défini dans `crypto.js`, dépend de `sjcl`) :
- `StoreCrypto.isSetup()` — true si config présente
- `StoreCrypto.isLocked()` — true si `_key === null`
- `StoreCrypto.tryRestoreFromSession()` → boolean — restaure `_key` depuis sessionStorage **sans PBKDF2** ; appeler en premier dans ticket.html
- `StoreCrypto.unlock(password)` → boolean — **BLOQUANT ~2-4 s** (PBKDF2 ×2) + migration v1→v2 auto + sauvegarde clé en sessionStorage ; toujours appeler depuis `setTimeout(fn, 20)`
- `StoreCrypto.setup(password, existingData)` — première config, re-chiffre les données existantes si fournies
- `StoreCrypto.lock()` — efface `_key` RAM + sessionStorage
- `StoreCrypto.changePassword(oldPwd, newPwd, currentData)` → boolean — ⚠️ **pas d'UI exposée** actuellement
- `StoreCrypto._key` — bitArray SJCL en RAM + copie hex dans sessionStorage

Flux démarrage :
- `index.html` : `init()` → `initCrypto(renderAll)` → `openCryptoModal(mode, cb)` → PBKDF2 → `cb()`
- `ticket.html` : `initTicketPage()` → `_initTicketCrypto(cb)` → `tryRestoreFromSession()` → si échec : `openCryptoModal('unlock', cb)`

Modal mot de passe (`modal-crypto.js`) :
- `openCryptoModal(mode, callback)` — modes : `'unlock'`, `'setup'`, `'setup-migrate'`
- Spinner affiché via `setTimeout(fn, 20)` pour laisser le DOM peindre avant blocage PBKDF2
- CSS dans `views.css` (section `/* ── MODAL CRYPTO */`)

---

## Améliorations futures possibles
- UI de changement de mot de passe maître (appelle `StoreCrypto.changePassword()`, déjà implémenté)
- Web Worker pour PBKDF2 (éviter le gel de l'UI ~2-4 s lors du déverrouillage)
- Confirmation explicite avant import si des données existent déjà (actuellement géré par `confirm()` natif dans `importData()`)
- Boutons d'export contenu ticket pour permettre le copier coller dans ServiceNow (demander précisions pour cette feature)
