export default async function JesInhaberPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  return (
    <div className="h-screen flex flex-col">
      <div className="bg-ra-green-800 text-white px-4 py-3 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-ra-green-500 flex items-center justify-center text-sm">
          🌲
        </div>
        <div>
          <div className="text-sm font-semibold">Jagderlaubnisschein</div>
          <div className="text-[11px] text-white/50">Revierteilkarte · Code: {code}</div>
        </div>
      </div>
      <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-400">
        Revierteilkarte wird geladen...
      </div>
    </div>
  );
}
