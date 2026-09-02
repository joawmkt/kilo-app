"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EstadoError, Tarjeta, clasesBoton } from "@/components/panel/ui";

// Pantalla de error del panel.
//
// Dice qué pasó y qué hacer, sin disculpas ni jerga técnica. El detalle técnico
// existe pero está plegado: al carnicero no le sirve, a quien tenga que
// diagnosticar sí.

export default function ErrorDelPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error en el panel", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-lg pt-6">
      <Tarjeta>
        <EstadoError
          titulo="No pudimos cargar esta pantalla"
          descripcion="Puede ser un problema momentáneo de conexión. Probá de nuevo; si sigue igual, escribinos y lo miramos."
          detalle={error.digest ? `Referencia: ${error.digest}` : error.message}
          accion={
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={reset} className={clasesBoton("principal")}>
                Probar de nuevo
              </button>
              <Link href="/panel" className={clasesBoton("secundario")}>
                Ir al inicio
              </Link>
            </div>
          }
        />
      </Tarjeta>
    </div>
  );
}
