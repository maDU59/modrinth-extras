<template>
	<div
		v-if="open"
		class="fixed inset-0 z-[99999] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
		@mousedown.self="close"
	>
		<div
			class="w-[min(680px,calc(100vw-32px))] overflow-hidden rounded-xl border border-divider bg-bg-raised shadow-2xl"
		>
			<!-- Fake input field wrapping tags + real input -->
			<div class="border-b border-divider p-3">
				<div
					class="flex min-h-[42px] cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-divider bg-bg px-3 py-2"
					@click="inputEl?.focus()"
				>
					<div
						v-for="tag in tags"
						:key="`${tag.facet}:${tag.value}`"
						class="inline-flex shrink-0 items-center gap-1 rounded bg-highlight px-2 py-0.5 text-[13px] font-medium text-brand"
					>
						<span>{{ tag.facet }}:{{ tag.value }}</span>
						<button
							class="cursor-pointer rounded border-0 bg-transparent p-0.5 text-brand/60 hover:text-brand"
							@click.stop="removeTag(tag.facet, tag.value)"
						>
							×
						</button>
					</div>
					<input
						ref="inputEl"
						v-model="query"
						:placeholder="activePlaceholder"
						class="min-w-[80px] flex-1 caret-brand !border-0 !bg-transparent p-0 text-[15px] text-primary !shadow-none !outline-none focus:!border-0 focus:!ring-0 focus:!shadow-none [font-family:inherit]"
						@keydown="onKeydown"
					/>
				</div>
			</div>

			<!-- Suggestions (while typing) -->
			<ul v-if="suggestions.length" class="m-0 max-h-80 list-none overflow-y-auto p-1.5">
				<li
					v-for="(s, i) in suggestions"
					:key="s.id"
					:ref="(el) => (suggestionEls[i] = el as HTMLElement | null)"
					:class="[
						'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-primary',
						i === selectedIndex ? 'bg-button-bg' : '',
					]"
					@click="selectSuggestion(s)"
					@mouseenter="selectedIndex = i"
				>
					<component :is="s.icon" aria-hidden="true" class="size-4 shrink-0 text-secondary" />
					<span class="min-w-0 flex-1">
						<span v-if="s.facet" class="mr-0.5 font-semibold text-brand">{{ s.facet }}:</span
						>{{ s.label }}
					</span>
					<kbd
						v-if="i === selectedIndex"
						class="shrink-0 rounded border border-divider bg-button-bg px-1.5 py-0.5 text-[11px] text-secondary [font-family:inherit]"
						>↵</kbd
					>
				</li>
			</ul>

			<!-- Examples panel (idle state: no query, no tags) -->
			<div v-else-if="!query && !tags.length" class="p-1.5">
				<div
					v-for="ex in EXAMPLES"
					:key="ex.label"
					class="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-button-bg"
					@click="applyExample(ex)"
				>
					<SearchIcon aria-hidden="true" class="size-4 shrink-0 text-secondary" />
					<span class="text-sm text-secondary">{{ ex.label }}</span>
					<div class="ml-auto flex flex-wrap justify-end gap-1">
						<span
							v-for="t in ex.tags"
							:key="`${t.facet}:${t.value}`"
							class="rounded bg-highlight px-1.5 py-0.5 text-[11px] font-medium text-brand"
							>{{ t.facet }}:{{ t.value }}</span
						>
					</div>
				</div>
			</div>

			<!-- Tags-only state: show search prompt -->
			<div v-else-if="tags.length" class="p-1.5">
				<div
					class="flex cursor-pointer items-center gap-2.5 rounded-lg bg-button-bg px-2.5 py-2 text-sm text-primary"
					@click="executeSearch"
				>
					<SearchIcon aria-hidden="true" class="size-4 shrink-0 text-secondary" />
					<span class="flex-1">Search</span>
					<kbd
						class="shrink-0 rounded border border-divider bg-button-bg px-1.5 py-0.5 text-[11px] text-secondary [font-family:inherit]"
						>↵</kbd
					>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { CpuIcon, HashIcon, PackageIcon, SearchIcon, TagIcon } from '@modrinth/assets'
import { type Component, computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useBaseFetch } from '../composables/useBaseFetch'

interface Tag {
	facet: string
	value: string
}

interface Suggestion {
	id: string
	icon: Component
	label: string
	facet?: string
	value?: string
	action: 'add-tag' | 'search'
}

interface Example {
	label: string
	tags: Tag[]
}

const TYPES = ['mod', 'plugin', 'datapack', 'shader', 'resourcepack', 'modpack', 'server']

const loaders = ref<string[]>([])
const categories = ref<string[]>([])
const serverCategories = ref<string[]>([])
const versions = ref<string[]>([])

