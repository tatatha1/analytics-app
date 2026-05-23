import { json } from '@sveltejs/kit';
import { getAccounts, saveAccount, deleteAccount } from '$lib/server/db';
import type { RequestEvent } from './$types';

export async function GET() {
	try {
		const accounts = await getAccounts();
		return json({ accounts });
	} catch (err) {
		console.error('Failed to fetch accounts:', err);
		return json({ accounts: [], warning: 'Could not load accounts' });
	}
}

export async function POST({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const { id, platform, username, display_name, avatar_url } = body;

		if (!id || !platform || !username) {
			return json({ error: 'Missing required fields: id, platform, username' }, { status: 400 });
		}

		await saveAccount({ id, platform, username, display_name, avatar_url });
		return json({ success: true });
	} catch (err) {
		console.error('Failed to create account:', err);
		return json({ error: 'Failed to create account' }, { status: 500 });
	}
}

export async function DELETE({ request }: RequestEvent) {
	try {
		const body = await request.json();
		const { id } = body;

		if (!id) {
			return json({ error: 'Missing required field: id' }, { status: 400 });
		}

		await deleteAccount(id);
		return json({ success: true });
	} catch (err) {
		console.error('Failed to delete account:', err);
		return json({ error: 'Failed to delete account' }, { status: 500 });
	}
}
