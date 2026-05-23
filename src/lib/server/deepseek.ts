import { env } from '$env/dynamic/private';

const DEEPSEEK_API_KEY = env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = env.DEEPSEEK_MODEL || 'deepseek-chat';
import type { AIReport, YouTubeChannelData, YouTubeVideo, InstagramProfileData, InstagramPost } from '$lib/types';
import { extractInstagramHandle, extractYouTubeHandle } from './social-links';
import { searchInstagramUsers } from './instagram';
import { findInstagramByWebSearch, findYouTubeByWebSearch } from './web-search';

interface DeepSeekMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

interface DeepSeekResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
}

function buildPrompt(
	channelData: YouTubeChannelData | null,
	videos: YouTubeVideo[],
	profileData: InstagramProfileData | null,
	posts: InstagramPost[]
): string {
	let prompt = `Du bist ein Social-Media-Analytics-Experte. Analysiere die folgenden Daten auf Deutsch und erstelle einen detaillierten Management-Report mit Wachstumsprognose.

`;

	if (channelData) {
		const shorts = videos.filter((v) => {
			const m = v.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
			const sec = m ? parseInt(m[1]||'0')*3600 + parseInt(m[2]||'0')*60 + parseInt(m[3]||'0') : 0;
			return sec <= 60;
		});
		const long = videos.filter((v) => !shorts.includes(v));
		const avgER = videos.length > 0
			? videos.reduce((s, v) => s + (v.view_count > 0 ? ((v.like_count + v.comment_count) / v.view_count) * 100 : 0), 0) / videos.length
			: 0;

		prompt += `## YouTube Kanal: ${channelData.title}
- Abonnenten: ${channelData.subscriber_count.toLocaleString()}
- Aufrufe gesamt: ${channelData.view_count.toLocaleString()}
- Videos gesamt: ${channelData.video_count}
- Durchschnittliche Engagement-Rate: ${avgER.toFixed(2)}%
- Kurzvideos (Shorts): ${shorts.length}
- Lange Videos: ${long.length}
- Beschreibung: ${channelData.description}

### Letzte ${videos.length} Videos:
`;
		videos.forEach((v, i) => {
			const er = v.view_count > 0 ? ((v.like_count + v.comment_count) / v.view_count * 100).toFixed(2) : '0';
			const m = v.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
			const sec = m ? parseInt(m[1]||'0')*3600 + parseInt(m[2]||'0')*60 + parseInt(m[3]||'0') : 0;
			const typ = sec <= 60 ? 'Short' : 'Longform';
			prompt += `${i + 1}. "${v.title}" (${typ}) | Aufrufe: ${v.view_count.toLocaleString()} | Likes: ${v.like_count.toLocaleString()} | Kommentare: ${v.comment_count.toLocaleString()} | ER: ${er}% | ${v.published_at}
`;
		});
	}

	if (profileData) {
		prompt += `
## Instagram Profil: ${profileData.username}
- Follower: ${profileData.follower_count.toLocaleString()}
- Gefolgt: ${profileData.following_count.toLocaleString()}
- Beiträge: ${profileData.post_count}
- Bio: ${profileData.bio}

### Letzte ${posts.length} Beiträge:
`;
		posts.forEach((p, i) => {
			const views = p.video_view_count || 0;
			const er = profileData.follower_count > 0
				? ((p.like_count + p.comment_count) / profileData.follower_count * 100).toFixed(2)
				: '0';
			prompt += `${i + 1}. Typ: ${p.media_type} | Likes: ${p.like_count.toLocaleString()} | Kommentare: ${p.comment_count.toLocaleString()}${views ? ` | Aufrufe: ${views.toLocaleString()}` : ''} | ER: ${er}% | ${p.timestamp}
   Caption: ${p.caption?.substring(0, 150) || '(keine Caption)'}
`;
		});
	}

	prompt += `
Antworte AUSSCHLIESSLICH mit gültigem JSON (kein Markdown, keine Code-Blöcke) in DIESEM Format:

{
  "summary": "2-3 Sätze Zusammenfassung auf Deutsch",
  "strengths": ["Stärke 1 auf Deutsch", "Stärke 2 auf Deutsch", "Stärke 3 auf Deutsch"],
  "weaknesses": ["Schwäche 1 auf Deutsch", "Schwäche 2 auf Deutsch"],
  "patterns": ["Inhaltsmuster 1 auf Deutsch", "Inhaltsmuster 2 auf Deutsch", "Inhaltsmuster 3 auf Deutsch"],
  "recommendations": ["konkrete Handlungsempfehlung 1", "konkrete Handlungsempfehlung 2", "konkrete Handlungsempfehlung 3", "konkrete Handlungsempfehlung 4"],
  "prognosis": "2-3 Sätze Wachstumsprognose auf Deutsch basierend auf den aktuellen Kennzahlen"
}`;

	return prompt;
}

