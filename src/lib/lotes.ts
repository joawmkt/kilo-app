import { getSupabaseAdmin } from "./supabaseAdmin";
import { descriptor, type CategoriaAnimal, type Especie } from "./especies";

// ============================================================
// El motor de lotes — vacuno, cerdo y pollo con un solo código
// ============================================================
//
// Ver `docs/pollo-y-cerdo-diseno.md` y `docs/media-res-diseno-final.md`. Las
// reglas que el código tiene que cumplir sí o sí:
//
// 1. UN LOTE NO SUMA KILOS: LOS TRANSFORMA. Entra una pieza grande (o un cajón)
//    de peso conocido y salen cortes, presas, hueso, grasa y merma. El balance
//    cierra contra el peso de entrada, siempre, porque el descuadre es la línea
//    que lo hace cerrar.
//
// 2. EL STOCK SON PIEZAS Y LOS KILOS VIVEN ADENTRO DE CADA PIEZA. Nunca se
//    guarda "kilos de peceto" en ningún lado: se suman las piezas.
//
// 3. `productos.stock_actual` ES UN CACHE de esa suma, y es lo único que lee el
//    bot. Toda función de acá que toque piezas llama a `recalcularStock`.
//
// 4. UN PESO REAL REEMPLAZA AL ESTIMADO, NUNCA SE SUMA.
//
// 5. TROZAR PARA UN PEDIDO NO ES TROZAR PARA LA VITRINA. El primero consume una
//    pieza y no crea ninguna (las presas se van con el cliente); el segundo
//    cierra piezas y crea otras. Confundirlos duplica el stock.
//
// Este archivo REEMPLAZA a `mediaRes.ts`, que quedó como un envoltorio fino
// para no romper a quien lo importa. No se clonó: se generalizó.

export type { CategoriaAnimal, Especie };

export type ResultadoLote =
  | {
      ok: true;
      loteId: string;
      piezas: number;
      kgVendibles: number;
      mensaje: string;
      /** true si el lote quedó abierto esperando que alguien pese el desposte. */
      esperaDesposte: boolean;
    }
  | { ok: false; mensaje: string };

type FilaRendimiento = {
  producto_id: string;
  pct_central: number;
  productos: { nombre_display: string; codigo: string } | null;
};

// ============================================================
// Cargar un lote
// ============================================================

export type ParamsCargarLote = {
  carniceriaId: string;
  especie: Especie;
  categoria?: CategoriaAnimal | string | null;
  /** Peso de entrada. En el cajón de pollo viene del formato, no del carnicero. */
  pesoRecibidoKg: number;
  /** Cabezas del cajón. Solo para las especies que entran por unidades. */
  unidades?: number | null;
  pesoFacturadoKg?: number | null;
  proveedor?: string | null;
  remito?: string | null;
  costoMercaderia?: number | null;
  costoFlete?: number | null;
};

/**
 * Registra la entrada de un lote. Según la especie hace una de tres cosas:
 *
 *   - VACUNO: busca la tabla de rendimiento vigente y explota el lote en piezas
 *     estimadas. Es el único caso donde una tabla crea stock.
 *   - CERDO: abre el lote vacío. Las piezas nacen cuando el carnicero desposta
 *     y pesa (`despostarLote`), porque no hay ninguna tabla confiable que
 *     cargar y una inventada sería peor que ninguna.
 *   - POLLO: crea N piezas iguales de pollo entero, una por cabeza del cajón.
 *     No hace falta tabla: el proveedor ya entrega cada ave envuelta aparte.
 */
export async function cargarLote(params: ParamsCargarLote): Promise<ResultadoLote> {
  const { especie, pesoRecibidoKg } = params;
  const desc = descriptor(especie);

  if (!(pesoRecibidoKg > 0)) {
    return { ok: false, mensaje: "El peso tiene que ser mayor que cero." };
  }

  if (desc.modoCarga === "tabla") {
    return await cargarLoteConTabla(params);
  }
  if (desc.unidadEntrada === "cajon") {
    return await cargarLoteDeUnidades(params);
  }
  return await cargarLoteParaDespostar(params);
}

// ------------------------------------------------------------
// Vacuno: la tabla crea las piezas
// ------------------------------------------------------------

async function cargarLoteConTabla(params: ParamsCargarLote): Promise<ResultadoLote> {
  const { carniceriaId, especie, pesoRecibidoKg } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const categoria = (params.categoria ?? null) as string | null;

  let consulta = supabaseAdmin
    .from("tablas_rendimiento")
    .select("id, pct_hueso, pct_grasa, pct_merma")
    .eq("carniceria_id", carniceriaId)
    .eq("especie", especie)
    .eq("uso", "explota_lote")
    .is("vigente_hasta", null);

  consulta = categoria === null ? consulta.is("categoria", null) : consulta.eq("categoria", categoria);

  const { data: tabla } = await consulta
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tabla) {
    return {
      ok: false,
      mensaje: `Todavía no hay una tabla de rendimiento cargada para ${categoria ?? especie}. Sin eso no puedo repartir los kilos en cortes.`,
    };
  }

  const { data: cortes } = await supabaseAdmin
    .from("rendimiento_cortes")
    .select("producto_id, pct_central, productos(nombre_display, codigo)")
    .eq("tabla_id", tabla.id);

  const filas = (cortes ?? []) as unknown as FilaRendimiento[];
  if (filas.length === 0) {
    return { ok: false, mensaje: "La tabla de rendimiento está vacía." };
  }

  const loteId = await crearRecepcion({ ...params, tablaId: tabla.id as string, modoCarga: "tabla" });
  if (!loteId) return { ok: false, mensaje: "Tuve un problema técnico registrando el lote." };

  // Una pieza por corte y no "N kilos sueltos" porque es la realidad física:
  // cada media res trae un peceto, un lomo, un matambre.
  const vencimientos = await vencimientosDeProductos(
    filas.map((f) => f.producto_id),
    especie
  );

  let kgVendibles = 0;
  const piezas: Record<string, unknown>[] = [];

  for (const fila of filas) {
    const kg = redondear(pesoRecibidoKg * (Number(fila.pct_central) / 100), 3);
    if (kg <= 0) continue;
    kgVendibles += kg;
    piezas.push({
      carniceria_id: carniceriaId,
      producto_id: fila.producto_id,
      recepcion_lote_id: loteId,
      kg_iniciales: kg,
      kg_restantes: kg,
      confianza: "estimado",
      es_subproducto: false,
      estado: "disponible",
      vence_at: vencimientos.get(fila.producto_id) ?? null,
    });
  }

  const { data: piezasCreadas, error: errorPiezas } = await getSupabaseAdmin()
    .from("piezas_stock")
    .insert(piezas)
    .select("id, producto_id, kg_iniciales");

  if (errorPiezas) {
    console.error("Error creando las piezas del lote", errorPiezas);
    await supabaseAdmin.from("recepciones_lote").delete().eq("id", loteId);
    return { ok: false, mensaje: "Tuve un problema técnico repartiendo los cortes." };
  }

  await supabaseAdmin.from("movimientos_stock").insert(
    (piezasCreadas ?? []).map((p) => ({
      carniceria_id: carniceriaId,
      pieza_id: p.id as string,
      recepcion_lote_id: loteId,
      tipo: "entrada",
      kg: Number(p.kg_iniciales),
      causa: "Explosión del lote según la tabla de rendimiento",
    }))
  );

  // Hueso, grasa y merma salen ahora y no al final: el rendimiento ya los
  // descontó, esos kilos nunca fueron carne vendible. Registrarlos recién al
  // cerrar haría que el balance no cerrara en todo el medio.
  const subproductos = [
    { tipo: "hueso", pct: Number(tabla.pct_hueso), causa: "Hueso del desposte" },
    { tipo: "grasa", pct: Number(tabla.pct_grasa), causa: "Grasa de cobertura" },
    { tipo: "merma_frio", pct: Number(tabla.pct_merma), causa: "Merma de frío y proceso (estimada)" },
  ];

  await supabaseAdmin.from("movimientos_stock").insert(
    subproductos
      .filter((s) => s.pct > 0)
      .map((s) => ({
        carniceria_id: carniceriaId,
        pieza_id: null,
        recepcion_lote_id: loteId,
        tipo: s.tipo,
        kg: redondear(pesoRecibidoKg * (s.pct / 100), 3),
        causa: s.causa,
      }))
  );

  await recalcularStockDeLote(loteId);

  return {
    ok: true,
    loteId,
    piezas: piezasCreadas?.length ?? 0,
    kgVendibles: redondear(kgVendibles, 2),
    esperaDesposte: false,
    mensaje:
      `Anotado: ${descriptor(especie).etiqueta} de ${pesoRecibidoKg} kg. ` +
      `Te cargué ${piezasCreadas?.length ?? 0} cortes estimados (${redondear(kgVendibles, 1)} kg vendibles).`,
  };
}

// ------------------------------------------------------------
// Cerdo: el lote se abre vacío y espera la balanza
// ------------------------------------------------------------

async function cargarLoteParaDespostar(params: ParamsCargarLote): Promise<ResultadoLote> {
  const loteId = await crearRecepcion({ ...params, tablaId: null, modoCarga: "desposte_pesado" });
  if (!loteId) return { ok: false, mensaje: "Tuve un problema técnico registrando el lote." };

  return {
    ok: true,
    loteId,
    piezas: 0,
    kgVendibles: 0,
    esperaDesposte: true,
    mensaje:
      `Anotado: ${descriptor(params.especie).etiqueta} de ${params.pesoRecibidoKg} kg. ` +
      `Cuando la despostes, decime los pesos y te armo el stock.`,
  };
}

