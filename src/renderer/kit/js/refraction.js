/* Vraie réfraction du verre, seulement sur les moteurs Chromium (Windows, Chrome, Edge) : Safari et l'iPhone ne dessinent pas un filtre SVG
   dans un flou d'arrière-plan (testé sur iPhone) ; là-bas l'appli garde la loupe en CSS (voir glisse.js).
   Principe (kube.io, loi de Snell-Descartes) : un bord de verre convexe plie les rayons qui entrent. Pour chaque pixel on calcule de combien le
   point vu est déplacé vers l'intérieur, on range ces déplacements dans une image (rouge = x, vert = y, 128 = aucun), et un filtre SVG
   (feDisplacementMap) l'applique à ce qui se trouve derrière l'élément. Aucune donnée n'est lue ici : que de la mise en page. */
(function () {
  var NS = "http://www.w3.org/2000/svg";
  var DENSITE = 2;          // pixels de la carte par pixel d'écran
  var N2 = 1.5;             // indice de réfraction du verre
  var filtres = {}, compteur = 0, minuteurs = {};

  /** Moteur qui sait appliquer un filtre SVG dans un flou d'arrière-plan : Chromium de bureau seulement. */
  function moteurReel(ua) {
    ua = ua || (typeof navigator !== "undefined" ? navigator.userAgent : "") || "";
    if (/iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS|Firefox|Android|Mobile/.test(ua)) return false;
    return /Chrome\/|Chromium\/|Edg\//.test(ua);
  }

  /** Hauteur du verre (0 au bord, 1 à la fin du biseau) : « squircle » convexe, doux même quand la forme est étirée. */
  function profil(x) {
    x = Math.min(1, Math.max(0, x));
    return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
  }
  /** Déplacement latéral (en pixels) d'un rayon qui entre à la distance normalisée x du bord (Snell-Descartes, air → verre). */
  function deplacement(x, epaisseur, biseau) {
    var xx = Math.max(x, 0.18), d = 0.001; // pente plafonnée au tout bord (sinon la déformation devient infinie)
    var pente = (profil(xx + d) - profil(xx - d)) / (2 * d) * (epaisseur / biseau);
    var th1 = Math.atan(Math.abs(pente)), th2 = Math.asin(Math.min(1, Math.sin(th1) / N2));
    return epaisseur * Math.tan(th1 - th2);
  }

  /**
   * Carte de déplacement d'un rectangle arrondi de verre convexe (w × h pixels d'écran, coins de rayon `rayon`).
   * Options : biseau (largeur du bord réfracteur, en part du rayon), epaisseur (épaisseur du verre, en part du rayon), zoom (agrandissement du centre, ex. 0,2).
   * Retourne { W, H, donnees (RGBA), max } ; `max` = déplacement maximal en pixels d'écran.
   */
  function carte(w, h, rayon, o) {
    o = o || {};
    var dens = o.densite || DENSITE, W = Math.max(1, Math.ceil(w * dens)), H = Math.max(1, Math.ceil(h * dens));
    var r = Math.max(1, Math.min(rayon, w / 2, h / 2) * dens);
    var biseau = r * (o.biseau || 0.7), epaisseur = r * (o.epaisseur || 0.5), zf = (o.zoom || 0) / (1 + (o.zoom || 0));
    var table = [], i;
    for (i = 0; i <= 64; i++) table.push(deplacement(i / 64, epaisseur, biseau)); // déplacement selon la profondeur normalisée
    var hw = W / 2, hh = H / 2, dx = new Float32Array(W * H), dy = new Float32Array(W * H), max = 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var px = x + 0.5 - hw, py = y + 0.5 - hh;
        var qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
        var dehors = Math.sqrt(Math.max(qx, 0) * Math.max(qx, 0) + Math.max(qy, 0) * Math.max(qy, 0));
        var sdf = dehors + Math.min(Math.max(qx, qy), 0) - r; // négatif à l'intérieur de la forme
        var k = y * W + x;
        if (sdf > 0) continue;
        var gx, gy; // direction vers l'extérieur (gradient de la distance)
        if (qx > 0 && qy > 0 && dehors > 0) { gx = (px < 0 ? -1 : 1) * qx / dehors; gy = (py < 0 ? -1 : 1) * qy / dehors; }
        else if (qx > qy) { gx = px < 0 ? -1 : 1; gy = 0; }
        else { gx = 0; gy = py < 0 ? -1 : 1; }
        var t = -sdf / biseau, m = t < 1 ? table[Math.round(t * 64)] : 0; // déplacement du bord, vers l'intérieur
        var vx = -gx * m - px * zf, vy = -gy * m - py * zf;                 // + agrandissement du centre
        dx[k] = vx; dy[k] = vy;
        var a = Math.max(Math.abs(vx), Math.abs(vy));
        if (a > max) max = a;
      }
    }
    var donnees = new Uint8ClampedArray(W * H * 4), n = max || 1;
    for (i = 0; i < W * H; i++) {
      donnees[i * 4] = Math.round(128 + 127 * dx[i] / n);
      donnees[i * 4 + 1] = Math.round(128 + 127 * dy[i] / n);
      donnees[i * 4 + 2] = 128;
      donnees[i * 4 + 3] = 255;
    }
    return { W: W, H: H, donnees: donnees, max: max / dens };
  }

  function versURL(c) {
    var cv = document.createElement("canvas");
    cv.width = c.W; cv.height = c.H;
    var g = cv.getContext("2d"), img = g.createImageData(c.W, c.H);
    img.data.set(c.donnees);
    g.putImageData(img, 0, 0);
    return cv.toDataURL("image/png");
  }

  /** Crée (ou retrouve) le filtre SVG d'une forme : retourne { id, de (le feDisplacementMap), echelle (valeur d'échelle pour le déplacement maximal) }. */
  function filtre(w, h, rayon, o) {
    o = o || {};
    var q = o.quantum || 2, wq = Math.ceil(w / q) * q, hq = Math.ceil(h / q) * q, rq = Math.min(Math.round(rayon), wq / 2, hq / 2);
    var cle = [o.prive || "", wq, hq, rq, o.zoom || 0, o.biseau || 0, o.epaisseur || 0].join("_");
    if (filtres[cle]) return filtres[cle];
    var svg = document.getElementById("defs-refraction");
    if (!svg) return null;
    var c = carte(wq, hq, rq, o), id = "refr-" + (compteur++);
    var f = document.createElementNS(NS, "filter");
    f.setAttribute("id", id);
    f.setAttribute("filterUnits", "userSpaceOnUse");
    f.setAttribute("x", "0"); f.setAttribute("y", "0"); f.setAttribute("width", String(wq)); f.setAttribute("height", String(hq));
    f.setAttribute("color-interpolation-filters", "sRGB");
    var im = document.createElementNS(NS, "feImage"), url = versURL(c);
    im.setAttribute("href", url);
    im.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
    im.setAttribute("x", "0"); im.setAttribute("y", "0"); im.setAttribute("width", String(wq)); im.setAttribute("height", String(hq));
    im.setAttribute("result", "carte");
    var de = document.createElementNS(NS, "feDisplacementMap");
    de.setAttribute("in", "SourceGraphic"); de.setAttribute("in2", "carte");
    de.setAttribute("xChannelSelector", "R"); de.setAttribute("yChannelSelector", "G");
    var echelle = c.max * 255 / 127; // R = 128 + 127·v : un déplacement d'au plus `max` pixels
    de.setAttribute("scale", echelle.toFixed(2));
    f.appendChild(im); f.appendChild(de);
    svg.appendChild(f);
    filtres[cle] = { id: id, de: de, echelle: echelle };
    return filtres[cle];
  }

  var actif = false;
  var LENTILLE = { zoom: 0.14, biseau: 0.7, epaisseur: 0.55, quantum: 3 };
  var uid = 0;

  /** La bulle : filtre de réfraction propre à chaque bulle, d'intensité proportionnelle à son « soulèvement » (0 au repos, 1 soulevée). */
  function lentille(bulle, w, h, lev) {
    if (!actif) return;
    if (!bulle.refrUid) bulle.refrUid = "b" + (uid++);
    var f = filtre(w, h, Math.min(w, h) / 2, { zoom: LENTILLE.zoom, biseau: LENTILLE.biseau, epaisseur: LENTILLE.epaisseur, quantum: LENTILLE.quantum, prive: bulle.refrUid });
    if (!f) return;
    if (bulle.refrId !== f.id) {
      bulle.refrId = f.id;
      var v = "url(#" + f.id + ") saturate(1.7) brightness(1.1)";
      bulle.style.backdropFilter = v;
      bulle.style.webkitBackdropFilter = v;
    }
    f.de.setAttribute("scale", (f.echelle * Math.max(0, Math.min(1, lev))).toFixed(2));
  }

  /** Les barres, pastilles et boutons de verre : réfraction des bords, posée via la variable --refr (lue par style.css). */
  function appliquer(el) {
    var w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h || w * h > 70000) return; // les grandes surfaces coûteraient trop à chaque image
    var r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || Math.min(w, h) / 2;
    var f = filtre(w, h, r, { biseau: 0.55, epaisseur: 0.4, quantum: 2 });
    if (f) el.style.setProperty("--refr", "url(#" + f.id + ")");
  }
  function surveiller() {
    if (!actif || typeof document === "undefined") return;
    var cfg = (typeof window !== "undefined" && window.RefractionConfig) || {};  // window.RefractionConfig = { cibles: ".verre, .ma-barre" } pour un autre projet
    var cibles = document.querySelectorAll(cfg.cibles || ".verre, .barre-sel, button.principal, .barre-envoi button");
    var obs = typeof ResizeObserver === "function" ? new ResizeObserver(function (entrees) {
      entrees.forEach(function (e) { // une pastille qui change de largeur : on attend qu'elle se pose avant de recalculer
        var el = e.target;
        clearTimeout(minuteurs[el.id || el.className]);
        minuteurs[el.id || el.className] = setTimeout(function () { appliquer(el); }, 120);
      });
    }) : null;
    for (var i = 0; i < cibles.length; i++) { if (obs) obs.observe(cibles[i]); appliquer(cibles[i]); }
  }

  function demarrer() {
    if (typeof document === "undefined" || !moteurReel()) return;
    actif = true;
    window.Refraction.actif = true;
    if (document.documentElement && document.documentElement.classList) document.documentElement.classList.add("refraction");
    surveiller();
  }

  window.Refraction = { reglages: LENTILLE, actif: false, moteurReel: moteurReel, carte: carte, deplacement: deplacement, profil: profil, lentille: lentille, appliquer: appliquer, surveiller: surveiller, demarrer: demarrer };
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
  }
})();
