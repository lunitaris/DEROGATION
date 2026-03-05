/* ================================================================
   CONSTANTS — Labels, sections notes
================================================================ */
const STATUS_LABELS = {
  new:      'New',
  en_revue: 'En revue',
  validated:'Validé',
  expired:  'Expiré'
};


const DIC_LABELS = ['', 'Faible', 'Moyen', 'Élevé', 'Critique'];

// Sections du bloc notes structuré
const NOTES_SECTIONS = [
  { key: 'contexte',    label: 'Contexte',              placeholder: 'Contexte métier et IT, périmètre concerné…' },
  { key: 'raison',      label: 'Raison de la demande',  placeholder: 'Pourquoi une remédiation immédiate n\'est pas possible, impacts liés au métier…' },
  { key: 'risques',     label: 'Risques cyber',         placeholder: 'Description des risques associés à cette non-conformité…' },
  { key: 'plan',        label: 'Plan d\'action',        placeholder: 'Étapes précises avec dates, responsables, jalons…' },
  { key: 'mitigations', label: 'Mitigations',           placeholder: 'Mesures compensatoires en place ou prévues (segmentation réseau, SIEM, etc.)…' },
  { key: 'remediations',label: 'Remédiation',           placeholder: 'Description des actions de remédiation, budget validé, planning cible…' }
];

/* ================================================================
   TIMELINE — Acteurs et types d'événements
================================================================ */
const ACTORS = {
  demandeur: { id: 'demandeur', label: 'Demandeur',   emoji: '👤', color: '#42a5f5' },
  team:      { id: 'team',      label: 'Team Dérog',  emoji: '🛡', color: '#4caf50' }
};

const ETYPES = {
  soumission:  { id: 'soumission',  label: 'Soumission',        emoji: '📤', color: '#f59e42', triggersStatus: 'soumis'     },
  question:    { id: 'question',    label: 'Demande d\'infos',  emoji: '❓', color: '#42a5f5', triggersStatus: 'en_attente' },
  relance:     { id: 'relance',     label: 'Relance',           emoji: '🔄', color: '#f59e42', triggersStatus: null         },
  reponse:     { id: 'reponse',     label: 'Réponse',           emoji: '💬', color: '#f59e42', triggersStatus: 'analyse'    },
  validation:  { id: 'validation',  label: 'Validation',        emoji: '✅', color: '#66bb6a', triggersStatus: 'valide'     },
  escalade:     { id: 'escalade',     label: 'Review',         emoji: '⭐', color: '#ab47bc', triggersStatus: 'escalade'   },
  final_review: { id: 'final_review', label: 'Final Review',   emoji: '💎', color: '#F1C40F', triggersStatus: null         },
  acceptation:  { id: 'acceptation',  label: 'Acceptation',    emoji: '🎉', color: '#66bb6a', triggersStatus: 'accepte'    },
  refus:       { id: 'refus',       label: 'Refus',             emoji: '❌', color: '#ef5350', triggersStatus: 'refuse'     },
  complement:  { id: 'complement',  label: 'Complément',        emoji: '📎', color: '#ffd54f', triggersStatus: null         },
  commentaire: { id: 'commentaire', label: 'Commentaire',       emoji: '💡', color: '#78909c', triggersStatus: null         },
  reunion:     { id: 'reunion',     label: 'Réunion',           emoji: '📅', color: '#8b5cf6', triggersStatus: null         }
};


