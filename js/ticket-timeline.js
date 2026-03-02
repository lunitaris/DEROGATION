/* ================================================================
   TICKET-TIMELINE.JS  v4.0 — Timeline visuelle SVG avec groupes
   Préfixe tp_ pour tout (conventions ticket.html)
   Dépendances : constants.js (ACTORS, ETYPES), helpers.js (esc)
================================================================ */

let _tpTipEl = null;
function tpGetTip() {
  if (!_tpTipEl) _tpTipEl = document.getElementById('tp-tooltip');
  return _tpTipEl;
}

/* ── État des groupes (expand/collapse) ── */
let _tpGroupExpanded = {};  /* { 'g-N': true|false } */

/* ── Etypes qui constituent un échange ── */
const _TP_EXCHANGE_ETYPES = new Set(['question', 'relance', 'reponse', 'complement']);

/* Toggle expand/collapse d'un groupe — appelé depuis les onclick SVG */
function tpToggleGroup(gid) {
  _tpGroupExpanded[gid] = !_tpGroupExpanded[gid];
  tpRenderTimeline(tp_journal);
}

function _tpFormatDateShort(d) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  return parts[2] + '/' + parts[1];
}

function _tpTruncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.substring(0, n) + '…' : s;
}

/* ================================================================
   GROUPAGE — construit une liste de nœuds (type: 'entry' | 'group')

   Un groupe commence par une question de l'équipe et inclut toutes
   les entrées de type échange (question/reponse/complement) qui suivent,
   jusqu'à la première réponse complète du demandeur OU une entrée
   hors échange. Les groupes d'une seule entrée ne sont pas créés.
================================================================ */
function _tpBuildNodes(sorted) {
  const nodes = [];
  let i = 0;
  while (i < sorted.length) {
    const entry = sorted[i];
    const etype = entry.etype || 'commentaire';
    const actor = entry.actor || 'team';

    /* Un groupe commence par une question de l'équipe */
    if (etype === 'question' && actor === 'team') {
      const gid   = 'g-' + i;
      const group = {
        type:      'group',
        id:        gid,
        entries:   [entry],
        startDate: entry.date,
        endDate:   entry.date
      };
      let j = i + 1;
      while (j < sorted.length) {
        const next   = sorted[j];
        const nEtype = next.etype || 'commentaire';
        /* Arrêt si l'entrée suivante n'est pas un échange */
        if (!_TP_EXCHANGE_ETYPES.has(nEtype)) break;
        group.entries.push(next);
        if (next.date) group.endDate = next.date;
        /* Fin si réponse complète du demandeur */
        if (nEtype === 'reponse' && (next.actor || 'team') === 'demandeur' && next.quality === 'complet') {
          j++;
          break;
        }
        j++;
      }
      /* Grouper seulement si l'échange comporte plusieurs entrées */
      if (group.entries.length > 1) {
        nodes.push(group);
        i = j;
      } else {
        nodes.push({ type: 'entry', entry });
        i++;
      }
    } else {
      nodes.push({ type: 'entry', entry });
      i++;
    }
  }
  return nodes;
}

/* ================================================================
   APLATISSEMENT — transforme les nœuds en items à rendre
   Respecte l'état expand/collapse de chaque groupe.
================================================================ */
function _tpFlattenItems(nodes) {
  const items = [];
  for (const node of nodes) {
    if (node.type === 'entry') {
      items.push({ type: 'entry', entry: node.entry, inGroup: null });
    } else {
      if (_tpGroupExpanded[node.id]) {
        /* Groupe étendu : toutes les entrées + bouton collapse */
        for (const e of node.entries) {
          items.push({ type: 'entry', entry: e, inGroup: node.id });
        }
        items.push({ type: 'group-collapse', group: node });
      } else {
        /* Groupe réduit : bulle unique */
        items.push({ type: 'group', group: node });
      }
    }
  }
  return items;
}

