<script setup lang="ts">
import { ref } from 'vue'
import type { ServerShowcase } from './profile-types'
const props = defineProps<{ servers: ServerShowcase[]; editable?: boolean }>()
const emit = defineEmits<{ change: [servers: ServerShowcase[]] }>()
const message = ref('')
function update(index: number, patch: Partial<ServerShowcase>) {
  emit('change', props.servers.map((server, i) => i === index ? { ...server, ...patch } : patch.featured ? { ...server, featured: false } : server))
}
function field(index: number, key: keyof Omit<ServerShowcase, 'screenshots' | 'featured'>, event: Event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) update(index, { [key]: event.target.value })
}
function add() {
  if (props.servers.length >= 3) return
  emit('change', [...props.servers, { name: '', description: '', javaAddress: '', bedrockAddress: '', version: '', gamemodes: '', plugins: '',
    website: '', discord: '', trailer: '', logo: '', screenshots: [], featured: !props.servers.length }])
}
function screenshot(index: number, image: number, key: 'url' | 'alt', event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const value = event.target.value
  update(index, { screenshots: props.servers[index].screenshots.map((entry, i) => i === image ? { ...entry, [key]: value } : entry) })
}
async function copy(address: string) {
  try { await navigator.clipboard.writeText(address); message.value = 'Join address copied.' }
  catch { message.value = 'Clipboard access was denied. Select and copy the address manually.' }
}
</script>
<template>
  <section class="server-showcases" aria-label="Minecraft server showcases">
    <h3>Minecraft servers</h3><p v-if="message" role="status">{{ message }}</p>
    <p v-if="editable">Show up to 3 servers, each with 4 screenshots. Server details and plugin labels are self-reported, not verified live status.</p>
    <article v-for="(server,index) in servers" :key="index" class="server-showcase" :class="{featured:server.featured}">
      <template v-if="editable">
        <div class="showcase-heading"><strong>Server {{ index+1 }}</strong><button type="button" @click="emit('change',servers.filter((_,i)=>i!==index))">Remove server</button></div>
        <label>Server name<input :value="server.name" required maxlength="60" @input="field(index,'name',$event)"></label>
        <label>Description<textarea :value="server.description" maxlength="400" rows="3" @input="field(index,'description',$event)" /></label>
        <div class="showcase-fields">
          <label>Java join address<input :value="server.javaAddress" maxlength="100" placeholder="play.example.net:25565" @input="field(index,'javaAddress',$event)"></label>
          <label>Bedrock join address<input :value="server.bedrockAddress" maxlength="100" placeholder="bedrock.example.net:19132" @input="field(index,'bedrockAddress',$event)"></label>
          <label>Minecraft versions<input :value="server.version" maxlength="40" placeholder="1.21.x" @input="field(index,'version',$event)"></label>
          <label>Gamemodes<input :value="server.gamemodes" maxlength="100" placeholder="Survival, Skyblock" @input="field(index,'gamemodes',$event)"></label>
        </div>
        <label>Built with Lumen (plugin labels)<input :value="server.plugins" maxlength="120" placeholder="Only list plugins you actually use" @input="field(index,'plugins',$event)"></label>
        <label v-for="link in (['website','discord','trailer','logo'] as const)" :key="link">{{ link === 'logo' ? 'Logo image URL' : link }}<input :value="server[link]" type="url" maxlength="500" placeholder="https://" @input="field(index,link,$event)"></label>
        <label class="featured-toggle"><input :checked="server.featured" type="checkbox" @change="update(index,{featured:!server.featured})"> Featured server</label>
        <div v-for="(image,i) in server.screenshots" :key="i" class="showcase-screenshot-edit">
          <label>Screenshot {{ i+1 }} URL<input :value="image.url" type="url" required maxlength="500" placeholder="https://" @input="screenshot(index,i,'url',$event)"></label>
          <label>Image description<input :value="image.alt" maxlength="120" @input="screenshot(index,i,'alt',$event)"></label>
          <button type="button" @click="update(index,{screenshots:server.screenshots.filter((_,n)=>n!==i)})">Remove screenshot</button>
        </div>
        <button v-if="server.screenshots.length<4" type="button" @click="update(index,{screenshots:[...server.screenshots,{url:'',alt:''}]})">Add screenshot</button>
      </template>
      <template v-else>
        <div class="showcase-heading"><img v-if="server.logo" :src="server.logo" alt="" loading="lazy" referrerpolicy="no-referrer"><div><small v-if="server.featured">FEATURED SERVER</small><h4>{{ server.name }}</h4></div></div>
        <p>{{ server.description }}</p><p v-if="server.version || server.gamemodes" class="showcase-meta">{{ server.version }} <span v-if="server.gamemodes">/ {{ server.gamemodes }}</span></p>
        <div class="showcase-addresses"><button v-if="server.javaAddress" type="button" @click="copy(server.javaAddress)">Java: {{ server.javaAddress }} / Copy</button><button v-if="server.bedrockAddress" type="button" @click="copy(server.bedrockAddress)">Bedrock: {{ server.bedrockAddress }} / Copy</button></div>
        <p v-if="server.plugins" class="showcase-meta">Built with Lumen: {{ server.plugins }}</p>
        <div class="showcase-links"><a v-if="server.website" :href="server.website" target="_blank" rel="noopener noreferrer">Website</a><a v-if="server.discord" :href="server.discord" target="_blank" rel="noopener noreferrer">Discord</a><a v-if="server.trailer" :href="server.trailer" target="_blank" rel="noopener noreferrer">Watch trailer</a></div>
        <div class="showcase-gallery"><a v-for="(image,i) in server.screenshots" :key="i" :href="image.url" target="_blank" rel="noopener noreferrer"><img :src="image.url" :alt="image.alt || `${server.name} screenshot ${i+1}`" loading="lazy" referrerpolicy="no-referrer"></a></div>
      </template>
    </article>
    <button v-if="editable && servers.length<3" type="button" @click="add">Add Minecraft server</button>
  </section>
