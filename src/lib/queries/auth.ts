"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/csrf";
import { api } from "@/lib/api";

export interface LoginInput {
  email: string;
  password: string;
}

export interface TwoFAVerifyInput {
  challengeToken: string;
  token: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  referredBy?: string;
  industry?: string;
}

export function useMe() {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.auth.me(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: LoginInput) => api.auth.login(input),
    onSuccess: (data) => {
      if (data?.user) {
        qc.setQueryData(["auth", "me"], { user: data.user });
        qc.invalidateQueries({ queryKey: ["auth", "me"] });
        router.push("/dashboard");
      }
      // If 2fa_required, the caller (LoginForm) handles the challenge flow.
      // data.error === "2fa_required" + data.challengeToken
    },
  });
}

export function useVerify2FA() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: TwoFAVerifyInput) => api.auth.verify2FA(input),
    onSuccess: (data) => {
      if (data?.user) {
        qc.setQueryData(["auth", "me"], { user: data.user });
        qc.invalidateQueries({ queryKey: ["auth", "me"] });
        router.push("/dashboard");
      }
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (input: RegisterInput) => api.auth.register(input),
    onSuccess: (data) => {
      if (data?.user) {
        qc.setQueryData(["auth", "me"], { user: data.user });
        router.push("/dashboard");
      }
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["auth", "me"] });
      qc.clear();
      router.push("/login");
    },
  });
}

export function use2FASetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => csrfFetch("/api/auth/2fa/setup", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}

export function use2FAVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      csrfFetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}

export function use2FADisable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      csrfFetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth", "me"] }),
  });
}

export function use2FAQrCode(data: string, size: number) {
  return useQuery({
    queryKey: ["auth", "2fa", "qrcode", data, size],
    queryFn: () =>
      csrfFetch("/api/2fa/qrcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, size }),
      }).then((r) => (r.ok ? r.text() : null)),
    enabled: !!data,
  });
}
