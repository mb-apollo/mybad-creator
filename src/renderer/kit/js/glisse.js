/* Effets « Liquid Glass » : une bulle de verre qui glisse sous l'élément actif (onglets, périodes, Liste/Calendrier), comme sur iOS.
   Le mouvement est un vrai ressort calculé à chaque image (pas une transition CSS), avec les paramètres relevés dans UIKit iOS 26 :
   soulèvement amortissement 0,625 / réponse 0,27 s ; retombée 0,7 / 0,5 s. Comme sur iOS :
   - dès qu'on touche une option, la bulle s'y soulève (UIKit : _tapSegmentAtPoint:touchDown: → setLifted) ; le choix est appliqué au relâchement ;
   - soulevée, elle s'étend de 8 pt de chaque côté (en hauteur elle dépasse un peu de la barre) et le libellé dessous grossit de 16 % ;
   - au repos c'est une capsule discrète ; elle s'étire avec sa vitesse (goutte d'eau) ;
   - elle ne sort jamais de la barre dans le sens du déplacement.
   Sur Safari/iPhone le libellé agrandi est une copie rangée dans la bulle ; sur Chromium (Windows) la vraie réfraction s'en charge (refraction.js).
   Aucune donnée n'est lue ici : que de la mise en page. */
(function () {
  // réglable par la page avant le chargement du script : window.GlisseConfig = { conteneurs: ".ma-barre, .mes-onglets", surfaces: ".ma-carte" } (design_kit/)
  var CFG = (typeof window !== "undefined" && window.GlisseConfig) || {};
  var LENT = CFG.lenteur > 0 ? CFG.lenteur : 1;   // 1 = ressorts d'Apple ; 1,6 = déplacements 60 % plus lents (réglable par la page : GlisseConfig.lenteur)
  var CONTENEURS = CFG.conteneurs || ".nav, .chips, .bascule";
  var SURFACES = CFG.surfaces || ".carte, .tuile, .hero";
  var ECHELLE = 1.25;   // agrandissement du libellé sous la bulle soulevée (rendu voulu par Axel : libellé nettement agrandi comme dans l'essai « lentille soulevée »)
  var SAILLIE = 8;      // soulevée, la bulle s'étend de 8 pt de chaque côté (UIKit : bounds avec un retrait de -8)
  var MARGE = 2;        // marge minimale entre la bulle et le bord de la barre, dans le sens du déplacement
  var DEBORD = 6;       // elle peut dépasser de la barre d'au plus 6 px dans l'autre sens (en hauteur sur un téléphone)
  var SEUIL_DOIGT = 8;  // un doigt qui bouge de moins que ça reste un simple appui
  var planifie = false, sansAnim = false;

  /** Ressort d'Apple : `reponse` = période (s) sans amortissement, `amortissement` = rapport d'amortissement. Masse 1 : k = ω², c = 2ζω. */
  function ressort(reponse, amortissement) {
    var w = 2 * Math.PI / reponse;
    return { k: w * w, c: 2 * amortissement * w, w: w, z: amortissement };
  }
  var LEVE = ressort(0.27, 0.625), POSE = ressort(0.5 * LENT, 0.7);
  /** Voyage d'une option à l'autre : plus la distance est grande, plus le ressort est lent (même rapport d'amortissement), pour que la bulle ne « parte » pas d'un bout à l'autre
      (traverser toute la barre : 0,3 s au lieu de 0,1 s, vitesse de pointe divisée par 3). Un déplacement d'une option garde presque le ressort d'Apple. */
  function ressortVoyage(distance, longueur) { return ressort((0.27 + 0.7 * limiter(distance / Math.max(1, longueur), 0, 1)) * LENT, 0.625); }

  /** Avance `m[pos]` / `m[vit]` de `dt` secondes vers `cible` : solution exacte d'un ressort amorti (pas d'erreur de calcul, quel que soit dt). */
  function pasRessort(m, pos, vit, cible, sp, dt) {
    var x0 = m[pos] - cible, v0 = m[vit], w = sp.w, z = sp.z, e = Math.exp(-z * w * dt);
    if (z < 1) {
      var wd = w * Math.sqrt(1 - z * z), cs = Math.cos(wd * dt), sn = Math.sin(wd * dt), b = (v0 + z * w * x0) / wd;
      m[pos] = cible + e * (x0 * cs + b * sn);
      m[vit] = e * (v0 * cs - (x0 * wd + z * w * b) * sn);
    } else { // amortissement critique
      var a = v0 + w * x0;
      m[pos] = cible + e * (x0 + a * dt);
      m[vit] = e * (v0 - w * a * dt);
    }
  }

  function limiter(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /** Taille et position de la bulle : s'étire avec la vitesse, s'étend quand elle est soulevée, reste dans la barre (elle peut dépasser un peu dans l'autre sens). */
  function geometrie(m) {
    var lev = limiter(m.lev, 0, 1.3), horiz = m.axe !== "y";
    var vit = Math.abs(horiz ? m.vx : m.vy), etire = Math.min(24, vit / 22), serre = Math.min(5, vit / 200);
    var w = m.bw + (horiz ? etire : -serre) + lev * 2 * SAILLIE;
    var h = m.bh + (horiz ? -serre : etire) + lev * 2 * SAILLIE;
    var dx = horiz ? 0 : DEBORD, dy = horiz ? DEBORD : 0;
    w = Math.min(w, m.L - 2 * (MARGE - dx));
    h = Math.min(h, m.H - 2 * (MARGE - dy));
    var left = limiter(m.x - w / 2, MARGE - dx, m.L - MARGE + dx - w);
    var top = limiter(m.y - h / 2, MARGE - dy, m.H - MARGE + dy - h);
    return { left: left, top: top, w: w, h: h, cx: left + w / 2, cy: top + h / 2 };
  }

  function aClasse(e, n) { return new RegExp("(^|\\s)" + n + "(\\s|$)").test(e.className || ""); }
  function ajouterClasse(e, n) { if (!aClasse(e, n)) e.className = ((e.className || "") + " " + n).trim(); }
  function retirerClasse(e, n) { e.className = (e.className || "").replace(new RegExp("(^|\\s)" + n + "(\\s|$)", "g"), " ").trim(); }
  /** Bulle posée : le vrai libellé caché sous elle est masqué (la copie agrandie le remplace) ; en mouvement il reste visible, adouci par le flou de la bulle. */
  function poser(m, oui) { if (oui) ajouterClasse(m.c, "pose"); else retirerClasse(m.c, "pose"); }

  function estActif(e) { return /(^|\s)actif(\s|$)/.test(e.className || ""); }
  /** Tous les enfants de la barre sauf la bulle (la copie en a besoin pour garder la même mise en page). */
  function enfantsSansBulle(c) {
    var r = [], enfants = c.children || [];
    for (var i = 0; i < enfants.length; i++) if (!/bulle-verre/.test(enfants[i].className || "")) r.push(enfants[i]);
    return r;
  }
  /** Les options de la barre (sans la bulle ni la marque « Mes agents » de la barre latérale). */
  function options(c) { return enfantsSansBulle(c).filter(function (e) { return !/(^|\s)marque(\s|$)/.test(e.className || ""); }); }
  function actifDe(conteneur) {
    var enfants = conteneur.children || [];
    for (var i = 0; i < enfants.length; i++) if (estActif(enfants[i])) return enfants[i];
    return null;
  }
  function bulleDe(conteneur) {
    var b = conteneur.querySelector(".bulle-verre");
    if (!b) {
      b = document.createElement("span");
      b.className = "bulle-verre";
      b.setAttribute("aria-hidden", "true");
      conteneur.insertBefore(b, conteneur.firstChild);
    }
    return b;
  }
  function mouvementReduit() { return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; }
  /** Nouvelle cible de la bulle (saut d'une option à l'autre) : le ressort du voyage dépend de la distance à parcourir. */
  function viser(m, tx, ty) {
    var horiz = m.axe !== "y";
    m.voyage = ressortVoyage(horiz ? Math.abs(tx - m.x) : Math.abs(ty - m.y), horiz ? m.L : m.H);
    m.tx = tx; m.ty = ty;
  }
  function centreDe(b) { return { x: b.offsetLeft + b.offsetWidth / 2, y: b.offsetTop + b.offsetHeight / 2 }; }

  /* ---- la copie des libellés rangée dans la bulle : même mise en page que la barre, sans identifiants (la page n'en doit avoir qu'un) ---- */
  function neutraliser(n) {
    if (n.removeAttribute) { n.removeAttribute("id"); n.removeAttribute("disabled"); n.setAttribute("tabindex", "-1"); }
    var avecId = n.querySelectorAll ? n.querySelectorAll("[id]") : [];
    for (var i = 0; i < avecId.length; i++) avecId[i].removeAttribute("id");
  }
  function copieDe(c, bulle) {
    if (typeof c.cloneNode !== "function" || typeof document.createElement !== "function" || typeof bulle.appendChild !== "function") return null;
    var enfants = enfantsSansBulle(c), sig = enfants.map(function (b) { return b.textContent; }).join("|") + "/" + c.offsetWidth + "x" + c.offsetHeight;
    if (bulle.copie && bulle.sigCopie === sig) return bulle.copie;
    var copie = bulle.copie;
    if (!copie) { copie = document.createElement("div"); copie.className = "copie"; copie.setAttribute("aria-hidden", "true"); bulle.appendChild(copie); bulle.copie = copie; }
    copie.textContent = "";
    enfants.forEach(function (b) { var n = b.cloneNode(true); neutraliser(n); copie.appendChild(n); });
    copie.style.width = c.offsetWidth + "px";
    copie.style.height = c.offsetHeight + "px";
    bulle.sigCopie = sig;
    ajouterClasse(c, "avec-copie");
    return copie;
  }

  /** Pendant le mouvement, efface les vrais libellés recouverts par la lentille (trou de masque de --ml à --mr dans chaque bouton) : la copie les remplace, jamais de dédoublement. */
  function masquer(m, g, enMarche) {
    if (!enMarche || !m.copieActive) { retirerClasse(m.c, "sous-lentille"); return; }
    ajouterClasse(m.c, "sous-lentille");
    var horiz = m.axe !== "y";
    if (horiz) retirerClasse(m.c, "vertical"); else ajouterClasse(m.c, "vertical"); // le masque suit l'axe (barre latérale verticale)
    var a = (horiz ? g.left : g.top) + 3, z = (horiz ? g.left + g.w : g.top + g.h) - 3, liste = m.liste || [];
    for (var i = 0; i < liste.length; i++) {
      var b = liste[i], o = horiz ? b.offsetLeft : b.offsetTop;
      if (b.style && typeof b.style.setProperty === "function") { b.style.setProperty("--ml", (a - o).toFixed(1) + "px"); b.style.setProperty("--mr", (z - o).toFixed(1) + "px"); }
    }
  }

  /** Écrit la position, la taille, le soulèvement et la copie de la bulle (même image, donc la copie ne dérive jamais). `enMarche` : la bulle bouge, on efface les libellés dessous. */
  function dessiner(m, enMarche) {
    var g = geometrie(m), b = m.bulle, lev = limiter(m.lev, 0, 1.3), s = 1 + (ECHELLE - 1) * lev;
    b.style.width = g.w + "px";
    b.style.height = g.h + "px";
    b.style.borderRadius = (Math.min(g.w, g.h) / 2) + "px";
    b.style.transform = "translate(" + g.left + "px," + g.top + "px)";
    if (typeof b.style.setProperty === "function") b.style.setProperty("--lev", limiter(m.lev, 0, 1).toFixed(3)); // le style (ombre, reflets, flou) suit le soulèvement
    if (b.copie) {
      // la copie, agrandie autour du centre de la bulle : le point sous le centre reste fixe, tout le reste s'écarte (translate puis scale, origine en haut à gauche)
      b.copie.style.transform = "translate(" + (-g.left + g.cx - s * g.cx) + "px," + (-g.top + g.cy - s * g.cy) + "px) scale(" + s + ")";
    }
    var reel = typeof Refraction !== "undefined" && Refraction.actif;
    if (reel) Refraction.lentille(b, g.w, g.h, m.lev); // Chromium : vraie réfraction
    m.copieActive = !!b.copie && !reel;
    masquer(m, g, enMarche);
    return g;
  }

  /* ---- boucle d'animation : une seule pour toutes les barres, elle s'arrête quand tout est posé ---- */
  var actifs = [], tourne = false, derniereImage = 0;
  function enMouvement(m) {
    return m.doigt || Math.abs(m.x - m.tx) > 0.25 || Math.abs(m.y - m.ty) > 0.25 || Math.abs(m.vx) > 2 || Math.abs(m.vy) > 2 ||
      Math.abs(m.lev - (m.leve ? 1 : 0)) > 0.01 || Math.abs(m.vlev) > 0.02;
  }
  function image(t) {
    var dt = derniereImage ? Math.min(0.032, Math.max(0.001, (t - derniereImage) / 1000)) : 0.016;
    derniereImage = t;
    var reste = [];
    actifs.forEach(function (m) {
      // soulevée pendant qu'on la tient ou qu'elle voyage, posée quand elle est arrivée
      var horiz = m.axe !== "y", ecart = horiz ? Math.abs(m.x - m.tx) : Math.abs(m.y - m.ty);
      m.leve = m.doigt || ecart > (horiz ? m.bw : m.bh) * 0.15;
      var sp = m.leve ? (m.voyage || LEVE) : POSE;
      pasRessort(m, "x", "vx", m.tx, sp, dt);
      pasRessort(m, "y", "vy", m.ty, sp, dt);
      pasRessort(m, "lev", "vlev", m.leve ? 1 : 0, m.leve ? LEVE : POSE, dt); // le soulèvement garde toujours son ressort
      dessiner(m, true);
      if (enMouvement(m)) reste.push(m);
      else { m.x = m.tx; m.y = m.ty; m.vx = 0; m.vy = 0; m.lev = 0; m.vlev = 0; dessiner(m, false); m.actif = false; poser(m, true); }
    });
    actifs = reste;
    if (actifs.length) planifierImage(); else { tourne = false; derniereImage = 0; }
  }
  function planifierImage() {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(image); else image(derniereImage + 16);
  }
  function demarrer(m) {
    poser(m, false);
    if (!m.actif) { m.actif = true; actifs.push(m); }
    if (!tourne) { tourne = true; derniereImage = 0; planifierImage(); }
  }

  /** Place la bulle sous l'élément actif : elle glisse (ressort) si elle était déjà placée, sinon elle apparaît directement. */
  function placer(conteneur, direct) {
    var cible = actifDe(conteneur), bulle = bulleDe(conteneur);
    if (!cible || !cible.offsetWidth) { bulle.style.opacity = "0"; bulle.pret = false; return; }
    copieDe(conteneur, bulle);
    var m = bulle.m;
    if (!m) m = bulle.m = { x: 0, y: 0, vx: 0, vy: 0, lev: 0, vlev: 0, tx: 0, ty: 0, bw: 0, bh: 0, L: 0, H: 0, axe: "x", leve: false, doigt: false, c: conteneur, bulle: bulle, actif: false };
    m.liste = options(conteneur);
    m.bw = cible.offsetWidth; m.bh = cible.offsetHeight;
    m.L = conteneur.offsetWidth || m.L; m.H = conteneur.offsetHeight || m.H;
    m.axe = m.L >= m.H ? "x" : "y";
    var c = centreDe(cible);
    bulle.style.opacity = "1";
    if (!bulle.pret || direct || mouvementReduit()) {
      m.tx = c.x; m.ty = c.y; m.x = c.x; m.y = c.y; m.vx = 0; m.vy = 0; m.lev = 0; m.vlev = 0;
      dessiner(m);
      bulle.pret = true;
      poser(m, !m.doigt);
      return;
    }
    if (m.doigt) return; // le doigt décide de la position tant qu'il est posé
    if (Math.abs(c.x - m.tx) > 0.25 || Math.abs(c.y - m.ty) > 0.25 || !m.actif) {
      viser(m, c.x, c.y);
      if (enMouvement(m)) demarrer(m); else dessiner(m);
    }
  }

  function tout() {
    var liste = document.querySelectorAll(CONTENEURS);
    for (var i = 0; i < liste.length; i++) placer(liste[i], sansAnim);
    sansAnim = false;
  }

  /** À appeler après un changement d'élément actif ; `direct` = sans animation (premier affichage, redimensionnement). */
  function replacer(direct) {
    if (direct) sansAnim = true;
    if (planifie) return;
    planifie = true;
    var lancer = typeof requestAnimationFrame === "function" ? requestAnimationFrame : function (f) { f(); };
    lancer(function () { planifie = false; tout(); });
  }

  /* ---- toucher et glisser : la bulle se soulève dès le toucher, suit le doigt, et le choix est appliqué au relâchement ---- */
  var doigt = null, ignorerClicJusqua = 0;
  function plusProche(boutons, p, horiz) {
    var meilleur = null, ecart = Infinity;
    boutons.forEach(function (b) {
      var d = Math.abs((horiz ? b.offsetLeft + b.offsetWidth / 2 : b.offsetTop + b.offsetHeight / 2) - p);
      if (d < ecart) { ecart = d; meilleur = b; }
    });
    return meilleur;
  }
  function marquer(boutons, cible) {
    boutons.forEach(function (b) {
      var sans = (b.className || "").replace(/(^|\s)actif(\s|$)/g, " ").trim();
      b.className = b === cible ? (sans + " actif").trim() : sans;
    });
  }
  function versOption(m, b) { var c = centreDe(b); viser(m, c.x, c.y); }
  function debutDoigt(e) {
    if (!e.target || typeof e.target.closest !== "function" || (e.pointerType === "mouse" && e.button)) return;
    var c = e.target.closest(CONTENEURS);
    if (!c || !c.offsetWidth || doigt) return;
    var bulle = bulleDe(c), m = bulle.m, actif = actifDe(c);
    if (!m || !actif || !bulle.pret) return;
    var horiz = m.axe !== "y", r = c.getBoundingClientRect(), liste = options(c);
    var p = horiz ? e.clientX - r.left : e.clientY - r.top, cible = plusProche(liste, p, horiz) || actif;
    doigt = { c: c, m: m, liste: liste, actif: actif, cible: cible, horiz: horiz, origine: horiz ? r.left : r.top, p0: horiz ? e.clientX : e.clientY, id: e.pointerId, bouge: false };
    m.doigt = true;                 // soulevée dès le toucher
    marquer(liste, cible);
    versOption(m, cible);           // elle rejoint l'option touchée
    if (mouvementReduit()) { m.x = m.tx; m.y = m.ty; dessiner(m); } else demarrer(m);
  }
  function suiteDoigt(e) {
    var g = doigt;
    if (!g || e.pointerId !== g.id) return;
    var brut = g.horiz ? e.clientX : e.clientY;
    if (!g.bouge && Math.abs(brut - g.p0) < SEUIL_DOIGT) return; // un simple appui reste un appui
    if (!g.bouge) g.m.voyage = LEVE; // le doigt qui glisse : la bulle le suit vivement
    g.bouge = true;
    var p = brut - g.origine;
    if (g.horiz) g.m.tx = p; else g.m.ty = p; // le centre cible suit le doigt (la bulle le rejoint en ressort)
    if (mouvementReduit()) { g.m.x = g.m.tx; g.m.y = g.m.ty; g.m.vx = 0; g.m.vy = 0; dessiner(g.m); }
    else demarrer(g.m);
    var cible = plusProche(g.liste, p, g.horiz);
    if (cible && cible !== g.cible) { g.cible = cible; marquer(g.liste, cible); }
  }
  function finDoigt(e, annule) {
    var g = doigt;
    if (!g || (e && e.pointerId !== undefined && g.id !== e.pointerId)) return;
    doigt = null;
    g.m.doigt = false;
    marquer(g.liste, g.actif);                       // on rend d'abord l'état d'origine ; l'appli applique le choix ensuite
    if (!annule && g.cible !== g.actif && !g.cible.disabled) g.cible.click();
    ignorerClicJusqua = Date.now() + 400;            // le clic natif qui suit n'est pas un second choix
    versOption(g.m, actifDe(g.c) || g.actif);        // la bulle retombe sous l'option réellement choisie
    demarrer(g.m);
    replacer(false);
  }

  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("resize", function () { replacer(true); });
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    // reflet qui suit la souris sur les cartes (pas au doigt : le survol n'existe pas)
    document.addEventListener("pointermove", function (e) {
      suiteDoigt(e);
      if (e.pointerType !== "mouse" || !e.target || typeof e.target.closest !== "function") return;
      var s = e.target.closest(SURFACES);
      if (!s) return;
      var r = s.getBoundingClientRect();
      s.style.setProperty("--lx", (e.clientX - r.left) + "px");
      s.style.setProperty("--ly", (e.clientY - r.top) + "px");
    }, { passive: true });
    document.addEventListener("pointerdown", function (e) { ignorerClicJusqua = 0; debutDoigt(e); }, { passive: true }); // un nouvel appui ne doit jamais être pris pour le clic du précédent
    document.addEventListener("pointerup", function (e) { finDoigt(e, false); }, { passive: true });
    document.addEventListener("pointercancel", function (e) { finDoigt(e, true); }, { passive: true });
    document.addEventListener("click", function (e) {
      if (Date.now() < ignorerClicJusqua) { if (e.stopPropagation) e.stopPropagation(); if (e.preventDefault) e.preventDefault(); }
    }, true);
  }

  window.Glisse = { replacer: replacer, placer: placer, tout: tout, ressort: ressort, pasRessort: pasRessort, geometrie: geometrie, LEVE: LEVE, POSE: POSE, ressortVoyage: ressortVoyage, ECHELLE: ECHELLE, SAILLIE: SAILLIE, DEBORD: DEBORD };
})();
