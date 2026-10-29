import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-24 text-center">
      <p className="text-sm text-zinc-400">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">This page does not exist</h1>
      <Link href="/" className="mt-6 inline-block rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5">Back to the detector</Link>
    </main>
  );
}
