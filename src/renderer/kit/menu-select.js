/* Menus déroulants en verre (style Apple) à la place de la liste grise de Windows.
   Le <select> reste en place (il garde sa valeur, ses événements, sa mise en page) : on intercepte seulement l'ouverture
   et on affiche notre propre liste. Le choix est écrit dans le <select>, puis « input » et « change » sont envoyés comme avec la liste d'origine.
   Rien n'est lu d'ailleurs que la page elle-même : aucune donnée n'est envoyée nulle part. */
(function () {
  var liste = null, select = null, items = [], actif = -1, ancre = null;

  function utilisable(s) { return s && s.tagName === "SELECT" && !s.multiple && !(s.size > 1) && !s.disabled; }

  function fermer(rendreLeFocus) {
    if (!liste) return;
    var s = select;
    liste.remove(); liste = null; select = null; items = []; actif = -1;
    document.removeEventListener("pointerdown", dehors, true);
    window.removeEventListener("resize", fermerSimple);
    document.removeEventListener("scroll", defilement, true);
    if (s) s.classList.remove("ouvert");
    if (rendreLeFocus && s) { try { s.focus({ preventScroll: true }); } catch (e) { } }
  }
  function fermerSimple() { fermer(false); }
  function dehors(e) { if (liste && !liste.contains(e.target)) fermer(false); }
  function defilement(e) { if (liste && !liste.contains(e.target)) fermer(false); }

  function choisir(i) {
    var it = items[i];
    if (!it || it.option.disabled) return;
    var s = select, valeur = it.option.value, change = s.value !== valeur;
    s.value = valeur;
    fermer(true);
    if (change) {
      s.dispatchEvent(new Event("input", { bubbles: true }));
      s.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function surligner(i, defiler) {
    if (!items.length) return;
    var n = items.length, pas = i >= actif ? 1 : -1, essais = 0;
    i = (i + n) % n;
    while (items[i].option.disabled && essais++ < n) i = (i + pas + n) % n;
    if (actif >= 0 && items[actif]) items[actif].el.classList.remove("survol");
    actif = i;
    items[i].el.classList.add("survol");
    if (defiler) items[i].el.scrollIntoView({ block: "nearest" });
  }

  function ouvrir(s) {
    if (liste) fermer(false);
    select = s; s.classList.add("ouvert");
    liste = document.createElement("div");
    liste.className = "menu-select";
    liste.setAttribute("role", "listbox");
    var corps = document.createElement("div");
    corps.className = "menu-select-corps";
    liste.appendChild(corps);
    items = [];
    function ajouterOption(o, parent) {
      var el = document.createElement("div");
      el.className = "ms-item" + (o.disabled ? " desactive" : "") + (o.selected ? " choisi" : "");
      el.setAttribute("role", "option");
      var t = document.createElement("span"); t.className = "ms-texte"; t.textContent = o.textContent; el.appendChild(t);
      var coche = document.createElement("span"); coche.className = "ms-coche"; coche.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>'; el.appendChild(coche);
      var idx = items.length;
      el.addEventListener("pointermove", function () { if (actif !== idx) surligner(idx, false); });
      el.addEventListener("click", function (e) { e.stopPropagation(); choisir(idx); });
      parent.appendChild(el);
      items.push({ el: el, option: o });
    }
    Array.prototype.forEach.call(s.children, function (n) {
      if (n.tagName === "OPTGROUP") {
        var g = document.createElement("div"); g.className = "ms-groupe"; g.textContent = n.label; corps.appendChild(g);
        Array.prototype.forEach.call(n.children, function (o) { ajouterOption(o, corps); });
      } else if (n.tagName === "OPTION") ajouterOption(n, corps);
    });
    document.body.appendChild(liste);
    // position : sous le champ, ou au-dessus s'il n'y a pas la place
    var r = s.getBoundingClientRect(), h = Math.min(liste.offsetHeight, 340), bas = window.innerHeight - r.bottom - 12, haut = r.top - 12;
    var vers = bas >= h || bas >= haut ? "bas" : "haut", maxH = Math.max(120, Math.min(340, vers === "bas" ? bas : haut));
    corps.style.maxHeight = maxH + "px";
    var largeur = Math.max(r.width, 160), gauche = Math.min(Math.max(8, r.left), window.innerWidth - largeur - 8);
    liste.style.left = gauche + "px"; liste.style.minWidth = largeur + "px";
    var hh = Math.min(liste.offsetHeight, maxH);
    liste.style.top = (vers === "bas" ? r.bottom + 6 : r.top - 6 - hh) + "px";
    liste.className += " " + (vers === "bas" ? "vers-bas" : "vers-haut");
    var courant = s.selectedIndex >= 0 ? items.findIndex(function (x) { return x.option === s.options[s.selectedIndex]; }) : 0;
    surligner(Math.max(0, courant), true);
    document.addEventListener("pointerdown", dehors, true);
    window.addEventListener("resize", fermerSimple);
    document.addEventListener("scroll", defilement, true);
  }

  // un appui sur un <select> ouvre notre liste au lieu de celle de Windows
  document.addEventListener("mousedown", function (e) {
    var s = e.target && e.target.closest ? e.target.closest("select") : null;
    if (!utilisable(s) || e.button) return;
    e.preventDefault();
    try { s.focus({ preventScroll: true }); } catch (x) { }
    if (liste && select === s) fermer(false); else ouvrir(s);
  }, true);

  document.addEventListener("keydown", function (e) {
    if (liste) {
      var k = e.key;
      if (k === "Escape") { e.preventDefault(); e.stopPropagation(); fermer(true); }
      else if (k === "ArrowDown") { e.preventDefault(); surligner(actif + 1, true); }
      else if (k === "ArrowUp") { e.preventDefault(); surligner(actif - 1, true); }
      else if (k === "Home") { e.preventDefault(); surligner(0, true); }
      else if (k === "End") { e.preventDefault(); surligner(items.length - 1, true); }
      else if (k === "Enter" || k === " ") { e.preventDefault(); choisir(actif); }
      else if (k === "Tab") fermer(false);
      return;
    }
    var s = e.target && e.target.tagName === "SELECT" ? e.target : null;
    if (!utilisable(s)) return;
    if (e.key === "Enter" || e.key === " " || (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp"))) { e.preventDefault(); ouvrir(s); }
  }, true);
})();
