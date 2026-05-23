<script lang="ts">
	import { filterState, accountsStore } from '$lib/stores/filters.svelte';
	import type { Platform } from '$lib/types';

	const periods = [
		{ value: '7d', label: '7 Tage' },
		{ value: '30d', label: '30 Tage' },
		{ value: '90d', label: '90 Tage' },
		{ value: '1y', label: '1 Jahr' }
	] as const;

	function setPeriod(period: string) {
		filterState.update((s) => ({ ...s, period: period as '7d' | '30d' | '90d' | '1y' }));
	}

	function setPlatform(platform: string) {
		filterState.update((s) => ({ ...s, platform: platform as Platform | 'all' }));
	}

	function setVideoType(type: string) {
		filterState.update((s) => ({ ...s, video_type: type as 'all' | 'short' | 'long' }));
	}

	// Determine if we should show video type filter
	let showVideoType = $derived.by(() => {
		const state = $filterState;
		if (state.platform === 'instagram') return false;
		if (state.platform === 'youtube') return true;
		// 'all' — check if current account is YouTube
		if (state.account_id) {
			const acc = $accountsStore.find((a: any) => a.id === state.account_id);
			return acc?.platform === 'youtube';
		}
		return false;
	});
</script>

<div class="filter-bar">
	<div class="filter-group">
		<span class="filter-label">Zeitraum</span>
		<div class="btn-group" role="group" aria-label="Period">
			{#each periods as p}
				<button
					class="btn-filter"
					class:active={$filterState.period === p.value}
					onclick={() => setPeriod(p.value)}
				>
					{p.label}
				</button>
			{/each}
		</div>
	</div>

	<div class="filter-group">
		<span class="filter-label">Plattform</span>
		<div class="btn-group" role="group" aria-label="Platform">
			<button
				class="btn-filter"
				class:active={$filterState.platform === 'all'}
				onclick={() => setPlatform('all')}
			>
				Alle
			</button>
			<button
				class="btn-filter"
				class:active={$filterState.platform === 'youtube'}
				onclick={() => setPlatform('youtube')}
			>
				YouTube
			</button>
			<button
				class="btn-filter"
				class:active={$filterState.platform === 'instagram'}
				onclick={() => setPlatform('instagram')}
			>
				Instagram
			</button>
		</div>
	</div>

	{#if showVideoType}
		<div class="filter-group">
			<span class="filter-label">Video-Typ</span>
			<div class="btn-group" role="group" aria-label="Video Type">
				<button
					class="btn-filter"
					class:active={$filterState.video_type === 'all'}
					onclick={() => setVideoType('all')}
				>
					Alle
				</button>
				<button
					class="btn-filter"
					class:active={$filterState.video_type === 'long'}
					onclick={() => setVideoType('long')}
				>
					Longform
				</button>
				<button
					class="btn-filter"
					class:active={$filterState.video_type === 'short'}
					onclick={() => setVideoType('short')}
				>
					Shorts
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.filter-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		align-items: flex-end;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.filter-label {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
	}

	.btn-group {
		display: flex;
		gap: 2px;
	}

	.btn-filter {
		padding: 0.375rem 0.75rem;
		background: var(--bg);
		border: 1px solid var(--border);
		color: var(--text);
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-filter:first-child {
		border-radius: 6px 0 0 6px;
	}

	.btn-filter:last-child {
		border-radius: 0 6px 6px 0;
	}

	.btn-filter:not(:last-child) {
		border-right: none;
	}

	.btn-filter:hover {
		background: var(--hover);
	}

	.btn-filter.active {
		background: var(--primary);
		color: white;
		border-color: var(--primary);
	}
</style>
