<template>
	<div class="flex flex-col gap-1 px-3 py-3">
		<p class="mb-1 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-secondary">
			<slot name="label">{{ label }}</slot>
		</p>
		<slot />
	</div>
</template>

<script setup lang="ts">
defineProps<{
	label: string
}>()
</script>
