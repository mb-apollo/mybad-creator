# Installateur sur mesure (tuiles, verre)

Une première installation se fait avec une fenêtre à nous (tuiles arrondies, halos, mêmes couleurs que le logiciel) à la place de l'assistant Windows classique.
Elle **pilote le vrai installateur NSIS en arrière-plan** : il est embarqué dans l'exe sous le nom `moteur.exe`, donc le registre, la désinstallation
(Paramètres Windows › Applications) et le dossier d'installation restent exactement ceux d'avant.

## Ce qui change, ce qui ne change pas
- **Les mises à jour automatiques ne changent pas** : `electron-updater` continue d'utiliser l'installateur NSIS habituel (`MyBad-Creator-Setup-x.y.z.exe`, celui de `latest.yml`).
  Il ne faut **pas** publier l'installateur sur mesure à sa place (l'empreinte de `latest.yml` ne correspondrait plus). Il se publie à côté, comme un second fichier.
- L'installateur sur mesure sert à la **première installation** : choix du dossier, deux raccourcis (Bureau, menu Démarrer), progression, bouton « Ouvrir ».
- Lancé avec `/S` (silencieux), il relaie tel quel les options au moteur : un déploiement automatique marche comme avant.

## Construire
1. Construire l'installateur NSIS comme d'habitude : `npm run dist` (il arrive dans `release/`).
2. Puis :
   ```powershell
   node installer-ui/build.js release\MyBad-Creator-Setup-<version>.exe
   ```
   Le fichier `release\MyBad-Creator-Installateur-<version>.exe` est créé (≈ 120 Mo, comme l'installateur NSIS).
   Il se compile avec `csc.exe`, déjà présent dans Windows (.NET Framework 4.8) : rien à installer.

## Tester sans toucher à ton installation
- `Installateur.exe --apercu options|installation|termine|erreur sortie.png` dessine un écran dans un fichier PNG, sans rien installer.
- `Installateur.exe --dossier <chemin> --auto` choisit le dossier et lance l'installation tout de suite (pour un test dans un dossier à part).
- Pour essayer sans risque : construire un installateur NSIS d'aperçu avec un autre `appId` et sans raccourcis ni association de fichiers `.mybad`, l'embarquer avec
  `node installer-ui/build.js <apercu.exe> --config <apercu.yml> --sortie <installateur-apercu.exe>`, puis le désinstaller.

## Limites connues
- Pas de bouton « Annuler » pendant la copie des fichiers (couper une installation en plein milieu laisserait un dossier à moitié rempli).
- Les deux interrupteurs de raccourcis agissent après l'installation : le raccourci est supprimé s'il est désactivé (testé en lecture du code, pas sur un vrai Bureau).
- Le code est en C# 5 (compilateur de Windows) : pas de syntaxe plus récente.
