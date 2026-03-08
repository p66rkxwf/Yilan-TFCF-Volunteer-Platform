import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-grow flex flex-col md:flex-row">
      {/* 獎學金專區 */}
      <section className="relative flex-1 group overflow-hidden border-b md:border-b-0 md:border-r border-slate-200">
        <div
          className="absolute inset-0 grayscale group-hover:grayscale-0 transition-all duration-700 brightness-[0.3] group-hover:brightness-[0.4] bg-center bg-cover"
          style={{
            backgroundImage:
              'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAT5mWLE9LWo1trwxcvaT83HLYQrpBYSiZZN1j5p04Y3geO4M59Vp4GT1AIkd6N1r3kAJpiqhPoPgAsDpKKPZQNIGK6iESuUczhia7sEJV9TaHLQf-QiSAYhBSOQdKNVE5DCyTqttB2iUVnyXMZFQ8vvgO2z66dXm7KYnuNEMzZai_prg_4oP5ymHTHbjwTEvPZIJa6v_CPKULy0dNtI3p9bava2Wr9bsvbOO1BpOA_BtcOpyztvPzgzEVBTHOATYnOSqAPbn1aW1hP")',
          }}
        />
        <div className="relative h-full flex flex-col justify-center items-center text-center p-8 md:p-16 z-10 min-h-[50vh] md:min-h-0">
          <div className="mb-6 p-4 rounded-full bg-white/10 backdrop-blur-md text-white">
            <span className="material-symbols-outlined text-4xl">school</span>
          </div>
          <h2 className="text-white text-3xl md:text-5xl font-black mb-4 tracking-tight">
            Scholarship Application
          </h2>
          <h3 className="text-white/80 text-xl md:text-2xl font-medium mb-6">
            獎學金申請專區
          </h3>
          <p className="text-slate-300 max-w-md mb-10 leading-relaxed">
            Empowering academic excellence through financial support. Apply for
            our diverse range of merit and need-based scholarships.
          </p>
          <Link
            href="/scholarship"
            className="min-w-[200px] bg-white text-slate-900 font-bold py-4 px-8 rounded-xl hover:bg-primary hover:text-white transition-all transform hover:scale-105 inline-block text-center"
          >
            Start Application
          </Link>
        </div>
      </section>

      {/* 志工專區 */}
      <section className="relative flex-1 group overflow-hidden">
        <div
          className="absolute inset-0 grayscale group-hover:grayscale-0 transition-all duration-700 brightness-[0.3] group-hover:brightness-[0.4] bg-center bg-cover"
          style={{
            backgroundImage:
              'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCj7c-Ld0QMY3IHjxLVZy3CwnJ2g5-bD0CqNT7QLbBj27D63GddCVm5akaMrjBIa9o5NTVnt0suEZdNDKhcoiMrGLc5Y4ido1gya43W2Ha6dGqPsw2VFb76H2n-h-5Yrjyc3-Lb1pKxZ_CQBZdWoUKPznFZPMzjyX_wXTcJS9qACybntsj6zdcZFuk8LEEpdZ2-jypk0_zlIR95U8LwM-93UL7rlNlRitg6dFkt13e67m1zcWzB0eL3oKSTfVNJxBAIojZPsqcjxMYt")',
          }}
        />
        <div className="relative h-full flex flex-col justify-center items-center text-center p-8 md:p-16 z-10 min-h-[50vh] md:min-h-0">
          <div className="mb-6 p-4 rounded-full bg-white/10 backdrop-blur-md text-white">
            <span className="material-symbols-outlined text-4xl">
              volunteer_activism
            </span>
          </div>
          <h2 className="text-white text-3xl md:text-5xl font-black mb-4 tracking-tight">
            Volunteer Registration
          </h2>
          <h3 className="text-white/80 text-xl md:text-2xl font-medium mb-6">
            志工報名專區
          </h3>
          <p className="text-slate-300 max-w-md mb-10 leading-relaxed">
            Join our dedicated community of changemakers. Register to
            participate in impactful service projects and social initiatives.
          </p>
          <Link
            href="/volunteer"
            className="min-w-[200px] bg-transparent border-2 border-white text-white font-bold py-4 px-8 rounded-xl hover:bg-white hover:text-slate-900 transition-all transform hover:scale-105 inline-block text-center"
          >
            Register as Volunteer
          </Link>
        </div>
      </section>
    </main>
  );
}
