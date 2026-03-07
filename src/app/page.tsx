import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col md:flex-row flex-1 w-full min-h-[calc(100vh-80px)]">
      {/* 獎學金專區 */}
      <Link
        href="/scholarship"
        className="flex-1 flex flex-col items-center justify-center p-12 md:p-16 bg-white hover:bg-blue-50/50 transition-all duration-500 group border-b md:border-b-0 md:border-r border-gray-100"
      >
        <div className="flex flex-col items-center space-y-6 text-center"> {/* 使用 space-y-6 增加垂直間距 */}
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-blcak group-hover:scale-105 transition-transform duration-500">
            獎學金專區
          </h2>
          <p className="text-lg sm:text-xl text-gray-500 max-w-sm">
            探索獎學金資訊與線上申請，助您學習一臂之力
          </p>
        </div>
      </Link>

      {/* 志工專區 */}
      <Link
        href="/volunteer/dashboard"
        className="flex-1 flex flex-col items-center justify-center p-12 md:p-16 bg-white hover:bg-indigo-50/50 transition-all duration-500 group"
      >
        <div className="flex flex-col items-center space-y-6 text-center">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-black group-hover:scale-105 transition-transform duration-500">
            志工專區
          </h2>
          <p className="text-lg sm:text-xl text-gray-500 max-w-sm">
            參與志願服務與活動報名，點亮社區每一個角落
          </p>
        </div>
      </Link>
    </main>
  );
}