export type StateRow = {
	code: string;
	name: string;
	region: string;
	samples: number;
	areaKm2: number;
	population: number;
	populationMale: number;
	populationFemale: number;
	individuals: number;
	individualsMale: number;
	individualsFemale: number;
	wgsSamples: number;
	snpSamples: number;
	singleCellSamples: number;
	volumeGb: number;
	fastqGb: number;
	bamGb: number;
	vcfGb: number;
	genes: number;
	proteinCoding: number;
	lncRna: number;
	processedPseudogene: number;
	unprocessedPseudogene: number;
	otherGenes: number;
	variants: number;
	commonVariants: number;
	lowFrequencyVariants: number;
	rareVariants: number;
	otherVariants: number;
};

export type StateAnnotationRow = {
	stateCode: string;
	rank: number;
	annotation: string;
};

export type VariantRow = {
	id: string;
	project: string;
	stateCode: string;
	chromosome: string;
	position: number;
	ref: string;
	alt: string;
	dnaChange: string;
	variantClass: string;
	consequence: string;
	alleleFrequency: number;
	ac: number;
	an: number;
	geneCount: number;
	impact: string;
	dbSnp: string;
	genotypeQuality: number;
	gene: string;
	subjectCount: number;
	tag: string;
	functionalImpactGene: string;
	functionalImpactVep: string;
	heterozygote: number;
	homozygoteAlternative: number;
	homozygoteReference: number;
	homozygoteOther: number;
};

export type VariantConsequenceRow = {
	variantId: string;
	gene: string;
	ensemblGene: string;
	consequence: string;
	impact: string;
	canonical: string;
	strand: string;
	transcript: string;
};

export type VariantSubjectRow = {
	variantId: string;
	subjectId: string;
	ethnicity: string;
	state: string;
	center: string;
	project: string;
};

const featureStates = [
	{ code: 'SP', name: 'Sao Paulo', region: 'Southeast' },
	{ code: 'RJ', name: 'Rio de Janeiro', region: 'Southeast' },
	{ code: 'MG', name: 'Minas Gerais', region: 'Southeast' },
	{ code: 'ES', name: 'Espirito Santo', region: 'Southeast' }
];

const genePool = [
	'APOE',
	'BRCA1',
	'CYP2C9',
	'CYP1A2',
	'CFTR',
	'HFE',
	'SCN5A',
	'MYH7',
	'PCSK9',
	'LMNA',
	'GJB2',
	'TNNT2',
	'ABCA4',
	'TTN',
	'PKD1',
	'PKD2',
	'SMAD4',
	'GATA4',
	'F5',
	'MTHFR',
	'COL1A1',
	'COL3A1',
	'ACTN2',
	'DSP',
	'KCNQ1',
	'KCNH2',
	'RYR2',
	'CACNA1C',
	'TP53',
	'MSH2'
];

const consequencePool = [
	'intron_variant',
	'missense_variant',
	'splice_region_variant',
	'intergenic_variant',
	'downstream_gene_variant',
	'stop_gained'
];

const tagPool = ['Cardiovascular', 'Pharmacogenomics', 'Cancer risk', 'Rare disease', 'Population screening', 'Exploration'];
const ethnicityPool = ['Brazilian', 'Mixed ancestry', 'Afro-Brazilian', 'European-Brazilian', 'Indigenous ancestry'];
const centerPool = ['BioVault Sao Paulo', 'BioVault Rio', 'BioVault Minas', 'BioVault Nordeste', 'BioVault Sul'];

const annotationPool = [
	'PANTHER:PTHR22769',
	'Pfam:PF01352&PROSITE_profiles:PS50805&SMART:SM00349',
	'Gene3D:3.40.50.880&Pfam:PF07722&CDD:cd01747',
	'Gene3D:1.10.510.10&PIRSF:PIRSF000615&CDD:cd05067',
	'Gene3D:3.90.550.50&Pfam:PF01762&PANTHER:PTHR11214',
	'Low_complexity_(Seg):seg',
	'PANTHER:PTHR12784&PANTHER:PTHR12784:SF6',
	'Pfam:PF04103&PANTHER:PTHR23320&Transmembrane_helices:TMhelix',
	'MobiDB_lite:mobidb-lite',
	'PANTHER:PTHR14069&Low_complexity_(Seg):seg'
];

const seededSpecialVariants = [
	{ chromosome: '19', position: 45411941, ref: 'T', alt: 'C', gene: 'APOE', consequence: 'missense_variant', tag: 'Cardiovascular' },
	{ chromosome: '17', position: 41276045, ref: 'C', alt: 'T', gene: 'BRCA1', consequence: 'stop_gained', tag: 'Cancer risk' },
	{ chromosome: '10', position: 94942286, ref: 'C', alt: 'T', gene: 'CYP2C9', consequence: 'missense_variant', tag: 'Pharmacogenomics' },
	{ chromosome: '1', position: 155234657, ref: 'G', alt: 'A', gene: 'CYP1A2', consequence: 'intron_variant', tag: 'Pharmacogenomics' }
];