// ------------------------------------------------------------
// Pollo: N piezas iguales, una por cabeza
// ------------------------------------------------------------

async function cargarLoteDeUnidades(params: ParamsCargarLote): Promise<ResultadoLote> {
  const { carniceriaId, especie, pesoRecibidoKg } = params;
  const desc = descriptor(especie);
  const supabaseAdmin = getSupabaseAdmin();

  const unidades = Math.floor(params.unidades ?? 0);
  if (!(unidades > 0)) {
    return { ok: false, mensaje: "Me falta saber cuántas unidades trae el cajón." };
  }

  const codigo = desc.codigoProductoUnidad;
  if (!codigo) return { ok: false, mensaje: "Esa especie no tiene producto de unidad configurado." };

  const { data: producto } = await supabaseAdmin
    .from("productos")
    .select("id, vida_util_dias")
    .eq("carniceria_id", carniceriaId)
    .eq("codigo", codigo)
    .maybeSingle();

  if (!producto) {
    return { ok: false, mensaje: `No encontré el producto "${codigo}" en tu catálogo.` };
  }

  const loteId = await crearRecepcion({ ...params, tablaId: null, modoCarga: "desposte_pesado" });
  if (!loteId) return { ok: false, mensaje: "Tuve un problema técnico registrando el cajón." };

  // El peso de cada ave sale de una DIVISIÓN de un peso conocido, no de una
  // tabla de porcentajes. Por eso nace como 'estimado' pero con una reserva
  // mucho más chica (8 % y no 15 %), y la primera venta la reemplaza por el
  // peso real de la balanza del mostrador.
  const kgPorUnidad = redondear(pesoRecibidoKg / unidades, 3);
  const vence = vencimientoDesde(Number(producto.vida_util_dias ?? desc.vidaUtilDiasPorDefecto ?? 0));

  const piezas = Array.from({ length: unidades }, () => ({
    carniceria_id: carniceriaId,
    producto_id: producto.id as string,
    recepcion_lote_id: loteId,
    kg_iniciales: kgPorUnidad,
    kg_restantes: kgPorUnidad,
    confianza: "estimado",
    es_subproducto: false,
    estado: "disponible",
    vence_at: vence,
  }));

  const { data: piezasCreadas, error } = await supabaseAdmin
    .from("piezas_stock")
    .insert(piezas)
    .select("id, kg_iniciales");

  if (error) {
    console.error("Error creando las piezas del cajón", error);
    await supabaseAdmin.from("recepciones_lote").delete().eq("id", loteId);
    return { ok: false, mensaje: "Tuve un problema técnico cargando el cajón." };
  }

  await supabaseAdmin.from("movimientos_stock").insert(
    (piezasCreadas ?? []).map((p) => ({
      carniceria_id: carniceriaId,
      pieza_id: p.id as string,
      recepcion_lote_id: loteId,
      tipo: "entrada",
      kg: Number(p.kg_iniciales),
      causa: `Cajón de ${unidades} cabezas: ${kgPorUnidad} kg por unidad`,
    }))
  );

  await recalcularStock(producto.id as string);

  return {
    ok: true,
    loteId,
    piezas: piezasCreadas?.length ?? 0,
    kgVendibles: redondear(pesoRecibidoKg, 2),
    esperaDesposte: false,
    mensaje:
      `Anotado: cajón de ${pesoRecibidoKg} kg con ${unidades} unidades ` +
      `(${kgPorUnidad} kg cada una).`,
  };
}

async function crearRecepcion(
  params: ParamsCargarLote & { tablaId: string | null; modoCarga: "tabla" | "desposte_pesado" }
): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("recepciones_lote")
    .insert({
      carniceria_id: params.carniceriaId,
      especie: params.especie,
      categoria: params.categoria ?? null,
      modo_carga: params.modoCarga,
      unidades: params.unidades ?? null,
      proveedor: params.proveedor ?? null,
      remito: params.remito ?? null,
      peso_recibido_kg: params.pesoRecibidoKg,
      peso_facturado_kg: params.pesoFacturadoKg ?? null,
      costo_mercaderia: params.costoMercaderia ?? null,
      costo_flete: params.costoFlete ?? null,
      tabla_rendimiento_id: params.tablaId,
      estado: "abierta",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Error creando la recepción del lote", error);
    return null;
  }
  return data.id as string;
}

// ============================================================
// Despostar un lote pesando
// ============================================================

export type SalidaPesada = {
  /** Código del producto en el catálogo de esa carnicería. */
  codigo: string;
  kg: number;
  /** Hueso, grasa, cuerito, patitas, cabeza: entran al stock pero no al mostrador. */
  esSubproducto?: boolean;
  /**
   * true si el peso lo calculó el sistema (con la tabla) y no salió de la
   * balanza. La pieza nace 'estimado' y la primera venta con peso real la
   * corrige. Ver `estimarTrozado`.
   */
  estimado?: boolean;
};

/**
 * El desposte pesado: las piezas nacen con el peso de la balanza.
 *
 * Es el camino normal de cerdo y el que llena el stock cuando no hay tabla.
 * Las piezas nacen con `confianza: 'pesado'`, así que NO llevan reserva de
 * seguridad: el número es real.
 *
 * Y estas pesadas son el activo: repetidas 10-20 veces SON la tabla de
 * rendimiento de esa carnicería, con `origen = 'calibrado'` desde el día uno en
 * vez de 'referencia'.
 */
export async function despostarLote(params: {
  carniceriaId: string;
  loteId: string;
  salidas: SalidaPesada[];
}): Promise<{ ok: boolean; mensaje: string; piezas: number; kg: number }> {
  const { carniceriaId, loteId, salidas } = params;
  const supabaseAdmin = getSupabaseAdmin();

  const { data: lote } = await supabaseAdmin
    .from("recepciones_lote")
    .select("id, especie, peso_recibido_kg, estado")
    .eq("id", loteId)
    .eq("carniceria_id", carniceriaId)
    .maybeSingle();

  if (!lote) return { ok: false, mensaje: "No encontré ese lote.", piezas: 0, kg: 0 };
  if (lote.estado === "cerrada") {
    return { ok: false, mensaje: "Ese lote ya está cerrado.", piezas: 0, kg: 0 };
  }

  const codigos = salidas.map((s) => s.codigo);
  const { data: productos } = await supabaseAdmin
    .from("productos")
    .select("id, codigo, vida_util_dias")
    .eq("carniceria_id", carniceriaId)
    .in("codigo", codigos);

  const porCodigo = new Map(
    (productos ?? []).map((p) => [p.codigo as string, p as { id: string; vida_util_dias: number | null }])
  );

  const faltantes = codigos.filter((c) => !porCodigo.has(c));
  if (faltantes.length > 0) {
    return {
      ok: false,
      mensaje: `No encontré estos productos en tu catálogo: ${faltantes.join(", ")}.`,
      piezas: 0,
      kg: 0,
    };
  }

  // ------------------------------------------------------------
  // El desposte puede ser en partes, pero nunca más que la media res
  // ------------------------------------------------------------
  //
  // Pedido del fundador (21/09): despostar de a un corte ("hoy saqué el
  // matambre, 2,5 kg") tiene que (1) sumar el matambre al stock, (2) dejar
  // 47 kg por despostar de esa media res y (3) sacar el matambre de las
  // opciones de ESA media res. Las tres cosas salen de mirar qué piezas ya
  // nacieron de este lote.
  //
  // Esto también es la barrera física: de una media res de 49 kg no pueden
  // salir 60 kg de cortes. Se da un 2 % de margen por la balanza.
  const { data: previas } = await supabaseAdmin
    .from("piezas_stock")
    .select("kg_iniciales, productos!inner(codigo)")
    .eq("recepcion_lote_id", loteId);

  const filasPrevias = (previas ?? []) as unknown as { kg_iniciales: number; productos: { codigo: string } }[];
  const yaDespostado = filasPrevias.reduce((suma, p) => suma + Number(p.kg_iniciales), 0);
  const codigosPrevios = new Set(filasPrevias.map((p) => p.productos.codigo));

  const repetidos = salidas.filter((s) => s.kg > 0 && codigosPrevios.has(s.codigo)).map((s) => s.codigo);
  if (repetidos.length > 0) {
    return {
      ok: false,
      mensaje: `De esta media res ya cargaste: ${repetidos.join(", ")}. Si te equivocaste de peso, corregilo desde el stock.`,
      piezas: 0,
      kg: 0,
    };
  }

  const kgNuevos = salidas.reduce((suma, s) => suma + (s.kg > 0 ? s.kg : 0), 0);
  const entrada = Number(lote.peso_recibido_kg);
  if (yaDespostado + kgNuevos > entrada * 1.02) {
    const quedan = redondear(Math.max(0, entrada - yaDespostado), 2);
    return {
      ok: false,
      mensaje: `Eso suma ${redondear(kgNuevos, 2)} kg y a esta media res le quedan ${quedan} kg por despostar. Revisá los pesos.`,
      piezas: 0,
      kg: 0,
    };
  }

  const desc = descriptor(lote.especie as Especie);
  const piezas = salidas
    .filter((s) => s.kg > 0)
    .map((s) => {
      const producto = porCodigo.get(s.codigo)!;
      return {
        carniceria_id: carniceriaId,
        producto_id: producto.id,
        recepcion_lote_id: loteId,
        kg_iniciales: redondear(s.kg, 3),
        kg_restantes: redondear(s.kg, 3),
        confianza: "pesado",
        es_subproducto: s.esSubproducto ?? false,
        estado: "disponible",
        vence_at: vencimientoDesde(
          Number(producto.vida_util_dias ?? desc.vidaUtilDiasPorDefecto ?? 0)
        ),
      };
    });

  if (piezas.length === 0) {
    return { ok: false, mensaje: "No me pasaste ningún peso.", piezas: 0, kg: 0 };
  }

  const { data: creadas, error } = await supabaseAdmin
    .from("piezas_stock")
    .insert(piezas)
    .select("id, producto_id, kg_iniciales");

  if (error) {
    console.error("Error creando las piezas del desposte", error);
    return { ok: false, mensaje: "Tuve un problema técnico guardando el desposte.", piezas: 0, kg: 0 };
  }

  await supabaseAdmin.from("movimientos_stock").insert(
    (creadas ?? []).map((p) => ({
      carniceria_id: carniceriaId,
      pieza_id: p.id as string,
      recepcion_lote_id: loteId,
      tipo: "entrada",
      kg: Number(p.kg_iniciales),
      causa: "Desposte pesado",
    }))
  );

  await recalcularStockDeLote(loteId);

  const kgTotal = redondear(
    (creadas ?? []).reduce((suma, p) => suma + Number(p.kg_iniciales), 0),
    2
  );

  const quedan = redondear(Math.max(0, entrada - yaDespostado - kgTotal), 2);
  return {
    ok: true,
    mensaje:
      `Cargué ${creadas?.length ?? 0} ${creadas?.length === 1 ? "corte" : "cortes"} (${kgTotal} kg) al stock. ` +
      (quedan > 0
        ? `A esta media res le quedan ${quedan} kg por despostar.`
        : "Esta media res ya quedó despostada entera."),
    piezas: creadas?.length ?? 0,
    kg: kgTotal,
  };
}

