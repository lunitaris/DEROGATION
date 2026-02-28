# DerogManager — Besoin métier

## Contexte

Dans un grand compte, la politique de sécurité des systèmes d'information (SSI) impose un référentiel de conformité. Lorsqu'un système ou une pratique ne respecte pas ce référentiel, une **dérogation** peut être accordée : c'est une tolérance temporaire, encadrée et documentée, valable au maximum un an et renouvelable.

Ces dérogations sont formellement gérées dans un outil ITSM (ServiceNow). Cependant, le responsable SSI qui les pilote au quotidien a besoin d'un **tableau de bord personnel** pour suivre l'ensemble de son portefeuille de dérogations, prioriser ses actions et ne rien laisser passer.

---

## Utilisateur cible

Un seul utilisateur : le responsable SSI (Maël) qui instruit, suit et clôture les demandes de dérogation pour son périmètre.

---

## Besoins fonctionnels

### 1. Gérer un portefeuille de dérogations

L'utilisateur doit pouvoir :

- **Créer** une dérogation avec les informations essentielles : identifiant du ticket ServiceNow, titre, nom du demandeur, actif concerné, date d'expiration.
- **Consulter** la liste de toutes ses dérogations en un coup d'œil.
- **Modifier** les informations d'une dérogation à tout moment.
- **Supprimer** une dérogation quand elle n'est plus pertinente.

---

### 2. Connaître le statut de chaque dérogation

Chaque dérogation a un statut qui reflète son avancement dans ServiceNow :

| Statut | Signification |
|--------|--------------|
| **New** | Ticket déposé, non encore instruit |
| **En revue** | En cours d'instruction |
| **Validé** | Dérogation accordée |
| **Expiré** | Délai dépassé, dérogation caduque |

L'utilisateur doit pouvoir changer ce statut depuis son tableau de bord.

---

### 3. Suivre la prochaine action à mener

Pour chaque dérogation, l'utilisateur doit savoir **qui doit faire quoi** et **pour quand** :

| Next step | Signification |
|-----------|--------------|
| **À faire par moi** | L'utilisateur doit agir |
| **En attente retour demandeur** | Le demandeur doit fournir des informations |
| **Réunion prévue** | Un échange est planifié |
| **Suivi à date** | Rien à faire avant une date précise |
| **En attente validation interne** | Une décision interne est attendue |
| **Terminé / rien à faire** | Aucune action requise |

Quand la dérogation est **en attente du demandeur**, l'utilisateur précise le motif (ex. : ticket incomplet, demande d'informations, confirmation d'échéance, suivi avancement…).

Chaque next step peut être associé à :
- un champ texte libre pour décrire la dernière action effectuée ou le contexte
- une date prévisionnelle d'échéance pour l'action

---

### 4. Être alerté des urgences

L'utilisateur ne doit pas avoir à parcourir manuellement la liste pour détecter les situations critiques. Un panneau de synthèse doit l'alerter automatiquement sur :

- Les dérogations **qu'il doit traiter lui-même** (next step "À faire par moi")
- Les **réunions prévues**
- Les demandeurs **à relancer** (attente dépassée ou sans date fixée)
- Les dérogations qui **expirent dans les 7 jours** (hors validées et expirées)
- Les **dates de relance dépassées**

---

### 5. Documenter chaque dérogation

Chaque dérogation dispose d'un **dossier structuré** avec six sections :

1. **Contexte** — situation initiale, description du système concerné
2. **Raison de la demande** — pourquoi la conformité n'est pas atteignable maintenant
3. **Risques cyber** — risques identifiés liés à cette non-conformité
4. **Plan d'action** — actions prévues pour revenir à la conformité
5. **Mitigations** — mesures compensatoires déjà en place
6. **Remédiation** — suivi de la résolution effective

Chaque section peut être marquée **"OK"** une fois validée, pour visualiser le niveau de complétude du dossier.

L'utilisateur dispose également d'un espace de **notes libres** (style post-it) pour ses remarques rapides, distinct du dossier structuré.

---

### 6. Évaluer le profil de risque

Pour chaque dérogation, l'utilisateur renseigne des indicateurs de risque :

- L'**EDR est-il installé** sur l'actif concerné ?
- L'actif est-il **exposé sur internet** ?
- Existe-t-il un **plan de remédiation** ?
- Les niveaux **DIC** (Disponibilité, Intégrité, Confidentialité) de l'actif, sur une échelle de 1 à 4

Ces indicateurs permettent de prioriser visuellement les dérogations les plus sensibles.

---

### 7. Filtrer et rechercher

L'utilisateur doit pouvoir :

- **Filtrer** par statut ServiceNow, par next step, par horizon d'expiration
- **Trier** par date de mise à jour, date d'expiration, date de création, ou identifiant ticket
- **Rechercher** par texte libre (titre, ticket, nom du demandeur)
- Basculer entre plusieurs **vues** : vue cartes, vue tableau de pilotage dense

---

### 8. Gérer les dates et les relances

Pour chaque dérogation, l'utilisateur suit :

- La **date de création** et la **date de dernière mise à jour**
- La **date d'expiration** de la dérogation
- La **date de prochaine relance** prévue
- La **date de dernière vérification** dans ServiceNow (saisie manuellement quand l'utilisateur a consulté le ticket)

---

### 9. Générer des emails types

Pour les actions de relance récurrentes, l'utilisateur doit pouvoir générer rapidement un **modèle d'email pré-rempli** à envoyer au demandeur, selon trois situations :
- Relance pour informations manquantes
- Point de statut sur l'avancement
- Alerte d'expiration imminente

---

### 10. Conserver un historique

Chaque dérogation doit conserver une trace des **événements significatifs** : création, changement de statut, changement de next step.

---

### 11. Exporter et importer les données

L'utilisateur doit pouvoir **exporter l'ensemble de ses données** pour en faire une sauvegarde, et **réimporter** un fichier de sauvegarde pour restaurer son tableau de bord.

- L'export produit un **fichier JSON en clair** (déchiffré), lisible et portable, indépendant du mot de passe maître
- L'import réintègre un tel fichier et **re-chiffre automatiquement** les données si le chiffrement est actif

---

### 12. Protéger les données par un mot de passe maître

Les données contiennent des informations sensibles sur le périmètre SSI. L'utilisateur doit pouvoir les **chiffrer au repos** dans le navigateur grâce à un mot de passe maître :

- Au premier lancement, l'utilisateur choisit un mot de passe maître ; les données sont immédiatement chiffrées
- À chaque ouverture, l'application demande le mot de passe avant d'afficher quoi que ce soit
- Le mot de passe n'est **jamais stocké** ; seul un hash de vérification (PBKDF2) est conservé
- Ouvrir un ticket en plein écran (nouvel onglet) ne redemande pas le mot de passe si la fenêtre parente est déverrouillée
- Un export reste possible même avec le chiffrement actif (le fichier exporté est en clair pour la portabilité)

---

## Contraintes d'usage

- Application **mono-utilisateur** : pas de notion de compte, de partage ou de collaboration
- Fonctionnement **hors ligne** et sans installation : l'utilisateur ouvre l'application directement depuis son poste, sans serveur
- Les données sont **privées et locales** : rien n'est envoyé vers un serveur externe
- Les données au repos sont **chiffrées dans le navigateur** (AES-256-CBC, clé dérivée par PBKDF2) et protégées par un mot de passe maître
- L'interface doit fonctionner en **thème sombre et thème clair**
- L'application doit rester **rapide et fluide** même avec plusieurs dizaines de dérogations actives
