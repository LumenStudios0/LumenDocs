// USD prices confirmed by the studio on 2026-11-17.
export const productMarketplace = [
  { productId: 'gladiator', name: 'Gladiator', resourceId: '132519', priceCents: 1397 },
  { productId: 'lumenauction', name: 'LumenAuction', resourceId: '132967', priceCents: 899 },
  { productId: 'lumenduels', name: 'LumenDuels', resourceId: '119760', priceCents: 1299 },
  { productId: 'lumenduels-premium', name: 'LumenDuels Premium', resourceId: '132188', priceCents: 1899 },
  { productId: 'lumeneconomy', name: 'LumenEconomy', resourceId: '132341', priceCents: 599 },
  { productId: 'lumenessentials', name: 'LumenEssentials', resourceId: '132966', priceCents: 1199 },
  { productId: 'lumenorder', name: 'LumenOrder', resourceId: '132969', priceCents: 899 },
  { productId: '1', name: 'LumenShards', resourceId: '116897', priceCents: 899 },
  { productId: 'lumenspoofer', name: 'LumenSpoofer', resourceId: '135950', priceCents: 1497 },
  { productId: 'lumenspawners', name: 'LumenSpawners', resourceId: '132970', priceCents: 599 },
  { productId: 'lumenbounty', name: 'LumenBounty', resourceId: '132973', priceCents: 897 },
  { productId: 'lumencosmetics', name: 'LumenCosmetics', resourceId: null, priceCents: 599 },
]

export const marketplaceProduct = product => productMarketplace.find(item =>
  item.productId === product.productId || item.name.toLowerCase() === product.name.toLowerCase())
