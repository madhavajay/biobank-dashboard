<script lang="ts">
	import { ExternalLink } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Tabs from '$lib/components/ui/tabs';

	let { data } = $props<{
		data: {
			variant: {
				id: string;
				project: string;
				stateCode: string;
				tag: string;
				variantClass: string;
				consequence: string;
				functionalImpactGene: string;
				functionalImpactVep: string;
				populationAlleleFrequency: string;
				populationAlleleCount: string;
				populationAlleleNumber: string;
				subjectCount: number;
				heterozygote: string;
				homozygoteAlternative: string;
				homozygoteReference: string;
				homozygoteOther: string;
				genotypeQuality: number;
				gene: string;
				rsid: string;
				externalReferences: Array<{ label: string; value: string; url: string | null }>;
			};
			consequenceRows: Array<{ gene: string; ensemblGene: string; consequence: string; impact: string; canonical: string; strand: string; transcript: string }>;
			subjectRows: Array<{ subjectId: string; ethnicity: string; state: string; center: string; project: string }>;
			distributionSummary: {
				carrierSubjects: number;
				statesRepresented: number;
				centersRepresented: number;
				topEthnicity: string;
				topState: string;
				carrierRate: string;
			};
			consequenceSummary: {
				totalRows: number;
				canonicalRows: number;
				transcripts: number;
				genes: number;
			};
			genomeBrowserSummary: {
				locus: string;
				chromosome: string;
				position: number;
				reference: string;
				alternate: string;
				ucscUrl: string;
				dbSnpUrl: string;
			};
		};
	}>();

	const summaryRows = () => [
		['DNA Change', data.variant.id],
		['Project', data.variant.project],
		['Variant Class', data.variant.variantClass],
		['Consequence', data.variant.consequence],
		['Functional Impact', `GENE: ${data.variant.functionalImpactGene} · VEP: ${data.variant.functionalImpactVep}`],
		['Population Allele Frequency', data.variant.populationAlleleFrequency],
		['Population Allele Count', data.variant.populationAlleleCount],
		['Population Allele Number', data.variant.populationAlleleNumber],
		['Heterozygote', data.variant.heterozygote],
		['Homozygote Alternative', data.variant.homozygoteAlternative],
		['Homozygote Reference', data.variant.homozygoteReference],
		['Homozygote Other', data.variant.homozygoteOther],
		['Genotype Quality', String(data.variant.genotypeQuality)],
		['Subjects', data.variant.subjectCount.toLocaleString()]
	] as const;
	const summaryColumns = () => {
		const rows = summaryRows();
		const midpoint = Math.ceil(rows.length / 2);
		return [rows.slice(0, midpoint), rows.slice(midpoint)] as const;
	};

	const formatSummaryValue = (label: string, value: string) => {
		if (label === 'Functional Impact') return `GENE: ${data.variant.functionalImpactGene} · VEP: ${data.variant.functionalImpactVep}`;
		return value;
	};

	const impactVariant = (impact: string) => {
		if (impact === 'HIGH') return 'destructive';
		if (impact === 'MR') return 'secondary';
		return 'outline';
	};
</script>

<svelte:head>
	<title>{data.variant.id} | Variant</title>
</svelte:head>

