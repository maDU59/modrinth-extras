import '../assets/tailwind.css'

import { provideI18n } from '@modrinth/ui'
import FloatingVue from 'floating-vue'
import { type App, createApp, h, ref } from 'vue'
import { browser } from 'wxt/browser'

import ActivitySparkline from '../components/ActivitySparkline.vue'
import DependencyTree from '../components/DependencyTree.vue'
import DiscordSidebar from '../components/DiscordSidebar.vue'
import FooterBadge from '../components/FooterBadge.vue'
import GitHubSidebar from '../components/GitHubSidebar.vue'
import NotificationsIndicator from '../components/NotificationsIndicator.vue'
import ProjectCardActions from '../components/ProjectCardActions.vue'
import QuickSearch from '../components/QuickSearch.vue'
import ToolsSidebar from '../components/ToolsSidebar.vue'
import { initFollowState } from '../helpers/followState'
import { navigate } from '../helpers/page-router'
import { DEFAULTS, type ExtensionSettings, loadSettings } from '../helpers/settings'

// Gate injections until Nuxt hydration is complete. The router-bridge
// (MAIN world) dispatches "modrinth-extras:router-ready" once it hooks
// into the Nuxt router, which only becomes available after hydration.
let hydrated = false

interface InjectionConfig {
	id: string
	isEnabled: () => boolean
	settingsKeys: (keyof ExtensionSettings)[]
	attach: (container: HTMLElement) => boolean
	createApp: () => App
	persistent: boolean
}

function createInjection(config: InjectionConfig) {
	let container: HTMLElement | null = null
	let app: App | null = null

	function unmount() {
		if (app) {
			app.unmount()
			app = null
		}
		if (container?.parentElement) {
			container.parentElement.removeChild(container)
		}
		container = null
	}

	function inject() {
		if (!config.isEnabled()) return
		if (container && document.contains(container)) return
		unmount()

		const el = document.createElement('div')
		el.id = config.id

		if (!config.attach(el)) return

		if (!document.contains(el)) return

		const vueApp = config.createApp()
		try {
			vueApp.mount(el)
			app = vueApp
			container = el
			console.log(`[Modrinth Extras] Injected ${config.id}`)
		} catch {
			console.error(`[Modrinth Extras] Failed to mount ${config.id}`)
			vueApp.unmount()
			el.parentElement?.removeChild(el)
		}
	}

	function schedule() {
		if (!hydrated) return
		inject()
	}

	function checkDetached(): boolean {
		if (container && !document.contains(container)) {
			console.log(`[Modrinth Extras] Detached ${config.id}`)
			unmount()
			return true
		}
		return false
	}

	return { unmount, schedule, checkDetached, config }
}

