import { env } from '$env/dynamic/private';
import { getCached, setCache, buildCacheKey } from './cache';
import type { YouTubeChannelData, YouTubeVideo } from '$lib/types';

const YOUTUBE_API_KEY = env.YOUTUBE_API_KEY || '';

export function parseDurationIso(duration: string): number {
	const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return 0;
	const hours = parseInt(match[1] || '0');
	const minutes = parseInt(match[2] || '0');
	const seconds = parseInt(match[3] || '0');
	return hours * 3600 + minutes * 60 + seconds;
}

export function classifyVideoType(durationSeconds: number): 'short' | 'long' {
	return durationSeconds <= 60 ? 'short' : 'long';
}

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3';

export interface TimelinePoint {
	date: string;
	cumulative_views: number;
	cumulative_likes: number;
	videos_published: number;
}

async function ytFetch<T>(endpoint: string, params: Record<string, string>): Promise<T> {
	const url = new URL(`${YT_API_BASE}/${endpoint}`);
	url.searchParams.set('key', YOUTUBE_API_KEY);
	for (const [k, v] of Object.entries(params)) {
		url.searchParams.set(k, v);
	}

	const res = await fetch(url.toString());
	if (!res.ok) {
		const errBody = await res.text();
		throw new Error(`YouTube API error ${res.status}: ${errBody}`);
	}
	return res.json() as Promise<T>;
}

export async function getChannelData(channelId: string): Promise<YouTubeChannelData> {
	const cacheKey = buildCacheKey('youtube', 'channel', channelId);
	const cached = await getCached<YouTubeChannelData>(cacheKey);
	if (cached) return cached;

	const data = await ytFetch<any>('channels', {
		part: 'snippet,statistics',
		id: channelId
	});

	if (!data.items?.length) {
		throw new Error(`YouTube channel not found: ${channelId}`);
	}

	const item = data.items[0];
	const channelData: YouTubeChannelData = {
		id: item.id,
		title: item.snippet.title,
		description: item.snippet.description,
		subscriber_count: parseInt(item.statistics.subscriberCount) || 0,
		view_count: parseInt(item.statistics.viewCount) || 0,
		video_count: parseInt(item.statistics.videoCount) || 0,
		avatar_url: item.snippet.thumbnails?.default?.url || '',
		banner_url: item.snippet.thumbnails?.high?.url || '',
		joined_date: item.snippet.publishedAt
	};

	await setCache(cacheKey, channelData);
	return channelData;
}

export async function getChannelIdByHandle(handle: string): Promise<string> {
	const cacheKey = buildCacheKey('youtube', 'handle', handle);
	const cached = await getCached<string>(cacheKey);
	if (cached) return cached;

	const data = await ytFetch<any>('search', {
		part: 'snippet',
		q: handle,
		type: 'channel',
		maxResults: '1'
	});

	if (!data.items?.length) {
		throw new Error(`No YouTube channel found for handle: ${handle}`);
	}

	const channelId = data.items[0].snippet.channelId;
	await setCache(cacheKey, channelId);
	return channelId;
}

function parseVideoFromApi(v: any): YouTubeVideo {
	return {
		id: v.id,
		title: v.snippet.title,
		description: v.snippet.description,
		published_at: v.snippet.publishedAt,
		view_count: parseInt(v.statistics.viewCount) || 0,
		like_count: parseInt(v.statistics.likeCount) || 0,
		comment_count: parseInt(v.statistics.commentCount) || 0,
		duration: v.contentDetails.duration,
		thumbnail_url: v.snippet.thumbnails?.high?.url || v.snippet.thumbnails?.default?.url || ''
	};
}

export async function getLatestVideos(
	channelId: string,
	maxResults: number = 10
): Promise<YouTubeVideo[]> {
	const cacheKey = buildCacheKey('youtube', 'videos', `${channelId}_${maxResults}`);
	const cached = await getCached<YouTubeVideo[]>(cacheKey);
	if (cached) return cached;

	const uploadPlaylistId = `UU${channelId.slice(2)}`;
	const allVideos: YouTubeVideo[] = [];
	let pageToken: string | null = null;

	while (allVideos.length < maxResults) {
		const params: Record<string, string> = {
			part: 'snippet,contentDetails',
			playlistId: uploadPlaylistId,
			maxResults: String(Math.min(50, maxResults))
		};
		if (pageToken) params.pageToken = pageToken;

		const playlistData = await ytFetch<any>('playlistItems', params);
		if (!playlistData.items?.length) break;

		const videoIds = playlistData.items
			.map((i: any) => i.contentDetails?.videoId)
			.filter(Boolean)
			.join(',');

		if (videoIds) {
			const videosData = await ytFetch<any>('videos', {
				part: 'snippet,statistics,contentDetails',
				id: videoIds
			});

			for (const v of videosData.items || []) {
				allVideos.push(parseVideoFromApi(v));
				if (allVideos.length >= maxResults) break;
			}
		}

		pageToken = playlistData.nextPageToken || null;
		if (!pageToken) break;
	}

	await setCache(cacheKey, allVideos);
	return allVideos;
}

export async function getVideoTimeline(channelId: string, maxVideos: number = 200): Promise<{
	videos: YouTubeVideo[];
	timeline: TimelinePoint[];
}> {
	const cacheKey = buildCacheKey('youtube', 'timeline', `${channelId}_${maxVideos}`);
	const cached = await getCached<{ videos: YouTubeVideo[]; timeline: TimelinePoint[] }>(cacheKey);
	if (cached) return cached;

	const videos = await getLatestVideos(channelId, maxVideos);

	const sorted = [...videos].sort(
		(a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
	);

	const timeline: TimelinePoint[] = [];
	let cumViews = 0;
	let cumLikes = 0;

	for (const v of sorted) {
		cumViews += v.view_count;
		cumLikes += v.like_count;
		timeline.push({
			date: v.published_at,
			cumulative_views: cumViews,
			cumulative_likes: cumLikes,
			videos_published: timeline.length + 1
		});
	}

	const result = { videos: sorted, timeline };
	await setCache(cacheKey, result);
	return result;
}
