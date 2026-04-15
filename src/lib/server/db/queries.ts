import { and, asc, count, desc, eq, like, or, sum } from 'drizzle-orm';
import { mapLegend, portalMeta } from '$lib/data/biobank';
import { getDb } from './index';
import { stateAnnotations, states, variantConsequences, variantSubjects, variants } from './schema.ts';

const asNumber = (value: unknown) => Number(value ?? 0);

const regionColors = ['#4caf50', '#4ca0c7', '#f0c245', '#9e77d5', '#f28f4a'];
const geneColors = ['#68b89a', '#8a6fe8', '#f2bf54', '#ef8d62', '#4cb9d8'];
const storageColors = ['#68b89a', '#4ca0c7', '#8a6fe8'];
const consequenceColors = ['#23426b', '#2ca6b1', '#68b89a', '#ef8d62', '#8a6fe8'];
const metricColors = {
	individuals: ['#68b89a', '#4ca0c7', '#d7dee9'],
	datasets: ['#29427a', '#4ca0c7', '#8a6fe8'],
	genes: ['#68b89a', '#8a6fe8', '#f2bf54'],
	variants: ['#68b89a', '#ef8d62', '#4cb9d8']
};

const buildVariantReferences = (variant: {
	id: string;
	dbSnp: string;
	gene: string;
}) => [
	{ label: 'dbSNP', value: variant.dbSnp, url: `https://www.ncbi.nlm.nih.gov/snp/${variant.dbSnp}` },
	{ label: 'COSMIC', value: 'COSMIC', url: `https://cancer.sanger.ac.uk/cosmic/search?q=${encodeURIComponent(variant.id)}` },
	{ label: 'ClinVar', value: 'ClinVar', url: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(variant.dbSnp)}` },
	{ label: 'CIVIC', value: 'CIVIC', url: `https://civicdb.org/links/entrez_name/${encodeURIComponent(variant.gene)}` },
	{ label: 'CPIC', value: 'CPIC', url: `https://cpicpgx.org/gene/${encodeURIComponent(variant.gene.toLowerCase())}/` },
	{ label: 'UCSC', value: 'UCSC', url: `https://genome.ucsc.edu/cgi-bin/hgTracks?position=${encodeURIComponent(variant.id.replaceAll('-', ':'))}` }
];

