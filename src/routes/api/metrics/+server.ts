import { json } from '@sveltejs/kit';
import { getMetricHistory, getLatestMetric } from '$lib/server/db';
import {
	getTrendingMetrics, getMetricsFromMemory, getTimelineFromMemory,
	getVideoEngagement, estimateFollowerHistory,
	getFilteredTimeline, getFilteredVideoER, getFilteredFollowerHistory,
	getFilteredVideoData, hasInstagramPosts, getInstagramChartData
} from '$lib/server/metrics';
import type { RequestEvent } from './$types';

export async function GET({ url }: RequestEvent) {
	try {
		const accountId = url.searchParams.get('accountId');
		const period = url.searchParams.get('period') || '30d';
		const videoType = (url.searchParams.get('videoType') || 'all') as 'all' | 'short' | 'long';

		if (!accountId) {
			return json({ error: 'Provide accountId parameter' }, { status: 400 });
		}

		const days = parseInt(period.replace('d', '').replace('y', '365')) || 30;

		const dbHistory = await getMetricHistory(accountId, days);
		const dbLatest = await getLatestMetric(accountId);

		const history = dbHistory.length > 0
			? dbHistory
			: getMetricsFromMemory(accountId, days);

		const latest = dbLatest || (history.length > 0 ? history[history.length - 1] : null);
		const trends = await getTrendingMetrics(accountId, days);

		// Use filtered data when videoType is set
		const filteredTimeline = videoType === 'all'
			? getTimelineFromMemory(accountId).filter((p) => new Date(p.date).getTime() > Date.now() - days * 86400000)
			: getFilteredTimeline(accountId, days, videoType);

		const videoER = videoType === 'all'
			? getVideoEngagement(accountId, days)
			: getFilteredVideoER(accountId, days, videoType);

		const currentFollowers = latest?.followers || 0;
		const followerHistory = videoType === 'all'
			? estimateFollowerHistory(accountId, currentFollowers, days)
			: getFilteredFollowerHistory(accountId, currentFollowers, days, videoType);

		// Compute additional KPIs from the filtered data
		const filteredVideos = getFilteredVideoData(accountId, days, videoType);
		const totalViews = filteredVideos.reduce((s, v) => s + v.views, 0);
		const totalLikes = filteredVideos.reduce((s, v) => s + v.likes, 0);
		const videoCount = filteredVideos.length || latest?.posts_count || 0;

		const avgViewsPerVideo = videoCount > 0 ? Math.round(totalViews / videoCount) : 0;
		const viewsPerSub = currentFollowers > 0 ? Math.round((totalViews / currentFollowers) * 10) / 10 : 0;
		const avgLikeRate = totalViews > 0 ? Math.round((totalLikes / totalViews) * 10000) / 100 : 0;
		const avgER = videoER.length > 0
			? Math.round(videoER.reduce((s, v) => s + v.engagement_rate, 0) / videoER.length * 100) / 100
			: 0;

		// Enrich trends with period-based estimates
		let estimatedTrends = trends;
		if (trends.length === 0 && followerHistory.length > 1) {
			const first = followerHistory[0].value;
			const last = followerHistory[followerHistory.length - 1].value;
			const change = first > 0 ? ((last - first) / first) * 100 : 0;
			estimatedTrends = [
				{
					metric: 'Followers',
					current: last,
					previous: first,
					change_percent: Math.round(change * 100) / 100,
					direction: change > 1 ? 'up' : change < -1 ? 'down' : 'stable'
				},
				{
					metric: 'Total Views',
					current: totalViews,
					previous: 0,
					change_percent: 0,
					direction: 'stable'
				},
				{
					metric: 'Avg Views / Video',
					current: avgViewsPerVideo,
					previous: 0,
					change_percent: 0,
					direction: 'stable'
				},
				{
					metric: 'Views per Subscriber',
					current: viewsPerSub,
					previous: 0,
					change_percent: 0,
					direction: 'stable'
				},
				{
					metric: 'Avg Like Rate',
					current: avgLikeRate,
					previous: 0,
					change_percent: 0,
					direction: 'stable'
				},
				{
					metric: 'Avg Engagement Rate',
					current: avgER,
					previous: 0,
					change_percent: 0,
					direction: 'stable'
				}
			];
		}

		// Instagram-specific chart data (if account is Instagram)
		let igData = null;
		if (hasInstagramPosts(accountId)) {
			const ig = getInstagramChartData(accountId, currentFollowers, days);
			igData = {
				timeline: ig.timeline.map((t) => ({
					date: t.date,
					likes: t.cumulative_likes,
					comments: t.cumulative_comments,
					posts: t.posts_count
				})),
				followerHistory: ig.followerHistory,
				engagement: ig.engagement,
				comments: ig.comments,
				likeRatio: ig.likeRatio
			};

			// Override KPIs with Instagram-specific metrics
			const avgLikeRatio = ig.likeRatio.length > 0
				? Math.round(ig.likeRatio.reduce((s, v) => s + v.value, 0) / ig.likeRatio.length * 100) / 100
				: 0;
			const avgER = ig.engagement.length > 0
				? Math.round(ig.engagement.reduce((s, v) => s + v.value, 0) / ig.engagement.length * 100) / 100
				: 0;
			const totalLikesIG = ig.timeline.length > 0 ? ig.timeline[ig.timeline.length - 1].cumulative_likes : 0;
			const totalCommentsIG = ig.timeline.length > 0 ? ig.timeline[ig.timeline.length - 1].cumulative_comments : 0;

			if (estimatedTrends.length === 0 || !estimatedTrends[0]?.metric?.includes('Followers')) {
				estimatedTrends = [
					{
						metric: 'Followers',
						current: currentFollowers,
						previous: 0,
						change_percent: 0,
						direction: 'stable'
					},
					{
						metric: 'Avg Like Ratio',
						current: avgLikeRatio,
						previous: 0,
						change_percent: 0,
						direction: 'stable'
					},
					{
						metric: 'Avg Engagement Rate',
						current: avgER,
						previous: 0,
						change_percent: 0,
						direction: 'stable'
					},
					{
						metric: 'Total Likes',
						current: totalLikesIG,
						previous: 0,
						change_percent: 0,
						direction: 'stable'
					},
					{
						metric: 'Total Comments',
						current: totalCommentsIG,
						previous: 0,
						change_percent: 0,
						direction: 'stable'
					},
					{
						metric: 'Posts Analyzed',
						current: ig.timeline.length,
						previous: 0,
						change_percent: 0,
						direction: 'stable'
					}
				];
			}
		}

		return json({
			history: history.map((r: any) => ({
				date: r.recorded_at,
				followers: r.followers,
				views: r.views_total,
				engagement_rate: r.engagement_rate_avg,
				upload_frequency: r.upload_frequency_days
			})),
			timeline: filteredTimeline.map((p) => ({
				date: p.date,
				views: p.cumulative_views,
				likes: p.cumulative_likes,
				videos: p.videos_published
			})),
			followerHistory: followerHistory.map((f) => ({
				date: f.date,
				value: f.value
			})),
			videoER: videoER.map((v) => ({
				date: v.date,
				title: v.title,
				videoId: v.videoId,
				value: v.engagement_rate
			})),
			// Instagram-specific data
			instagram: igData,
			platform: igData ? 'instagram' : 'youtube',
			latest,
			trends: estimatedTrends
		});
	} catch (err) {
		console.error('Metrics fetch error:', err);
		return json({
			history: [],
			timeline: [],
			followerHistory: [],
			videoER: [],
			latest: null,
			trends: [],
			warning: 'Could not load metrics'
		});
	}
}
