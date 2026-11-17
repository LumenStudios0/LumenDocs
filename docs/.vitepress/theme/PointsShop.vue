<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { studioRequest } from './studio-api'
import { useSiteDialog } from './site-dialog'
import LoyaltyBadge from './LoyaltyBadge.vue'
import ProfileEffect from './ProfileEffect.vue'

interface Product { id: string; name: string; price: number; category: string; delivery: string; art: string; color: string; description: string }
interface Order { id: string; productId: string; name: string; price: number; state: string; details: { productName?: string; description?: string }; staffNote: string; createdAt: string; userId: string; memberName?: string }
interface Shop { userId: string; balance: number; products: Product[]; owned: string[]; orders: Order[]; choices: { productId: string; name: string }[]; productError: string; canManage: boolean; queue: Order[] }
interface Purchase { requestId: string; productId: string; pluginId?: string; description?: string }
const { confirm } = useSiteDialog()
const shop = ref<Shop | null>(null)
const signedIn = ref(false)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const category = ref('all')
const paused = ref(false)
const pluginId = ref('')
const description = ref('')
const notes = ref<Record<string, string>>({})
const categories = [{ id: 'all', name: 'Everything' }, { id: 'discounts', name: 'Discounts' }, { id: 'plugins', name: 'Plugins & upgrades' }, { id: 'cosmetics', name: 'Badges & effects' }]
const products = computed(() => (shop.value?.products || []).filter(product => category.value === 'all' || product.category === category.value))
const points = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })
const date = (value: string) => new Date(value).toLocaleString()
const owned = (product: Product) => !!shop.value?.owned.includes(product.id)
const pending = (product: Product) => !!shop.value?.orders.some(order => order.productId === product.id && ['pending','processing','review'].includes(order.state))
const delivery = (product: Product) => product.delivery === 'instant' ? 'Permanent unlock' : product.delivery === 'coupon' ? 'Single-use coupon' : 'Staff fulfilled'
const stateName = (state: string) => ({ pending: 'Awaiting staff', processing: 'Preparing coupon', review: 'Delivery under review', fulfilled: 'Delivered', refunded: 'Points refunded' }[state] || state)
let generation = 0, session = ''
const current = (request: number, token: string) => request === generation && token === getDiscordSession()
async function load() {
  const request = ++generation, token = getDiscordSession()
  session = token; signedIn.value = !!token; shop.value = null
  busy.value = false; error.value = ''; notice.value = ''; notes.value = {}; pluginId.value = ''; description.value = ''
  if (!token) { loading.value = false; return }
  loading.value = true
  try {
    const data = await studioRequest<Shop>('/points/shop')
    if (current(request, token)) shop.value = data
  } catch (value) {
    if (current(request, token)) error.value = value instanceof Error ? value.message : 'The shop could not be opened.'
  } finally { if (request === generation) loading.value = false }
}
async function buy(product: Product) {
  if (!shop.value || busy.value || owned(product) || pending(product)) return
  const request = generation, token = getDiscordSession(), userId = shop.value.userId
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const key = `lumen-shop-order:${userId}:${product.id}`
    const saved = sessionStorage.getItem(key)
    const body: Purchase = saved ? JSON.parse(saved) : {
      requestId: crypto.randomUUID(), productId: product.id,
      ...(product.id === 'free_product' ? { pluginId: pluginId.value } : {}),
      ...(product.id === 'commission' ? { description: description.value.trim() } : {}),
    }
    if (!body || body.productId !== product.id || typeof body.requestId !== 'string') throw new Error('The saved order is invalid. Contact support before trying this purchase again.')
    const detail = body.pluginId ? ` Plugin: ${shop.value.choices.find(item => item.productId === body.pluginId)?.name || body.pluginId}.` : body.description ? ` Request: ${body.description}` : ''
    const accepted = await confirm(`Spend ${points(product.price)} LP on ${product.name}?${detail} ${product.delivery === 'staff' ? 'Staff must deliver this reward; points are reserved now.' : ''}`, { title: 'Confirm shop purchase', confirmText: `Spend ${points(product.price)} LP` })
    if (!accepted || !current(request, token)) return
    sessionStorage.setItem(key, JSON.stringify(body))
    const data = await studioRequest<Shop>('/points/shop/redeem', { method: 'POST', body: JSON.stringify(body) })
    if (!current(request, token)) return
    shop.value = data
    sessionStorage.removeItem(key)
    const order = data.orders.find(item => item.id === body.requestId)
    notice.value = order?.state === 'refunded' ? 'The reward could not be delivered. Your points were returned.'
      : order?.state === 'review' || order?.state === 'processing' ? 'Your coupon is being checked. Do not buy it again; follow its status in your orders.'
      : product.delivery === 'instant' ? 'Unlocked permanently! Equip your new cosmetic in Edit profile.'
      : product.delivery === 'coupon' ? 'Your coupon is ready in Coupons.'
      : 'Order placed. Staff have been notified and will arrange delivery.'
  } catch (value) {
    if (current(request, token)) {
      error.value = `${value instanceof Error ? value.message : 'The purchase could not be confirmed.'} Refresh orders before retrying. This tab reuses the same saved request to prevent duplicate spending.`
      try {
        const fresh = await studioRequest<Shop>('/points/shop')
        if (current(request, token)) shop.value = fresh
      } catch (refreshError) {
        if (current(request, token)) error.value += ` Orders could not be refreshed: ${refreshError instanceof Error ? refreshError.message : 'Please try again later.'}`
      }
    }
  } finally { if (request === generation) busy.value = false }
}
async function fulfill(order: Order, state: 'fulfilled' | 'refunded') {
  if (busy.value) return
  const request = generation, token = getDiscordSession()
  busy.value = true; error.value = ''; notice.value = ''
  try {
    if (!await confirm(state === 'fulfilled' ? 'Confirm you already delivered this license, IP slot or agreed commission. This records delivery; it does not apply the licensing change.' : 'Cancel this undelivered order and return its points?', { title: 'Update staff fulfillment', confirmText: state === 'fulfilled' ? 'Record delivered' : 'Refund points' })) return
    if (!current(request, token)) return
    const data = await studioRequest<Shop>('/points/shop/fulfill', { method: 'POST', body: JSON.stringify({ orderId: order.id, state, note: notes.value[order.id] || '' }) })
    if (current(request, token)) { shop.value = data; notice.value = 'Order updated and member notified.' }
  } catch (value) { if (current(request, token)) error.value = value instanceof Error ? value.message : 'The order could not be updated. Refresh before retrying.' }
  finally { if (request === generation) busy.value = false }
}
function sessionChanged() { if (session !== getDiscordSession()) void load() }
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', sessionChanged); window.addEventListener('storage', sessionChanged) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', sessionChanged); window.removeEventListener('storage', sessionChanged) })
</script>

