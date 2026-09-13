import { getSupabaseAdmin } from "./supabaseAdmin";

// ============================================================
// Stock por media res
// ============================================================
//
// Ver `docs/media-res-diseno-final.md` para el razonamiento completo. Acá van
// solo las reglas que el código tiene que cumplir sí o sí.
//
// 1. UNA MEDIA RES NO SUMA KILOS: LOS TRANSFORMA. Entra una pieza grande de peso
//    conocido y salen cortes, hueso, grasa, recortes y merma. El balance cierra
//    contra el peso de entrada, siempre, porque el descuadre es la línea que lo
//    hace cerrar.
//
// 2. EL STOCK SON PIEZAS Y LOS KILOS VIVEN ADENTRO DE CADA PIEZA. Nunca se
//    guarda "kilos de peceto" en ningún lado: se suman las piezas. Por eso las
//    dos vistas (en kilos y en piezas) no pueden contradecirse.
//
// 3. `productos.stock_actual` ES UN CACHE de esa suma, y es lo único que lee el
//    bot. Cada vez que se toca una pieza hay que recalcularlo, o el bot va a
//    ofrecer carne que ya no existe. Toda función de acá que modifique piezas
//    llama a `recalcularStock`.
//
// 4. UN PESO REAL REEMPLAZA AL ESTIMADO, NUNCA SE SUMA. Es el error clásico que
//    duplica stock.

export type CategoriaAnimal = "novillo" | "novillito" | "vaquillona" | "vaca" | "ternera";

export type ResultadoMediaRes =
  | { ok: true; loteId: string; piezas: number; kgVendibles: number; mensaje: string }
  | { ok: false; mensaje: string };

type FilaRendimiento = {
  producto_id: string;
  pct_central: number;
  productos: { nombre_display: string; codigo: string } | null;
};

// ============================================================
// Cargar una media res
// ============================================================

/**
 * Registra la entrada de una media res y la explota en piezas estimadas.
 *
 * El lote se abre COMPLETO aunque el carnicero desposte de a partes. El motivo:
 * para el bot lo que importa es si hoy hay o no hay ese corte, y si está en la
 * media res que entró, hay — esté cortado o no. Si desposta progresivamente, lo
 * único que cambia es el momento físico, y eso ya lo cubre el paso de aprobación
 * del pedido, donde el carnicero mira la mercadería antes de confirmar.
 */
