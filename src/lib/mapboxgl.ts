import mapboxgl from 'mapbox-gl'
import mapboxWorkerUrl from 'mapbox-gl/dist/mapbox-gl-csp-worker.js?url'

export const key = Symbol('mapbox')

mapboxgl.accessToken =
	'pk.eyJ1Ijoia2VlbGFuam9yZGFuIiwiYSI6ImNtcWd5cDM3ZTA0emUycHNnb3JucmgwdDkifQ.ycaW_8e4TyKhAy-aikzXbw'

if (!import.meta.env.DEV) {
	mapboxgl.workerUrl = mapboxWorkerUrl
}

export { mapboxgl }