<template>
  <div class="lp-shop" :class="{ 'is-paused': paused }">
    <header class="shop-hero">
      <div class="shop-hero-aura" aria-hidden="true" /><div class="shop-hero-stars" aria-hidden="true"><i v-for="i in 12" :key="i" :style="{ '--i': i }" /></div>
      <div class="shop-heading"><a href="/account/points">&#8592; Lumen Points</a><p class="shop-eyebrow">THE LUMEN REWARDS COLLECTION</p><h1>Good points.<br><span>Great upgrades.</span></h1><p>Your next plugin, a little extra room, or a profile that feels like you. Turn your Lumen Points into something real.</p></div>
      <div class="shop-wallet"><span>YOUR SPENDING POWER</span><strong aria-live="polite">{{ shop ? points(shop.balance) : '—' }} <small>LP</small></strong><div class="shop-wallet-chip">LUMEN POINTS / MEMBER SHOP</div><a href="/account/points">Earn more points &#8594;</a></div>
      <button class="shop-motion" :aria-pressed="paused" @click="paused = !paused">{{ paused ? 'Resume effects' : 'Pause effects' }}</button>
    </header>
    <p v-if="!signedIn && !loading" class="shop-message">Sign in with Discord using Login / Signup to open your shop and rewards wallet.</p>
    <p v-if="loading" class="shop-message" role="status">Opening the rewards collection...</p>
    <p v-if="error" class="shop-message is-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="shop-message" role="status">{{ notice }}</p>
    <template v-if="shop">
      <div class="shop-toolbar"><div role="group" aria-label="Shop categories"><button v-for="item in categories" :key="item.id" :aria-pressed="category === item.id" @click="category = item.id">{{ item.name }}</button></div><a href="/account/profile">Edit profile &#8599;</a></div>
      <p v-if="shop.productError" class="shop-message is-error" role="alert">{{ shop.productError }}</p>
      <div class="shop-grid">
        <article v-for="product in products" :key="product.id" class="shop-product" :style="{ '--reward-color': product.color }" :class="{ 'is-owned': owned(product) }">
          <div class="shop-art" :data-art="product.art">
            <span class="shop-art-halo" /><span class="shop-art-ring" /><span class="shop-art-ring ring-two" /><i v-for="i in 5" :key="i" class="shop-art-spark" :style="{ '--i': i }" />
            <LoyaltyBadge v-if="product.art === 'badge'" class="shop-badge-preview" :tier="{ id: product.id, name: product.name.replace(' badge','') }" size="large" />
            <template v-else-if="product.art === 'effect'"><ProfileEffect :effect="product.id" /><div class="shop-profile-preview"><span>L</span><i /><i /><i /></div></template>
            <svg v-else viewBox="0 0 160 140" fill="none" aria-hidden="true" class="shop-illustration">
              <g v-if="product.art === 'coupon'"><path class="art-fill" d="M22 30H138V53C119 53 119 83 138 83V106H22V83C41 83 41 53 22 53Z" /><path d="M108 32V104" stroke-dasharray="5 6" /><text x="66" y="80" text-anchor="middle" fill="currentColor" stroke="none" font-size="32" font-weight="800">{{ product.id === 'coupon_5' ? '5%' : '10%' }}</text><path d="M46 96H82M46 40H76" /></g>
              <g v-else-if="product.art === 'gift'"><path class="art-fill" d="M28 53L80 26L132 53V103L80 130L28 103Z" /><path d="M28 53L80 80L132 53M80 80V130M55 39L107 66V116M53 118V66L105 39" /><path d="M80 26C35 29 44 0 64 10L80 26ZM80 26C122 28 118 0 97 10L80 26Z" /></g>
              <g v-else-if="product.art === 'server'"><rect class="art-fill" x="42" y="12" width="76" height="31" rx="8" /><rect class="art-fill" x="42" y="52" width="76" height="31" rx="8" /><path d="M56 27H75M56 67H75M80 85V113M28 113H132M28 105V121M132 105V121" /><circle cx="102" cy="27" r="3" /><circle cx="102" cy="67" r="3" /><circle class="art-fill" cx="80" cy="113" r="17" /><path d="M80 104V122M71 113H89" /></g>
              <g v-else><rect class="art-fill" x="17" y="20" width="126" height="91" rx="10" /><path d="M17 40H143M26 30H30M38 30H42M50 30H54M59 58L43 73L59 88M101 58L117 73L101 88M89 53L71 94M50 127H110M67 112L63 127M97 112L101 127" /></g>
            </svg>
            <span class="shop-art-tag">{{ owned(product) ? 'IN YOUR COLLECTION' : delivery(product) }}</span>
          </div>
          <div class="shop-product-body"><p class="shop-eyebrow">{{ product.category === 'cosmetics' ? 'MAKE IT YOURS' : product.category === 'discounts' ? 'YOUR NEXT CHECKOUT' : 'LEVEL UP YOUR SERVER' }}</p><h2>{{ product.name }}</h2><p>{{ product.description }}</p>
            <label v-if="product.id === 'free_product'">Choose your plugin<select v-model="pluginId" :disabled="busy || !!shop.productError"><option value="">Select a missing plugin</option><option v-for="choice in shop.choices" :key="choice.productId" :value="choice.productId">{{ choice.name }}</option></select></label>
            <label v-if="product.id === 'commission'">Your small plugin idea<textarea v-model="description" rows="3" minlength="20" maxlength="2000" placeholder="Features, server version, and what the plugin should do..." :disabled="busy" /></label>
            <div class="shop-product-bottom"><strong>{{ points(product.price) }} <small>LP</small></strong><button :disabled="busy || owned(product) || pending(product) || shop.balance < product.price || product.id === 'free_product' && (!pluginId || !!shop.productError) || product.id === 'commission' && description.trim().length < 20" @click="buy(product)">{{ owned(product) ? 'Owned' : pending(product) ? 'Order pending' : shop.balance < product.price ? `Need ${points(product.price - shop.balance)} LP` : 'Redeem' }} <span v-if="!owned(product) && !pending(product)" aria-hidden="true">&#8594;</span></button></div>
          </div>
        </article>
      </div>
      <section class="shop-orders" aria-labelledby="shop-orders-title"><div class="shop-section-heading"><div><p class="shop-eyebrow">YOUR REWARDS, TRACKED</p><h2 id="shop-orders-title">Your orders</h2></div><div><a href="/account/coupons">Coupons &#8599;</a><button :disabled="busy || loading" @click="load">Refresh orders</button></div></div>
        <p v-if="!shop.orders.length" class="shop-fine">Your first reward is waiting. Orders and delivery notes will appear here.</p>
        <article v-for="order in shop.orders" :key="order.id" class="shop-order"><div><strong>{{ order.name }}</strong><p>{{ order.details.productName || order.details.description }}</p><small>{{ date(order.createdAt) }} / {{ order.id }}</small><p v-if="order.staffNote">Staff: {{ order.staffNote }}</p></div><div><span class="shop-status" :data-state="order.state">{{ stateName(order.state) }}</span><strong>{{ points(order.price) }} LP</strong></div></article>
        <p class="shop-fine">Latest 50 orders. Staff fulfillment is not instant. If coupon delivery is uncertain, points stay reserved until it is verified; confirmed creation failures are refunded automatically.</p>
      </section>
      <section v-if="shop.canManage" class="shop-staff" aria-labelledby="shop-staff-title"><div class="shop-section-heading"><div><p class="shop-eyebrow">STAFF FULFILLMENT / FIRST 100 OPEN ORDERS</p><h2 id="shop-staff-title">Deliver the good stuff.</h2></div></div><p class="shop-fine">Apply the license or +1 account IP allowance in the licensing system first, or complete the agreed small commission. Then record delivery with a reference. This queue records the result; it does not change the licensing server. Refund only undelivered requests. Coupon reviews reconcile automatically and cannot be manually marked delivered here.</p>
        <p v-if="!shop.queue.length">Everything is caught up.</p><article v-for="order in shop.queue" :key="order.id" class="shop-staff-order"><strong>{{ order.memberName }} / {{ order.name }}</strong><small>{{ order.userId }} / {{ order.id }}</small><p>{{ order.details.productName || order.details.description || '+1 account IP slot' }}</p><span class="shop-status">{{ stateName(order.state) }}</span><template v-if="order.state === 'pending'"><label>Delivery reference or refund reason<textarea v-model="notes[order.id]" minlength="5" maxlength="1000" rows="2" /></label><div><button :disabled="busy || (notes[order.id] || '').trim().length < 5" @click="fulfill(order,'fulfilled')">Record delivered</button><button :disabled="busy || (notes[order.id] || '').trim().length < 5" @click="fulfill(order,'refunded')">Refund points</button></div></template></article>
      </section>
      <footer class="shop-fine">Points have no cash value. Badges are cosmetic, not staff permissions. Free products do not earn purchase points or advance point milestones. Small commissions are subject to an agreed scope; if staff cannot fulfill an undelivered reward, they can refund its points.</footer>
    </template>
  </div>
