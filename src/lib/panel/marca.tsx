// Marca gráfica del panel de KILO.
//
// Los NOMBRES (Ainnova como empresa, KILO como producto) y todos los datos
// legales viven en `src/lib/marca.ts`, que es la fuente de verdad única y
// compartida con el sitio institucional. Acá vive solo el dibujo.
//
// Es un logotipo propio y no el de Ainnova a propósito: el carnicero trabaja
// adentro de KILO, que es el producto que contrató. Ainnova aparece en el pie
// del sitio y en los documentos legales, no en la herramienta de todos los días.

/**
 * Marca gráfica del panel. Sugiere un gancho de carnicería sin comprometerse
 * con una identidad cerrada: cuando KILO tenga logo propio en el manual de
 * marca, se reemplaza este archivo y nada más.
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
