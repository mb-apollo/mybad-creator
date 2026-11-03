/* Transitions « à la Apple » : changements d'écran et d'onglet animés par des ressorts, interruptibles.
   Ce qu'Apple décrit (WWDC24 « Enhance your UI animations and transitions », consignes de design iOS) et qu'on reprend ici :
   - l'écran qui s'ouvre « sort » de l'endroit où l'on a appuyé et y retourne en se fermant (continuité spatiale : on sait d'où l'on vient) ;
   - les mouvements sont des ressorts (démarrage vif, arrivée longue et douce, aucun rebond gratuit), d'environ 0,5 s à l'ouverture et un peu moins à la fermeture ;
   - une transition peut être interrompue à tout moment (on rouvre pendant qu'on ferme) sans saut ni état bloqué ;
   - pas de mouvement pour le plaisir : « réduire les animations » (réglage de Windows) remplace tout par un simple fondu rapide.
   Le ressort est calculé une fois et donné au navigateur sous forme de courbe CSS linear() (Chromium sait l'animer sur le processeur graphique).
   Aucune donnée n'est lue ni envoyée : que de la mise en page. */
(function () {
  /** Courbe linear() d'un ressort amorti : 0 → 1 en `n` points. `amort` = rapport d'amortissement (1 = pas de rebond, 0,8 = très léger rebond). */
  function ressort(amort, n) {
    var w = 4.6 / amort, pts = [];                // pulsation choisie pour que le ressort soit posé à t = 1
    for (var i = 0; i <= n; i++) {
      var t = i / n, v;
      if (amort < 1) { var wd = w * Math.sqrt(1 - amort * amort); v = 1 - Math.exp(-amort * w * t) * (Math.cos(wd * t) + (amort * w / wd) * Math.sin(wd * t)); }
      else v = 1 - Math.exp(-w * t) * (1 + w * t);
      pts.push(+v.toFixed(4));
    }
    pts[n] = 1;
    return "linear(" + pts.join(", ") + ")";
  }
  var DOUX = ressort(0.9, 40), SEC = ressort(1, 32);
  var T_ENTREE = 560, T_SORTIE = 340, T_ONGLET = 460, T_ONGLET_SORTIE = 220;

  function reduit() { return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function anime(el, cles, opts) { try { return el.animate(cles, opts); } catch (e) { return null; } }
  function annuler(el) { var a = el.__anims; if (a) { a.forEach(function (x) { try { x.cancel(); } catch (e) { } }); } el.__anims = []; }
  function garder(el, a) { if (a) (el.__anims = el.__anims || []).push(a); return a; }

  /* ---- d'où part (et où revient) un écran : le dernier endroit où l'on a appuyé ---- */
  var dernier = { x: window.innerWidth / 2, y: window.innerHeight / 2, t: 0 };
  document.addEventListener("pointerdown", function (e) { dernier = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
  function origine(el) {
    if (Date.now() - dernier.t > 2500) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return { x: dernier.x, y: dernier.y };
  }
  function appliquerOrigine(el, o) { el.style.transformOrigin = o.x + "px " + o.y + "px"; }

  /** L'application derrière recule un peu pendant qu'un écran s'ouvre par-dessus (comme la page derrière une feuille iOS). */
  function fond(sens, duree, courbe) {
    var app = document.getElementById("app");
    if (!app || reduit()) return;
    var de = sens === "recule" ? { transform: "scale(1)", opacity: 1 } : { transform: "scale(.965)", opacity: .55 };
    var a = sens === "recule" ? { transform: "scale(.965)", opacity: .55 } : { transform: "scale(1)", opacity: 1 };
    anime(app, [de, a], { duration: duree, easing: courbe, fill: "none" });
  }

  /** Ouvre un écran plein format (déjà rendu visible) : il grossit depuis l'endroit touché. */
  function entrer(el) {
    annuler(el); el.__fermeture = (el.__fermeture || 0) + 1;     // annule une fermeture en cours
    el.style.pointerEvents = "";
    if (reduit()) { garder(el, anime(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: "ease-out" })); return; }
    var o = el.__origine = origine(el);
    appliquerOrigine(el, o);
    garder(el, anime(el, [{ transform: "scale(.9)" }, { transform: "scale(1)" }], { duration: T_ENTREE, easing: DOUX }));
    // l'écran apparaît en fondu un peu plus vite qu'il ne grandit : l'ouverture paraît plus nette
    garder(el, anime(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" }));
    fond("recule", T_ENTREE, DOUX);
  }

  /** Ferme un écran plein format : il rapetisse vers l'endroit d'où il est venu, puis `fin()` le cache pour de bon. */
  function sortir(el, fin) {
    var jeton = el.__fermeture = (el.__fermeture || 0) + 1;
    function terminer() { if (el.__fermeture !== jeton) return; annuler(el); el.style.pointerEvents = ""; fin(); }
    annuler(el);
    if (reduit()) { var r = anime(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }); if (r) { garder(el, r); r.onfinish = terminer; } else terminer(); return; }
    appliquerOrigine(el, el.__origine || origine(el));
    el.style.pointerEvents = "none";
    var a = anime(el, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.92)" }], { duration: T_SORTIE, easing: SEC, fill: "forwards" });
    if (!a) { terminer(); return; }
    garder(el, a); a.onfinish = terminer;
    fond("avance", T_SORTIE, SEC);
  }

  /* ---- fenêtres de dialogue : la carte se pose avec un ressort, le voile apparaît en fondu ---- */
  function fenetreEntrer(modal) {
    var carte = modal.querySelector(".modal-card");
    annuler(modal); if (carte) annuler(carte); modal.__fermeture = (modal.__fermeture || 0) + 1; modal.__sortant = false;
    if (reduit()) { garder(modal, anime(modal, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 })); return; }
    garder(modal, anime(modal, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" }));
    if (carte) garder(carte, anime(carte, [{ opacity: 0, transform: "translateY(14px) scale(.94)" }, { opacity: 1, transform: "none" }], { duration: T_ENTREE - 60, easing: DOUX }));
  }
  function fenetreSortir(modal, fin) {
    var carte = modal.querySelector(".modal-card"), jeton = modal.__fermeture = (modal.__fermeture || 0) + 1;
    modal.__sortant = true;
    function terminer() { if (modal.__fermeture !== jeton) return; modal.__sortant = false; annuler(modal); if (carte) annuler(carte); fin(); }
    annuler(modal); if (carte) annuler(carte);
    var d = reduit() ? 90 : 200;
    var a = anime(modal, [{ opacity: 1 }, { opacity: 0 }], { duration: d, easing: "ease-in", fill: "forwards" });
    if (!a) { terminer(); return; }
    garder(modal, a); a.onfinish = terminer;
    if (carte && !reduit()) garder(carte, anime(carte, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: d, easing: "ease-in", fill: "forwards" }));
  }

  /* ---- onglets : l'ancien contenu s'efface en glissant d'un cran, le nouveau arrive du côté d'où l'on vient (ordre des onglets) ---- */
  function onglet(ancien, nouveau, sens, defile) {
    if (!nouveau || reduit()) { if (nouveau) anime(nouveau, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 }); return; }
    annuler(nouveau);
    var dx = (sens || 1) * 26;
    garder(nouveau, anime(nouveau, [{ opacity: 0, transform: "translateX(" + dx + "px)" }, { opacity: 1, transform: "none" }], { duration: T_ONGLET, easing: DOUX }));
    // l'ancien contenu : une copie figée qui s'efface, sans toucher à l'original (qui est déjà caché)
    if (ancien && ancien.parentNode) {
      var p = ancien.parentNode, rp = p.getBoundingClientRect(), ra = nouveau.getBoundingClientRect();
      var copie = ancien.cloneNode(true);
      copie.removeAttribute("id"); copie.hidden = false; copie.setAttribute("aria-hidden", "true");
      Array.prototype.forEach.call(copie.querySelectorAll("[id]"), function (n) { n.removeAttribute("id"); });
      copie.style.cssText = "position:absolute;pointer-events:none;overflow:hidden;z-index:2;left:" + (ra.left - rp.left + p.scrollLeft) + "px;top:" + (ra.top - rp.top + p.scrollTop) + "px;width:" + ra.width + "px;height:" + ra.height + "px;";
      var pos = getComputedStyle(p).position; if (pos === "static") p.style.position = "relative";
      p.appendChild(copie);
      copie.scrollTop = defile || 0;
      var a = anime(copie, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(" + (-dx * .6) + "px)" }], { duration: T_ONGLET_SORTIE, easing: "ease-in", fill: "forwards" });
      if (a) a.onfinish = function () { copie.remove(); }; else copie.remove();
    }
  }

  /* ---- menus (Exporter…) : ils se déploient depuis leur coin, en ressort, dès qu'ils sont affichés ---- */
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      var el = m.target;
      if (m.attributeName !== "hidden" || el.hidden || !el.classList || !el.classList.contains("menu") || reduit()) return;
      annuler(el); el.style.transformOrigin = "top right";
      garder(el, anime(el, [{ opacity: 0, transform: "translateY(-8px) scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: DOUX }));
    });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["hidden"], subtree: true });

  /* ---- interrupteurs : l'application reconstruit le panneau à chaque réglage, donc le nouvel interrupteur naît déjà dans son état final et ne glisse jamais.
     On retient l'état d'avant, et sur le nouvel interrupteur on repart de cet état avant de passer au nouveau : la pastille glisse. ---- */
  var attente = {};
  function cle(i) { var l = i.closest ? i.closest("label") : null; return (i.getAttribute("data-path") || i.getAttribute("data-c") || i.id || "") + "|" + (l ? l.textContent.trim() : ""); }
  document.addEventListener("change", function (e) {
    var i = e.target;
    if (!i || !i.matches || !i.matches(".toggle input[type=checkbox]")) return;
    attente[cle(i)] = { avant: !i.checked, t: Date.now() };
  }, true);
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      Array.prototype.forEach.call(m.addedNodes, function (n) {
        if (n.nodeType !== 1) return;
        var liste = n.matches && n.matches(".toggle input") ? [n] : (n.querySelectorAll ? n.querySelectorAll(".toggle input[type=checkbox]") : []);
        Array.prototype.forEach.call(liste, function (i) {
          var k = cle(i), a = attente[k];
          if (!a || Date.now() - a.t > 1500 || i.checked === a.avant) return;
          delete attente[k];
          var cible = i.checked;
          i.checked = a.avant;           // on repart de l'ancien état…
          void i.offsetWidth;            // …le navigateur le prend en compte…
          i.checked = cible;             // …puis la transition CSS joue vers le nouveau
        });
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  window.Transitions = { entrer: entrer, sortir: sortir, fenetreEntrer: fenetreEntrer, fenetreSortir: fenetreSortir, onglet: onglet, ressort: ressort };
})();