/* ================================================================
   "Ball in court" — après cet événement, qui doit agir ?
   Prend en compte le champ `quality` pour les réponses du demandeur.
   Réponse incomplète → ball reste sur demandeur, pas transfert team.
================================================================ */
function _tpBallInCourt(entry) {
  const etype   = entry.etype || '';
  const actor   = entry.actor || 'team';
  const quality = entry.quality || null;

  switch (etype) {
    case 'soumission':      return 'team';

    case 'demande_info':
    case 'question':
    case 'relance':
      if (actor === 'demandeur') return 'team';
      return 'demandeur';  /* team pose une question / relance → demandeur doit répondre */

    case 'reponse_info':
    case 'reponse':
      /* Réponse incomplète du demandeur → ball reste sur demandeur */
      if (actor === 'demandeur' && quality === 'incomplet') return 'demandeur';
      return 'team';

    case 'complement':      return 'team';
    case 'commentaire':     return 'team';
    case 'escalade':        return 'team';  /* review → segment orange */
    case 'final_review':    return 'team';  /* final review → segment ambre */
    case 'validation':      return null;
    case 'refus':           return null;
    case 'reunion': {
      const ms = entry.meetingStatus || 'planned';
      if (ms === 'planned') return null;  /* réunion à venir → pas de ball */
      return 'team';  /* tenue ou annulée → team reprend */
    }
    default:                return 'team';
  }
}


/* ================================================================
   HELPERS — reviewDate milestone
================================================================ */

/**
 * Retourne la reviewDate active (string YYYY-MM-DD) ou null.
 * Même logique que reviewDateTagHtml() dans render-shared.js.
 */
function _tpFindActiveReviewDate(entries) {
  const log = entries || [];
  const candidates = log.filter(e => e.etype === 'escalade' && e.actor === 'team' && e.reviewDate);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const last = candidates[0];
  const hasFinalReview = log.some(
    e => e.etype === 'final_review' && (e.date || '') >= (last.date || '')
  );
  return hasFinalReview ? null : last.reviewDate;
}

/**
 * Calcule la position Y du milestone reviewDate dans le SVG.
 * Si reviewDate est entre deux entrées : interpolation linéaire.
 * Si reviewDate est après toutes les entrées : après la ligne today.
 * Si reviewDate est avant toutes les entrées : avant la première entrée.
 */
function _tpComputeMilestoneY(reviewDate, sortedEntries, padTop, spacingY, todayY, itemCount) {
  if (!reviewDate) return null;
  const dates = sortedEntries.map(e => (e.date || '').slice(0, 10));
  if (dates.length === 0) return padTop + 50;

  /* Avant toutes les entrées */
  if (reviewDate <= dates[0]) return padTop - spacingY / 2;

  /* Après toutes les entrées */
  if (reviewDate >= dates[dates.length - 1]) {
    const base = padTop + (itemCount - 1) * spacingY;
    return todayY !== null ? todayY + 50 : base + 50;
  }

  /* Entre deux entrées — interpolation */
  for (let i = 0; i < dates.length - 1; i++) {
    if (reviewDate >= dates[i] && reviewDate <= dates[i + 1]) {
      const d0 = parseInt(dates[i].replace(/-/g, ''), 10);
      const d1 = parseInt(dates[i + 1].replace(/-/g, ''), 10);
      const dr = parseInt(reviewDate.replace(/-/g, ''), 10);
      const t  = d1 > d0 ? (dr - d0) / (d1 - d0) : 0.5;
      return padTop + (i + t) * spacingY;
    }
  }
  return padTop + (itemCount - 1) * spacingY + 50;
}

