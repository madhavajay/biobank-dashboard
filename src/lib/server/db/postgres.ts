import { Client, types } from 'pg';

types.setTypeParser(20, (value) => Number(value));

export interface QueryResult<T = unknown> {
	results: T[];
	success: boolean;
	meta: Record<string, unknown>;
}

export interface PreparedQuery {
	bind(...values: unknown[]): PreparedQuery;
	all<T = unknown>(): Promise<QueryResult<T>>;
	first<T = unknown>(): Promise<T | null>;
}

export interface PostgresDatabase {
	prepare(query: string): PreparedQuery;
	close?(): Promise<void>;
}

function toPostgresSql(sql: string): string {
	let index = 0;
	return sql.replace(/\?/g, () => `$${++index}`);
}

class PostgresPreparedStatement implements PreparedQuery {
	private values: unknown[] = [];

	constructor(
		private readonly db: PostgresConnection,
		private readonly query: string
	) {}

	bind(...values: unknown[]) {
		this.values = values;
		return this;
	}

	async all<T = unknown>(): Promise<QueryResult<T>> {
		const result = await this.db.query<T>(this.query, this.values);
		return { results: result, success: true, meta: {} };
	}

	async first<T = unknown>(): Promise<T | null> {
		const result = await this.db.query<T>(this.query, this.values);
		return result[0] ?? null;
	}
}

export class PostgresConnection implements PostgresDatabase {
	private client: Client | null = null;
	private connecting: Promise<Client> | null = null;

	constructor(private readonly connectionString: string) {}

	prepare(query: string) {
		return new PostgresPreparedStatement(this, query);
	}

	async query<T = unknown>(query: string, values: unknown[]) {
		const client = await this.connect();
		const result = await client.query(toPostgresSql(query), values);
		return result.rows as T[];
	}

	async close() {
		const client = this.client;
		this.client = null;
		this.connecting = null;
		if (client) await client.end();
	}

	private async connect() {
		if (this.client) return this.client;
		if (!this.connecting) {
			const client = new Client({ connectionString: this.connectionString });
			this.connecting = client.connect().then(() => {
				this.client = client;
				return client;
			});
		}
		return this.connecting;
	}
}

export function createPostgresDb(connectionString: string | undefined | null): PostgresDatabase | undefined {
	if (!connectionString) return undefined;
	return new PostgresConnection(connectionString);
}