</template>
<style scoped>
.server-showcases{margin-top:24px;min-width:0}.server-showcases h3{font-size:14px}.server-showcases p{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--vp-c-text-2)}
.server-showcase{margin:12px 0;padding:16px;border:1px solid var(--vp-c-divider);border-radius:12px;min-width:0}.server-showcase.featured{border-color:var(--profile-accent,var(--vp-c-brand-1))}
.showcase-heading{display:flex;align-items:center;gap:12px;justify-content:space-between}.showcase-heading h4{margin:0;font-size:16px;overflow-wrap:anywhere}.showcase-heading small{font-size:9px;color:var(--vp-c-brand-1)}.showcase-heading img{width:42px;height:42px;border-radius:9px;object-fit:cover}.showcase-heading>div{flex:1;min-width:0}
.showcase-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.server-showcases label{display:grid;gap:6px;font-size:12px;margin:12px 0}.server-showcases input:not([type=checkbox]),.server-showcases textarea{width:100%;padding:9px;border:1px solid var(--vp-c-divider);border-radius:8px;background:var(--vp-c-bg);color:var(--vp-c-text-1)}
.server-showcases .featured-toggle{display:flex;align-items:center;gap:8px}.showcase-addresses,.showcase-links{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.server-showcases button{font-size:11px;padding:8px;border:1px solid var(--vp-c-divider);border-radius:8px;background:var(--vp-c-bg-soft);overflow-wrap:anywhere;max-width:100%}.showcase-links a{font-size:12px;color:var(--vp-c-brand-1)}
.showcase-gallery{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.showcase-gallery img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px}.showcase-screenshot-edit{padding:10px;margin:10px 0;border:1px dashed var(--vp-c-divider);border-radius:8px}
@media(max-width:480px){.showcase-fields{grid-template-columns:1fr}}
</style>
