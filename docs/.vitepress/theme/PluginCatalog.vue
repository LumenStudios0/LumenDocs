<script setup lang="ts">
import { computed, ref } from 'vue'

const categories = ['All plugins', 'Economy', 'PvP', 'Server tools', 'Coming soon']
const selectedCategory = ref('All plugins')
const searchQuery = ref('')
const categoryRail = ref<HTMLElement | null>(null)

const plugins = [
  { name: 'LumenAuction', category: 'Economy', description: 'A player-run marketplace with listings, history, and expired item claims.', href: '/products/lumen-auction', store: 'https://builtbybit.com/resources/lumenauction.132967/' },
  { name: 'LumenBounty', category: 'Economy', description: 'Put a bounty on a player and give rivals a reason to hunt them.', href: '/products/lumen-bounty', store: 'https://builtbybit.com/resources/lumenbounty.132973/' },
  { name: 'LumenEconomy', category: 'Economy', description: 'Player payments, item sales, and an easy way to check what loot is worth.', href: '/products/lumen-economy', store: 'https://builtbybit.com/resources/lumeneconomy.132341/' },
  { name: 'LumenOrder', category: 'Economy', description: 'Player buy orders that other players can fill for a payout.', href: '/products/lumen-order', store: 'https://builtbybit.com/resources/lumenorders.132969/' },
  { name: 'LumenShards', category: 'Economy', description: 'AFK shard rewards and a shop where players can spend their earnings.', href: '/products/lumen-shards', store: 'https://builtbybit.com/resources/lumenshards.116897/' },
  { name: 'Gladiator', category: 'PvP', description: 'Server-side security checks and practical tools for your staff.', href: '/products/gladiator', store: 'https://builtbybit.com/resources/gladiator.132519/' },
  { name: 'LumenDuels', category: 'PvP', description: 'Practice duels with arenas, matchmaking, and a clean player flow.', href: '/products/lumen-duels', store: 'https://builtbybit.com/resources/lumenduels.119760/' },
  { name: 'LumenDuels Premium', category: 'PvP', description: 'Ranked practice PvP with Elo, queues, and rewards.', href: '/products/lumen-duels-premium', store: 'https://builtbybit.com/resources/lumenduels-premium.132188/' },
  { name: 'LumenEssentials', category: 'Server tools', description: 'A focused set of staff tools for moderation and server operations.', href: '/products/lumen-essentials', store: 'https://builtbybit.com/resources/lumenessentials.132966/' },
  { name: 'LumenSpawners', category: 'Server tools', description: 'Virtual spawners that produce drops without crowding your world with mobs.', href: '/products/lumen-spawners', store: 'https://builtbybit.com/resources/lumenspawners.132970/' },
  { name: 'LumenSpoofer', category: 'Server tools', description: 'Player-like NPCs that explore, gather, and work together.', href: '/products/lumen-spoofer', store: 'https://builtbybit.com/resources/lumenspoof.135950/' },
  { name: 'LumenTeam', category: 'Coming soon', description: 'A new set of tools for your server crew is in development.', href: '/coming-soon?product=LumenTeam' },
  { name: 'LumenIntellegance', category: 'Coming soon', description: 'More details will be shared as development progresses.', href: '/coming-soon?product=LumenIntellegance' },
  { name: 'Sentinel', category: 'Coming soon', description: 'A new sentry is on the way. Product details are coming soon.', href: '/coming-soon?product=Sentinel' },
]

const visiblePlugins = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return plugins.filter(plugin =>
    (selectedCategory.value === 'All plugins' || plugin.category === selectedCategory.value) &&
    (!query || `${plugin.name} ${plugin.category} ${plugin.description}`.toLowerCase().includes(query)),
  )
})

function scrollCategories(direction: -1 | 1) {
  categoryRail.value?.scrollBy({ left: direction * 220, behavior: 'smooth' })
}
</script>

<template>
  <section class="plugin-catalog" aria-label="Browse Lumen Studios plugins">
    <div class="plugin-catalog-toolbar">
      <label class="plugin-catalog-search">
        <span class="sr-only">Search plugins</span>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></svg>
        <input v-model="searchQuery" type="search" placeholder="Search plugins" autocomplete="off">
      </label>
      <span class="plugin-catalog-count">{{ visiblePlugins.length }} {{ visiblePlugins.length === 1 ? 'plugin' : 'plugins' }}</span>
    </div>

    <div class="plugin-category-slider">
      <button class="plugin-category-arrow" type="button" aria-label="Scroll categories left" @click="scrollCategories(-1)">←</button>
      <nav ref="categoryRail" class="plugin-category-rail" aria-label="Filter plugins by category">
        <button
          v-for="category in categories"
          :key="category"
          type="button"
          :aria-pressed="selectedCategory === category"
          @click="selectedCategory = category"
        >
          {{ category }}
        </button>
      </nav>
      <button class="plugin-category-arrow" type="button" aria-label="Scroll categories right" @click="scrollCategories(1)">→</button>
    </div>

    <div v-if="visiblePlugins.length" class="plugin-grid">
      <article v-for="plugin in visiblePlugins" :key="plugin.name" class="plugin-card" :class="{ 'plugin-card-coming': !plugin.store }">
        <a class="plugin-card-main" :href="plugin.href">
          <span class="plugin-card-category">{{ plugin.category }}</span>
          <strong>{{ plugin.name }}</strong>
          <span>{{ plugin.description }}</span>
          <span class="plugin-card-link">Explore guide <span aria-hidden="true">→</span></span>
        </a>
        <a v-if="plugin.store" class="plugin-card-store" :href="plugin.store" target="_blank" rel="noreferrer">View on BuiltByBit</a>
        <a v-else class="plugin-card-store" :href="plugin.href">Coming soon</a>
      </article>
    </div>
    <p v-else class="plugin-catalog-empty">No plugins match that search. Try another name or category.</p>
  </section>
</template>
