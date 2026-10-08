import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Field, TorreShell } from "@/components/torre-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listProcessors, saveProcessor } from "@/lib/torre/legal-fn";

export const Route = createFileRoute("/torre/procesadores")({ component: Page });

function Page() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: ["torre-proc"], queryFn: () => listProcessors() });
  const [form, setForm] = useState({ name: "", category: "", purpose: "", legalRoleNote: "" });
  return (
    <TorreShell title="Procesadores">
      <p className="mb-3 text-sm text-muted">Registro documental. No define si alguien es responsable o encargado: eso lo tiene que revisar un abogado.</p>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface text-sm">
        {(data.data ?? []).map((item) => (
          <li key={item.id} className="px-3 py-2">
            <span className="font-medium">{item.name}</span>
            <Badge className="ml-2" tone={item.status === "active" ? "ok" : "muted"}>{item.status}</Badge>
            <span className="ml-2 text-xs text-muted">{item.category}</span>
            <p className="text-xs text-muted">{item.purpose}</p>
            <p className="text-xs text-muted">{item.legalRoleNote}</p>
          </li>
        ))}
      </ul>
      <form className="mt-3 max-w-md rounded-lg border border-line bg-surface p-3" onSubmit={(e) => {
        e.preventDefault();
        void saveProcessor({ data: form }).then(() => {
          toast.success("Procesador documentado");
          setForm({ name: "", category: "", purpose: "", legalRoleNote: "" });
          return qc.invalidateQueries({ queryKey: ["torre-proc"] });
        }).catch((err: Error) => toast.error(err.message));
      }}>
        <Field label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label="Categoría" value={form.category} onChange={(category) => setForm({ ...form, category })} />
        <Field label="Para qué se usa" value={form.purpose} onChange={(purpose) => setForm({ ...form, purpose })} />
        <Field label="Nota jurídica" value={form.legalRoleNote} onChange={(legalRoleNote) => setForm({ ...form, legalRoleNote })} />
        <Button type="submit" className="mt-3 w-full">Guardar</Button>
      </form>
    </TorreShell>
  );
}
