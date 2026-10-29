import base64
import io
import math
import os
import shutil
import stat
import subprocess
import tempfile

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(os.path.dirname(HERE), "model")

IMG_SIZE = 299
THRESHOLD = 0.982
DEMO_FAKE = max(THRESHOLD, 0.80)
UNCERTAIN_FROM = 0.5 * DEMO_FAKE
QUALITY_MIN_FACE = 48
QUALITY_MIN_SHARP = 40.0
MAX_SIDE = 1280
CRF = 40

_sessions = {}
_ffmpeg = None


def session(name):
    s = _sessions.get(name)
    if s is None:
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        opts.log_severity_level = 3
        s = ort.InferenceSession(os.path.join(MODEL_DIR, name + ".onnx"), opts, providers=["CPUExecutionProvider"])
        _sessions[name] = s
    return s


def ffmpeg_exe():
    global _ffmpeg
    if _ffmpeg:
        return _ffmpeg
    import imageio_ffmpeg

    src = imageio_ffmpeg.get_ffmpeg_exe()
    if os.access(src, os.X_OK):
        _ffmpeg = src
    else:
        dst = os.path.join(tempfile.gettempdir(), "ffmpeg-bin")
        if not os.path.exists(dst):
            shutil.copyfile(src, dst)
        os.chmod(dst, os.stat(dst).st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        _ffmpeg = dst
    return _ffmpeg


def _bounds(n_in, n_out):
    i = np.arange(n_out)
    start = np.floor(i * n_in / n_out).astype(np.int64)
    end = np.ceil((i + 1) * n_in / n_out).astype(np.int64)
    return start, end


def area_resize(arr, out_h, out_w):
    a = arr.astype(np.float64)
    squeeze = a.ndim == 2
    if squeeze:
        a = a[:, :, None]
    h, w, c = a.shape
    cs = np.zeros((h + 1, w, c), dtype=np.float64)
    np.cumsum(a, axis=0, out=cs[1:])
    s, e = _bounds(h, out_h)
    rows = (cs[e] - cs[s]) / (e - s)[:, None, None]
    cs2 = np.zeros((out_h, w + 1, c), dtype=np.float64)
    np.cumsum(rows, axis=1, out=cs2[:, 1:])
    s, e = _bounds(w, out_w)
    out = (cs2[:, e] - cs2[:, s]) / (e - s)[None, :, None]
    return out[:, :, 0] if squeeze else out


def resize_rgb(rgb, size):
    h, w = rgb.shape[:2]
    if size[0] <= h and size[1] <= w:
        return np.clip(np.rint(area_resize(rgb, size[0], size[1])), 0, 255).astype(np.uint8)
    return np.array(Image.fromarray(rgb).resize((size[1], size[0]), Image.BILINEAR))


def nms(boxes, scores, threshold, method="union", plus_one=False):
    if boxes.shape[0] == 0:
        return np.zeros(0, dtype=np.int64)
    d = 1.0 if plus_one else 0.0
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    area = (x2 - x1 + d) * (y2 - y1 + d)
    order = np.argsort(scores)
    keep = []
    while order.size:
        i = order[-1]
        keep.append(i)
        rest = order[:-1]
        xx1 = np.maximum(x1[i], x1[rest])
        yy1 = np.maximum(y1[i], y1[rest])
        xx2 = np.minimum(x2[i], x2[rest])
        yy2 = np.minimum(y2[i], y2[rest])
        inter = np.maximum(0.0, xx2 - xx1 + d) * np.maximum(0.0, yy2 - yy1 + d)
        if method == "min":
            o = inter / np.minimum(area[i], area[rest])
        else:
            o = inter / (area[i] + area[rest] - inter)
        order = rest[o <= threshold]
    return np.array(keep, dtype=np.int64)


def _rerec(b):
    h = b[:, 3] - b[:, 1]
    w = b[:, 2] - b[:, 0]
    l = np.maximum(w, h)
    b[:, 0] = b[:, 0] + w * 0.5 - l * 0.5
    b[:, 1] = b[:, 1] + h * 0.5 - l * 0.5
    b[:, 2] = b[:, 0] + l
    b[:, 3] = b[:, 1] + l
    return b


def _bbreg(b, reg):
    w = b[:, 2] - b[:, 0] + 1
    h = b[:, 3] - b[:, 1] + 1
    out = b.copy()
    out[:, 0] = b[:, 0] + reg[:, 0] * w
    out[:, 1] = b[:, 1] + reg[:, 1] * h
    out[:, 2] = b[:, 2] + reg[:, 2] * w
    out[:, 3] = b[:, 3] + reg[:, 3] * h
    return out


def _pad(b, w, h):
    t = np.trunc(b).astype(np.int64)
    x, y, ex, ey = t[:, 0].copy(), t[:, 1].copy(), t[:, 2].copy(), t[:, 3].copy()
    x[x < 1] = 1
    y[y < 1] = 1
    ex[ex > w] = w
    ey[ey > h] = h
    return y, ey, x, ex


def _norm(x):
    return ((x - 127.5) * 0.0078125).astype(np.float32)


def _crops(img, boxes, size):
    h, w = img.shape[:2]
    y, ey, x, ex = _pad(boxes, w, h)
    out = []
    for k in range(len(y)):
        if ey[k] > (y[k] - 1) and ex[k] > (x[k] - 1):
            patch = img[y[k] - 1:ey[k], x[k] - 1:ex[k]].astype(np.float32)
            out.append(area_resize(patch, size, size))
    if not out:
        return None
    return _norm(np.stack(out).transpose(0, 3, 1, 2))


def detect_faces(rgb, minsize=40, thresholds=(0.6, 0.7, 0.7), factor=0.709):
    h, w = rgb.shape[:2]
    img = rgb.astype(np.float32)
    pnet, rnet, onet = session("pnet"), session("rnet"), session("onet")
    m = 12.0 / minsize
    minl = min(h, w) * m
    scales = []
    s = m
    while minl >= 12:
        scales.append(s)
        s *= factor
        minl *= factor

    all_boxes = []
    for scale in scales:
        im = area_resize(img, int(h * scale + 1), int(w * scale + 1))
        x = _norm(im.transpose(2, 0, 1)[None])
        reg, prob = pnet.run(None, {"x": x})
        p = prob[0, 1]
        ys, xs = np.nonzero(p >= thresholds[0])
        if ys.size == 0:
            continue
        score = p[ys, xs]
        r = reg[0][:, ys, xs].T
        q1x = np.floor((2 * xs + 1) / scale)
        q1y = np.floor((2 * ys + 1) / scale)
        q2x = np.floor((2 * xs + 12) / scale)
        q2y = np.floor((2 * ys + 12) / scale)
        bb = np.stack([q1x, q1y, q2x, q2y, score], axis=1)
        keep = nms(bb[:, :4], bb[:, 4], 0.5)
        all_boxes.append(np.concatenate([bb[keep], r[keep]], axis=1))
    if not all_boxes:
        return np.zeros((0, 5))
    boxes = np.concatenate(all_boxes, axis=0)
    keep = nms(boxes[:, :4], boxes[:, 4], 0.7)
    boxes = boxes[keep]
    regw = boxes[:, 2] - boxes[:, 0]
    regh = boxes[:, 3] - boxes[:, 1]
    b = np.stack(
        [
            boxes[:, 0] + boxes[:, 5] * regw,
            boxes[:, 1] + boxes[:, 6] * regh,
            boxes[:, 2] + boxes[:, 7] * regw,
            boxes[:, 3] + boxes[:, 8] * regh,
            boxes[:, 4],
        ],
        axis=1,
    )
    b = _rerec(b)

    data = _crops(img, b, 24)
    if data is None:
        return np.zeros((0, 5))
    reg, prob = rnet.run(None, {"x": data})
    score = prob[:, 1]
    ok = score > thresholds[1]
    b = np.concatenate([b[ok, :4], score[ok, None]], axis=1)
    reg = reg[ok]
    if b.shape[0] == 0:
        return np.zeros((0, 5))
    keep = nms(b[:, :4], b[:, 4], 0.7)
    b, reg = b[keep], reg[keep]
    b = _bbreg(b, reg)
    b = _rerec(b)

    data = _crops(img, b, 48)
    if data is None:
        return np.zeros((0, 5))
    reg, _pts, prob = onet.run(None, {"x": data})
    score = prob[:, 1]
    ok = score > thresholds[2]
    b = np.concatenate([b[ok, :4], score[ok, None]], axis=1)
    reg = reg[ok]
    if b.shape[0] == 0:
        return np.zeros((0, 5))
    b = _bbreg(b, reg)
    keep = nms(b[:, :4], b[:, 4], 0.7, method="min", plus_one=True)
    return b[keep]


def largest_box(rgb):
    boxes = detect_faces(rgb)
    best, best_area = None, 0.0
    for b in boxes:
        if b[4] < 0.9:
            continue
        a = (b[2] - b[0]) * (b[3] - b[1])
        if a > best_area:
            best, best_area = b[:4], a
    return best


def crop_face(rgb, box, size, margin=0.30):
    x1, y1, x2, y2 = [float(v) for v in box]
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    s = max(x2 - x1, y2 - y1) * (1 + margin)
    h, w = rgb.shape[:2]
    x1, y1 = int(max(0, cx - s / 2)), int(max(0, cy - s / 2))
    x2, y2 = int(min(w, cx + s / 2)), int(min(h, cy + s / 2))
    if x2 - x1 < 20 or y2 - y1 < 20:
        return None
    return resize_rgb(rgb[y1:y2, x1:x2], (size, size))


def laplacian_var(gray):
    p = np.pad(gray, 1, mode="reflect")
    lap = p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] - 4.0 * p[1:-1, 1:-1]
    return float(lap.var())