/* ================================================================
   RENDER PRINCIPAL
================================================================ */
function tpRenderTimeline(entries) {
  const wrap = document.getElementById('tp-timeline-wrap');
  if (!wrap) return;

  if (!entries || entries.length === 0) {
    wrap.innerHTML =
      '<div class="tl-empty">' +
      '<span style="font-size:28px;opacity:0.5">📭</span>' +
      '<span>Aucun événement</span>' +
      '<span style="font-size:11px;opacity:0.6">Le journal est vide</span>' +
      '</div>';
    return;
  }

  const sorted = [...entries].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  /* ── Build nodes & flatten ── */
  const nodes = _tpBuildNodes(sorted);
  const items = _tpFlattenItems(nodes);

  /* ── Layout ── */
  const actorKeys = Object.keys(ACTORS);
  const colW      = Math.floor((wrap.clientWidth || 340) / actorKeys.length);
  const totalW    = colW * actorKeys.length;
  const centerX   = Math.round(totalW / 2);
  const padTop    = 30;
  const spacingY  = 56;
  const dotR      = 7;

  const actorX = {};
  actorKeys.forEach((k, i) => {
    actorX[k] = Math.round((i + 0.5) * colW);
  });

  /* Y position per item */
  const yPositions = items.map((_, i) => i * spacingY);
  const totalH = padTop + (items.length > 0 ? (items.length - 1) * spacingY : 0) + 60;

  /* ── Date bands (basées sur les entrées réelles) ── */
  const dateBands = [];
  let curDate = null, bandStart = 0;
  items.forEach((item, i) => {
    const d = item.type === 'entry' ? (item.entry.date || '').substring(0, 10) : null;
    if (d !== curDate) {
      if (curDate !== null) dateBands.push({ date: curDate, startIdx: bandStart, endIdx: i - 1 });
      curDate = d;
      bandStart = i;
    }
    if (i === items.length - 1) dateBands.push({ date: curDate, startIdx: bandStart, endIdx: i });
  });

  /* Ligne aujourd'hui */
  const todayStr = new Date().toISOString().substring(0, 10);
  let todayY = null;
  const lastEntryItem = [...items].reverse().find(it => it.type === 'entry');
  if (lastEntryItem) {
    const lastDate = (lastEntryItem.entry.date || '').substring(0, 10);
    if (todayStr > lastDate) {
      todayY = padTop + (items.length - 1) * spacingY + 50;
    }
  }

  /* ── Ball-in-court segments (entrées uniquement) ── */
  const ballSegments = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type !== 'entry') continue;

    const targetActor = _tpBallInCourt(item.entry);
    if (!targetActor || actorX[targetActor] === undefined) continue;

    const yStart   = padTop + yPositions[i];
    const nextItem = items[i + 1];
    let yEnd;
    if (nextItem) {
      yEnd = padTop + yPositions[i + 1];
    } else {
      yEnd = todayY !== null ? todayY : yStart + 30;
    }
    ballSegments.push({
      actor:  targetActor,
      etype:  item.entry.etype || '',
      x:      actorX[targetActor],
      yStart: yStart + dotR + 2,
      yEnd:   yEnd   - dotR - 2
    });
  }

  /* ── Header colonnes ── */
  let headerHtml = '<div class="tl-header">';
  actorKeys.forEach(k => {
    const a = ACTORS[k];
    headerHtml += `<div class="tl-col-head" style="color:${a.color};flex-basis:${colW}px;flex-shrink:0;">` +
      `<span style="font-size:16px">${a.emoji}</span><br>` +
      `<span style="font-size:10px;opacity:0.8">${a.label}</span></div>`;
  });
  headerHtml += '</div>';

  /* ── Milestone reviewDate — calculé avant svgH pour ajuster la hauteur ── */
  const _activeReviewDate  = _tpFindActiveReviewDate(entries);
  const reviewMilestoneY   = _activeReviewDate
    ? _tpComputeMilestoneY(_activeReviewDate, sorted, padTop, spacingY, todayY, items.length)
    : null;

  /* ── SVG ── */
  const _milestoneSvgH = reviewMilestoneY !== null ? reviewMilestoneY + 30 : 0;
  const svgH = Math.max(
    todayY && todayY + 40 > totalH ? todayY + 40 : totalH,
    _milestoneSvgH
  );
  let svg = `<svg width="${totalW}" height="${svgH}" style="display:block;overflow:visible">`;

  /* Defs */
  svg += '<defs>';
  svg += '<filter id="tl-glow" x="-50%" y="-50%" width="200%" height="200%">' +
         '<feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur"/>' +
         '<feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.35 0"/>' +
         '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  actorKeys.forEach(k => {
    const a = ACTORS[k];
    svg += `<linearGradient id="tl-guide-${k}" x1="0" y1="0" x2="0" y2="1">` +
           `<stop offset="0%" stop-color="${a.color}" stop-opacity="0.02"/>` +
           `<stop offset="50%" stop-color="${a.color}" stop-opacity="0.08"/>` +
           `<stop offset="100%" stop-color="${a.color}" stop-opacity="0.02"/>` +
           `</linearGradient>`;
  });
  svg += '</defs>';

  /* Bandes alternées dates */
  dateBands.forEach((band, bi) => {
    const y1 = padTop + yPositions[band.startIdx] - 20;
    const y2 = padTop + yPositions[band.endIdx] + 20;
    if (bi % 2 === 0) {
      svg += `<rect x="0" y="${y1}" width="${totalW}" height="${y2 - y1}" rx="4"` +
             ` fill="var(--text-muted)" opacity="0.03"/>`;
    }
  });

  /* Guides verticaux */
  actorKeys.forEach(k => {
    const x = actorX[k];
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${svgH}"` +
           ` stroke="url(#tl-guide-${k})" stroke-width="1"/>`;
  });

  /* ── Segments "ball in court" ────────────────────────────────────
     ambre  #F1C40F : final review
     orange #f59e42 : review (escalade)
     bleu   #42a5f5 : en attente du demandeur
     rouge  #e53935 : équipe dérog doit agir
  ─────────────────────────────────────────────────────────────── */
  ballSegments.forEach(seg => {
    const x = seg.x;
    if (seg.yEnd <= seg.yStart) return;

    const isFinalReview = seg.etype === 'final_review';
    const isReview      = seg.etype === 'escalade';
    const isExternal    = seg.actor === 'demandeur';
    const segColor      = isFinalReview ? '#F1C40F'
                        : isReview      ? '#f59e42'
                        : isExternal    ? '#42a5f5'
                        :                 '#e53935';
    const segClass      = 'tl-ball-segment ' +
      ((isFinalReview || isReview || isExternal) ? 'tl-ball-external' : 'tl-ball-internal');

    svg += `<rect x="${x - 5}" y="${seg.yStart}" width="10" height="${seg.yEnd - seg.yStart}"` +
           ` rx="5" fill="${segColor}" opacity="0.08" class="${segClass}"/>`;
    svg += `<line x1="${x}" y1="${seg.yStart}" x2="${x}" y2="${seg.yEnd}"` +
           ` stroke="${segColor}" stroke-width="2.5" opacity="0.30"` +
           ` stroke-linecap="round" class="${segClass}"/>`;
  });

  /* Ligne aujourd'hui */
  if (todayY !== null) {
    svg += `<line x1="0" y1="${todayY}" x2="${totalW}" y2="${todayY}"` +
           ` stroke="var(--danger)" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.5"/>`;
    svg += `<rect x="${totalW - 68}" y="${todayY - 10}" width="66" height="18" rx="9"` +
           ` fill="var(--danger)" opacity="0.12"/>`;
    svg += `<text x="${totalW - 35}" y="${todayY + 3}" text-anchor="middle" font-size="9" font-weight="700"` +
           ` fill="var(--danger)">Aujourd'hui</text>`;
  }

  /* ── Flèches entre items ── */
  for (let i = 0; i < items.length - 1; i++) {
    const item1 = items[i];
    const item2 = items[i + 1];

    /* x1 source — les réunions sont centrées */
    let x1, srcColor;
    if (item1.type === 'entry') {
      x1 = (item1.entry.etype === 'reunion') ? centerX : actorX[item1.entry.actor || 'team'];
      srcColor = (item1.entry.etype === 'reunion') ? '#8b5cf6'
               : (ACTORS[item1.entry.actor || 'team']?.color) || '#78909c';
    } else if (item1.type === 'group') {
      x1 = centerX;
      srcColor = '#78909c';
    } else {
      continue;  /* group-collapse → pas de flèche depuis */
    }

    /* x2 destination — les réunions sont centrées */
    let x2;
    if (item2.type === 'entry') {
      x2 = (item2.entry.etype === 'reunion') ? centerX : actorX[item2.entry.actor || 'team'];
    } else if (item2.type === 'group' || item2.type === 'group-collapse') {
      x2 = centerX;
    } else {
      continue;
    }

    const y1   = padTop + yPositions[i];
    const y2   = padTop + yPositions[i + 1];
    const yArr = y2 - dotR - 2;
    const cpY  = (y1 + 8 + yArr) / 2;

    if (x1 === x2) {
      svg += `<line x1="${x1}" y1="${y1 + 8}" x2="${x2}" y2="${yArr}"` +
             ` stroke="${srcColor}" stroke-width="1.5" opacity="0.35" stroke-dasharray="4,3"` +
             ` class="tl-arrow" style="--tl-delay:${i * 60}ms"/>`;
    } else {
      svg += `<path d="M${x1},${y1 + 8} C${x1},${cpY} ${x2},${cpY} ${x2},${yArr}"` +
             ` fill="none" stroke="${srcColor}" stroke-width="1.5" opacity="0.35" stroke-dasharray="4,3"` +
             ` class="tl-arrow" style="--tl-delay:${i * 60}ms"/>`;
    }
  }

  /* ── Items ── */
  items.forEach((item, i) => {
    const cy = padTop + yPositions[i];

    /* ── Entrée réunion : 2 bulles reliées ── */
    if (item.type === 'entry' && item.entry.etype === 'reunion') {
      const entry = item.entry;
      const ms    = entry.meetingStatus || 'planned';
      const xTeam = actorX['team']      !== undefined ? actorX['team']      : actorX[actorKeys[0]];
      const xDem  = actorX['demandeur'] !== undefined ? actorX['demandeur'] : actorX[actorKeys[actorKeys.length - 1]];
      const dateLabel = _tpFormatDateShort(entry.date);
      const snippet   = _tpTruncate(entry.text || '', 22);

      const dotColor = ms === 'held'      ? '#3FB950'
                     : ms === 'cancelled' ? '#ef5350'
                     : '#8b5cf6';
      const dotOpacity   = ms === 'planned' ? 0.55 : 1;
      const dashArray    = ms === 'planned' ? 'stroke-dasharray="3,2"' : '';
      const fillStyle    = ms === 'planned' ? 'none' : dotColor;
      const strokeStyle  = dotColor;

      svg += `<g class="tl-point-group tl-reunion-group" style="--tl-delay:${i * 60}ms">`;

      /* Halo large centré */
      svg += `<rect x="${Math.min(xTeam, xDem) - dotR - 8}" y="${cy - dotR - 8}"` +
             ` width="${Math.abs(xTeam - xDem) + (dotR + 8) * 2}" height="${(dotR + 8) * 2}"` +
             ` rx="${dotR + 8}" fill="${dotColor}" opacity="0.04"/>`;

      /* Ligne pointillée grise entre les deux bulles */
      svg += `<line x1="${xTeam + dotR}" y1="${cy}" x2="${xDem - dotR}" y2="${cy}"` +
             ` stroke="#78909c" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.45" style="pointer-events:none"/>`;

      /* Halo + cercle équipe */
      svg += `<circle cx="${xTeam}" cy="${cy}" r="${dotR + 4}" fill="${dotColor}" opacity="0.07"/>`;
      svg += `<circle cx="${xTeam}" cy="${cy}" r="${dotR}" fill="${fillStyle}" stroke="${strokeStyle}"` +
             ` stroke-width="2" ${dashArray} opacity="${dotOpacity}"` +
             ` style="cursor:pointer;stroke-${ms === 'planned' ? '' : 'var(--bg-surface);'}stroke-width:2"` +
             ` class="tl-dot" data-tl-idx="${i}"/>`;
      svg += `<text x="${xTeam}" y="${cy + 3.5}" text-anchor="middle" font-size="8" style="pointer-events:none;opacity:${dotOpacity}">` +
             `${ms === 'held' ? '✓' : ms === 'cancelled' ? '✗' : '📅'}</text>`;

      /* Halo + cercle demandeur */
      svg += `<circle cx="${xDem}" cy="${cy}" r="${dotR + 4}" fill="${dotColor}" opacity="0.07"/>`;
      svg += `<circle cx="${xDem}" cy="${cy}" r="${dotR}" fill="${fillStyle}" stroke="${strokeStyle}"` +
             ` stroke-width="2" ${dashArray} opacity="${dotOpacity}"` +
             ` style="cursor:pointer"` +
             ` class="tl-dot" data-tl-idx="${i}"/>`;
      svg += `<text x="${xDem}" y="${cy + 3.5}" text-anchor="middle" font-size="8" style="pointer-events:none;opacity:${dotOpacity}">` +
             `${ms === 'held' ? '✓' : ms === 'cancelled' ? '✗' : '📅'}</text>`;

      /* Label centré */
      const msLabel = ms === 'held' ? 'Tenue' : ms === 'cancelled' ? 'Annulée' : 'Planifiée';
      svg += `<text x="${centerX}" y="${cy - dotR - 7}" text-anchor="middle"` +
             ` font-size="9" font-weight="700" fill="${dotColor}" opacity="${dotOpacity + 0.2}"` +
             ` style="pointer-events:none">Réunion · ${msLabel}` +
             (dateLabel ? `  ${dateLabel}` : '') + `</text>`;
      if (snippet) {
        svg += `<text x="${centerX}" y="${cy + dotR + 13}" text-anchor="middle"` +
               ` font-size="9" fill="var(--text-muted)" opacity="0.55"` +
               ` style="pointer-events:none">${esc(snippet)}</text>`;
      }

      svg += '</g>';

    /* ── Entrée normale ── */
    } else if (item.type === 'entry') {
      const entry     = item.entry;
      const ci        = actorKeys.indexOf(entry.actor || 'team');
      const cx        = actorX[entry.actor || 'team'];
      const et        = ETYPES[entry.etype || 'commentaire'] || {};
      const color     = et.color || '#78909c';
      const dateLabel = _tpFormatDateShort(entry.date);
      const snippet   = _tpTruncate(entry.text || '', 26);
      const isSubmit  = (entry.etype === 'soumission');
      const isInGroup = !!item.inGroup;
      const quality   = entry.quality || null;
      const showQRing = entry.etype === 'reponse' && (entry.actor || 'team') === 'demandeur' && quality;

      svg += `<g class="tl-point-group${isInGroup ? ' tl-in-group' : ''}" style="--tl-delay:${i * 60}ms">`;

      /* Barre latérale pour entrées dans un groupe étendu */
      if (isInGroup) {
        svg += `<rect x="0" y="${cy - 22}" width="3" height="44" fill="#78909c" opacity="0.2" rx="2"/>`;
      }

      /* Anneau qualité (vert=complet, orange=incomplet) */
      if (showQRing) {
        const qColor = quality === 'complet' ? '#3FB950' : '#f59e42';
        svg += `<circle cx="${cx}" cy="${cy}" r="${dotR + 4}" fill="none"` +
               ` stroke="${qColor}" stroke-width="2.5" opacity="0.7" style="pointer-events:none"/>`;
      }

      /* Halos */
      svg += `<circle cx="${cx}" cy="${cy}" r="${dotR + 5}" fill="${color}" opacity="0.06" class="tl-halo"/>`;
      svg += `<circle cx="${cx}" cy="${cy}" r="${dotR + 2.5}" fill="${color}" opacity="0.1"/>`;

      /* Point */
      svg += `<circle cx="${cx}" cy="${cy}" r="${dotR}" fill="${color}" filter="url(#tl-glow)"` +
             ` style="cursor:pointer;stroke:var(--bg-surface);stroke-width:2"` +
             ` class="tl-dot" data-tl-idx="${i}"/>`;

      /* Anneau interne */
      svg += `<circle cx="${cx}" cy="${cy}" r="${dotR - 2.5}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="0.7"` +
             ` style="pointer-events:none"/>`;

      /* Emoji */
      svg += `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="8" style="pointer-events:none">` +
             `${et.emoji || '?'}</text>`;

      /* Labels : dernière colonne → gauche, autres → droite (inward) */
      const isLast = ci === actorKeys.length - 1;
      const labelX = isLast ? cx - dotR - 10 : cx + dotR + 10;
      const anchor = isLast ? 'end' : 'start';

      if (isSubmit) {
        svg += `<text x="${labelX}" y="${cy + 3}" text-anchor="${anchor}"` +
               ` font-size="10" font-weight="600" fill="${color}" opacity="0.7"` +
               ` style="pointer-events:none">${et.label}</text>`;
      } else {
        /* Chip reviewDate pour les entrées escalade */
        const hasReviewDate = entry.etype === 'escalade' && entry.reviewDate;
        svg += `<text x="${labelX}" y="${cy - 4}" text-anchor="${anchor}"` +
               ` font-size="10" font-weight="700" fill="${color}" opacity="0.85"` +
               ` style="pointer-events:none" font-family="JetBrains Mono,monospace">` +
               `${dateLabel}` +
               `<tspan fill="var(--text-secondary)" font-weight="500" font-size="10" dx="3">${et.label}</tspan>` +
               `</text>`;
        if (snippet) {
          svg += `<text x="${labelX}" y="${cy + 7}" text-anchor="${anchor}"` +
                 ` font-size="9" fill="var(--text-muted)" opacity="0.6"` +
                 ` style="pointer-events:none">${esc(snippet)}</text>`;
        }
        if (hasReviewDate) {
          const rdParts = entry.reviewDate.split('-');
          const rdDisp  = rdParts.length === 3 ? rdParts[2] + '/' + rdParts[1] : entry.reviewDate;
          svg += `<text x="${labelX}" y="${cy + 19}" text-anchor="${anchor}"` +
                 ` font-size="9" fill="#f59e42" opacity="0.85"` +
                 ` style="pointer-events:none">📅 Review · ${rdDisp}</text>`;
        }
      }

      svg += '</g>';

    /* ── Groupe réduit : bulle centrée cliquable ── */
    } else if (item.type === 'group') {
      const group     = item.group;
      const cx        = centerX;
      const pillW     = Math.min(totalW - 16, 180);
      const pillX     = cx - pillW / 2;
      const count     = group.entries.length;
      const gid       = group.id;
      const dStart    = _tpFormatDateShort(group.startDate);
      const dEnd      = _tpFormatDateShort(group.endDate);
      const dateRange = dStart === dEnd ? dStart : `${dStart} → ${dEnd}`;

      svg += `<g class="tl-group-bubble" onclick="tpToggleGroup('${gid}')" style="cursor:pointer">`;
      svg += `<title>${count} échange${count > 1 ? 's' : ''} — cliquer pour développer</title>`;
      /* Fond pill */
      svg += `<rect x="${pillX}" y="${cy - 18}" width="${pillW}" height="36" rx="18"` +
             ` fill="#78909c" opacity="0.12"/>`;
      svg += `<rect x="${pillX}" y="${cy - 18}" width="${pillW}" height="36" rx="18"` +
             ` fill="none" stroke="#78909c" stroke-width="1.5" opacity="0.4" stroke-dasharray="4,3"/>`;
      /* Icône */
      svg += `<text x="${pillX + 22}" y="${cy + 5}" text-anchor="middle" font-size="15"` +
             ` style="pointer-events:none">🔄</text>`;
      /* Compteur + label */
      svg += `<text x="${cx + 10}" y="${cy - 3}" text-anchor="middle" font-size="10" font-weight="700"` +
             ` fill="var(--text-secondary)" style="pointer-events:none">` +
             `${count} échange${count > 1 ? 's' : ''}</text>`;
      /* Plage de dates */
      svg += `<text x="${cx + 10}" y="${cy + 11}" text-anchor="middle" font-size="9"` +
             ` fill="var(--text-muted)" opacity="0.8" style="pointer-events:none">` +
             `${dateRange}</text>`;
      svg += '</g>';

    /* ── Bouton collapse centré ── */
    } else if (item.type === 'group-collapse') {
      const gid  = item.group.id;
      const cx   = centerX;
      const btnW = 90;
      svg += `<g onclick="tpToggleGroup('${gid}')" style="cursor:pointer">`;
      svg += `<rect x="${cx - btnW / 2}" y="${cy - 11}" width="${btnW}" height="22" rx="11"` +
             ` fill="#78909c" opacity="0.08"/>`;
      svg += `<rect x="${cx - btnW / 2}" y="${cy - 11}" width="${btnW}" height="22" rx="11"` +
             ` fill="none" stroke="#78909c" stroke-width="1" opacity="0.3"/>`;
      svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9"` +
             ` fill="var(--text-muted)" style="pointer-events:none">▲ Réduire</text>`;
      svg += '</g>';
    }
  });

  /* ── Milestone reviewDate ── */
  if (reviewMilestoneY !== null && reviewMilestoneY > 0) {
    const _rdParts  = _activeReviewDate.split('-');
    const _rdDisp   = _rdParts.length === 3 ? _rdParts[2] + '/' + _rdParts[1] : _activeReviewDate;
    const _rdToday  = new Date().toISOString().slice(0, 10);
    const _rdPast   = _activeReviewDate < _rdToday;
    const _rdColor  = _rdPast ? '#ef8c00' : '#f59e42';
    const _rdOpac   = _rdPast ? 0.55 : 0.75;
    /* Ligne pointillée */
    svg += `<line x1="0" y1="${reviewMilestoneY}" x2="${totalW}" y2="${reviewMilestoneY}"` +
           ` stroke="${_rdColor}" stroke-width="1.5" stroke-dasharray="6,4" opacity="${_rdOpac}"/>`;
    /* Étiquette */
    svg += `<rect x="4" y="${reviewMilestoneY - 10}" width="106" height="18" rx="9"` +
           ` fill="${_rdColor}" opacity="0.13"/>`;
    svg += `<text x="57" y="${reviewMilestoneY + 3}" text-anchor="middle" font-size="9" font-weight="700"` +
           ` fill="${_rdColor}" opacity="${_rdOpac + 0.1}">📅 À présenter · ${_rdDisp}</text>`;
  }

  svg += '</svg>';

  wrap.innerHTML = headerHtml + '<div class="tl-svg-wrap">' + svg + '</div>';

  /* ── Tooltip binding ── */
  wrap.querySelectorAll('.tl-dot').forEach(dot => {
    const idx  = parseInt(dot.getAttribute('data-tl-idx'), 10);
    const item = items[idx];
    if (item && item.type === 'entry') {
      dot.addEventListener('mouseenter', e => tpShowTip(e, item.entry));
      dot.addEventListener('mousemove', tpMoveTip);
      dot.addEventListener('mouseleave', tpHideTip);
    }
  });
}

