import Link from "next/link";
import { IconoAlerta } from "./ui";
import type { CarniceriaDelPanel } from "@/lib/panel/sesion";
import { formatearRelativo } from "@/lib/panel/formatos";

// Estado de la conexión de WhatsApp.
//
// Es la falla más probable en producción y la más silenciosa: con coexistencia,
// la sincronización se corta si nadie abre la app de WhatsApp en el celular al
// menos una vez cada 14 días. Nadie se entera hasta que un cliente reclama que
// el bot no contesta.
//
// Por eso el aviso aparece en Inicio, no escondido en Configuración, y avisa
// ANTES de que se corte, no después.

const DIAS_LIMITE = 14;
const DIAS_PARA_AVISAR = 11; // tres días de margen para reaccionar

export function AvisoConexionWhatsapp({ carniceria }: { carniceria: CarniceriaDelPanel }) {
  const estado = evaluarConexion(carniceria);
  if (estado.nivel === "ok") return null;

  const esProblema = estado.nivel === "cortada" || estado.nivel === "sin_configurar";

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
        esProblema
          ? "border-danger/40 bg-danger-soft text-danger"
          : "border-warning/40 bg-warning-soft text-warning"
      }`}
    >
      <IconoAlerta className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-titulo text-sm font-semibold">{estado.titulo}</p>
        <p className="mt-0.5 text-sm opacity-90">{estado.descripcion}</p>
      </div>
      <Link
        href="/panel/configuracion"
        className="shrink-0 self-center font-titulo text-sm font-semibold underline"
      >
        Ver
      </Link>
    </div>
  );
}

type EstadoConexion = {
  nivel: "ok" | "por_vencer" | "cortada" | "sin_configurar";
  titulo: string;
  descripcion: string;
};

export function evaluarConexion(carniceria: CarniceriaDelPanel): EstadoConexion {
  if (carniceria.whatsappProveedor === "meta" && !carniceria.whatsappPhoneNumberId) {
    return {
      nivel: "sin_configurar",
      titulo: "Falta terminar de conectar WhatsApp",
      descripcion:
        "La carnicería está configurada para la API de Meta pero todavía no tiene cargado el número. Hasta que se cargue, el bot no puede recibir ni contestar mensajes.",
    };
  }

  if (!carniceria.telefonoWhatsapp) {
    return {
      nivel: "sin_configurar",
      titulo: "Falta conectar el WhatsApp de la carnicería",
      descripcion: "Sin número conectado, los clientes no pueden hacer pedidos por WhatsApp.",
    };
  }

  const ultima = carniceria.whatsappUltimaActividadAt;
  if (!ultima) {
    return {
      nivel: "ok",
      titulo: "",
      descripcion: "",
    };
  }

  const dias = Math.floor((Date.now() - new Date(ultima).getTime()) / 86400000);

  if (dias >= DIAS_LIMITE) {
    return {
      nivel: "cortada",
      titulo: "La conexión de WhatsApp se cortó",
      descripcion: `Hace ${dias} días que no hay actividad en el número. Abrí WhatsApp en el celular de la carnicería para volver a sincronizarlo — hasta entonces el bot no contesta.`,
    };
  }

  if (dias >= DIAS_PARA_AVISAR) {
    const restantes = DIAS_LIMITE - dias;
    return {
      nivel: "por_vencer",
      titulo: "Abrí WhatsApp en el celular de la carnicería",
      descripcion: `La última actividad fue ${formatearRelativo(ultima)}. Si pasan ${restantes} ${
        restantes === 1 ? "día" : "días"
      } más sin abrir la app, la conexión se corta y el bot deja de contestar.`,
    };
  }

  return { nivel: "ok", titulo: "", descripcion: "" };
}
