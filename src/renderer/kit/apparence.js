/* Panneau « Apparence » : permet de régler à la main le verre (clair ou fumé), les fonds, les couleurs et les transparences, et de voir le résultat en direct.
   Les réglages sont gardés sur cet ordinateur. Le bouton « Copier ma configuration » donne un texte à envoyer : il servira de réglage par défaut du logiciel, et ce panneau pourra alors disparaître.
   Tout passe par des variables CSS posées sur <html> (--ap-*, --da-*) : la feuille kit/creator.css les lit, avec pour valeur de secours l'aspect actuel du logiciel. */
(function () {
  var CLE = "mbc.apparence.v1";
  var racine = document.documentElement;

  /* valeurs d'origine = l'aspect actuel du logiciel (rien ne change tant qu'on ne touche à rien) */
  var DEF = {
    fume: false,
    fond1: "#03071a", fond2: "#050d26", fond3: "#040920",
    h1c: "#1450c8", h1f: 30, h2c: "#1e78e6", h2f: 17, h3c: "#2d3cb9", h3f: 28,
    tTeinte: "#a8c8ff", tReflet: 100, tVoileC: "#04081a", tVoile: 7, tFlou: 22, tLum: 1, tSat: 1.4,
    bTeinte: "#9cc4ff", bVoile: 38, bFlou: 10, bLum: 0.82,
    fOpac: 54, fFlou: 38,
    accent: "#54d8ff", texte: "#e8ebfa", doux: "#a5abcb", lisere: 80
  };
  /* ce que change l'interrupteur « Verre fumé » : tuiles et barres plus sombres et plus floues, reflets plus discrets (comme dans l'appli téléphone) */
  var PRESETS = {
    clair: { tVoile: 7, tFlou: 22, tLum: 1, tSat: 1.4, tReflet: 100, bVoile: 38, bLum: 0.82 },
    fume: { tVoile: 52, tFlou: 34, tLum: 0.85, tSat: 1.5, tReflet: 65, bVoile: 56, bLum: 0.72 }
  };

  function couleur(k, label) { return { type: "couleur", k: k, label: label }; }
  function curseur(k, label, min, max, pas, unite, dec) { return { type: "curseur", k: k, label: label, min: min, max: max, pas: pas, unite: unite || "", dec: dec || 0 }; }
  var SECTIONS = [
    { titre: "Fond de la fenêtre", ouvert: true, items: [
      couleur("fond1", "Haut"), couleur("fond2", "Milieu"), couleur("fond3", "Bas"),
      couleur("h1c", "Lueur 1 (haut gauche) : couleur"), curseur("h1f", "Lueur 1 : intensité", 0, 100, 1, " %"),
      couleur("h2c", "Lueur 2 (droite) : couleur"), curseur("h2f", "Lueur 2 : intensité", 0, 100, 1, " %"),
      couleur("h3c", "Lueur 3 (bas) : couleur"), curseur("h3f", "Lueur 3 : intensité", 0, 100, 1, " %")
    ] },
    { titre: "Tuiles (panneaux, outils, zone de travail)", ouvert: true, items: [
      curseur("tVoile", "Voile sombre derrière le verre", 0, 85, 1, " %"),
      curseur("tFlou", "Flou", 0, 60, 1, " px"),
      curseur("tLum", "Luminosité derrière le verre", 0.4, 1.4, 0.01, "", 2),
      curseur("tSat", "Couleurs derrière le verre (saturation)", 0.8, 2.6, 0.05, "", 2),
      curseur("tReflet", "Reflets du verre (tuiles et barres)", 0, 300, 5, " %"),
      couleur("tTeinte", "Teinte des reflets des tuiles"),
      couleur("tVoileC", "Couleur du voile (tuiles, barres, champs)")
    ] },
    { titre: "Barres et boutons de verre (en haut)", ouvert: false, items: [
      curseur("bVoile", "Voile sombre derrière le verre", 0, 85, 1, " %"),
      curseur("bFlou", "Flou", 0, 40, 1, " px"),
      curseur("bLum", "Luminosité derrière le verre", 0.4, 1.4, 0.01, "", 2),
      couleur("bTeinte", "Teinte des reflets")
    ] },
    { titre: "Fenêtres, menus et notifications", ouvert: false, items: [
      curseur("fOpac", "Opacité du fond (plus haut = plus sombre)", 0, 98, 1, " %"),
      curseur("fFlou", "Flou", 0, 60, 1, " px")
    ] },
    { titre: "Couleurs du logiciel et liseré", ouvert: false, items: [
      couleur("accent", "Couleur principale (boutons, curseurs, choix)"),
      couleur("texte", "Texte"), couleur("doux", "Texte secondaire"),
      curseur("lisere", "Liseré lumineux des bords", 0, 100, 1, " %")
    ] }
  ];

  function copie(o) { return JSON.parse(JSON.stringify(o)); }
  function lire() {
    var etat = copie(DEF);
    try {
      var s = JSON.parse(localStorage.getItem(CLE) || "null");
      if (s && typeof s === "object") Object.keys(DEF).forEach(function (k) { if (s[k] !== undefined && typeof s[k] === typeof DEF[k]) etat[k] = s[k]; });
    } catch (e) { }
    return etat;
  }
  var etat = lire();
  var cote = "droite";
  function garder() { try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) { } }

  /* pose toutes les variables CSS d'après l'état */
  function appliquer() {
    var s = racine.style, v = etat;
    s.setProperty("--ap-fond-1", v.fond1); s.setProperty("--ap-fond-2", v.fond2); s.setProperty("--ap-fond-3", v.fond3);
    s.setProperty("--da-halo-1", "color-mix(in srgb, " + v.h1c + " " + v.h1f + "%, transparent)");
    s.setProperty("--da-halo-2", "color-mix(in srgb, " + v.h2c + " " + v.h2f + "%, transparent)");
    s.setProperty("--da-halo-3", "color-mix(in srgb, " + v.h3c + " " + v.h3f + "%, transparent)");
    s.setProperty("--ap-teinte", v.tTeinte); s.setProperty("--ap-k", String(v.tReflet / 100));
    s.setProperty("--ap-voile-c", v.tVoileC); s.setProperty("--da-fond", v.tVoileC);
    s.setProperty("--ap-voile", v.tVoile + "%"); s.setProperty("--ap-flou", v.tFlou + "px");
    s.setProperty("--ap-lum", String(v.tLum)); s.setProperty("--ap-sat", String(v.tSat));
    s.setProperty("--ap-teinte-b", v.bTeinte); s.setProperty("--da-voile-force", v.bVoile + "%");
    s.setProperty("--da-luminosite", String(v.bLum));
    s.setProperty("--v-flou", "blur(" + v.bFlou + "px) saturate(1.8) brightness(var(--da-luminosite))");
    s.setProperty("--ap-fenetre", v.fOpac + "%"); s.setProperty("--ap-fenetre-flou", v.fFlou + "px");
    s.setProperty("--da-accent", v.accent); s.setProperty("--da-texte", v.texte); s.setProperty("--da-doux", v.doux);
    s.setProperty("--ap-lisere", String(v.lisere / 100));
    racine.classList.toggle("fume", !!v.fume);
  }
  appliquer();

  /* ---------- le panneau ---------- */
  var panneau = null, bouton = null, refs = {}, zoneTexte = null, boutonCopie = null;

  function el(tag, classe, texte) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }
  function formater(it, v) { return (it.dec ? (+v).toFixed(it.dec) : String(Math.round(v * 100) / 100)) + it.unite; }

  function construireLigne(it) {
    if (it.type === "couleur") {
      var ligne = el("label", "ap-ligne"), nom = el("span", "ap-nom", it.label), droite = el("span", "ap-droite");
      var hex = el("span", "ap-hex", etat[it.k]), champ = el("input"); champ.type = "color"; champ.value = etat[it.k]; champ.setAttribute("aria-label", it.label);
      champ.addEventListener("input", function () { etat[it.k] = champ.value; hex.textContent = champ.value; changer(); });
      droite.appendChild(hex); droite.appendChild(champ); ligne.appendChild(nom); ligne.appendChild(droite);
      refs[it.k] = function () { champ.value = etat[it.k]; hex.textContent = etat[it.k]; };
      return ligne;
    }
    var bloc = el("div", "range"), haut = el("div", "range-top"), lab = el("label", "", it.label), sortie = el("output", "", formater(it, etat[it.k]));
    var cur = el("input"); cur.type = "range"; cur.min = it.min; cur.max = it.max; cur.step = it.pas; cur.value = etat[it.k]; cur.setAttribute("aria-label", it.label);
    function remplir() { cur.style.setProperty("--p", ((cur.value - cur.min) / (cur.max - cur.min)) * 100 + "%"); sortie.textContent = formater(it, cur.value); }
    cur.addEventListener("input", function () { etat[it.k] = +cur.value; remplir(); changer(); });
    haut.appendChild(lab); haut.appendChild(sortie); bloc.appendChild(haut); bloc.appendChild(cur);
    refs[it.k] = function () { cur.value = etat[it.k]; remplir(); };
    remplir();
    return bloc;
  }

  function tout_rafraichir() { Object.keys(refs).forEach(function (k) { refs[k](); }); }
  function changer() { appliquer(); garder(); if (zoneTexte && !zoneTexte.hidden) zoneTexte.value = texteConfig(); }

  function texteConfig() {
    var sortie = {};
    Object.keys(DEF).forEach(function (k) { sortie[k] = etat[k]; });
    return "Configuration d'apparence de MyBad Creator\n" + JSON.stringify(sortie, null, 1);
  }

  function copier() {
    var texte = texteConfig();
    zoneTexte.hidden = false; zoneTexte.value = texte; zoneTexte.focus(); zoneTexte.select();
    var fini = function (ok) { boutonCopie.textContent = ok ? "Copié ✓" : "Copie le texte ci-dessus (Ctrl+C)"; setTimeout(function () { if (boutonCopie) boutonCopie.textContent = "Copier ma configuration"; }, 2600); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(texte).then(function () { fini(true); }, function () { fini(document.execCommand("copy")); }); }
      else fini(document.execCommand("copy"));
    } catch (e) { fini(false); }
  }

  function reinitialiser() {
    var fait = function () { etat = copie(DEF); changer(); fume.checked = false; tout_rafraichir(); };
    if (window.Dialogue && window.Dialogue.confirmer) {
      window.Dialogue.confirmer({ message: "Remettre l'apparence d'origine ?", detail: "Toutes tes couleurs et transparences reviennent à l'aspect actuel du logiciel.", ok: "Réinitialiser", annuler: "Annuler" }).then(function (oui) { if (oui) fait(); });
    } else fait();
  }

  var fume = null;
  function construire() {
    panneau = el("div", "ap-panel"); panneau.setAttribute("role", "dialog"); panneau.setAttribute("aria-label", "Apparence");
    var tete = el("div", "ap-tete"), titres = el("div", "ap-titres");
    titres.appendChild(el("strong", "", "Apparence")); titres.appendChild(el("span", "ap-aide", "Règle à ta main, puis copie ta configuration."));
    var bCote = el("button", "icon-btn sm", "⇄"); bCote.type = "button"; bCote.title = "Passer le panneau de l'autre côté";
    bCote.addEventListener("click", function () { cote = cote === "droite" ? "gauche" : "droite"; panneau.classList.toggle("gauche", cote === "gauche"); });
    var bFerme = el("button", "icon-btn sm", "✕"); bFerme.type = "button"; bFerme.title = "Fermer (Échap)"; bFerme.addEventListener("click", fermer);
    tete.appendChild(titres); tete.appendChild(bCote); tete.appendChild(bFerme); panneau.appendChild(tete);

    var corps = el("div", "ap-corps");
    var modes = el("label", "toggle ap-mode"); var nomMode = el("span", "", ""); nomMode.appendChild(el("strong", "", "Verre fumé")); nomMode.appendChild(el("small", "", "Tuiles plus sombres et plus floues. Désactivé : verre clair."));
    fume = el("input"); fume.type = "checkbox"; fume.checked = !!etat.fume; fume.setAttribute("role", "switch"); fume.setAttribute("aria-label", "Verre fumé");
    fume.addEventListener("change", function () { etat.fume = fume.checked; var p = PRESETS[fume.checked ? "fume" : "clair"]; Object.keys(p).forEach(function (k) { etat[k] = p[k]; }); changer(); tout_rafraichir(); });
    modes.appendChild(nomMode); modes.appendChild(fume); corps.appendChild(modes);

    SECTIONS.forEach(function (sec) {
      var d = el("details", "ap-sec"); if (sec.ouvert) d.open = true;
      d.appendChild(el("summary", "", sec.titre));
      var grille = el("div", "ap-grille"); sec.items.forEach(function (it) { grille.appendChild(construireLigne(it)); }); d.appendChild(grille); corps.appendChild(d);
    });
    panneau.appendChild(corps);

    var pied = el("div", "ap-pied");
    zoneTexte = el("textarea", "input ap-texte"); zoneTexte.readOnly = true; zoneTexte.hidden = true; zoneTexte.rows = 6; zoneTexte.setAttribute("aria-label", "Ma configuration");
    var reset = el("button", "ghost-btn", "Réinitialiser"); reset.type = "button"; reset.addEventListener("click", reinitialiser);
    boutonCopie = el("button", "primary-btn", "Copier ma configuration"); boutonCopie.type = "button"; boutonCopie.addEventListener("click", copier);
    var rang = el("div", "ap-actions"); rang.appendChild(reset); rang.appendChild(boutonCopie);
    pied.appendChild(zoneTexte); pied.appendChild(rang); panneau.appendChild(pied);
    document.body.appendChild(panneau);
  }

  function ouvrir() {
    if (!panneau) construire();
    panneau.hidden = false; if (bouton) bouton.classList.add("ouvert");
    // reprend l'animation d'ouverture à chaque ouverture
    panneau.style.animation = "none"; void panneau.offsetWidth; panneau.style.animation = "";
  }
  function fermer() { if (panneau) panneau.hidden = true; if (bouton) bouton.classList.remove("ouvert"); }
  function basculer() { if (panneau && !panneau.hidden) fermer(); else ouvrir(); }

  var barre = document.getElementById("barreTitre");
  if (barre) {
    bouton = el("button", "menu-mot", "Apparence"); bouton.id = "btnApparence"; bouton.type = "button"; bouton.title = "Régler le verre, les fonds et les couleurs (Ctrl+Alt+A)";
    bouton.addEventListener("click", basculer);
    barre.appendChild(bouton);
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && panneau && !panneau.hidden && !document.querySelector(".dlg")) fermer();
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "a" || e.key === "A")) { e.preventDefault(); basculer(); }
  });

  window.Apparence = { ouvrir: ouvrir, fermer: fermer, etat: function () { return etat; }, defaut: DEF };
})();
