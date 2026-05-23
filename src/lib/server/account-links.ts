import type { Account } from '$lib/types';

// Two-way account linking: YouTube ID ↔ Instagram ID
const linkStore = new Map<string, string>();

export function getLinkedAccountId(accountId: string): string | undefined {
	return linkStore.get(accountId);
}

export function linkAccounts(ytId: string, igId: string): void {
	linkStore.set(ytId, igId);
	linkStore.set(igId, ytId);
}

export function unlinkAccount(accountId: string): void {
	const linked = linkStore.get(accountId);
	if (linked) {
		linkStore.delete(linked);
	}
	linkStore.delete(accountId);
}

export function findAccountByPlatform(accounts: Account[], platform: string, currentId: string): Account | undefined {
	if (!currentId) return undefined;
	const linkedId = getLinkedAccountId(currentId);
	if (!linkedId) return undefined;
	return accounts.find((a) => a.id === linkedId && a.platform === platform);
}

export function getAllLinks(): Array<[string, string]> {
	const pairs: Array<[string, string]> = [];
	const seen = new Set<string>();
	for (const [a, b] of linkStore) {
		const key = a < b ? `${a}:${b}` : `${b}:${a}`;
		if (seen.has(key)) continue;
		seen.add(key);
		// Only add each pair once (the store is two-way, so each link appears twice)
		if (linkStore.get(b) === a) {
			pairs.push([a, b]);
		}
	}
	return pairs;
}
