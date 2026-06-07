"use client";

import { ArrowLeft, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

function passwordErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "";
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("password") && normalized.includes("characters")) {
    return "密码长度不符合要求，请至少输入 6 位。";
  }

  if (normalized.includes("session")) {
    return "密码设置链接已过期或无效，请回到首页重新发送邮件。";
  }

  return rawMessage ? `设置密码失败：${rawMessage}` : "设置密码失败。";
}

export default function ResetPasswordPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(
    isSupabaseConfigured ? "" : "当前未配置 Supabase，无法设置云端账号密码。",
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    let isMounted = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        setMessage(`读取密码设置状态失败：${error.message}`);
      }
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) return;

    if (password.length < 6) {
      setMessage("密码至少需要 6 位。");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("两次输入的密码不一致。");
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        throw error;
      }

      setPassword("");
      setConfirmPassword("");
      setMessage("密码已设置成功。你现在可以回到首页使用邮箱和密码登录。");
    } catch (error) {
      setMessage(passwordErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-8 sm:px-6">
        <section className="w-full rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 transition hover:text-teal-900"
          >
            <ArrowLeft className="h-4 w-4" />
            返回工作台
          </Link>

          <div className="mt-5 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-teal-700" />
            <h1 className="text-xl font-semibold text-stone-950">设置账号密码</h1>
          </div>

          <p className="mt-2 text-sm leading-6 text-stone-600">
            从邮箱里的设置密码链接进入后，输入新密码即可。Magic Link 老账号请使用同一邮箱设置密码，历史报告会保留在原账号下。
          </p>

          {isLoading ? (
            <div className="mt-5 rounded-md bg-stone-50 px-3 py-4 text-center text-sm text-stone-600">
              <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin text-teal-700" />
              正在读取登录状态
            </div>
          ) : (
            <form onSubmit={(event) => void handleUpdatePassword(event)} className="mt-5 grid gap-3">
              <label className="grid gap-1 text-sm font-medium text-stone-700">
                新密码
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSaving || !session}
                  className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-stone-50"
                  placeholder="至少 6 位"
                  type="password"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium text-stone-700">
                确认新密码
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={isSaving || !session}
                  className="rounded-md border border-stone-300 px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-stone-50"
                  placeholder="再次输入新密码"
                  type="password"
                />
              </label>

              <button
                type="submit"
                disabled={isSaving || !session}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                设置密码
              </button>
            </form>
          )}

          {!isLoading && !session && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-800">
              没有检测到有效的密码设置会话。请回到首页重新发送“忘记密码”邮件，然后从最新邮件链接进入。
            </p>
          )}

          {message && (
            <p className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-700">
              {message}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
