/**
 * Famous faces: a real face morph of two photos.
 *
 * 1. Find 68 face points on each photo (eyes, brows, nose, mouth, jaw) with a
 *    small face model that runs in the browser (hosted on our site, /models).
 * 2. Average the two shapes, add forehead and border points, and cut the
 *    picture into triangles.
 * 3. Warp each photo onto the average shape, triangle by triangle, and blend
 *    them 50/50.
 *
 * The model (about 1.9 MB) only loads when a faces round starts. If a face
 * can't be found, the caller falls back to a simple cross fade.
 */

import Delaunator from "delaunator";

type FaceApi = typeof import("@vladmandic/face-api/dist/face-api.esm.js");
type Pt = [number, number];

/** Working size for the warp (big, so zooming on the face stays sharp). */
const W = 900;
const H = 1125;
/** Size of the final picture (same 4:5 shape as the display). */
const OUT_W = 640;
const OUT_H = 800;

let faceApi: Promise<FaceApi | null> | null = null;

/** Load the face model once per device. */
function loadFaceApi(): Promise<FaceApi | null> {
  if (!faceApi) {
    faceApi = (async () => {
      try {
        const api = await import("@vladmandic/face-api/dist/face-api.esm.js");
        await Promise.all([
          api.nets.tinyFaceDetector.loadFromUri("/models"),
          api.nets.faceLandmark68Net.loadFromUri("/models"),
        ]);
        return api;
      } catch {
        return null;
      }
    })();
  }
  return faceApi;
}

/** Start downloading the model early (e.g. when a faces game starts). */
export function preloadMorph() {
  void loadFaceApi();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Draw the photo filling W×H, keeping faces (usually high in the frame) in view. */
function cover(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) * 0.25, dw, dh);
  return c;
}

async function landmarks(api: FaceApi, canvas: HTMLCanvasElement): Promise<Pt[] | null> {
  // First a quick scan; if no face, a finer one that catches small faces too.
  for (const [inputSize, scoreThreshold] of [[416, 0.3], [608, 0.15]] as const) {
    const result = await api
      .detectSingleFace(canvas, new api.TinyFaceDetectorOptions({ inputSize, scoreThreshold }))
      .withFaceLandmarks();
    if (result) return result.landmarks.positions.map((p) => [p.x, p.y] as Pt);
  }
  return null;
}

/** Even out skin tone and brightness: give both faces the same colour statistics. */
function matchColours(a: HTMLCanvasElement, b: HTMLCanvasElement, box: [number, number, number, number]) {
  const [x, y, w, h] = box.map(Math.round) as [number, number, number, number];
  if (w < 4 || h < 4) return;
  const ca = a.getContext("2d")!;
  const cb = b.getContext("2d")!;
  const da = ca.getImageData(x, y, w, h);
  const db = cb.getImageData(x, y, w, h);

  // Stats from the centre of the face only (skin, eyes, mouth; no hair or background).
  const stats = (d: ImageData) => {
    const sum = [0, 0, 0], sq = [0, 0, 0];
    let n = 0;
    for (let yy = Math.floor(h * 0.25); yy < h * 0.8; yy++) {
      for (let xx = Math.floor(w * 0.25); xx < w * 0.75; xx++) {
        const i = (yy * w + xx) * 4;
        for (let c = 0; c < 3; c++) {
          sum[c] += d.data[i + c];
          sq[c] += d.data[i + c] ** 2;
        }
        n++;
      }
    }
    const mean = sum.map((s) => s / n);
    const std = sq.map((s, c) => Math.sqrt(Math.max(1, s / n - mean[c] ** 2)));
    return { mean, std };
  };
  const sa = stats(da);
  const sb = stats(db);
  const target = {
    mean: sa.mean.map((m, c) => (m + sb.mean[c]) / 2),
    std: sa.std.map((s, c) => (s + sb.std[c]) / 2),
  };
  const apply = (d: ImageData, s: typeof sa) => {
    for (let i = 0; i < d.data.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        d.data[i + c] = ((d.data[i + c] - s.mean[c]) / s.std[c]) * target.std[c] + target.mean[c];
      }
    }
  };
  apply(da, sa);
  apply(db, sb);
  ca.putImageData(da, x, y);
  cb.putImageData(db, x, y);
}

