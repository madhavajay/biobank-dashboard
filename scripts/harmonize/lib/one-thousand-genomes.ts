// 1000 Genomes / IGSR population metadata for registry seeding.
// Keep the cohort frequencies at subpopulation level; country and region
// mappings are rollup/display metadata.

export type OneKgpSuperPopulation = 'AFR' | 'AMR' | 'EAS' | 'EUR' | 'SAS';

export interface OneKgpPopulation {
	code: string;
	name: string;
	superPopulation: OneKgpSuperPopulation;
	collectionCountry: string;
	collectionCountryCode: string;
	diaspora: boolean;
	regionGroup: string;
	dnaSamples: number;
	cellCultures: number;
}

export const ONE_KGP_POPULATIONS: OneKgpPopulation[] = [
	{
		code: 'ASW',
		name: 'African Ancestry in SW USA',
		superPopulation: 'AFR',
		collectionCountry: 'United States',
		collectionCountryCode: 'US',
		diaspora: true,
		regionGroup: 'North America',
		dnaSamples: 62,
		cellCultures: 62
	},
	{
		code: 'ACB',
		name: 'African Caribbean in Barbados',
		superPopulation: 'AFR',
		collectionCountry: 'Barbados',
		collectionCountryCode: 'BB',
		diaspora: true,
		regionGroup: 'Caribbean',
		dnaSamples: 120,
		cellCultures: 120
	},
	{
		code: 'BEB',
		name: 'Bengali in Bangladesh',
		superPopulation: 'SAS',
		collectionCountry: 'Bangladesh',
		collectionCountryCode: 'BD',
		diaspora: false,
		regionGroup: 'South Asia',
		dnaSamples: 144,
		cellCultures: 144
	},
	{
		code: 'GBR',
		name: 'British From England and Scotland',
		superPopulation: 'EUR',
		collectionCountry: 'United Kingdom',
		collectionCountryCode: 'GB',
		diaspora: false,
		regionGroup: 'Europe',
		dnaSamples: 100,
		cellCultures: 100
	},
	{
		code: 'CDX',
		name: 'Chinese Dai in Xishuangbanna, China',
		superPopulation: 'EAS',
		collectionCountry: 'China',
		collectionCountryCode: 'CN',
		diaspora: false,
		regionGroup: 'East Asia',
		dnaSamples: 102,
		cellCultures: 102
	},
	{
		code: 'CLM',
		name: 'Colombian in Medellin, Colombia',
		superPopulation: 'AMR',
		collectionCountry: 'Colombia',
		collectionCountryCode: 'CO',
		diaspora: false,
		regionGroup: 'South America',
		dnaSamples: 136,
		cellCultures: 136
	},
	{
		code: 'ESN',
		name: 'Esan in Nigeria',
		superPopulation: 'AFR',
		collectionCountry: 'Nigeria',
		collectionCountryCode: 'NG',
		diaspora: false,
		regionGroup: 'West Africa',
		dnaSamples: 173,
		cellCultures: 173
	},
	{
		code: 'FIN',
		name: 'Finnish in Finland',
		superPopulation: 'EUR',
		collectionCountry: 'Finland',
		collectionCountryCode: 'FI',
		diaspora: false,
		regionGroup: 'Europe',
		dnaSamples: 103,
		cellCultures: 103
	},
	{
		code: 'GWD',
		name: 'Gambian in Western Division - Mandinka',
		superPopulation: 'AFR',
		collectionCountry: 'The Gambia',
		collectionCountryCode: 'GM',
		diaspora: false,
		regionGroup: 'West Africa',
		dnaSamples: 179,
		cellCultures: 179
	},
	{
		code: 'GIH',
		name: 'Gujarati Indians in Houston, Texas, USA',
		superPopulation: 'SAS',
		collectionCountry: 'United States',
		collectionCountryCode: 'US',
		diaspora: true,
		regionGroup: 'South Asian diaspora',
		dnaSamples: 109,
		cellCultures: 109
	},
	{
		code: 'CHB',
		name: 'Han Chinese in Beijing, China',
		superPopulation: 'EAS',
		collectionCountry: 'China',
		collectionCountryCode: 'CN',
		diaspora: false,
		regionGroup: 'East Asia',
		dnaSamples: 120,
		cellCultures: 120
	},
	{
		code: 'CHS',
		name: 'Han Chinese South',
		superPopulation: 'EAS',
		collectionCountry: 'China',
		collectionCountryCode: 'CN',
		diaspora: false,
		regionGroup: 'East Asia',
		dnaSamples: 163,
		cellCultures: 163
	},
	{
		code: 'IBS',
		name: 'Iberian Populations in Spain',
		superPopulation: 'EUR',
		collectionCountry: 'Spain',
		collectionCountryCode: 'ES',
		diaspora: false,
		regionGroup: 'Europe',
		dnaSamples: 157,
		cellCultures: 157
	},
	{
		code: 'ITU',
		name: 'Indian Telugu in the U.K.',
		superPopulation: 'SAS',
		collectionCountry: 'United Kingdom',
		collectionCountryCode: 'GB',
		diaspora: true,
		regionGroup: 'South Asian diaspora',
		dnaSamples: 118,
		cellCultures: 118
	},
	{
		code: 'JPT',
		name: 'Japanese in Tokyo, Japan',
		superPopulation: 'EAS',
		collectionCountry: 'Japan',
		collectionCountryCode: 'JP',
		diaspora: false,
		regionGroup: 'East Asia',
		dnaSamples: 120,
		cellCultures: 120
	},
	{
		code: 'KHV',
		name: 'Kinh in Ho Chi Minh City, Vietnam',
		superPopulation: 'EAS',
		collectionCountry: 'Vietnam',
		collectionCountryCode: 'VN',
		diaspora: false,
		regionGroup: 'Southeast Asia',
		dnaSamples: 124,
		cellCultures: 124
	},
	{
		code: 'LWK',
		name: 'Luhya in Webuye, Kenya',
		superPopulation: 'AFR',
		collectionCountry: 'Kenya',
		collectionCountryCode: 'KE',
		diaspora: false,
		regionGroup: 'East Africa',
		dnaSamples: 120,
		cellCultures: 120
	},
	{
		code: 'MSL',
		name: 'Mende in Sierra Leone',
		superPopulation: 'AFR',
		collectionCountry: 'Sierra Leone',
		collectionCountryCode: 'SL',
		diaspora: false,
		regionGroup: 'West Africa',
		dnaSamples: 128,
		cellCultures: 128
	},
	{
		code: 'MXL',
		name: 'Mexican Ancestry in Los Angeles CA USA',
		superPopulation: 'AMR',
		collectionCountry: 'United States',
		collectionCountryCode: 'US',
		diaspora: true,
		regionGroup: 'Latin American diaspora',
		dnaSamples: 71,
		cellCultures: 71
	},
	{
		code: 'PEL',
		name: 'Peruvian in Lima Peru',
		superPopulation: 'AMR',
		collectionCountry: 'Peru',
		collectionCountryCode: 'PE',
		diaspora: false,
		regionGroup: 'South America',
		dnaSamples: 122,
		cellCultures: 122
	},
	{
		code: 'PUR',
		name: 'Puerto Rican in Puerto Rico',
		superPopulation: 'AMR',
		collectionCountry: 'Puerto Rico',
		collectionCountryCode: 'PR',
		diaspora: false,
		regionGroup: 'Caribbean',
		dnaSamples: 139,
		cellCultures: 139
	},
	{
		code: 'PJL',
		name: 'Punjabi in Lahore, Pakistan',
		superPopulation: 'SAS',
		collectionCountry: 'Pakistan',
		collectionCountryCode: 'PK',
		diaspora: false,
		regionGroup: 'South Asia',
		dnaSamples: 158,
		cellCultures: 158
	},
	{
		code: 'STU',
		name: 'Sri Lankan Tamil in the UK',
		superPopulation: 'SAS',
		collectionCountry: 'United Kingdom',
		collectionCountryCode: 'GB',
		diaspora: true,
		regionGroup: 'South Asian diaspora',
		dnaSamples: 128,
		cellCultures: 128
	},
	{
		code: 'TSI',
		name: 'Toscani in Italia',
		superPopulation: 'EUR',
		collectionCountry: 'Italy',
		collectionCountryCode: 'IT',
		diaspora: false,
		regionGroup: 'Europe',
		dnaSamples: 114,
		cellCultures: 114
	},
	{
		code: 'YRI',
		name: 'Yoruba in Ibadan, Nigeria',
		superPopulation: 'AFR',
		collectionCountry: 'Nigeria',
		collectionCountryCode: 'NG',
		diaspora: false,
		regionGroup: 'West Africa',
		dnaSamples: 120,
		cellCultures: 120
	},
	{
		code: 'CEU',
		name: 'Utah residents with Northern and Western European ancestry from the CEPH collection',
		superPopulation: 'EUR',
		collectionCountry: 'United States',
		collectionCountryCode: 'US',
		diaspora: true,
		regionGroup: 'European diaspora',
		dnaSamples: 0,
		cellCultures: 0
	}
];
