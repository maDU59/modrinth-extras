<template>
	<NewModal
		ref="modal"
		header="Dependency Graph"
		:closable="true"
		:no-padding="true"
		max-width="min(96vw, 1400px)"
		width="min(92vw, 1300px)"
	>
		<div
			ref="containerRef"
			class="relative overflow-hidden"
			style="height: 580px; background: #111"
			@mousemove="onMouseMove"
			@mouseup="onMouseUp"
			@mouseleave="onMouseUp"
		>
			<svg
				ref="svgRef"
				class="block w-full h-full"
				:style="{ cursor: panning ? 'grabbing' : 'grab' }"
				@wheel.prevent="onWheel"
			>
				<defs>
					<pattern
						id="mre-explorer-grid"
						x="0"
						y="0"
						width="28"
						height="28"
						patternUnits="userSpaceOnUse"
					>
						<circle cx="14" cy="14" r="0.7" fill="rgba(255,255,255,0.055)" />
					</pattern>
					<template v-for="node in nodes" :key="`clip-${node.id}`">
						<clipPath :id="`mre-clip-${escId(node.id)}`">
							<circle :r="nodeR(node)" />
						</clipPath>
					</template>
				</defs>

				<!-- Background rect catches all pointer events that miss nodes, enabling pan -->
				<rect
					width="100%"
					height="100%"
					fill="url(#mre-explorer-grid)"
					@mousedown="onBgMouseDown"
				/>

				<g v-if="!initialLoading" :transform="`translate(${pan.x},${pan.y}) scale(${zoom})`">
					<!-- Edges -->
					<g style="pointer-events: none">
						<line
							v-for="edge in edges"
							:key="`e-${edge.source}-${edge.target}`"
							:x1="nodePos(edge.source).x"
							:y1="nodePos(edge.source).y"
							:x2="nodePos(edge.target).x"
							:y2="nodePos(edge.target).y"
							:stroke="EDGE_COLORS[edge.type]"
							:stroke-dasharray="edge.type === 'optional' ? '5,4' : ''"
							stroke-width="1.5"
							stroke-linecap="round"
							opacity="0.6"
						/>
					</g>

					<!-- Nodes -->
					<g
						v-for="node in nodes"
						:key="node.id"
						:transform="`translate(${node.x},${node.y})`"
						:style="{ cursor: draggingNode?.id === node.id ? 'grabbing' : 'pointer' }"
						@mousedown.stop="onNodeMouseDown($event, node)"
						@click.stop="onNodeClick(node)"
					>
						<!-- Root glow ring -->
						<circle
							v-if="node.isRoot"
							:r="nodeR(node) + 9"
							fill="none"
							stroke="#1bd96a"
							stroke-width="1.5"
							class="mre-explorer-pulse"
						/>

						<!-- Drop shadow -->
						<circle :r="nodeR(node)" fill="rgba(0,0,0,0.4)" transform="translate(0,3)" />

						<!-- Body -->
						<circle
							:r="nodeR(node)"
							:fill="node.isRoot ? '#1bd96a' : '#262626'"
							:stroke="node.isRoot ? '#1bd96a' : '#3f3f3f'"
							stroke-width="1.5"
						/>

						<!-- Letter fallback -->
						<text
							text-anchor="middle"
							dominant-baseline="central"
							:font-size="node.isRoot ? '17' : '13'"
							font-weight="bold"
							:fill="node.isRoot ? '#fff' : '#888'"
							style="pointer-events: none; user-select: none"
						>
							{{ (node.project?.title ?? node.id)[0].toUpperCase() }}
						</text>

						<!-- Project icon -->
						<image
							v-if="node.project?.icon_url"
							:href="node.project.icon_url"
							:x="-nodeR(node)"
							:y="-nodeR(node)"
							:width="nodeR(node) * 2"
							:height="nodeR(node) * 2"
							:clip-path="`url(#mre-clip-${escId(node.id)})`"
							style="pointer-events: none"
						/>

						<!-- Loading overlay -->
						<g v-if="node.loading" style="pointer-events: none">
							<circle :r="nodeR(node)" fill="rgba(0,0,0,0.6)" />
							<text
								text-anchor="middle"
								dominant-baseline="central"
								font-size="9"
								fill="rgba(255,255,255,0.7)"
								style="user-select: none"
							>
								…
							</text>
						</g>

						<!-- Expand badge (+ icon for unexpanded non-root nodes) -->
						<g v-if="!node.isRoot && !node.loaded && !node.loading" style="pointer-events: none">
							<circle
								:cx="nodeR(node) - 5"
								:cy="-(nodeR(node) - 5)"
								r="8"
								fill="#1a1a1a"
								stroke="#1bd96a"
								stroke-width="1.5"
							/>
							<text
								:x="nodeR(node) - 5"
								:y="-(nodeR(node) - 5)"
								text-anchor="middle"
								dominant-baseline="central"
								font-size="11"
								font-weight="bold"
								fill="#1bd96a"
								style="user-select: none"
							>
								+
							</text>
						</g>

						<!-- Label -->
						<text
							:y="nodeR(node) + 14"
							text-anchor="middle"
							:font-size="node.isRoot ? '12' : '10'"
							:font-weight="node.isRoot ? '600' : '400'"
							fill="#ccc"
							style="pointer-events: none; user-select: none"
						>
							{{ clamp(node.project?.title ?? node.id, 15) }}
						</text>
					</g>
				</g>

				<!-- Empty state -->
				<text
					v-if="!initialLoading && nodes.length === 0"
					x="50%"
					y="50%"
					text-anchor="middle"
					dominant-baseline="central"
					fill="#666"
					font-size="14"
				>
					This project has no dependencies
				</text>
			</svg>

			<!-- Loading state (outside SVG so we get a real spinner) -->
			<div
				v-if="initialLoading"
				class="absolute inset-0 flex items-center justify-center gap-2"
				style="color: #666; font-size: 14px; pointer-events: none"
			>
				<svg
					class="animate-spin"
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
					<path d="M21 12a9 9 0 1 1-6.219-8.56" />
				</svg>
				Loading
			</div>

			<!-- Legend -->
			<div
				class="absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-lg p-2.5"
				style="background: rgba(20, 20, 20, 0.92); border: 1px solid #2e2e2e; font-size: 11px"
			>
				<div v-for="item in LEGEND" :key="item.type" class="flex items-center gap-2">
					<svg width="18" height="4" style="flex-shrink: 0">
						<line
							x1="0"
							y1="2"
							x2="18"
							y2="2"
							:stroke="item.color"
							stroke-width="2"
							:stroke-dasharray="item.dashed ? '4,3' : ''"
						/>
					</svg>
					<span style="color: #777">{{ item.label }}</span>
				</div>
			</div>

			<!-- Controls hint -->
			<div
				class="absolute bottom-3 right-3"
				style="font-size: 11px; color: #555; pointer-events: none"
			>
				scroll to zoom · drag to pan · click to expand
			</div>
		</div>
	</NewModal>
