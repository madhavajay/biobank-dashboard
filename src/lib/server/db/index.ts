import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

type Platform = App.Platform | undefined;

const getBinding = (platform: Platform) => {
	const db = platform?.env?.DB;

	if (!db) {
		throw new Error(
			'Cloudflare D1 binding "DB" is not available. Run the app with Wrangler or provide the D1 binding in the Worker environment.'
		);
	}

	return db;
};

export const getDb = (platform: Platform) => drizzle(getBinding(platform), { schema });

export type Database = ReturnType<typeof getDb>;
