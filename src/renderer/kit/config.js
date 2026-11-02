/* Réglages du kit Liquid Glass pour MyBad Creator : quelles barres reçoivent la bulle, quelles surfaces suivent la souris, quels éléments sont réfractés.
   lenteur : 1 = ressorts d'Apple, 1,7 = la bulle des barres de sélection voyage 70 % plus lentement (demandé par Axel : « ça bouge trop vite »). */
window.GlisseConfig = { conteneurs: "#gameSeg, #fmtSeg, .tabs", surfaces: ".gallery, .side, .stage", lenteur: 1.7 };
window.RefractionConfig = { cibles: ".verre, .barre-sel" };
