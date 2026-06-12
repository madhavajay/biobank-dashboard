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
		map: { center: [8, -35], zoom: 1.75 },
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
		map: { center: [17.9, -68.5], zoom: 12 },
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
		map: { center: [-14.235, -51.925], zoom: 3.4 },
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
		map: { center: [39.83, -98.58], zoom: 3.1 },
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
		`--map-pin:${th.mapPin}`
	].join(';');
}
