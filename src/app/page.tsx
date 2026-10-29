import Link from "next/link";
import Detector from "../components/Detector";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20">
      <section className="rise pb-8 pt-10 sm:pt-14">
        <p className="text-xs uppercase tracking-[0.2em] text-violet-300">Biometric image forensics</p>
        <h1 className="font-display mt-3 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Is this face photo manipulated?
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-300">
          Upload a face photo. A neural network trained on face-swap and GAN faces returns a probability, shows the exact crop it scored, and refuses to guess when the photo is too small or blurry.
        </p>
      </section>

      <Detector />

      <section className="mt-12 grid gap-8 md:grid-cols-3">
        <div>
          <h2 className="font-display text-lg font-semibold">What it measured</h2>
          <p className="mt-2 text-sm text-zinc-300">
            On held-out test images from its training sources, video-level AUC 0.946 and 1.5% of real faces wrongly flagged. See the full table on the method page.
          </p>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">What it does not do</h2>
          <p className="mt-2 text-sm text-zinc-300">
            It catches only about 72% of face-swap fakes and 36% of StyleGAN faces at its strict threshold, and it was not tested on modern AI image generators. Treat it as a screening aid.
          </p>
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">How it is built</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Xception network, MTCNN face detector and a compression-matching step, all running as ONNX models in a Python function on Vercel.{" "}
            <Link href="/method" className="underline underline-offset-2 hover:text-white">Method and accuracy</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
