import { redirect } from "next/navigation";

// La raíz del SaaS.
//
// Acá NO va una página de presentación: la presentación del producto vive en
// ainnova.com.ar/kilo, que es el sitio de la empresa. Este dominio es la
// aplicación, y quien entra por la raíz quiere entrar a trabajar.
//
// `/panel` a su vez manda al login si no hay sesión, así que este redirect
// resuelve los dos casos con una sola línea: el carnicero que ya entró va a su
// panel, y el que no, al login.
export default function Raiz() {
  redirect("/panel");
}
