<script lang="ts">
	import type { TrendingMetric } from '$lib/types';

	let {
		metrics = [] as TrendingMetric[],
		loading = false
	}: { metrics: TrendingMetric[]; loading: boolean } = $props();

	function formatValue(metric: TrendingMetric): string {
		const name = metric.metric;
		if (name.includes('Rate') || name.includes('Engagement')) {
			return `${metric.current.toFixed(2)}%`;
		}
		if (name.includes('Frequency') || name.includes('days')) {
			return `${metric.current.toFixed(1)}d`;
		}
		if (name.includes('Views per') || name.includes('Views /')) {
			return metric.current.toFixed(1);
		}
		return metric.current >= 1000000
			? `${(metric.current / 1000000).toFixed(1)}M`
			: metric.current >= 1000
				? `${(metric.current / 1000).toFixed(1)}K`
				: metric.current.toLocaleString();
	}
</script>

<div class="kpi-grid">
	{#if loading}
		{#each [1, 2, 3, 4] as _}
			<div class="kpi-card skeleton">
				<div class="skeleton-line skeleton-title"></div>
				<div class="skeleton-line skeleton-value"></div>
			</div>
		{/each}
	{:else if metrics.length > 0}
		{#each metrics as metric}
			<div class="kpi-card">
				<div class="kpi-header">
					<span class="kpi-label">{metric.metric}</span>
					<span class="kpi-change" class:up={metric.direction === 'up'} class:down={metric.direction === 'down'}>
						{metric.direction === 'up' ? '▲' : metric.direction === 'down' ? '▼' : '―'}
						{metric.change_percent > 0 ? '+' : ''}{metric.change_percent.toFixed(1)}%
					</span>
				</div>
				<div class="kpi-value">{formatValue(metric)}</div>
				<div class="kpi-footer">
					Previous: {metric.previous >= 1000 ? `${(metric.previous / 1000).toFixed(1)}K` : metric.previous.toLocaleString()}
				</div>
			</div>
		{/each}
	{:else}
		<div class="kpi-card empty">
			<div class="empty-text">No metrics available</div>
		</div>
	{/if}
</div>

<style>
	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 1rem;
		padding: 1rem;
	}

	.kpi-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1.25rem;
		transition: box-shadow 0.2s;
	}

	.kpi-card:hover {
		box-shadow: 0 2px 8px rgba(0,0,0,0.08);
	}

	.kpi-card.skeleton {
		pointer-events: none;
	}

	.skeleton-line {
		height: 14px;
		background: linear-gradient(90deg, var(--border) 25%, var(--hover) 50%, var(--border) 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		border-radius: 4px;
		margin-bottom: 0.75rem;
	}

	.skeleton-title {
		width: 60%;
	}

	.skeleton-value {
		width: 40%;
		height: 28px;
	}

	@keyframes shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}

	.kpi-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.kpi-label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-secondary);
	}

	.kpi-change {
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		background: var(--bg);
		color: var(--text-secondary);
	}

	.kpi-change.up {
		color: #16a34a;
		background: #dcfce7;
	}

	.kpi-change.down {
		color: #dc2626;
		background: #fef2f2;
	}

	.kpi-value {
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--text);
		line-height: 1.2;
		margin-bottom: 0.375rem;
	}

	.kpi-footer {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.kpi-card.empty {
		grid-column: 1 / -1;
		text-align: center;
		padding: 3rem;
	}

	.empty-text {
		color: var(--text-secondary);
		font-size: 0.875rem;
	}
</style>
