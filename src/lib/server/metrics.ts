import type { YouTubeChannelData, YouTubeVideo, InstagramProfileData, InstagramPost, AccountMetrics, TrendingMetric, TimelinePoint } from '$lib/types';
import { saveAccount, savePost, saveMetric, getMetricHistory } from './db';
import { parseDurationIso, classifyVideoType } from './youtube';

// In-memory fallback metrics store — populated directly by API routes when DB is unavailable
const memoryMetricsStore = new Map<string, AccountMetrics[]>();
const memoryTimelineStore = new Map<string, TimelinePoint[]>();

export function storeMetricsInMemory(metrics: AccountMetrics): void {
	const list = memoryMetricsStore.get(metrics.account_id) || [];
	list.push(metrics);
	memoryMetricsStore.set(metrics.account_id, list);
}

export function getMetricsFromMemory(accountId: string, days: number = 30): AccountMetrics[] {
	const list = memoryMetricsStore.get(accountId) || [];
	const cutoff = Date.now() - days * 86400000;
	return list
		.filter((m) => new Date(m.recorded_at).getTime() > cutoff)
		.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
}

export function storeTimelineInMemory(accountId: string, timeline: TimelinePoint[]): void {
	memoryTimelineStore.set(accountId, timeline);
}

export function getTimelineFromMemory(accountId: string): TimelinePoint[] {
	return memoryTimelineStore.get(accountId) || [];
}

export interface VideoDataPoint {
	date: string;
	title: string;
	videoId: string;
	views: number;
	likes: number;
	comments: number;
	engagement_rate: number;
	duration_seconds: number;
	video_type: 'short' | 'long';
}

// Per-video raw data store (includes type classification)
const memoryVideoData = new Map<string, VideoDataPoint[]>();

// Per-video engagement rate store (legacy, kept for compatibility)
const memoryVideoER = new Map<string, Array<{ date: string; title: string; videoId: string; engagement_rate: number }>>();

export function storeVideoEngagement(accountId: string, videos: YouTubeVideo[]): void {
	const sorted = [...videos].sort(
		(a, b) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime()
	);

	const erData = sorted.map((v) => ({
		date: v.published_at,
		title: v.title,
		videoId: v.id,
		engagement_rate: v.view_count > 0
			? Math.round(((v.like_count + v.comment_count) / v.view_count) * 10000) / 100
			: 0
	}));
	memoryVideoER.set(accountId, erData);

	const rawData: VideoDataPoint[] = sorted.map((v) => {
		const dur = parseDurationIso(v.duration);
		return {
			date: v.published_at,
			title: v.title,
			videoId: v.id,
			views: v.view_count,
			likes: v.like_count,
			comments: v.comment_count,
			engagement_rate: v.view_count > 0
				? Math.round(((v.like_count + v.comment_count) / v.view_count) * 10000) / 100
				: 0,
			duration_seconds: dur,
			video_type: classifyVideoType(dur)
		};
	});
	memoryVideoData.set(accountId, rawData);
}

export function getVideoEngagement(accountId: string, days: number): Array<{ date: string; title: string; videoId: string; engagement_rate: number }> {
	const data = memoryVideoER.get(accountId) || [];
	const cutoff = Date.now() - days * 86400000;
	return data.filter((d) => new Date(d.date).getTime() > cutoff);
}

export function estimateFollowerHistory(accountId: string, currentFollowers: number, days: number): Array<{ date: string; value: number }> {
	const timeline = getTimelineFromMemory(accountId);
	const cutoff = Date.now() - days * 86400000;
	const filtered = timeline.filter((p) => new Date(p.date).getTime() > cutoff);

	if (filtered.length === 0 || filtered[filtered.length - 1].cumulative_views === 0) {
		return [];
	}

	const totalViews = filtered[filtered.length - 1].cumulative_views;

	return filtered.map((p) => ({
		date: p.date,
		value: Math.round((p.cumulative_views / totalViews) * currentFollowers)
	}));
}

export function getFilteredVideoData(
	accountId: string,
	days: number,
	videoType: 'all' | 'short' | 'long'
): VideoDataPoint[] {
	const all = memoryVideoData.get(accountId) || [];
	const cutoff = Date.now() - days * 86400000;
	return all.filter((v) => {
		if (new Date(v.date).getTime() <= cutoff) return false;
		if (videoType === 'all') return true;
		return v.video_type === videoType;
	});
}

