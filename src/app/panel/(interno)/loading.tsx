import { Esqueleto } from "@/components/panel/ui";

// Estado de carga de todas las pantallas del panel.
//
// Esqueletos con la forma de lo que viene, no un spinner centrado tapando la
// pantalla: así el carnicero ve enseguida que hay contenido en camino y dónde va
// a estar, y la página no salta cuando termina de cargar.

export default function CargandoPanel() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Esqueleto className="h-7 w-56" />
        <Esqueleto className="h-4 w-40" />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <Esqueleto className="mb-3 h-5 w-44" />
        <div className="flex flex-col gap-2">
          <Esqueleto className="h-14 w-full" />
          <Esqueleto className="h-14 w-full" />
          <Esqueleto className="h-14 w-full" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <Esqueleto className="mb-3 h-5 w-32" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Esqueleto className="h-14" />
          <Esqueleto className="h-14" />
          <Esqueleto className="h-14" />
          <Esqueleto className="h-14" />
        </div>
      </div>

      <span className="sr-only" role="status">
        Cargando…
      </span>
    </div>
  );
}
