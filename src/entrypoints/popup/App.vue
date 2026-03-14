<template>
	<div class="w-[300px]">
		<header class="flex items-center gap-3 px-4 py-3.5">
			<a
				href="https://github.com/creeperkatze/modrinth-extras"
				target="_blank"
				rel="noopener"
				class="flex min-w-0 flex-1 items-center gap-3 no-underline"
			>
				<img
					:src="browser.runtime.getURL('icon-48.png')"
					alt=""
					class="size-9 shrink-0 rounded-lg"
					aria-hidden="true"
				/>
				<div class="flex flex-col gap-0.5">
					<span class="text-sm font-semibold text-contrast">Modrinth Extras</span>
					<span class="text-xs text-secondary">by Creeperkatze</span>
				</div>
			</a>
			<ButtonStyled color="brand" size="small">
				<a href="https://modrinth.com" target="_blank" rel="noopener" class="no-underline">
					Modrinth
					<ArrowUpRightIcon aria-hidden="true" />
				</a>
			</ButtonStyled>
		</header>

		<HorizontalRule />

		<div class="flex flex-col gap-3 px-4 py-3">
			<p class="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary">
				Extension
			</p>
			<ToggleRow
				id="toggle-badge"
				v-model="settings.showBadge"
				title="Show count on icon"
				description="Display unread notification count as a badge on the extension icon"
			/>
		</div>

		<HorizontalRule />

		<div class="flex flex-col gap-3 px-4 py-3">
			<p class="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary">Extras</p>
			<ToggleRow
				id="toggle-notifications"
				v-model="settings.showNotificationsIndicator"
				title="Notifications indicator"
				description="Bell icon in the header showing your unread notification count"
			/>
			<ToggleRow
				id="toggle-tools"
				v-model="settings.showToolsSidebar"
				title="Tools sidebar"
				description="Adds a Tools card to the sidebar on project, user, organization, and collection pages"
			/>
			<ToggleRow
				id="toggle-deps"
				v-model="settings.showDependenciesSidebar"
				title="Dependency tree"
				description="Shows a collapsible dependency tree on project pages"
			/>
		</div>

		<HorizontalRule />

		<div class="px-4 py-2">
			<span class="text-[11px] text-secondary">v{{ version }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ArrowUpRightIcon } from '@modrinth/assets'
import { ButtonStyled, HorizontalRule } from '@modrinth/ui'
import { onMounted, reactive, watch } from 'vue'

import { DEFAULTS, loadSettings } from '../../helpers/settings'
import ToggleRow from './ToggleRow.vue'

const version = browser.runtime.getManifest().version

const settings = reactive({ ...DEFAULTS })

let mounted = false

onMounted(async () => {
	Object.assign(settings, await loadSettings())
	mounted = true
})

watch(settings, () => {
	if (mounted) chrome.storage.local.set({ ...settings })
})
</script>