export function getFilteredTimeline(
	accountId: string,
	days: number,
	videoType: 'all' | 'short' | 'long'
): TimelinePoint[] {
	const filtered = getFilteredVideoData(accountId, days, videoType);
	if (filtered.length === 0) return [];

	let cumViews = 0;
	let cumLikes = 0;
	return filtered.map((v, i) => {
		cumViews += v.views;
		cumLikes += v.likes;
		return {
			date: v.date,
			cumulative_views: cumViews,
			cumulative_likes: cumLikes,
			videos_published: i + 1
		};
	});
}

export function getFilteredVideoER(
	accountId: string,
	days: number,
	videoType: 'all' | 'short' | 'long'
): Array<{ date: string; title: string; videoId: string; engagement_rate: number }> {
	const filtered = getFilteredVideoData(accountId, days, videoType);
	return filtered.map((v) => ({
		date: v.date,
		title: v.title,
		videoId: v.videoId,
		engagement_rate: v.engagement_rate
	}));
}

export function getFilteredFollowerHistory(
	accountId: string,
	currentFollowers: number,
	days: number,
	videoType: 'all' | 'short' | 'long'
): Array<{ date: string; value: number }> {
	const filtered = getFilteredVideoData(accountId, days, videoType);
	if (filtered.length === 0) return [];

	const totalViews = filtered.reduce((s, v) => s + v.views, 0);
	if (totalViews === 0) return [];

	let cumViews = 0;
	return filtered.map((v) => {
		cumViews += v.views;
		return {
			date: v.date,
			value: Math.round((cumViews / totalViews) * currentFollowers)
		};
	});
}

// --- Instagram post data store ---
const memoryIGPosts = new Map<string, Array<{
	date: string;
	postId: string;
	caption: string;
	likes: number;
	comments: number;
	engagement_rate: number;
	like_ratio: number;
	media_type: string;
	media_url: string;
}>>();

export function storeInstagramPosts(accountId: string, posts: InstagramPost[], followers: number): void {
	const sorted = [...posts].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
	);

	const data = sorted.map((p) => ({
		date: p.timestamp,
		postId: p.id,
		caption: p.caption?.substring(0, 100) || '',
		likes: p.like_count,
		comments: p.comment_count,
		engagement_rate: followers > 0
			? Math.round(((p.like_count + p.comment_count) / followers) * 10000) / 100
			: 0,
		like_ratio: followers > 0
			? Math.round((p.like_count / followers) * 10000) / 100
			: 0,
		media_type: p.media_type,
		media_url: p.media_url
	}));

	memoryIGPosts.set(accountId, data);
}

function getInstagramTimeline(accountId: string, days: number): Array<{ date: string; cumulative_likes: number; cumulative_comments: number; posts_count: number }> {
	const posts = memoryIGPosts.get(accountId) || [];
	const cutoff = Date.now() - days * 86400000;
	const filtered = posts.filter((p) => new Date(p.date).getTime() > cutoff);

	let cumLikes = 0;
	let cumComments = 0;
	return filtered.map((p, i) => {
		cumLikes += p.likes;
		cumComments += p.comments;
		return {
			date: p.date,
			cumulative_likes: cumLikes,
			cumulative_comments: cumComments,
			posts_count: i + 1
		};
	});
}

function getInstagramPostER(accountId: string, days: number): Array<{ date: string; postId: string; caption: string; value: number }> {
	const posts = memoryIGPosts.get(accountId) || [];
	const cutoff = Date.now() - days * 86400000;
	return posts
		.filter((p) => new Date(p.date).getTime() > cutoff)
		.map((p) => ({
			date: p.date,
			postId: p.postId,
			caption: p.caption,
			value: p.engagement_rate
		}));
}

function getInstagramComments(accountId: string, days: number): Array<{ date: string; postId: string; caption: string; value: number }> {
	const posts = memoryIGPosts.get(accountId) || [];
	const cutoff = Date.now() - days * 86400000;
	return posts
		.filter((p) => new Date(p.date).getTime() > cutoff)
		.map((p) => ({
			date: p.date,
			postId: p.postId,
			caption: p.caption,
			value: p.comments
		}));
}

function getInstagramFollowerHistory(accountId: string, currentFollowers: number, days: number): Array<{ date: string; value: number }> {
	const posts = memoryIGPosts.get(accountId) || [];
	const cutoff = Date.now() - days * 86400000;
	const filtered = posts.filter((p) => new Date(p.date).getTime() > cutoff);

	if (filtered.length === 0) return [];

	const totalLikes = filtered.reduce((s, p) => s + p.likes, 0);
	if (totalLikes === 0) return [];

	let cumLikes = 0;
	return filtered.map((p) => {
		cumLikes += p.likes;
		return {
			date: p.date,
			value: Math.round((cumLikes / totalLikes) * currentFollowers)
		};
	});
}

