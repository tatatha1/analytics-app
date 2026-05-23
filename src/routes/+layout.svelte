<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import WarningBanner from '$lib/components/WarningBanner.svelte';
	import { addWarning } from '$lib/stores/filters.svelte';
	import { accountsStore, linkPairsStore } from '$lib/stores/filters.svelte';

	onMount(() => {
		loadAccounts();
	});

	async function loadAccounts() {
		try {
			const [accRes, linkRes] = await Promise.all([
				fetch('/api/accounts'),
				fetch('/api/accounts/links')
			]);
			const accData = await accRes.json();
			const linkData = await linkRes.json();
			if (accData.accounts) accountsStore.set(accData.accounts);
			if (linkData.links) linkPairsStore.set(linkData.links.map((l: any) => [l.yt, l.ig]));
		} catch {
			addWarning({ platform: 'system', message: 'Could not load accounts', severity: 'warning', timestamp: new Date().toISOString() });
		}
	}

	let { children } = $props();
</script>

<div class="app-layout">
	<Sidebar onAccountAdded={loadAccounts} onAccountDeleted={loadAccounts} />
	<main class="main-content">
		<WarningBanner />
		{@render children()}
	</main>
</div>

<style>
	.app-layout {
		display: flex;
		min-height: 100vh;
	}

	.main-content {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
</style>
