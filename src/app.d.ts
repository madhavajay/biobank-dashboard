// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Tenant } from '$lib/tenants';

declare global {
	interface Window {
		rybbit?: {
			event?: (eventName: string, properties?: Record<string, unknown>) => void;
		};
	}

	namespace App {
		// interface Error {}
		interface Locals {
			tenant: Tenant;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env: {
				DB: D1Database;
			};
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
			cf: IncomingRequestCfProperties;
		}
	}
}

declare module '*.geojson' {
	const value: {
		type: string;
		features: Array<{
			id?: string;
			geometry: {
				type: string;
				coordinates: unknown;
			};
			properties?: Record<string, unknown>;
		}>;
	};
	export default value;
}

export {};