const EXAMPLES: Example[] = [
	{
		label: 'fabric optimization mod',
		tags: [
			{ facet: 'loader', value: 'fabric' },
			{ facet: 'category', value: 'optimization' },
			{ facet: 'type', value: 'mod' },
		],
	},
	{
		label: 'forge technology',
		tags: [
			{ facet: 'loader', value: 'forge' },
			{ facet: 'category', value: 'technology' },
		],
	},
	{
		label: '1.21.4 shader',
		tags: [
			{ facet: 'version', value: '1.21.4' },
			{ facet: 'type', value: 'shader' },
		],
	},
	{
		label: 'neoforge library',
		tags: [
			{ facet: 'loader', value: 'neoforge' },
			{ facet: 'category', value: 'library' },
		],
	},
	{
		label: 'datapack food',
		tags: [
			{ facet: 'type', value: 'datapack' },
			{ facet: 'category', value: 'food' },
		],
	},
	{
		label: 'server skyblock',
		tags: [
			{ facet: 'type', value: 'server' },
			{ facet: 'category', value: 'skyblock' },
		],
	},
]

const PLACEHOLDER_EXAMPLES = EXAMPLES.map((e) => e.label)

const TYPE_PATH: Record<string, string> = {
	mod: '/discover/mods',
	plugin: '/discover/plugins',
	datapack: '/discover/datapacks',
	shader: '/discover/shaders',
	resourcepack: '/discover/resourcepacks',
	modpack: '/discover/modpacks',
	server: '/discover/servers',
}

const open = ref(false)
const query = ref('')
const tags = ref<Tag[]>([])
const selectedIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const suggestionEls = ref<(HTMLElement | null)[]>([])

// --- Placeholder animation ---
const animatedText = ref('')
let animTimer: ReturnType<typeof setTimeout> | null = null

function stopAnimation() {
	if (animTimer) clearTimeout(animTimer)
	animTimer = null
	animatedText.value = ''
}

function startAnimation() {
	let exIdx = 0
	let charIdx = 0
	let deleting = false

	function tick() {
		if (!open.value || query.value || tags.value.length) {
			animatedText.value = ''
			return
		}
		const target = PLACEHOLDER_EXAMPLES[exIdx]
		if (!deleting) {
			charIdx++
			animatedText.value = target.slice(0, charIdx)
			if (charIdx === target.length) {
				deleting = true
				animTimer = setTimeout(tick, 1400)
			} else {
				animTimer = setTimeout(tick, 75)
			}
		} else {
			charIdx--
			animatedText.value = target.slice(0, charIdx)
			if (charIdx === 0) {
				deleting = false
				exIdx = (exIdx + 1) % PLACEHOLDER_EXAMPLES.length
				animTimer = setTimeout(tick, 350)
			} else {
				animTimer = setTimeout(tick, 38)
			}
		}
	}

	animTimer = setTimeout(tick, 500)
}

const activePlaceholder = computed(() => {
	if (tags.value.length) return ''
	return animatedText.value || 'Search Modrinth\u2026'
})

watch(open, (val) => {
	if (val) startAnimation()
	else stopAnimation()
})

watch([query, tags], () => {
	if (query.value || tags.value.length) {
		stopAnimation()
	} else if (open.value && !animTimer) {
		startAnimation()
	}
})
// ---

function hasTag(facet: string, value: string) {
	return tags.value.some((t) => t.facet === facet && t.value === value)
}

function hasFacet(facet: string) {
	return tags.value.some((t) => t.facet === facet)
}

const isServerMode = computed(() =>
	tags.value.some((t) => t.facet === 'type' && t.value === 'server'),
)

const suggestions = computed<Suggestion[]>(() => {
	const q = query.value.trim().toLowerCase()
	const results: Suggestion[] = []

	if (q) {
		if (!hasFacet('type')) {
			for (const t of TYPES) {
				if (t.includes(q)) {
					results.push({
						id: `type:${t}`,
						icon: PackageIcon,
						label: t,
						facet: 'type',
						value: t,
						action: 'add-tag',
					})
				}
			}
		}

		if (isServerMode.value) {
			for (const c of serverCategories.value) {
				if (c.includes(q) && !hasTag('category', c)) {
					results.push({
						id: `category:${c}`,
						icon: TagIcon,
						label: c,
						facet: 'category',
						value: c,
						action: 'add-tag',
					})
				}
			}

			for (const v of versions.value) {
				if (v.startsWith(q) && !hasTag('version', v)) {
					results.push({
						id: `version:${v}`,
						icon: HashIcon,
						label: v,
						facet: 'version',
						value: v,
						action: 'add-tag',
					})
				}
			}
		} else {
			for (const l of loaders.value) {
				if (l.includes(q) && !hasTag('loader', l)) {
					results.push({
						id: `loader:${l}`,
						icon: CpuIcon,
						label: l,
						facet: 'loader',
						value: l,
						action: 'add-tag',
					})
				}
			}

			for (const c of categories.value) {
				if (c.includes(q) && !hasTag('category', c)) {
					results.push({
						id: `category:${c}`,
						icon: TagIcon,
						label: c,
						facet: 'category',
						value: c,
						action: 'add-tag',
					})
				}
			}

			for (const v of versions.value) {
				if (v.startsWith(q) && !hasTag('version', v)) {
					results.push({
						id: `version:${v}`,
						icon: HashIcon,
						label: v,
						facet: 'version',
						value: v,
						action: 'add-tag',
					})
				}
			}
		}

		results.push({ id: 'search', icon: SearchIcon, label: query.value, action: 'search' })
	}

	return results.slice(0, 8)
})