/** Round off the corners of a closed outline (Chaikin smoothing). */
function smooth(points: Pt[], rounds = 3): Pt[] {
  let pts = points;
  for (let r = 0; r < rounds; r++) {
    const next: Pt[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      next.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      next.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    pts = next;
  }
  return pts;
}

/** Soft edged mask in the shape of the face (jaw + forehead), feathered by layering. */
function faceMask(rawOutline: Pt[], centre: Pt): HTMLCanvasElement {
  // Grow the face outline into a head outline: wider for the hair at the sides,
  // a bit higher on top, but not lower at the chin (no neck or collar).
  const [hx, hy] = centre;
  const head = rawOutline.map(([x, y]) => {
    const up = y < hy;
    return [hx + (x - hx) * 1.28, hy + (y - hy) * (up ? 1.12 : 1.02)] as Pt;
  });
  const outline = smooth(head);
  const mask = document.createElement("canvas");
  mask.width = W;
  mask.height = H;
  const ctx = mask.getContext("2d")!;
  const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
  const cy = outline.reduce((s, p) => s + p[1], 0) / outline.length;
  const layers = 18;
  for (let i = 0; i < layers; i++) {
    // From slightly outside the face outline to well inside it: a soft fade.
    const scale = 1.08 - (i / (layers - 1)) * 0.2;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    outline.forEach(([x, y], k) => {
      const px = cx + (x - cx) * scale;
      const py = cy + (y - cy) * scale;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
  }
  return mask;
}

/** Result: two pictures with the same face shape. Show `top` over `base`
 * and change its opacity to sway between the two people. */
export type Morph = { base: string; top: string | null };

/** Fallback when a face can't be found: left half of one, right half of the other. */
function halfAndHalf(a: HTMLCanvasElement, b: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  out.width = OUT_W;
  out.height = OUT_H;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(a, 0, 0, W / 2, H, 0, 0, OUT_W / 2, OUT_H);
  ctx.drawImage(b, W / 2, 0, W / 2, H, OUT_W / 2, 0, OUT_W / 2, OUT_H);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(OUT_W / 2 - 2, 0, 4, OUT_H);
  return out.toDataURL("image/jpeg", 0.9);
}

/**
 * The 68 points only reach the eyebrows. Add forehead points above them so
 * the hairline and forehead move with the face too.
 */
function withForehead(pts: Pt[]): Pt[] {
  const noseTop = pts[27];
  const chin = pts[8];
  const lift = Math.hypot(chin[0] - noseTop[0], chin[1] - noseTop[1]) * 0.95;
  // Direction from chin to nose top = "up" for this face (handles tilted heads).
  const ux = (noseTop[0] - chin[0]) / Math.hypot(noseTop[0] - chin[0], noseTop[1] - chin[1]);
  const uy = (noseTop[1] - chin[1]) / Math.hypot(noseTop[0] - chin[0], noseTop[1] - chin[1]);
  // Dome shape: lifted most in the middle of the forehead, less at the temples.
  const brows = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
  const forehead = brows.map((i, k) => {
    const t = k / (brows.length - 1);
    const dome = 0.7 + 0.45 * Math.sin(Math.PI * t);
    const [x, y] = pts[i];
    return [x + ux * lift * dome, y + uy * lift * dome] as Pt;
  });
  return [...pts, ...forehead];
}

/** Fixed points on the picture's edges so the background warps smoothly. */
const BORDER: Pt[] = [
  [0, 0], [W / 2, 0], [W - 1, 0],
  [0, H / 2], [W - 1, H / 2],
  [0, H - 1], [W / 2, H - 1], [W - 1, H - 1],
];

/** Warp `src` so that its points `from` land on `to`, one triangle at a time. */
function warp(src: HTMLCanvasElement, from: Pt[], to: Pt[], tris: Uint32Array): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const ctx = out.getContext("2d")!;
  // Base layer: the unwarped photo, so hairline gaps between triangles never show.
  ctx.drawImage(src, 0, 0);

  for (let t = 0; t < tris.length; t += 3) {
    const [i, j, k] = [tris[t], tris[t + 1], tris[t + 2]];
    const [x0, y0] = from[i], [x1, y1] = from[j], [x2, y2] = from[k];
    const [u0, v0] = to[i], [u1, v1] = to[j], [u2, v2] = to[k];

    const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
    if (Math.abs(den) < 1e-6) continue;
    // Affine transform mapping the source triangle onto the target one.
    const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den;
    const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den;
    const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den;
    const d = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den;
    const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den;
    const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den;

    // Clip to the target triangle, grown slightly so no seams show.
    const cx = (u0 + u1 + u2) / 3;
    const cy = (v0 + v1 + v2) / 3;
    const grow = (x: number, y: number): Pt => {
      const dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * 1.6, y + (dy / len) * 1.6];
    };
    const p0 = grow(u0, v0), p1 = grow(u1, v1), p2 = grow(u2, v2);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  }
  return out;
}

const cache = new Map<string, Promise<Morph | null>>();

/**
 * Morph two photos into one face. Resolves to a JPEG data URL, or null if
 * the model couldn't load or a face wasn't found (caller falls back).
 */
export function morphFaces(urlA: string, urlB: string): Promise<Morph | null> {
  const key = `${urlA}|${urlB}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        try {
          const api = await loadFaceApi();
          if (!api) return null;
          const [imgA, imgB] = await Promise.all([loadImage(urlA), loadImage(urlB)]);
          const canvasA = cover(imgA);
          const canvasB = cover(imgB);
          const [ptsA, ptsB] = await Promise.all([landmarks(api, canvasA), landmarks(api, canvasB)]);
          if (!ptsA || !ptsB) return { base: halfAndHalf(canvasA, canvasB), top: null };

          const fullA = [...withForehead(ptsA), ...BORDER];
          const fullB = [...withForehead(ptsB), ...BORDER];
          const mid = fullA.map(([x, y], i) => [(x + fullB[i][0]) / 2, (y + fullB[i][1]) / 2] as Pt);
          const tris = Delaunator.from(mid).triangles;

          const warpedA = warp(canvasA, fullA, mid, tris);
          const warpedB = warp(canvasB, fullB, mid, tris);

          // Face outline on the average shape: jaw line, then forehead back across.
          const jaw = mid.slice(0, 17);
          const forehead = mid.slice(68, 78).reverse();
          const outline = [...jaw, ...forehead];
          const xs = outline.map((p) => p[0]);
          const ys = outline.map((p) => p[1]);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);

          matchColours(warpedA, warpedB, [minX, minY, maxX - minX, maxY - minY]);

          // Keep only the head: clothes and backgrounds never line up.
          const mask = faceMask(outline, mid[30]);
          const masked = (src: HTMLCanvasElement) => {
            const c = document.createElement("canvas");
            c.width = W;
            c.height = H;
            const cx = c.getContext("2d")!;
            cx.drawImage(src, 0, 0);
            cx.globalCompositeOperation = "destination-in";
            cx.drawImage(mask, 0, 0);
            return c;
          };
          const headA = masked(warpedA);
          const headB = masked(warpedB);

          // Zoom on the face, 4:5, with some breathing room.
          const fx = (minX + maxX) / 2;
          const fy = (minY + maxY) / 2 - (maxY - minY) * 0.04;
          let cw = (maxX - minX) * 1.6;
          let ch = (maxY - minY) * 1.4;
          if (cw / ch > W / H) ch = (cw * H) / W;
          else cw = (ch * W) / H;
          const sx = fx - cw / 2;
          const sy = fy - ch / 2;

          // Base picture: background + person A. Top picture: person B only.
          const base = document.createElement("canvas");
          base.width = OUT_W;
          base.height = OUT_H;
          const octx = base.getContext("2d")!;
          const bg = octx.createRadialGradient(OUT_W / 2, OUT_H * 0.45, 40, OUT_W / 2, OUT_H / 2, OUT_W * 0.8);
          bg.addColorStop(0, "#3a2466");
          bg.addColorStop(1, "#150a2b");
          octx.fillStyle = bg;
          octx.fillRect(0, 0, OUT_W, OUT_H);
          octx.imageSmoothingQuality = "high";
          octx.drawImage(headA, sx, sy, cw, ch, 0, 0, OUT_W, OUT_H);

          const top = document.createElement("canvas");
          top.width = OUT_W;
          top.height = OUT_H;
          const tctx = top.getContext("2d")!;
          tctx.imageSmoothingQuality = "high";
          tctx.drawImage(headB, sx, sy, cw, ch, 0, 0, OUT_W, OUT_H);

          return { base: base.toDataURL("image/jpeg", 0.92), top: top.toDataURL("image/png") };

        } catch {
          return null;
        }
      })()
    );
  }
  return cache.get(key)!;
}