const PROJECT_TYPE_PATTERN = /^\/(mod|plugin|datapack|shader|resourcepack|modpack|map)\/([^/?#]+)/

function createCardActionsInjection(getEnabled: () => boolean) {
	const injected = new Map<Element, { container: HTMLElement; app: App }>()

	function injectIntoCard(card: HTMLElement): void {
		if (injected.has(card)) return

		// The <a> link is a sibling of .project-card-container inside the .smart-clickable wrapper,
		// not a descendant of .project-card-container itself.
		const link = card.parentElement?.querySelector<HTMLAnchorElement>('a[href]')
		const href = link?.getAttribute('href') ?? ''
		const match = href.match(PROJECT_TYPE_PATTERN)
		if (!match) return

		const [, projectType, projectSlug] = match

		// List layout: card content div has grid-project-card-list class.
		// The actions div is v-if'd out (slot was empty), so we create it manually.
		// grid-area must be set inline since scoped CSS won't apply to our injected element.
		const listCardDiv = card.querySelector<HTMLElement>('.grid-project-card-list')
		if (listCardDiv) {
			listCardDiv.classList.add('has-actions')
			const el = document.createElement('div')
			el.style.cssText =
				'grid-area:actions;display:flex;gap:0.25rem;flex-shrink:0;margin-left:auto;align-items:center;pointer-events:auto'
			listCardDiv.appendChild(el)
			mountCardApp(card, el, projectSlug, projectType)
			return
		}

		// Grid layout: find the empty:hidden actions slot div — exclude the stats div
		// which also carries empty:hidden but has a grid-project-card-list__ class.
		let actionsDiv: HTMLElement | null = null
		for (const el of card.querySelectorAll<HTMLElement>('[class*="empty:hidden"]')) {
			if (!el.className.includes('grid-project-card-list__')) {
				actionsDiv = el
				break
			}
		}
		if (!actionsDiv) return

		const el = document.createElement('div')
		el.style.cssText = 'display:contents;pointer-events:auto'
		actionsDiv.appendChild(el)
		mountCardApp(card, el, projectSlug, projectType)
	}

	function mountCardApp(
		card: Element,
		el: HTMLElement,
		projectSlug: string,
		projectType: string,
	): void {
		const app = createApp({
			setup() {
				provideI18n({ locale: ref('en-US'), t: (key: string) => key, setLocale: () => {} })
			},
			render: () => h(ProjectCardActions, { projectSlug, projectType }),
		})
		app.use(FloatingVue)
		try {
			app.mount(el)
			injected.set(card, { container: el, app })
		} catch {
			app.unmount()
			el.parentElement?.removeChild(el)
		}
	}

	function unmount(): void {
		for (const { container, app } of injected.values()) {
			app.unmount()
			container.parentElement?.removeChild(container)
		}
		injected.clear()
	}

	function schedule(): void {
		if (!hydrated) return
		if (!getEnabled()) {
			unmount()
			return
		}
		// Kick off follow-state fetch once for all cards (fire-and-forget)
		initFollowState()
		// Clean stale
		for (const [card, { container, app }] of injected) {
			if (!document.contains(card)) {
				app.unmount()
				container.parentElement?.removeChild(container)
				injected.delete(card)
			}
		}
		// Inject new
		for (const card of document.querySelectorAll<HTMLElement>('.project-card-container')) {
			injectIntoCard(card)
		}
	}

	function checkDetached(): boolean {
		let any = false
		for (const [card, { container, app }] of injected) {
			if (!document.contains(card)) {
				app.unmount()
				container.parentElement?.removeChild(container)
				injected.delete(card)
				any = true
			}
		}
		return any
	}

	return {
		unmount,
		schedule,
		checkDetached,
		config: {
			settingsKeys: ['showProjectCardActions'] as (keyof ExtensionSettings)[],
			persistent: false,
		},
	}
}

// Returns the sidebar container to appendChild into, or null if not on a supported page.
function findSidebarParent(): HTMLElement | null {
	const path = window.location.pathname

	if (/^\/(mod|plugin|datapack|shader|resourcepack|modpack|server)\/[^/]+\/?$/.test(path)) {
		for (const card of document.querySelectorAll<HTMLElement>(
			'.card.flex-card.experimental-styles-within',
		)) {
			if (card.querySelector('h2')?.textContent?.trim() === 'Details')
				return card.parentElement as HTMLElement | null
		}
		return null
	}

	if (/^\/user\/[^/]+\/?$/.test(path)) {
		return document.querySelector<HTMLElement>('.normal-page__sidebar')
	}

	if (/^\/organization\/[^/]+\/?$/.test(path)) {
		return document.querySelector<HTMLElement>('.normal-page__sidebar')
	}

	if (/^\/collection\/[^/]+\/?$/.test(path)) {
		return document.querySelector<HTMLElement>('.ui-normal-page__sidebar')
	}

	return null
}

function attachToSidebar(container: HTMLElement): boolean {
	container.style.display = 'contents'
	const parent = findSidebarParent()
	if (!parent) return false
	parent.appendChild(container)
	return document.contains(container)
}

export default defineContentScript({
	matches: ['https://modrinth.com/*'],
	cssInjectionMode: 'manifest',

	main() {
		console.log('[Modrinth Extras] Content script loaded')
		let settings: ExtensionSettings = { ...DEFAULTS }

		const notifications = createInjection({
			id: 'modrinth-extras-notifications',
			isEnabled: () => settings.showNotificationsIndicator,
			settingsKeys: ['showNotificationsIndicator'],
			persistent: true,
			attach(container) {
				const header = document.querySelector('header')
				if (!header) return false

				const triggers = [...header.querySelectorAll<HTMLElement>('.btn-dropdown-animation')]
				const userTrigger = triggers.findLast((el) => !!el.querySelector('img')) ?? null
				if (!userTrigger) return false

				let childInFlex: HTMLElement = userTrigger
				let flexRow: HTMLElement | null = userTrigger.parentElement
				while (flexRow && flexRow !== header) {
					const { display } = window.getComputedStyle(flexRow)
					if (display === 'flex' || display === 'inline-flex') break
					childInFlex = flexRow
					flexRow = flexRow.parentElement as HTMLElement | null
				}
				if (!flexRow) return false

				container.style.display = 'flex'
				container.style.alignItems = 'center'
				flexRow.insertBefore(container, childInFlex)
				return true
			},
			createApp() {
				const app = createApp({
					setup() {
						provideI18n({
							locale: ref('en-US'),
							t: (key: string) => key,
							setLocale: () => {},
						})
					},
					render: () => h(NotificationsIndicator),
				})
				app.use(FloatingVue)
				return app
			},
		})

		const toolsSidebar = createInjection({
			id: 'modrinth-extras-tools-sidebar',
			isEnabled: () => settings.showToolsSidebar,
			settingsKeys: ['showToolsSidebar'],
			persistent: false,
			attach: attachToSidebar,
			createApp() {
				const pageUrl = window.location.href.split('?')[0].split('#')[0]
				return createApp(h(ToolsSidebar, { pageUrl }))
			},
		})

		const dependencySidebar = createInjection({
			id: 'modrinth-extras-dependency-sidebar',
			isEnabled: () => settings.showDependenciesSidebar,
			settingsKeys: ['showDependenciesSidebar'],
			persistent: false,
			attach(container) {
				const path = window.location.pathname
				if (!/^\/(mod|plugin|datapack|shader|resourcepack|modpack)\/[^/]+\/?$/.test(path))
					return false
				return attachToSidebar(container)
			},
			createApp() {
				const slug = window.location.pathname.match(
					/^\/(mod|plugin|datapack|shader|resourcepack|modpack)\/([^/]+)/,
				)?.[2]
				return createApp(h(DependencyTree, { projectSlug: slug ?? '' }))
			},
		})

		const activitySparkline = createInjection({
			id: 'modrinth-extras-activity-sparkline',
			isEnabled: () => settings.showActivitySparkline,
			settingsKeys: ['showActivitySparkline'],
			persistent: false,
			attach(container) {
				const path = window.location.pathname
				if (!/^\/(mod|plugin|datapack|shader|resourcepack|modpack)\/[^/]+\/?$/.test(path))
					return false
				const header = document.querySelector('.normal-page__header')
				if (!header) return false
				const borderDiv = header.querySelector<HTMLElement>(
					'div.border-b.border-solid.border-divider',
				)
				if (!borderDiv) return false
				borderDiv.style.position = 'relative'
				borderDiv.style.isolation = 'isolate'
				container.style.display = 'contents'
				borderDiv.appendChild(container)
				return document.contains(container)
			},
			createApp() {
				const slug = window.location.pathname.match(
					/^\/(mod|plugin|datapack|shader|resourcepack|modpack)\/([^/]+)/,
				)?.[2]
				return createApp(h(ActivitySparkline, { projectSlug: slug ?? '' }))
			},
		})

		const gitHubSidebar = createInjection({
			id: 'modrinth-extras-github-sidebar',
			isEnabled: () => settings.showGitHubSidebar,
			settingsKeys: ['showGitHubSidebar'],
			persistent: false,
			attach: attachToSidebar,
			createApp() {
				const pageUrl = window.location.href.split('?')[0].split('#')[0]
				return createApp(h(GitHubSidebar, { pageUrl }))
			},
		})

		const discordSidebar = createInjection({
			id: 'modrinth-extras-discord-sidebar',
			isEnabled: () => settings.showDiscordSidebar,
			settingsKeys: ['showDiscordSidebar'],
			persistent: false,
			attach: attachToSidebar,
			createApp() {
				const pageUrl = window.location.href.split('?')[0].split('#')[0]
				return createApp(h(DiscordSidebar, { pageUrl }))
			},
		})

		const footerBadge = createInjection({
			id: 'modrinth-extras-footer-badge',
			isEnabled: () => true,
			settingsKeys: [],
			persistent: true,
			attach(container) {
				const link = document.querySelector<HTMLAnchorElement>(
					'footer a[href="https://github.com/modrinth/code"]',
				)
				if (!link) return false

				const flexCol = link.closest('.flex.flex-wrap.justify-center.gap-3')
				if (!flexCol) return false

				container.style.display = 'flex'
				container.style.flexDirection = 'column'
				container.style.width = '100%'
				flexCol.appendChild(container)
				return true
			},
			createApp: () => createApp(h(FooterBadge)),
		})

		const quickSearch = createInjection({
			id: 'modrinth-extras-quick-search',
			isEnabled: () => settings.showQuickSearch,
			settingsKeys: ['showQuickSearch'],
			persistent: true,
			attach(container) {
				document.body.appendChild(container)
				return true
			},
			createApp: () => createApp(h(QuickSearch)),
		})

		const projectCardActions = createCardActionsInjection(() => settings.showProjectCardActions)

		const injections = [
			notifications,
			toolsSidebar,
			dependencySidebar,
			activitySparkline,
			gitHubSidebar,
			discordSidebar,
			footerBadge,
			quickSearch,
			projectCardActions,
		]

		function markHydrated() {
			if (hydrated) return
			hydrated = true
			for (const inj of injections) inj.schedule()
		}

		window.addEventListener('modrinth-extras:router-ready', markHydrated, { once: true })

		browser.runtime.onMessage.addListener((message) => {
			if (message.type === 'navigate') navigate(message.path as string)
		})

		loadSettings().then((s) => {
			settings = s
			console.log('[Modrinth Extras] Settings loaded:', JSON.stringify(s))
			for (const inj of injections) inj.schedule()
		})

		browser.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>) => {
			for (const [key, { newValue }] of Object.entries(changes)) {
				;(settings as unknown as Record<string, unknown>)[key] = newValue
			}
			for (const inj of injections) {
				if (inj.config.settingsKeys.some((k) => k in changes)) {
					inj.unmount()
					inj.schedule()
				}
			}
		})

		window.addEventListener('modrinth-extras:before-navigate', () => {
			for (const inj of injections) {
				if (!inj.config.persistent) inj.unmount()
			}
		})

		window.addEventListener('modrinth-extras:after-navigate', () => {
			for (const inj of injections) inj.schedule()
		})

		const domObserver = new MutationObserver(() => {
			for (const inj of injections) {
				inj.checkDetached()
				inj.schedule()
			}
		})
		domObserver.observe(document.documentElement, { childList: true, subtree: true })
	},
})
