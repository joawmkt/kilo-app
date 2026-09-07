/**
 * Datos de marca y datos legales del sitio institucional.
 *
 * Estado al 01/09/2026: TODOS los valores están cargados. No quedan tokens.
 *
 * Nombre legal, CUIT y domicilio están COPIADOS DE LA CONSTANCIA DE ARCA y
 * verificados contra el documento el 01/09/2026. El formulario de
 * verificación de Meta se completa con estas mismas cadenas, carácter por
 * carácter.
 *
 * Se centralizan acá para que completarlos sea un solo paso: cuando estén
 * definidos el nombre comercial, el dominio y los datos de la constancia de
 * ARCA, se reemplazan los valores de este archivo y quedan actualizados
 * automáticamente todas las páginas del sitio.
 *
 * REGLA DE ORO: el nombre legal, el domicilio y el teléfono tienen que
 * coincidir CARÁCTER POR CARÁCTER con la constancia de inscripción de ARCA y
 * con el formulario de verificación de negocio de Meta. Meta no compara
 * "parecido", compara literal: una abreviatura distinta, un acento faltante o
 * una dirección escrita de otra forma es motivo de rechazo del trámite.
 *
 * Ver `docs/tokens.md` para la lista completa y dónde se usa cada uno.
 */

/** Nombre comercial de la empresa. Definido el 31/08/2026. */
export const MARCA = "Ainnova";

/**
 * Nombre del producto para carnicerías. Ainnova es la empresa; KILO es lo que
 * se le vende a la carnicería. El sitio nombra a los dos: la empresa arriba,
 * el producto en el cuerpo.
 */
export const PRODUCTO = "KILO";

/** Dominio propio, sin protocolo. Registrado en nic.ar el 31/08/2026. */
export const DOMINIO = "ainnova.com.ar";

/**
 * Nombre del titular EXACTAMENTE como figura en la constancia de ARCA:
 * apellido primero, en mayúsculas, sin acento. Verificado contra el documento
 * el 01/09/2026. NO tocar para que "se lea mejor" — el formulario de
 * verificación de Meta se completa con esta misma cadena.
 *
 * NO es la marca: como monotributista, la identidad legal ante Meta es la
 * persona física, y Ainnova va como "nombre alternativo".
 */
export const NOMBRE_LEGAL = "WIRSCH JOAQUIN";

/** CUIT del monotributo, con el mismo formato que la constancia de ARCA. */
export const CUIT = "20-43579747-5";

/**
 * Domicilio fiscal EXACTAMENTE como figura en la constancia de ARCA, que lo
 * muestra en tres renglones: CATAMARCA 363 / VILLA CONSTITUCION / 2919-SANTA
 * FE. Verificado contra el documento el 01/09/2026.
 */
export const DOMICILIO = "CATAMARCA 363, VILLA CONSTITUCION, 2919-SANTA FE";

/**
 * Teléfono del titular. ⚠️ NO SE PUBLICA EN EL SITIO — decisión del titular
 * del 01/09/2026, para no exponer su número personal.
 *
 * Queda acá como fuente única para el formulario de verificación de Meta, que
 * sí lo pide y lo verifica con un código. Si algún día se consigue una línea
 * del negocio y se decide publicarla, se vuelve a mostrar en el pie
 * (`SiteFooter`) y en la sección de contacto de la home.
 */
export const TELEFONO = "+54 9 3400 658031";

/** Correo con dominio propio. ⚠️ La casilla tiene que existir antes de publicar. */
export const EMAIL = "consultas@ainnova.com.ar";

/** Fecha de última actualización de las páginas legales. */
export const ACTUALIZADO = "1 de septiembre de 2026";

/** Bajada de marca, del manual de identidad. */
export const BAJADA = "Tu negocio, listo para lo que viene.";

/** Ciudad de referencia para el trabajo presencial. */
export const ZONA = "Rosario y alrededores";
