// Pruebas de la hora de retiro (horaRetiro.ts). NO usan la base ni la IA.
//
// Cómo correrlas (desde la carpeta carnicom-app):
//   node --experimental-strip-types scripts/probar-hora.mjs
//
// Si algún día la hora vuelve a fallar: primero agregar el caso que falló a la
// lista de abajo, correr esto y verlo fallar, arreglar horaRetiro.ts, y volver a
// correr TODO (así un arreglo nuevo no rompe uno viejo). Ver el Patrón 6 del
// manual de arreglos (docs/bot-manual-de-arreglos.md).
import { extraerHora as E, resolverHora as R, formatearRetiro as F } from "../src/lib/horaRetiro.ts";
const semana = { cerrado:false, turnos:[[480,780],[1020,1230]] };
const agenda = (fecha) => { const d = new Date(fecha+"T12:00:00Z").getUTCDay(); return d===0 ? {cerrado:true,turnos:[]} : semana; };
const sinAgenda = () => null;
// ahora en AR: jueves 25/09/2026 19:39  (22:39 UTC)
const jue1939 = new Date("2026-09-25T22:39:00Z");
const jue1318 = new Date("2026-09-24T16:18:00Z"); // miércoles 24 13:18
const sab1900 = new Date("2026-09-26T22:00:00Z");   // sábado 19:00
const ar = (i)=>{const d=new Date(new Date(i).getTime()-3*3600e3);return `${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`};
const caso=(t,esperando,ahora,ag)=>{const l=E(t,{esperandoHora:esperando}); if(!l) return null; const r=R(l,ahora,ag); return r.tipo==="hora"?`H ${ar(r.iso)}`:`P ${ar(r.iso)} | ${r.mensaje}`;};
const c=[
 // del log real
 ["Tenés todo eso? Quiero que sea para las 10 AM", false, jue1939, agenda, "P 26 10:00"],
 ["10 dije", true, jue1939, agenda, "H 26 10:00"],
 ["10", true, jue1939, agenda, "H 26 10:00"],
 ["10.", true, jue1318, agenda, "H 25 10:00"],
 ["tipo 19", true, jue1318, agenda, "H 24 19:00"],
 ["19", true, jue1318, agenda, "H 24 19:00"],
 ["a las 7", false, jue1318, agenda, "H 24 19:00"],
 ["19:30", false, jue1318, agenda, "H 24 19:30"],
 ["19hs", false, jue1318, agenda, "H 24 19:00"],
 ["mañana a las 10", false, jue1318, agenda, "H 25 10:00"],
 ["a las 10 de la mañana", false, jue1318, agenda, "P 25 10:00"],
 ["8 y media", true, jue1318, agenda, "H 24 20:30"],
 ["tipo 7 de la tarde", false, jue1318, agenda, "H 24 19:00"],
 ["siete", true, jue1318, agenda, "H 24 19:00"],
 ["paso a las 18", false, jue1318, agenda, "H 24 18:00"],
 ["a las 22", false, jue1318, agenda, "P 24 20:30"],
 ["en media hora", false, jue1318, agenda, "P 24 17:00"],
 ["el lunes a las 10", false, sab1900, agenda, "H 28 10:00"],
 ["mañana a las 10", false, sab1900, agenda, "P 28 10:00"], // domingo cerrado
 ["10", true, jue1939, sinAgenda, "H 25 22:00"],
 // no son horas
 ["2 kilos de vacío", false, jue1318, agenda, null],
 ["4 choris", true, jue1318, agenda, null],
 ["Roast beef, escribí mal", true, jue1318, agenda, null],
 ["una molleja", true, jue1318, agenda, null],
 ["somos 8", true, jue1318, agenda, null],
 ["2 kilos de asado para las 7", false, jue1318, agenda, "H 24 19:00"],
];
let f = 0;
for(const [t,e,a,g,esp] of c){const got=caso(t,e,a,g); const ok = esp===null ? got===null : (got && got.startsWith(esp)); if(!ok){console.log("FALLA",JSON.stringify(t),"->",got,"| esperaba",esp);f++;}}
console.log(F(new Date("2026-09-26T13:00:00Z"), jue1939), "|", F(new Date("2026-09-25T22:00:00Z"), jue1939));
console.log(f===0?`OK ${c.length}`:`${f} fallas`);
if (f > 0) process.exit(1);