/* ================================================================
   TOOLTIP
================================================================ */
function tpShowTip(e, entry) {
  const tip = tpGetTip();
  if (!tip) return;
  const actor = ACTORS[entry.actor || 'team'];
  const et    = ETYPES[entry.etype  || 'commentaire'];
  if (!actor || !et) return;

  const dateStr = entry.date ? _tpFormatDateShort(entry.date) : '';

  /* Badge qualité dans le tooltip */
  const qualityHtml = (entry.etype === 'reponse' && entry.actor === 'demandeur' && entry.quality)
    ? `<div style="margin-top:3px;font-size:11px;color:${entry.quality === 'complet' ? '#3FB950' : '#f59e42'};font-weight:600">` +
      `${entry.quality === 'complet' ? '✅ Complet' : '⚠️ Incomplet'}</div>`
    : '';

  /* Badge statut réunion dans le tooltip */
  const meetingHtml = (entry.etype === 'reunion')
    ? (() => {
        const ms = entry.meetingStatus || 'planned';
        const msLabel = ms === 'held' ? '✅ Tenue' : ms === 'cancelled' ? '✗ Annulée' : '📅 Planifiée';
        const msColor = ms === 'held' ? '#3FB950' : ms === 'cancelled' ? '#ef5350' : '#8b5cf6';
        return `<div style="margin-top:3px;font-size:11px;color:${msColor};font-weight:600">${msLabel}</div>`;
      })()
    : '';

  /* Chip reviewDate dans le tooltip */
  const reviewDateHtml = (entry.etype === 'escalade' && entry.reviewDate)
    ? (() => {
        const rdParts = entry.reviewDate.split('-');
        const rdDisp  = rdParts.length === 3 ? rdParts[2] + '/' + rdParts[1] : entry.reviewDate;
        return `<div style="margin-top:3px;font-size:11px;color:#f59e42;font-weight:600">📅 Review prévue · ${rdDisp}</div>`;
      })()
    : '';

  tip.innerHTML =
    '<div class="tp-tip-head">' +
      `<span class="tp-tip-emoji" style="background:${et.color}22;border:1px solid ${et.color}44">${et.emoji}</span>` +
      '<div class="tp-tip-head-text">' +
        `<div class="tp-tip-type" style="color:${et.color}">${et.label}</div>` +
        `<div class="tp-tip-actor"><span style="opacity:0.5">par</span> ${actor.emoji} ${actor.label}</div>` +
        qualityHtml +
        meetingHtml +
        reviewDateHtml +
      '</div>' +
      (dateStr ? `<span class="tp-tip-date">${dateStr}</span>` : '') +
    '</div>' +
    (entry.text ? `<div class="tp-tip-body">${esc(entry.text)}</div>` : '');

  tip.classList.add('show');
  tpMoveTip(e);
}

function tpMoveTip(e) {
  const tip = tpGetTip();
  if (!tip || !tip.classList.contains('show')) return;

  const pad = 16;
  let x = e.clientX + pad;
  let y = e.clientY + pad;

  const rect = tip.getBoundingClientRect();
  if (x + rect.width  > window.innerWidth  - 8) x = e.clientX - rect.width  - pad;
  if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;

  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function tpHideTip() {
  const tip = tpGetTip();
  if (tip) tip.classList.remove('show');
}
