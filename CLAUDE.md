# MyBad Creator — contexte pour Claude Code

Éditeur d'affiches esport (Windows, Electron) créé pour MyBad Esport, rendu générique pour d'autres structures.
Toute l'interface et les textes sont en **français**. L'utilisateur (Axel, « Apollo ») tutoie et parle français.

## Lancer et construire
- `npm install` puis `npm start` (prépare les ressources, assemble `src/renderer/app.js` avec esbuild, lance Electron)
- `npm run dist` : installateur Windows dans `release/` (sous Linux, il faut Wine)
- Publier une version : augmenter `version` dans `package.json` et pousser sur `main`.
  Le workflow `.github/workflows/release.yml` construit et publie la release GitHub ; les logiciels installés
  la proposent dans l'onglet **Mises à jour** (electron-updater, provider GitHub `mb-apollo/mybad-creator`).
  Mettre à jour `build/release-notes.md` à chaque version.

## Architecture
- `src/main/main.js` : fenêtre, menus, protocole `mbc://app/` (interface, `lib/` = bibliothèque utilisateur,
  `pack/` = pack 3D), fichiers `.mybad`, bibliothèque, téléchargement du pack 3D, mises à jour.
- `src/renderer/engine/` : moteur de rendu par calques sur canvas
  - `scene.js` : types de calques (bg, text, shape, emblem = logo de la structure, image, model, effect),
    effets (glow, beam, bigstar, stars, streaks, bars, smoke, floor, bloom, grade, vignette, grain…),
    fx par calque (lueur, ombre, contour, fondu, fondu pixel), modes de fusion.
  - `templates.js` : les 11 modèles (matchday, roster, resultat, gameday, annonce, nouveau, tournoi, planning,
    recrutement, carte, live). Les textes sont reliés aux champs `{p1}`, `{event}`… du contenu (`doc.T`).
  - `render.js` : formats (4:5, 1:1, 9:16), thèmes, textes par défaut neutres, `MYBAD_KIT`, `applyTemplate`.
  - `games.js` : agents Valorant (Miks inclus) et voitures Rocket League.
- `src/renderer/editor.js` : zone de travail (sélection, poignées, rotation, repères magnétiques, outils, raccourcis).
- `src/renderer/panels.js` : panneaux Propriétés, Contenu, Thème, Bibliothèque, Calques. `setHTML` garde le focus.
- `src/renderer/model3d.js` + `pose3d.js` : calques 3D three.js (.glb), éclairage key/rim/fill/ambient, exposition.
  `CAR_FRONT = 270` = rotation où une voiture fait face à la caméra.
- `src/renderer/app.js` : démarrage, assistant de démarrage, kit de marque, export, pack 3D, mises à jour.
- `build/` : icônes, images et habillage NSIS de l'installateur (`installer.nsh`, `nsis/assistedInstaller.nsh`
  copié par `scripts/patch-nsis.js`).

## Points importants
- Pack 3D : branche `pack-3d` du dépôt (`index.json` + `.glb` compressés WebP 2048 px via gltf-transform).
  Pour ajouter un modèle : compresser, l'ajouter à la branche et incrémenter `version` dans `index.json`.
- Le fondu pixel n'est pas appliqué aux modèles 3D (il découpait les jambes) : fondu doux à la place.
- Logo officiel MyBad : `src/renderer/assets/brand/mybad-logo.png` (ne pas le redessiner).
- Détourage hors ligne : @imgly/background-removal (licence AGPL, d'où la licence du projet).
- Tester le rendu sans interface : `MBC_SHOT=<dossier> MBC_STEPS='[...]' electron .` (captures automatiques,
  voir `devShot` dans `main.js`) ; `window.__creator` expose l'état pour les tests.