</template>

<script setup lang="ts">
import { NewModal } from '@modrinth/ui'
import { nextTick, onUnmounted, ref, useTemplateRef } from 'vue'

import { apiFetch } from '../helpers/apiFetch'
import {
	type EnrichedDep,
	fetchProjectDependencies,
	type ProjectInfo,
} from '../helpers/dependencies'
import { navigate } from '../helpers/page-router'

interface GraphNode {
	id: string
	x: number
	y: number
	vx: number
	vy: number
	fx: number | null
	fy: number | null
	project: ProjectInfo | null
	loaded: boolean
	loading: boolean
	isRoot: boolean
	depth: number
}

interface GraphEdge {
	source: string
	target: string
	type: 'required' | 'optional' | 'embedded'
}

// Constants

const EDGE_COLORS: Record<string, string> = {
	required: '#4ade80',
	optional: '#facc15',
	embedded: '#60a5fa',
}

const LEGEND = [
	{ type: 'required', color: '#4ade80', label: 'Required', dashed: false },
	{ type: 'optional', color: '#facc15', label: 'Optional', dashed: true },
	{ type: 'embedded', color: '#60a5fa', label: 'Embedded', dashed: false },
]

// Simulation constants

const REPULSION = 4500
const SPRING_K = 0.055
const IDEAL_LEN = 180
const DAMPING = 0.8
const CENTER_K = 0.018
const STOP_VEL = 0.12

