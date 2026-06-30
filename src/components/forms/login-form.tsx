"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin, useVerify2FA } from "@/lib/queries/auth";

const schema = z.object({
  email: z.string().email("Bitte eine gültige E-Mail eingeben"),
  password: z.string().min(1, "Passwort ist erforderlich"),
});

type FormData = z.infer<typeof schema>;

export function LoginForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const login = useLogin();
  const verify2FA = useVerify2FA();
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");

  // 2FA challenge step
  if (challengeToken) {
    const submit2FA = (e: React.FormEvent) => {
      e.preventDefault();
      if (totpCode.length < 6) return;
      verify2FA.mutate({ challengeToken, token: totpCode });
    };

    return (
      <form onSubmit={submit2FA} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="totp">2FA-Code</Label>
          <p className="text-xs text-[color:var(--ds-text-muted)]">
            Gib den 6-stelligen Code aus deiner Authenticator-App ein. Alternativ kannst du einen
            Backup-Code verwenden.
          </p>
          <Input
            id="totp"
            type="text"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="123456 oder XXXX-XXXX-XXXX"
            maxLength={14}
            autoFocus
            className="text-center tracking-widest"
          />
        </div>

        {verify2FA.isError && (
          <p className="text-sm text-red-400">
            {verify2FA.error instanceof Error ? verify2FA.error.message : "Ungültiger Code"}
          </p>
        )}
        {verify2FA.data?.error && !verify2FA.isError && (
          <p className="text-sm text-red-400">
            {verify2FA.data.error === "rate_limited"
              ? "Zu viele Versuche. Bitte später erneut versuchen."
              : verify2FA.data.error === "invalid_token"
                ? "Ungültiger Code. Bitte erneut versuchen."
                : "Verifizierung fehlgeschlagen."}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 text-sm"
            onClick={() => {
              setChallengeToken(null);
              setTotpCode("");
              login.reset();
              verify2FA.reset();
            }}
          >
            Zurück
          </Button>
          <Button
            type="submit"
            loading={verify2FA.isPending}
            disabled={totpCode.length < 6}
            className="flex-1"
          >
            Bestätigen
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((data) => {
        login.mutate(data, {
          onSuccess: (res) => {
            if (res?.error === "2fa_required" && res.challengeToken) {
              setChallengeToken(res.challengeToken);
            }
          },
        });
      })}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="email">E-Mail</Label>
        <Input id="email" type="email" {...register("email")} placeholder="name@kanzlei.de" />
        {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Passwort</Label>
        <Input id="password" type="password" {...register("password")} placeholder="••••••••" />
        {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
      </div>

      {login.isError && (
        <p className="text-sm text-red-400">
          {login.error instanceof Error ? login.error.message : "Anmeldung fehlgeschlagen"}
        </p>
      )}
      {login.data?.error && login.data.error !== "2fa_required" && !login.isError && (
        <p className="text-sm text-red-400">
          {login.data.error === "invalid_credentials"
            ? "E-Mail oder Passwort falsch."
            : login.data.error === "sso_required"
              ? `Bitte melde dich über ${login.data.provider ?? "SSO"} an.`
              : "Anmeldung fehlgeschlagen."}
        </p>
      )}

      <Button type="submit" loading={login.isPending} className="w-full">
        Anmelden
      </Button>
    </form>
  );
}