watch(query, () => {
	selectedIndex.value = 0
})

function openModal() {
	open.value = true
	nextTick(() => inputEl.value?.focus())
}

function close() {
	open.value = false
	query.value = ''
	tags.value = []
	selectedIndex.value = 0
}

function removeTag(facet: string, value: string) {
	tags.value = tags.value.filter((t) => !(t.facet === facet && t.value === value))
	inputEl.value?.focus()
}

function applyExample(ex: Example) {
	tags.value = [...ex.tags]
	query.value = ''
	nextTick(() => inputEl.value?.focus())
}

function selectSuggestion(s: Suggestion) {
	if (s.action === 'add-tag' && s.facet && s.value) {
		tags.value.push({ facet: s.facet, value: s.value })
		query.value = ''
		nextTick(() => inputEl.value?.focus())
	} else if (s.action === 'search') {
		executeSearch()
	}
}

function executeSearch() {
	const typeTag = tags.value.find((t) => t.facet === 'type')
	const categoryTags = tags.value.filter((t) => t.facet === 'category')
	const versionTags = tags.value.filter((t) => t.facet === 'version')
	const basePath = typeTag ? (TYPE_PATH[typeTag.value] ?? '/discover/mods') : '/discover/mods'
	const params = new URLSearchParams()
	if (query.value.trim()) params.set('q', query.value.trim())

	if (isServerMode.value) {
		for (const t of categoryTags) params.append('sc', t.value)
		for (const t of versionTags) params.append('sgv', t.value)
	} else {
		for (const t of tags.value.filter((t) => t.facet === 'loader'))
			params.append('g', `categories:${t.value}`)
		for (const t of categoryTags) params.append('f', `categories:${t.value}`)
		for (const t of versionTags) params.append('v', t.value)
	}

	const qs = params.toString()
	window.location.href = `https://modrinth.com${basePath}${qs ? '?' + qs : ''}`
	close()
}

function onKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape') {
		close()
	} else if (e.key === 'ArrowDown') {
		e.preventDefault()
		selectedIndex.value = Math.min(selectedIndex.value + 1, suggestions.value.length - 1)
		suggestionEls.value[selectedIndex.value]?.scrollIntoView({ block: 'nearest' })
	} else if (e.key === 'ArrowUp') {
		e.preventDefault()
		selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
		suggestionEls.value[selectedIndex.value]?.scrollIntoView({ block: 'nearest' })
	} else if (e.key === 'Enter') {
		e.preventDefault()
		if (suggestions.value.length > 0) {
			selectSuggestion(suggestions.value[selectedIndex.value])
		} else {
			executeSearch()
		}
	} else if (e.key === 'Backspace' && !query.value && tags.value.length) {
		tags.value.pop()
	}
}

function onGlobalKeydown(e: KeyboardEvent) {
	if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
		e.preventDefault()
		if (open.value) close()
		else openModal()
		return
	}
	if (e.key === '/' && !open.value) {
		const target = e.target as HTMLElement
		const tag = target.tagName.toLowerCase()
		if (tag !== 'input' && tag !== 'textarea' && !target.isContentEditable) {
			e.preventDefault()
			openModal()
		}
	}
}

onMounted(async () => {
	window.addEventListener('keydown', onGlobalKeydown)

	try {
		const [loadersRes, categoriesRes, versionsRes] = await Promise.all([
			useBaseFetch('tag/loader') as Promise<{ name: string }[]>,
			useBaseFetch('tag/category') as Promise<{ name: string; project_type: string }[]>,
			useBaseFetch('tag/game_version') as Promise<{ version: string }[]>,
		])
		loaders.value = loadersRes.map((l) => l.name)
		const allCats = categoriesRes.filter((c) => c.project_type !== 'minecraft_java_server')
		categories.value = [...new Set(allCats.map((c) => c.name))]
		serverCategories.value = categoriesRes
			.filter((c) => c.project_type === 'minecraft_java_server')
			.map((c) => c.name)
		versions.value = versionsRes.map((v) => v.version)
	} catch {
		// silently ignore — suggestions simply won't appear
	}
})

onUnmounted(() => {
	window.removeEventListener('keydown', onGlobalKeydown)
	stopAnimation()
})
</script>