const props = defineProps<{ projectSlug: string }>()

const modal = useTemplateRef<InstanceType<typeof NewModal>>('modal')
const svgRef = ref<SVGSVGElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

const nodes = ref<GraphNode[]>([])
const edges = ref<GraphEdge[]>([])
const initialLoading = ref(false)

const pan = ref({ x: 480, y: 290 })
const zoom = ref(1)

let draggingNode: GraphNode | null = null
let dragStartMouse = { x: 0, y: 0 }
let dragStartNode = { x: 0, y: 0 }
let dragMoved = false

let panning = false
let panStart = { mx: 0, my: 0, px: 0, py: 0 }

let rafId: number | null = null
let alpha = 1
let fitOnSettle = false

// Helpers

function nodeR(node: GraphNode): number {
	return node.isRoot ? 28 : 22
}

function escId(id: string): string {
	return id.replace(/[^a-zA-Z0-9]/g, '_')
}

function nodePos(id: string): { x: number; y: number } {
	return nodes.value.find((n) => n.id === id) ?? { x: 0, y: 0 }
}

function clamp(s: string, max: number): string {
	return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// Force simulation

function kickSimulation() {
	alpha = Math.min(alpha + 0.35, 1)
	if (rafId === null) rafId = requestAnimationFrame(tick)
}

function tick() {
	const ns = nodes.value
	if (ns.length < 2) {
		rafId = null
		return
	}

	const n = ns.length
	const ax = new Float64Array(n)
	const ay = new Float64Array(n)

	const idx = new Map<string, number>()
	for (let i = 0; i < n; i++) idx.set(ns[i].id, i)

	// Repulsion + collision avoidance between all node pairs
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const dx = ns[j].x - ns[i].x
			const dy = ns[j].y - ns[i].y
			const d2 = dx * dx + dy * dy || 0.01
			const d = Math.sqrt(d2)
			// Hard collision: push apart if overlapping (ignores alpha so it always applies)
			const minDist = nodeR(ns[i]) + nodeR(ns[j]) + 18
			if (d < minDist) {
				const push = (minDist - d) * 0.6
				ax[i] -= (dx / d) * push
				ay[i] -= (dy / d) * push
				ax[j] += (dx / d) * push
				ay[j] += (dy / d) * push
			}
			const f = (REPULSION / d2) * alpha
			const fx = (dx / d) * f
			const fy = (dy / d) * f
			ax[i] -= fx
			ay[i] -= fy
			ax[j] += fx
			ay[j] += fy
		}
	}

	// Spring attraction along edges
	for (const e of edges.value) {
		const si = idx.get(e.source)
		const ti = idx.get(e.target)
		if (si == null || ti == null) continue
		const dx = ns[ti].x - ns[si].x
		const dy = ns[ti].y - ns[si].y
		const d = Math.sqrt(dx * dx + dy * dy) || 0.01
		const f = SPRING_K * (d - IDEAL_LEN) * alpha
		const fx = (dx / d) * f
		const fy = (dy / d) * f
		ax[si] += fx
		ay[si] += fy
		ax[ti] -= fx
		ay[ti] -= fy
	}

	// Centering
	for (let i = 0; i < n; i++) {
		ax[i] -= CENTER_K * ns[i].x * alpha
		ay[i] -= CENTER_K * ns[i].y * alpha
	}

	// Integrate velocities
	let maxV = 0
	for (let i = 0; i < n; i++) {
		const node = ns[i]
		if (node.fx !== null) {
			node.x = node.fx
			node.y = node.fy!
			node.vx = 0
			node.vy = 0
			continue
		}
		node.vx = (node.vx + ax[i]) * DAMPING
		node.vy = (node.vy + ay[i]) * DAMPING
		node.x += node.vx
		node.y += node.vy
		const v = Math.abs(node.vx) + Math.abs(node.vy)
		if (v > maxV) maxV = v
	}

	alpha *= 0.992
	if (maxV > STOP_VEL || alpha > 0.08) {
		rafId = requestAnimationFrame(tick)
	} else {
		rafId = null
		alpha = 0
		if (fitOnSettle) {
			fitOnSettle = false
			zoomToFit()
		}
	}
}

