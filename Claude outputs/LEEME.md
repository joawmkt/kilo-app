# Stock por media res — paquete para cargar en VS Code

**KILO · 13/09/2026**
Verificado contra `origin/main` en el commit `539e0ad` (tu rediseño del panel).
`npx tsc --noEmit`, `npm run lint` y `npm run build` los tres limpios.

---

## Cómo se carga

**1. Copiá las carpetas `src/` y `supabase/` de este paquete sobre la raíz del repo**
(`carnicom-app/`). Respetan la estructura tal cual, así que se mezclan solas: no pisan
nada que no sea de esta tanda.

Un solo archivo existente se modifica: `src/app/panel/(interno)/stock/page.tsx`
(le agregué el botón "Medias reses" en el encabezado). Los otros ocho son nuevos.

**2. Corré las migraciones en Supabase, EN ORDEN:**

```
0022_codigos_ipcva_y_arbol_de_cortes.sql
0023_stock_por_media_res.sql
0024_tablas_rendimiento_semilla.sql
```

La `0024` **falla a propósito** si la tabla de rendimiento no suma 100 %. Si tira una
excepción, es que algo no cierra — no la fuerces, avisame.

**3. Commiteá y pusheá desde VS Code.**

**4. Entrá a `/panel/stock` y tocá "Medias reses".**

---

## Qué hace cada archivo

### Migraciones

| Archivo | Qué trae |
|---|---|
| `0022_codigos_ipcva_y_arbol_de_cortes.sql` | Los códigos oficiales del IPCVA en `productos`, la relación padre-hijo entre cortes, y el producto `chingolo` que faltaba |
| `0023_stock_por_media_res.sql` | Las cinco tablas del módulo, el balance del lote y el recálculo del stock que lee el bot |
| `0024_tablas_rendimiento_semilla.sql` | Las tablas de novillo (70 % vendible) y vaca (67 %), con los 28 cortes |

### Código

| Archivo | Qué es |
|---|---|
| `src/lib/mediaRes.ts` | El motor: cargar, explotar en piezas, consumir por FEFO, "se acabó", pesar, balance, costo y margen |
| `src/components/panel/medias-reses.tsx` | El formulario de carga, la lista de lotes y el botón "Se acabó" |
| `src/app/panel/(interno)/stock/medias-reses/page.tsx` | La pantalla de medias reses |
| `src/app/panel/(interno)/stock/medias-reses/[id]/page.tsx` | El detalle de un lote: balance, costo real, margen por corte y las piezas |
| `src/app/panel/(interno)/stock/medias-reses/acciones.ts` | Las Server Actions, todas con `requerirSesion()` primero |
| `src/app/panel/(interno)/stock/page.tsx` | **Modificado**: botón "Medias reses" en el encabezado |

---

## Lo que NO se rompe

`productos.stock_actual` sigue siendo lo único que lee el bot. Ahora es un **cache** de la
suma de las piezas, y cada función que toca una pieza lo recalcula. **Todo el bot sigue
funcionando sin tocar una línea.**

Mientras no cargues ninguna media res, el sistema se comporta exactamente igual que hoy.

---

## Códigos del IPCVA: lo que está y lo que falta

Cargué **solo los 12 códigos que pude verificar** contra el nomenclador publicado. El resto
quedó en `NULL` a propósito: un código inventado se lee como oficial, y eso es peor que no
tener ninguno.

Cargados: cuadril (2456), tapa de cuadril (2460), colita de cuadril (2461), nalga (2464),
tapa de nalga (2465), carnaza de paleta (2307A), marucha (2309), chingolo (2308),
brazuelo (2311), bife ancho (2304), falda (2316), matambre (2317).

Se me cortó el límite de búsquedas web antes de terminar. Los que faltan los completo en la
próxima, o los sacás vos del nomenclador y te los cargo.

**Dos avisos de nomenclatura:**

- **"Tapa de asado" NO es el código 2310.** Ese es "Tapa de Aguja – Asado de Carnicero", un
  corte del delantero que no tiene nada que ver. Casi caigo.
- **La marucha tiene dos ubicaciones según la fuente.** El IPCVA la pone en la paleta; el
  Sitio Argentino de Producción Animal dice que es la tapa que cubre los bifes anchos, o sea
  en el costillar. Cargué la del IPCVA por ser oficial. **Si tu carnicero llama "marucha" a
  la del costillar, hay que cambiarle el padre y el porcentaje.**

---

## Lo que falta, y no es opcional

**La media hora con el carnicero piloto.** Los repartos dentro de cada grupo (asado → asado
+ tapa; vacío → vacío + matambre + entraña; cuadril → cuadril + colita; nalga → nalga + tapa;
paleta → paleta + palomita) son **inferencia mía**, hechos con proporciones de catálogos
argentinos. Los totales de cada grupo sí son dato del INAC.

Las tres preguntas concretas:

1. ¿Qué separa y qué vende junto? Cada "sí, lo separo" parte una fila en dos.
2. ¿Los rangos le cierran, corte por corte?
3. ¿A qué le llama "marucha"?

---

## Lo que queda para la próxima

- La carga por voz (hoy es solo por panel — el panel es el respaldo, no el camino principal).
- Descontar del stock por pieza al aprobar un pedido (hoy sigue descontando de
  `productos.stock_actual` como antes, que funciona, pero no sabe de qué lote salió).
- El peso real al marcar un pedido como retirado, que es lo que dispara la calibración.
- La caja / venta presencial, que dijiste de dejar para otra conversación.
