"use client";

import { useEffect, useRef, useState } from "react";

type Quality = { face_px: number; sharpness: number; min_face_px: number; min_sharpness: number };
type Result =
  | { status: "ok"; verdict: "FAKE" | "UNCERTAIN" | "REAL"; p_fake: number; fake_threshold: number; uncertain_from: number; quality: Quality; face_png: string }
  | { status: "no_face" | "low_quality" | "error"; message: string; quality?: Quality };

const VERDICT = {
  FAKE: { title: "Likely manipulated", tone: "border-red-400/50 bg-red-500/10 text-red-100", dot: "bg-red-400", note: "The score is above the fake threshold." },
  UNCERTAIN: { title: "Uncertain", tone: "border-amber-400/50 bg-amber-500/10 text-amber-100", dot: "bg-amber-400", note: "Not enough evidence to call it real or fake. Try a sharper, front-facing photo." },
  REAL: { title: "No manipulation detected", tone: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100", dot: "bg-emerald-400", note: "This is not a guarantee that the image is genuine." },
} as const;

const MAX_SIDE = 1280;

async function prepare(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.92));
}

export default function Detector() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urlRef = useRef("");

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function setPicked(f: File | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = f ? URL.createObjectURL(f) : "";
    setPreview(urlRef.current);
    setFile(f);
  }

  function pick(f: File | undefined | null) {
    setResult(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setResult({ status: "error", message: "Please choose an image file (JPG, PNG or WebP)." });
      return;
    }
    setPicked(f);
  }

  async function run() {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    setElapsed(0);
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000);
    try {
      const blob = await prepare(file);
      const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: blob });
      const data = (await res.json().catch(() => null)) as Result | null;
      if (!data) setResult({ status: "error", message: "The server took too long. Please try again." });
      else setResult(data);
    } catch {
      setResult({ status: "error", message: "The image could not be sent. Check your connection and try again." });
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  const ok = result && result.status === "ok" ? result : null;
  const V = ok ? VERDICT[ok.verdict] : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label
            htmlFor="face-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={`flex aspect-square w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed text-center transition-colors ${drag ? "border-violet-300 bg-violet-400/10" : "border-white/20 hover:border-white/40"}`}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Selected face to analyse" className="h-full w-full object-contain" />
            ) : (
              <span className="px-6 text-sm text-zinc-300">
                <span className="block text-base font-medium text-zinc-100">Drop a face photo here</span>
                or click to choose a JPG, PNG or WebP. One sharp, front-facing face works best.
              </span>
            )}
          </label>
          <input id="face-file" ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={!file || busy}
              className="rounded-lg bg-violet-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-violet-200 disabled:opacity-40"
            >
              {busy ? `Analysing (${elapsed}s)` : "Analyse image"}
            </button>
            {file && !busy && (
              <button type="button" onClick={() => { setPicked(null); setResult(null); if (input.current) input.current.value = ""; }} className="text-sm text-zinc-400 underline underline-offset-2 hover:text-zinc-200">
                Clear
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-500">The image is analysed in memory and is not stored. Typical time: a few seconds, longer on the first request.</p>
        </div>

        <div role="status" aria-live="polite">
          {busy && (
            <div className="rounded-xl border border-white/10 p-5">
              <p className="text-sm text-zinc-300">Finding the face, checking quality, and scoring it.</p>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="sweep h-full w-1/3 rounded-full bg-violet-300" />
              </div>
            </div>
          )}

          {!busy && !result && (
            <div className="rounded-xl border border-white/10 p-5 text-sm text-zinc-400">
              The result appears here: a verdict, the probability of manipulation, and the exact face crop the model scored.
            </div>
          )}

          {!busy && result && result.status !== "ok" && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-5 text-sm text-amber-100">
              <p className="font-semibold">{result.status === "low_quality" ? "Input quality too low" : result.status === "no_face" ? "No face found" : "Something went wrong"}</p>
              <p className="mt-1">{result.message}</p>
              {result.quality && (
                <p className="mt-2 text-xs text-amber-200/80">
                  Face size {result.quality.face_px}px (needs {result.quality.min_face_px}px). Sharpness {result.quality.sharpness} (needs {result.quality.min_sharpness}).
                </p>
              )}
            </div>
          )}

          {!busy && ok && V && (
            <div className="space-y-4">
              <div className={`rounded-xl border p-4 ${V.tone}`}>
                <p className="flex items-center gap-2 font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${V.dot}`} />
                  {V.title}
                </p>
                <p className="mt-1 text-sm">{V.note}</p>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-zinc-300">Probability of manipulation</span>
                  <span className="font-mono text-zinc-100">{(ok.p_fake * 100).toFixed(1)}%</span>
                </div>
                <div className="relative mt-2 h-2.5 w-full rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-violet-300" style={{ width: `${Math.max(1, ok.p_fake * 100)}%` }} />
                  <span className="absolute top-[-3px] h-4 w-px bg-amber-300" style={{ left: `${ok.uncertain_from * 100}%` }} aria-hidden="true" />
                  <span className="absolute top-[-3px] h-4 w-px bg-red-300" style={{ left: `${ok.fake_threshold * 100}%` }} aria-hidden="true" />
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">Amber line: uncertain from {(ok.uncertain_from * 100).toFixed(0)}%. Red line: called fake from {(ok.fake_threshold * 100).toFixed(0)}%.</p>
              </div>

              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`data:image/png;base64,${ok.face_png}`} alt="The face crop the model scored" className="h-24 w-24 rounded-lg border border-white/10 object-cover" />
                <p className="text-xs text-zinc-400">
                  The face crop the model scored. Face {ok.quality.face_px}px, sharpness {ok.quality.sharpness}.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-5 border-t border-white/10 pt-4 text-xs text-zinc-400">
        Prototype. Not a security guarantee and not proof. A probability from a model trained on one manipulation method and a small set of synthetic faces. Read the{" "}
        <a href="/method" className="underline underline-offset-2 hover:text-zinc-200">method and limits</a> before relying on any result.
      </p>
    </div>
  );
}