export async function cargarMediaRes(params: {
  carniceriaId: string;
  categoria: CategoriaAnimal;
  pesoRecibidoKg: number;
  pesoFacturadoKg?: number | null;
  proveedor?: string | null;
  remito?: string | null;
  costoMercaderia?: number | null;
  costoFlete?: number | null;
}): Promise<ResultadoMediaRes> {
  const { carniceriaId, categoria, pesoRecibidoKg } = params;
  const supabaseAdmin = getSupabaseAdmin();

  if (!(pesoRecibidoKg > 0)) {
    return { ok: false, mensaje: "El peso tiene que ser mayor que cero." };
  }

  // La tabla vigente para esta categoría. Sin tabla no se puede explotar nada:
  // preferimos no cargar antes que inventar porcentajes.
  const { data: tabla } = await supabaseAdmin
    .from("tablas_rendimiento")
    .select("id, pct_hueso, pct_grasa, pct_merma")
    .eq("carniceria_id", carniceriaId)
    .eq("categoria", categoria)
    .is("vigente_hasta", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tabla) {
    return {
      ok: false,
      mensaje: `Todavía no hay una tabla de rendimiento cargada para ${categoria}. Sin eso no puedo repartir los kilos en cortes.`,
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

  const { data: lote, error: errorLote } = await supabaseAdmin
    .from("recepciones_lote")
    .insert({
      carniceria_id: carniceriaId,
      categoria,
      proveedor: params.proveedor ?? null,
      remito: params.remito ?? null,
      peso_recibido_kg: pesoRecibidoKg,
      peso_facturado_kg: params.pesoFacturadoKg ?? null,
      costo_mercaderia: params.costoMercaderia ?? null,
      costo_flete: params.costoFlete ?? null,
      tabla_rendimiento_id: tabla.id,
      estado: "abierta",
    })
    .select("id")
    .single();

  if (errorLote || !lote) {
    console.error("Error creando la recepción de la media res", errorLote);
    return { ok: false, mensaje: "Tuve un problema técnico registrando la media res." };
  }

  const loteId = lote.id as string;

  // ------------------------------------------------------------
  // La explosión: una pieza por corte
  // ------------------------------------------------------------
  //
  // Una pieza por corte y no "N kilos sueltos" porque es la realidad física:
  // cada media res trae un peceto, un lomo, un matambre. Eso es lo que después
  // permite saber cuándo se terminó de verdad, y cuál lleva más días en cámara.
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
    });
  }

  const { data: piezasCreadas, error: errorPiezas } = await supabaseAdmin
    .from("piezas_stock")
    .insert(piezas)
    .select("id, producto_id, kg_iniciales");

  if (errorPiezas) {
    console.error("Error creando las piezas de la media res", errorPiezas);
    // El lote queda, pero sin piezas no sirve: se borra para no dejar basura.
    await supabaseAdmin.from("recepciones_lote").delete().eq("id", loteId);
    return { ok: false, mensaje: "Tuve un problema técnico repartiendo los cortes." };
  }

  // Un movimiento de entrada por pieza: así el balance del lote cierra desde el
  // primer momento y no desde la primera venta.
  await supabaseAdmin.from("movimientos_stock").insert(
    (piezasCreadas ?? []).map((p) => ({
      carniceria_id: carniceriaId,
      pieza_id: p.id as string,
      recepcion_lote_id: loteId,
      tipo: "entrada",
      kg: Number(p.kg_iniciales),
      causa: "Explosión de la media res según la tabla de rendimiento",
    }))
  );

  // ------------------------------------------------------------
  // Hueso, grasa y merma: salen ahora, no al final
  // ------------------------------------------------------------
  //
  // Se registran en la entrada porque el rendimiento ya los descontó: los kilos
  // de hueso nunca fueron carne vendible. Registrarlos recién al cerrar el lote
  // haría que el balance no cerrara en todo el medio.
  //
  // El hueso y la grasa se registran como MOVIMIENTO y no como pieza: son
  // subproductos que salen enteros, no stock que se va consumiendo. El día que
  // se le quiera vender al sebero desde el sistema, los kilos ya están acá.
  const subproductos: { tipo: string; pct: number; causa: string }[] = [
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
    mensaje:
      `Anotado: media res de ${pesoRecibidoKg} kg. ` +
      `Te cargué ${piezasCreadas?.length ?? 0} cortes estimados (${redondear(kgVendibles, 1)} kg vendibles).`,
  };
}

// ============================================================
// Consumir stock
// ============================================================

