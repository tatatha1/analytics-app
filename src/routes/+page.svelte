<script lang="ts">
	import { onMount } from 'svelte';
	import { filterState, addWarning, accountsStore } from '$lib/stores/filters.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import KPIGrid from '$lib/components/KPIGrid.svelte';
	import TrendChart from '$lib/components/TrendChart.svelte';
	import AIReport from '$lib/components/AIReport.svelte';
	import type { TrendingMetric, Account, AIReport as AIReportType } from '$lib/types';

	let metrics = $state<TrendingMetric[]>([]);
	let metricsLoading = $state(true);

	let viewsChart = $state<Array<{ date: string; value: number }>>([]);
	let likesChart = $state<Array<{ date: string; value: number }>>([]);
	let followersChart = $state<Array<{ date: string; value: number }>>([]);
	let erChart = $state<Array<{ date: string; title: string; videoId: string; value: number }>>([]);
	let erLabels = $state<string[]>([]);

	let igCommentsChart = $state<Array<{ date: string; postId: string; caption: string; value: number }>>([]);
	let igLikeRatioChart = $state<Array<{ date: string; postId: string; caption: string; value: number }>>([]);
	let currentPlatform = $state<'youtube' | 'instagram'>('youtube');

	let report = $state<AIReportType | null>(null);
	let reportLoading = $state(false);
	let reportError = $state('');
	let reportAccountId = $state<string | null>(null);

	$effect(() => {
		const state = $filterState;
		const accs = $accountsStore;
		if (state.platform !== 'all' && state.account_id) {
			const current = accs.find((a) => a.id === state.account_id);
			if (current && current.platform !== state.platform) {
				const matching = accs.find((a) => a.platform === state.platform);
				if (matching && matching.id !== state.account_id) {
					filterState.update((s) => ({ ...s, account_id: matching.id }));
					return;
				}
			}
		}
		if (state.account_id) {
			loadMetrics(state.account_id, state.period);
		} else if (accs.length > 0) {
			const first = accs[0];
			const targetPlatform = state.platform !== 'all' ? state.platform : first.platform;
			const target = accs.find((a) => a.platform === targetPlatform) || first;
			filterState.update((s) => ({ ...s, account_id: target.id }));
		}
	});

	async function loadMetrics(accountId: string, period: string) {
		metricsLoading = true;
		try {
			const vt = $filterState.video_type;
			const res = await fetch(`/api/metrics?accountId=${encodeURIComponent(accountId)}&period=${period}&videoType=${vt}`);
			const data = await res.json();

			if (data.trends) metrics = data.trends;
			currentPlatform = data.platform || 'youtube';

			if (data.instagram) {
				// Instagram-specific charts
				const ig = data.instagram;

				if (ig.timeline && ig.timeline.length > 1) {
					viewsChart = ig.timeline.map((t: any) => ({ date: t.date, value: t.likes }));
					likesChart = ig.timeline.map((t: any) => ({ date: t.date, value: t.comments }));
				} else {
					viewsChart = [];
					likesChart = [];
				}

				followersChart = (ig.followerHistory && ig.followerHistory.length > 1) ? ig.followerHistory : [];

				if (ig.engagement && ig.engagement.length > 0) {
					erChart = ig.engagement.map((v: any) => ({ date: v.date, title: v.caption, videoId: v.postId, value: v.value }));
					erLabels = ig.engagement.map((v: any) => v.caption || '');
				} else {
					erChart = [];
					erLabels = [];
				}

				igCommentsChart = (ig.comments && ig.comments.length > 0) ? ig.comments : [];
				igLikeRatioChart = (ig.likeRatio && ig.likeRatio.length > 0) ? ig.likeRatio : [];
			} else {
				// YouTube charts
				igCommentsChart = [];
				igLikeRatioChart = [];

				if (data.timeline && data.timeline.length > 1) {
					viewsChart = data.timeline.map((t: any) => ({ date: t.date, value: t.views }));
					likesChart = data.timeline.map((t: any) => ({ date: t.date, value: t.likes }));
				} else {
					viewsChart = [];
					likesChart = [];
				}

				if (data.followerHistory && data.followerHistory.length > 1) {
					followersChart = data.followerHistory;
				} else {
					followersChart = [];
				}

				if (data.videoER && data.videoER.length > 0) {
					erChart = data.videoER;
					erLabels = data.videoER.map((v: any) => v.title || '');
				} else {
					erChart = [];
					erLabels = [];
				}
			}
		} catch {
			addWarning({ platform: 'system', message: 'Could not load metrics', severity: 'warning', timestamp: new Date().toISOString() });
		} finally {
			metricsLoading = false;
		}
	}

	function openVideo(index: number) {
		const video = erChart[index];
		if (!video?.videoId) return;
		if (currentPlatform === 'instagram') {
			window.open(`https://www.instagram.com/p/${video.videoId}/`, '_blank');
		} else {
			window.open(`https://www.youtube.com/watch?v=${video.videoId}`, '_blank');
		}
	}

	function openInstagramPost(postId: string) {
		if (postId) window.open(`https://www.instagram.com/p/${postId}/`, '_blank');
	}

	async function generateReport() {
		const accountId = $filterState.account_id;
		if (!accountId) return;

		reportLoading = true;
		report = null;
		reportError = '';
		reportAccountId = accountId;

		try {
			// Fetch fresh accounts list to find the current account
			const accRes = await fetch('/api/accounts');
			const accData = await accRes.json();
			const account = (accData.accounts || []).find((a: any) => a.id === accountId);

			if (!account) {
				reportError = 'Konto nicht gefunden. Bitte Seite neu laden.';
				return;
			}

			const body: Record<string, string> = {};
			if (account.platform === 'youtube') body.youtubeChannelId = account.id;
			if (account.platform === 'instagram') body.instagramUsername = account.username;

			const res = await fetch('/api/report', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const data = await res.json();

			if (data.report) {
				report = data.report;
			} else if (data.message) {
				reportError = data.message;
			}

			if (data.warning) {
				addWarning({ platform: 'ai', message: data.warning, severity: 'warning', timestamp: new Date().toISOString() });
			}
		} catch (err) {
			reportError = err instanceof Error ? err.message : 'Verbindungsfehler beim Report-Generator';
		} finally {
			reportLoading = false;
		}
	}
</script>

<div class="dashboard">
	<FilterBar />

	<div class="dashboard-grid">
		<section class="section full-width">
			<h2 class="section-title">Key Performance Indicators</h2>
			<KPIGrid {metrics} loading={metricsLoading} />
		</section>

		{#if currentPlatform === 'instagram'}
			<section class="section chart-section">
				<h2 class="section-title">Total Likes Over Time</h2>
				<p class="section-subtitle">Cumulative likes from posts</p>
				<div class="chart-container">
					<TrendChart data={viewsChart} label="Cumulative Likes" color="#3b82f6" />
				</div>
			</section>

			<section class="section chart-section">
				<h2 class="section-title">Total Comments Over Time</h2>
				<p class="section-subtitle">Cumulative comments from posts</p>
				<div class="chart-container">
					<TrendChart data={likesChart} label="Cumulative Comments" color="#16a34a" />
				</div>
			</section>

			<section class="section chart-section">
				<h2 class="section-title">Followers Over Time</h2>
				<p class="section-subtitle">Estimated follower growth based on post performance</p>
				<div class="chart-container">
					<TrendChart data={followersChart} label="Estimated Followers" color="#8b5cf6" />
				</div>
			</section>

			<section class="section chart-section">
				<h2 class="section-title">Engagement Rate Per Post</h2>
				<p class="section-subtitle">(Likes + Comments) / Followers &times; 100</p>
				<div class="chart-container">
					<TrendChart data={erChart} label="Engagement Rate %" color="#f59e0b" dataLabels={erLabels} onPointClick={openVideo} />
				</div>
			</section>

			<section class="section chart-section">
				<h2 class="section-title">Comments Per Post</h2>
				<p class="section-subtitle">Click a dot to open the post</p>
				<div class="chart-container">
					<TrendChart data={igCommentsChart} label="Comments" color="#ef4444" dataLabels={igCommentsChart.map((c) => c.caption)} onPointClick={(i) => openInstagramPost(igCommentsChart[i]?.postId || '')} />
				</div>
			</section>

			<section class="section chart-section">
				<h2 class="section-title">Like Ratio Per Post</h2>
				<p class="section-subtitle">Likes / Followers &times; 100 — Conversion rate per post</p>
				<div class="chart-container">
					<TrendChart data={igLikeRatioChart} label="Like Ratio %" color="#ec4899" dataLabels={igLikeRatioChart.map((r) => r.caption)} onPointClick={(i) => openInstagramPost(igLikeRatioChart[i]?.postId || '')} />
				</div>
			</section>
		{:else}
			<section class="section chart-section">
				<h2 class="section-title">Total Views Over Time</h2>
				<p class="section-subtitle">Cumulative views based on video publish dates</p>
				<div class="chart-container">
					<TrendChart data={viewsChart} label="Cumulative Views" color="#3b82f6" />
				</div>
			</section>

			<section class="section chart-section">
				<h2 class="section-title">Total Likes Over Time</h2>
				<p class="section-subtitle">Cumulative likes based on video publish dates</p>
				<div class="chart-container">
					<TrendChart data={likesChart} label="Cumulative Likes" color="#16a34a" />
				</div>
			</section>

			<section class="section chart-section">
				<h2 class="section-title">Followers Over Time</h2>
				<p class="section-subtitle">Estimated growth based on video performance</p>
				<div class="chart-container">
					<TrendChart data={followersChart} label="Estimated Followers" color="#8b5cf6" />
				</div>
			</section>

			<section class="section chart-section">
				<h2 class="section-title">Engagement Rate Per Video</h2>
				<p class="section-subtitle">(Likes + Comments) / Views &times; 100 for each video</p>
				<div class="chart-container">
					<TrendChart data={erChart} label="Engagement Rate %" color="#f59e0b" dataLabels={erLabels} onPointClick={openVideo} />
				</div>
			</section>
		{/if}

		<section class="section full-width">
			<AIReport
				report={reportAccountId === $filterState.account_id ? report : null}
				loading={reportLoading}
				errorMsg={reportAccountId === $filterState.account_id ? reportError : ''}
				onGenerate={generateReport}
			/>
		</section>
	</div>
</div>

<style>
	.dashboard {
		display: flex;
		flex-direction: column;
		flex: 1;
	}

	.dashboard-grid {
		padding: 1rem;
	}

	.section {
		margin-bottom: 1rem;
	}

	.section-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		padding: 0.5rem 1rem;
		margin-bottom: 0;
	}

	.section-subtitle {
		font-size: 0.75rem;
		color: var(--text-secondary);
		padding: 0 1rem 0.5rem;
		margin: 0;
	}

	.section.full-width {
		grid-column: 1 / -1;
	}

	@media (min-width: 768px) {
		.dashboard-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 1rem;
		}

		.section.full-width {
			grid-column: 1 / -1;
		}

		.chart-section {
			margin-bottom: 0;
		}
	}

	.chart-container {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1rem;
	}
</style>
