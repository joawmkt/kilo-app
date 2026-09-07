import Link from "next/link";
import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { Simulador } from "@/components/panel/simulador";
import { EstadoVacio, Tarjeta, clasesBoton } from "@/components/panel/ui";
import { PRODUCTO } from "@/lib/marca";

// Simulador — probar el bot antes de tener Meta.
//
// Solo existe mientras la carnicería está en modo simulado. Con un proveedor
// real la pantalla no se muestra: un mensaje de prueba le llegaría a un cliente
// de verdad.

const TELEFONO_DE_PRUEBA = "+5493400000001";

export default async function SimuladorPage() {
  const sesion = await requerirSesion();

  if (sesion.carniceria.whatsappProveedor !== "simulado") {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <Tarjeta>
          <EstadoVacio
            titulo="El simulador está apagado"
            descripcion={`Esta carnicería ya está conectada por ${
              sesion.carniceria.whatsappProveedor === "meta" ? "la API de Meta" : "Twilio"
            }, así que los mensajes salen de verdad. El simulador solo se usa mientras se espera la conexión.`}
            accion={
              <Link href="/panel/configuracion" className={clasesBoton("secundario")}>
                Ver la configuración
              </Link>
            }
          />
        </Tarjeta>
      </div>
    );
  }

  const supabase = await getSupabaseServidor();

  const { data: conversacion } = await supabase
    .from("conversaciones")
    .select("id")
    .eq("telefono", `whatsapp:${TELEFONO_DE_PRUEBA}`)
    .maybeSingle();

  const { data: mensajes } = conversacion
    ? await supabase
        .from("mensajes_whatsapp")
        .select("id, direccion, tipo, cuerpo, origen, created_at")
        .eq("conversacion_id", conversacion.id)
        .order("created_at", { ascending: true })
        .limit(200)
    : { data: [] };

  const { count: productosConStock } = await supabase
    .from("productos")
    .select("id", { count: "exact", head: true })
    .eq("activo", true)
    .gt("stock_actual", 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header>
        <h1 className="font-titulo text-xl font-bold text-ink sm:text-2xl">Simulador</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          Escribile al bot como si fueras un cliente, sin que salga nada a WhatsApp.
        </p>
      </header>

      <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3">
        <p className="font-titulo text-sm font-semibold text-warning">Modo simulado</p>
        <p className="mt-1 text-sm text-warning">
          Nada de lo que pase acá sale a internet, pero <strong>todo lo demás es real</strong>: se
          consulta tu stock de verdad, el pedido queda en la base, y si lo aprobás se descuenta el
          stock. Es el mismo motor que va a correr cuando {PRODUCTO} esté conectado a Meta.
        </p>
      </div>

      {productosConStock === 0 ? (
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-ink-2">
          No hay ningún producto con stock cargado, así que el bot va a rechazar todo lo que pidas.{" "}
          <Link href="/panel/stock" className="font-semibold text-brand">
            Cargá stock primero
          </Link>
          .
        </div>
      ) : null}

      <Simulador
        telefonoDePrueba={TELEFONO_DE_PRUEBA}
        mensajes={((mensajes ?? []) as unknown as FilaMensaje[]).map((fila) => ({
          id: fila.id,
          direccion: fila.direccion as "entrante" | "saliente",
          cuerpo: fila.cuerpo,
          origen: fila.origen,
          creadoAt: fila.created_at,
        }))}
      />

      <Tarjeta className="p-4 sm:p-5">
        <h2 className="font-titulo text-base font-semibold text-ink">Qué probar</h2>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-2">
          <li>
            <strong className="text-ink">Un pedido normal:</strong> &ldquo;hola, quiero 2 kilos de
            asado para las 7 de la tarde&rdquo;.
          </li>
          <li>
            <strong className="text-ink">Un corte que no tenés:</strong> pedí algo que esté en cero y
            fijate si ofrece una alternativa parecida.
          </li>
          <li>
            <strong className="text-ink">Sin decir cantidades:</strong> &ldquo;quiero asado y
            chorizo&rdquo; — tiene que preguntarte para cuántos son y calcular los kilos.
          </li>
          <li>
            <strong className="text-ink">Una palabra ambigua:</strong> &ldquo;quiero tapa&rdquo; —
            tiene que preguntar cuál.
          </li>
          <li>
            <strong className="text-ink">Después de armar el pedido:</strong> andá a{" "}
            <Link href="/panel" className="font-semibold text-brand">
              Inicio
            </Link>{" "}
            y aprobalo. El cliente simulado recibe la confirmación y se descuenta el stock.
          </li>
        </ul>
      </Tarjeta>

      <p className="text-xs text-ink-3">
        Lo que el simulador no prueba: que el webhook de Meta esté bien configurado, los audios (no
        hay archivo que descargar) y las plantillas, que acá se dan por aprobadas.
      </p>
    </div>
  );
}

type FilaMensaje = {
  id: string;
  direccion: string;
  tipo: string;
  cuerpo: string | null;
  origen: string | null;
  created_at: string;
};
