import Link from "next/link";
import { EstadoVacio, Tarjeta, clasesBoton } from "@/components/panel/ui";

export default function NoEncontrado() {
  return (
    <div className="mx-auto w-full max-w-lg pt-6">
      <Tarjeta>
        <EstadoVacio
          titulo="No encontramos eso"
          descripcion="Puede que el pedido o el cliente que buscabas ya no exista, o que el enlace esté viejo."
          accion={
            <Link href="/panel" className={clasesBoton("principal")}>
              Volver al inicio
            </Link>
          }
        />
      </Tarjeta>
    </div>
  );
}
