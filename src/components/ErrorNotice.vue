<template>
	<div
		class="relative flex flex-col rounded-2xl border-[1px] border-solid p-4 gap-3 text-contrast border-brand-orange bg-bg-orange"
	>
		<div class="flex items-start gap-2">
			<div class="flex flex-1 gap-2 items-center">
				<div class="flex gap-2 items-start">
					<TriangleAlertIcon aria-hidden="true" class="h-6 w-6 flex-none text-brand-orange" />
				</div>
				<div class="font-normal text-contrast/80 flex-1">
					This error might be related to Modrinth Extras. Try disabling the extension and refreshing
					the page before reporting this to Modrinth. If the error goes away, please report it
					<a
						href="https://github.com/creeperkatze/modrinth-extras/issues"
						target="_blank"
						class="text-link"
						>here</a
					>.
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { TriangleAlertIcon } from '@modrinth/assets'
</script>
