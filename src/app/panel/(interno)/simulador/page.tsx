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

// Dos números de prueba, uno por lado. Son distintos a propósito: el motor
// guarda una conversación por teléfono, así que compartir número mezclaría el
// hilo del cliente con el de la carga de stock y ninguno de los dos se
// entendería. Ninguno de los dos está en `numeros_carnicero` — el simulador
// arma el recorrido del carnicero a mano justamente para no dejar un permiso
// de verdad abierto (ver acciones.ts).
const TELEFONO_CLIENTE = "+5493400000001";
const TELEFONO_CARNICERO = "+5493400000002";

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

  async function hiloDe(telefono: string): Promise<MensajeDelPanel[]> {
    const { data: conversacion } = await supabase
      .from("conversaciones")
      .select("id")
      .eq("telefono", `whatsapp:${telefono}`)
      .maybeSingle();

    if (!conversacion) return [];

    const { data } = await supabase
      .from("mensajes_whatsapp")
      .select("id, direccion, tipo, cuerpo, origen, created_at")
      .eq("conversacion_id", conversacion.id)
      .order("created_at", { ascending: true })
      .limit(200);

    return ((data ?? []) as unknown as FilaMensaje[]).map((fila) => ({
      id: fila.id,
      direccion: fila.direccion as "entrante" | "saliente",
      cuerpo: fila.cuerpo,
      origen: fila.origen,
      creadoAt: fila.created_at,
    }));
  }

  const [mensajesCliente, mensajesCarnicero] = await Promise.all([
    hiloDe(TELEFONO_CLIENTE),
    hiloDe(TELEFONO_CARNICERO),
  ]);

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
          Probá las dos puntas del sistema sin que salga nada a WhatsApp: el cliente que hace un
          pedido y la carnicería que carga stock.
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

      <Simulador
        telefonoCliente={TELEFONO_CLIENTE}
        telefonoCarnicero={TELEFONO_CARNICERO}
        mensajesCliente={mensajesCliente}
        mensajesCarnicero={mensajesCarnicero}
        sinStock={productosConStock === 0}
      />

      <p className="text-xs text-ink-3">
        Los audios que grabás acá se transcriben con el mismo modelo que va a usar el sistema en
        producción. Lo que el simulador todavía no prueba: que el webhook de Meta esté bien
        configurado, la descarga del archivo desde los servidores de Meta (acá el audio ya llega en
        la mano) y las plantillas, que se dan por aprobadas.
      </p>
    </div>
  );
}

type MensajeDelPanel = {
  id: string;
  direccion: "entrante" | "saliente";
  cuerpo: string | null;
  origen: string | null;
  creadoAt: string;
};

type FilaMensaje = {
  id: string;
  direccion: string;
  tipo: string;
  cuerpo: string | null;
  origen: string | null;
  created_at: string;
};
