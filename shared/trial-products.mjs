import { productMarketplace } from './product-marketplace.mjs'

export const trialProducts = productMarketplace.map(({ productId, name }) => ({ productId, name }))
