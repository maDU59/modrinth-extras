<template>
	<div class="card flex-card experimental-styles-within">
		<div class="flex items-center justify-between gap-2">
			<h2>Dependencies</h2>
			<button
				v-if="!loading && !error && roots.length > 0"
				v-tooltip="'Open dependency graph'"
				class="btn btn-transparent p-1"
				style="height: auto; line-height: 1"
				@click="explorerRef?.show()"
			>
				<svg
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M3 7V5a2 2 0 0 1 2-2h2" />
					<path d="M17 3h2a2 2 0 0 1 2 2v2" />
					<path d="M21 17v2a2 2 0 0 1-2 2h-2" />
					<path d="M7 21H5a2 2 0 0 1-2-2v-2" />
					<circle cx="12" cy="12" r="3" />
					<path d="m16 16-1.9-1.9" />
				</svg>
			</button>
		</div>
		<div class="details-list">
			<div v-if="loading" class="details-list__item">
				<LoaderCircleIcon class="animate-spin" />
				Loading
			</div>
			<div v-else-if="error" class="details-list__item font-normal text-secondary">
				Failed to load dependencies
			</div>
			<div v-else-if="roots.length === 0" class="details-list__item text-secondary">
				<XIcon aria-hidden="true" />
				No dependencies
			</div>
			<ScrollablePanel v-else class="[&__.scrollable-pane]:max-h-96">
				<ul class="m-0 flex list-none flex-col gap-3 p-0 pr-2">
					<DependencyNode
						v-for="dep in roots"
						:key="dep.project_id ?? dep.version_id"
						:dep="dep"
						:depth="0"
					/>
				</ul>
			</ScrollablePanel>
		</div>
		<div style="position: absolute; width: 0; height: 0; overflow: visible">
			<DependencyExplorer ref="explorerRef" :project-slug="projectSlug" />
		</div>
	</div>
</template>

<script setup lang="ts">
import { LoaderCircleIcon, XIcon } from '@modrinth/assets'
import { ScrollablePanel } from '@modrinth/ui'
import { onMounted, ref } from 'vue'

import { type EnrichedDep, fetchProjectDependencies } from '../helpers/dependencies'
import DependencyExplorer from './DependencyExplorer.vue'
import DependencyNode from './DependencyNode.vue'

const props = defineProps<{
	projectSlug: string
}>()

const explorerRef = ref<InstanceType<typeof DependencyExplorer> | null>(null)
const roots = ref<EnrichedDep[]>([])
const loading = ref(true)
const error = ref(false)

onMounted(async () => {
	try {
		roots.value = await fetchProjectDependencies(props.projectSlug)
	} catch (err) {
		console.error('[Modrinth Extras] Failed to fetch dependencies:', err)
		error.value = true
	} finally {
		loading.value = false
	}
})
</script>
