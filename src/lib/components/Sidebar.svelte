<script lang="ts">
	import { onMount } from 'svelte';
	import { filterState, addWarning, accountsStore, linkPairsStore } from '$lib/stores/filters.svelte';
	import type { Account } from '$lib/types';

	let {
		onAccountAdded = () => {},
		onAccountDeleted = () => {}
	}: { onAccountAdded?: () => void; onAccountDeleted?: () => void } = $props();

	let isOpen = $state(true);
	let showAddForm = $state(false);
	let showLinkForm = $state(false);
	let addPlatform = $state<'youtube' | 'instagram'>('youtube');
	let addQuery = $state('');
	let addLoading = $state(false);
	let addError = $state('');
	let deletingId = $state<string | null>(null);
	let linkYouTube = $state('');
	let linkInstagram = $state('');
	let linkLoading = $state(false);

	function getMergedEntries(): Array<{
		type: 'merged';
		yt: Account | null;
		ig: Account | null;
	} | { type: 'single'; account: Account }> {
		const accs = $accountsStore;
		const pairs = $linkPairsStore;
		const linkedIds = new Set(pairs.flat());
		const entries: Array<any> = [];

		for (const [ytId, igId] of pairs) {
			const yt = accs.find((a) => a.id === ytId) || null;
			const ig = accs.find((a) => a.id === igId) || null;
			if (yt || ig) entries.push({ type: 'merged', yt, ig });
		}

		for (const a of accs) {
			if (!linkedIds.has(a.id)) {
				entries.push({ type: 'single', account: a });
			}
		}

		return entries;
	}

	function selectMerged(entry: { yt: Account | null; ig: Account | null }) {
		const platform = $filterState.platform;
		if (platform === 'youtube' && entry.yt) {
			filterState.update((s) => ({ ...s, account_id: entry.yt!.id }));
		} else if (platform === 'instagram' && entry.ig) {
			filterState.update((s) => ({ ...s, account_id: entry.ig!.id }));
		} else {
			// Default to whichever exists
			const id = entry.yt?.id || entry.ig?.id;
			if (id) filterState.update((s) => ({ ...s, account_id: id }));
		}
	}

	function toggle() { isOpen = !isOpen; }

	function selectAccount(accountId: string | null) {
		filterState.update((s) => ({ ...s, account_id: accountId }));
	}

	function selectPlatform(platform: 'all' | 'youtube' | 'instagram') {
		filterState.update((s) => {
			const newPlat = platform;
			if (newPlat === 'all') return { ...s, platform: newPlat };
			const matching = $accountsStore.find((a) => a.platform === newPlat);
			if (matching) return { ...s, platform: newPlat, account_id: matching.id };
			return { ...s, platform: newPlat };
		});
	}

	async function addAccount() {
		const query = addQuery.trim();
		if (!query) return;
		addLoading = true;
		addError = '';
		let accountData: any = null;
		let linkedData: any[] = [];

		try {
			if (addPlatform === 'youtube') {
				const res = await fetch(`/api/youtube?handle=${encodeURIComponent(query)}&refresh=true`);
				const data = await res.json();
				if (data.channel) {
					accountData = { id: data.channel.id, username: data.channel.title, display_name: data.channel.title, avatar_url: data.channel.avatar_url };
					if (data.linkedInstagram) linkedData.push(data.linkedInstagram);
				} else {
					addError = data.message || 'YouTube channel not found';
				}
			} else {
				const res = await fetch(`/api/instagram?username=${encodeURIComponent(query)}&refresh=true`);
				const data = await res.json();
				if (data.profile) {
					accountData = { id: data.profile.id, username: data.profile.username, display_name: data.profile.full_name, avatar_url: data.profile.avatar_url };
					if (data.linkedYouTube) linkedData.push(data.linkedYouTube);
				} else {
					addError = data.message || 'Instagram profile not found';
				}
			}

			if (accountData) {
				await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(accountData) });
				for (const linked of linkedData) {
					await fetch('/api/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(linked) });
					// Also trigger link on server side
					await fetch('/api/accounts/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ yt: linkedData.length > 0 ? accountData.id : null, ig: linked.id }) });
				}
				showAddForm = false; addQuery = '';
				onAccountAdded();
				selectAccount(accountData.id);
			}
		} catch (err) {
			addError = err instanceof Error ? err.message : 'Failed to add account';
		} finally { addLoading = false; }
	}

	async function linkAccounts() {
		const ytId = linkYouTube.trim();
		const igId = linkInstagram.trim();
		if (!ytId || !igId) return;
		linkLoading = true;
		try {
			const res = await fetch('/api/accounts/links', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ yt: ytId, ig: igId })
			});
			if (res.ok) {
				showLinkForm = false;
				linkYouTube = '';
				linkInstagram = '';
				onAccountAdded();
			}
		} catch {
			addWarning({ platform: 'system', message: 'Linking failed', severity: 'error', timestamp: new Date().toISOString() });
		} finally { linkLoading = false; }
	}

	async function removeAccount(accountId: string, event: MouseEvent) {
		event.stopPropagation();
		deletingId = accountId;
		try {
			await fetch('/api/accounts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: accountId }) });
			if ($filterState.account_id === accountId) filterState.update((s) => ({ ...s, account_id: null }));
			onAccountDeleted();
		} catch {
			addWarning({ platform: 'system', message: 'Failed to delete account', severity: 'error', timestamp: new Date().toISOString() });
		} finally { deletingId = null; }
	}

	const entries = $derived(getMergedEntries());
</script>

<aside class="sidebar" class:collapsed={!isOpen}>
	<div class="sidebar-header">
		<button class="toggle-btn" onclick={toggle}>{isOpen ? '◀' : '▶'}</button>
		{#if isOpen}<h2 class="sidebar-title">Analytics</h2>{/if}
	</div>

	{#if isOpen}
		<nav class="sidebar-nav">
			<div class="nav-section">
				<h3 class="section-title">Platforms</h3>
				<button class="nav-item" class:active={$filterState.platform === 'all'} onclick={() => selectPlatform('all')}><span class="icon">📊</span><span>All Platforms</span></button>
				<button class="nav-item" class:active={$filterState.platform === 'youtube'} onclick={() => selectPlatform('youtube')}><span class="icon">▶</span><span>YouTube</span></button>
				<button class="nav-item" class:active={$filterState.platform === 'instagram'} onclick={() => selectPlatform('instagram')}><span class="icon">📸</span><span>Instagram</span></button>
			</div>

			<div class="nav-section">
				<h3 class="section-title">Accounts</h3>
				{#each entries as entry}
					{#if entry.type === 'merged'}
						<div class="merged-entry" class:active={$filterState.account_id === entry.yt?.id || $filterState.account_id === entry.ig?.id}>
							<button class="nav-item merged-btn" onclick={() => selectMerged(entry)}>
								<div class="merged-avatars">
									{#if entry.yt?.avatar_url}
										<img src={entry.yt.avatar_url} alt="" class="mini-avatar yt" />
									{/if}
									{#if entry.ig?.avatar_url}
										<img src={entry.ig.avatar_url} alt="" class="mini-avatar ig" />
									{/if}
								</div>
								<div class="account-info">
									<span class="account-name">{entry.yt?.display_name || entry.ig?.display_name || 'Unknown'}</span>
									<span class="merged-badges">
										<span class="badge yt">▶ YT</span>
										<span class="badge ig">📸 IG</span>
									</span>
								</div>
							</button>
							<div class="merged-actions">
								<button class="delete-btn" title="Remove linked pair" onclick={(e) => { e.stopPropagation(); removeAccount(entry.yt?.id || '', e); if (entry.ig) removeAccount(entry.ig.id, e); }}>✕</button>
							</div>
						</div>
					{:else}
						<div class="single-entry" class:active={$filterState.account_id === entry.account.id}>
							<button class="nav-item" onclick={() => selectAccount(entry.account.id)}>
								{#if entry.account.avatar_url}
									<img src={entry.account.avatar_url} alt={entry.account.username} class="avatar" />
								{:else}
									<span class="avatar-placeholder">{entry.account.username.charAt(0).toUpperCase()}</span>
								{/if}
								<div class="account-info">
									<span class="account-name">{entry.account.display_name}</span>
									<span class="account-platform">{entry.account.platform}</span>
								</div>
							</button>
							<button class="delete-btn" title="Remove" onclick={(e) => removeAccount(entry.account.id, e)} disabled={deletingId === entry.account.id}>
								{deletingId === entry.account.id ? '...' : '✕'}
							</button>
						</div>
					{/if}
				{/each}

				{#if $accountsStore.length === 0 && !showAddForm && !showLinkForm}
					<p class="empty-state">No accounts added yet.</p>
				{/if}

				{#if showAddForm}
					<div class="add-form">
						<div class="add-form-tabs">
							<button class="tab" class:active={addPlatform === 'youtube'} onclick={() => addPlatform = 'youtube'}>YouTube</button>
							<button class="tab" class:active={addPlatform === 'instagram'} onclick={() => addPlatform = 'instagram'}>Instagram</button>
						</div>
						<input type="text" class="add-input" placeholder={addPlatform === 'youtube' ? 'Channel name or ID...' : 'Username...'} bind:value={addQuery} onkeydown={(e) => e.key === 'Enter' && addAccount()} />
						{#if addError}<p class="add-error">{addError}</p>{/if}
						<div class="add-form-actions">
							<button class="btn-cancel" onclick={() => { showAddForm = false; addError = ''; }}>Cancel</button>
							<button class="btn-add" onclick={addAccount} disabled={addLoading || !addQuery.trim()}>{addLoading ? 'Adding...' : 'Add'}</button>
						</div>
					</div>
				{/if}

				{#if showLinkForm}
					<div class="add-form">
						<p class="form-title">Link YouTube & Instagram</p>
						<select class="add-input" bind:value={linkYouTube}>
							<option value="">Select YouTube channel...</option>
							{#each $accountsStore.filter((a) => a.platform === 'youtube') as a}
								<option value={a.id}>{a.display_name}</option>
							{/each}
						</select>
						<select class="add-input" bind:value={linkInstagram}>
							<option value="">Select Instagram account...</option>
							{#each $accountsStore.filter((a) => a.platform === 'instagram') as a}
								<option value={a.id}>{a.display_name}</option>
							{/each}
						</select>
						<div class="add-form-actions">
							<button class="btn-cancel" onclick={() => { showLinkForm = false; }}>Cancel</button>
							<button class="btn-add" onclick={linkAccounts} disabled={linkLoading || !linkYouTube || !linkInstagram}>{linkLoading ? 'Linking...' : 'Link'}</button>
						</div>
					</div>
				{/if}
			</div>

			<div class="nav-section">
				<button class="nav-item add-account-btn" onclick={() => { showAddForm = !showAddForm; showLinkForm = false; addError = ''; }}><span class="icon">＋</span><span>Add Account</span></button>
				<button class="nav-item add-account-btn" onclick={() => { showLinkForm = !showLinkForm; showAddForm = false; }}><span class="icon">🔗</span><span>Link Accounts</span></button>
			</div>

			<div class="nav-section">
				<a href="/" class="nav-item"><span class="icon">🏠</span><span>Dashboard</span></a>
			</div>
		</nav>
	{/if}
</aside>

<style>
	.sidebar { width: 260px; height: 100vh; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; transition: width 0.2s ease; overflow: hidden; flex-shrink: 0; }
	.sidebar.collapsed { width: 48px; }
	.sidebar-header { display: flex; align-items: center; padding: 1rem; gap: 0.75rem; border-bottom: 1px solid var(--border); }
	.toggle-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 0.875rem; padding: 0.25rem; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
	.toggle-btn:hover { background: var(--hover); }
	.sidebar-title { font-size: 1.125rem; font-weight: 700; color: var(--text); margin: 0; white-space: nowrap; }
	.sidebar-nav { flex: 1; overflow-y: auto; padding: 0.5rem; }
	.nav-section { margin-bottom: 1rem; }
	.section-title { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); padding: 0.5rem 0.75rem; margin: 0; }

	.merged-entry, .single-entry { display: flex; align-items: center; gap: 2px; }
	.merged-entry.active .merged-btn, .single-entry.active .nav-item { background: var(--primary); color: white; }
	.merged-entry.active .account-platform, .merged-entry.active .badge { color: rgba(255,255,255,0.8); }

	.nav-item { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.625rem 0.75rem; border: none; background: none; color: var(--text); cursor: pointer; border-radius: 6px; font-size: 0.875rem; text-align: left; text-decoration: none; transition: background 0.15s; }
	.nav-item:hover { background: var(--hover); }

	.merged-btn { flex: 1; min-width: 0; padding: 0.5rem 0.75rem; }
	.merged-avatars { display: flex; flex-shrink: 0; position: relative; width: 36px; height: 28px; }
	.mini-avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; border: 2px solid var(--surface); position: absolute; }
	.mini-avatar.yt { left: 0; z-index: 2; }
	.mini-avatar.ig { left: 12px; z-index: 1; }

	.icon { font-size: 1rem; width: 20px; text-align: center; }
	.avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
	.avatar-placeholder { width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; flex-shrink: 0; }

	.account-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
	.account-name { font-size: 0.8125rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.account-platform { font-size: 0.6875rem; color: var(--text-secondary); text-transform: uppercase; }
	.merged-badges { display: flex; gap: 3px; margin-top: 1px; }
	.badge { font-size: 0.625rem; padding: 1px 4px; border-radius: 3px; font-weight: 600; }
	.badge.yt { background: #dc2626; color: white; }
	.badge.ig { background: #e879f9; color: white; }

	.merged-actions { display: flex; }
	.delete-btn { width: 24px; height: 24px; border: none; background: none; color: var(--text-secondary); cursor: pointer; border-radius: 4px; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; opacity: 0; transition: opacity 0.15s, background 0.15s; }
	.merged-entry:hover .delete-btn, .single-entry:hover .delete-btn { opacity: 1; }
	.delete-btn:hover { background: var(--hover); color: var(--danger); }
	.delete-btn:disabled { opacity: 0.5; }

	.empty-state { font-size: 0.8125rem; color: var(--text-secondary); padding: 0.5rem 0.75rem; margin: 0; }
	.add-account-btn { color: var(--primary); font-weight: 500; }

	.add-form { padding: 0.5rem 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
	.form-title { font-size: 0.75rem; font-weight: 600; color: var(--text); margin: 0; }
	.add-form-tabs { display: flex; gap: 2px; }
	.tab { flex: 1; padding: 0.25rem 0.5rem; font-size: 0.75rem; border: 1px solid var(--border); background: var(--bg); color: var(--text-secondary); cursor: pointer; }
	.tab:first-child { border-radius: 4px 0 0 4px; }
	.tab:last-child { border-radius: 0 4px 4px 0; }
	.tab.active { background: var(--primary); color: white; border-color: var(--primary); }
	.add-input { padding: 0.5rem; font-size: 0.8125rem; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); width: 100%; box-sizing: border-box; }
	.add-error { font-size: 0.75rem; color: var(--danger); margin: 0; }
	.add-form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
	.btn-cancel, .btn-add { padding: 0.375rem 0.75rem; font-size: 0.75rem; border-radius: 4px; border: none; cursor: pointer; }
	.btn-cancel { background: var(--bg); color: var(--text-secondary); border: 1px solid var(--border); }
	.btn-add { background: var(--primary); color: white; }
	.btn-add:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
