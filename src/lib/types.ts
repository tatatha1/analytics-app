export type Platform = 'youtube' | 'instagram';

export interface Account {
	id: string;
	platform: Platform;
	username: string;
	display_name: string;
	avatar_url: string;
	last_synced: string | null;
}

export interface YouTubeChannelData {
	id: string;
	title: string;
	description: string;
	subscriber_count: number;
	view_count: number;
	video_count: number;
	avatar_url: string;
	banner_url: string;
	joined_date: string;
}

export interface YouTubeVideo {
	id: string;
	title: string;
	description: string;
	published_at: string;
	view_count: number;
	like_count: number;
	comment_count: number;
	duration: string;
	thumbnail_url: string;
}

export interface InstagramProfileData {
	id: string;
	username: string;
	full_name: string;
	follower_count: number;
	following_count: number;
	post_count: number;
	avatar_url: string;
	bio: string;
}

export interface InstagramPost {
	id: string;
	caption: string;
	like_count: number;
	comment_count: number;
	video_view_count: number | null;
	timestamp: string;
	media_url: string;
	media_type: 'image' | 'video' | 'carousel';
}

export interface PostMetrics {
	post_id: string;
	platform: Platform;
	views: number;
	likes: number;
	comments: number;
	engagement_rate: number;
	published_at: string;
}

export interface AccountMetrics {
	account_id: string;
	platform: Platform;
	followers: number;
	views_total: number;
	posts_count: number;
	engagement_rate_avg: number;
	views_to_subscriber_ratio: number;
	upload_frequency_days: number;
	recorded_at: string;
}

export interface TrendingMetric {
	metric: string;
	current: number;
	previous: number;
	change_percent: number;
	direction: 'up' | 'down' | 'stable';
}

export interface AIReport {
	summary: string;
	strengths: string[];
	weaknesses: string[];
	patterns: string[];
	recommendations: string[];
	prognosis?: string;
	generated_at: string;
}

export interface FilterState {
	platform: Platform | 'all';
	period: '7d' | '30d' | '90d' | '1y';
	account_id: string | null;
	video_type: 'all' | 'short' | 'long';
	sort_by: string;
	sort_order: 'asc' | 'desc';
}

export interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number;
}

export interface TimelinePoint {
	date: string;
	cumulative_views: number;
	cumulative_likes: number;
	videos_published: number;
}

export interface APIWarning {
	platform: string;
	message: string;
	severity: 'warning' | 'error';
	timestamp: string;
}