def face_quality(rgb, box):
    h, w = rgb.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
    if x2 - x1 <= 0 or y2 - y1 <= 0:
        return 0, 0.0
    patch = rgb[y1:y2, x1:x2].astype(np.float64)
    gray = patch[:, :, 0] * 0.299 + patch[:, :, 1] * 0.587 + patch[:, :, 2] * 0.114
    gray = np.clip(np.rint(gray), 0, 255)
    g = area_resize(gray, 128, 128) if min(gray.shape) >= 128 else np.array(Image.fromarray(gray.astype(np.uint8)).resize((128, 128), Image.BILINEAR), dtype=np.float64)
    g = np.clip(np.rint(g), 0, 255)
    return min(x2 - x1, y2 - y1), laplacian_var(g)


def match_domain(pil):
    pil = pil.convert("RGB").copy()
    pil.thumbnail((MAX_SIDE, MAX_SIDE))
    d = tempfile.mkdtemp()
    src, mid, dst = os.path.join(d, "in.png"), os.path.join(d, "out.mp4"), os.path.join(d, "out.png")
    try:
        pil.save(src)
        exe = ffmpeg_exe()
        r = subprocess.run(
            [exe, "-y", "-loglevel", "error", "-i", src, "-frames:v", "1", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
             "-c:v", "libx264", "-crf", str(CRF), "-preset", "medium", "-pix_fmt", "yuv420p", mid],
            capture_output=True, timeout=30,
        )
        if r.returncode != 0 or not os.path.exists(mid):
            return pil
        r = subprocess.run([exe, "-y", "-loglevel", "error", "-i", mid, "-frames:v", "1", dst], capture_output=True, timeout=30)
        if r.returncode != 0 or not os.path.exists(dst):
            return pil
        return Image.open(dst).convert("RGB")
    finally:
        shutil.rmtree(d, ignore_errors=True)


