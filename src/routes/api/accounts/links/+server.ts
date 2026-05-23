import { json } from '@sveltejs/kit';
import { getAllLinks, linkAccounts } from '$lib/server/account-links';
import type { RequestEvent } from './$types';

export async function GET() {
	try {
		const links = getAllLinks();
		return json({ links: links.map(([a, b]) => ({ yt: a, ig: b })) });
	} catch {
		return json({ links: [] });
	}
}

export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const { yt, ig } = body;
		if (!yt || !ig) {
			return json({ error: 'Need yt and ig ids' }, { status: 400 });
		}
		linkAccounts(yt, ig);
		return json({ success: true });
	} catch {
		return json({ error: 'Linking failed' }, { status: 500 });
	}
}
