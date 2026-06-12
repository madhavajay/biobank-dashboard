(function (global) {
	'use strict';

	const currentScript = typeof document !== 'undefined' ? document.currentScript : null;
	const moduleUrl = currentScript?.src ? new URL('clinvar.mjs', currentScript.src).href : './clinvar.mjs';

	global.ClinvarReady = import(moduleUrl).then((mod) => {
		global.Clinvar = {
			ClinvarClient: mod.ClinvarClient,
			ClinvarError: mod.ClinvarError,
			normalizeSummaryRows: mod.normalizeSummaryRows,
			normalizeSummaryRow: mod.normalizeSummaryRow
		};
		return global.Clinvar;
	});
})(globalThis);
