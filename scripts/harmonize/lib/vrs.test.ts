import { jcsCanonicalize, snvToVrs } from './vrs';
const r = snvToVrs({ code: 5, pos: 80656489, ref: 'C', alt: 'T' })!;
console.log('vrsId      :', r.vrsId);
console.log('expected   : ga4gh:VA.ebezGL6HoAhtGJyVnB_mE5BH18ntKev4');
console.log('loc digest :', (r.allele.location as any).digest);
console.log('expected   : JiLRuuyS5wefF_6-Vw7m3Yoqqb2YFkss');

const canonical = jcsCanonicalize({
	z: [3, { b: true, a: 'x\\ny' }],
	a: 1.5,
	m: null
});
console.log('canonical  :', canonical);
console.log('expected   : {"a":1.5,"m":null,"z":[3,{"a":"x\\\\ny","b":true}]}');

let rejectsNonFinite = false;
try {
	jcsCanonicalize({ bad: Number.NaN });
} catch {
	rejectsNonFinite = true;
}

const ok =
	r.vrsId === 'ga4gh:VA.ebezGL6HoAhtGJyVnB_mE5BH18ntKev4' &&
	(r.allele.location as any).digest === 'JiLRuuyS5wefF_6-Vw7m3Yoqqb2YFkss' &&
	canonical === '{"a":1.5,"m":null,"z":[3,{"a":"x\\\\ny","b":true}]}' &&
	rejectsNonFinite;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