/**
 * "Terminé de despostar": lo que no se pesó de la media res es hueso y merma.
 *
 * Se anota como merma (no como descuadre) porque el carnicero lo está
 * diciendo: no es plata que falta sin explicación, es lo que no se vende.
 * Recién ahí se cierra el lote y desaparece de la lista de desposte.
 */
export async function terminarDesposte(params: {
  carniceriaId: string;
  loteId: string;
}): Promise<{ ok: boolean; mensaje: string }> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: lote } = await supabaseAdmin
    .from("recepciones_lote")
    .select("id, peso_recibido_kg, estado")
    .eq("id", params.loteId)
    .eq("carniceria_id", params.carniceriaId)
    .maybeSingle();

  if (!lote) return { ok: false, mensaje: "No encontré ese lote." };
  if (lote.estado === "cerrada") return { ok: false, mensaje: "Ese lote ya estaba cerrado." };

  const { data: piezas } = await supabaseAdmin
    .from("piezas_stock")
    .select("kg_iniciales")
    .eq("recepcion_lote_id", params.loteId);

  const despostado = (piezas ?? []).reduce((suma, p) => suma + Number(p.kg_iniciales), 0);
  const resto = redondear(Number(lote.peso_recibido_kg) - despostado, 3);

  if (resto > 0) {
    await supabaseAdmin.from("movimientos_stock").insert({
      carniceria_id: params.carniceriaId,
      pieza_id: null,
      recepcion_lote_id: params.loteId,
      tipo: "merma_frio",
      kg: resto,
      causa: "Lo que no se pesó al terminar el desposte (hueso, grasa y merma)",
    });
  }

  const cierre = await cerrarLote({ carniceriaId: params.carniceriaId, loteId: params.loteId });
  if (!cierre.ok) return cierre;

  return {
    ok: true,
    mensaje:
      resto > 0
        ? `Listo, la cerré. Pesaste ${redondear(despostado, 2)} kg y ${redondear(resto, 2)} kg quedaron como hueso y merma.`
        : "Listo, la cerré.",
  };
}

// ============================================================
// El trozado
// ============================================================

export type PrecargaTrozado = {
  codigo: string;
  nombre: string;
  kgSugeridos: number;
  pctCentral: number;
};

/**
 * Qué le va a salir al carnicero si troza N unidades, según su historial.
 *
 * ESTO NO CREA STOCK: precarga el formulario. Si la tabla creara las piezas, un
 * trozado mal estimado metería presas fantasma en la vitrina; precargando, el
 * peor caso es que el carnicero corrija un número. Y cada corrección suya es
 * una medición nueva que reemplaza a la de referencia.
 */
export async function precargaDeTrozado(params: {
  carniceriaId: string;
  especie: Especie;
  unidades: number;
  kgPorUnidad?: number | null;
}): Promise<{ kgEntrada: number; salidas: PrecargaTrozado[] } | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: tabla } = await supabaseAdmin
    .from("tablas_rendimiento")
    .select("id")
    .eq("carniceria_id", params.carniceriaId)
    .eq("especie", params.especie)
    .eq("uso", "precarga_trozado")
    .is("vigente_hasta", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tabla) return null;

  let kgPorUnidad = params.kgPorUnidad ?? null;
  if (kgPorUnidad === null) {
    // El peso real promedio de las piezas que hay: después del segundo cajón
    // esto es mejor dato que cualquier tabla, porque sale de la balanza.
    const codigo = descriptor(params.especie).codigoProductoUnidad;
    if (codigo) {
      const { data: piezas } = await supabaseAdmin
        .from("piezas_stock")
        .select("kg_iniciales, productos!inner(codigo)")
        .eq("carniceria_id", params.carniceriaId)
        .eq("productos.codigo", codigo)
        .eq("estado", "disponible")
        .limit(50);
      const lista = (piezas ?? []) as unknown as { kg_iniciales: number }[];
      if (lista.length > 0) {
        kgPorUnidad = redondear(
          lista.reduce((s, p) => s + Number(p.kg_iniciales), 0) / lista.length,
          3
        );
      }
    }
  }

  const kgEntrada = redondear(params.unidades * (kgPorUnidad ?? 0), 3);
  if (!(kgEntrada > 0)) return null;

  const { data: cortes } = await supabaseAdmin
    .from("rendimiento_cortes")
    .select("pct_central, productos(codigo, nombre_display, alias_display)")
    .eq("tabla_id", tabla.id);

  const filas = (cortes ?? []) as unknown as {
    pct_central: number;
    productos: { codigo: string; nombre_display: string; alias_display: string | null } | null;
  }[];

  const salidas = filas
    .filter((f) => f.productos !== null)
    .map((f) => ({
      codigo: f.productos!.codigo,
      nombre: f.productos!.alias_display ?? f.productos!.nombre_display,
      pctCentral: Number(f.pct_central),
      kgSugeridos: redondear(kgEntrada * (Number(f.pct_central) / 100), 3),
    }))
    .sort((a, b) => b.kgSugeridos - a.kgSugeridos);

  return { kgEntrada, salidas };
}

// ============================================================
// Trozar con UNA pesada: el resto se calcula
// ============================================================
//
// Pedido del fundador (22/09/2026), con el cálculo explicado por él:
//
//   "Trocé 3 pollos y saqué 2,700 de pechuga."
//   3 pollos = 6 pechugas -> 2,700 / 6 = 450 g cada pechuga.
//   Con ese peso y la tabla, se estiman las otras presas. Y se carga TODO,
//   porque cada vez que se troza un pollo se separan todas las partes (aunque
//   el cliente buscara solo una), y todas quedan en la vitrina.
//
// Cómo se hace la cuenta, en castellano: la tabla dice qué porcentaje del pollo
// es cada presa (pechuga 28,75 %, pata y muslo 40,5 %...). Si la pechuga real
// pesó 2,7 kg y es el 28,75 %, cada "punto de tabla" vale 2,7 / 28,75. Con eso,
// la pata y muslo es 40,5 puntos, las alitas 14,87, y así. Si pesó más de una
// presa, se usan todas las pesadas (mejor dato). Si no pesó ninguna, se parte
// del peso de los pollos.
//
// Y un tope: nunca puede salir más de lo que entró. Si la cuenta se pasa (la
// pechuga de ESTOS pollos salió más grande que la de la tabla), se achican las
// presas estimadas — nunca las pesadas, que son reales.
//
// Las pesadas nacen 'pesado'; las calculadas nacen 'estimado', y la primera
// venta con balanza las corrige. Es el mismo criterio que la media res vacuna.

/** Cuántas de cada presa trae UN ave. Es anatomía, no un dato de negocio. */
export const UNIDADES_POR_AVE: Record<string, number> = {
  pechuga_desosada: 2,
  pata_y_muslo: 2,
  alitas: 2,
  pata: 2,
  muslo: 2,
};

export type SalidaEstimada = { codigo: string; nombre: string; kg: number; estimado: boolean };

export type EstimacionTrozado =
  | {
      ok: true;
      unidades: number;
      kgEntrada: number;
      salidas: SalidaEstimada[];
      mermaKg: number;
      /** Si la pesada no cierra con el peso de los pollos, se avisa (no se frena). */
      aviso?: string;
    }
  | { ok: false; mensaje: string };