export const getHomePageData = async (platform: App.Platform | undefined) => {
	const db = getDb(platform);

	const stateRows = await db.select().from(states).orderBy(asc(states.code));

	const totals = await db
		.select({
			samples: sum(states.samples),
			individuals: sum(states.individuals),
			individualsMale: sum(states.individualsMale),
			individualsFemale: sum(states.individualsFemale),
			wgsSamples: sum(states.wgsSamples),
			snpSamples: sum(states.snpSamples),
			singleCellSamples: sum(states.singleCellSamples),
			volumeGb: sum(states.volumeGb),
			fastqGb: sum(states.fastqGb),
			bamGb: sum(states.bamGb),
			vcfGb: sum(states.vcfGb),
			genes: sum(states.genes),
			proteinCoding: sum(states.proteinCoding),
			lncRna: sum(states.lncRna),
			processedPseudogene: sum(states.processedPseudogene),
			unprocessedPseudogene: sum(states.unprocessedPseudogene),
			otherGenes: sum(states.otherGenes),
			variants: sum(states.variants),
			commonVariants: sum(states.commonVariants),
			lowFrequencyVariants: sum(states.lowFrequencyVariants),
			rareVariants: sum(states.rareVariants),
			otherVariants: sum(states.otherVariants)
		})
		.from(states);

	const consequenceGroups = await db
		.select({
			consequence: variants.consequence,
			total: count()
		})
		.from(variants)
		.groupBy(variants.consequence)
		.orderBy(desc(count()))
		.limit(5);

	const regionGroups = await db
		.select({
			region: states.region,
			totalSamples: sum(states.samples)
		})
		.from(states)
		.groupBy(states.region)
		.orderBy(desc(sum(states.samples)));

	const variantRows = await db
		.select({
			gene: variants.gene,
			alleleFrequency: variants.alleleFrequency
		})
		.from(variants);

	const aggregated = totals[0]!;
	const totalIndividuals = asNumber(aggregated.individuals);
	const totalFemale = asNumber(aggregated.individualsFemale);
	const totalMale = asNumber(aggregated.individualsMale);
	const totalVolumeGb = asNumber(aggregated.volumeGb);
	const totalSamples = asNumber(aggregated.samples);
	const representedStates = stateRows.filter((entry) => entry.samples > 0).length;
	const totalWgs = asNumber(aggregated.wgsSamples);
	const totalSnp = asNumber(aggregated.snpSamples);
	const totalSingleCell = asNumber(aggregated.singleCellSamples);
	const totalGenes = asNumber(aggregated.genes);
	const totalProteinCoding = asNumber(aggregated.proteinCoding);
	const totalLncRna = asNumber(aggregated.lncRna);
	const totalProcessedPseudogene = asNumber(aggregated.processedPseudogene);
	const totalUnprocessedPseudogene = asNumber(aggregated.unprocessedPseudogene);
	const totalOtherGenes = asNumber(aggregated.otherGenes);
	const totalVariants = asNumber(aggregated.variants);
	const totalCommonVariants = asNumber(aggregated.commonVariants);
	const totalLowFrequencyVariants = asNumber(aggregated.lowFrequencyVariants);
	const totalRareVariants = asNumber(aggregated.rareVariants);
	const totalOtherVariants = totalLowFrequencyVariants + asNumber(aggregated.otherVariants);
	const topConsequences = consequenceGroups.slice(0, 4);
	const topConsequenceTotal = topConsequences.reduce((sum, entry) => sum + entry.total, 0);
	const variantConsequenceSummary = [
		...topConsequences.map((entry, index) => ({
			label: entry.consequence.replaceAll('_', ' '),
			value: entry.total,
			display: entry.total.toLocaleString(),
			color: consequenceColors[index] ?? consequenceColors[consequenceColors.length - 1]
		})),
		{
			label: 'Others',
			value: Math.max(0, variantRows.length - topConsequenceTotal),
			display: Math.max(0, variantRows.length - topConsequenceTotal).toLocaleString(),
			color: consequenceColors[4]
		}
	];

	return {
		portalMeta,
		mapLegend,
		states: stateRows,
		homeMetrics: [
			{
				label: 'Individuals',
				value: totalIndividuals.toLocaleString(),
				details: [
					{ label: 'Female', value: totalFemale, display: totalFemale.toLocaleString(), color: metricColors.individuals[0] },
					{ label: 'Male', value: totalMale, display: totalMale.toLocaleString(), color: metricColors.individuals[1] },
					{ label: 'No data', value: Math.max(0, totalIndividuals - totalFemale - totalMale), display: Math.max(0, totalIndividuals - totalFemale - totalMale).toLocaleString(), color: metricColors.individuals[2] }
				]
			},
			{
				label: 'Datasets',
				value: [totalWgs, totalSnp, totalSingleCell].filter((value) => value > 0).length.toLocaleString(),
				details: [
					{ label: 'WGS', value: totalWgs, display: totalWgs.toLocaleString(), color: metricColors.datasets[0] },
					{ label: 'SNP', value: totalSnp, display: totalSnp.toLocaleString(), color: metricColors.datasets[1] },
					{ label: 'Single-cell', value: totalSingleCell, display: totalSingleCell.toLocaleString(), color: metricColors.datasets[2] }
				]
			},
			{
				label: 'Genes',
				value: totalGenes.toLocaleString(),
				details: [
					{ label: 'Protein coding', value: totalProteinCoding, display: totalProteinCoding.toLocaleString(), color: metricColors.genes[0] },
					{ label: 'lncRNA', value: totalLncRna, display: totalLncRna.toLocaleString(), color: metricColors.genes[1] },
					{ label: 'Others', value: totalOtherGenes, display: totalOtherGenes.toLocaleString(), color: metricColors.genes[2] }
				]
			},
			{
				label: 'Variants',
				value: totalVariants.toLocaleString(),
				details: [
					{ label: 'Common', value: totalCommonVariants, display: totalCommonVariants.toLocaleString(), color: metricColors.variants[0] },
					{ label: 'Rare', value: totalRareVariants, display: totalRareVariants.toLocaleString(), color: metricColors.variants[2] },
					{ label: 'Others', value: totalOtherVariants, display: totalOtherVariants.toLocaleString(), color: '#29427a' }
				]
			}
		],
		geneBiotype: [
			{ label: 'Protein coding', value: totalProteinCoding, display: totalProteinCoding.toLocaleString(), color: geneColors[0] },
			{ label: 'lncRNA', value: totalLncRna, display: totalLncRna.toLocaleString(), color: geneColors[1] },
			{ label: 'Processed pseudogene', value: totalProcessedPseudogene, display: totalProcessedPseudogene.toLocaleString(), color: geneColors[2] },
			{ label: 'Unprocessed pseudogene', value: totalUnprocessedPseudogene, display: totalUnprocessedPseudogene.toLocaleString(), color: geneColors[3] },
			{ label: 'Others', value: totalOtherGenes, display: totalOtherGenes.toLocaleString(), color: geneColors[4] }
		],
		variantConsequences: variantConsequenceSummary,
		storageBreakdown: [
			{ label: 'FASTQ', value: asNumber(aggregated.fastqGb), display: `${asNumber(aggregated.fastqGb).toLocaleString()} GB`, color: storageColors[0] },
			{ label: 'BAM', value: asNumber(aggregated.bamGb), display: `${asNumber(aggregated.bamGb).toLocaleString()} GB`, color: storageColors[1] },
			{ label: 'VCF', value: asNumber(aggregated.vcfGb), display: `${asNumber(aggregated.vcfGb).toLocaleString()} GB`, color: storageColors[2] }
		],
		totalStorage: `${totalVolumeGb.toLocaleString()} GB`,
		regionSplit: regionGroups.map((entry, index) => ({
			label: entry.region,
			value: asNumber(entry.totalSamples).toLocaleString(),
			color: regionColors[index] ?? regionColors[regionColors.length - 1]
		})),
		homeSummary: {
			samplesByState: totalSamples,
			statesRepresented: representedStates
		}
	};
};

