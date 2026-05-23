import { json } from '@sveltejs/kit';
import { generateReport } from '$lib/server/deepseek';
import { getChannelData, getLatestVideos } from '$lib/server/youtube';
import { getProfileData, getRecentPosts } from '$lib/server/instagram';
import type { RequestEvent } from './$types';
import type { YouTubeVideo, InstagramPost } from '$lib/types';

export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const { youtubeChannelId, instagramUsername } = body;

		if (!youtubeChannelId && !instagramUsername) {
			return json({ error: 'Provide at least youtubeChannelId or instagramUsername' }, { status: 400 });
		}

	let channelData: Awaited<ReturnType<typeof getChannelData>> | null = null;
	let videos: YouTubeVideo[] = [];
	let profileData: Awaited<ReturnType<typeof getProfileData>> | null = null;
	let posts: InstagramPost[] = [];

		if (youtubeChannelId) {
			try {
				channelData = await getChannelData(youtubeChannelId);
				videos = await getLatestVideos(youtubeChannelId, 10);
			} catch (err) {
				console.warn('YouTube data fetch failed for report:', err);
			}
		}

		if (instagramUsername) {
			try {
				profileData = await getProfileData(instagramUsername);
				posts = await getRecentPosts(instagramUsername, 10);
			} catch (err) {
				console.warn('Instagram data fetch failed for report:', err);
			}
		}

		if (!channelData && !profileData) {
			return json({ error: 'Could not fetch data from any platform' }, { status: 502 });
		}

		const report = await generateReport(channelData, videos, profileData, posts);

		return json({ report });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('Report generation error:', message);

		return json({
			error: true,
			message,
			warning: 'AI report generation failed. Please try again later.'
		}, { status: 502 });
	}
}
