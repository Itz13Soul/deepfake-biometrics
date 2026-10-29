import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Method and accuracy",
  description: "How the deepfake detector was trained and tested, the measured results, and the limits.",
};

const TEST = [
  { set: "All test items", level: "Video", real: 678, fake: 525, auc: "0.946", acc: "75.7%", rec: "46.3%", prec: "96.1%" },
  { set: "All test items", level: "Frame", real: 1380, fake: 1274, auc: "0.966", acc: "83.9%", rec: "68.5%", prec: "97.1%" },
  { set: "FF++ video faces", level: "Video", real: 18, fake: 150, auc: "0.987", acc: "75.0%", rec: "72.0%", prec: "100%" },
  { set: "FFHQ vs StyleGAN", level: "Frame", real: 375, fake: 375, auc: "0.882", acc: "66.7%", rec: "36.0%", prec: "93.1%" },
];

const SOURCES = [
  { src: "FFHQ (real)", kind: "Real", n: 375, rate: "2.7%", meaning: "false-fake rate" },
  { src: "FF++ video faces (real)", kind: "Real", n: 18, rate: "0.0%", meaning: "false-fake rate" },
  { src: "LFW (real)", kind: "Real", n: 60, rate: "0.0%", meaning: "false-fake rate" },
  { src: "UTKFace, Indian-labelled (real)", kind: "Real", n: 225, rate: "0.0%", meaning: "false-fake rate" },
  { src: "FF++ Deepfakes (fake)", kind: "Fake", n: 150, rate: "72.0%", meaning: "detected" },
  { src: "StyleGAN (fake)", kind: "Fake", n: 375, rate: "36.0%", meaning: "detected" },
];

const ROBUST = [
  { px: 299, auc: "0.954" },
  { px: 128, auc: "0.950" },
  { px: 64, auc: "0.940" },
  { px: 48, auc: "0.922" },
];

