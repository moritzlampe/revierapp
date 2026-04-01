"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "E-Mail oder Passwort ist falsch."
          : "Anmeldung fehlgeschlagen. Bitte versuche es erneut."
      );
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-ra-green-500 flex items-center justify-center text-xl mx-auto mb-4">
            🌲
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Revier<span className="text-ra-green-500">App</span>
          </h1>
          <p className="text-sm text-gray-500 mt-2">Anmelden als Revierinhaber</p>
        </div>
        <form onSubmit={handleLogin} className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ra-green-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ra-green-500 focus:border-transparent"
                required
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-ra-green-800 text-white font-semibold text-sm hover:bg-ra-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Anmelden..." : "Anmelden"}
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <a href="/register" className="text-xs text-ra-green-800 hover:text-ra-green-700 font-medium">
              Konto erstellen →
            </a>
            <a href="/jes-login" className="text-xs text-gray-500 hover:text-gray-700">
              JES-Inhaber Login
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