type ExplorerSort = 'position' | 'af_desc' | 'gene';
type ExplorerClassFilter = 'all' | 'SNV' | 'INS' | 'DEL';
type ExplorerStateFilter = 'all' | 'SP' | 'RJ' | 'MG' | 'ES';

export const getExplorerPageData = async (
	platform: App.Platform | undefined,
	query: string,
	page: number,
	pageSize = 20,
	sort: ExplorerSort = 'position',
	variantClassFilter: ExplorerClassFilter = 'all',
	stateFilter: ExplorerStateFilter = 'all',
	tagFilter = 'all'
) => {
	const db = getDb(platform);

	const term = query.trim();
	const searchWhere = term
		? or(
				like(variants.dnaChange, `%${term}%`),
				like(variants.gene, `%${term}%`),
				like(variants.dbSnp, `%${term}%`),
				like(variants.consequence, `%${term}%`),
				like(variants.tag, `%${term}%`)
			)
		: undefined;
	const classWhere = variantClassFilter !== 'all' ? eq(variants.variantClass, variantClassFilter) : undefined;
	const stateWhere = stateFilter !== 'all' ? eq(variants.stateCode, stateFilter) : undefined;
	const tagWhere = tagFilter !== 'all' ? eq(variants.tag, tagFilter) : undefined;
	const filters = [searchWhere, classWhere, stateWhere, tagWhere].filter(Boolean);
	const where = filters.length > 1 ? and(...filters) : filters[0];
	const orderBy =
		sort === 'af_desc'
			? [desc(variants.alleleFrequency), asc(variants.chromosome), asc(variants.position)]
			: sort === 'gene'
				? [asc(variants.gene), asc(variants.chromosome), asc(variants.position)]
				: [asc(variants.chromosome), asc(variants.position)];

	const [matching] = await db
		.select({ total: count() })
		.from(variants)
		.where(where);

	const [totalVariants] = await db.select({ total: count() }).from(variants);
	const [subjectTotals] = await db.select({ total: sum(states.individuals) }).from(states);
	const geneRows = await db.select({ gene: variants.gene }).from(variants);
	const stateOptionsRows = await db.select({ code: states.code, name: states.name }).from(states).orderBy(asc(states.code));
	const tagOptionsRows = await db.select({ tag: variants.tag }).from(variants).groupBy(variants.tag).orderBy(asc(variants.tag));

	const totalRows = matching?.total ?? 0;
	const currentPage = Math.max(1, page);
	const offset = (currentPage - 1) * pageSize;

	const rows = await db
		.select({
			id: variants.id,
			dnaChange: variants.dnaChange,
			stateCode: variants.stateCode,
			variantClass: variants.variantClass,
			consequence: variants.consequence,
			alleleFrequency: variants.alleleFrequency,
			ac: variants.ac,
			an: variants.an,
			geneCount: variants.geneCount,
			subjectCount: variants.subjectCount,
			impact: variants.impact,
			dbSnp: variants.dbSnp,
			tag: variants.tag,
			genotypeQuality: variants.genotypeQuality,
			gene: variants.gene
		})
		.from(variants)
		.where(where)
		.orderBy(...orderBy)
		.limit(pageSize)
		.offset(offset);

	return {
		q: term,
		page: currentPage,
		pageSize,
		sort,
		variantClassFilter,
		stateFilter,
		tagFilter,
		totalRows,
		totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
		totalVariants: totalVariants?.total ?? 0,
		totalSubjects: asNumber(subjectTotals?.total),
		totalGenes: new Set(geneRows.map((row) => row.gene)).size,
		stateOptions: stateOptionsRows,
		tagOptions: tagOptionsRows.map((row) => row.tag),
		rows: rows.map((row) => ({
			...row,
			afLabel: `${row.ac}/${row.an}${(row.alleleFrequency * 100).toFixed(row.alleleFrequency < 0.01 ? 2 : 2)}%`
		}))
	};
};


