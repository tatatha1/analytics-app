import pg from 'pg';
import { env } from '$env/dynamic/private';
import net from 'net';

const DATABASE_URL = env.DATABASE_URL || '';

let pool: pg.Pool | null = null;
let dbAvailable = false;
let memoryAccounts: Map<string, any> = new Map();
let memoryMetrics: any[] = [];
let memoryPosts: Map<string, any> = new Map();
let initAttempted = false;

async function checkTcpConnection(url: string): Promise<boolean> {
	try {
		const u = new URL(url);
		const port = parseInt(u.port) || 5432;
		return new Promise((resolve) => {
			const socket = new net.Socket();
			socket.setTimeout(1500);
			socket.on('connect', () => {
				socket.destroy();
				resolve(true);
			});
			socket.on('error', () => {
				socket.destroy();
				resolve(false);
			});
			socket.on('timeout', () => {
				socket.destroy();
				resolve(false);
			});
			socket.connect(port, u.hostname);
		});
	} catch {
		return false;
	}
}

export async function isAvailable(): Promise<boolean> {
	if (!initAttempted) {
		initAttempted = true;
		dbAvailable = await checkTcpConnection(DATABASE_URL);
		if (dbAvailable) {
			try {
				pool = new pg.Pool({
					connectionString: DATABASE_URL,
					max: 5,
					idleTimeoutMillis: 10000,
					connectionTimeoutMillis: 3000
				});
				pool.on('error', () => {});
			} catch {
				pool = null;
				dbAvailable = false;
			}
		}
	}
	return dbAvailable;
}

export async function query<T extends pg.QueryResultRow = any>(
	text: string,
	params?: any[]
): Promise<pg.QueryResult<T>> {
	const available = await isAvailable();
	if (!available || !pool) {
		throw new Error('Database not available');
	}
	const client = await pool.connect();
	try {
		return await client.query<T>(text, params);
	} finally {
		client.release();
	}
}

export async function initializeDatabase(): Promise<boolean> {
	const available = await isAvailable();
	if (!available) return false;

	try {
		const client = await pool!.connect();
		await client.query(`
			CREATE TABLE IF NOT EXISTS accounts (
				id VARCHAR(255) PRIMARY KEY,
				platform VARCHAR(20) NOT NULL CHECK (platform IN ('youtube', 'instagram')),
				username VARCHAR(255) NOT NULL,
				display_name VARCHAR(255),
				avatar_url TEXT,
				last_synced TIMESTAMP,
				created_at TIMESTAMP DEFAULT NOW(),
				UNIQUE(platform, username)
			);
			CREATE TABLE IF NOT EXISTS account_metrics (
				id SERIAL PRIMARY KEY,
				account_id VARCHAR(255) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
				platform VARCHAR(20) NOT NULL,
				followers INTEGER NOT NULL DEFAULT 0,
				views_total BIGINT NOT NULL DEFAULT 0,
				posts_count INTEGER NOT NULL DEFAULT 0,
				engagement_rate_avg REAL DEFAULT 0,
				views_to_subscriber_ratio REAL DEFAULT 0,
				upload_frequency_days REAL DEFAULT 0,
				recorded_at TIMESTAMP DEFAULT NOW()
			);
			CREATE TABLE IF NOT EXISTS posts (
				id VARCHAR(255) PRIMARY KEY,
				account_id VARCHAR(255) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
				platform VARCHAR(20) NOT NULL,
				title TEXT,
				description TEXT,
				published_at TIMESTAMP NOT NULL,
				view_count INTEGER DEFAULT 0,
				like_count INTEGER DEFAULT 0,
				comment_count INTEGER DEFAULT 0,
				thumbnail_url TEXT,
				media_type VARCHAR(20) DEFAULT 'video',
				created_at TIMESTAMP DEFAULT NOW()
			);
		`);
		client.release();
		return true;
	} catch {
		dbAvailable = false;
		return false;
	}
}

// --- In-memory fallback functions ---

export async function getAccounts(): Promise<any[]> {
	const available = await isAvailable();
	if (available) {
		const result = await query(
			'SELECT id, platform, username, display_name, avatar_url, last_synced FROM accounts ORDER BY platform, username'
		);
		return result.rows.map((r) => ({
			id: r.id,
			platform: r.platform,
			username: r.username,
			display_name: r.display_name || r.username,
			avatar_url: r.avatar_url || '',
			last_synced: r.last_synced ? r.last_synced.toISOString() : null
		}));
	}

	return Array.from(memoryAccounts.values()).map((a) => ({
		...a,
		last_synced: a.last_synced ? new Date(a.last_synced).toISOString() : null
	}));
}

