export interface PublicVariantIdParts {
	chromName: string;
	pos: number;
	ref: string;
	alt: string;
}

export function publicVariantId(v: PublicVariantIdParts): string {
	return `chr${v.chromName}-${v.pos}-${v.ref}-${v.alt}`;
}

export function publicVariantPathToken(v: PublicVariantIdParts): string {
	return encodeURIComponent(publicVariantId(v));
}