const formatVariantId = (chromosome: string, position: number, ref: string, alt: string) =>
	`chr${chromosome}-${position}-${ref}-${alt}`;

const impactForConsequence = (consequence: string) => {
	if (consequence === 'stop_gained') return 'HR';
	if (consequence === 'missense_variant' || consequence === 'splice_region_variant') return 'MR';
	return 'LR';
};

const classForAlleles = (ref: string, alt: string) => {
	if (ref.length === 1 && alt.length === 1) return 'SNV';
	return ref.length < alt.length ? 'INS' : 'DEL';
};

export const createSeedData = () => {
	const stateRows: StateRow[] = featureStates.map((entry, index) => {
		const regionalWeight =
			entry.region === 'Southeast' ? 1.8 : entry.region === 'South' ? 1.15 : entry.region === 'Center-West' ? 0.95 : entry.region === 'Northeast' ? 1.05 : 0.85;
		const samples = Math.max(18, Math.round((42 + (index % 9) * 14) * regionalWeight));
		const individuals = samples;
		const individualsMale = Math.floor(individuals * (0.48 + ((index % 5) - 2) * 0.01));
		const individualsFemale = individuals - individualsMale;
		const wgsSamples = Math.max(1, Math.floor(individuals * 0.72));
		const snpSamples = Math.max(1, Math.floor(individuals * 0.21));
		const singleCellSamples = Math.max(0, individuals - wgsSamples - snpSamples);
		const volumeGb = individuals * 46 + index * 39;
		const fastqGb = Math.round(volumeGb * 0.55);
		const bamGb = Math.round(volumeGb * 0.41);
		const vcfGb = volumeGb - fastqGb - bamGb;
		const genes = 5400 + individuals * 18 + index * 52;
		const proteinCoding = Math.floor(genes * 0.34);
		const lncRna = Math.floor(genes * 0.28);
		const processedPseudogene = Math.floor(genes * 0.11);
		const unprocessedPseudogene = Math.floor(genes * 0.08);
		const otherGenes = genes - proteinCoding - lncRna - processedPseudogene - unprocessedPseudogene;
		const variantsTotal = individuals * 42000 + index * 17013;
		const commonVariants = Math.floor(variantsTotal * 0.44);
		const lowFrequencyVariants = Math.floor(variantsTotal * 0.19);
		const rareVariants = Math.floor(variantsTotal * 0.17);
		const otherVariants = variantsTotal - commonVariants - lowFrequencyVariants - rareVariants;
		const population = 1_000_000 + index * 311_000 + Math.round(regionalWeight * 800_000);
		const populationMale = Math.floor(population * 0.49);
		const populationFemale = population - populationMale;
		const areaKm2 = 35_000 + index * 11_700;

		return {
			code: entry.code,
			name: entry.name,
			region: entry.region,
			samples,
			areaKm2,
			population,
			populationMale,
			populationFemale,
			individuals,
			individualsMale,
			individualsFemale,
			wgsSamples,
			snpSamples,
			singleCellSamples,
			volumeGb,
			fastqGb,
			bamGb,
			vcfGb,
			genes,
			proteinCoding,
			lncRna,
			processedPseudogene,
			unprocessedPseudogene,
			otherGenes,
			variants: variantsTotal,
			commonVariants,
			lowFrequencyVariants,
			rareVariants,
			otherVariants
		};
	});

	const stateAnnotationRows: StateAnnotationRow[] = stateRows.flatMap((entry) =>
		annotationPool.map((annotation, index) => ({
			stateCode: entry.code,
			rank: index + 1,
			annotation
		}))
	);

	const variantRows: VariantRow[] = [];
	const variantConsequenceRows: VariantConsequenceRow[] = [];
	const variantSubjectRows: VariantSubjectRow[] = [];
	const project = 'BIPMed-Brazil-v1';
	let runningIndex = 0;

	for (const [stateIndex, entry] of stateRows.entries()) {
		for (let j = 0; j < 120; j += 1) {
			const seedIndex = runningIndex++;
			const chromosome = String((seedIndex % 22) + 1);
			const position = 90_000_000 + stateIndex * 2_000_000 + j * 1_379 + (stateIndex % 3) * 97;
			const ref = j % 11 === 0 ? 'GT' : j % 9 === 0 ? 'C' : j % 5 === 0 ? 'T' : 'G';
			const alt = j % 11 === 0 ? 'G' : j % 9 === 0 ? 'CT' : j % 5 === 0 ? 'A' : 'C';
			const gene = genePool[(stateIndex * 17 + j) % genePool.length];
			const consequence = consequencePool[(stateIndex + j) % consequencePool.length];
			const impact = impactForConsequence(consequence);
			const id = formatVariantId(chromosome, position, ref, alt);
			const an = Math.max(128, entry.individuals * 2 + 200 + (j % 11) * 4);
			const acBase = Math.max(1, ((j * 17 + stateIndex * 13) % Math.max(4, Math.floor(an * 0.42))));
			const ac = consequence === 'stop_gained' ? Math.max(1, Math.floor(acBase / 5)) : acBase;
			const alleleFrequency = ac / an;
			const subjectCount = Math.max(1, Math.min(entry.individuals, Math.floor(ac / 2) + (j % 4)));
			const variantClass = classForAlleles(ref, alt);
			const tag = tagPool[(j + stateIndex) % tagPool.length];
			const dbSnp = `rs${371554528 + seedIndex}`;
			const heterozygote = Math.max(1, Math.floor(subjectCount * 0.72));
			const homozygoteAlternative = Math.max(0, Math.floor(subjectCount * 0.08));
			const homozygoteOther = Math.max(0, Math.min(3, Math.floor(subjectCount * 0.03) + (j % 2)));
			const homozygoteReference = Math.max(0, entry.individuals - heterozygote - homozygoteAlternative - homozygoteOther);

			variantRows.push({
				id,
				project,
				stateCode: entry.code,
				chromosome,
				position,
				ref,
				alt,
				dnaChange: id,
				variantClass,
				consequence,
				alleleFrequency,
				ac,
				an,
				geneCount: 1 + ((j + stateIndex) % 4),
				impact,
				dbSnp,
				genotypeQuality: -1,
				gene,
				subjectCount,
				tag,
				functionalImpactGene: consequence === 'intron_variant' ? 'N/A' : gene,
				functionalImpactVep: impact,
				heterozygote,
				homozygoteAlternative,
				homozygoteReference,
				homozygoteOther
			});

			const consequenceRows = 3 + (j % 5);
			for (let k = 0; k < consequenceRows; k += 1) {
				variantConsequenceRows.push({
					variantId: id,
					gene: k % 3 === 2 ? `${gene}-AS${(k % 4) + 1}` : gene,
					ensemblGene: `ENSG${String(152078 + (seedIndex % 10000) + k).padStart(11, '0')}`,
					consequence: k % 3 === 1 && consequence === 'intron_variant' ? 'intron_variant&non_coding_transcript_variant' : consequence,
					impact,
					canonical: k === 0 ? '1' : '0',
					strand: k % 2 === 0 ? '+' : '-',
					transcript: `ENST${String(370203 + seedIndex * 3 + k).padStart(11, '0')}.${(k % 9) + 1}`
				});
			}

			const subjectRows = 1 + (j % 3);
			for (let k = 0; k < subjectRows; k += 1) {
				variantSubjectRows.push({
					variantId: id,
					subjectId: `${entry.code}_${String((seedIndex + k) % Math.max(entry.individuals, 50)).padStart(4, '0')}`,
					ethnicity: ethnicityPool[(seedIndex + k) % ethnicityPool.length],
					state: entry.name,
					center: centerPool[(stateIndex + k) % centerPool.length],
					project
				});
			}
		}
	}

	for (const [index, special] of seededSpecialVariants.entries()) {
		const stateCode = ['SP', 'RJ', 'MG', 'ES'][index % 4];
		const state = stateRows.find((entry) => entry.code === stateCode)!;
		const id = formatVariantId(special.chromosome, special.position, special.ref, special.alt);
		variantRows[index] = {
			id,
			project,
			stateCode,
			chromosome: special.chromosome,
			position: special.position,
			ref: special.ref,
			alt: special.alt,
			dnaChange: id,
			variantClass: classForAlleles(special.ref, special.alt),
			consequence: special.consequence,
			alleleFrequency: 0.119 - index * 0.01,
			ac: 331 - index * 51,
			an: state.individuals * 2 + 200,
			geneCount: 1,
			impact: impactForConsequence(special.consequence),
			dbSnp: index === 0 ? 'rs429358' : `rs${80357065 + index}`,
			genotypeQuality: -1,
			gene: special.gene,
			subjectCount: 241 - index * 40,
			tag: special.tag,
			functionalImpactGene: special.gene,
			functionalImpactVep: impactForConsequence(special.consequence),
			heterozygote: 110 - index * 15,
			homozygoteAlternative: 18 - index * 3,
			homozygoteReference: state.individuals - 130 + index * 12,
			homozygoteOther: 2 + (index % 3)
		};
	}

	return {
		states: stateRows,
		stateAnnotations: stateAnnotationRows,
		variants: variantRows,
		variantConsequences: variantConsequenceRows,
		variantSubjects: variantSubjectRows
	};
};