export async function estimarTrozado(params: {
  carniceriaId: string;
  especie: Especie;
  unidades: number;
  pesadas: { codigo: string; kg: number }[];
  /** Si el carnicero dijo cuánto pesaba cada pollo, manda sobre el stock. */
  kgPorUnidadDicho?: number | null;
}): Promise<EstimacionTrozado> {
  const { carniceriaId, especie, unidades, pesadas, kgPorUnidadDicho } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const desc = descriptor(especie);
  const codigoOrigen = desc.codigoProductoUnidad;
  if (!codigoOrigen) return { ok: false, mensaje: "Esa especie no se troza por unidades." };

  const { data: origen } = await supabaseAdmin
    .from("productos")
    .select("id")
    .eq("carniceria_id", carniceriaId)
    .eq("codigo", codigoOrigen)
    .maybeSingle();
  if (!origen) return { ok: false, mensaje: `No encontré "${codigoOrigen}" en tu catálogo.` };

  // Los mismos pollos que después va a trozar `trozar` (FEFO).
  const { data: piezas } = await supabaseAdmin
    .from("piezas_stock")
    .select("kg_restantes")
    .eq("carniceria_id", carniceriaId)
    .eq("producto_id", origen.id)
    .eq("estado", "disponible")
    .gt("kg_restantes", 0)
    .order("vence_at", { ascending: true, nullsFirst: false })
    .order("ingresada_at", { ascending: true })
    .limit(unidades);

  const enStock = (piezas ?? []).length;
  if (enStock < unidades) {
    return {
      ok: false,
      mensaje:
        enStock === 0
          ? "No tengo pollos enteros en stock para trozar. ¿Cargaste el cajón?"
          : `Tengo ${enStock} ${enStock === 1 ? "pollo entero" : "pollos enteros"} en stock y me dijiste que trozaste ${unidades}. ¿Cuántos fueron?`,
    };
  }

  const kgEntrada = redondear(
    kgPorUnidadDicho && kgPorUnidadDicho > 0
      ? unidades * kgPorUnidadDicho
      : (piezas ?? []).reduce((suma, p) => suma + Number(p.kg_restantes), 0),
    3
  );

  const { data: tabla } = await supabaseAdmin
    .from("tablas_rendimiento")
    .select("id, pct_merma")
    .eq("carniceria_id", carniceriaId)
    .eq("especie", especie)
    .eq("uso", "precarga_trozado")
    .is("vigente_hasta", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tabla) {
    return { ok: false, mensaje: "Todavía no tengo la tabla de trozado del pollo, así que no puedo calcular las presas." };
  }

  const { data: cortes } = await supabaseAdmin
    .from("rendimiento_cortes")
    .select("pct_central, productos(codigo, nombre_display, alias_display)")
    .eq("tabla_id", tabla.id);

  const filas = ((cortes ?? []) as unknown as {
    pct_central: number;
    productos: { codigo: string; nombre_display: string; alias_display: string | null } | null;
  }[])
    .filter((f) => f.productos !== null)
    .map((f) => ({
      codigo: f.productos!.codigo,
      nombre: f.productos!.alias_display ?? f.productos!.nombre_display,
      pct: Number(f.pct_central),
    }));

  const pesadasPorCodigo = new Map(pesadas.filter((p) => p.kg > 0).map((p) => [p.codigo, p.kg]));
  const totalPesado = [...pesadasPorCodigo.values()].reduce((a, b) => a + b, 0);

  if (totalPesado > kgEntrada * 1.02) {
    return {
      ok: false,
      mensaje: `Lo que pesaste suma ${redondear(totalPesado, 2)} kg y los ${unidades} pollos pesaban ${redondear(kgEntrada, 2)} kg. ¿Revisás los pesos?`,
    };
  }

  const disponible = kgEntrada * (1 - Number(tabla.pct_merma ?? 0) / 100);
  const conocidas = filas.filter((f) => pesadasPorCodigo.has(f.codigo));
  const pctConocido = conocidas.reduce((suma, f) => suma + f.pct, 0);
  const pctTotal = filas.reduce((suma, f) => suma + f.pct, 0) || 100;

  // Cuánto vale "un punto de tabla" en ESTE trozado.
  const valorPunto =
    conocidas.length > 0 && pctConocido > 0
      ? conocidas.reduce((suma, f) => suma + pesadasPorCodigo.get(f.codigo)!, 0) / pctConocido
      : disponible / pctTotal;

  const estimadas = filas
    .filter((f) => !pesadasPorCodigo.has(f.codigo))
    .map((f) => ({ ...f, kg: valorPunto * f.pct }));

  // El tope: lo pesado es real; si no entra, se achica lo estimado.
  const sumaEstimada = estimadas.reduce((suma, f) => suma + f.kg, 0);
  const lugar = Math.max(0, disponible - totalPesado);
  const factor = sumaEstimada > lugar && sumaEstimada > 0 ? lugar / sumaEstimada : 1;

  const nombrePorCodigo = new Map(filas.map((f) => [f.codigo, f.nombre]));
  const salidas: SalidaEstimada[] = [
    ...[...pesadasPorCodigo.entries()].map(([codigo, kg]) => ({
      codigo,
      nombre: nombrePorCodigo.get(codigo) ?? codigo,
      kg: redondear(kg, 3),
      estimado: false,
    })),
    ...estimadas
      .map((f) => ({ codigo: f.codigo, nombre: f.nombre, kg: redondear(f.kg * factor, 3), estimado: true }))
      .filter((f) => f.kg > 0)
      .sort((a, b) => b.kg - a.kg),
  ];

  const kgSalida = salidas.reduce((suma, f) => suma + f.kg, 0);

  // Si hubo que achicar mucho las estimadas, la pesada no cierra con lo que el
  // sistema cree que pesaban los pollos: casi seguro los pollos eran más
  // grandes que el promedio del cajón. Se dice, para que lo corrija si quiere.
  const aviso =
    factor < 0.85 && !(kgPorUnidadDicho && kgPorUnidadDicho > 0)
      ? `Ojo: lo que pesaste es mucho para ${unidades} ${unidades === 1 ? "pollo" : "pollos"} de ${redondear(kgEntrada / unidades, 2)} kg. Si eran más grandes, decime cuánto pesaba cada uno y recalculo.`
      : undefined;

  return {
    ok: true,
    unidades,
    kgEntrada,
    salidas,
    mermaKg: redondear(Math.max(0, kgEntrada - kgSalida), 3),
    ...(aviso ? { aviso } : {}),
  };
}

/**
 * Ejecuta un trozado estimado: si el carnicero dijo cuánto pesaba cada pollo,
 * primero se les pone ese peso real a las piezas (reemplaza al estimado, nunca
 * se suma), y después se troza con las presas pesadas y calculadas.
 */
export async function trozarConEstimacion(params: {
  carniceriaId: string;
  especie: Especie;
  unidades: number;
  salidas: SalidaEstimada[];
  kgPorUnidadDicho?: number | null;
}): Promise<{ ok: boolean; mensaje: string }> {
  const { carniceriaId, especie, unidades, salidas, kgPorUnidadDicho } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const codigoOrigen = descriptor(especie).codigoProductoUnidad;

  if (kgPorUnidadDicho && kgPorUnidadDicho > 0 && codigoOrigen) {
    const { data: origen } = await supabaseAdmin
      .from("productos")
      .select("id")
      .eq("carniceria_id", carniceriaId)
      .eq("codigo", codigoOrigen)
      .maybeSingle();
    if (origen) {
      const { data: piezas } = await supabaseAdmin
        .from("piezas_stock")
        .select("id")
        .eq("carniceria_id", carniceriaId)
        .eq("producto_id", origen.id)
        .eq("estado", "disponible")
        .gt("kg_restantes", 0)
        .order("vence_at", { ascending: true, nullsFirst: false })
        .order("ingresada_at", { ascending: true })
        .limit(unidades);
      for (const pieza of piezas ?? []) {
        await pesarPieza({ carniceriaId, piezaId: pieza.id as string, kgReales: kgPorUnidadDicho });
      }
    }
  }

  const resultado = await trozar({
    carniceriaId,
    especie,
    unidades,
    salidas: salidas.map((s) => ({
      codigo: s.codigo,
      kg: s.kg,
      estimado: s.estimado,
      esSubproducto: s.codigo === "piel_de_pollo" || s.codigo === "carcasa_de_pollo",
    })),
  });

  return { ok: resultado.ok, mensaje: resultado.mensaje };
}

// ============================================================
// Cuánto pesa UNA unidad de un producto (para vender por unidad)
// ============================================================
//
// Pedido del fundador (22/09/2026): "que cada corte o pieza se pueda vender
// como unidad también, manejando estimados por unidad". El cliente dice "3
// pata muslo", no "1,5 kg de pata y muslo", y el bot le contestaba "¿me lo
// decís en kilos?".
//
// De dónde sale el peso de una unidad, en este orden (el primero que haya):
//
//   1. El que cargó la carnicería en el catálogo (`peso_aproximado_unidad_kg`).
//      Es el mejor dato: lo puso alguien que pesa esa milanesa todos los días.
//   2. Pollo entero: el peso promedio REAL de los pollos que hay en stock (sale
//      del cajón: 20 kg / cabezas, corregido por cada venta pesada).
//   3. Presas de pollo: el pollo promedio × el % de la presa en la tabla de
//      trozado ÷ cuántas trae cada pollo (2 pechugas, 2 pata y muslo...).
//      "3 pata muslo" de pollos de 2,5 kg = 3 × (2,5 × 40,5 % ÷ 2) ≈ 1,5 kg.
//   4. Nada: se devuelve null y el bot pide el dato en kilos. No se inventa un
//      peso que nadie cargó (regla 1). Se carga una vez en el catálogo y listo.

export type PesoPorUnidad = { kg: number; fuente: "catalogo" | "stock" | "tabla" };

/**
 * Devuelve una función que estima el peso de una unidad de cada producto.
 * Hace las consultas una sola vez por llamada (se reusa en todo el pedido).
 */
