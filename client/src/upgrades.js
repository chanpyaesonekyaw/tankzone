export const UPGRADE_DEFS = [
  { key: "1", stat: "movementSpeed", label: "Move speed", description: "Move faster." },
  { key: "2", stat: "bulletDamage", label: "Bullet damage", description: "Bullets deal more damage." },
  { key: "3", stat: "bulletSpeed", label: "Bullet speed", description: "Bullets travel faster." },
  { key: "4", stat: "reloadSpeed", label: "Reload speed", description: "Shoot more often." },
  { key: "5", stat: "maxHealth", label: "Max health", description: "Increase max HP." },
];

export const UPGRADE_BY_KEY = Object.fromEntries(UPGRADE_DEFS.map((d) => [d.key, d]));