def score_crop(crop):
    x = (crop.astype(np.float32) / 255.0 - 0.5) / 0.5
    x = x.transpose(2, 0, 1)
    batch = np.stack([x, x[:, :, ::-1].copy()]).astype(np.float32)
    logits = session("xception").run(None, {"x": batch})[0].reshape(-1).astype(np.float64)
    logit = float(logits.mean())
    return 1.0 / (1.0 + math.exp(-logit))


def verdict_for(p):
    if p >= DEMO_FAKE:
        return "FAKE"
    if p >= UNCERTAIN_FROM:
        return "UNCERTAIN"
    return "REAL"


def png_b64(arr):
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def analyze(data):
    pil = Image.open(io.BytesIO(data))
    pil = ImageOps.exif_transpose(pil).convert("RGB")
    pil.thumbnail((MAX_SIDE, MAX_SIDE))
    full = np.array(pil)
    box = largest_box(full)
    if box is None:
        return {"status": "no_face", "message": "No face was detected. Upload a clear, front-facing face image."}
    size_px, sharp = face_quality(full, box)
    info = {"face_px": int(size_px), "sharpness": round(sharp, 1), "min_face_px": QUALITY_MIN_FACE, "min_sharpness": QUALITY_MIN_SHARP}
    if size_px < QUALITY_MIN_FACE or sharp < QUALITY_MIN_SHARP:
        return {
            "status": "low_quality",
            "message": "The face is too small or too blurry for a reliable check, so no real or fake decision is made.",
            "quality": info,
        }
    rgb = np.array(match_domain(pil))
    box2 = largest_box(rgb)
    if box2 is None:
        box2 = box
    crop = crop_face(rgb, box2, IMG_SIZE)
    if crop is None:
        return {"status": "no_face", "message": "The face crop failed. Try another photo."}
    p = score_crop(crop)
    return {
        "status": "ok",
        "verdict": verdict_for(p),
        "p_fake": round(p, 4),
        "fake_threshold": round(DEMO_FAKE, 3),
        "uncertain_from": round(UNCERTAIN_FROM, 3),
        "quality": info,
        "face_png": png_b64(crop),
    }
