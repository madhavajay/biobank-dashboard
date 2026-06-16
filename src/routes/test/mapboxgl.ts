import mapboxgl from 'mapbox-gl';
import { env } from '$env/dynamic/public';

export const key = Symbol('mapbox');

mapboxgl.accessToken = env.PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

export { mapboxgl };
