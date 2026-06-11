// GRCh38 chromosome metadata: integer codes + ga4gh refget (SQ) accessions.
// SQ accessions fetched from services.genomicmedlab.org seqrepo; chr5 verified
// against the VRS AlleleTranslator golden vector.

export const CHROM_CODE: Record<string, number> = {
	'1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
	'10': 10, '11': 11, '12': 12, '13': 13, '14': 14, '15': 15, '16': 16, '17': 17,
	'18': 18, '19': 19, '20': 20, '21': 21, '22': 22, X: 23, Y: 24, MT: 25
};

export const CODE_CHROM: Record<number, string> = Object.fromEntries(
	Object.entries(CHROM_CODE).map(([k, v]) => [v, k])
);

// refgetAccession values are stored WITHOUT the "ga4gh:" prefix (VRS object form).
export const REFGET_SQ: Record<number, string> = {
	1: 'SQ.Ya6Rs7DHhDeg7YaOSg1EoNi3U_nQ9SvO',
	2: 'SQ.pnAqCRBrTsUoBghSD1yp_jXWSmlbdh4g',
	3: 'SQ.Zu7h9AggXxhTaGVsy7h_EZSChSZGcmgX',
	4: 'SQ.HxuclGHh0XCDuF8x6yQrpHUBL7ZntAHc',
	5: 'SQ.aUiQCzCPZ2d0csHbMSbh2NzInhonSXwI',
	6: 'SQ.0iKlIQk2oZLoeOG9P1riRU6hvL5Ux8TV',
	7: 'SQ.F-LrLMe1SRpfUZHkQmvkVKFEGaoDeHul',
	8: 'SQ.209Z7zJ-mFypBEWLk4rNC6S_OxY5p7bs',
	9: 'SQ.KEO-4XBcm1cxeo_DIQ8_ofqGUkp4iZhI',
	10: 'SQ.ss8r_wB0-b9r44TQTMmVTI92884QvBiB',
	11: 'SQ.2NkFm8HK88MqeNkCgj78KidCAXgnsfV1',
	12: 'SQ.6wlJpONE3oNb4D69ULmEXhqyDZ4vwNfl',
	13: 'SQ._0wi-qoDrvram155UmcSC-zA5ZK4fpLT',
	14: 'SQ.eK4D2MosgK_ivBkgi6FVPg5UXs1bYESm',
	15: 'SQ.AsXvWL1-2i5U_buw6_niVIxD6zTbAuS6',
	16: 'SQ.yC_0RBj3fgBlvgyAuycbzdubtLxq-rE0',
	17: 'SQ.dLZ15tNO1Ur0IcGjwc3Sdi_0A6Yf4zm7',
	18: 'SQ.vWwFhJ5lQDMhh-czg06YtlWqu0lvFAZV',
	19: 'SQ.IIB53T8CNeJJdUqzn9V_JnRtQadwWCbl',
	20: 'SQ.-A1QmD_MatoqxvgVxBLZTONHz9-c7nQo',
	21: 'SQ.5ZUqxCmDDgN4xTRbaSjN8LwgZironmB8',
	22: 'SQ.7B7SHsmchAR0dFcDCuSFjJAo7tX87krQ',
	23: 'SQ.w0WZEvgJF0zf_P4yyTzjjv9oW1z61HHP',
	24: 'SQ.8_liLu1aycC0tPQPFmUaGXJLDs5SbPZ5',
	25: 'SQ.k3grVkjY-hoWcCUojHw6VU6GE3MZ8Sct'
};

const ALT = /^chr/i;
export function normChrom(raw: string): string {
	let c = raw.replace(ALT, '').toUpperCase();
	if (c === 'M') c = 'MT';
	if (c === '23') c = 'X';
	if (c === '24') c = 'Y';
	return c;
}

export function chromCode(raw: string): number | null {
	return CHROM_CODE[normChrom(raw)] ?? null;
}
