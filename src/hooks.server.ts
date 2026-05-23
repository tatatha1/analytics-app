import type { Handle } from '@sveltejs/kit';

const PASSWORD = 'analytics';

export const handle: Handle = async ({ event, resolve }) => {
	const auth = event.request.headers.get('authorization');

	if (!auth || !auth.startsWith('Basic ')) {
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'WWW-Authenticate': 'Basic realm="Analytics App", charset="UTF-8"'
			}
		});
	}

	try {
		const credentials = atob(auth.slice(6));
		const [, password] = credentials.split(':');

		if (password !== PASSWORD) {
			return new Response('Forbidden', { status: 403 });
		}
	} catch {
		return new Response('Bad Request', { status: 400 });
	}

	return resolve(event);
};
