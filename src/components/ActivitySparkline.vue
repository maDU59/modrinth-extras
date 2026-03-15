<template>
	<div
		ref="wrapperEl"
		aria-hidden="true"
		style="position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: -1"
	>
		<svg
			v-if="points.length > 1 && svgWidth > 0 && svgHeight > 0"
			:viewBox="`0 0 ${svgWidth} ${svgHeight}`"
			xmlns="http://www.w3.org/2000/svg"
			:style="{ display: 'block', width: svgWidth + 'px', height: svgHeight + 'px' }"
		>
			<defs>
				<linearGradient id="me-activity-grad" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="var(--color-brand)" stop-opacity="0.2" />
					<stop offset="100%" stop-color="var(--color-brand)" stop-opacity="0" />
				</linearGradient>
			</defs>
			<path :d="areaPath" fill="url(#me-activity-grad)" />
			<path
				:d="linePath"
				fill="none"
				stroke="var(--color-brand)"
				stroke-opacity="0.5"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useBaseFetch } from '../composables/useBaseFetch'

const props = defineProps<{ projectSlug: string }>()

const DAYS = 60
const PAD_TOP = 16
const PAD_BOTTOM = 20

interface Version {
	date_published: string
}

const wrapperEl = ref<HTMLElement | null>(null)
const svgWidth = ref(0)
const svgHeight = ref(0)
let resizeObserver: ResizeObserver | null = null

const dailyCounts = ref<number[]>(Array(DAYS).fill(0))
const hasAnyData = ref(false)

onMounted(async () => {
	if (wrapperEl.value) {
		resizeObserver = new ResizeObserver((entries) => {
			svgWidth.value = entries[0].contentRect.width
			svgHeight.value = entries[0].contentRect.height
		})
		resizeObserver.observe(wrapperEl.value)
	}

	try {
		const now = Date.now()
		const cutoff = now - DAYS * 24 * 60 * 60 * 1000

		const versions = (await useBaseFetch(
			`project/${props.projectSlug}/version?limit=100`,
		)) as Version[]
		if (!Array.isArray(versions)) return

		const counts = Array(DAYS).fill(0)
		for (const v of versions) {
			const t = new Date(v.date_published).getTime()
			if (t < cutoff) continue
			const dayIndex = Math.floor((t - cutoff) / (24 * 60 * 60 * 1000))
			if (dayIndex >= 0 && dayIndex < DAYS) counts[dayIndex]++
		}

		dailyCounts.value = counts
		hasAnyData.value = counts.some((c) => c > 0)
	} catch {
		// silently ignore errors
	}
})

onUnmounted(() => {
	resizeObserver?.disconnect()
})

const points = computed<[number, number][]>(() => {
	if (!hasAnyData.value || svgWidth.value <= 0 || svgHeight.value <= 0) return []
	const counts = dailyCounts.value
	const max = Math.max(...counts, 1)
	const w = svgWidth.value
	const h = svgHeight.value
	const bottom = h - PAD_BOTTOM
	const range = bottom - PAD_TOP
	return counts.map((c, i) => [((i + 0.5) / DAYS) * w, bottom - (c / max) * range])
})

function monotonicPath(pts: [number, number][]): string {
	const n = pts.length
	if (n < 2) return ''

	// Secant slopes between consecutive points
	const dx = pts.map((p, i) => (i < n - 1 ? pts[i + 1][0] - p[0] : 0))
	const dy = pts.map((p, i) => (i < n - 1 ? pts[i + 1][1] - p[1] : 0))
	const s = dx.map((d, i) => (d === 0 ? 0 : dy[i] / d))

	// Tangent slopes via Fritsch-Carlson
	const m = new Array(n).fill(0)
	m[0] = s[0]
	m[n - 1] = s[n - 2]
	for (let i = 1; i < n - 1; i++) {
		m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2
	}

	// Monotonicity adjustment
	for (let i = 0; i < n - 1; i++) {
		if (Math.abs(s[i]) < 1e-10) {
			m[i] = 0
			m[i + 1] = 0
		} else {
			const a = m[i] / s[i]
			const b = m[i + 1] / s[i]
			const r = a * a + b * b
			if (r > 9) {
				const tau = 3 / Math.sqrt(r)
				m[i] = tau * a * s[i]
				m[i + 1] = tau * b * s[i]
			}
		}
	}

	// Cubic bezier
	let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`
	for (let i = 0; i < n - 1; i++) {
		const h = dx[i]
		const cp1x = pts[i][0] + h / 3
		const cp1y = pts[i][1] + (m[i] * h) / 3
		const cp2x = pts[i + 1][0] - h / 3
		const cp2y = pts[i + 1][1] - (m[i + 1] * h) / 3
		d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${pts[i + 1][0].toFixed(2)} ${pts[i + 1][1].toFixed(2)}`
	}
	return d
}

const linePath = computed(() => monotonicPath(points.value))

const areaPath = computed(() => {
	if (!points.value.length) return ''
	const h = svgHeight.value
	const bottom = h - PAD_BOTTOM
	const first = points.value[0]
	const last = points.value[points.value.length - 1]
	return `${linePath.value} L ${last[0].toFixed(2)} ${bottom} L ${first[0].toFixed(2)} ${bottom} Z`
})
</script>
