<template>
	<ButtonStyled color="brand">
		<button :disabled="downloadLoading" @click.stop="handleDownload">
			<LoaderCircleIcon v-if="downloadLoading" class="animate-spin" />
			<DownloadIcon v-else />
			Download
		</button>
	</ButtonStyled>
	<ButtonStyled circular :color="isFollowed ? 'brand' : undefined">
		<button
			:title="isFollowed ? 'Unfollow' : 'Follow'"
			:disabled="followLoading || !isLoggedIn"
			@click.stop="handleFollow"
		>
			<LoaderCircleIcon v-if="followLoading" class="animate-spin" />
			<HeartIcon v-else />
		</button>
	</ButtonStyled>
	<ButtonStyled circular :color="isBookmarked ? 'brand' : undefined">
		<button :title="isBookmarked ? 'Remove bookmark' : 'Bookmark'" @click.stop="handleBookmark">
			<BookmarkIcon />
		</button>
	</ButtonStyled>
	<ButtonStyled circular type="transparent">
		<button :title="copied ? 'Copied!' : 'Copy link'" @click.stop="handleCopyLink">
			<CheckIcon v-if="copied" />
			<LinkIcon v-else />
		</button>
	</ButtonStyled>
</template>

<script setup lang="ts">
import {
	BookmarkIcon,
	CheckIcon,
	DownloadIcon,
	HeartIcon,
	LinkIcon,
	LoaderCircleIcon,
} from '@modrinth/assets'
import { ButtonStyled } from '@modrinth/ui'
import { computed, onMounted, ref } from 'vue'
import { browser } from 'wxt/browser'

import { apiFetch, getAuthToken } from '../helpers/apiFetch'
import { followedSlugs } from '../helpers/followState'

const props = defineProps<{
	projectSlug: string
	projectType: string
}>()

// --- Bookmarks (local browser storage) ---
const BOOKMARKS_KEY = 'bookmarkedProjects'

async function getBookmarks(): Promise<string[]> {
	const stored = await browser.storage.local.get(BOOKMARKS_KEY)
	return (stored[BOOKMARKS_KEY] as string[] | undefined) ?? []
}

async function setBookmarks(slugs: string[]): Promise<void> {
	await browser.storage.local.set({ [BOOKMARKS_KEY]: slugs })
}

// --- State ---
const isLoggedIn = !!getAuthToken()
const isFollowed = computed(() => followedSlugs.value?.has(props.projectSlug) ?? false)
const isBookmarked = ref(false)
const downloadLoading = ref(false)
const followLoading = ref(false)
const copied = ref(false)

onMounted(async () => {
	const bookmarks = await getBookmarks()
	isBookmarked.value = bookmarks.includes(props.projectSlug)
})

async function handleDownload() {
	if (downloadLoading.value) return
	downloadLoading.value = true
	try {
		const versions = (await apiFetch(`project/${props.projectSlug}/version`)) as {
			files: { url: string; primary: boolean }[]
		}[]
		const file = versions[0]?.files.find((f) => f.primary) ?? versions[0]?.files[0]
		if (file?.url) window.open(file.url, '_blank')
	} catch (err) {
		console.error('[Modrinth Extras] Download failed:', err)
	} finally {
		downloadLoading.value = false
	}
}

async function handleFollow() {
	if (!isLoggedIn || followLoading.value) return
	followLoading.value = true
	try {
		if (isFollowed.value) {
			await apiFetch(`project/${props.projectSlug}/follow`, { method: 'DELETE' })
			followedSlugs.value?.delete(props.projectSlug)
		} else {
			await apiFetch(`project/${props.projectSlug}/follow`, { method: 'POST' })
			followedSlugs.value?.add(props.projectSlug)
		}
	} catch (err) {
		console.error('[Modrinth Extras] Follow action failed:', err)
	} finally {
		followLoading.value = false
	}
}

async function handleBookmark() {
	const bookmarks = await getBookmarks()
	if (isBookmarked.value) {
		await setBookmarks(bookmarks.filter((s) => s !== props.projectSlug))
		isBookmarked.value = false
	} else {
		await setBookmarks([...bookmarks, props.projectSlug])
		isBookmarked.value = true
	}
}

async function handleCopyLink() {
	const url = `https://modrinth.com/${props.projectType}/${props.projectSlug}`
	try {
		await navigator.clipboard.writeText(url)
		copied.value = true
		setTimeout(() => (copied.value = false), 2000)
	} catch {
		// Clipboard API might not be available
	}
}
</script>