export function estimadorPorUnidad(
  carniceriaId: string
): (producto: { id: string; codigo: string; peso_aproximado_unidad_kg: number | null }) => Promise<PesoPorUnidad | null> {
  let polloPromedio: Promise<number | null> | null = null;
  let tablaPollo: Promise<{ merma: number; pct: Map<string, number> } | null> | null = null;

  const pesoDelPollo = () => {
    polloPromedio ??= (async () => {
      const supabaseAdmin = getSupabaseAdmin();
      const codigo = descriptor("aviar").codigoProductoUnidad ?? "pollo_entero";
      const { data } = await supabaseAdmin
        .from("piezas_stock")
        .select("kg_restantes, productos!inner(codigo)")
        .eq("carniceria_id", carniceriaId)
        .eq("productos.codigo", codigo)
        .eq("estado", "disponible")
        .gt("kg_restantes", 0)
        .limit(50);
      const lista = (data ?? []) as unknown as { kg_restantes: number }[];
      if (lista.length > 0) {
        return redondear(lista.reduce((s, p) => s + Number(p.kg_restantes), 0) / lista.length, 3);
      }
      // Sin pollos en stock: el último cajón que entró.
      const { data: cajon } = await supabaseAdmin
        .from("recepciones_lote")
        .select("peso_recibido_kg, unidades")
        .eq("carniceria_id", carniceriaId)
        .eq("especie", "aviar")
        .gt("unidades", 0)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cajon && Number(cajon.unidades) > 0) {
        return redondear(Number(cajon.peso_recibido_kg) / Number(cajon.unidades), 3);
      }
      return null;
    })();
    return polloPromedio;
  };

  const tabla = () => {
    tablaPollo ??= (async () => {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: t } = await supabaseAdmin
        .from("tablas_rendimiento")
        .select("id, pct_merma")
        .eq("carniceria_id", carniceriaId)
        .eq("especie", "aviar")
        .eq("uso", "precarga_trozado")
        .is("vigente_hasta", null)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!t) return null;
      const { data: cortes } = await supabaseAdmin
        .from("rendimiento_cortes")
        .select("pct_central, productos(codigo)")
        .eq("tabla_id", t.id);
      const pct = new Map<string, number>();
      for (const c of (cortes ?? []) as unknown as { pct_central: number; productos: { codigo: string } | null }[]) {
        if (c.productos) pct.set(c.productos.codigo, Number(c.pct_central));
      }
      return { merma: Number(t.pct_merma ?? 0), pct };
    })();
    return tablaPollo;
  };

  return async (producto) => {
    if (producto.peso_aproximado_unidad_kg != null && producto.peso_aproximado_unidad_kg > 0) {
      return { kg: Number(producto.peso_aproximado_unidad_kg), fuente: "catalogo" };
    }

    if (producto.codigo === descriptor("aviar").codigoProductoUnidad) {
      const kg = await pesoDelPollo();
      return kg ? { kg, fuente: "stock" } : null;
    }

    const porAve = UNIDADES_POR_AVE[producto.codigo];
    if (porAve) {
      const [ave, t] = await Promise.all([pesoDelPollo(), tabla()]);
      const pct = t?.pct.get(producto.codigo);
      if (ave && t && pct) {
        return { kg: redondear((ave * (1 - t.merma / 100) * (pct / 100)) / porAve, 3), fuente: "tabla" };
      }
    }

    return null;
  };
}

/**
 * Trozar PARA LA VITRINA: se cierran N piezas enteras y nacen las presas.
 *
 * OJO CON LA DIFERENCIA, que es la que duplica stock si se pierde:
 *   - Trozar para el pedido de alguien NO pasa por acá. Ahí se consume una
 *     pieza y listo: las presas se van con el cliente. Es una venta con la
 *     preparación anotada en el item del pedido.
 *   - Trozar para llenar la vitrina SÍ pasa por acá.
 *
 * Las presas nacen `pesado` porque el carnicero las pesó recién.
 */
export async function trozar(params: {
  carniceriaId: string;
  especie: Especie;
  unidades: number;
  salidas: SalidaPesada[];
}): Promise<{ ok: boolean; mensaje: string; kgEntrada: number; kgSalida: number; merma: number }> {
  const { carniceriaId, especie, unidades, salidas } = params;
  const supabaseAdmin = getSupabaseAdmin();
  const desc = descriptor(especie);

  const codigoOrigen = desc.codigoProductoUnidad;
  if (!codigoOrigen) {
    return { ok: false, mensaje: "Esa especie no se troza por unidades.", kgEntrada: 0, kgSalida: 0, merma: 0 };
  }

  const { data: productoOrigen } = await supabaseAdmin
    .from("productos")
    .select("id")
    .eq("carniceria_id", carniceriaId)
    .eq("codigo", codigoOrigen)
    .maybeSingle();

  if (!productoOrigen) {
    return { ok: false, mensaje: `No encontré "${codigoOrigen}" en tu catálogo.`, kgEntrada: 0, kgSalida: 0, merma: 0 };
  }

  // FEFO: se trozan las que se vencen primero. Es de donde salen los kilos que
  // se degradan por mala rotación.
  const { data: piezasOrigen } = await supabaseAdmin
    .from("piezas_stock")
    .select("id, kg_restantes, recepcion_lote_id")
    .eq("carniceria_id", carniceriaId)
    .eq("producto_id", productoOrigen.id)
    .eq("estado", "disponible")
    .gt("kg_restantes", 0)
    .order("vence_at", { ascending: true, nullsFirst: false })
    .order("ingresada_at", { ascending: true })
    .limit(unidades);

  const aTrozar = piezasOrigen ?? [];
  if (aTrozar.length < unidades) {
    return {
      ok: false,
      mensaje: `Tenés ${aTrozar.length} en stock y me pediste trozar ${unidades}.`,
      kgEntrada: 0,
      kgSalida: 0,
      merma: 0,
    };
  }

  const kgEntrada = redondear(
    aTrozar.reduce((suma, p) => suma + Number(p.kg_restantes), 0),
    3
  );
  const loteId = (aTrozar[0]?.recepcion_lote_id as string | null) ?? null;

  // De 3 pollos (7,5 kg) no pueden salir 14,8 kg de presas. Pasó el 21/09
  // porque el formulario dejaba los números precargados para 6 pollos cuando
  // el carnicero cambió a 3, y esto los aceptaba sin mirar: nacieron 7 kg de
  // presas fantasma en la vitrina. Se chequea ANTES de cerrar ninguna pieza,
  // con un 2 % de margen por la balanza.
  const kgPedidos = redondear(salidas.reduce((suma, s) => suma + (s.kg > 0 ? s.kg : 0), 0), 3);
  if (kgPedidos > kgEntrada * 1.02) {
    return {
      ok: false,
      mensaje: `Las presas suman ${kgPedidos} kg y los ${unidades} pollos que trozaste pesaban ${kgEntrada} kg. Revisá los pesos: no puede salir más de lo que entró.`,
      kgEntrada,
      kgSalida: 0,
      merma: 0,
    };
  }

  // 1. Se cierran las piezas de origen, con su movimiento de salida.
  for (const pieza of aTrozar) {
    await supabaseAdmin
      .from("piezas_stock")
      .update({ kg_restantes: 0, estado: "agotada", agotada_at: new Date().toISOString() })
      .eq("id", pieza.id);

    await supabaseAdmin.from("movimientos_stock").insert({
      carniceria_id: carniceriaId,
      pieza_id: pieza.id as string,
      recepcion_lote_id: pieza.recepcion_lote_id,
      tipo: "trozado",
      kg: Number(pieza.kg_restantes),
      causa: `Trozado para la vitrina: ${unidades} ${codigoOrigen}`,
    });
  }
  await recalcularStock(productoOrigen.id as string);

  // 2. Nacen las presas, pesadas.
  const codigos = salidas.map((s) => s.codigo);
  const { data: productos } = await supabaseAdmin
    .from("productos")
    .select("id, codigo, vida_util_dias")
    .eq("carniceria_id", carniceriaId)
    .in("codigo", codigos);

  const porCodigo = new Map(
    (productos ?? []).map((p) => [p.codigo as string, p as { id: string; vida_util_dias: number | null }])
  );

  const nuevas = salidas
    .filter((s) => s.kg > 0 && porCodigo.has(s.codigo))
    .map((s) => {
      const producto = porCodigo.get(s.codigo)!;
      return {
        carniceria_id: carniceriaId,
        producto_id: producto.id,
        recepcion_lote_id: loteId,
        kg_iniciales: redondear(s.kg, 3),
        kg_restantes: redondear(s.kg, 3),
        confianza: s.estimado ? "estimado" : "pesado",
        es_subproducto: s.esSubproducto ?? false,
        estado: "disponible",
        vence_at: vencimientoDesde(
          Number(producto.vida_util_dias ?? desc.vidaUtilDiasPorDefecto ?? 0)
        ),
      };
    });

  const { data: creadas, error } = await supabaseAdmin
    .from("piezas_stock")
    .insert(nuevas)
    .select("id, producto_id, kg_iniciales");

  if (error) {
    console.error("Error creando las presas del trozado", error);
    return { ok: false, mensaje: "Tuve un problema técnico con el trozado.", kgEntrada, kgSalida: 0, merma: 0 };
  }

  await supabaseAdmin.from("movimientos_stock").insert(
    (creadas ?? []).map((p) => ({
      carniceria_id: carniceriaId,
      pieza_id: p.id as string,
      recepcion_lote_id: loteId,
      tipo: "entrada",
      kg: Number(p.kg_iniciales),
      causa: "Presas del trozado, pesadas",
    }))
  );

  await recalcularStockDeLote(loteId);
  for (const p of creadas ?? []) await recalcularStock(p.producto_id as string);

  const kgSalida = redondear(
    (creadas ?? []).reduce((suma, p) => suma + Number(p.kg_iniciales), 0),
    3
  );
  const merma = redondear(kgEntrada - kgSalida, 3);

  // La diferencia tiene nombre: si se perdieron kilos entre lo que entró y lo
  // que salió, eso es merma de proceso y se registra. No se deja "sobrando".
  if (merma > 0 && loteId) {
    await supabaseAdmin.from("movimientos_stock").insert({
      carniceria_id: carniceriaId,
      pieza_id: null,
      recepcion_lote_id: loteId,
      tipo: "merma_frio",
      kg: merma,
      causa: "Diferencia entre lo que entró al trozado y lo que salió pesado",
    });
  }

  return {
    ok: true,
    mensaje: `Trozaste ${unidades} (${kgEntrada} kg) y salieron ${kgSalida} kg en ${creadas?.length ?? 0} presas.`,
    kgEntrada,
    kgSalida,
    merma,
  };
}

