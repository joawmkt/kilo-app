// Iconos del panel. SVG inline, sin librería: son pocos, no cambian, y así no
// hay una dependencia más ni una descarga más en cada carga de página.
//
// Todos comparten trazo de 1.8 y `currentColor`, para que hereden el color del
// contexto y no haya ningún color escrito a mano.

type Props = { className?: string };

const BASE = "h-6 w-6";

function Svg({ className = BASE, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconoInicio(props: Props) {
  return (
    <Svg {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </Svg>
  );
}

export function IconoPedidos(props: Props) {
  return (
    <Svg {...props}>
      <path d="M8 4h8l1 3H7l1-3Z" />
      <path d="M5 7h14l-1 13H6L5 7Z" />
      <path d="M10 11v5M14 11v5" />
    </Svg>
  );
}

export function IconoStock(props: Props) {
  return (
    <Svg {...props}>
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
      <path d="m4 7 8 4 8-4" />
      <path d="M12 11v10" />
    </Svg>
  );
}

export function IconoMensajes(props: Props) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z" />
    </Svg>
  );
}

export function IconoClientes(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6" />
      <path d="M17.5 20a5.2 5.2 0 0 0-2-4.1" />
    </Svg>
  );
}

export function IconoCaja(props: Props) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6.5 12h.01M17.5 12h.01" />
    </Svg>
  );
}

export function IconoMetricas(props: Props) {
  return (
    <Svg {...props}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 17v-5M12.5 17V8M17 17v-7" />
    </Svg>
  );
}

export function IconoPlantillas(props: Props) {
  return (
    <Svg {...props}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </Svg>
  );
}

export function IconoConfiguracion(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2M12 19.2v2M4.7 4.7l1.4 1.4M17.9 17.9l1.4 1.4M2.8 12h2M19.2 12h2M4.7 19.3l1.4-1.4M17.9 6.1l1.4-1.4" />
    </Svg>
  );
}

export function IconoCampana(props: Props) {
  return (
    <Svg {...props}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 5.2-1.5 6.5-1.5 6.5h15S18 13.7 18 8.5Z" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </Svg>
  );
}

export function IconoMas(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconoBuscar(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Svg>
  );
}

export function IconoMicrofono(props: Props) {
  return (
    <Svg {...props}>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </Svg>
  );
}

export function IconoPantalla(props: Props) {
  return (
    <Svg {...props}>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
    </Svg>
  );
}

export function IconoReloj(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </Svg>
  );
}

export function IconoSalir(props: Props) {
  return (
    <Svg {...props}>
      <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="m17 15 3-3-3-3" />
      <path d="M20 12H10" />
    </Svg>
  );
}

export function IconoFlecha(props: Props) {
  return (
    <Svg {...props}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  );
}

export function IconoEnviar(props: Props) {
  return (
    <Svg {...props}>
      <path d="M4.5 12 20 4.5 15.5 20l-4-6.5-7-1.5Z" />
    </Svg>
  );
}