function validateAndParseResponse(content: string): AIReport {
	const jsonMatch = content.match(/\{[\s\S]*\}/);
	const jsonStr = jsonMatch ? jsonMatch[0] : content;
	const parsed = JSON.parse(jsonStr);

	return {
		summary: parsed.summary || 'Keine Zusammenfassung verfügbar.',
		strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
		weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
		patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
		recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
		prognosis: parsed.prognosis || '',
		generated_at: new Date().toISOString()
	};
}

function generateFallbackReport(
	channelData: YouTubeChannelData | null,
	videos: YouTubeVideo[]
): AIReport {
	const avgER = videos.length > 0
		? videos.reduce((s, v) => s + (v.view_count > 0 ? ((v.like_count + v.comment_count) / v.view_count) * 100 : 0), 0) / videos.length
		: 0;

	return {
		summary: `Automatisch generierte Analyse für ${channelData?.title || 'den Kanal'}. Mit ${channelData?.subscriber_count?.toLocaleString() || '?'} Abonnenten und einer durchschnittlichen Engagement-Rate von ${avgER.toFixed(2)}% zeigt der Kanal solides Wachstumspotenzial.`,
		strengths: [
			`${channelData?.subscriber_count?.toLocaleString() || '?'} Abonnenten Basis`,
			`${channelData?.view_count?.toLocaleString() || '?'} Gesamtaufrufe`,
			`${videos.length} Videos im analysierten Zeitraum`
		],
		weaknesses: [
			'Für eine detaillierte KI-Analyse bitte später erneut versuchen',
			'Die DeepSeek-API war nicht verfügbar'
		],
		patterns: [
			`Durchschnittliche Engagement-Rate: ${avgER.toFixed(2)}%`,
			`Shorts: ${videos.filter(v => { const m = v.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); const sec = m ? parseInt(m[1]||'0')*3600 + parseInt(m[2]||'0')*60 + parseInt(m[3]||'0') : 0; return sec <= 60; }).length} von ${videos.length} Videos`,
			'Regelmäßiger Upload-Zeitplan empfohlen'
		],
		recommendations: [
			'KI-Report später erneut generieren',
			'Upload-Frequenz konstant halten',
			'Auf Community-Engagement setzen',
			'Videotitel und Thumbnails optimieren'
		],
		prognosis: 'Der Kanal zeigt solides Wachstum. Bei konstanten Uploads und guter Engagement-Rate ist mit organischem Abonnenten-Wachstum zu rechnen.',
		generated_at: new Date().toISOString()
	};
}

export async function generateReport(
	channelData: YouTubeChannelData | null,
	videos: YouTubeVideo[],
	profileData: InstagramProfileData | null,
	posts: InstagramPost[]
): Promise<AIReport> {
	const prompt = buildPrompt(channelData, videos, profileData, posts);

	const messages: DeepSeekMessage[] = [
		{
			role: 'system',
			content: 'Du bist ein präziser Social-Media-Analytics-Assistent. Antworte NUR mit gültigem JSON.'
		},
		{
			role: 'user',
			content: prompt
		}
	];

	// Try multiple endpoint variations
	const endpoints = [
		DEEPSEEK_API_URL,
		'https://api.deepseek.com/chat/completions',
		'https://api.deepseek.com/v1/chat/completions'
	];

	const uniqueEndpoints = [...new Set(endpoints)];

	for (const url of uniqueEndpoints) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
				},
				body: JSON.stringify({
					model: DEEPSEEK_MODEL,
					messages,
					temperature: 0.3,
					max_tokens: 3000
				}),
				signal: AbortSignal.timeout(30000)
			});

			if (!res.ok) {
				const errBody = await res.text().catch(() => 'unknown error');
				console.warn(`DeepSeek API error at ${url}: ${res.status} ${errBody}`);
				continue;
			}

			const data: DeepSeekResponse = await res.json();
			const content = data.choices?.[0]?.message?.content;

			if (content) {
				return validateAndParseResponse(content);
			}
		} catch (err) {
			console.warn(`DeepSeek API call failed at ${url}:`, err);
			continue;
		}
	}

	console.warn('All DeepSeek endpoints failed, using fallback analysis');
	return generateFallbackReport(channelData, videos);
}