function zoomToFit(padding = 80) {
	if (nodes.value.length === 0) return
	const svgEl = svgRef.value
	if (!svgEl) return
	const w = svgEl.clientWidth
	const h = svgEl.clientHeight
	let minX = Infinity,
		maxX = -Infinity,
		minY = Infinity,
		maxY = -Infinity
	for (const node of nodes.value) {
		const r = nodeR(node) + 14 // Include label height
		minX = Math.min(minX, node.x - r)
		maxX = Math.max(maxX, node.x + r)
		minY = Math.min(minY, node.y - r)
		maxY = Math.max(maxY, node.y + r)
	}
	const graphW = maxX - minX || 1
	const graphH = maxY - minY || 1
	const scale = Math.min((w - padding * 2) / graphW, (h - padding * 2) / graphH, 1.2)
	zoom.value = scale
	pan.value = {
		x: (w - graphW * scale) / 2 - minX * scale,
		y: (h - graphH * scale) / 2 - minY * scale,
	}
}

onUnmounted(() => {
	if (rafId !== null) {
		cancelAnimationFrame(rafId)
		rafId = null
	}
})

// Graph building

// Sunflower (Fibonacci) spiral, distributes nodes evenly regardless of count
function placeAroundNode(sourceId: string, count: number): { x: number; y: number }[] {
	const source = nodes.value.find((n) => n.id === sourceId)
	const sx = source?.x ?? 0
	const sy = source?.y ?? 0
	const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
	// spacing scales with sqrt(n) so area grows linearly with node count
	const spacing = Math.max(55, 55 * Math.sqrt(count / 6))
	const positions: { x: number; y: number }[] = []
	for (let i = 0; i < count; i++) {
		const r = spacing * Math.sqrt(i + 1)
		const theta = GOLDEN_ANGLE * i
		positions.push({ x: sx + r * Math.cos(theta), y: sy + r * Math.sin(theta) })
	}
	return positions
}

function addDepsToGraph(sourceId: string, deps: EnrichedDep[], depth: number) {
	const existingIds = new Set(nodes.value.map((n) => n.id))
	const newDeps = deps.filter((d) => !existingIds.has(d.project_id))
	const positions = placeAroundNode(sourceId, newDeps.length)

	newDeps.forEach((dep, i) => {
		nodes.value.push({
			id: dep.project_id,
			x: positions[i].x,
			y: positions[i].y,
			vx: 0,
			vy: 0,
			fx: null,
			fy: null,
			project: dep.project,
			loaded: false,
			loading: false,
			isRoot: false,
			depth,
		})
	})

	for (const dep of deps) {
		if (!edges.value.some((e) => e.source === sourceId && e.target === dep.project_id)) {
			edges.value.push({
				source: sourceId,
				target: dep.project_id,
				type: dep.dependency_type as 'required' | 'optional' | 'embedded',
			})
		}
	}
}

// Graph initialization

