// Multi-tenant config. One app/API; a tenant is resolved by hostname (or ?tenant=
// override in dev). `scope` null = global (all biobanks); otherwise filtered to one
// biobank slug. Theme tokens are injected as CSS vars by the root layout.

export interface TenantTheme {
	primary: string;
	primaryFg: string;
	accent: string;
	ring: string;
	brandFrom: string;
	brandTo: string;
	mapLand: string;
	mapPin: string;
}

export type MapRegionMode = 'bubbles' | 'zones';

export interface MapProfile {
	/** ISO 3166-1 alpha-2 codes highlighted on the portal home map */
	countryCodes?: string[];
	/** Mapbox maxBounds as [[west, south], [east, north]] in lng/lat */
	maxBounds?: [[number, number], [number, number]];
	minZoom?: number;
	defaultZoom?: number;
	/** Point bubbles (default) or polygon highlight zones for sub-country regions */
	regionMode?: MapRegionMode;
	/** GeoJSON feature property used as the region code on zone layers */
	zoneCodeProperty?: string;
}

export interface Tenant {
	slug: string;
	hosts: string[];
	name: string;
	product: string;
	tagline: string;
	logoEmoji: string;
	logoImg?: string; // static logo URL (overrides emoji in the header)
	langs?: ('en' | 'pt')[]; // language switcher (first = default)
	scope: string | null; // biobank slug, or null for global
	map: { center: [number, number]; zoom: number };
	mapProfile?: MapProfile;
	theme: TenantTheme;
}