function getInstagramLikeRatio(accountId: string, days: number): Array<{ date: string; postId: string; caption: string; value: number }> {
	const posts = memoryIGPosts.get(accountId) || [];
	const cutoff = Date.now() - days * 86400000;
	return posts
		.filter((p) => new Date(p.date).getTime() > cutoff)
		.map((p) => ({
			date: p.date,
			postId: p.postId,
			caption: p.caption,
			value: p.like_ratio
		}));
}

export function hasInstagramPosts(accountId: string): boolean {
	return memoryIGPosts.has(accountId);
}

export function getInstagramChartData(accountId: string, currentFollowers: number, days: number): {
	timeline: Array<{ date: string; cumulative_likes: number; cumulative_comments: number; posts_count: number }>;
	engagement: Array<{ date: string; postId: string; caption: string; value: number }>;
	comments: Array<{ date: string; postId: string; caption: string; value: number }>;
	followerHistory: Array<{ date: string; value: number }>;
	likeRatio: Array<{ date: string; postId: string; caption: string; value: number }>;
} {
	return {
		timeline: getInstagramTimeline(accountId, days),
		engagement: getInstagramPostER(accountId, days),
		comments: getInstagramComments(accountId, days),
		followerHistory: getInstagramFollowerHistory(accountId, currentFollowers, days),
		likeRatio: getInstagramLikeRatio(accountId, days)
	};
}

export function clearMemoryMetrics(accountId: string): void {
	memoryMetricsStore.delete(accountId);
	memoryTimelineStore.delete(accountId);
	memoryVideoER.delete(accountId);
	memoryVideoData.delete(accountId);
	memoryIGPosts.delete(accountId);
}

export function calculateYouTubeEngagementRate(video: YouTubeVideo): number {
	if (video.view_count === 0) return 0;
	return ((video.like_count + video.comment_count) / video.view_count) * 100;
}

export function calculateInstagramEngagementRate(post: InstagramPost, followers: number): number {
	if (followers === 0) return 0;
	return ((post.like_count + post.comment_count) / followers) * 100;
}

export function calculateViewsToSubscriberRatio(totalViews: number, subscribers: number): number {
	if (subscribers === 0) return 0;
	return totalViews / subscribers;
}

export function calculateUploadFrequency(publishedDates: string[]): number {
	if (publishedDates.length < 2) return 0;

	const dates = publishedDates
		.map((d) => new Date(d).getTime())
		.sort((a, b) => b - a);

	const gaps: number[] = [];
	for (let i = 0; i < dates.length - 1; i++) {
		const gap = (dates[i] - dates[i + 1]) / (1000 * 60 * 60 * 24);
		gaps.push(gap);
	}

	return gaps.length > 0
		? gaps.reduce((sum, g) => sum + g, 0) / gaps.length
		: 0;
}

export function computeYouTubeMetrics(
	accountId: string,
	channelData: YouTubeChannelData,
	videos: YouTubeVideo[]
): AccountMetrics {
	const engagementRates = videos.map(calculateYouTubeEngagementRate);
	const avgER = engagementRates.length > 0
		? engagementRates.reduce((s, r) => s + r, 0) / engagementRates.length
		: 0;

	return {
		account_id: accountId,
		platform: 'youtube',
		followers: channelData.subscriber_count,
		views_total: channelData.view_count,
		posts_count: channelData.video_count,
		engagement_rate_avg: Math.round(avgER * 100) / 100,
		views_to_subscriber_ratio: Math.round(calculateViewsToSubscriberRatio(
			channelData.view_count, channelData.subscriber_count
		) * 100) / 100,
		upload_frequency_days: Math.round(calculateUploadFrequency(
			videos.map((v) => v.published_at)
		) * 10) / 10,
		recorded_at: new Date().toISOString()
	};
}

export function computeInstagramMetrics(
	accountId: string,
	profileData: InstagramProfileData,
	posts: InstagramPost[]
): AccountMetrics {
	const engagementRates = posts.map((p) => calculateInstagramEngagementRate(p, profileData.follower_count));
	const avgER = engagementRates.length > 0
		? engagementRates.reduce((s, r) => s + r, 0) / engagementRates.length
		: 0;

	return {
		account_id: accountId,
		platform: 'instagram',
		followers: profileData.follower_count,
		views_total: posts.reduce((s, p) => s + (p.video_view_count || 0), 0),
		posts_count: profileData.post_count,
		engagement_rate_avg: Math.round(avgER * 100) / 100,
		views_to_subscriber_ratio: 0,
		upload_frequency_days: Math.round(calculateUploadFrequency(
			posts.map((p) => p.timestamp)
		) * 10) / 10,
		recorded_at: new Date().toISOString()
	};
}