async function initGraph() {
	nodes.value = []
	edges.value = []
	initialLoading.value = true
	zoom.value = 1
	alpha = 1

	let rootProject: ProjectInfo | null = null
	try {
		rootProject = (await apiFetch(`project/${props.projectSlug}`)) as ProjectInfo
	} catch (err) {
		console.error('[Modrinth Extras] Failed to fetch root project info:', err)
	}

	const rootId = rootProject?.id ?? props.projectSlug
	nodes.value.push({
		id: rootId,
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		fx: null,
		fy: null,
		project: rootProject,
		loaded: false,
		loading: false,
		isRoot: true,
		depth: 0,
	})

	try {
		const deps = await fetchProjectDependencies(props.projectSlug)
		if (deps.length > 0) {
			addDepsToGraph(rootId, deps, 1)
			nodes.value[0].loaded = true
		} else {
			nodes.value[0].loaded = true
		}
	} catch (err) {
		console.error('[Modrinth Extras] Failed to fetch dependencies for graph:', err)
	} finally {
		initialLoading.value = false
	}

	fitOnSettle = true
	kickSimulation()
}

// Node expansion

async function expandNode(node: GraphNode) {
	if (node.loaded || node.loading) return

	node.loading = true
	try {
		const deps = await fetchProjectDependencies(node.project?.slug ?? node.id)
		addDepsToGraph(node.id, deps, node.depth + 1)
		node.loaded = true
		kickSimulation()
	} catch (err) {
		console.error('[Modrinth Extras] Failed to expand dependency node:', err)
	} finally {
		node.loading = false
	}
}

// Interaction

function onNodeMouseDown(event: MouseEvent, node: GraphNode) {
	event.preventDefault()
	draggingNode = node
	dragStartMouse = { x: event.clientX, y: event.clientY }
	dragStartNode = { x: node.x, y: node.y }
	dragMoved = false
	node.fx = node.x
	node.fy = node.y
}

function onBgMouseDown(event: MouseEvent) {
	panning = true
	panStart = { mx: event.clientX, my: event.clientY, px: pan.value.x, py: pan.value.y }
}

function onMouseMove(event: MouseEvent) {
	if (draggingNode) {
		const dx = event.clientX - dragStartMouse.x
		const dy = event.clientY - dragStartMouse.y
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true
		draggingNode.fx = dragStartNode.x + dx / zoom.value
		draggingNode.fy = dragStartNode.y + dy / zoom.value
		draggingNode.x = draggingNode.fx
		draggingNode.y = draggingNode.fy
		kickSimulation()
	} else if (panning) {
		pan.value = {
			x: panStart.px + (event.clientX - panStart.mx),
			y: panStart.py + (event.clientY - panStart.my),
		}
	}
}

function onMouseUp() {
	if (draggingNode) {
		if (dragMoved) {
			draggingNode.fx = null
			draggingNode.fy = null
			kickSimulation()
		}
		draggingNode = null
	}
	panning = false
}

function onNodeClick(node: GraphNode) {
	if (dragMoved) return

	if (!node.loaded && !node.loading) {
		expandNode(node)
	} else if (node.project && !node.isRoot) {
		modal.value?.hide()
		navigate(`/${node.project.project_type}/${node.project.slug}`)
	}
}

function onWheel(event: WheelEvent) {
	const el = svgRef.value
	if (!el) return
	const rect = el.getBoundingClientRect()
	const mx = event.clientX - rect.left
	const my = event.clientY - rect.top
	const factor = event.deltaY > 0 ? 0.85 : 1 / 0.85
	const newZoom = Math.max(0.15, Math.min(4, zoom.value * factor))
	pan.value = {
		x: mx - (mx - pan.value.x) * (newZoom / zoom.value),
		y: my - (my - pan.value.y) * (newZoom / zoom.value),
	}
	zoom.value = newZoom
}

// Public API

async function show() {
	modal.value?.show()
	await nextTick()
	const w = svgRef.value?.clientWidth ?? 960
	const h = svgRef.value?.clientHeight ?? 580
	pan.value = { x: w / 2, y: h / 2 }
	initGraph()
}

defineExpose({ show })
</script>

<style scoped>
.mre-explorer-pulse {
	animation: mre-explorer-pulse 2.4s ease-in-out infinite;
	transform-origin: 0 0;
	transform-box: fill-box;
}

@keyframes mre-explorer-pulse {
	0%,
	100% {
		opacity: 0.18;
		transform: scale(1);
	}
	50% {
		opacity: 0.45;
		transform: scale(1.08);
	}
}
</style>
