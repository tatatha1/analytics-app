import { json } from '@sveltejs/kit';
import { getProfileData, getRecentPosts } from '$lib/server/instagram';
import { computeAndStoreInstagramMetrics, storeInstagramPosts } from '$lib/server/metrics';
import { getCached, setCache, buildCacheKey } from '$lib/server/cache';
import { CACHE_TTL_MS } from '$env/static/private';
import type { RequestEvent } from './$types';

export async function GET({ url }: RequestEvent) {
	try {
		const username = url.searchParams.get('username');
		const forceRefresh = url.searchParams.get('refresh') === 'true';

		if (!username) {
			return json({ error: 'Provide username parameter' }, { status: 400 });
		}

		const cacheKey = buildCacheKey('instagram', 'full', username);
		if (!forceRefresh) {
			const cached = await getCached<any>(cacheKey);
			if (cached) return json(cached);
		}

		const profileData = await getProfileData(username);
		const posts = await getRecentPosts(username, 12);
		const metrics = await computeAndStoreInstagramMetrics(profileData.id, profileData, posts);

		storeInstagramPosts(profileData.id, posts, profileData.follower_count);

		const result = { profile: profileData, posts, metrics };
		await setCache(cacheKey, result, parseInt(CACHE_TTL_MS) || 3600000);

		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('Instagram API error:', message);

		return json({
			error: true,
			message,
			warning: 'Instagram data request failed. Showing cached data if available.'
		}, { status: 502 });
	}
}
