import Link from "next/link";
import { requerirSesion } from "@/lib/panel/sesion";
import { altaConfigurada, configuracionPublicaDelAlta } from "@/lib/whatsapp/alta";
import { BotonConectar } from "@/components/panel/boton-conectar";
import { Etiqueta, Tarjeta, TarjetaEncabezado, clasesBoton } from "@/components/panel/ui";
import { formatearFechaYHora } from "@/lib/panel/formatos";
import { formatearTelefono } from "@/lib/whatsapp/telefonos";
import { PRODUCTO } from "@/lib/marca";

// Conectar el WhatsApp de la carnicería (Embedded Signup de Meta).
//
// La pantalla está construida y funciona: lo único que le falta es el
// identificador de configuración que sale del paso B6 del plan de producción,
// que a su vez necesita la verificación de negocio y la revisión de la app.
// Mientras esas variables no estén cargadas, la pantalla lo dice y explica qué
// falta, en vez de mostrar un botón que no hace nada.
//
// Cuando lleguen: se cargan META_APP_ID y META_CONFIG_ID en Vercel y esta misma
// pantalla pasa a funcionar sin tocar una línea de código.

// El chequeo previo del plan de producción (Etapa D). Si algo de esto no se
// cumple, el alta falla EN EL MOSTRADOR, con el carnicero delante.
const CHEQUEO_PREVIO = [
  {
    titulo: "Es WhatsApp Business, no WhatsApp común",
    detalle:
      "Si usa el personal, hay que migrarlo primero a la app de negocios. Es gratis y conserva los chats, pero es un paso aparte que lleva su tiempo.",
  },
  {
    titulo: "El número lleva al menos 7 días de uso activo",
    detalle: "Un número recién estrenado no es elegible para conectarse.",
  },
  {
    titulo: "La app de WhatsApp está actualizada",
    detalle: "Las versiones viejas fallan al escanear el código QR.",
  },
  {
    titulo: "El número nunca estuvo en una cuenta de API",
    detalle: "Si estuvo, hay que darlo de baja y esperar uno o dos meses.",
  },
  {
    titulo: "La foto de perfil ya está como la quiere el negocio",
    detalle: "Después de conectar no se puede cambiar.",
  },
  {
    titulo: "El nombre del negocio está definido",
    detalle: "También queda bloqueado después de conectar.",
  },
  {
    titulo: "El celular está a mano y con cámara",
    detalle: "Hace falta para escanear el código QR.",
  },
];

export default async function ConectarPage() {
  const sesion = await requerirSesion();
  const config = configuracionPublicaDelAlta();
  const listo = altaConfigurada();
  const yaConectada =
    sesion.carniceria.whatsappProveedor === "meta" && Boolean(sesion.carniceria.whatsappPhoneNumberId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <header>
        <h1 className="font-titulo text-xl font-bold text-ink sm:text-2xl">Conectar WhatsApp</h1>
        <p className="mt-0.5 text-sm text-ink-2">
          Tu número de siempre, funcionando con {PRODUCTO} sin dejar de usar tu WhatsApp.
        </p>
      </header>

      {yaConectada ? (
        <Tarjeta>
          <TarjetaEncabezado
            titulo="Ya está conectado"
            accion={<Etiqueta tono="exito">Conectado</Etiqueta>}
          />
          <div className="px-4 py-4 sm:px-5">
            <p className="text-sm text-ink-2">
              El número{" "}
              <strong className="text-ink">
                {sesion.carniceria.telefonoWhatsapp
                  ? formatearTelefono(sesion.carniceria.telefonoWhatsapp)
                  : "de la carnicería"}
              </strong>{" "}
              está conectado
              {sesion.carniceria.whatsappConectadoAt
                ? ` desde el ${formatearFechaYHora(sesion.carniceria.whatsappConectadoAt)}`
                : ""}
              .
            </p>
            <Link href="/panel/configuracion" className={clasesBoton("secundario", "mt-3")}>
              Ver el estado de la conexión
            </Link>
          </div>
        </Tarjeta>
      ) : (
        <>
          {/* Lo que se pierde al conectar. Va ANTES del botón, no en letra chica
              después: son cuatro elecciones sin vuelta atrás en un flujo de
              cinco minutos. */}
          <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3">
            <p className="font-titulo text-sm font-semibold text-warning">
              Cuatro cosas que no se pueden deshacer
            </p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-warning">
              <li>A qué cuenta de Meta queda asociado el número.</li>
              <li>La foto de perfil del negocio.</li>
              <li>El nombre del negocio.</li>
              <li>
                Si se importa el historial de conversaciones (hasta 6 meses). Se decide una sola vez.
              </li>
            </ul>
            <p className="mt-2 text-sm text-warning">
              Y en los chats de a uno dejan de funcionar las listas de difusión, los mensajes
              temporales, &ldquo;ver una vez&rdquo; y la ubicación en tiempo real. Los grupos siguen
              igual.
            </p>
          </div>

          <Tarjeta>
            <TarjetaEncabezado
              titulo="Antes de empezar"
              descripcion="Si algo de esto no se cumple, la conexión falla a mitad de camino"
            />
            <ul className="divide-y divide-border">
              {CHEQUEO_PREVIO.map((punto) => (
                <li key={punto.titulo} className="px-4 py-3 sm:px-5">
                  <p className="font-titulo text-sm font-semibold text-ink">{punto.titulo}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{punto.detalle}</p>
                </li>
              ))}
            </ul>
          </Tarjeta>

          {listo && config ? (
            <BotonConectar appId={config.appId} configId={config.configId} />
          ) : (
            <Tarjeta className="p-4 sm:p-5">
              <Etiqueta tono="atencion">Falta la habilitación de Meta</Etiqueta>
              <p className="mt-3 text-sm text-ink-2">
                La pantalla está lista, pero el botón todavía no se puede activar: falta que Meta
                apruebe la verificación del negocio y la revisión de la aplicación. Recién ahí Meta
                entrega el identificador de configuración que abre este flujo.
              </p>
              <p className="mt-2 text-sm text-ink-2">
                Cuando eso pase, se cargan dos variables de entorno y esta misma pantalla empieza a
                funcionar. No hay que programar nada más.
              </p>
              <dl className="mt-3 flex flex-col gap-1 text-xs text-ink-3">
                <div className="flex gap-2">
                  <dt className="numero">META_APP_ID</dt>
                  <dd>{process.env.META_APP_ID ? "cargada" : "falta"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="numero">META_APP_SECRET</dt>
                  <dd>{process.env.META_APP_SECRET ? "cargada" : "falta"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="numero">META_CONFIG_ID</dt>
                  <dd>{process.env.META_CONFIG_ID ? "cargada" : "falta"}</dd>
                </div>
              </dl>
            </Tarjeta>
          )}
        </>
      )}

      <Tarjeta className="p-4 sm:p-5">
        <h2 className="font-titulo text-base font-semibold text-ink">Después de conectar</h2>
        <p className="mt-1 text-sm text-ink-2">
          Dos cosas dependen de vos para que siga funcionando:
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-2">
          <li>El celular tiene que quedar prendido con la app instalada.</li>
          <li>
            Alguien tiene que <strong className="text-ink">abrir WhatsApp al menos una vez cada 14
            días</strong>. Si no, la conexión se corta sola y el bot deja de contestar sin avisar.
          </li>
        </ul>
      </Tarjeta>
    </div>
  );
}
