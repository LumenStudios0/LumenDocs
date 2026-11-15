export const backgrounds = [
  { id: 'none', name: 'Classic', animated: false },
  { id: 'aurora', name: 'End Aurora', animated: true },
  { id: 'portal', name: 'Nether Portal', animated: true },
  { id: 'stars', name: 'Ender Constellation', animated: true },
  { id: 'rain', name: 'Amethyst Rain', animated: true },
  { id: 'waves', name: 'Luminous Waves', animated: true },
  { id: 'grid', name: 'Redstone Grid', animated: true },
  { id: 'embers', name: 'Nether Embers', animated: true },
  { id: 'prism', name: 'Prism Shards', animated: true },
  { id: 'orbit', name: 'Moon Orbit', animated: true },
  { id: 'clouds', name: 'Sky Islands', animated: true },
  { id: 'amethyst', name: 'Amethyst Geode', animated: false },
  { id: 'obsidian', name: 'Obsidian Tiles', animated: false },
  { id: 'sunset', name: 'Overworld Sunset', animated: false },
  { id: 'frost', name: 'Frozen Peaks', animated: false },
  { id: 'forest', name: 'Enchanted Forest', animated: false },
]
export const frames = [
  { id: 'none', name: 'No frame' },
  ...['Amethyst', 'Ender', 'Redstone', 'Diamond', 'Emerald', 'Netherite', 'Prismarine', 'Gold', 'Frost', 'Obsidian', 'Copper', 'Quartz']
    .map(name => ({ id: name.toLowerCase(), name })),
]
export const decorations = [
  { id: 'none', name: 'No decoration' },
  { id: 'stars', name: 'Ender Stars' }, { id: 'wings', name: 'Elytra Wings' },
  { id: 'flames', name: 'Soul Flames' }, { id: 'crystals', name: 'Amethyst Crystals' },
  { id: 'orbits', name: 'Orbital Rings' }, { id: 'leaves', name: 'Floating Leaves' },
  { id: 'lightning', name: 'Redstone Sparks' }, { id: 'snow', name: 'Snowflakes' },
  { id: 'crown', name: 'Pixel Crown' }, { id: 'bubbles', name: 'Prismarine Bubbles' },
  { id: 'hearts', name: 'Pixel Hearts' }, { id: 'comets', name: 'Mini Comets' },
]
export const achievements = [
  { id: 'introduced', name: 'Introduced', description: 'Write a bio of at least 40 characters.' },
  { id: 'server_builder', name: 'Server Builder', description: 'Publish a Minecraft server showcase.' },
  { id: 'conversation', name: 'Conversation Starter', description: 'Publish a visible community thread.' },
  { id: 'contributor', name: 'Community Contributor', description: 'Reply to a visible community thread.' },
  { id: 'regular', name: 'Lumen Regular', description: 'Keep a profile for at least 30 days.' },
]
