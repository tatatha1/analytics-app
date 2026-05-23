import { json } from '@sveltejs/kit';
import { getChannelData, getChannelIdByHandle, getVideoTimeline } from '$lib/server/youtube';
import { computeAndStoreYouTubeMetrics, storeTimelineInMemory, storeVideoEngagement } from '$lib/server/metrics';
import { getCached, setCache, buildCacheKey } from '$lib/server/cache';
import type { RequestEvent } from './$types';

export async function GET({ url }: RequestEvent) {
	const channelId = url.searchParams.get('channelId');
	const handle = url.searchParams.get('handle');
	const forceRefresh = url.searchParams.get('refresh') === 'true';

	if (!channelId && !handle) {
		return json({ error: 'Provide channelId or handle parameter' }, { status: 400 });
	}

	let id = channelId || '';
	if (handle && !channelId) {
		try {
			id = await getChannelIdByHandle(handle);
		} catch (err) {
			return json({
				error: true,
				message: err instanceof Error ? err.message : 'YouTube channel not found'
			}, { status: 404 });
		}
	}

	const cacheKey = buildCacheKey('youtube', 'full', id);
	if (!forceRefresh) {
		const cached = await getCached<any>(cacheKey);
		if (cached) return json(cached);
	}

	let channelData;
	let timelineData;
	try {
		channelData = await getChannelData(id);
		timelineData = await getVideoTimeline(id, 200);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'YouTube API request failed';
		return json({ error: true, message, warning: 'YouTube API error' }, { status: 502 });
	}

	let metrics = null;
	try {
		metrics = await computeAndStoreYouTubeMetrics(id, channelData, timelineData.videos);
	} catch (err) {
		console.warn('Metrics storage failed (non-critical):', err);
	}

	storeTimelineInMemory(id, timelineData.timeline);
	storeVideoEngagement(id, timelineData.videos);

	const result = {
		channel: channelData,
		videos: timelineData.videos.slice(0, 15),
		timeline: timelineData.timeline,
		metrics
	};

	await setCache(cacheKey, result, 3600000);

	return json(result);
}
