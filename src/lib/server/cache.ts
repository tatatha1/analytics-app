import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

const REDIS_URL = env.REDIS_URL || '';

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

let redis: Redis | null = null;
let memoryCache = new Map<string, { data: unknown; expires: number }>();

function getRedis(): Redis {
	if (!redis) {
		redis = new Redis(REDIS_URL, {
			maxRetriesPerRequest: 3,
			retryStrategy: (times) => {
				if (times > 3) return null;
				return Math.min(times * 200, 2000);
			},
			lazyConnect: true
		});

		redis.on('error', (err) => {
			console.warn('Redis connection error, falling back to memory cache:', err.message);
			redis = null;
		});
	}
	return redis;
}

export async function getCached<T>(key: string): Promise<T | null> {
	try {
		const r = getRedis();
		if (r && r.status === 'ready') {
			const raw = await r.get(key);
			if (raw) return JSON.parse(raw) as T;
		}
	} catch {
		// Redis unavailable, fall through to memory cache
	}

	const memEntry = memoryCache.get(key);
	if (memEntry && memEntry.expires > Date.now()) {
		return memEntry.data as T;
	}
	if (memEntry) memoryCache.delete(key);

	return null;
}

export async function setCache<T>(
	key: string,
	data: T,
	ttlMs: number = DEFAULT_TTL_MS
): Promise<void> {
	try {
		const r = getRedis();
		if (r && r.status === 'ready') {
			await r.setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(data));
			return;
		}
	} catch {
		// Redis unavailable, fall through to memory cache
	}

	memoryCache.set(key, { data, expires: Date.now() + ttlMs });

	// Evict old entries if memory cache grows too large
	if (memoryCache.size > 500) {
		const now = Date.now();
		for (const [k, v] of memoryCache) {
			if (v.expires < now) memoryCache.delete(k);
		}
	}
}

export function buildCacheKey(platform: string, type: string, id: string): string {
	return `analytics:${platform}:${type}:${id}`;
}

export function disconnectCache(): void {
	if (redis) {
		redis.disconnect();
		redis = null;
	}
}
