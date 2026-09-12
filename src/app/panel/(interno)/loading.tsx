import { Esqueleto } from "@/components/panel/ui";

// Estado de carga de todas las pantallas del panel.
//
// Esqueletos con la forma de lo que viene, no un spinner centrado tapando la
// pantalla: así el carnicero ve enseguida que hay contenido en camino y dónde va
// a estar, y la página no salta cuando termina de cargar.

export default function CargandoPanel() {
  return (
    <div className="flex w-full flex-col gap-6">
      {/* Encabezado de pantalla */}
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-8 w-56" />
        <Esqueleto className="h-4 w-40" />
      </div>

      {/* La fila de números, que es lo primero que aparece en Inicio y en
          Métricas. El esqueleto tiene su forma para que nada salte de lugar
          cuando llegan los datos. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((indice) => (
          <div key={indice} className="rounded-tarjeta border border-border bg-surface p-4 sm:p-5">
            <Esqueleto className="h-5 w-24" />
            <Esqueleto className="mt-3 h-8 w-16" />
          </div>
        ))}
      </div>

      <div className="rounded-tarjeta border border-border bg-surface p-4">
        <Esqueleto className="mb-3 h-5 w-44" />
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-14 w-full" />
          <Esqueleto className="h-14 w-full" />
          <Esqueleto className="h-14 w-full" />
        </div>
      </div>

      <span className="sr-only" role="status">
        Cargando…
      </span>
    </div>
  );
}