export const TENANTS: Tenant[] = [
	{
		slug: 'biovault',
		hosts: ['localhost', '127.0.0.1', 'data.biovault.net', 'biovault.net', 'www.biovault.net'],
		name: 'BioVault',
		product: 'BioVault Data',
		tagline: 'A global window into population allele frequencies.',
		logoEmoji: '🧬',
		logoImg: '/tenants/biovault/logo.png',
		scope: null,
		map: { center: [0, 0], zoom: 1 },
		theme: {
			primary: 'oklch(0.696 0.17 162.48)',
			primaryFg: 'oklch(0.99 0 0)',
			accent: 'oklch(0.48 0.14 175)',
			ring: 'oklch(0.696 0.17 162.48)',
			brandFrom: 'oklch(0.696 0.17 162.48)',
			brandTo: 'oklch(0.48 0.14 175)',
			mapLand: 'oklch(0.955 0.018 158)',
			mapPin: 'oklch(0.60 0.14 175)'
		}
	},
	{
		slug: 'carigenetics',
		hosts: ['carigenetics.biovault.net', 'carigenetics.localhost', 'data.carigenetics.com', 'caribbean.localhost'],
		name: 'CariGenetics',
		product: 'CariGenetics Genome Portal',
		tagline: 'Caribbean genomic diversity, made discoverable.',
		logoEmoji: '🌴',
		logoImg: '/tenants/carigenetics/logo.png',
		scope: 'carigenetics',
		map: { center: [17.9, -68.5], zoom: 4.8 },
		mapProfile: {
			countryCodes: ['BS', 'BB', 'BM', 'VG', 'LC', 'TT'],
			maxBounds: [
				[-85.5, 10],
				[-58.5, 27.5]
			],
			minZoom: 1.1,
			defaultZoom: 4.5
		},
		theme: {
			primary: 'oklch(0.68 0.13 215)',
			primaryFg: 'oklch(0.99 0 0)',
			accent: 'oklch(0.78 0.15 55)',
			ring: 'oklch(0.68 0.13 215)',
			brandFrom: 'oklch(0.72 0.13 210)',
			brandTo: 'oklch(0.66 0.15 250)',
			mapLand: 'oklch(0.94 0 0)',
			mapPin: 'oklch(0.62 0.16 215)'
		}
	},
	{
		slug: 'bipmed',
		hosts: ['bipmed.biovault.net', 'bipmed.localhost', 'brazil.localhost', 'bipmed.org'],
		name: 'BIPMed',
		product: 'BIPMed-Brazil Variant Browser',
		tagline: 'Brazilian Initiative on Precision Medicine.',
		logoEmoji: '🧬',
		logoImg: '/tenants/bipmed/logo.png',
		langs: ['en', 'pt'],
		scope: 'bipmed',
		map: { center: [-14.235, -51.925], zoom: 3.8 },
		mapProfile: {
			countryCodes: ['BR'],
			maxBounds: [
				[-74, -34],
				[-32, 5]
			],
			minZoom: 1.1,
			defaultZoom: 3.8,
			regionMode: 'zones',
			zoneCodeProperty: 'sigla'
		},
		theme: {
			primary: 'oklch(0.34 0.06 235)',
			primaryFg: 'oklch(0.99 0 0)',
			accent: 'oklch(0.58 0.09 205)',
			ring: 'oklch(0.45 0.08 220)',
			brandFrom: 'oklch(0.55 0.09 205)',
			brandTo: 'oklch(0.30 0.06 238)',
			mapLand: 'oklch(0.95 0.006 220)',
			mapPin: 'oklch(0.48 0.09 210)'
		}
	},
	{
		slug: 'pgp-harvard',
		hosts: ['pgp-harvard.biovault.net', 'pgp.localhost', 'pgpharvard.localhost'],
		name: 'PGP Harvard',
		product: 'Harvard Personal Genome Project',
		tagline: 'Open-consent personal genomes from the United States.',
		logoEmoji: '🧬',
		logoImg: '/tenants/pgp-harvard/logo.png',
		scope: 'pgp-harvard',
		map: { center: [39.83, -98.58], zoom: 3.5 },
		mapProfile: {
			countryCodes: ['US'],
			maxBounds: [
				[-130, 22],
				[-63, 50]
			],
			minZoom: 1.1,
			defaultZoom: 3.5
		},
		theme: {
			primary: 'oklch(0.45 0.17 18)',
			primaryFg: 'oklch(0.99 0 0)',
			accent: 'oklch(0.6 0.11 35)',
			ring: 'oklch(0.45 0.17 18)',
			brandFrom: 'oklch(0.5 0.18 18)',
			brandTo: 'oklch(0.34 0.13 16)',
			mapLand: 'oklch(0.94 0.02 20)',
			mapPin: 'oklch(0.47 0.18 18)'
		}
	},
	{
		slug: '1kgp',
		hosts: ['1kgp.biovault.net', '1kgp.localhost', '1000-genomes.localhost'],
		name: '1000 Genomes Project',
		product: '1000 Genomes Project Frequencies',
		tagline: 'Super-population allele frequencies across BioVault tracked loci.',
		logoEmoji: '🧬',
		logoImg: '/1000-genomes-logo.jpg',
		scope: '1kgp',
		map: { center: [0, 0], zoom: 1 },
		theme: {
			primary: 'oklch(0.50 0.15 255)',
			primaryFg: 'oklch(0.99 0 0)',
			accent: 'oklch(0.68 0.14 145)',
			ring: 'oklch(0.50 0.15 255)',
			brandFrom: 'oklch(0.54 0.16 255)',
			brandTo: 'oklch(0.62 0.14 145)',
			mapLand: 'oklch(0.94 0.012 240)',
			mapPin: 'oklch(0.52 0.16 255)'
		}
	}
];

const BY_SLUG = new Map(TENANTS.map((t) => [t.slug, t]));
export const DEFAULT_TENANT = TENANTS[0];

export function resolveTenant(host: string | null, override?: string | null): Tenant {
	if (override && BY_SLUG.has(override)) return BY_SLUG.get(override)!;
	if (!host) return DEFAULT_TENANT;
	const h = host.split(':')[0].toLowerCase();
	for (const t of TENANTS) if (t.hosts.includes(h)) return t;
	// subdomain fallback: <slug>.anything
	const sub = h.split('.')[0];
	if (BY_SLUG.has(sub)) return BY_SLUG.get(sub)!;
	return DEFAULT_TENANT;
}

export function themeVars(t: Tenant): string {
	const th = t.theme;
	return [
		`--primary:${th.primary}`,
		`--primary-foreground:${th.primaryFg}`,
		`--accent:${th.accent}`,
		`--ring:${th.ring}`,
		`--brand-from:${th.brandFrom}`,
		`--brand-to:${th.brandTo}`,
		`--map-land:${th.mapLand}`,
		`--map-pin:${th.mapPin}`,
		`--variant-common:color-mix(in oklch, ${th.brandFrom} 36%, white)`,
		`--variant-low-freq:color-mix(in oklch, ${th.primary} 72%, ${th.brandFrom})`,
		`--variant-rare:color-mix(in oklch, ${th.brandTo} 58%, ${th.accent})`
	].join(';');
}

