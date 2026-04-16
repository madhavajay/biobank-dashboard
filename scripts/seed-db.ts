import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSeedData } from '../src/lib/server/db/seed.ts';

const rowsPerInsert = 100;
const args = new Set(process.argv.slice(2));
const remote = args.has('--remote');
const local = args.has('--local');

if (remote === local) {
	console.error('Usage: bun scripts/seed-db.ts --remote | --local');
	process.exit(1);
}

const escapeSql = (value: unknown) => {
	if (value === null || value === undefined) return 'NULL';
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
	return `'${String(value).replaceAll("'", "''")}'`;
};

const chunk = <T>(items: T[], size: number) => {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};

const toInsertSql = (table: string, columns: string[], rows: Array<Record<string, unknown>>) =>
	chunk(rows, rowsPerInsert)
		.map((group) => {
			const values = group
				.map((row) => `(${columns.map((column) => escapeSql(row[column])).join(', ')})`)
				.join(',\n');
			return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${values};`;
		})
		.join('\n\n');

const data = createSeedData();

const sql = [
	'DELETE FROM variant_subjects;',
	'DELETE FROM variant_consequences;',
	'DELETE FROM state_annotations;',
	'DELETE FROM variants;',
	'DELETE FROM states;',
	toInsertSql(
		'states',
		[
			'code',
			'name',
			'region',
			'samples',
			'area_km2',
			'population',
			'population_male',
			'population_female',
			'individuals',
			'individuals_male',
			'individuals_female',
			'wgs_samples',
			'snp_samples',
			'single_cell_samples',
			'volume_gb',
			'fastq_gb',
			'bam_gb',
			'vcf_gb',
			'genes',
			'protein_coding',
			'lnc_rna',
			'processed_pseudogene',
			'unprocessed_pseudogene',
			'other_genes',
			'variants',
			'common_variants',
			'low_frequency_variants',
			'rare_variants',
			'other_variants'
		],
		data.states.map((row) => ({
			code: row.code,
			name: row.name,
			region: row.region,
			samples: row.samples,
			area_km2: row.areaKm2,
			population: row.population,
			population_male: row.populationMale,
			population_female: row.populationFemale,
			individuals: row.individuals,
			individuals_male: row.individualsMale,
			individuals_female: row.individualsFemale,
			wgs_samples: row.wgsSamples,
			snp_samples: row.snpSamples,
			single_cell_samples: row.singleCellSamples,
			volume_gb: row.volumeGb,
			fastq_gb: row.fastqGb,
			bam_gb: row.bamGb,
			vcf_gb: row.vcfGb,
			genes: row.genes,
			protein_coding: row.proteinCoding,
			lnc_rna: row.lncRna,
			processed_pseudogene: row.processedPseudogene,
			unprocessed_pseudogene: row.unprocessedPseudogene,
			other_genes: row.otherGenes,
			variants: row.variants,
			common_variants: row.commonVariants,
			low_frequency_variants: row.lowFrequencyVariants,
			rare_variants: row.rareVariants,
			other_variants: row.otherVariants
		}))
	),
	toInsertSql(
		'state_annotations',
		['state_code', 'rank', 'annotation'],
		data.stateAnnotations.map((row) => ({
			state_code: row.stateCode,
			rank: row.rank,
			annotation: row.annotation
		}))
	),
	toInsertSql(
		'variants',
		[
			'id',
			'project',
			'state_code',
			'chromosome',
			'position',
			'ref',
			'alt',
			'dna_change',
			'variant_class',
			'consequence',
			'allele_frequency',
			'ac',
			'an',
			'gene_count',
			'impact',
			'dbsnp',
			'genotype_quality',
			'gene',
			'subject_count',
			'tag',
			'functional_impact_gene',
			'functional_impact_vep',
			'heterozygote',
			'homozygote_alternative',
			'homozygote_reference',
			'homozygote_other'
		],
		data.variants.map((row) => ({
			id: row.id,
			project: row.project,
			state_code: row.stateCode,
			chromosome: row.chromosome,
			position: row.position,
			ref: row.ref,
			alt: row.alt,
			dna_change: row.dnaChange,
			variant_class: row.variantClass,
			consequence: row.consequence,
			allele_frequency: row.alleleFrequency,
			ac: row.ac,
			an: row.an,
			gene_count: row.geneCount,
			impact: row.impact,
			dbsnp: row.dbSnp,
			genotype_quality: row.genotypeQuality,
			gene: row.gene,
			subject_count: row.subjectCount,
			tag: row.tag,
			functional_impact_gene: row.functionalImpactGene,
			functional_impact_vep: row.functionalImpactVep,
			heterozygote: row.heterozygote,
			homozygote_alternative: row.homozygoteAlternative,
			homozygote_reference: row.homozygoteReference,
			homozygote_other: row.homozygoteOther
		}))
	),
	toInsertSql(
		'variant_consequences',
		['variant_id', 'gene', 'ensembl_gene', 'consequence', 'impact', 'canonical', 'strand', 'transcript'],
		data.variantConsequences.map((row) => ({
			variant_id: row.variantId,
			gene: row.gene,
			ensembl_gene: row.ensemblGene,
			consequence: row.consequence,
			impact: row.impact,
			canonical: row.canonical,
			strand: row.strand,
			transcript: row.transcript
		}))
	),
	toInsertSql(
		'variant_subjects',
		['variant_id', 'subject_id', 'ethnicity', 'state', 'center', 'project'],
		data.variantSubjects.map((row) => ({
			variant_id: row.variantId,
			subject_id: row.subjectId,
			ethnicity: row.ethnicity,
			state: row.state,
			center: row.center,
			project: row.project
		}))
	)
].join('\n\n');

const tempDir = mkdtempSync(join(tmpdir(), 'biobank-d1-seed-'));
const sqlPath = join(tempDir, 'seed.sql');
writeFileSync(sqlPath, sql);

execFileSync(
	'bunx',
	['wrangler', 'd1', 'execute', 'DB', local ? '--local' : '--remote', '--file', sqlPath],
	{ stdio: 'inherit' }
);
