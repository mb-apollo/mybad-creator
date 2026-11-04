/* Liaison entre l'interface existante (classe « on » sur l'option choisie) et le kit Liquid Glass (classe « actif »).
   Le reste du code de Heliance Creator n'est pas modifié : on recopie « on » vers « actif » et on dit à la bulle de se replacer. */
(function () {
  var BARRES = ["#gameSeg", "#fmtSeg", ".tabs"];

  function synchroniser(barre) {
    var change = false, enfants = barre.children;
    for (var i = 0; i < enfants.length; i++) {
      var b = enfants[i];
      if (b.tagName !== "BUTTON") continue;
      var on = b.classList.contains("on");
      if (on !== b.classList.contains("actif")) { b.classList.toggle("actif", on); change = true; }
    }
    return change;
  }
  function replacer(direct) { if (window.Glisse) window.Glisse.replacer(direct); }

  BARRES.forEach(function (sel) {
    var barre = document.querySelector(sel);
    if (!barre) return;
    // la barre peut aussi être reconstruite (format, jeu) : les options sont alors de nouveaux boutons, la bulle doit les rejoindre en glissant
    var surveille = new MutationObserver(function (muts) {
      var change = synchroniser(barre);
      var refaite = muts.some(function (m) {
        if (m.type !== "childList" || m.target !== barre) return false;
        return [].slice.call(m.addedNodes).some(function (n) { return !(n.classList && n.classList.contains("bulle-verre")); });
      });
      if (change || refaite) replacer();
    });
    surveille.observe(barre, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
    synchroniser(barre);
  });
  // l'application est cachée pendant le démarrage : les barres n'ont pas de taille avant qu'elle apparaisse
  var app = document.getElementById("app");
  if (app) new MutationObserver(function () { if (!app.hidden) replacer(true); }).observe(app, { attributes: true, attributeFilter: ["hidden"] });
  replacer(true);
})();