<section class="flex flex-col gap-6 pt-2 sm:pt-3">
	<div class="space-y-4">
		<Breadcrumb.Root>
			<Breadcrumb.List class="text-[13px] text-muted-foreground">
				<Breadcrumb.Item><Breadcrumb.Link href="/">Home</Breadcrumb.Link></Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item><Breadcrumb.Link href="/explorer">Exploration</Breadcrumb.Link></Breadcrumb.Item>
				<Breadcrumb.Separator />
				<Breadcrumb.Item><Breadcrumb.Page>{data.variant.id}</Breadcrumb.Page></Breadcrumb.Item>
			</Breadcrumb.List>
		</Breadcrumb.Root>
		<div class="space-y-2">
			<h1 class="font-heading text-3xl leading-none tracking-[-0.06em] text-foreground sm:text-[3.45rem]">{data.variant.id}</h1>
			<p class="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
				Summary, consequence evidence, subject rows, and external reference lookups.
			</p>
		</div>
	</div>

	<div class="space-y-4">
			<Card.Root class="border-border/70 bg-white/76 shadow-[0_12px_28px_rgba(22,52,79,0.06)] ring-1 ring-[#d6e4ea] backdrop-blur-sm">
				<Card.Header class="border-b border-border/60 px-5 py-4">
					<div class="space-y-1">
						<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Summary</p>
						<Card.Title class="text-2xl tracking-[-0.05em]">Variant overview</Card.Title>
					</div>
				</Card.Header>
				<Card.Content class="px-5 pb-5 pt-4">
					<div class="grid gap-4 lg:grid-cols-2">
						{#each summaryColumns() as column}
							<div class="space-y-3">
								{#each column as [label, value]}
									<div class="rounded-2xl border border-[#e1eaee] bg-[#f7fafb] px-4 py-4 ring-1 ring-[#edf3f6]">
										<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
										<div class="mt-2 text-sm font-medium text-foreground">
											{#if label === 'Variant Class'}
												<Badge variant="outline" class="rounded-md px-2 py-0 text-[10px]">{value}</Badge>
											{:else if label === 'Consequence'}
												{value.replaceAll('_', ' ')}
											{:else}
												{formatSummaryValue(label, value)}
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root class="border-border/70 bg-white/76 shadow-[0_12px_28px_rgba(22,52,79,0.06)] ring-1 ring-[#d6e4ea] backdrop-blur-sm">
				<Card.Content class="p-0">
				<Tabs.Root value="consequence" class="p-4 sm:p-5">
					<Tabs.List class="variant-tabs mb-4 grid w-full grid-cols-3 rounded-none border-b bg-transparent p-0" variant="default">
						<Tabs.Trigger value="consequence" class="rounded-none border-b-2 border-transparent px-3 py-3 text-[11px] tracking-[0.14em] uppercase data-[state=active]:border-primary data-[state=active]:bg-transparent">
							Consequence
						</Tabs.Trigger>
						<Tabs.Trigger value="distribution" class="rounded-none border-b-2 border-transparent px-3 py-3 text-[11px] tracking-[0.14em] uppercase data-[state=active]:border-primary data-[state=active]:bg-transparent">
							Distribution
						</Tabs.Trigger>
						<Tabs.Trigger value="references" class="rounded-none border-b-2 border-transparent px-3 py-3 text-[11px] tracking-[0.14em] uppercase data-[state=active]:border-primary data-[state=active]:bg-transparent">
							References
						</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content value="consequence">
						<Card.Root class="border-0 bg-transparent shadow-none ring-0">
							<Card.Header class="px-0 pt-0">
								<div class="space-y-1">
									<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Consequence</p>
									<Card.Title class="text-2xl tracking-[-0.05em]">
										Showing 1 - {data.consequenceRows.length} of {data.consequenceRows.length}
									</Card.Title>
									<Card.Description>
										{data.consequenceSummary.transcripts} transcripts across {data.consequenceSummary.genes} genes, with {data.consequenceSummary.canonicalRows} canonical consequence rows.
									</Card.Description>
								</div>
							</Card.Header>
							<Card.Content class="px-0 pb-0">
							<div class="overflow-x-auto">
								<Table.Root class="min-w-[920px] text-sm">
									<Table.Header>
										<Table.Row class="bg-transparent hover:bg-transparent">
											<Table.Head class="h-9 w-12 text-[11px] tracking-[0.12em] uppercase">#</Table.Head>
											<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Gene</Table.Head>
											<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Ensembl Gene</Table.Head>
											<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Consequence</Table.Head>
											<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Impact</Table.Head>
											<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Canonical</Table.Head>
											<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Strand</Table.Head>
											<Table.Head class="h-9 text-[11px] tracking-[0.12em] uppercase">Transcript</Table.Head>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each data.consequenceRows as row, index}
											<Table.Row>
												<Table.Cell class="py-2 text-xs text-muted-foreground">{index + 1}</Table.Cell>
												<Table.Cell class="py-2 font-medium">{row.gene}</Table.Cell>
												<Table.Cell class="py-2 font-mono text-[13px] text-muted-foreground">{row.ensemblGene}</Table.Cell>
												<Table.Cell class="py-2 text-[13px] text-muted-foreground">{row.consequence.replaceAll('_', ' ')}</Table.Cell>
												<Table.Cell class="py-2"><Badge variant={impactVariant(row.impact)} class="rounded-full px-2 py-0 text-[10px]">{row.impact}</Badge></Table.Cell>
												<Table.Cell class="py-2">
													{#if row.canonical === '1'}
														<Badge variant="secondary" class="rounded-full px-2 py-0 text-[10px]">Canonical</Badge>
													{:else}
														<span class="text-xs text-muted-foreground">No</span>
													{/if}
												</Table.Cell>
												<Table.Cell class="py-2 text-[13px] text-muted-foreground">{row.strand}</Table.Cell>
												<Table.Cell class="py-2 font-mono text-[13px] text-foreground">{row.transcript}</Table.Cell>
											</Table.Row>
										{/each}
									</Table.Body>
								</Table.Root>
							</div>
							</Card.Content>
						</Card.Root>
					</Tabs.Content>

					<Tabs.Content value="distribution">
						<Card.Root class="border-0 bg-transparent shadow-none ring-0">
							<Card.Header class="px-0 pt-0">
								<div class="space-y-1">
									<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Distribution</p>
									<Card.Title class="text-2xl tracking-[-0.05em]">Carrier profile and locus context</Card.Title>
								</div>
							</Card.Header>
							<Card.Content class="space-y-4 px-0 pb-0">
							<div class="space-y-5">
								<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									{#each [
										['Carrier subjects', data.distributionSummary.carrierSubjects.toLocaleString()],
										['Carrier rate', data.distributionSummary.carrierRate],
										['States represented', data.distributionSummary.statesRepresented.toLocaleString()],
										['Centers represented', data.distributionSummary.centersRepresented.toLocaleString()],
										['Top ethnicity', data.distributionSummary.topEthnicity],
										['Top state', data.distributionSummary.topState]
									] as [label, value]}
										<div class="rounded-2xl border border-border/60 bg-white/70 px-4 py-4 ring-1 ring-[#edf3f6]">
											<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
											<p class="mt-2 text-lg font-medium text-foreground">{value}</p>
										</div>
									{/each}
								</div>

								<div class="grid gap-3 sm:grid-cols-2">
									<div class="rounded-2xl border border-border/60 bg-white/70 px-4 py-4 ring-1 ring-[#edf3f6]">
										<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Genomic locus</p>
										<p class="mt-2 text-lg font-medium text-foreground">{data.genomeBrowserSummary.locus}</p>
										<p class="mt-2 text-sm text-muted-foreground">
											chr{data.genomeBrowserSummary.chromosome} · {data.genomeBrowserSummary.reference}>{data.genomeBrowserSummary.alternate}
										</p>
									</div>
									<div class="rounded-2xl border border-border/60 bg-white/70 px-4 py-4 ring-1 ring-[#edf3f6]">
										<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Genome browser links</p>
										<div class="mt-3 flex flex-wrap gap-2">
											<Button href={data.genomeBrowserSummary.ucscUrl} target="_blank" rel="noreferrer" variant="outline" size="sm" class="rounded-full">
												UCSC
											</Button>
											<Button href={data.genomeBrowserSummary.dbSnpUrl} target="_blank" rel="noreferrer" variant="outline" size="sm" class="rounded-full">
												dbSNP
											</Button>
										</div>
									</div>
								</div>
							</div>
							</Card.Content>
						</Card.Root>
					</Tabs.Content>

					<Tabs.Content value="references">
						<Card.Root class="border-0 bg-transparent shadow-none ring-0">
							<Card.Header class="px-0 pt-0">
								<div class="space-y-1">
									<p class="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">External reference</p>
									<Card.Title class="text-2xl tracking-[-0.05em]">Reference links</Card.Title>
								</div>
							</Card.Header>
							<Card.Content class="px-0 pb-0 pt-3">
								<div class="px-0 pb-0">
										<table class="w-full min-w-[280px] border-separate border-spacing-0 text-sm">
											<tbody>
												{#each data.variant.externalReferences as reference, index}
													<tr class={index % 2 === 0 ? 'bg-[#f4f7f8]' : 'bg-transparent'}>
														<th class="border-y border-[#e1eaee] px-4 py-3 text-left text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
															{reference.label}
														</th>
														<td class="border-y border-[#e1eaee] px-4 py-3 text-sm font-medium">
														{#if reference.url}
															<a
																href={reference.url}
																target="_blank"
																rel="noreferrer"
																class="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
															>
																{reference.value}
																<ExternalLink class="size-3.5 opacity-70" />
															</a>
														{:else}
																<span class="text-foreground">{reference.value}</span>
															{/if}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
								</div>
							</Card.Content>
						</Card.Root>
					</Tabs.Content>
				</Tabs.Root>
				</Card.Content>
			</Card.Root>
	</div>
</section>