// --- Social media account matching via LLM ---

async function deepSeekChat(prompt: string, system: string, maxTokens: number = 100): Promise<string | null> {
	const messages = [
		{ role: 'system', content: system },
		{ role: 'user', content: prompt }
	];

	const endpoints = [...new Set([DEEPSEEK_API_URL, 'https://api.deepseek.com/chat/completions', 'https://api.deepseek.com/v1/chat/completions'])];

	for (const url of endpoints) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
				},
				body: JSON.stringify({ model: DEEPSEEK_MODEL, messages, temperature: 0.1, max_tokens: maxTokens }),
				signal: AbortSignal.timeout(15000)
			});
			if (!res.ok) continue;
			const data = await res.json();
			return data.choices?.[0]?.message?.content || null;
		} catch {
			continue;
		}
	}
	return null;
}

function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

export async function findInstagramByYouTube(channelName: string, description: string): Promise<string | null> {
	// 1. Parse description for explicit links
	const fromDesc = extractInstagramHandle(description);
	if (fromDesc) return fromDesc;

	// 2. Try common Instagram handle derivations directly via API
	// This is the most reliable approach for smaller channels
	const baseClean = channelName.toLowerCase().trim();
	const patterns = new Set<string>();

	// Remove common suffixes
	const stripped = baseClean.replace(/\s*(official|yt|channel|gaming|vlogs?|tv|music|entertainment|shorts|live)\s*$/i, '').trim();

	// Generate all plausible handle patterns
	const variants = [stripped, channelName.toLowerCase().trim()];
	for (const v of [...new Set(variants)]) {
		if (!v || v.length < 3) continue;
		patterns.add(v.replace(/\s+/g, '_'));           // spaces → underscores
		patterns.add(v.replace(/\s+/g, '.'));            // spaces → dots
		patterns.add(v.replace(/\s+/g, ''));             // no spaces
		patterns.add(v.replace(/\s+/g, '-'));            // spaces → hyphens
		// With numbers appended
		patterns.add(v.replace(/\s+/g, '_') + '_official');
		patterns.add(v.replace(/\s+/g, '') + 'official');
		// Without diacritics
		patterns.add(v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_'));
		patterns.add(v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ''));
	}

	const { getProfileData } = await import('./instagram');
	const tested = new Set<string>();
	for (const candidate of patterns) {
		const clean = candidate.replace(/[^a-z0-9_.]/g, '').replace(/^[_.]+|[_.]+$/g, '');
		if (tested.has(clean) || clean.length < 3) continue;
		tested.add(clean);
		try {
			await getProfileData(clean);
			return clean; // Found!
		} catch {
			// Account doesn't exist, try next
			continue;
		}
	}

	// 3. Web search via DuckDuckGo (free, no API key)
	try {
		const fromWeb = await findInstagramByWebSearch(channelName);
		if (fromWeb) return fromWeb;
	} catch {
		// Web search failed, continue
	}

	// 5. Search Instagram for the channel name via RapidAPI
	try {
		const searchResults = await searchInstagramUsers(channelName);
		const normalizedChannel = normalizeName(channelName);

		// Score results: exact handle match > name contains channel name > high followers
		let best: { username: string; score: number } | null = null;

		for (const r of searchResults) {
			let score = 0;
			const normHandle = normalizeName(r.username);
			const normName = normalizeName(r.full_name);

			// Exact match on handle
			if (normHandle === normalizedChannel) score = 100;
			// Handle contains channel name or vice versa
			else if (normHandle.includes(normalizedChannel) || normalizedChannel.includes(normHandle)) score = 80;
			// Full name match
			else if (normName === normalizedChannel) score = 70;
			else if (normName.includes(normalizedChannel) || normalizedChannel.includes(normName)) score = 50;
			// Partial name overlap
			else {
				// Check individual words
				const channelWords = normalizedChannel.split(/(\d+)/).filter(Boolean);
				const handleWords = normHandle.split(/(\d+)/).filter(Boolean);
				const matchingWords = channelWords.filter(w => w.length > 2 && handleWords.includes(w));
				if (matchingWords.length > 0) score = 30 * (matchingWords.length / channelWords.length);
			}

			if (score > 0 && (!best || score > best.score)) {
				best = { username: r.username, score };
			}
		}

		if (best && best.score >= 50) return best.username;
	} catch {
		// Search failed, continue
	}

	// 3. Try common handle derivations from channel name
	// Remove spaces, special chars, common suffixes
	const base = channelName.toLowerCase()
		.replace(/[^a-z0-9]/g, '')
		.replace(/(official|yt|channel|gaming|vlogs?|tv)$/i, '')
		.trim();
	if (base.length >= 3) {
		// Try base name, with underscore, with dot
		const candidates = [base, base.replace(/(\d+)$/, '').trim()].filter(c => c.length >= 3);
		for (const c of [...new Set(candidates)]) {
			try {
				const { getProfileData } = await import('./instagram');
				await getProfileData(c);
				return c;
			} catch {
				// Try next
			}
		}
	}

	// 4. Last resort: ask LLM
	try {
		const prompt = `I need the Instagram username for the YouTube channel "${channelName}".
Channel description: "${description?.substring(0, 500)}"

Based on your knowledge, what is this channel's Instagram handle?
Reply with ONLY the Instagram username (no @, no URL, no explanation).
If you don't know, reply exactly: null`;
		const result = await deepSeekChat(prompt, 'You know social media handles of many creators. Reply with only the username or null.', 50);
		if (result && result !== 'null' && result !== 'none' && result !== '') {
			const cleaned = result.trim().toLowerCase().replace(/^@/, '');
			if (/^[a-z0-9_.]{3,}$/.test(cleaned)) return cleaned;
		}
	} catch {
		// LLM failed
	}
	return null;
}

