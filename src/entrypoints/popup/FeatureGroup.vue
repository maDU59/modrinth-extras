<template>
	<div class="flex flex-col gap-1 px-2 py-3">
		<p class="m-0 mb-1 ml-2 font-semibold text-secondary">
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
