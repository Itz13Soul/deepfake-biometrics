# Deepfake Detection for Biometric Systems

Upload a face photo. An Xception network returns the probability that the face is manipulated, shows the exact crop it scored, and makes no decision when the face is too small or blurry. Every result carries the notice: a probability, not proof.

Live: set after deploy.

## Best existing tools and the wedge

Hiya's free deepfake voice detector and commercial services such as Sensity and Reality Defender cover audio, video and enterprise use. This project is a narrow, transparent image check: it publishes its own error rates, refuses low-quality inputs, and shows the crop it scored. It is not a replacement for a commercial detector.

## How it works

1. The image is resized to at most 1280 px.
2. MTCNN finds the largest face. Faces under 48 px or with sharpness under 40 are rejected.
3. One H.264 CRF 40 compression step matches the training videos.
4. The face is cropped (30% margin) to 299 x 299 px.
5. Xception scores the crop and its mirror image and averages the two.
6. Fake from 98.2%, uncertain from 49.1%, otherwise no manipulation detected.

The trained PyTorch weights were exported to ONNX. `api/core.py` reimplements the MTCNN cascade with ONNX Runtime and NumPy, and `scripts/export_models.py` shows the export. On a test image the port matched the PyTorch reference: face box within 0.1 px and an identical probability to five decimals.

## Evaluation

Reported in full on the Method page. Summary on held-out test items from the training sources (fake is the positive class):

- Video-level AUC 0.946 (95% bootstrap interval 0.934 to 0.956).
- 1.5% of real test items wrongly flagged fake (10 of 678).
- Detection at the strict threshold: 72.0% of FaceForensics++ Deepfakes, 36.0% of StyleGAN faces.
- Robust to small faces: AUC 0.954 at 299 px, 0.922 at 48 px.

## Limits

- Not a generalisation result. A cross-dataset test on Celeb-DF v2 was not run.
- An informal check on 29 personal photos (10 AI-generated, 19 real) was weak: 2 of the 10 AI images were called fake, 6 uncertain, 1 real, 1 without a face; 1 of the 19 real photos was called fake and 9 uncertain.
- One face-swap method and one GAN only. No diffusion images, no video, no fairness measurement.
- Grad-CAM from the original notebook demo is not included in this deployment.

Not a security guarantee. Not legal advice. A probability, not proof.

## Run locally

```
npm install
python -m pip install -r requirements.txt
npm run dev
```

Python function: `api/analyze.py`. Models: `model/*.onnx`. No environment variables or secrets are needed.

## Privacy

Images are analysed in memory and discarded. Nothing is stored.

## License

Copyright (c) 2026 Divyansh Srivastava. All rights reserved. Viewing only; see LICENSE.
