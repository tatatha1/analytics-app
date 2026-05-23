import { env } from '$env/dynamic/private';
import { getCached, setCache, buildCacheKey } from './cache';
import type { InstagramProfileData, InstagramPost } from '$lib/types';

const RAPIDAPI_KEY = env.RAPIDAPI_KEY || '';

const RAPIDAPI_HOST = 'instagram-looter2.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}`;

const RAPIDAPI_CONFIGURED = RAPIDAPI_KEY && RAPIDAPI_KEY !== 'your_rapidapi_key_here';

async function rapidFetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
	if (!RAPIDAPI_CONFIGURED) {
		throw new Error(
			'Instagram API nicht konfiguriert. Benötigt: RAPIDAPI_KEY in .env. ' +
			'Registriere dich bei RapidAPI, abonniere "Instagram Looter2" und füge deinen Key ein.'
		);
	}

	const url = new URL(`${RAPIDAPI_BASE}${endpoint}`);
	for (const [k, v] of Object.entries(params)) {
		url.searchParams.set(k, v);
	}

	const res = await fetch(url.toString(), {
		headers: {
			'x-rapidapi-key': RAPIDAPI_KEY,
			'x-rapidapi-host': RAPIDAPI_HOST
		},
		signal: AbortSignal.timeout(15000)
	});

	if (!res.ok) {
		const errBody = await res.text().catch(() => 'unknown');
		throw new Error(`Instagram API Fehler ${res.status}: ${errBody}`);
	}

	return res.json() as Promise<T>;
}

export async function getProfileData(username: string): Promise<InstagramProfileData> {
	const cacheKey = buildCacheKey('instagram', 'profile', username);
	const cached = await getCached<InstagramProfileData>(cacheKey);
	if (cached) return cached;

	const raw = await rapidFetch<any>('/profile', { username });

	if (raw.status === false || raw.errorMessage) {
		throw new Error(raw.errorMessage || `Instagram-Profil nicht gefunden: ${username}`);
	}

	// Try different response structures
	const body = raw?.body || raw;
	const b = body?.data?.user || body;

	if (!b || (!b.username && !b.edge_followed_by && !b.follower_count)) {
		console.error('Instagram /profile unexpected format:', JSON.stringify(raw).substring(0, 1000));
		throw new Error(`Instagram-Profil nicht gefunden: ${username}`);
	}

	const profile: InstagramProfileData = {
		id: b.pk || b.id || username,
		username: b.username || username,
		full_name: b.full_name || b.fullName || username,
		follower_count: b.follower_count ?? b.edge_followed_by?.count ?? b.followerCount ?? 0,
		following_count: b.following_count ?? b.edge_follow?.count ?? b.followingCount ?? 0,
		post_count: b.media_count ?? b.edge_owner_to_timeline_media?.count ?? b.mediaCount ?? 0,
		avatar_url: b.profile_pic_url || b.profilePicUrl || b.avatar_url || '',
		bio: b.biography || b.bio || ''
	};

	await setCache(cacheKey, profile);
	return profile;
}

export async function getRecentPosts(username: string, limit: number = 12): Promise<InstagramPost[]> {
	const cacheKey = buildCacheKey('instagram', 'posts', `${username}_${limit}`);
	const cached = await getCached<InstagramPost[]>(cacheKey);
	if (cached) return cached;

	// First get user ID from username
	const idRaw = await rapidFetch<any>('/id', { username });
	if (idRaw.status === false || idRaw.errorMessage) {
		throw new Error(idRaw.errorMessage || `User-ID für ${username} nicht gefunden`);
	}
	const idBody = idRaw?.body || idRaw;
	const userId = idBody?.user_id || idBody?.pk || idBody?.id || idBody?.username;

	if (!userId) {
		console.error('Instagram /id unexpected format:', JSON.stringify(idRaw).substring(0, 500));
		throw new Error(`Konnte User-ID für ${username} nicht ermitteln`);
	}

	// Then fetch media
	const feedsRaw = await rapidFetch<any>('/user-feeds', { id: userId, count: String(limit) });
	const feedsBody = feedsRaw?.body || feedsRaw;
	const items = feedsBody?.items || feedsBody?.data?.user?.edge_owner_to_timeline_media?.edges?.map((e: any) => e.node) || [];

	const posts: InstagramPost[] = items.map((item: any) => {
		const caption = item.caption?.text || item.caption || '';
		const images = item.image_versions2?.candidates || item.display_resources || [];
		const videos = item.video_versions || [];
		const mediaUrl = videos?.[0]?.url || images?.[0]?.src || images?.[0]?.url || item.display_url || '';

		return {
			id: item.pk ? String(item.pk) : (item.id || ''),
			caption,
			like_count: item.like_count || item.edge_media_preview_like?.count || 0,
			comment_count: item.comment_count || item.edge_media_to_parent_comment?.count || 0,
			video_view_count: item.play_count || item.video_view_count || null,
			timestamp: item.taken_at ? new Date(item.taken_at * 1000).toISOString()
				: item.taken_at_timestamp ? new Date(item.taken_at_timestamp * 1000).toISOString()
				: new Date().toISOString(),
			media_url: mediaUrl,
			media_type: item.media_type === 2 ? 'video' : item.media_type === 8 ? 'carousel' : 'image'
		};
	});

	await setCache(cacheKey, posts);
	return posts;
}

export async function searchInstagramUsers(query: string): Promise<Array<{ username: string; full_name: string; follower_count: number; profile_pic_url: string }>> {
	const raw = await rapidFetch<any>('/search', { query, select: 'users' });
	if (raw.status === false || raw.errorMessage) return [];

	const body = raw?.body || raw;
	const users = body?.users || [];
	return users.map((u: any) => ({
		username: u.user?.username || u.username || '',
		full_name: u.user?.full_name || u.full_name || '',
		follower_count: u.user?.follower_count ?? u.edge_followed_by?.count ?? 0,
		profile_pic_url: u.user?.profile_pic_url || u.profile_pic_url || ''
	})).filter((u: any) => u.username);
}