export const VARIANT_CLASS_COLORS = {
	common: 'var(--variant-common)',
	lowFreq: 'var(--variant-low-freq)',
	rare: 'var(--variant-rare)'
} as const;

/** Mapbox uses [lng, lat]; tenant.map.center is stored as [lat, lng]. */
export function mapboxCenter(tenant: Tenant): [number, number] {
	const [lat, lon] = tenant.map.center;
	return [lon, lat];
}

export function mapboxZoom(tenant: Tenant): number {
	const portalZoom = tenant.scope ? portalMapFit(tenant.scope).maxZoom : null;
	return portalZoom ?? tenant.mapProfile?.defaultZoom ?? tenant.map.zoom;
}

/** Scoped portals omit maxBounds so the home map can zoom out to regional/world context. */
export function mapboxBounds(tenant: Tenant): [[number, number], [number, number]] | null {
	if (tenant.scope) return null;
	return (
		tenant.mapProfile?.maxBounds ?? [
			[-180, -58],
			[180, 78]
		]
	);
}

export interface PortalMapFit {
	maxZoom: number;
	marginRatio: number;
	singleCountryZoom: number;
}

export function portalMapFit(scope: string): PortalMapFit {
	switch (scope) {
		case 'carigenetics':
			return {
				maxZoom: 4.8,
				marginRatio: 0.22,
				singleCountryZoom: 4.8
			};
		case 'bipmed':
			return {
				maxZoom: 3.6,
				marginRatio: 0.24,
				singleCountryZoom: 3.6
			};
		case 'pgp-harvard':
			return { maxZoom: 3.5, marginRatio: 0.22, singleCountryZoom: 3.5 };
		case '1kgp':
			return { maxZoom: 2.8, marginRatio: 0.18, singleCountryZoom: 2.5 };
		default:
			return { maxZoom: 3.2, marginRatio: 0.2, singleCountryZoom: 3.2 };
	}
}

export interface TenantPortalUrlOptions {
	hostname?: string | null;
	port?: string | null;
	protocol?: string;
}

function isLocalDevHost(hostname: string | null | undefined): boolean {
	if (!hostname) return false;
	const host = hostname.split(':')[0].toLowerCase();
	return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

function scopedTenantForHost(hostname: string) {
	return TENANTS.find((tenant) => tenant.scope && tenant.hosts.includes(hostname));
}

/** Portal URL for a scoped biobank slug, relative to the current host when possible. */
export function tenantPortalUrl(
	biobankSlug: string,
	options: TenantPortalUrlOptions = {}
): string | null {
	const tenant = TENANTS.find((t) => t.scope === biobankSlug);
	if (!tenant) return null;

	const hostname = options.hostname?.split(':')[0].toLowerCase() ?? '';
	const portSuffix = options.port ? `:${options.port}` : '';
	const protocol = options.protocol ?? 'https:';

	if (!hostname) {
		const prodHost = tenant.hosts.find((h) => h.endsWith('.biovault.net'));
		return prodHost ? `https://${prodHost}` : null;
	}

	// Already on this portal's host — stay here.
	if (tenant.hosts.includes(hostname)) {
		return `${protocol}//${hostname}${portSuffix}/`;
	}

	const origin = `${protocol}//${hostname}${portSuffix}`;

	if (isLocalDevHost(hostname)) {
		const devHost = tenant.hosts.find((h) => h.endsWith('.localhost') && h !== 'localhost');
		if (devHost) return `http://${devHost}${portSuffix}/`;
		return `${origin}/?tenant=${encodeURIComponent(tenant.slug)}`;
	}

	// On another portal's dedicated domain — link to that portal's prod host.
	if (scopedTenantForHost(hostname)) {
		const prodHost = tenant.hosts.find((h) => h.endsWith('.biovault.net'));
		return prodHost ? `https://${prodHost}` : null;
	}

	// Shared host (workers.dev preview, data.biovault.net, etc.) — same origin + tenant override.
	return `${origin}/?tenant=${encodeURIComponent(tenant.slug)}`;
}
