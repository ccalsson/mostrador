import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { quienSoy } from "@/lib/fn";

export function IdentidadPuesto() {
  const me = useQuery({ queryKey: ["quien"], queryFn: () => quienSoy() });
  if (me.data?.tipo !== "staff" || me.data.staff.rol !== "admin") return null;
  return (
    <Link to="/identidad" className="inline-flex h-9 items-center rounded-md border border-line bg-surface px-3 text-sm">
      Identidad del puesto
    </Link>
  );
}