/* ================================================================
   TICKET-TIMELINE.JS  v3.3 — Timeline visuelle SVG
   Préfixe tp_ pour tout (conventions ticket.html)
   Dépendances : constants.js (ACTORS, ETYPES, STATUSES), helpers.js (esc)
================================================================ */

let _tpTipEl = null;
function tpGetTip() {
  if (!_tpTipEl) _tpTipEl = document.getElementById('tp-tooltip');
  return _tpTipEl;
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
   "Ball in court" — après cet événement, qui doit agir ?
   Retourne la clé acteur dont la ligne verticale sera colorée, ou null.
   Couleur du segment : orange si review, ambre/or si final_review, bleu si demandeur, rouge sinon.
================================================================ */
function _tpBallInCourt(entry) {
  const etype = entry.etype || '';
  const actor = entry.actor || 'team';

  switch (etype) {
    case 'soumission':      return 'team';
    case 'analyse':         return 'team';

    case 'demande_info':
    case 'question':        // ← alias
      if (actor === 'demandeur') return 'team';
      return 'demandeur';  // team → demandeur

    case 'reponse_info':
    case 'reponse':         // ← alias
      return 'team';

    case 'complement':      return 'team';

    case 'commentaire':
      return 'team';

    case 'escalade':        return 'team';  // review en cours → segment orange
    case 'final_review':    return 'team';  // final review en cours → segment ambre

    case 'validation':      return null;
    case 'refus':           return null;
    default:                return 'team';
  }
}


/* ================================================================
   RENDER
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

  /* ── Layout ── */
  const actorKeys = Object.keys(ACTORS);
  const colW      = 120;
  const padLeft   = 130;   // espace pour les labels de la colonne gauche (demandeur)
  const totalW    = padLeft + actorKeys.length * colW;
  const padTop    = 30;
  const spacingY  = 56;
  const dotR      = 7;

  const actorX = {};
  actorKeys.forEach((k, i) => {
    actorX[k] = padLeft + Math.round(i * colW + colW / 2);
  });

  const yPositions = [];
  sorted.forEach((_, i) => { yPositions.push(i * spacingY); });
  const totalH = padTop + (sorted.length - 1) * spacingY + 60;

  /* ── Date bands ── */
  const dateBands = [];
  let curDate = null, bandStart = 0;
  sorted.forEach((e, i) => {
    const d = (e.date || '').substring(0, 10);
    if (d !== curDate) {
      if (curDate !== null) dateBands.push({ date: curDate, startIdx: bandStart, endIdx: i - 1 });
      curDate = d;
      bandStart = i;
    }
    if (i === sorted.length - 1) dateBands.push({ date: curDate, startIdx: bandStart, endIdx: i });
  });

  /* Aujourd'hui */
  const todayStr = new Date().toISOString().substring(0, 10);
  let todayY = null;
  const lastDate = (sorted[sorted.length - 1].date || '').substring(0, 10);
  if (todayStr > lastDate) {
    todayY = padTop + (sorted.length - 1) * spacingY + 50;
  }

  /* ── Ball-in-court : compute segments ── */
  // Pour chaque événement i, on calcule qui doit agir APRÈS cet événement
  // On trace un segment rouge vertical sur la colonne de cet acteur
  // depuis le point i jusqu'au point i+1
  const ballSegments = [];
  for (let i = 0; i < sorted.length; i++) {
    const targetActor = _tpBallInCourt(sorted[i]);
    if (!targetActor || actorX[targetActor] === undefined) continue;

    const yStart = padTop + yPositions[i];
    let yEnd;
    if (i < sorted.length - 1) {
      yEnd = padTop + yPositions[i + 1];
    } else {
      yEnd = todayY !== null ? todayY : yStart + 30;
    }
    ballSegments.push({
      actor: targetActor,
      etype: sorted[i].etype || '',   // pour déterminer la couleur
      x: actorX[targetActor],
      yStart: yStart + dotR + 2,
      yEnd: yEnd - dotR - 2
    });
  }

  /* ── Header ── */
  let headerHtml = '<div class="tl-header">';
  // Spacer gauche aligné sur padLeft pour les labels du demandeur
  headerHtml += `<div style="flex-basis:${padLeft}px;flex-shrink:0;"></div>`;
  actorKeys.forEach(k => {
    const a = ACTORS[k];
    headerHtml += `<div class="tl-col-head" style="color:${a.color};flex-basis:${colW}px;flex-shrink:0;">` +
      `<span style="font-size:16px">${a.emoji}</span><br>` +
      `<span style="font-size:10px;opacity:0.8">${a.label}</span></div>`;
  });
  headerHtml += '</div>';

  /* ── SVG ── */
  const svgH = todayY && todayY + 40 > totalH ? todayY + 40 : totalH;
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

  /* Guides verticaux (légers) */
  actorKeys.forEach(k => {
    const x = actorX[k];
    svg += `<line x1="${x}" y1="0" x2="${x}" y2="${svgH}"` +
           ` stroke="url(#tl-guide-${k})" stroke-width="1"/>`;
  });

  /* ── SEGMENTS "ball in court" ──────────────────────────────────────────
     ambre   #F1C40F : final review (etype final_review)
     orange  #f59e42 : review (etype escalade)
     bleu    #42a5f5 : en attente du demandeur (acteur externe)
     rouge   #e53935 : équipe dérog doit agir (interne)
  ─────────────────────────────────────────────────────────────────────── */
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
    const segClass      = 'tl-ball-segment ' + ((isFinalReview || isReview || isExternal) ? 'tl-ball-external' : 'tl-ball-internal');

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

  /* ── Flèches entre points ── */
  for (let i = 0; i < sorted.length - 1; i++) {
    const e1 = sorted[i], e2 = sorted[i + 1];
    const a1 = e1.actor || 'team', a2 = e2.actor || 'team';
    const x1 = actorX[a1], y1 = padTop + yPositions[i];
    const x2 = actorX[a2], y2 = padTop + yPositions[i + 1];
    const srcColor = (ACTORS[a1] && ACTORS[a1].color) || '#78909c';

    // Arrivée juste au-dessus du dot destination (bord du cercle)
    const yArr = y2 - dotR - 2;
    // S-curve symétrique sur la distance totale
    const cpY  = (y1 + 8 + yArr) / 2;

    if (x1 === x2) {
      svg += `<line x1="${x1}" y1="${y1 + 8}" x2="${x2}" y2="${yArr}"` +
            ` stroke="${srcColor}" stroke-width="1.5" opacity="0.35"` +
            ` stroke-dasharray="4,3"` +
            ` class="tl-arrow" style="--tl-delay:${i * 60}ms"/>`;
    } else {
      // Bezier cubique : départ horizontal depuis x1, arrivée horizontale sur x2
      svg += `<path d="M${x1},${y1 + 8} C${x1},${cpY} ${x2},${cpY} ${x2},${yArr}"` +
            ` fill="none" stroke="${srcColor}" stroke-width="1.5" opacity="0.35"` +
            ` stroke-dasharray="4,3"` +
            ` class="tl-arrow" style="--tl-delay:${i * 60}ms"/>`;
    }
  }



  /* ── Points + labels ── */
  sorted.forEach((entry, i) => {
    const ci    = actorKeys.indexOf(entry.actor || 'team');
    const cx    = actorX[entry.actor || 'team'];
    const cy    = padTop + yPositions[i];
    const et    = ETYPES[entry.etype || 'commentaire'] || {};
    const color = et.color || '#78909c';
    const dateLabel = _tpFormatDateShort(entry.date);
    const snippet   = _tpTruncate(entry.text || '', 26);
    const isSubmit  = (entry.etype === 'soumission');

    svg += `<g class="tl-point-group" style="--tl-delay:${i * 60}ms">`;

    /* Halos */
    svg += `<circle cx="${cx}" cy="${cy}" r="${dotR + 5}" fill="${color}" opacity="0.06" class="tl-halo"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="${dotR + 2.5}" fill="${color}" opacity="0.1"/>`;

    /* Point */
    svg += `<circle cx="${cx}" cy="${cy}" r="${dotR}" fill="${color}" filter="url(#tl-glow)"` +
           ` style="cursor:pointer;stroke:var(--bg-surface);stroke-width:2"` +
           ` class="tl-dot" data-tl-idx="${i}"/>`;

    /* Anneau */
    svg += `<circle cx="${cx}" cy="${cy}" r="${dotR - 2.5}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="0.7"` +
           ` style="pointer-events:none"/>`;

    /* Emoji */
    svg += `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="8" style="pointer-events:none">` +
           `${et.emoji || '?'}</text>`;

    /* ── Labels ── */
    // Première colonne (demandeur) → labels vers la gauche dans padLeft
    // Autres colonnes → labels vers la droite
    const isRight = ci > 0;
    const labelX  = isRight ? cx + dotR + 10 : cx - dotR - 10;
    const anchor  = isRight ? 'start' : 'end';

    if (isSubmit) {
      // Soumission : juste le mot "Soumission"
      svg += `<text x="${labelX}" y="${cy + 3}" text-anchor="${anchor}"` +
             ` font-size="10" font-weight="600" fill="${color}" opacity="0.7"` +
             ` style="pointer-events:none">${et.label}</text>`;
    } else {
      // Ligne 1 : date + type
      svg += `<text x="${labelX}" y="${cy - 4}" text-anchor="${anchor}"` +
             ` font-size="10" font-weight="700" fill="${color}" opacity="0.85"` +
             ` style="pointer-events:none" font-family="JetBrains Mono,monospace">` +
             `${dateLabel}` +
             `<tspan fill="var(--text-secondary)" font-weight="500" font-size="10" dx="3">${et.label}</tspan>` +
             `</text>`;

      // Ligne 2 : snippet
      if (snippet) {
        svg += `<text x="${labelX}" y="${cy + 7}" text-anchor="${anchor}"` +
               ` font-size="9" fill="var(--text-muted)" opacity="0.6"` +
               ` style="pointer-events:none">${esc(snippet)}</text>`;
      }

    }

    svg += '</g>';
  });

  svg += '</svg>';

  wrap.innerHTML = headerHtml + '<div class="tl-svg-wrap">' + svg + '</div>';

  /* ── Tooltip binding ── */
  wrap.querySelectorAll('.tl-dot').forEach(dot => {
    const idx = parseInt(dot.getAttribute('data-tl-idx'), 10);
    dot.addEventListener('mouseenter', e => tpShowTip(e, sorted[idx]));
    dot.addEventListener('mousemove', tpMoveTip);
    dot.addEventListener('mouseleave', tpHideTip);
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

  tip.innerHTML =
    '<div class="tp-tip-head">' +
      `<span class="tp-tip-emoji" style="background:${et.color}22;border:1px solid ${et.color}44">${et.emoji}</span>` +
      '<div class="tp-tip-head-text">' +
        `<div class="tp-tip-type" style="color:${et.color}">${et.label}</div>` +
        `<div class="tp-tip-actor"><span style="opacity:0.5">par</span> ${actor.emoji} ${actor.label}</div>` +
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
  if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;

  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
}

function tpHideTip() {
  const tip = tpGetTip();
  if (tip) tip.classList.remove('show');
}