// ============================================================
// Vencimiento
// ============================================================

export type PiezaPorVencer = {
  piezaId: string;
  productoId: string;
  nombre: string;
  kg: number;
  venceAt: string;
  diasRestantes: number;
};

/**
 * Qué se está por pasar.
 *
 * Esto NO es un adorno en pollo: la vida comercial es de 4 a 6 días contra
 * hasta 3 semanas del vacuno, o sea que se degrada entre tres y cinco veces más
 * rápido. Un cajón de 10 pollos que se pasa es la pérdida entera del cajón.
 *
 * Se avisa con DOS DÍAS de anticipación y no el día del vencimiento, porque el
 * día del vencimiento ya no se puede hacer nada con la mercadería.
 */
export async function piezasPorVencer(params: {
  carniceriaId: string;
  dias?: number;
}): Promise<PiezaPorVencer[]> {
  const dias = params.dias ?? 2;
  const limite = new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await getSupabaseAdmin()
    .from("piezas_stock")
    .select("id, producto_id, kg_restantes, vence_at, productos(nombre_display, alias_display)")
    .eq("carniceria_id", params.carniceriaId)
    .eq("estado", "disponible")
    .gt("kg_restantes", 0)
    .not("vence_at", "is", null)
    .lte("vence_at", limite)
    .order("vence_at", { ascending: true });

  const filas = (data ?? []) as unknown as {
    id: string;
    producto_id: string;
    kg_restantes: number;
    vence_at: string;
    productos: { nombre_display: string; alias_display: string | null } | null;
  }[];

  const ahora = Date.now();
  return filas.map((f) => ({
    piezaId: f.id,
    productoId: f.producto_id,
    nombre: f.productos?.alias_display ?? f.productos?.nombre_display ?? "—",
    kg: Number(f.kg_restantes),
    venceAt: f.vence_at,
    diasRestantes: Math.ceil((new Date(f.vence_at).getTime() - ahora) / (24 * 60 * 60 * 1000)),
  }));
}

function vencimientoDesde(dias: number): string | null {
  if (!Number.isFinite(dias) || dias <= 0) return null;
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();
}

async function vencimientosDeProductos(
  productoIds: string[],
  especie: Especie
): Promise<Map<string, string | null>> {
  const porDefecto = descriptor(especie).vidaUtilDiasPorDefecto;
  const { data } = await getSupabaseAdmin()
    .from("productos")
    .select("id, vida_util_dias")
    .in("id", productoIds);

  const mapa = new Map<string, string | null>();
  for (const fila of data ?? []) {
    const dias = fila.vida_util_dias === null ? porDefecto : Number(fila.vida_util_dias);
    mapa.set(fila.id as string, vencimientoDesde(Number(dias ?? 0)));
  }
  return mapa;
}

// ============================================================
// Consumir stock
// ============================================================

/**
 * Descuenta kilos de un producto, gastando primero la pieza que SE VENCE ANTES
 * y, si no hay vencimiento cargado, la más vieja (FEFO).
 *
 * FEFO y no FIFO de compra: importa qué se va a echar a perder antes, no qué se
 * compró antes. Es de donde salen los kilos que se degradan a picada por mala
 * rotación (~$2.400 por animal según la investigación del vacuno).
 */
export async function consumirDeProducto(params: {
  carniceriaId: string;
  productoId: string;
  kg: number;
  tipo?: "venta" | "degradado" | "recorte_picada" | "ajuste";
  causa?: string;
  pedidoId?: string | null;
}): Promise<{ kgConsumidos: number; piezasAgotadas: number }> {
  const { carniceriaId, productoId, kg, tipo = "venta", causa, pedidoId } = params;
  const supabaseAdmin = getSupabaseAdmin();

  // Si el producto tenía stock de antes de las piezas (cargado por audio o a
  // mano, sin pieza), se lo convierte en pieza ANTES de gastar. Sin esto, un
  // producto con 10 kg "viejos" y sin piezas no descontaba nada acá y había
  // que restar por otro camino — que es justo el doble camino que se sacó.
  await asegurarPiezaDeArrastre(carniceriaId, productoId);

  const { data: piezas } = await supabaseAdmin
    .from("piezas_stock")
    .select("id, kg_restantes, recepcion_lote_id")
    .eq("carniceria_id", carniceriaId)
    .eq("producto_id", productoId)
    .eq("estado", "disponible")
    .gt("kg_restantes", 0)
    .order("vence_at", { ascending: true, nullsFirst: false })
    .order("ingresada_at", { ascending: true });

  let pendiente = kg;
  let consumidos = 0;
  let agotadas = 0;

  for (const pieza of piezas ?? []) {
    if (pendiente <= 0) break;

    const disponible = Number(pieza.kg_restantes);
    const aDescontar = Math.min(disponible, pendiente);
    const queda = redondear(disponible - aDescontar, 3);

    await supabaseAdmin
      .from("piezas_stock")
      .update({
        kg_restantes: queda,
        estado: queda <= 0 ? "agotada" : "disponible",
        agotada_at: queda <= 0 ? new Date().toISOString() : null,
      })
      .eq("id", pieza.id);

    await supabaseAdmin.from("movimientos_stock").insert({
      carniceria_id: carniceriaId,
      pieza_id: pieza.id as string,
      recepcion_lote_id: pieza.recepcion_lote_id,
      tipo,
      kg: aDescontar,
      causa: causa ?? null,
      pedido_id: pedidoId ?? null,
    });

    consumidos = redondear(consumidos + aDescontar, 3);
    pendiente = redondear(pendiente - aDescontar, 3);
    if (queda <= 0) agotadas++;
  }

  await recalcularStock(productoId);
  return { kgConsumidos: consumidos, piezasAgotadas: agotadas };
}

/**
 * "Se acabó" — el carnicero avisa que un corte se terminó.
 *
 * **Acá está la calibración sin ritual.** Al cerrar la pieza sabemos cuántos
 * kilos salieron de ella realmente, y comparado con lo estimado eso ES una
 * medición, conseguida sin pedirle nada a nadie.
 *
 * En pollo entero esto es todavía mejor: una pieza = una venta = un peso real.
 * Un cajón de 10 cabezas son 10 mediciones gratis, y después del segundo cajón
 * el sistema conoce el peso real del pollo de ese proveedor.
 */
export async function marcarCorteAgotado(params: {
  carniceriaId: string;
  productoId: string;
}): Promise<{ ok: boolean; mensaje: string; desvioPct?: number }> {
  const { carniceriaId, productoId } = params;
  const supabaseAdmin = getSupabaseAdmin();

  const { data: pieza } = await supabaseAdmin
    .from("piezas_stock")
    .select("id, kg_iniciales, kg_restantes, recepcion_lote_id, confianza")
    .eq("carniceria_id", carniceriaId)
    .eq("producto_id", productoId)
    .eq("estado", "disponible")
    .order("vence_at", { ascending: true, nullsFirst: false })
    .order("ingresada_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pieza) {
    return { ok: false, mensaje: "Ese corte ya figuraba sin stock." };
  }

  const sobrante = Number(pieza.kg_restantes);
  const iniciales = Number(pieza.kg_iniciales);

  await supabaseAdmin
    .from("piezas_stock")
    .update({ kg_restantes: 0, estado: "agotada", agotada_at: new Date().toISOString() })
    .eq("id", pieza.id);

  if (sobrante > 0) {
    await supabaseAdmin.from("movimientos_stock").insert({
      carniceria_id: carniceriaId,
      pieza_id: pieza.id as string,
      recepcion_lote_id: pieza.recepcion_lote_id,
      tipo: "descuadre",
      kg: sobrante,
      causa: "El carnicero avisó que se terminó y el sistema todavía contaba kilos",
    });
  }

  await recalcularStock(productoId);

  if (pieza.confianza !== "estimado" || iniciales <= 0) {
    return { ok: true, mensaje: "Listo, ese corte quedó en cero." };
  }

  const salieron = redondear(iniciales - sobrante, 3);
  const desvioPct = redondear(((salieron - iniciales) / iniciales) * 100, 1);

  return {
    ok: true,
    mensaje: `Listo, ese corte quedó en cero. Salieron ${salieron} kg de los ${iniciales} kg estimados.`,
    desvioPct,
  };
}

/** Carga el peso real de una pieza. REEMPLAZA al estimado, nunca se suma. */
export async function pesarPieza(params: {
  carniceriaId: string;
  piezaId: string;
  kgReales: number;
}): Promise<{ ok: boolean; mensaje: string }> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: pieza } = await supabaseAdmin
    .from("piezas_stock")
    .select("id, producto_id, kg_iniciales, kg_restantes, confianza, recepcion_lote_id")
    .eq("id", params.piezaId)
    .eq("carniceria_id", params.carniceriaId)
    .maybeSingle();

  if (!pieza) return { ok: false, mensaje: "No encontré esa pieza." };

  const consumido = redondear(Number(pieza.kg_iniciales) - Number(pieza.kg_restantes), 3);
  const restantes = redondear(Math.max(0, params.kgReales - consumido), 3);

  await supabaseAdmin
    .from("piezas_stock")
    .update({
      kg_iniciales: params.kgReales,
      kg_restantes: restantes,
      confianza: "pesado",
      estado: restantes <= 0 ? "agotada" : "disponible",
    })
    .eq("id", pieza.id);

  await supabaseAdmin.from("movimientos_stock").insert({
    carniceria_id: params.carniceriaId,
    pieza_id: pieza.id as string,
    recepcion_lote_id: pieza.recepcion_lote_id,
    tipo: "ajuste",
    kg: redondear(params.kgReales - Number(pieza.kg_iniciales), 3),
    causa: "Peso real: reemplaza al estimado",
  });

  await recalcularStock(pieza.producto_id as string);
  return { ok: true, mensaje: `Anotado: ${params.kgReales} kg reales.` };
}

