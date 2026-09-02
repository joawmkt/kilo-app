"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Etiqueta, EstadoVacio } from "./ui";
import { IconoBuscar } from "./iconos";
import { formatearRelativo } from "@/lib/panel/formatos";
import { formatearTelefono, soloDigitos } from "@/lib/whatsapp/telefonos";
import type { ClienteDelPanel } from "@/app/panel/(interno)/clientes/page";

// Búsqueda por nombre o por teléfono. La de teléfono compara solo los dígitos:
// el carnicero escribe "1155" y tiene que encontrar al que está guardado como
// "whatsapp:+5491155...".

export function ListaClientes({ clientes }: { clientes: ClienteDelPanel[] }) {
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return clientes;

    const digitos = soloDigitos(termino);

    return clientes.filter((cliente) => {
      if (cliente.nombre?.toLowerCase().includes(termino)) return true;
      if (digitos.length >= 3 && soloDigitos(cliente.telefono).includes(digitos)) return true;
      return false;
    });
  }, [clientes, busqueda]);

  return (
    <div className="flex flex-col gap-3">
      <label className="relative block">
        <span className="sr-only">Buscar por nombre o teléfono</span>
        <IconoBuscar className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar por nombre o teléfono…"
          className="min-h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-3 text-base text-ink placeholder:text-ink-3"
        />
      </label>

      <div className="rounded-xl border border-border bg-surface shadow-tarjeta">
        {visibles.length === 0 ? (
          <EstadoVacio
            titulo="No encontramos a nadie"
            descripcion={`Ningún cliente coincide con "${busqueda}".`}
          />
        ) : (
          <ul>
            {visibles.map((cliente) => (
              <li key={cliente.id}>
                <Link
                  href={`/panel/clientes/${cliente.id}`}
                  className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-titulo text-sm font-semibold text-ink">
                      {cliente.nombre ?? formatearTelefono(cliente.telefono)}
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {cliente.nombre ? `${formatearTelefono(cliente.telefono)} · ` : ""}
                      {cliente.pedidos === 0
                        ? "Sin pedidos todavía"
                        : `${cliente.pedidos} ${cliente.pedidos === 1 ? "pedido" : "pedidos"}`}
                      {cliente.ultimoPedidoAt ? ` · último ${formatearRelativo(cliente.ultimoPedidoAt)}` : ""}
                    </span>
                  </span>

                  {cliente.ausencias > 0 ? (
                    <Etiqueta tono="problema">
                      {cliente.ausencias} sin retirar
                    </Etiqueta>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