</template>

<style scoped>
.lp-shop{--shop-ink:#f4edff;--shop-muted:#b8a9cc;display:grid;gap:28px;padding-bottom:35px}
.lp-shop button,.lp-shop select,.lp-shop textarea{font:inherit}
.lp-shop button{cursor:pointer;border:1px solid var(--vp-c-divider);border-radius:9px;padding:9px 13px;background:var(--vp-c-bg-soft);color:var(--vp-c-text-1);font-size:12px}
.lp-shop button:disabled{opacity:.45;cursor:not-allowed}.lp-shop :is(button,a,select,textarea):focus-visible{outline:2px solid #c4a0ff;outline-offset:4px}
.shop-hero{position:relative;isolation:isolate;overflow:hidden;display:grid;grid-template-columns:1.2fr 1fr;gap:35px;align-items:center;padding:40px 36px 62px;border:1px solid #9a6bc04d;border-radius:25px;background:#100b1b;color:var(--shop-ink)}
.shop-hero-aura{position:absolute;z-index:-1;inset:-90%;background:conic-gradient(from 25deg,transparent 25%,#a749e32b,#54b6bd16,transparent 65%);animation:shop-turn 40s linear infinite}
.shop-heading>a{font-size:11px;color:#c5a5ef;text-decoration:none}.shop-heading h1{margin:16px 0;font-size:clamp(34px,4vw,51px);font-weight:850;line-height:1.04;letter-spacing:-2px;border:0}.shop-heading h1 span{color:#c79bff}.shop-heading>p:last-child{font-size:13px;color:var(--shop-muted);line-height:1.8;max-width:390px}
.shop-eyebrow{margin:22px 0 10px;font-size:9px;font-weight:800;letter-spacing:1.6px;color:#ac80d9}
.shop-wallet{position:relative;overflow:hidden;min-width:0;transform:rotate(-3deg);border:1px solid #b98bea66;border-radius:18px;padding:25px;background:linear-gradient(130deg,#6e3c9b55,#22182c);box-shadow:0 20px 50px #0005,inset 0 1px #e8caff33;animation:shop-wallet-float 8s ease-in-out infinite}
.shop-wallet::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(110deg,transparent 25%,#d1aaff15 50%,transparent 75%);animation:shop-shine 9s ease-in-out infinite}
.shop-wallet>span{font-size:9px;letter-spacing:1.5px;color:#cab6df}.shop-wallet>strong{display:block;font-size:clamp(26px,3.8vw,42px);line-height:1.5;overflow-wrap:anywhere;letter-spacing:-1px}.shop-wallet small{font-size:15px;color:#cfa9f3}.shop-wallet-chip{margin:18px 0 20px;font-size:8px;letter-spacing:1.5px;color:#bea6d7;border-top:1px solid #d5b9ef22;padding-top:16px}.shop-wallet a{font-size:11px;color:#dec3ff}
.shop-motion{position:absolute;right:24px;bottom:15px;border:0!important;background:transparent!important;color:#b39ac9!important;font-size:10px!important}
.shop-hero-stars{position:absolute;inset:0;z-index:-1}.shop-hero-stars i{position:absolute;left:calc(var(--i)*8%);top:calc(8% + mod(var(--i)*19,80)*1%);width:2px;height:2px;background:#dcb9ff;box-shadow:0 0 14px #9c62ff;animation:shop-spark 5s ease-in-out infinite;animation-delay:calc(var(--i)*-.6s)}
.shop-message{padding:15px 20px;border:1px solid var(--vp-c-brand-2);background:var(--vp-c-brand-soft);border-radius:12px;font-size:13px;overflow-wrap:anywhere}.shop-message.is-error{border-color:var(--vp-c-danger-2);color:var(--vp-c-danger-1)}
.shop-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.shop-toolbar>div{display:flex;gap:5px;flex-wrap:wrap}.shop-toolbar [aria-pressed=true]{border-color:#b388f0;background:#9c61db20;color:var(--vp-c-brand-1)}.shop-toolbar>a{font-size:12px}
.shop-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.shop-product{position:relative;display:flex;flex-direction:column;min-width:0;border:1px solid var(--vp-c-divider);border-radius:18px;overflow:hidden;background:var(--vp-c-bg-soft);transition:transform .25s,border-color .25s,box-shadow .25s}
.shop-product:hover{transform:translateY(-5px);border-color:color-mix(in srgb,var(--reward-color) 60%,transparent);box-shadow:0 14px 40px #0002}
.shop-art{position:relative;isolation:isolate;display:grid;place-items:center;height:195px;overflow:hidden;background:radial-gradient(ellipse at 50% 70%,color-mix(in srgb,var(--reward-color) 18%,transparent),transparent 75%),#120e1d;color:var(--reward-color)}
.shop-art-halo{position:absolute;inset:20% 5%;border-radius:50%;background:var(--reward-color);opacity:.09;filter:blur(24px);animation:shop-glow 5s ease-in-out infinite}
.shop-art-ring{position:absolute;width:135px;height:135px;border:1px dashed color-mix(in srgb,var(--reward-color) 28%,transparent);border-radius:50%;animation:shop-turn 35s linear infinite}.shop-art-ring.ring-two{width:165px;height:165px;border-style:solid;opacity:.3;transform:rotateX(58deg)}
.shop-illustration{position:relative;width:145px;height:140px;stroke:currentColor;stroke-width:2;stroke-linejoin:round;filter:drop-shadow(0 5px 16px color-mix(in srgb,var(--reward-color) 25%,transparent));animation:shop-art-float 7s ease-in-out infinite}
.art-fill{fill:color-mix(in srgb,var(--reward-color) 12%,#15101f)}.shop-art-spark{position:absolute;left:calc(10% + var(--i)*16%);top:calc(8% + mod(var(--i)*23,75)*1%);width:3px;height:3px;border-radius:50%;background:var(--reward-color);box-shadow:0 0 10px currentColor;animation:shop-spark 4s ease-in-out infinite;animation-delay:calc(var(--i)*-.7s)}
.shop-art-tag{position:absolute;bottom:12px;left:14px;color:#cfc0e2;font-size:8px;letter-spacing:1.2px;text-transform:uppercase}.shop-badge-preview{position:relative;transform:scale(1.2);animation:shop-art-float 7s ease-in-out infinite}
.shop-profile-preview{position:relative;display:grid;gap:8px;width:110px;padding:20px;border:1px solid #c0a1df50;border-radius:12px;background:#1a122988;backdrop-filter:blur(4px);animation:shop-art-float 7s ease-in-out infinite}.shop-profile-preview span{display:grid;place-items:center;width:35px;height:35px;border-radius:50%;background:#a473d744;font-weight:800;color:#e3caff}.shop-profile-preview i{height:3px;background:#b89acc66;border-radius:3px}.shop-profile-preview i:last-child{width:60%}
.shop-product-body{display:flex;flex-direction:column;flex:1;padding:20px;gap:12px}.shop-product-body>.shop-eyebrow{margin:0;font-size:8px;letter-spacing:1px}.shop-product-body>h2{border:0;padding:0;margin:0;font-size:19px;line-height:1.3;letter-spacing:-.4px}.shop-product-body>p:not(.shop-eyebrow){margin:0;font-size:12px;line-height:1.8;color:var(--vp-c-text-2)}
.shop-product-bottom{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:auto;padding-top:15px}.shop-product-bottom>strong{font-size:22px;letter-spacing:-1px;white-space:nowrap}.shop-product-bottom small{font-size:10px;color:var(--vp-c-text-2);letter-spacing:0}.shop-product-bottom button{font-size:10px;background:color-mix(in srgb,var(--reward-color) 10%,var(--vp-c-bg));border-color:color-mix(in srgb,var(--reward-color) 35%,transparent);padding:9px 10px}.shop-product-bottom button span{margin-left:7px}.is-owned{border-color:#8ad9b64d}.is-owned .shop-art-tag{color:#a7e8ce}
.lp-shop label{display:grid;gap:6px;font-size:11px;color:var(--vp-c-text-2)}.lp-shop :is(select,textarea){width:100%;min-width:0;border:1px solid var(--vp-c-divider);border-radius:8px;padding:9px;background:var(--vp-c-bg);color:var(--vp-c-text-1);font-size:12px}.lp-shop textarea{resize:vertical}
.shop-section-heading{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;margin-bottom:18px}.shop-section-heading h2{border:0;margin:0;padding:0;font-size:25px;letter-spacing:-.7px}.shop-section-heading .shop-eyebrow{margin:0 0 8px}.shop-section-heading>div:last-child>a{font-size:12px;margin-right:15px}
.shop-orders,.shop-staff{padding:25px;border:1px solid var(--vp-c-divider);border-radius:18px}.shop-order{display:flex;justify-content:space-between;gap:15px;padding:18px 0;border-top:1px solid var(--vp-c-divider);font-size:12px}.shop-order>div:first-child{min-width:0;overflow-wrap:anywhere}.shop-order>div:last-child{display:flex;align-items:flex-end;flex-direction:column;gap:10px;flex-shrink:0}.shop-order p{margin:5px 0;color:var(--vp-c-text-2);white-space:pre-wrap}.shop-order small,.shop-staff-order>small{font-size:10px;color:var(--vp-c-text-3)}
.shop-status{display:inline-block;font-size:9px;border:1px solid #c49aff44;color:var(--vp-c-brand-1);padding:4px 8px;border-radius:20px}.shop-status[data-state=fulfilled]{color:#4bab88;border-color:#4bab8855}.shop-status[data-state=refunded]{color:var(--vp-c-text-2)}
.shop-fine{font-size:11px!important;line-height:1.8;color:var(--vp-c-text-2)}.shop-staff{background:var(--vp-c-bg-soft)}.shop-staff-order{display:grid;gap:10px;padding:20px 0;border-top:1px solid var(--vp-c-divider);overflow-wrap:anywhere}.shop-staff-order p{margin:0;white-space:pre-wrap;font-size:12px}.shop-staff-order>.shop-status{justify-self:start}.shop-staff-order>div{display:flex;gap:10px}
.is-paused :deep(*),.is-paused :deep(*::before),.is-paused :deep(*::after){animation-play-state:paused!important}
@keyframes shop-turn{to{rotate:360deg}}@keyframes shop-wallet-float{50%{transform:rotate(-1deg) translateY(-6px)}}@keyframes shop-art-float{50%{translate:0 -8px;rotate:2deg}}@keyframes shop-spark{50%{opacity:.15;translate:0 -10px}}@keyframes shop-glow{50%{opacity:.2;scale:1.2}}@keyframes shop-shine{0%,100%{translate:-100% 0}50%{translate:100% 0}}
@media(max-width:1100px){.shop-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.shop-hero{grid-template-columns:1fr;padding:25px 22px 55px;gap:20px}.shop-wallet{transform:none;animation:none}.shop-grid{grid-template-columns:1fr}.shop-art{height:205px}.shop-orders,.shop-staff{padding:20px 16px}.shop-order{flex-wrap:wrap}.shop-order>div:last-child{align-items:flex-start;flex-direction:row;flex-wrap:wrap}.shop-heading h1{font-size:39px}.shop-toolbar button{font-size:10px}}
@media(prefers-reduced-motion:reduce){.lp-shop :deep(*),.lp-shop :deep(*::before),.lp-shop :deep(*::after){animation:none!important;transition:none!important}}
</style>