// ============================================================
// Mover stock a mano (audio del carnicero, panel, "se terminó")
// ============================================================
//
// ⚠️ ESTA ES LA ÚNICA PUERTA PARA CAMBIAR STOCK FUERA DE UN LOTE (21/09/2026).
//
// El bug que la hizo nacer: el carnicero dijo "piqué 3 kg de vacío" y el vacío
// nunca bajó. Había DOS formas de cambiar el stock:
//
//   - el flujo de voz, el panel y un par de lugares más escribían
//     `productos.stock_actual` directo (+3, -3, "dejalo en 8");
//   - el motor de piezas recalcula `stock_actual` como SUMA DE PIEZAS cada vez
//     que toca algo.
//
// Así que el -3 del vacío duraba hasta la próxima venta de vacío: ahí el motor
// recalculaba desde las piezas (que nunca se enteraron del -3) y los 3 kg
// volvían a aparecer. Lo mismo al revés: un +20 por audio se borraba solo.
//
// Es el Patrón 1 del manual otra vez: dos lugares contestando "cuánto hay" y
// uno contestando mal. El arreglo no es sincronizarlos: es que haya UNO. Todo
// movimiento de stock ahora es una pieza que nace o una pieza que se gasta, y
// `stock_actual` vuelve a ser lo que dice el comentario de arriba: un cache.
//
// Ojo con la unidad: la columna se llama `kg_*` porque nació con la carne,
// pero guarda la cantidad en la unidad del producto (unidades de chorizo,
// bolsas de carbón). `stock_actual` siempre fue eso, y la suma sigue igual.

export type AccionStock = "ingreso" | "baja" | "ajuste";

/**
 * Suma, resta o fija el stock de un producto pasando por las piezas.
 *
 *   - ingreso: nace una pieza con esa cantidad.
 *   - baja:    se gasta esa cantidad, FEFO (la que vence antes primero).
 *   - ajuste:  "dejalo en N" — se calcula la diferencia contra lo que hay y
 *              se hace un ingreso o una baja por esa diferencia.
 *
 * Devuelve el stock resultante.
 */
export async function moverStock(params: {
  carniceriaId: string;
  productoId: string;
  accion: AccionStock;
  cantidad: number;
  causa: string;
  /** Qué tipo de movimiento anotar en una baja. Por defecto, ajuste manual. */
  tipoBaja?: "venta" | "degradado" | "recorte_picada" | "ajuste";
  /** De dónde vino el cambio, para el panel. */
  origen?: "audio" | "panel" | "pedido" | "ajuste";
}): Promise<number> {
  const { carniceriaId, productoId, accion, causa, tipoBaja = "ajuste", origen } = params;
  const cantidad = redondear(Math.max(0, params.cantidad), 3);

  await asegurarPiezaDeArrastre(carniceriaId, productoId);

  let delta = 0;
  if (accion === "ingreso") delta = cantidad;
  else if (accion === "baja") delta = -cantidad;
  else delta = redondear(cantidad - (await sumaDePiezas(productoId)), 3);

  if (delta > 0) {
    await crearPiezaSuelta({ carniceriaId, productoId, cantidad: delta, causa, confianza: "pesado" });
  } else if (delta < 0) {
    await consumirDeProducto({ carniceriaId, productoId, kg: -delta, tipo: tipoBaja, causa });
  }

  const resultado = await recalcularStock(productoId);

  // `recalcular_stock_de_producto` marca el origen como 'media_res'. Si el
  // cambio vino de otro lado, se deja dicho: el panel lo muestra.
  if (origen) {
    await getSupabaseAdmin().from("productos").update({ stock_origen: origen }).eq("id", productoId);
  }

  return resultado;
}

/**
 * Da de baja N piezas ENTERAS de un producto que se cuenta por unidad dentro de
 * la pieza (pollo entero: una pieza = un pollo), FEFO.
 *
 * Existe porque "trocé 3 pollos" no dice kilos: dice tres pollos. Restar
 * "3 kg" de pollo entero sería restar un pollo y cuarto. Acá se cierran tres
 * piezas y se devuelve cuántos kilos eran de verdad.
 */
export async function consumirUnidadesEnteras(params: {
  carniceriaId: string;
  productoId: string;
  unidades: number;
  causa: string;
}): Promise<{ unidades: number; kg: number }> {
  const supabaseAdmin = getSupabaseAdmin();
  const n = Math.max(0, Math.floor(params.unidades));

  const { data: piezas } = await supabaseAdmin
    .from("piezas_stock")
    .select("id, kg_restantes, recepcion_lote_id")
    .eq("carniceria_id", params.carniceriaId)
    .eq("producto_id", params.productoId)
    .eq("estado", "disponible")
    .gt("kg_restantes", 0)
    .order("vence_at", { ascending: true, nullsFirst: false })
    .order("ingresada_at", { ascending: true })
    .limit(n);

  let kg = 0;
  for (const pieza of piezas ?? []) {
    const restantes = Number(pieza.kg_restantes);
    await supabaseAdmin
      .from("piezas_stock")
      .update({ kg_restantes: 0, estado: "agotada", agotada_at: new Date().toISOString() })
      .eq("id", pieza.id);
    await supabaseAdmin.from("movimientos_stock").insert({
      carniceria_id: params.carniceriaId,
      pieza_id: pieza.id as string,
      recepcion_lote_id: pieza.recepcion_lote_id,
      tipo: "trozado",
      kg: restantes,
      causa: params.causa,
    });
    kg = redondear(kg + restantes, 3);
  }

  await recalcularStock(params.productoId);
  return { unidades: (piezas ?? []).length, kg };
}

async function sumaDePiezas(productoId: string): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from("piezas_stock")
    .select("kg_restantes")
    .eq("producto_id", productoId)
    .eq("estado", "disponible");
  return redondear(
    (data ?? []).reduce((suma, p) => suma + Number(p.kg_restantes), 0),
    3
  );
}

async function crearPiezaSuelta(params: {
  carniceriaId: string;
  productoId: string;
  cantidad: number;
  causa: string;
  confianza: "estimado" | "pesado";
}): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: producto } = await supabaseAdmin
    .from("productos")
    .select("vida_util_dias")
    .eq("id", params.productoId)
    .maybeSingle();

  const { data: pieza, error } = await supabaseAdmin
    .from("piezas_stock")
    .insert({
      carniceria_id: params.carniceriaId,
      producto_id: params.productoId,
      // Sin lote a propósito: la columna es opcional justamente para lo que no
      // viene de una media res (una caja de nalga, achuras, una carga por voz).
      recepcion_lote_id: null,
      kg_iniciales: params.cantidad,
      kg_restantes: params.cantidad,
      confianza: params.confianza,
      es_subproducto: false,
      estado: "disponible",
      vence_at: vencimientoDesde(Number(producto?.vida_util_dias ?? 0)),
    })
    .select("id")
    .single();

  if (error || !pieza) {
    console.error("Error creando una pieza suelta de stock", error);
    return;
  }

  await supabaseAdmin.from("movimientos_stock").insert({
    carniceria_id: params.carniceriaId,
    pieza_id: pieza.id as string,
    recepcion_lote_id: null,
    tipo: "entrada",
    kg: params.cantidad,
    causa: params.causa,
  });
}

/**
 * Convierte en pieza el stock "viejo" de un producto que no tiene piezas.
 *
 * Antes de que existieran las piezas, el stock era solo el número de
 * `stock_actual`. Si un producto todavía está así (10 kg de picada cargados
 * por audio hace un mes) y ahora se le suma una pieza de 3 kg, recalcular
 * daría 3 y se perderían los 10. Esta función los rescata como una pieza,
 * una sola vez: a partir de ahí el producto ya vive en piezas.
 */
async function asegurarPiezaDeArrastre(carniceriaId: string, productoId: string): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();

  const { count } = await supabaseAdmin
    .from("piezas_stock")
    .select("id", { count: "exact", head: true })
    .eq("producto_id", productoId)
    .eq("estado", "disponible");

  if ((count ?? 0) > 0) return;

  const { data: producto } = await supabaseAdmin
    .from("productos")
    .select("stock_actual")
    .eq("id", productoId)
    .maybeSingle();

  const viejo = Number(producto?.stock_actual ?? 0);
  if (!(viejo > 0)) return;

  await crearPiezaSuelta({
    carniceriaId,
    productoId,
    cantidad: redondear(viejo, 3),
    causa: "Stock que había antes de contar por piezas",
    // 'estimado': nadie sabe hoy de dónde salió ese número.
    confianza: "estimado",
  });
}

// ============================================================
// Devolver el stock de un pedido (se cancela o se cambia)
// ============================================================
//
// Un pedido aprobado ya descontó su stock (movimientos 'venta' con su
// pedido_id). Si el cliente lo cancela o lo cambia, esos kilos tienen que
// VOLVER a las mismas piezas de donde salieron. Antes no volvían: cancelar un
// pedido aprobado dejaba el stock descontado para siempre (la especificación,
// 10.2, pide expresamente liberarlo).
//
// Se anota como una 'venta' negativa y no se borra la original: así el
// historial muestra las dos cosas (se vendió, se devolvió) y el balance del
// lote queda bien sin tocar nada del pasado.

