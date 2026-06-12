# Clinpgx

Small browser-friendly client for ClinPGx / PharmGKB reference objects and clinical
annotation lookups. It mirrors the local `utils/gnomad` package shape but uses
the public ClinPGx REST API.

## Browser Global

```html
<script src="/utils/clinpgx/js/clinpgx.global.js"></script>
<script>
	async function loadClinpgx() {
		const client = new Clinpgx.ClinpgxClient();
		const page = await client.queryVariantPage('rs4244285', { maxAnnotations: 10 });
		console.log(page.variant, page.annotations);
	}

	loadClinpgx().catch(console.error);
</script>
```

## ES Module

```js
import { ClinpgxClient } from './js/clinpgx.mjs';

const client = new ClinpgxClient();

const variant = await client.queryVariant('rs1256031');
const gene = await client.queryGene('ESR2');
const annotations = await client.queryClinicalAnnotationsByVariant('rs4244285');
```

## Useful API Calls

- Variant lookup by rsID: `/data/variant?name=rs1256031&view=max`
- Variant lookup by PA ID: `/data/variant/PA166154775?view=max`
- Gene lookup by symbol: `/data/gene?symbol=ESR2&view=base`
- Variant clinical annotations: `/data/clinicalAnnotation?location.fingerprint=rs4244285&view=base`
- Gene clinical annotations: `/data/clinicalAnnotation?location.genes.symbol=CYP2C19&view=base`

Notes:

- Default endpoint: `https://api.clinpgx.org/v1`.
- Default site URL: `https://www.clinpgx.org`.
- `queryVariant` accepts rsIDs, numeric rsID values, or PharmGKB / ClinPGx PA IDs.
- `queryVariantPage` combines the reference object with the clinical annotation rows shown on the ClinPGx variant page.
