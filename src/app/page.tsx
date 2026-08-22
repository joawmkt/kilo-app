export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Carnicom
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Etapa 1 — infraestructura base. El panel del carnicero se arma en los
        próximos pasos.
      </p>
    </div>
  );
}
