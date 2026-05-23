<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { addWarning } from '$lib/stores/filters.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import AIReport from '$lib/components/AIReport.svelte';
	import type { Account, TrendingMetric, AIReport as AIReportType, YouTubeChannelData, YouTubeVideo, InstagramProfileData, InstagramPost } from '$lib/types';

	let account = $state<Account | null>(null);
	let loading = $state(true);
	let metrics = $state<TrendingMetric[]>([]);
	let followerHistory = $state<Array<{ date: string; value: number }>>([]);
	let engagementHistory = $state<Array<{ date: string; value: number }>>([]);
	let channelData = $state<YouTubeChannelData | null>(null);
	let videos = $state<YouTubeVideo[]>([]);
	let profileData = $state<InstagramProfileData | null>(null);
	let posts = $state<InstagramPost[]>([]);
	let report = $state<AIReportType | null>(null);
	let reportLoading = $state(false);

	onMount(async () => {
		const accountId = $page.params.id as string;
		await loadAccount(accountId);
		await loadData(accountId);
		await loadMetrics(accountId);
	});

	async function loadAccount(accountId: string) {
		try {
			const res = await fetch('/api/accounts');
			const data = await res.json();
			account = (data.accounts || []).find((a: Account) => a.id === accountId) || null;
		} catch {
			addWarning({ platform: 'system', message: 'Could not load account', severity: 'warning', timestamp: new Date().toISOString() });
		} finally {
			loading = false;
		}
	}

	async function loadData(accountId: string) {
		if (!account) return;
		try {
			if (account.platform === 'youtube') {
				const res = await fetch(`/api/youtube?channelId=${encodeURIComponent(accountId)}`);
				const data = await res.json();
				if (data.channel) channelData = data.channel;
				if (data.videos) videos = data.videos;
				if (data.warning) {
					addWarning({ platform: 'youtube', message: data.warning, severity: 'warning', timestamp: new Date().toISOString() });
				}
			} else if (account.platform === 'instagram') {
				const res = await fetch(`/api/instagram?username=${encodeURIComponent(account.username)}`);
				const data = await res.json();
				if (data.profile) profileData = data.profile;
				if (data.posts) posts = data.posts;
				if (data.warning) {
					addWarning({ platform: 'instagram', message: data.warning, severity: 'warning', timestamp: new Date().toISOString() });
				}
			}
		} catch {
			addWarning({ platform: account?.platform || 'system', message: 'Could not load account data', severity: 'warning', timestamp: new Date().toISOString() });
		}
	}

	async function loadMetrics(accountId: string) {
		try {
			const res = await fetch(`/api/metrics?accountId=${encodeURIComponent(accountId)}&period=30d`);
			const data = await res.json();
			if (data.trends) metrics = data.trends;
			if (data.history) {
				followerHistory = data.history.map((h: any) => ({ date: h.date, value: h.followers }));
				engagementHistory = data.history.map((h: any) => ({ date: h.date, value: h.engagement_rate }));
			}
		} catch {
			addWarning({ platform: 'system', message: 'Could not load metrics', severity: 'warning', timestamp: new Date().toISOString() });
		}
	}

	async function generateReport() {
		if (!account) return;
		reportLoading = true;
		report = null;

		try {
			const body: Record<string, string> = {};
			if (account.platform === 'youtube') body.youtubeChannelId = account.id;
			if (account.platform === 'instagram') body.instagramUsername = account.username;

			const res = await fetch('/api/report', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = await res.json();
			if (data.report) report = data.report;
		} catch {
			addWarning({ platform: 'ai', message: 'Report generation failed', severity: 'error', timestamp: new Date().toISOString() });
		} finally {
			reportLoading = false;
		}
	}
</script>

<div class="account-page">
	{#if loading}
		<div class="loading">Loading account data...</div>
	{:else if account}
		<div class="account-header">
			<div class="account-info">
				{#if account.avatar_url}
					<img src={account.avatar_url} alt={account.username} class="account-avatar" />
				{/if}
				<div>
					<h1 class="account-name">{account.display_name}</h1>
					<div class="account-meta">
						<span class="platform-badge">{account.platform}</span>
						<span class="account-username">@{account.username}</span>
						{#if account.last_synced}
							<span class="last-synced">Last synced: {new Date(account.last_synced).toLocaleString('de-DE')}</span>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<div class="detail-grid">
			<section class="detail-section">
				<h2>KPIs</h2>
				<div class="kpi-list">
					{#each metrics as m}
						<div class="kpi-row">
							<span class="kpi-name">{m.metric}</span>
							<span class="kpi-current">{m.current.toLocaleString()}</span>
							<span class="kpi-trend" class:up={m.direction === 'up'} class:down={m.direction === 'down'}>
								{m.direction === 'up' ? '▲' : m.direction === 'down' ? '▼' : '―'}
								{Math.abs(m.change_percent).toFixed(1)}%
							</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="detail-section full-width">
				<h2>Follower Growth</h2>
				<div class="chart-box">
					<TrendChart data={followerHistory} label="Followers" height={250} />
				</div>
			</section>

			<section class="detail-section full-width">
				<h2>Engagement Rate</h2>
				<div class="chart-box">
					<TrendChart data={engagementHistory} label="Engagement Rate %" color="#16a34a" height={250} />
				</div>
			</section>

			{#if channelData}
				<section class="detail-section full-width">
					<h2>YouTube Channel Info</h2>
					<div class="info-grid">
						<div class="info-item">
							<span class="info-label">Subscribers</span>
							<span class="info-value">{channelData.subscriber_count.toLocaleString()}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Total Views</span>
							<span class="info-value">{channelData.view_count.toLocaleString()}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Videos</span>
							<span class="info-value">{channelData.video_count.toLocaleString()}</span>
						</div>
					</div>
					{#if channelData.description}
						<p class="description">{channelData.description}</p>
					{/if}
				</section>

				<section class="detail-section full-width">
					<h2>Recent Videos</h2>
					<div class="posts-table">
						<div class="table-header">
							<span>Title</span>
							<span>Views</span>
							<span>Likes</span>
							<span>Comments</span>
							<span>ER</span>
							<span>Date</span>
						</div>
						{#each videos as v}
							<div class="table-row">
								<span class="post-title">{v.title}</span>
								<span>{v.view_count.toLocaleString()}</span>
								<span>{v.like_count.toLocaleString()}</span>
								<span>{v.comment_count.toLocaleString()}</span>
								<span class="er-badge">
									{v.view_count > 0 ? ((v.like_count + v.comment_count) / v.view_count * 100).toFixed(1) : '0'}%
								</span>
								<span class="post-date">{new Date(v.published_at).toLocaleDateString('de-DE')}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if profileData}
				<section class="detail-section full-width">
					<h2>Instagram Profile Info</h2>
					<div class="info-grid">
						<div class="info-item">
							<span class="info-label">Followers</span>
							<span class="info-value">{profileData.follower_count.toLocaleString()}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Following</span>
							<span class="info-value">{profileData.following_count.toLocaleString()}</span>
						</div>
						<div class="info-item">
							<span class="info-label">Posts</span>
							<span class="info-value">{profileData.post_count.toLocaleString()}</span>
						</div>
					</div>
					{#if profileData.bio}
						<p class="description">{profileData.bio}</p>
					{/if}
				</section>

				<section class="detail-section full-width">
					<h2>Recent Posts</h2>
					<div class="posts-table">
						<div class="table-header">
							<span>Type</span>
							<span>Likes</span>
							<span>Comments</span>
							<span>Views</span>
							<span>ER</span>
							<span>Date</span>
						</div>
						{#each posts as p}
							<div class="table-row">
								<span class="post-type">{p.media_type}</span>
								<span>{p.like_count.toLocaleString()}</span>
								<span>{p.comment_count.toLocaleString()}</span>
								<span>{p.video_view_count?.toLocaleString() || '-'}</span>
								<span class="er-badge">
									{profileData.follower_count > 0 ? ((p.like_count + p.comment_count) / profileData.follower_count * 100).toFixed(2) : '0'}%
								</span>
								<span class="post-date">{new Date(p.timestamp).toLocaleDateString('de-DE')}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<section class="detail-section full-width">
				<AIReport
					report={report}
					loading={reportLoading}
					onGenerate={generateReport}
				/>
			</section>
		</div>
	{:else}
		<div class="error-state">
			<h2>Account not found</h2>
			<p>The requested account could not be loaded.</p>
			<a href="/" class="back-link">Back to Dashboard</a>
		</div>
	{/if}
</div>

<style>
	.account-page {
		padding: 1.5rem;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
	}

	.loading, .error-state {
		text-align: center;
		padding: 3rem;
		color: var(--text-secondary);
	}

	.error-state h2 {
		margin-bottom: 0.5rem;
		color: var(--text);
	}

	.back-link {
		display: inline-block;
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		background: var(--primary);
		color: white;
		border-radius: 6px;
		text-decoration: none;
		font-size: 0.875rem;
	}

	.account-header {
		margin-bottom: 2rem;
	}

	.account-info {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.account-avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		object-fit: cover;
	}

	.account-name {
		font-size: 1.5rem;
		font-weight: 700;
	}

	.account-meta {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-top: 0.25rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.platform-badge {
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		background: var(--primary);
		color: white;
	}

	.last-synced {
		font-size: 0.75rem;
	}

	.detail-grid {
		display: grid;
		gap: 1.5rem;
	}

	.detail-section {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1.25rem;
	}

	.detail-section h2 {
		font-size: 1rem;
		font-weight: 600;
		margin-bottom: 1rem;
		color: var(--text);
	}

	.detail-section.full-width {
		grid-column: 1 / -1;
	}

	.kpi-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.kpi-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.625rem 0;
		border-bottom: 1px solid var(--border);
	}

	.kpi-row:last-child {
		border-bottom: none;
	}

	.kpi-name {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		flex: 1;
	}

	.kpi-current {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		margin-right: 1rem;
	}

	.kpi-trend {
		font-size: 0.75rem;
		font-weight: 600;
		min-width: 60px;
		text-align: right;
	}

	.kpi-trend.up { color: #16a34a; }
	.kpi-trend.down { color: #dc2626; }

	.chart-box {
		height: 250px;
	}

	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.info-label {
		font-size: 0.75rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.info-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text);
	}

	.description {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0;
	}

	.posts-table {
		overflow-x: auto;
	}

	.table-header, .table-row {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr 1fr 0.75fr 1fr;
		gap: 0.75rem;
		padding: 0.625rem 0.5rem;
		align-items: center;
		font-size: 0.8125rem;
	}

	.table-header {
		font-weight: 600;
		color: var(--text-secondary);
		border-bottom: 2px solid var(--border);
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.table-row {
		border-bottom: 1px solid var(--border);
	}

	.table-row:hover {
		background: var(--hover);
	}

	.post-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}

	.post-type {
		text-transform: capitalize;
	}

	.er-badge {
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		background: var(--bg);
		font-weight: 500;
		font-size: 0.75rem;
		text-align: center;
	}

	.post-date {
		color: var(--text-secondary);
		font-size: 0.75rem;
	}

	@media (min-width: 768px) {
		.detail-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
