import { requerirSesion } from "@/lib/panel/sesion";
import { getSupabaseServidor } from "@/lib/supabaseServidor";
import { ListaAvisos } from "@/components/panel/lista-avisos";
import { EncabezadoPantalla, EstadoVacio, Tarjeta } from "@/components/panel/ui";

// Centro de avisos.
//
// Regla de producto: cada aviso lleva a la pantalla donde SE RESUELVE, y no se
// satura. Un centro de notificaciones con cincuenta avisos irrelevantes se
// vuelve invisible en una semana — por eso los avisos se cierran solos cuando
// el problema se arregla (se aprueba el pedido, vuelve el stock) en vez de
// quedar acumulándose.

export type AvisoDelPanel = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  leidaAt: string | null;
  creadoAt: string;
};

export default async function AvisosPage() {
  await requerirSesion();
  const supabase = await getSupabaseServidor();

  const { data, error } = await supabase
    .from("notificaciones")
    .select("id, tipo, titulo, cuerpo, enlace, leida_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  const avisos: AvisoDelPanel[] = ((data ?? []) as unknown as FilaAviso[]).map((fila) => ({
    id: fila.id,
    tipo: fila.tipo,
    titulo: fila.titulo,
    cuerpo: fila.cuerpo,
    enlace: fila.enlace,
    leidaAt: fila.leida_at,
    creadoAt: fila.created_at,
  }));

  const sinLeer = avisos.filter((aviso) => aviso.leidaAt === null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <EncabezadoPantalla titulo="Avisos" descripcion={sinLeer.length === 0
            ? "No tenés avisos sin leer"
            : `${sinLeer.length} sin leer`} />

      {avisos.length === 0 ? (
        <Tarjeta>
          <EstadoVacio
            titulo="No hay avisos"
            descripcion="Acá te vamos a avisar cuando entre un pedido, cuando un producto se quede sin stock, cuando alguien no retire, o si se corta la conexión de WhatsApp."
          />
        </Tarjeta>
      ) : (
        <ListaAvisos avisos={avisos} haySinLeer={sinLeer.length > 0} />
      )}
    </div>
  );
}

type FilaAviso = {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  leida_at: string | null;
  created_at: string;
};