export default function MethodPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-20 pt-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Method and accuracy</h1>
      <p className="mt-3 max-w-3xl text-zinc-300">
        Developed by Divyansh Srivastava. Every number below comes from the evaluation run that produced the deployed model. Nothing here is estimated or rounded in the model&apos;s favour.
      </p>

      <h2 className="font-display mt-10 text-xl font-semibold">Pipeline</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
        <li>The image is resized to at most 1280 px on its longest side.</li>
        <li>MTCNN finds the largest face. If the face is under 48 px or its sharpness is under 40, the system makes no decision.</li>
        <li>The image is passed through one H.264 compression step at CRF 40, because the training videos were compressed the same way.</li>
        <li>The face is cropped with a 30% margin and resized to 299 x 299 px.</li>
        <li>An Xception network pretrained on ImageNet and fine-tuned for this task scores the crop and its mirror image. The two scores are averaged.</li>
        <li>The result is called fake only at a probability of 98.2% or higher, uncertain from 49.1%, and otherwise no manipulation detected.</li>
      </ol>

      <h2 className="font-display mt-10 text-xl font-semibold">Training data</h2>
      <p className="mt-3 max-w-3xl text-sm text-zinc-300">
        17,680 face crops: FaceForensics++ (real videos and Deepfakes-method fakes, c40 compression), FFHQ real faces and StyleGAN fake faces (2,500 each), UTKFace Indian-labelled real faces (1,500), and LFW real faces (400). Videos and images were split 70, 15 and 15 percent into train, validation and test before any scoring. The decision threshold was chosen on the validation split so that at most 2% of real faces from each real source are flagged fake.
      </p>

      <h2 className="font-display mt-10 text-xl font-semibold">Test results</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr><th className="py-2 pr-3">Set</th><th className="pr-3">Level</th><th className="pr-3">Real</th><th className="pr-3">Fake</th><th className="pr-3">AUC</th><th className="pr-3">Accuracy</th><th className="pr-3">Recall</th><th>Precision</th></tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-zinc-300">
            {TEST.map((r) => (
              <tr key={r.set + r.level}><td className="py-2 pr-3">{r.set}</td><td className="pr-3">{r.level}</td><td className="pr-3">{r.real}</td><td className="pr-3">{r.fake}</td><td className="pr-3">{r.auc}</td><td className="pr-3">{r.acc}</td><td className="pr-3">{r.rec}</td><td>{r.prec}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Overall video-level AUC 95% bootstrap interval: 0.934 to 0.956. Fake is the positive class. Recall is low because the threshold is deliberately strict.</p>

      <h2 className="font-display mt-10 text-xl font-semibold">Per source, at the fixed threshold</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr><th className="py-2 pr-3">Source</th><th className="pr-3">Items</th><th className="pr-3">Rate</th><th>Meaning</th></tr>
          </thead>
          <tbody className="divide-y divide-white/10 text-zinc-300">
            {SOURCES.map((r) => (
              <tr key={r.src}><td className="py-2 pr-3">{r.src}</td><td className="pr-3">{r.n}</td><td className="pr-3">{r.rate}</td><td>{r.meaning}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500">Across all 678 real test items, 10 were wrongly flagged fake (1.5%). Only 18 real items come from FF++ video faces, so that row is not reliable on its own.</p>

      <h2 className="font-display mt-10 text-xl font-semibold">Robustness to small faces</h2>
      <p className="mt-3 max-w-3xl text-sm text-zinc-300">The same test frames were downscaled and re-compressed (JPEG quality 50) before scoring. AUC on all test frames, by face size:</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500"><tr><th className="py-2 pr-3">Face size</th><th>AUC</th></tr></thead>
          <tbody className="divide-y divide-white/10 text-zinc-300">
            {ROBUST.map((r) => (<tr key={r.px}><td className="py-2 pr-3">{r.px} px</td><td>{r.auc}</td></tr>))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display mt-10 text-xl font-semibold">Limits you should know</h2>
      <ul className="mt-3 space-y-3 text-sm text-zinc-300">
        <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">These tests use the same data sources as training, with the splits kept apart. They are not a generalisation result. A cross-dataset test on Celeb-DF v2 was not run.</li>
        <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">The author also tried 29 personal photos (10 AI-generated, 19 real). Of the AI images, 2 were called fake, 6 uncertain, 1 real and 1 had no face found. Of the real photos, 1 was wrongly called fake, 9 uncertain, 8 real and 1 had no face found. This is an informal check, not a benchmark, and it shows the model does not yet cope well with modern phone photos or recent AI generators.</li>
        <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">Only one face-swap method (Deepfakes) and one GAN (StyleGAN) were used for fakes. Other methods, diffusion models and video are not covered.</li>
        <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">The Indian-face data is a labelled subset of UTKFace and covers real faces only. Demographic fairness has not been measured.</li>
        <li className="rounded-xl border border-white/10 bg-white/[0.03] p-4">Not a security guarantee, and not legal advice. A probability, not proof.</li>
      </ul>

      <h2 className="font-display mt-10 text-xl font-semibold">References</h2>
      <ul className="mt-3 space-y-1 text-sm text-zinc-400">
        <li>Rossler et al., FaceForensics++: Learning to Detect Manipulated Facial Images, ICCV 2019.</li>
        <li>Chollet, Xception: Deep Learning with Depthwise Separable Convolutions, CVPR 2017.</li>
        <li>Zhang et al., Joint Face Detection and Alignment using Multi-task Cascaded Convolutional Networks (MTCNN), 2016.</li>
        <li>Karras et al., A Style-Based Generator Architecture for GANs (FFHQ and StyleGAN), CVPR 2019.</li>
        <li>Huang et al., Labeled Faces in the Wild, 2007. Zhang et al., UTKFace, CVPR 2017.</li>
      </ul>
    </main>
  );
}
