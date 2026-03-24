import { browser } from 'wxt/browser'

export interface FeatureFlags {
	showBadge: boolean
	desktopNotifications: boolean
	showNotificationsIndicator: boolean
	showToolsSidebar: boolean
	showDependenciesSidebar: boolean
	showActivitySparkline: boolean
	showGitHubSidebar: boolean
	showDiscordSidebar: boolean
	showQuickSearch: boolean
	curseforgeRedirect: boolean
	showProjectCardActions: boolean
	telemetryEnabled: boolean
}

export interface FeatureConfig {
	projectCardActionsModLoader: string
	projectCardActionsPluginLoader: string
}

export type ExtensionSettings = FeatureFlags & FeatureConfig

export const DEFAULTS: ExtensionSettings = {
	showBadge: true,
	desktopNotifications: false,
	showNotificationsIndicator: true,
	showToolsSidebar: true,
	showDependenciesSidebar: true,
	showActivitySparkline: true,
	showGitHubSidebar: true,
	showDiscordSidebar: true,
	showQuickSearch: true,
	curseforgeRedirect: false,
	showProjectCardActions: true,
	projectCardActionsModLoader: '',
	projectCardActionsPluginLoader: '',
	telemetryEnabled: true,
}

export async function loadSettings(): Promise<ExtensionSettings> {
	const stored = await browser.storage.local.get(Object.keys(DEFAULTS) as string[])
	return { ...DEFAULTS, ...(stored as Partial<ExtensionSettings>) }
}
