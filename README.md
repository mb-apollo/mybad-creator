# MyBad Creator

L'éditeur d'affiches de MyBad Esport (Windows). Modèles Valorant et Rocket League, calques façon Photoshop,
effets, détourage automatique, modèles 3D (.glb) et mise à jour en un clic.

## Publier une mise à jour

1. Modifier le code, puis augmenter `version` dans `package.json` (ex. `2.0.1`) et pousser sur `main`.
2. Sur GitHub : onglet **Actions** › **Publier une version** › **Run workflow**
   (ou pousser un tag `v2.0.1`, qui lance la même chose).
3. Environ 10 minutes plus tard, la release est publiée avec l'installateur.
4. Dans le logiciel, le bouton **Mise à jour** apparaît au démarrage : un clic télécharge, un second redémarre et installe.

## Développement

```
npm install
npm start          # lance le logiciel
npm run dist       # construit l'installateur dans release/ (Windows, ou Linux avec Wine)
```

## Organisation du code

- `src/main` : processus principal (fenêtre, menus, fichiers .mybad, bibliothèque, mises à jour)
- `src/renderer/engine` : moteur de rendu par calques (`scene.js`), modèles (`templates.js`), jeux (`games.js`)
- `src/renderer/editor.js` : zone de travail (sélection, poignées, repères magnétiques, outils)
- `src/renderer/panels.js` : panneaux Propriétés, Contenu, Thème, Bibliothèque, Calques
- `src/renderer/model3d.js` et `pose3d.js` : calques 3D (three.js)
- `build/` : icônes, images et habillage de l'installateur

Les renders et modèles 3D des agents ne sont pas dans le dépôt : chaque utilisateur les importe dans la Bibliothèque.

## Licence

AGPL-3.0 (le détourage utilise @imgly/background-removal, sous licence AGPL). Le code source complet est public sur ce dépôt.
