/* Messages de confirmation en verre (à la place des boîtes grises de Windows) : « Quitter sans enregistrer ? », « Supprimer… ? ».
   window.Dialogue.confirmer({ message, detail, ok, annuler, danger }) renvoie une promesse : true si on valide, false sinon (Échap, clic à côté, Annuler).
   window.Dialogue.informer({ message, detail, ok }) : un simple message avec un bouton.
   La fermeture du logiciel passe aussi par ici : le processus principal demande, cette fenêtre s'affiche, la réponse repart.
   Aucune donnée n'est lue ni envoyée : du texte affiché, rien d'autre. */
(function () {
  var ICONE_ATTENTION = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.8 19.5a1 1 0 0 0 .9 1.5h16.6a1 1 0 0 0 .9-1.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/></svg>';
  var ICONE_QUESTION = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>';
  var file = Promise.resolve();   // un message à la fois : les suivants attendent

  function texte(tag, classe, contenu) { var e = document.createElement(tag); e.className = classe; e.textContent = contenu; return e; }

  function afficher(o) {
    return new Promise(function (resolve) {
      var avant = document.activeElement;
      var fond = document.createElement("div"); fond.className = "modal dlg"; fond.setAttribute("role", "alertdialog"); fond.setAttribute("aria-modal", "true");
      var carte = document.createElement("div"); carte.className = "modal-card dlg-card";
      var corps = document.createElement("div"); corps.className = "dlg-corps";
      var icone = document.createElement("div"); icone.className = "dlg-icone" + (o.danger ? " danger" : ""); icone.innerHTML = o.danger ? ICONE_ATTENTION : ICONE_QUESTION;
      var t = document.createElement("div"); t.className = "dlg-texte";
      t.appendChild(texte("h3", "dlg-titre", o.message || ""));
      if (o.detail) t.appendChild(texte("p", "dlg-detail", o.detail));
      corps.appendChild(icone); corps.appendChild(t);
      var actions = document.createElement("div"); actions.className = "dlg-actions";
      var bAnnuler = null;
      if (!o.sansAnnuler) { bAnnuler = texte("button", "ghost-btn", o.annuler || "Annuler"); bAnnuler.type = "button"; actions.appendChild(bAnnuler); }
      var bOk = texte("button", "primary-btn" + (o.danger ? " danger" : ""), o.ok || "OK"); bOk.type = "button"; actions.appendChild(bOk);
      carte.appendChild(corps); carte.appendChild(actions); fond.appendChild(carte);
      document.body.appendChild(fond);
      if (window.Transitions) window.Transitions.fenetreEntrer(fond);

      var fini = false;
      function fermer(reponse) {
        if (fini) return; fini = true;
        document.removeEventListener("keydown", touche, true);
        var fin = function () { fond.remove(); try { if (avant && avant.focus) avant.focus({ preventScroll: true }); } catch (e) { } resolve(reponse); };
        if (window.Transitions) window.Transitions.fenetreSortir(fond, fin); else fin();
      }
      function touche(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fermer(false); }
        else if (e.key === "Enter" && document.activeElement === bOk) { e.preventDefault(); e.stopPropagation(); fermer(true); }
        else if (e.key === "Tab") {   // le focus reste dans la fenêtre
          var b = bAnnuler ? [bAnnuler, bOk] : [bOk], i = b.indexOf(document.activeElement);
          e.preventDefault(); b[(i + (e.shiftKey ? b.length - 1 : 1)) % b.length].focus();
        }
        e.stopPropagation();
      }
      document.addEventListener("keydown", touche, true);
      bOk.addEventListener("click", function () { fermer(true); });
      if (bAnnuler) bAnnuler.addEventListener("click", function () { fermer(false); });
      fond.addEventListener("pointerdown", function (e) { if (e.target === fond) fermer(false); });
      // le bouton par défaut est « Annuler » pour une action risquée, « OK » sinon
      setTimeout(function () { (o.danger && bAnnuler ? bAnnuler : bOk).focus(); }, 30);
    });
  }

  function enfiler(o) { var p = file.then(function () { return afficher(o); }); file = p.catch(function () { }); return p; }

  window.Dialogue = {
    confirmer: function (o) { return enfiler(o || {}); },
    informer: function (o) { o = o || {}; o.sansAnnuler = true; return enfiler(o).then(function () { return true; }); },
  };

  // fermeture du logiciel avec des modifications non enregistrées : le processus principal demande, on répond
  if (window.studio && window.studio.surDemandeFermeture) {
    window.studio.surDemandeFermeture(function () {
      window.Dialogue.confirmer({ message: "Le projet contient des modifications non enregistrées.", detail: "Ta session reste récupérable au prochain lancement, mais le fichier .mybad ne sera pas mis à jour.", ok: "Quitter sans enregistrer", annuler: "Annuler", danger: true })
        .then(function (oui) { if (oui) window.studio.fermetureConfirmee(); });
    });
  }
})();