/**
 * Descuenta kilos de un producto, gastando primero la pieza MÁS VIEJA (FEFO).
 *
 * FEFO y no FIFO de compra: lo que importa es qué se va a echar a perder antes,
 * no qué se compró antes. Es de donde salen los kilos que se degradan a picada
 * por mala rotación, que según la investigación son ~$2.400 por animal.
 *
 * Devuelve cuántos kilos se pudieron descontar de verdad. Si hay menos de lo
 * pedido descuenta lo que hay: el faltante lo maneja quien llama, que es el que
 * sabe si corresponde avisar al cliente o al carnicero.
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

  const { data: piezas } = await supabaseAdmin
    .from("piezas_stock")
    .select("id, kg_restantes, recepcion_lote_id")
    .eq("carniceria_id", carniceriaId)
    .eq("producto_id", productoId)
    .eq("estado", "disponible")
    .gt("kg_restantes", 0)
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
 * Cierra la pieza más vieja y manda sus kilos sobrantes a `descuadre`, con
 * causa. No es un ajuste silencioso: es información, y de las más valiosas que
 * da el sistema.
 *
 * **Acá está la calibración sin ritual.** Al cerrar la pieza sabemos cuántos
 * kilos salieron de ella realmente, y comparado con lo que la tabla había
 * estimado, eso ES una medición — conseguida sin pedirle nada a nadie, porque la
 * balanza del mostrador ya estaba pesando igual. Por eso se devuelve `desvioPct`.
 *
 * Honestidad sobre el alcance: esto funciona bien en cortes que salen en pocas
 * tajadas grandes (peceto, lomo, matambre, colita). En el asado o la picada, que
 * salen en muchas ventas chicas de lotes mezclados, sirve mucho menos.
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

  // Solo se aprende de las piezas estimadas: si estaba pesada, el dato ya era
  // real y el sobrante es otra cosa (merma, o una venta sin registrar).
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
// El cache que lee el bot
// ============================================================

/**
 * Recalcula `productos.stock_actual` sumando las piezas disponibles.
 *
 * ESTO NO ES OPCIONAL. `productos.stock_actual` es lo único que lee el bot: si
 * no se recalcula, el bot ofrece carne que ya no existe. Es un cache y no una
 * vista porque el bot consulta el stock en cada mensaje, y recalcular en cada
 * lectura sería pagar un join por mensaje para un número que cambia pocas veces
 * al día.
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

async function recalcularStockDeLote(loteId: string): Promise<void> {
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
 * El balance de un lote. La ecuación SIEMPRE cierra, porque el descuadre es la
 * línea que la hace cerrar:
 *
 *   entrada = vendido + hueso + grasa + recortes + merma + lo que queda + DESCUADRE
 *
 * El descuadre NO es un error y NO se espera que dé cero. Es igual que el arqueo
 * de caja: nunca da exacto y la contabilidad cierra lo mismo, porque la
 * diferencia tiene nombre. Lo que se gestiona es su TAMAÑO: 0,5 % es ruido, 6 %
 * es un problema (alguien pesa mal, la balanza está descalibrada, o sale carne
 * por la puerta de atrás).
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
 * El número que ningún carnicero ve: **cuánto cuesta de verdad el kilo que vende.**
 *
 * El costo "al gancho" es engañoso, porque entre el 25 % y el 30 % de lo que se
 * compra (hueso, grasa, merma) no genera un peso de ingreso. Con los números del
 * ejemplo del documento de diseño, el kilo vendible sale **43 % más caro** que el
 * kilo comprado. El carnicero que fija precios sobre el costo al gancho está
 * perdiendo plata en todos los cortes y no lo sabe.
 *
 * Nota sobre el margen por corte: el reparto del costo conjunto se hace por KILO
 * PAREJO, no por valor relativo de venta. El método de valor relativo (el criterio
 * de IAS 2) reparte el costo en proporción al precio, así que da el MISMO margen
 * para todos los cortes — correcto para valuar inventario, inútil para decidir.
 * Con costo parejo aparece el subsidio cruzado: el cogote se vende casi a pérdida
 * y el lomo lo banca.
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

  // Los kilos vendibles son los que se repartieron en piezas: hueso, grasa y
  // merma nunca fueron pieza, justamente porque no se venden.
  const { data: piezas } = await supabaseAdmin
    .from("piezas_stock")
    .select("kg_iniciales")
    .eq("recepcion_lote_id", loteId);

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
    .select("producto_id, productos(nombre_display, precio)")
    .eq("recepcion_lote_id", loteId);

  const filas = (data ?? []) as unknown as {
    producto_id: string;
    productos: { nombre_display: string; precio: number | null } | null;
  }[];

  const margenes: MargenCorte[] = [];
  for (const fila of filas) {
    const precio = fila.productos?.precio;
    if (precio === null || precio === undefined) continue;

    const margenPorKg = redondear(Number(precio) - costo.costoPorKgVendible, 2);
    margenes.push({
      productoId: fila.producto_id,
      nombre: fila.productos?.nombre_display ?? "—",
      precio: Number(precio),
      costoPorKg: costo.costoPorKgVendible,
      margenPorKg,
      margenPct: redondear((margenPorKg / Number(precio)) * 100, 1),
    });
  }

  // De mayor a menor margen: arriba lo que banca al resto, abajo lo que se vende
  // a pérdida. Ese contraste es el subsidio cruzado, visible por primera vez.
  return margenes.sort((a, b) => b.margenPct - a.margenPct);
}

function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales;
  return Math.round(valor * factor) / factor;
}
