// ============================================================
// Token de marca — SIN RESOLVER A PROPÓSITO
// ============================================================
//
// El nombre de la marca todavía no está definido (ver claude/brief_crm_panel.md,
// sección 1). Hasta que se defina, en toda la interfaz aparece el token literal
// `{{MARCA}}`, y este archivo es el único lugar donde hay que tocarlo.
//
// Mismo criterio que el sitio institucional, que centraliza sus siete tokens en
// `src/lib/marca.ts` de ese proyecto.
//
// PARA COMPLETARLO: reemplazar el valor de abajo por el nombre real. No hace
// falta buscar y reemplazar en ninguna otra parte.
//
// CHEQUEO: `grep -rn "{{MARCA}}" src` debería devolver solo este archivo cuando
// el nombre esté puesto — cualquier otro resultado es un lugar donde alguien
// escribió el token a mano en vez de importarlo.

export const MARCA = "{{MARCA}}";

/**
 * Marca gráfica del panel. Abstracta a propósito: un logo de verdad se diseña
 * cuando exista el nombre. Sugiere un gancho de carnicería sin comprometerse
 * con ninguna identidad.
 */
export function LogoMarca({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 4.5a3 3 0 1 1 3 3h-3" />
      <path d="M12 7.5V17" />
      <path d="M8 17h8" />
      <path d="M8.5 20h7" />
    </svg>
  );
}