export const getVariantPageData = async (platform: App.Platform | undefined, id: string) => {
	const db = getDb(platform);

	const [variant] = await db.select().from(variants).where(eq(variants.id, id));
	if (!variant) return null;

	const consequenceRows = await db
		.select({
			gene: variantConsequences.gene,
			ensemblGene: variantConsequences.ensemblGene,
			consequence: variantConsequences.consequence,
			impact: variantConsequences.impact,
			canonical: variantConsequences.canonical,
			strand: variantConsequences.strand,
			transcript: variantConsequences.transcript
		})
		.from(variantConsequences)
		.where(eq(variantConsequences.variantId, id))
		.orderBy(asc(variantConsequences.id));

	const subjectRows = await db
		.select({
			subjectId: variantSubjects.subjectId,
			ethnicity: variantSubjects.ethnicity,
			state: variantSubjects.state,
			center: variantSubjects.center,
			project: variantSubjects.project
		})
		.from(variantSubjects)
		.where(eq(variantSubjects.variantId, id))
		.orderBy(asc(variantSubjects.id));

	const distinctSubjectStates = Array.from(new Set(subjectRows.map((row) => row.state)));
	const distinctCenters = Array.from(new Set(subjectRows.map((row) => row.center)));
	const distinctEthnicities = Array.from(new Set(subjectRows.map((row) => row.ethnicity)));
	const ethnicityCounts = subjectRows.reduce<Record<string, number>>((acc, row) => {
		acc[row.ethnicity] = (acc[row.ethnicity] ?? 0) + 1;
		return acc;
	}, {});
	const stateCounts = subjectRows.reduce<Record<string, number>>((acc, row) => {
		acc[row.state] = (acc[row.state] ?? 0) + 1;
		return acc;
	}, {});
	const canonicalCount = consequenceRows.filter((row) => row.canonical === '1').length;
	const transcriptCount = new Set(consequenceRows.map((row) => row.transcript)).size;
	const locus = `chr${variant.chromosome}:${variant.position}`;

	return {
		variant: {
			id: variant.id,
			project: variant.project,
			stateCode: variant.stateCode,
			tag: variant.tag,
			variantClass: variant.variantClass,
			consequence: variant.consequence,
			functionalImpactGene: variant.functionalImpactGene,
			functionalImpactVep: variant.functionalImpactVep,
			populationAlleleFrequency: `${(variant.alleleFrequency * 100).toFixed(2)}%`,
			populationAlleleCount: String(variant.ac),
			populationAlleleNumber: String(variant.an),
			subjectCount: variant.subjectCount,
			heterozygote: String(variant.heterozygote),
			homozygoteAlternative: String(variant.homozygoteAlternative),
			homozygoteReference: String(variant.homozygoteReference),
			genotypeQuality: variant.genotypeQuality,
			gene: variant.gene,
			rsid: variant.dbSnp,
			externalReferences: buildVariantReferences(variant)
		},
		consequenceRows,
		subjectRows,
		distributionSummary: {
			carrierSubjects: subjectRows.length,
			statesRepresented: distinctSubjectStates.length,
			centersRepresented: distinctCenters.length,
			topEthnicity:
				Object.entries(ethnicityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A',
			topState: Object.entries(stateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A',
			carrierRate: variant.an > 0 ? `${((variant.ac / variant.an) * 100).toFixed(2)}%` : '0.00%'
		},
		consequenceSummary: {
			totalRows: consequenceRows.length,
			canonicalRows: canonicalCount,
			transcripts: transcriptCount,
			genes: new Set(consequenceRows.map((row) => row.gene)).size
		},
		genomeBrowserSummary: {
			locus,
			chromosome: variant.chromosome,
			position: variant.position,
			reference: variant.ref,
			alternate: variant.alt,
			ucscUrl: `https://genome.ucsc.edu/cgi-bin/hgTracks?position=${encodeURIComponent(locus)}`,
			dbSnpUrl: `https://www.ncbi.nlm.nih.gov/snp/${variant.dbSnp}`
		}
	};
};