export async function computeAndStoreYouTubeMetrics(
	accountId: string,
	channelData: YouTubeChannelData,
	videos: YouTubeVideo[]
): Promise<AccountMetrics> {
	const metrics = computeYouTubeMetrics(accountId, channelData, videos);

	// Store in memory immediately so it's available for the metrics endpoint
	storeMetricsInMemory(metrics);

	// Then try DB asynchronously — don't await (non-blocking)
	saveAccount({
		id: accountId,
		platform: 'youtube',
		username: channelData.title,
		display_name: channelData.title,
		avatar_url: channelData.avatar_url
	}).catch(() => {});

	for (const v of videos) {
		savePost({
			id: v.id,
			account_id: accountId,
			platform: 'youtube',
			title: v.title,
			description: v.description,
			published_at: v.published_at,
			view_count: v.view_count,
			like_count: v.like_count,
			comment_count: v.comment_count,
			thumbnail_url: v.thumbnail_url
		}).catch(() => {});
	}

	saveMetric({
		account_id: accountId,
		platform: 'youtube',
		followers: metrics.followers,
		views_total: metrics.views_total,
		posts_count: metrics.posts_count,
		engagement_rate_avg: metrics.engagement_rate_avg,
		views_to_subscriber_ratio: metrics.views_to_subscriber_ratio,
		upload_frequency_days: metrics.upload_frequency_days
	}).catch(() => {});

	return metrics;
}

export async function computeAndStoreInstagramMetrics(
	accountId: string,
	profileData: InstagramProfileData,
	posts: InstagramPost[]
): Promise<AccountMetrics> {
	const metrics = computeInstagramMetrics(accountId, profileData, posts);

	storeMetricsInMemory(metrics);

	saveAccount({
		id: accountId,
		platform: 'instagram',
		username: profileData.username,
		display_name: profileData.full_name,
		avatar_url: profileData.avatar_url
	}).catch(() => {});

	for (const p of posts) {
		savePost({
			id: p.id,
			account_id: accountId,
			platform: 'instagram',
			title: p.caption?.substring(0, 200),
			description: p.caption,
			published_at: p.timestamp,
			view_count: p.video_view_count || p.like_count,
			like_count: p.like_count,
			comment_count: p.comment_count,
			thumbnail_url: p.media_url,
			media_type: p.media_type
		}).catch(() => {});
	}

	saveMetric({
		account_id: accountId,
		platform: 'instagram',
		followers: metrics.followers,
		views_total: metrics.views_total,
		posts_count: metrics.posts_count,
		engagement_rate_avg: metrics.engagement_rate_avg,
		views_to_subscriber_ratio: metrics.views_to_subscriber_ratio,
		upload_frequency_days: metrics.upload_frequency_days
	}).catch(() => {});

	return metrics;
}

export async function getTrendingMetrics(accountId: string, days: number = 30): Promise<TrendingMetric[]> {
	// Try DB first
	const dbRows = await getMetricHistory(accountId, days);

	// Fall back to in-memory store
	const rows = dbRows.length > 0
		? dbRows
		: getMetricsFromMemory(accountId, days).map((m) => ({
			recorded_at: m.recorded_at,
			followers: m.followers,
			views_total: m.views_total,
			engagement_rate_avg: m.engagement_rate_avg,
			upload_frequency_days: m.upload_frequency_days
		}));

	if (rows.length < 1) {
		return [];
	}

	const current = rows[rows.length - 1];
	const previous = rows.length >= 2 ? rows[0] : current;

	const calcChange = (cur: number, prev: number): { change_percent: number; direction: 'up' | 'down' | 'stable' } => {
		if (prev === 0) return { change_percent: 0, direction: 'stable' };
		const change = ((cur - prev) / prev) * 100;
		return {
			change_percent: Math.round(change * 100) / 100,
			direction: change > 1 ? 'up' : change < -1 ? 'down' : 'stable'
		};
	};

	return [
		{
			metric: 'Followers',
			current: current.followers,
			previous: previous.followers,
			...calcChange(current.followers, previous.followers)
		},
		{
			metric: 'Total Views',
			current: current.views_total,
			previous: previous.views_total,
			...calcChange(current.views_total, previous.views_total)
		},
		{
			metric: 'Engagement Rate',
			current: current.engagement_rate_avg,
			previous: previous.engagement_rate_avg,
			...calcChange(current.engagement_rate_avg, previous.engagement_rate_avg)
		},
		{
			metric: 'Upload Frequency (days)',
			current: current.upload_frequency_days,
			previous: previous.upload_frequency_days,
			...calcChange(current.upload_frequency_days, previous.upload_frequency_days)
		}
	];
}