export async function devolverStockDePedido(params: {
  carniceriaId: string;
  pedidoId: string;
  causa: string;
}): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: movimientos } = await supabaseAdmin
    .from("movimientos_stock")
    .select("pieza_id, recepcion_lote_id, kg")
    .eq("carniceria_id", params.carniceriaId)
    .eq("pedido_id", params.pedidoId)
    .eq("tipo", "venta");

  // Neto por pieza: si ya se devolvió una vez, no se devuelve dos veces.
  const netoPorPieza = new Map<string, { kg: number; lote: string | null }>();
  for (const m of movimientos ?? []) {
    if (!m.pieza_id) continue;
    const actual = netoPorPieza.get(m.pieza_id as string) ?? { kg: 0, lote: (m.recepcion_lote_id as string | null) ?? null };
    actual.kg = redondear(actual.kg + Number(m.kg), 3);
    netoPorPieza.set(m.pieza_id as string, actual);
  }

  const productos = new Set<string>();
  let total = 0;

  for (const [piezaId, { kg, lote }] of netoPorPieza) {
    if (kg <= 0) continue;
    const { data: pieza } = await supabaseAdmin
      .from("piezas_stock")
      .select("kg_restantes, producto_id")
      .eq("id", piezaId)
      .maybeSingle();
    if (!pieza) continue;

    await supabaseAdmin
      .from("piezas_stock")
      .update({
        kg_restantes: redondear(Number(pieza.kg_restantes) + kg, 3),
        estado: "disponible",
        agotada_at: null,
      })
      .eq("id", piezaId);

    await supabaseAdmin.from("movimientos_stock").insert({
      carniceria_id: params.carniceriaId,
      pieza_id: piezaId,
      recepcion_lote_id: lote,
      tipo: "venta",
      kg: -kg,
      causa: params.causa,
      pedido_id: params.pedidoId,
    });

    productos.add(pieza.producto_id as string);
    total = redondear(total + kg, 3);
  }

  for (const productoId of productos) await recalcularStock(productoId);
  return total;
}

// ============================================================
// El cache que lee el bot
// ============================================================

/**
 * Recalcula `productos.stock_actual` sumando las piezas disponibles.
 *
 * ESTO NO ES OPCIONAL: `stock_actual` es lo único que lee el bot. Si no se
 * recalcula, el bot ofrece carne que ya no existe.
 */
export async function recalcularStock(productoId: string): Promise<number> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.rpc("recalcular_stock_de_producto", {
    p_producto_id: productoId,
  });

  if (error) {
    console.error("Error recalculando el stock del producto", productoId, error);
    return 0;
  }
  return Number(data ?? 0);
}

async function recalcularStockDeLote(loteId: string | null): Promise<void> {
  if (!loteId) return;
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("piezas_stock")
    .select("producto_id")
    .eq("recepcion_lote_id", loteId);

  const productos = new Set((data ?? []).map((p) => p.producto_id as string));
  for (const productoId of productos) {
    await recalcularStock(productoId);
  }
}

// ============================================================
// El balance del lote
// ============================================================

export type BalanceLote = {
  pesoEntrada: number;
  vendido: number;
  hueso: number;
  grasa: number;
  recortes: number;
  mermaFrio: number;
  degradado: number;
  enStock: number;
  descuadre: number;
  rindePct: number | null;
};

/**
 * La ecuación SIEMPRE cierra, porque el descuadre es la línea que la hace
 * cerrar. No es un error y no se espera que dé cero: es igual que el arqueo de
 * caja. Lo que se gestiona es su TAMAÑO.
 */
export async function balanceDeLote(loteId: string): Promise<BalanceLote | null> {
  const { data, error } = await getSupabaseAdmin().rpc("balance_de_lote", { p_lote_id: loteId });

  if (error || !data) {
    console.error("Error calculando el balance del lote", loteId, error);
    return null;
  }

  const fila = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!fila) return null;

  return {
    pesoEntrada: Number(fila.peso_entrada ?? 0),
    vendido: Number(fila.vendido ?? 0),
    hueso: Number(fila.hueso ?? 0),
    grasa: Number(fila.grasa ?? 0),
    recortes: Number(fila.recortes ?? 0),
    mermaFrio: Number(fila.merma_frio ?? 0),
    degradado: Number(fila.degradado ?? 0),
    enStock: Number(fila.en_stock ?? 0),
    descuadre: Number(fila.descuadre ?? 0),
    rindePct: fila.rinde_pct === null || fila.rinde_pct === undefined ? null : Number(fila.rinde_pct),
  };
}

/** Cierra el lote y congela su rinde. A partir de acá el balance no se mueve más. */
export async function cerrarLote(params: {
  carniceriaId: string;
  loteId: string;
}): Promise<{ ok: boolean; mensaje: string; balance?: BalanceLote }> {
  const balance = await balanceDeLote(params.loteId);
  if (!balance) return { ok: false, mensaje: "No pude calcular el balance de ese lote." };

  await getSupabaseAdmin()
    .from("recepciones_lote")
    .update({
      estado: "cerrada",
      rinde_real: balance.rindePct,
      descuadre_kg: balance.descuadre,
      cerrada_at: new Date().toISOString(),
    })
    .eq("id", params.loteId)
    .eq("carniceria_id", params.carniceriaId);

  return {
    ok: true,
    mensaje: `Lote cerrado. Rinde ${balance.rindePct ?? "?"} %, descuadre ${balance.descuadre} kg.`,
    balance,
  };
}

// ============================================================
// Costos
// ============================================================

export type CostoLote = {
  costoTotal: number;
  kgRecibidos: number;
  costoPorKgGancho: number;
  kgVendibles: number;
  costoPorKgVendible: number;
  recargoPct: number;
};

/**
 * El número que ningún carnicero ve: cuánto cuesta de verdad el kilo que vende.
 *
 * El costo "al gancho" es engañoso porque entre el 25 % y el 30 % de lo que se
 * compra (hueso, grasa, merma) no genera un peso de ingreso.
 *
 * El reparto del costo conjunto se hace por KILO PAREJO, no por valor relativo
 * de venta: el método de valor relativo (IAS 2) reparte en proporción al precio
 * y da el MISMO margen para todos los cortes — correcto para valuar inventario,
 * inútil para decidir. Con costo parejo aparece el subsidio cruzado.
 */
export async function costoDeLote(loteId: string): Promise<CostoLote | null> {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: lote } = await supabaseAdmin
    .from("recepciones_lote")
    .select("peso_recibido_kg, costo_mercaderia, costo_flete, costo_otros")
    .eq("id", loteId)
    .maybeSingle();

  if (!lote) return null;

  const costoTotal =
    Number(lote.costo_mercaderia ?? 0) + Number(lote.costo_flete ?? 0) + Number(lote.costo_otros ?? 0);
  const kgRecibidos = Number(lote.peso_recibido_kg ?? 0);
  if (costoTotal <= 0 || kgRecibidos <= 0) return null;

  // Los kilos vendibles son los que se repartieron en piezas NO subproducto:
  // el hueso, la grasa, el cuerito y la cabeza no se venden al mostrador.
  const { data: piezas } = await supabaseAdmin
    .from("piezas_stock")
    .select("kg_iniciales")
    .eq("recepcion_lote_id", loteId)
    .eq("es_subproducto", false);

  const kgVendibles = redondear(
    (piezas ?? []).reduce((suma, p) => suma + Number(p.kg_iniciales), 0),
    2
  );
  if (kgVendibles <= 0) return null;

  const costoPorKgGancho = redondear(costoTotal / kgRecibidos, 2);
  const costoPorKgVendible = redondear(costoTotal / kgVendibles, 2);

  return {
    costoTotal: redondear(costoTotal, 2),
    kgRecibidos,
    costoPorKgGancho,
    kgVendibles,
    costoPorKgVendible,
    recargoPct: redondear((costoPorKgVendible / costoPorKgGancho - 1) * 100, 1),
  };
}

export type MargenCorte = {
  productoId: string;
  nombre: string;
  precio: number;
  costoPorKg: number;
  margenPorKg: number;
  margenPct: number;
};

/** Margen por corte contra el costo parejo por kilo vendible. */
export async function margenPorCorte(loteId: string): Promise<MargenCorte[]> {
  const costo = await costoDeLote(loteId);
  if (!costo) return [];

  const { data } = await getSupabaseAdmin()
    .from("piezas_stock")
    .select("producto_id, productos(nombre_display, alias_display, precio)")
    .eq("recepcion_lote_id", loteId)
    .eq("es_subproducto", false);

  const filas = (data ?? []) as unknown as {
    producto_id: string;
    productos: { nombre_display: string; alias_display: string | null; precio: number | null } | null;
  }[];

  const margenes: MargenCorte[] = [];
  const vistos = new Set<string>();

  for (const fila of filas) {
    const precio = fila.productos?.precio;
    if (precio === null || precio === undefined) continue;
    if (vistos.has(fila.producto_id)) continue;
    vistos.add(fila.producto_id);

    const margenPorKg = redondear(Number(precio) - costo.costoPorKgVendible, 2);
    margenes.push({
      productoId: fila.producto_id,
      nombre: fila.productos?.alias_display ?? fila.productos?.nombre_display ?? "—",
      precio: Number(precio),
      costoPorKg: costo.costoPorKgVendible,
      margenPorKg,
      margenPct: redondear((margenPorKg / Number(precio)) * 100, 1),
    });
  }

  // De mayor a menor margen: arriba lo que banca al resto, abajo lo que se
  // vende a pérdida. Ese contraste es el subsidio cruzado.
  return margenes.sort((a, b) => b.margenPct - a.margenPct);
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}