export async function saveAccount(account: {
	id: string;
	platform: string;
	username: string;
	display_name?: string;
	avatar_url?: string;
}): Promise<void> {
	const available = await isAvailable();
	if (available) {
		await query(
			`INSERT INTO accounts (id, platform, username, display_name, avatar_url, last_synced)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         display_name = COALESCE($4, accounts.display_name),
         avatar_url = COALESCE($5, accounts.avatar_url),
         last_synced = NOW()`,
			[account.id, account.platform, account.username, account.display_name || null, account.avatar_url || null]
		);
		return;
	}

	memoryAccounts.set(account.id, {
		id: account.id,
		platform: account.platform,
		username: account.username,
		display_name: account.display_name || account.username,
		avatar_url: account.avatar_url || '',
		last_synced: new Date().toISOString()
	});
}

export async function savePost(post: {
	id: string;
	account_id: string;
	platform: string;
	title?: string;
	description?: string;
	published_at: string;
	view_count: number;
	like_count: number;
	comment_count: number;
	thumbnail_url?: string;
	media_type?: string;
}): Promise<void> {
	const available = await isAvailable();
	if (available) {
		await query(
			`INSERT INTO posts (id, account_id, platform, title, description, published_at, view_count, like_count, comment_count, thumbnail_url, media_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         view_count = $7, like_count = $8, comment_count = $9`,
			[post.id, post.account_id, post.platform, post.title || null, post.description || null,
			 post.published_at, post.view_count, post.like_count, post.comment_count,
			 post.thumbnail_url || null, post.media_type || 'video']
		);
		return;
	}

	memoryPosts.set(post.id, { ...post, created_at: new Date().toISOString() });
}

export async function saveMetric(metric: {
	account_id: string;
	platform: string;
	followers: number;
	views_total: number;
	posts_count: number;
	engagement_rate_avg: number;
	views_to_subscriber_ratio: number;
	upload_frequency_days: number;
}): Promise<void> {
	const available = await isAvailable();
	if (available) {
		await query(
			`INSERT INTO account_metrics (account_id, platform, followers, views_total, posts_count, engagement_rate_avg, views_to_subscriber_ratio, upload_frequency_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			[metric.account_id, metric.platform, metric.followers, metric.views_total,
			 metric.posts_count, metric.engagement_rate_avg, metric.views_to_subscriber_ratio,
			 metric.upload_frequency_days]
		);
		return;
	}

	memoryMetrics.push({ ...metric, recorded_at: new Date().toISOString() });
}

export async function getMetricHistory(accountId: string, days: number): Promise<any[]> {
	const available = await isAvailable();
	if (available) {
		const result = await query(
			`SELECT recorded_at, followers, views_total, engagement_rate_avg, upload_frequency_days
       FROM account_metrics
       WHERE account_id = $1 AND recorded_at >= NOW() - ($2 || ' days')::INTERVAL
       ORDER BY recorded_at ASC`,
			[accountId, String(days)]
		);
		return result.rows;
	}

	const cutoff = Date.now() - days * 86400000;
	return memoryMetrics
		.filter((m) => m.account_id === accountId && new Date(m.recorded_at).getTime() > cutoff)
		.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
}

export async function deleteAccount(accountId: string): Promise<void> {
	const available = await isAvailable();
	if (available) {
		await query('DELETE FROM posts WHERE account_id = $1', [accountId]);
		await query('DELETE FROM account_metrics WHERE account_id = $1', [accountId]);
		await query('DELETE FROM accounts WHERE id = $1', [accountId]);
		return;
	}

	memoryAccounts.delete(accountId);
	memoryPosts.forEach((_, key) => { if (key.startsWith(accountId)) memoryPosts.delete(key); });
	memoryMetrics = memoryMetrics.filter((m) => m.account_id !== accountId);
}

export async function getLatestMetric(accountId: string): Promise<any | null> {
	const available = await isAvailable();
	if (available) {
		const result = await query(
			`SELECT followers, views_total, posts_count, engagement_rate_avg, views_to_subscriber_ratio, upload_frequency_days
       FROM account_metrics
       WHERE account_id = $1
       ORDER BY recorded_at DESC LIMIT 1`,
			[accountId]
		);
		return result.rows[0] || null;
	}

	const metrics = memoryMetrics
		.filter((m) => m.account_id === accountId)
		.sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
	return metrics[0] || null;
}
