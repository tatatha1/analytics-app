<script lang="ts">
	import { warnings } from '$lib/stores/filters.svelte';
</script>

{#if $warnings.length > 0}
	<div class="warning-container">
		{#each $warnings as warning}
			<div class="warning-banner" class:error={warning.severity === 'error'}>
				<span class="warning-icon">
					{warning.severity === 'error' ? '⚠️' : '⚡'}
				</span>
				<span class="warning-text">{warning.message}</span>
				<span class="warning-platform">{warning.platform}</span>
			</div>
		{/each}
	</div>
{/if}

<style>
	.warning-container {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
	}

	.warning-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 1rem;
		border-radius: 8px;
		background: #fef3cd;
		border: 1px solid #ffc107;
		color: #856404;
		font-size: 0.8125rem;
	}

	.warning-banner.error {
		background: #f8d7da;
		border-color: #dc3545;
		color: #721c24;
	}

	.warning-icon {
		flex-shrink: 0;
	}

	.warning-text {
		flex: 1;
	}

	.warning-platform {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
		background: rgba(0,0,0,0.1);
	}
</style>
