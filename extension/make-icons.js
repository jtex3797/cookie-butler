// 아이콘 그림 파일 생성 (베어 문 쿠키 + 켜진 스위치). 실행: node make-icons.js
// 외부 도구 없이 도형을 직접 계산해 PNG로 저장. 좌표는 64x64 기준.
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const ORANGE = [0xe8, 0x50, 0x0a], CHIP = [0x2a, 0x12, 0x06], WHITE = [0xff, 0xff, 0xff];
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
function inRoundRect(x, y, rx, ry, w, h, r) {
    if (x < rx || x > rx + w || y < ry || y > ry + h) return false;
    const cx = Math.min(Math.max(x, rx + r), rx + w - r);
    const cy = Math.min(Math.max(y, ry + r), ry + h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const CHIPS = [[22, 24, 5.5], [29, 37, 4.5], [17, 42, 3.5], [35, 20, 3.5]];

// 한 점의 색. 없으면 null(투명)
function colorAt(x, y) {
    if (inCircle(x, y, 51.5, 48.5, 6)) return ORANGE;                 // 스위치 손잡이
    if (inRoundRect(x, y, 30, 39.5, 31, 18, 9)) return WHITE;         // 스위치 몸통
    const cookie = inCircle(x, y, 32, 32, 29)
        && !inCircle(x, y, 52, 11, 12) && !inCircle(x, y, 60, 28, 7)  // 베어 문 자리
        && !inRoundRect(x, y, 26.5, 36, 38, 25, 12.5);                // 스위치 둘레 여백
    if (!cookie) return null;
    for (const [cx, cy, r] of CHIPS) if (inCircle(x, y, cx, cy, r)) return CHIP;
    return ORANGE;
}

function render(size) {
    const S = 8; // 가장자리를 부드럽게 하려고 한 칸을 8x8로 나눠 평균
    const px = Buffer.alloc(size * size * 4);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sj = 0; sj < S; sj++) for (let si = 0; si < S; si++) {
            const c = colorAt((i + (si + 0.5) / S) * 64 / size, (j + (sj + 0.5) / S) * 64 / size);
            if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
        const o = (j * size + i) * 4;
        if (a) { px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); }
        px[o + 3] = Math.round(a * 255 / (S * S));
    }
    return px;
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const v of buf) c = crcTable[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
}
function png(size, px) {
    const head = Buffer.alloc(13); head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let j = 0; j < size; j++) px.copy(raw, j * (size * 4 + 1) + 1, j * size * 4, (j + 1) * size * 4);
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

for (const size of [16, 32, 48, 96, 128]) {
    const file = path.join(__dirname, "Extension", "icon_" + size + ".png");
    fs.writeFileSync(file, png(size, render(size)));
    console.log("저장:", file);
}
