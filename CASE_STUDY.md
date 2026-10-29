# Case study: Deepfake Detection for Biometric Systems

**Live:** https://deepfake-biometrics.vercel.app · **Author:** Divyansh Srivastava

## Problem
Face photos are used for onboarding and identity checks. Manipulated faces (face swaps, GAN faces) can slip through. Most free detectors return a bare "fake/real" label with no quality check and no stated limits.

## Best existing tools and the wedge
Commercial detectors (e.g. Reality Defender, Sensity) and open demos exist and are likely stronger on modern generators. This project does not claim to beat them. Its wedge is transparency: it shows the exact crop it scored, refuses to guess on small or blurry faces, and publishes its measured limits.

## What was built
- Xception classifier (ONNX) with an MTCNN face detector ported to NumPy, run in a Vercel Python function (Hobby plan, 2048 MB).
- H.264 CRF 40 re-encode of the crop to match the compression seen in training.
- Quality gate: face of at least 48 px and a sharpness check; below that it returns "cannot assess".
- Three outcomes: real-looking, uncertain (from 49%), fake (from 98%).
- Next.js front end, privacy page (images analysed in memory, not stored), method page with all tables.

## Measured results (held-out test split from the same sources)
| Measure | Value |
|---|---|
| Video-level AUC | 0.946 (95% CI 0.934–0.956) |
| Frame-level AUC | 0.9655 |
| Real faces wrongly flagged | 1.5% (10 of 678) |
| Fakes caught at strict threshold | about 72% face-swap, 36% StyleGAN |
| AUC at 299 / 128 / 64 / 48 px | 0.954 / 0.950 / 0.940 / 0.922 |

## Honest limits
- Trained on one face-swap method plus a small set of StyleGAN faces; not tested on modern AI image generators.
- No Celeb-DF test was run.
- Informal check on 29 personal photos (10 AI, 19 real; photos are not published): AI photos: 2 flagged fake, 6 uncertain, 1 real, 1 no face. Real photos: 1 flagged fake, 9 uncertain, 8 real, 1 no face. So it is weak on modern images and often says "uncertain".
- A probability, not proof. Not a security guarantee.

## What I learned
Re-creating the training-time compression at inference mattered more than model tweaks. Shipping the limits next to the score is what makes a detector honest.

## Next
Add modern generators to training, run Celeb-DF, add Grad-CAM, and calibrate thresholds on a fresh holdout.
