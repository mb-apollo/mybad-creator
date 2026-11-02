/* Barre de titre sur mesure : le menu de l'application (Fichier, Édition, Affichage, Aide) s'ouvre ici, dans la même matière que le reste,
   au lieu de la barre de menus grise de Windows. La structure et les actions viennent du vrai menu (main.js) : rien n'est recopié ici.
   Tout le texte passe par textContent : les noms de projets récents sont des données, jamais du code. */
(function () {
  var api = window.studio;
  var nav = document.getElementById("menus");
  if (!api || !api.menuStructure || !nav) return;
  var ouvert = null, voile = null, boite = null, barres = [];

  function el(tag, classe, texte) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }

  function fermer() {
    if (boite && boite.parentNode) boite.parentNode.removeChild(boite);
    if (voile && voile.parentNode) voile.parentNode.removeChild(voile);
    boite = voile = null;
    barres.forEach(function (b) { b.classList.remove("ouvert"); });
    ouvert = null;
  }

  function ligne(item, niveau) {
    if (item.type === "separator") return el("div", "menu-sep");
    var b = el("button", "menu-entree" + (niveau ? " sous" : ""));
    b.type = "button";
    b.appendChild(el("span", "menu-nom", item.label));
    if (item.accelerator) b.appendChild(el("span", "menu-raccourci", item.accelerator));
    if (item.enabled === false) b.disabled = true;
    b.addEventListener("click", function () { fermer(); api.menuClic(item.chemin); });
    return b;
  }

  function remplir(conteneur, items, niveau) {
    items.forEach(function (it) {
      if (it.submenu) {
        // sous-menu (projets récents) : un titre, puis ses entrées légèrement décalées
        conteneur.appendChild(el("div", "menu-titre", it.label));
        it.submenu.forEach(function (s) { conteneur.appendChild(ligne(s, 1)); });
      } else {
        conteneur.appendChild(ligne(it, niveau));
      }
    });
  }

  function ouvrir(index, bouton, structure) {
    fermer();
    ouvert = index;
    bouton.classList.add("ouvert");
    voile = el("div", "menu-voile");
    voile.addEventListener("mousedown", fermer);
    boite = el("div", "menu-glass");
    remplir(boite, structure[index].submenu || [], 0);
    document.body.appendChild(voile);
    document.body.appendChild(boite);
    var r = bouton.getBoundingClientRect();
    boite.style.left = Math.max(8, Math.min(r.left - 6, window.innerWidth - boite.offsetWidth - 8)) + "px";
    boite.style.top = (r.bottom + 6) + "px";
  }

  api.menuStructure().then(function (structure) {
    structure.forEach(function (m, i) {
      var b = el("button", "menu-mot", m.label.replace("&", ""));
      b.type = "button";
      b.addEventListener("click", function () { if (ouvert === i) fermer(); else ouvrir(i, b, structure); });
      b.addEventListener("mouseenter", function () { if (ouvert !== null && ouvert !== i) ouvrir(i, b, structure); }); // une fois ouvert, survoler un autre mot change de menu
      nav.appendChild(b); barres.push(b);
    });
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && ouvert !== null) fermer(); });
  window.addEventListener("blur", fermer);
})();