export async function findYouTubeByInstagram(username: string, bio: string): Promise<string | null> {
	// 1. Parse bio for explicit links
	const fromBio = extractYouTubeHandle(bio);
	if (fromBio) return fromBio;

	// 2. Web search via DuckDuckGo (free, no API key)
	try {
		const fromWeb = await findYouTubeByWebSearch(username);
		if (fromWeb) return fromWeb;
	} catch {
		// Web search failed, continue
	}

	// 3. Try common handle derivations
	const base = username.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (base.length >= 3) {
		const candidates = [base, base.replace(/(\d+)$/, '').trim()].filter(c => c.length >= 3);
		for (const c of [...new Set(candidates)]) {
			try {
				const { getChannelIdByHandle, getChannelData } = await import('./youtube');
				const ytId = await getChannelIdByHandle(c);
				const data = await getChannelData(ytId);
				// Check if names roughly match
				const normYt = normalizeName(data.title);
				const normIg = normalizeName(username);
				if (normYt === normIg || normYt.includes(normIg) || normIg.includes(normYt)) {
					return c;
				}
			} catch {
				continue;
			}
		}
	}

	// 3. Ask LLM
	try {
		const prompt = `I need the YouTube channel name or handle for the Instagram account "${username}".
Instagram bio: "${bio?.substring(0, 500)}"

Based on your knowledge, what is their YouTube channel name or handle?
Reply with ONLY the YouTube channel name or handle (no URL, no explanation).
If you don't know, reply exactly: null`;
		const result = await deepSeekChat(prompt, 'You know social media handles of many creators. Reply with only the channel name or null.', 50);
		if (result && result !== 'null' && result !== 'none' && result !== '') {
			return result.trim();
		}
	} catch {
		// LLM failed
	}
	return null;
}
