// Données des jeux : agents Valorant (rôles) et voitures Rocket League.
export const ROLES = {
  duelist: 'Duelist', initiator: 'Initiator', controller: 'Controller', sentinel: 'Sentinel',
};

const A = (key, name, role) => ({ key, name, role });
export const VALORANT_AGENTS = [
  A('astra', 'Astra', 'controller'), A('breach', 'Breach', 'initiator'), A('brimstone', 'Brimstone', 'controller'),
  A('chamber', 'Chamber', 'sentinel'), A('clove', 'Clove', 'controller'), A('cypher', 'Cypher', 'sentinel'),
  A('deadlock', 'Deadlock', 'sentinel'), A('fade', 'Fade', 'initiator'), A('gekko', 'Gekko', 'initiator'),
  A('harbor', 'Harbor', 'controller'), A('iso', 'Iso', 'duelist'), A('jett', 'Jett', 'duelist'),
  A('kayo', 'KAY/O', 'initiator'), A('killjoy', 'Killjoy', 'sentinel'), A('miks', 'Miks', 'controller'),
  A('neon', 'Neon', 'duelist'), A('omen', 'Omen', 'controller'), A('phoenix', 'Phoenix', 'duelist'),
  A('raze', 'Raze', 'duelist'), A('reyna', 'Reyna', 'duelist'), A('sage', 'Sage', 'sentinel'),
  A('skye', 'Skye', 'initiator'), A('sova', 'Sova', 'initiator'), A('tejo', 'Tejo', 'initiator'),
  A('veto', 'Veto', 'sentinel'), A('viper', 'Viper', 'controller'), A('vyse', 'Vyse', 'sentinel'),
  A('waylay', 'Waylay', 'duelist'), A('yoru', 'Yoru', 'duelist'),
];

export const RL_CARS = [
  { key: 'octane', name: 'Octane', role: 'car' },
  { key: 'fennec', name: 'Fennec', role: 'car' },
  { key: 'dominus', name: 'Dominus', role: 'car' },
];

export const GAMES = {
  valorant: { key: 'valorant', name: 'Valorant', players: 5, itemLabel: 'Agent', items: VALORANT_AGENTS, roleLabels: { duelist: 'Duelist', initiator: 'Initiator', controller: 'Smoker', sentinel: 'Sentinel', flex: 'Flex' } },
  rl: { key: 'rl', name: 'Rocket League', players: 3, itemLabel: 'Voiture', items: RL_CARS, roleLabels: {} },
};

// Armes 3D tenues en main (bibliothèque « weapons »). kind : fusil (deux mains) ou pistolet (une main).
export const WEAPONS = [
  { key: 'vandal', name: 'Vandal', kind: 'rifle' }, { key: 'phantom', name: 'Phantom', kind: 'rifle' },
  { key: 'classic', name: 'Classic', kind: 'pistol' }, { key: 'ghost', name: 'Ghost', kind: 'pistol' }, { key: 'sheriff', name: 'Sheriff', kind: 'pistol' },
];

// Éléments ajoutés par l'utilisateur (nouvel agent, voiture personnalisée…)
export function gameItems(game, extra = []) {
  if (game === 'weapons') return WEAPONS;
  const base = GAMES[game]?.items || [];
  const keys = new Set(base.map(i => i.key));
  return [...base, ...extra.filter(e => e.game === game && !keys.has(e.key))];
}
export function itemName(game, key, extra = []) {
  return gameItems(game, extra).find(i => i.key === key)?.name || key || '';
}
