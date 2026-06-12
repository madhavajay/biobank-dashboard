# Gnomad

Small browser-friendly client for gnomAD variant frequency lookups. It queries
the public gnomAD GraphQL endpoint directly from client-side JavaScript.

## Browser Global

```html
<script src="/utils/gnomad/js/gnomad.global.js"></script>
<script>
	async function loadGnomad() {
		const client = new Gnomad.GnomadClient();
		const row = await client.queryVariant('chr1-785910-G-C');
		console.log(row);
	}

	loadGnomad().catch(console.error);
</script>
```

## ES Module

```js
import { GnomadClient } from './js/gnomad.mjs';

const client = new GnomadClient();

for await (const row of client.queryVariants(['chr1-785910-G-C', 'rs12565286'])) {
	console.log(row.id, row.rsid, row.summary.joint?.af);
}
```

## Returned Row

```js
{
  id: '1-785910-G-C',
  location: '1:785910',
  allele: 'G>C',
  rsid: 'rs12565286',
  flags: ['segdup'],
  summary: {
    exome: { ac, an, af, homozygoteCount, hemizygoteCount, filters },
    genome: { ac, an, af, homozygoteCount, hemizygoteCount, filters }
  },
  colocatedVariants: ['1-785910-G-T'],
  populations: [
    { sequencingType: 'joint', id: 'nfe', ac, an, af, homozygoteCount, hemizygoteCount }
  ],
  raw: {}
}
```

Notes:

- Default endpoint: `https://gnomad.broadinstitute.org/api`.
- Default dataset: `gnomad_r4`.
- `queryVariant` accepts gnomAD IDs, `chr`-prefixed IDs, rsIDs, or objects like
  `{ chrom: '1', pos: 785910, ref: 'G', alt: 'C' }`.
- `queryVariants` is an async generator.
