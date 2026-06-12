# Clinvar

Small browser-friendly client for ClinVar variant lookups. It queries NCBI
E-utilities directly from client-side JavaScript with ESearch and ESummary.

## Browser Global

```html
<script src="/utils/clinvar/js/clinvar.global.js"></script>
<script>
	async function loadClinvar() {
		const Clinvar = await window.ClinvarReady;
		const client = new Clinvar.ClinvarClient();
		const rows = await client.queryVariant({
			chrom: 'X',
			pos: 154536002,
			ref: 'C',
			alt: 'T',
			rsid: 'rs1050828'
		});
		console.log(rows);
	}

	loadClinvar().catch(console.error);
</script>
```

## ES Module

```js
import { ClinvarClient } from './js/clinvar.mjs';

const client = new ClinvarClient();
const rows = await client.queryVariant('rs1050828');
console.log(rows.map((row) => [row.id, row.significance]));
```

## Notes

- Default endpoint: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils`.
- `queryVariant` accepts rsIDs, plain numeric rsIDs, `chr-pos-ref-alt` strings,
  or objects like `{ chrom: 'X', pos: 154536002, ref: 'C', alt: 'T' }`.
- When both rsID and coordinate fields are provided, both searches are used and
  duplicate ClinVar records are merged before summaries are normalized.
