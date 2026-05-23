// Extracts social media handles from descriptions/bios
// Only matches explicit URLs and @-handles to avoid false positives

const instagramUrlRegex = /instagram\.com\/(?:p\/|reel\/|tv\/)?([a-zA-Z0-9_.]+)/gi;
const instagramHandleRegex = /@([a-zA-Z0-9_]{3,})/gi;

const youtubeUrlRegex = /youtube\.com\/(?:@|channel\/|c\/|user\/)?([a-zA-Z0-9_-]{3,})/gi;
const youtubeHandleRegex = /@([a-zA-Z0-9_]{3,})/gi;

const instagramSkip = ['com', 'instagram', 'http', 'https', 'www', 'p', 'reel', 'tv'];

function cleanHandle(handle: string | undefined, skipList: string[]): string | null {
	if (!handle) return null;
	const h = handle.trim().toLowerCase();
	if (!h || h.length < 3) return null;
	if (skipList.includes(h)) return null;
	// Must contain only valid chars
	if (!/^[a-z0-9_.]+$/.test(h)) return null;
	return h;
}

export function extractInstagramHandle(text: string): string | null {
	if (!text) return null;
	// Prefer explicit URLs
	for (const m of text.matchAll(instagramUrlRegex)) {
		const h = cleanHandle(m[1], instagramSkip);
		if (h) return h;
	}
	// Then @-handles
	for (const m of text.matchAll(instagramHandleRegex)) {
		const h = cleanHandle(m[1], instagramSkip);
		if (h) return h;
	}
	return null;
}

export function extractYouTubeHandle(text: string): string | null {
	if (!text) return null;
	for (const m of text.matchAll(youtubeUrlRegex)) {
		const h = cleanHandle(m[1], []);
		if (h) return h;
	}
	for (const m of text.matchAll(youtubeHandleRegex)) {
		const h = cleanHandle(m[1], []);
		if (h) return h;
	}
	return null;
}
