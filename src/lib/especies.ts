// ============================================================
// Las tres especies, y en qué se diferencian de verdad
// ============================================================
//
// Ver `docs/pollo-y-cerdo-diseno.md`. Esto es el descriptor que hace que un
// solo motor (`lotes.ts`) alcance para las tres, en vez de tres archivos casi
// iguales. Un `flujoPollo.ts` clon de `flujoMediaRes.ts` es exactamente la
// duplicación que ya produjo un bug feo: dos lugares decidiendo lo mismo y uno
// decidiendo mal (ver `docs/bot-manual-de-arreglos.md`, Patrón 1).
//
// LA DIFERENCIA QUE ORDENA TODO: el vacuno es la única especie cuya tabla de
// rendimiento CREA stock.
//
//   - Vacuno: existe el INAC, una tabla institucional coherente que cubre el
//     66,65 % de la media res. Con eso se armó un perfil de 28 cortes que
//     cierra al 100 %, y despostar produce 28 piezas de golpe: pesarlas todas
//     sería un ritual administrativo que se abandona a las tres semanas.
//   - Cerdo: las dos únicas fuentes discrepan 1,89× justo en jamón y paleta,
//     que entre los dos son el 47,4 % de la canal. Y ninguna tiene cabeza,
//     patitas ni cuerito, que sí vienen en la media res argentina. Entonces no
//     se carga ninguna tabla: se pesa al despostar, que sobre 42 kg son ~12
//     piezas una o dos veces por semana.
//   - Pollo: no existe ninguna tabla publicada en la base correcta. Hay UNA
//     medición real (ver migración 0027) y se usa para PRECARGAR el formulario
//     de trozado, no para crear stock.

export type Especie = "vacuno" | "porcino" | "aviar";

export type CategoriaAnimal = "novillo" | "novillito" | "vaquillona" | "vaca" | "ternera";

export type DescriptorEspecie = {
  especie: Especie;
  etiqueta: string;
  emoji: string;
  /** Cómo llega: colgada (media res) o en un cajón cerrado. */
  unidadEntrada: "media_res" | "cajon";
  /** Qué hay que preguntarle al carnicero. En el cajón el peso ya se sabe. */
  datoQueSePregunta: "kilos" | "cabezas";
  /** Peso fijo del formato, si lo tiene. El cajón de pollo siempre pesa lo mismo. */
  pesoFijoKgPorDefecto: number | null;
  /** 'tabla' explota el lote en piezas; 'desposte_pesado' lo abre vacío. */
  modoCarga: "tabla" | "desposte_pesado";
  /** Producto que nace al cargar el lote, cuando el lote son N unidades iguales. */
  codigoProductoUnidad: string | null;
  /** Días de vida útil por defecto. NULL = no verificado, y no se inventa. */
  vidaUtilDiasPorDefecto: number | null;
  /** Reserva sobre lo estimado. 0 cuando las piezas nacen pesadas. */
  reservaSeguridadPct: number;
  /** Última barrera antes de crear piezas: un peso fuera de rango se pregunta. */
  rangoPesoKg: [number, number];
  /** Idem para las cabezas del cajón. */
  rangoUnidades: [number, number] | null;
  categorias: readonly string[];
};

export const ESPECIES: Record<Especie, DescriptorEspecie> = {
  vacuno: {
    especie: "vacuno",
    etiqueta: "media res",
    emoji: "🥩",
    unidadEntrada: "media_res",
    datoQueSePregunta: "kilos",
    pesoFijoKgPorDefecto: null,
    modoCarga: "tabla",
    codigoProductoUnidad: null,
    // Hasta 3 semanas a -1 °C según la FAO, pero el vacuno venía funcionando
    // sin vencimiento y no se le cambia el comportamiento en esta migración.
    vidaUtilDiasPorDefecto: null,
    reservaSeguridadPct: 15,
    rangoPesoKg: [40, 250],
    rangoUnidades: null,
    categorias: ["novillo", "novillito", "vaquillona", "vaca", "ternera"],
  },

  porcino: {
    especie: "porcino",
    etiqueta: "media res de cerdo",
    emoji: "🐷",
    unidadEntrada: "media_res",
    datoQueSePregunta: "kilos",
    pesoFijoKgPorDefecto: null,
    // Sin tabla: las dos fuentes que existen discrepan 1,89× en los dos cortes
    // más grandes. Las piezas nacen cuando el carnicero las pesa.
    modoCarga: "desposte_pesado",
    codigoProductoUnidad: null,
    // [SIN DATO] el CAA no tiene un artículo de temperatura específico para
    // carne porcina fresca como el 256 para aves. No se inventa un número.
    vidaUtilDiasPorDefecto: null,
    reservaSeguridadPct: 0,
    // Peso promedio de la res porcina argentina: 95 kg/cabeza (MAGyP 2025), o
    // sea ~47,5 kg la media res. Las fuentes comerciales dan 40-45 kg. El rango
    // es ancho a propósito, pero descarta que "42" sea en realidad una media
    // res vacuna mal entendida.
    rangoPesoKg: [20, 70],
    rangoUnidades: null,
    categorias: ["capon"],
  },

  aviar: {
    especie: "aviar",
    etiqueta: "cajón de pollo",
    emoji: "🐔",
    unidadEntrada: "cajon",
    // Lo que se pregunta son las CABEZAS. El peso del cajón es dato: 20 kg.
    // Es exactamente al revés que la media res, y es el motivo por el que el
    // flujo de voz no puede ser el mismo.
    datoQueSePregunta: "cabezas",
    pesoFijoKgPorDefecto: 20,
    modoCarga: "desposte_pesado",
    codigoProductoUnidad: "pollo_entero",
    // 4 a 6 días a 4 °C; se toma el extremo bajo por la misma asimetría que
    // fijó el vendible del novillo en 70 %.
    vidaUtilDiasPorDefecto: 4,
    // 8 % y no 15 %: el peso del ave no sale de una tabla de porcentajes sino
    // de dividir un peso conocido (20 ÷ N). El error posible es que el ave pese
    // 1,90 en vez de 2,00, o sea 5 %. Los 15 % del vacuno cubren la
    // incertidumbre de una tabla entera, que es otro problema.
    // [SIN DATO] la dispersión real dentro de un cajón. Si el piloto muestra
    // que es más ancha, se sube este número y listo.
    reservaSeguridadPct: 8,
    rangoPesoKg: [5, 40],
    rangoUnidades: [4, 16],
    categorias: [],
  },
};

export function descriptor(especie: Especie): DescriptorEspecie {
  return ESPECIES[especie];
}

/** Las categorías válidas de una especie. Vacío = esa especie no usa categorías. */
export function categoriasDe(especie: Especie): readonly string[] {
  return ESPECIES[especie].categorias;
}

export function esCategoriaValida(especie: Especie, categoria: string | null): boolean {
  const validas = categoriasDe(especie);
  if (validas.length === 0) return categoria === null;
  if (categoria === null) return especie !== "vacuno";
  return validas.includes(categoria);
}

/** Cómo se nombra a la especie en un mensaje al carnicero. */
export function nombreDeEspecie(especie: Especie): string {
  return ESPECIES[especie].etiqueta;
}
