<script setup lang="ts">
import { computed, ref } from 'vue'

type Product = {
  name: string
  price: string
  url: string
}

const products: Product[] = [
  { name: 'Gladiator', price: '$19.99', url: 'https://builtbybit.com/resources/gladiator.132519/' },
  { name: 'LumenAuction', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenauction.132967/' },
  { name: 'LumenBounty', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenbounty.132973/' },
  { name: 'LumenDuels', price: '$12.99', url: 'https://builtbybit.com/resources/lumenduels.119760/' },
  { name: 'LumenDuels Premium', price: '$18.99', url: 'https://builtbybit.com/resources/lumenduels-premium.132188/' },
  { name: 'LumenEconomy', price: '$5.99', url: 'https://builtbybit.com/resources/lumeneconomy.132341/' },
  { name: 'LumenEssentials', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenessentials.132966/' },
  { name: 'LumenOrder', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenorders.132969/' },
  { name: 'LumenShards', price: '$8.99', url: 'https://builtbybit.com/resources/lumenshards.116897/' },
  { name: 'LumenSpoofer', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenspoof.135950/' },
  { name: 'LumenSpawners', price: 'See current listing', url: 'https://builtbybit.com/resources/lumenspawners.132970/' },
]

const selectedCategory = ref<'owned' | 'not-owned'>('owned')
const visibleProducts = computed(() => selectedCategory.value === 'owned' ? [] : products)
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
        Owned products
      </button>
      <button
        id="not-owned-tab"
        type="button"
        role="tab"
        :aria-selected="selectedCategory === 'not-owned'"
        aria-controls="account-products-panel"
        @click="selectedCategory = 'not-owned'"
      >
        Not owned
      </button>
    </div>

    <div
      id="account-products-panel"
      class="account-product-panel"
      role="tabpanel"
      :aria-labelledby="selectedCategory === 'owned' ? 'owned-products-tab' : 'not-owned-tab'"
    >
      <p class="account-product-note">
        Purchase history will connect here later. Until then, products are listed as not owned.
        Prices may change; verify the current amount on BuiltByBit.
      </p>
      <div v-if="visibleProducts.length" class="account-product-grid">
        <article v-for="product in visibleProducts" :key="product.name" class="account-product-card">
          <div>
            <h2>{{ product.name }}</h2>
            <p class="account-product-price">{{ product.price }}</p>
          </div>
          <a :href="product.url" target="_blank" rel="noreferrer">
            View price &amp; buy <span aria-hidden="true">↗</span>
          </a>
        </article>
      </div>
      <div v-else class="account-product-empty">
        <strong>No owned products found</strong>
        <span>Purchased products will appear here when account purchases are connected.</span>
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

.account-product-tabs button:focus-visible,
.account-product-card a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.account-product-note {
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
}

.account-product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
}

.account-product-card {
  display: flex;
  min-height: 135px;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 17px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 13px;
  background: var(--lumen-card-bg, var(--vp-c-bg-soft));
}

.account-product-card h2 {
  margin: 0;
  border: 0;
  font-size: 1rem;
}

.account-product-price {
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
}

.account-product-card a {
  width: fit-content;
  color: var(--vp-c-brand-1);
  font-size: 0.82rem;
  font-weight: 650;
  text-decoration: none;
}

.account-product-card a:hover {
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
}

.account-product-empty strong {
  color: var(--vp-c-text-1);
}
</style>
