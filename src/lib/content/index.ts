// Per-tenant static page content (about / team). Keyed by tenant slug.
// Localized text is stored as { en, pt }; edit the JSON files to update.
import type { Lang } from '$lib/i18n';
import bipmed from './bipmed.json';

export type Localized = { en: string; pt: string };
export type LocalizedList = { en: string[]; pt: string[] };

export interface TeamMember {
	name: string;
	degrees: string;
	role: Localized;
	photo: string;
	linkedin: string | null;
}
export interface TeamGroup {
	name: Localized;
	members: TeamMember[];
}
export interface AboutCenter {
	name: string;
	coordinator: string;
	url: string;
	logo?: string;
}
export interface ContactField {
	name: string;
	type: 'text' | 'email' | 'tel' | 'textarea';
	required: boolean;
	label: Localized;
}
export interface ContactConfig {
	intro: Localized;
	endpoint: string | null;
	fields: ContactField[];
}
export interface TenantContent {
	about?: {
		intro: Localized;
		paragraphs: LocalizedList;
		centers: AboutCenter[];
		references: { label: string; url: string }[];
	};
	team?: {
		intro: Localized;
		groups: TeamGroup[];
	};
	contact?: ContactConfig;
}

const REGISTRY: Record<string, TenantContent> = { bipmed: bipmed as TenantContent };

export function tenantContent(slug: string): TenantContent | null {
	return REGISTRY[slug] ?? null;
}

// pick the localized variant; falls back to English
export function loc<T>(v: { en: T; pt: T }, l: Lang): T {
	return l === 'pt' ? v.pt : v.en;
}
