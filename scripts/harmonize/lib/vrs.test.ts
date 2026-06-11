import { snvToVrs } from './vrs';
const r = snvToVrs({ code: 5, pos: 80656489, ref: 'C', alt: 'T' })!;
console.log('vrsId      :', r.vrsId);
console.log('expected   : ga4gh:VA.ebezGL6HoAhtGJyVnB_mE5BH18ntKev4');
console.log('loc digest :', (r.allele.location as any).digest);
console.log('expected   : JiLRuuyS5wefF_6-Vw7m3Yoqqb2YFkss');
const ok = r.vrsId === 'ga4gh:VA.ebezGL6HoAhtGJyVnB_mE5BH18ntKev4'
  && (r.allele.location as any).digest === 'JiLRuuyS5wefF_6-Vw7m3Yoqqb2YFkss';
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
