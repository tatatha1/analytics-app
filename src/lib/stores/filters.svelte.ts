import { writable } from 'svelte/store';
import type { FilterState, APIWarning, Account } from '$lib/types';

export const accountsStore = writable<Account[]>([]);
export const linkPairsStore = writable<Array<[string, string]>>([]);

export const filterState = writable<FilterState>({
	platform: 'all',
	period: '30d',
	account_id: null,
	video_type: 'all',
	sort_by: 'followers',
	sort_order: 'desc'
});

export const warnings = writable<APIWarning[]>([]);

export function addWarning(warning: APIWarning) {
	warnings.update((w) => {
		const exists = w.some((x) => x.platform === warning.platform && x.message === warning.message);
		if (exists) return w;
		return [...w, warning];
	});
}

export function clearWarnings() {
	warnings.set([]);
}

export function clearWarning(platform: string) {
	warnings.update((w) => w.filter((x) => x.platform !== platform));
}
