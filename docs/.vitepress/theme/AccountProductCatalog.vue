<script setup lang="ts">
import { computed, ref } from 'vue'

type Product = {
  name: string
  price: string
  url: string
  docs: string
  category: string
}

const products: Product[] = [
  { name: 'Gladiator', price: '$19.99', url: 'https://builtbybit.com/resources/gladiator.132519/', docs: '/products/gladiator', category: 'Combat' },
  { name: 'LumenAuction', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenauction.132967/', docs: '/products/lumen-auction', category: 'Economy' },
  { name: 'LumenBounty', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenbounty.132973/', docs: '/products/lumen-bounty', category: 'Gameplay' },
  { name: 'LumenDuels', price: '$12.99', url: 'https://builtbybit.com/resources/lumenduels.119760/', docs: '/products/lumen-duels', category: 'Combat' },
  { name: 'LumenDuels Premium', price: '$18.99', url: 'https://builtbybit.com/resources/lumenduels-premium.132188/', docs: '/products/lumen-duels-premium', category: 'Combat' },
  { name: 'LumenEconomy', price: '$5.99', url: 'https://builtbybit.com/resources/lumeneconomy.132341/', docs: '/products/lumen-economy', category: 'Economy' },
  { name: 'LumenEssentials', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenessentials.132966/', docs: '/products/lumen-essentials', category: 'Utilities' },
  { name: 'LumenOrder', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenorders.132969/', docs: '/products/lumen-order', category: 'Utilities' },
  { name: 'LumenShards', price: '$8.99', url: 'https://builtbybit.com/resources/lumenshards.116897/', docs: '/products/lumen-shards', category: 'Economy' },
  { name: 'LumenSpoofer', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenspoof.135950/', docs: '/products/lumen-spoofer', category: 'Utilities' },
  { name: 'LumenSpawners', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenspawners.132970/', docs: '/products/lumen-spawners', category: 'Gameplay' },
]

const selectedCategory = ref<'owned' | 'not-owned'>('owned')
const searchQuery = ref('')
const visibleProducts = computed(() => selectedCategory.value === 'owned'
  ? []
  : products.filter(product => `${product.name} ${product.category}`.toLowerCase().includes(searchQuery.value.trim().toLowerCase())))
</script>

<template>
  <section class="account-products" aria-label="Product ownership">
    <div class="account-product-tabs" role="tablist" aria-label="Product category">
      <button
        id="owned-products-tab"
        type="button"
        role="tab"
        :aria-selected="selectedCategory === 'owned'"
        aria-controls="account-products-panel"
        @click="selectedCategory = 'owned'"
      >
        Owned products <span class="account-tab-count">0</span>
      </button>
      <button
        id="not-owned-tab"
        type="button"
        role="tab"
        :aria-selected="selectedCategory === 'not-owned'"
        aria-controls="account-products-panel"
        @click="selectedCategory = 'not-owned'"
      >
        Browse catalog <span class="account-tab-count">{{ products.length }}</span>
      </button>
    </div>

    <div
      id="account-products-panel"
      class="account-product-panel"
      role="tabpanel"
      :aria-labelledby="selectedCategory === 'owned' ? 'owned-products-tab' : 'not-owned-tab'"
    >
      <p class="account-product-note">
        Purchase history is not connected yet. These products are shown as not owned until your purchases can be verified.
        Prices may change; confirm the current amount on BuiltByBit.
      </p>
      <div v-if="selectedCategory === 'not-owned'" class="account-product-toolbar">
        <label class="account-product-search">
          <span aria-hidden="true">⌕</span>
          <input v-model="searchQuery" type="search" placeholder="Find a product…" aria-label="Search products">
        </label>
        <span>{{ visibleProducts.length }} {{ visibleProducts.length === 1 ? 'product' : 'products' }}</span>
      </div>
      <div v-if="visibleProducts.length" class="account-product-grid">
        <article v-for="product in visibleProducts" :key="product.name" class="account-product-card">
          <div class="account-product-card-head">
            <span class="account-product-mark" aria-hidden="true">{{ product.name.slice(0, 1) }}</span>
            <span class="account-product-category">{{ product.category }}</span>
          </div>
          <div class="account-product-info">
            <h2>{{ product.name }}</h2>
            <p class="account-product-price">{{ product.price }}</p>
          </div>
          <div class="account-product-links">
            <a :href="product.docs">Read docs <span aria-hidden="true">→</span></a>
            <a :href="product.url" target="_blank" rel="noreferrer">View &amp; buy <span aria-hidden="true">↗</span></a>
          </div>
        </article>
      </div>
      <div v-else-if="selectedCategory === 'not-owned'" class="account-product-empty">
        <span class="account-empty-icon" aria-hidden="true">⌕</span>
        <strong>No products match “{{ searchQuery }}”</strong>
        <span>Try another product name or category.</span>
      </div>
      <div v-else class="account-product-empty">
        <span class="account-empty-icon" aria-hidden="true">▦</span>
        <strong>No owned products found</strong>
        <span>Your verified purchases will show here after purchase history is connected.</span>
        <button type="button" @click="selectedCategory = 'not-owned'">Explore the catalog <span aria-hidden="true">→</span></button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.account-products {
  margin: 22px 0;
}

.account-product-tabs {
  display: flex;
  width: fit-content;
  max-width: 100%;
  gap: 5px;
  padding: 5px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
}

.account-product-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 13px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-2);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 650;
  cursor: pointer;
}

.account-product-tabs button[aria-selected="true"] {
  background: var(--vp-c-brand-1);
  color: white;
}

.account-tab-count {
  display: inline-grid;
  min-width: 18px;
  height: 18px;
  place-items: center;
  padding: 0 4px;
  border-radius: 99px;
  background: rgb(127 127 127 / 14%);
  font-size: 0.62rem;
}

.account-product-tabs button[aria-selected="true"] .account-tab-count {
  background: rgb(255 255 255 / 20%);
}

.account-product-tabs button:focus-visible,
.account-product-card a:focus-visible,
.account-product-empty button:focus-visible,
.account-product-search input:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.account-product-note {
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
}

.account-product-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 18px 0 12px;
  color: var(--vp-c-text-3);
  font-size: 0.68rem;
}

.account-product-search {
  display: flex;
  width: min(360px, 100%);
  min-height: 39px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 9px;
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
}

.account-product-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 0.75rem;
}

.account-product-search input:focus-visible { outline: none; }

.account-product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}

.account-product-card {
  position: relative;
  display: flex;
  min-height: 190px;
  flex-direction: column;
  gap: 12px;
  padding: 15px;
  overflow: hidden;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 13px;
  background: var(--lumen-card-bg, var(--vp-c-bg-soft));
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
  animation: account-product-enter 420ms ease both;
}

.account-product-card:hover {
  transform: translateY(-3px);
  border-color: var(--lumen-card-hover, var(--vp-c-brand-1));
  box-shadow: 0 14px 30px rgb(22 11 42 / 12%);
}

.account-product-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.account-product-mark {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid rgb(123 63 242 / 24%);
  border-radius: 10px;
  background: rgb(123 63 242 / 12%);
  color: var(--vp-c-brand-1);
  font-size: 0.95rem;
  font-weight: 780;
}

.account-product-category {
  padding: 4px 7px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 999px;
  color: var(--vp-c-text-3);
  font-size: 0.55rem;
}

.account-product-card h2 {
  margin: 0;
  border: 0;
  font-size: 0.95rem;
}

.account-product-price {
  margin: 5px 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.72rem;
}

.account-product-links {
  display: flex;
  justify-content: space-between;
  gap: 7px;
  margin-top: auto;
  padding-top: 11px;
  border-top: 1px solid var(--lumen-card-border, var(--vp-c-divider));
}

.account-product-links a {
  color: var(--vp-c-brand-1);
  font-size: 0.66rem;
  font-weight: 650;
  text-decoration: none;
}

.account-product-links a:hover {
  text-decoration: underline;
}

.account-product-empty {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 35px 20px;
  border: 1px dashed var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 13px;
  color: var(--vp-c-text-2);
  text-align: center;
  animation: account-product-enter 350ms ease both;
}

.account-product-empty strong {
  color: var(--vp-c-text-1);
  font-size: 0.92rem;
}

.account-empty-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  margin-bottom: 5px;
  border: 1px solid rgb(123 63 242 / 20%);
  border-radius: 13px;
  background: rgb(123 63 242 / 10%);
  color: var(--vp-c-brand-1);
  font-size: 1.4rem;
}

.account-product-empty > span:last-of-type {
  max-width: 390px;
  font-size: 0.78rem;
}

.account-product-empty button {
  margin-top: 8px;
  padding: 8px 11px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
}

@keyframes account-product-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .account-product-card,
  .account-product-empty { animation: none; }
  .account-product-card { transition: none; }
}
</style>
