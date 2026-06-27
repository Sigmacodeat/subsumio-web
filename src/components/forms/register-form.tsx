"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useRegister } from "@/lib/queries/auth";

const schema = z.object({
  name: z.string().min(2, "Name muss mindestens 2 Zeichen haben"),
  email: z.string().email("Bitte eine gültige E-Mail eingeben"),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben"),
  industry: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const registerMutation = useRegister();

  return (
    <form onSubmit={handleSubmit((data) => registerMutation.mutate(data))} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register("name")} placeholder="RA Max Mustermann" />
        {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" type="email" {...register("email")} placeholder="name@kanzlei.de" />
        {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          type="password"
          {...register("password")}
          placeholder="Mindestens 8 Zeichen"
        />
        {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Branche</Label>
        <Select onValueChange={(v) => setValue("industry", v)} defaultValue="legal">
          <SelectTrigger>
            <SelectValue placeholder="Recht" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="legal">Recht</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {registerMutation.isError && (
        <p className="text-sm text-red-400">
          {registerMutation.error instanceof Error
            ? registerMutation.error.message
            : "Registrierung fehlgeschlagen"}
        </p>
      )}

      <Button type="submit" loading={registerMutation.isPending} className="w-full">
        Kostenlos registrieren
      </Button>
    </form>
  );
}
