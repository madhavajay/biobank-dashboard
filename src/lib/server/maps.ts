import { mapLegend } from '$lib/data/biobank';
import geoText from '$lib/data/brazil-states.geojson?raw';

type GeoFeature = {
	id?: string;
	geometry: {
		type: 'Polygon' | 'MultiPolygon';
		coordinates: number[][][][] | number[][][];
	};
	properties?: Record<string, unknown>;
};

const brazilGeo = JSON.parse(geoText) as {
	features: GeoFeature[];
};

const flattenRings = (feature: GeoFeature): number[][][] => {
	if (feature.geometry.type === 'Polygon') {
		return feature.geometry.coordinates as number[][][];
	}

	return (feature.geometry.coordinates as number[][][][]).flat();
};

const collectBounds = (features: GeoFeature[]) => {
	let minLon = Infinity;
	let maxLon = -Infinity;
	let minLat = Infinity;
	let maxLat = -Infinity;

	for (const feature of features) {
		for (const ring of flattenRings(feature)) {
			for (const [lon, lat] of ring) {
				minLon = Math.min(minLon, lon);
				maxLon = Math.max(maxLon, lon);
				minLat = Math.min(minLat, lat);
				maxLat = Math.max(maxLat, lat);
			}
		}
	}

	return { minLon, maxLon, minLat, maxLat };
};

const createProjector = (features: GeoFeature[], width: number, height: number, padding: number) => {
	const bounds = collectBounds(features);
	const lonSpan = bounds.maxLon - bounds.minLon;
	const latSpan = bounds.maxLat - bounds.minLat;
	const scale = Math.min((width - padding * 2) / lonSpan, (height - padding * 2) / latSpan);
	const xOffset = (width - lonSpan * scale) / 2;
	const yOffset = (height - latSpan * scale) / 2;

	return ([lon, lat]: number[]) => ({
		x: xOffset + (lon - bounds.minLon) * scale,
		y: yOffset + (bounds.maxLat - lat) * scale
	});
};

const collectProjectedBounds = (
	features: GeoFeature[],
	project: (point: number[]) => { x: number; y: number }
) => {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	for (const feature of features) {
		for (const ring of flattenRings(feature)) {
			for (const point of ring) {
				const projected = project(point);
				minX = Math.min(minX, projected.x);
				maxX = Math.max(maxX, projected.x);
				minY = Math.min(minY, projected.y);
				maxY = Math.max(maxY, projected.y);
			}
		}
	}

	return { minX, maxX, minY, maxY };
};

const ringToPath = (ring: number[][], project: (point: number[]) => { x: number; y: number }) =>
	ring
		.map(([lon, lat], index) => {
			const point = project([lon, lat]);
			const x = point.x.toFixed(2);
			const y = point.y.toFixed(2);
			return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
		})
		.join(' ') + ' Z';

const featureToPath = (feature: GeoFeature, project: (point: number[]) => { x: number; y: number }) =>
	flattenRings(feature)
		.map((ring) => ringToPath(ring, project))
		.join(' ');

const getFill = (samples: number) => {
	if (samples <= 0) return mapLegend[0].color;
	if (samples <= 100) return mapLegend[1].color;
	if (samples <= 200) return mapLegend[2].color;
	if (samples <= 300) return mapLegend[3].color;
	if (samples <= 400) return mapLegend[4].color;
	if (samples <= 500) return mapLegend[5].color;
	return mapLegend[6].color;
};

export const renderBrazilMapSvg = (
	states: Array<{
		code: string;
		name: string;
		region: string;
		samples: number;
		individuals: number;
		variants: number;
	}>
) => {
	const width = 600;
	const height = 620;
	const padding = 24;
	const project = createProjector(brazilGeo.features, width, height, padding);
	const bounds = collectProjectedBounds(brazilGeo.features, project);
	const cropPadding = 6;
	const stateMap = new Map(states.map((entry) => [entry.code.toUpperCase(), entry]));

	const paths = brazilGeo.features
		.map((feature) => {
			const code = String(feature.properties?.SIGLA ?? feature.id ?? '');
			const name = String(feature.properties?.Estado ?? code);
			const summary = stateMap.get(code.toUpperCase());
			const fill = getFill(summary?.samples ?? 0);
			const d = featureToPath(feature, project);

			return `<g aria-label="${name}" data-state-code="${code}" data-state-name="${name}" data-state-region="${summary?.region ?? ''}" data-state-samples="${summary?.samples ?? 0}" data-state-individuals="${summary?.individuals ?? 0}" data-state-variants="${summary?.variants ?? 0}"><path d="${d}" fill="${fill}" stroke="#46627c" stroke-width="1.2"><title>${name}: ${summary?.samples ?? 0} samples</title></path></g>`;
		})
		.join('');

	return `<svg viewBox="${(bounds.minX - cropPadding).toFixed(2)} ${(bounds.minY - cropPadding).toFixed(2)} ${(
		bounds.maxX - bounds.minX + cropPadding * 2
	).toFixed(2)} ${(bounds.maxY - bounds.minY + cropPadding * 2).toFixed(2)}" preserveAspectRatio="xMidYMin meet" role="img" aria-label="Brazil map by state" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
};
