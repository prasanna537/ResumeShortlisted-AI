"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errMsg } from "@/lib/api";
import { Button, Card, ErrorBanner, Input, Label } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isReg = mode === "register";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, { method: "POST", body: isReg ? form : { email: form.email, password: form.password } });
      router.replace("/");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">ResumeVerify</h1>
          <p className="mt-1 text-sm text-slate-500">Evidence-based resume verification for recruiters</p>
        </div>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-lg font-semibold">{isReg ? "Create your account" : "Sign in"}</h2>
            <ErrorBanner message={error} />
            {isReg && (
              <label className="block">
                <Label>Name</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
              </label>
            )}
            <label className="block">
              <Label>Email</Label>
              <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            </label>
            <label className="block">
              <Label hint={isReg ? "at least 8 characters" : undefined}>Password</Label>
              <Input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete={isReg ? "new-password" : "current-password"} />
            </label>
            <Button type="submit" loading={busy} className="w-full">
              {isReg ? "Create account" : "Sign in"}
            </Button>
          </form>
        </Card>
        <p className="mt-4 text-center text-sm text-slate-600">
          {isReg ? (
            <>Already have an account? <Link href="/login" className="font-medium text-brand-600 hover:underline">Sign in</Link></>
          ) : (
            <>New here? <Link href="/register" className="font-medium text-brand-600 hover:underline">Create an account</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
