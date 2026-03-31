export default function LoginPage() {
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
              <input
                type="email"
                placeholder="name@example.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <button className="w-full py-2.5 rounded-lg bg-ra-green-800 text-white font-semibold text-sm hover:bg-ra-green-700">
              Magic Link senden
            </button>
          </div>
          <div className="mt-4 text-center">
            <a href="/jes-login" className="text-xs text-gray-500 hover:text-gray-700">
              Als JES-Inhaber anmelden →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
