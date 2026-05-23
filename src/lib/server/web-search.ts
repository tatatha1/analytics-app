// Web search using DuckDuckGo HTML search (free, no API key required)

const DDG_URL = 'https://html.duckduckgo.com/html/';

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export async function searchWeb(query: string, maxResults: number = 5): Promise<SearchResult[]> {
	try {
		const res = await fetch(DDG_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': 'Mozilla/5.0 (compatible; AnalyticsApp/1.0)'
			},
			body: new URLSearchParams({ q: query }),
			signal: AbortSignal.timeout(10000)
		});

		if (!res.ok) return [];

		const html = await res.text();
		return parseDdgResults(html, maxResults);
	} catch {
		return [];
	}
}

function parseDdgResults(html: string, max: number): SearchResult[] {
	const results: SearchResult[] = [];

	// Find result blocks: <a rel="nofollow" class="result__a" href="...">
	const linkRegex = /<a\s+rel="nofollow"\s+class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	const snippetRegex = /<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

	const urls: string[] = [];
	const titles: string[] = [];
	const snippets: string[] = [];

	let m;
	while ((m = linkRegex.exec(html)) !== null && results.length < max) {
		const url = decodeHtmlEntities(m[1]);
		const title = stripHtml(m[2]);
		if (!url || urls.includes(url)) continue;
		urls.push(url);
		titles.push(title);
	}

	while ((m = snippetRegex.exec(html)) !== null && snippets.length < urls.length) {
		snippets.push(stripHtml(m[1]));
	}

	for (let i = 0; i < urls.length && i < max; i++) {
		results.push({
			title: titles[i] || '',
			url: urls[i],
			snippet: snippets[i] || ''
		});
	}

	return results;
}

function stripHtml(text: string): string {
	return text.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#x2F;/g, '/').trim();
}

function decodeHtmlEntities(text: string): string {
	return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
}

export async function findInstagramByWebSearch(channelName: string): Promise<string | null> {
	// Search for the channel name on Instagram
	const queries = [
		`site:instagram.com "${channelName}"`,
		`site:instagram.com ${channelName}`,
		`${channelName} instagram profile`
	];

	const seen = new Set<string>();

	for (const q of queries) {
		const results = await searchWeb(q, 8);
		for (const r of results) {
			// Extract Instagram username from URL: https://www.instagram.com/username/
			const igMatch = r.url.match(/instagram\.com\/([a-zA-Z0-9_.]{3,})\/?$/);
			if (igMatch) {
				const handle = igMatch[1].toLowerCase();
				if (handle !== 'p' && handle !== 'reel' && handle !== 'explore' && handle !== 'accounts' && !seen.has(handle)) {
					seen.add(handle);
					// Score by relevance to channel name
					const normChannel = channelName.toLowerCase().replace(/[^a-z0-9]/g, '');
					const normHandle = handle.replace(/[^a-z0-9]/g, '');
					if (normHandle === normChannel) return handle; // exact match
					if (normHandle.includes(normChannel) || normChannel.includes(normHandle)) return handle; // contains
				}
			}
		}
	}

	// If no strong match, return the most likely candidate
	if (seen.size > 0) {
		const ranked = [...seen].sort((a, b) => {
			const normChannel = channelName.toLowerCase().replace(/[^a-z0-9]/g, '');
			const score = (h: string) => {
				const n = h.replace(/[^a-z0-9]/g, '');
				let s = 0;
				if (n === normChannel) s += 100;
				if (n.includes(normChannel) || normChannel.includes(n)) s += 50;
				// Common prefix
				for (let i = 3; i <= Math.min(n.length, normChannel.length); i++) {
					if (n.substring(0, i) === normChannel.substring(0, i)) s += i;
				}
				return s;
			};
			return score(b) - score(a);
		});
		if (ranked.length > 0) return ranked[0];
	}

	return null;
}

export async function findYouTubeByWebSearch(username: string): Promise<string | null> {
	const queries = [
		`site:youtube.com "${username}"`,
		`${username} youtube channel`
	];

	const seen = new Set<string>();

	for (const q of queries) {
		const results = await searchWeb(q, 8);
		for (const r of results) {
			// Match YouTube channel URLs
			const ytMatch = r.url.match(/(?:youtube\.com\/(?:@|channel\/|c\/|user\/)?([a-zA-Z0-9_-]{3,}))|(?:youtu\.be\/([a-zA-Z0-9_-]{3,}))/);
			if (ytMatch) {
				const handle = (ytMatch[1] || ytMatch[2]).toLowerCase();
				if (handle !== 'watch' && handle !== 'results' && handle !== 'feed' && !seen.has(handle)) {
					seen.add(handle);
				}
			}
		}
	}

	// Return the best match
	if (seen.size > 0) {
		const norm = username.toLowerCase().replace(/[^a-z0-9]/g, '');
		const exact = [...seen].find(h => h.replace(/[^a-z0-9]/g, '') === norm);
		if (exact) return exact;
		return [...seen][0];
	}

	return null;
}
