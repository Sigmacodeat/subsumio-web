/**
 * zip-stream — a minimal ZIP writer that streams entries to a Writable one
 * after the other, so an archive of any size never sits in memory (only the
 * current entry and one central-directory record per entry do).
 *
 * Entries are added as complete buffers, so sizes and CRC are known before
 * the local header is written (no data descriptors). Text-like entries are
 * deflated, everything else is stored. ZIP64 records are written exactly
 * when a size, an offset or the entry count needs them, so small archives
 * stay plain ZIP that every tool opens.
 */
import { once } from "node:events";
import type { Writable } from "node:stream";
import { deflateRawSync } from "node:zlib";

const MAX32 = 0xffffffff;
const MAX16 = 0xffff;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getUTCFullYear());
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}
function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function u64(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

interface CentralRecord {
  name: Buffer;
  method: number;
  time: number;
  date: number;
  crc: number;
  csize: number;
  usize: number;
  offset: number;
}

export interface ZipEntryOptions {
  /** Deflate the entry (default: stored). Skipped when it would not shrink. */
  deflate?: boolean;
  mtime?: Date;
}

/** Archive entry names: forward slashes, no leading slash, no `..` segments. */
export function safeEntryName(name: string): string {
  const parts = name
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.replace(/[\u0000-\u001f]/g, "_").trim())
    .filter((p) => p && p !== "." && p !== "..");
  return parts.join("/") || "unnamed";
}

export class ZipStreamWriter {
  private offset = 0;
  private readonly central: CentralRecord[] = [];
  private finished = false;

  /** `forceZip64` writes ZIP64 records even for small archives (tests). */
  constructor(
    private readonly out: Writable,
    private readonly opts: { forceZip64?: boolean } = {}
  ) {}

  get bytesWritten(): number {
    return this.offset;
  }

  get entryCount(): number {
    return this.central.length;
  }

  private async write(buf: Buffer): Promise<void> {
    if (buf.length === 0) return;
    this.offset += buf.length;
    if (!this.out.write(buf)) await once(this.out, "drain");
  }

  async addBuffer(name: string, data: Buffer, opts: ZipEntryOptions = {}): Promise<void> {
    if (this.finished) throw new Error("zip: archive already finished");
    const nameBuf = Buffer.from(safeEntryName(name), "utf8");
    let method = 0;
    let body = data;
    if (opts.deflate && data.length > 0) {
      const z = deflateRawSync(data);
      if (z.length < data.length) {
        method = 8;
        body = z;
      }
    }
    const crc = crc32(data);
    const { time, date } = dosDateTime(opts.mtime ?? new Date());
    const usize = data.length;
    const csize = body.length;
    const localOffset = this.offset;
    const zip64 = this.opts.forceZip64 === true || usize >= MAX32 || csize >= MAX32;

    const extra = zip64 ? Buffer.concat([u16(0x0001), u16(16), u64(usize), u64(csize)]) : null;
    const header = Buffer.concat([
      u32(0x04034b50),
      u16(zip64 ? 45 : 20),
      u16(0x0800), // UTF-8 names
      u16(method),
      u16(time),
      u16(date),
      u32(crc),
      u32(zip64 ? MAX32 : csize),
      u32(zip64 ? MAX32 : usize),
      u16(nameBuf.length),
      u16(extra ? extra.length : 0),
      nameBuf,
      ...(extra ? [extra] : []),
    ]);
    await this.write(header);
    await this.write(body);
    this.central.push({
      name: nameBuf,
      method,
      time,
      date,
      crc,
      csize,
      usize,
      offset: localOffset,
    });
  }

  /** Write the central directory and end records. Returns the archive size. */
  async finish(): Promise<number> {
    if (this.finished) return this.offset;
    this.finished = true;
    const cdStart = this.offset;
    const force = this.opts.forceZip64 === true;
    for (const r of this.central) {
      const bigU = force || r.usize >= MAX32;
      const bigC = force || r.csize >= MAX32;
      const bigO = force || r.offset >= MAX32;
      const fields: Buffer[] = [];
      if (bigU) fields.push(u64(r.usize));
      if (bigC) fields.push(u64(r.csize));
      if (bigO) fields.push(u64(r.offset));
      const extra =
        fields.length > 0
          ? Buffer.concat([u16(0x0001), u16(fields.length * 8), ...fields])
          : Buffer.alloc(0);
      const zip64 = fields.length > 0;
      await this.write(
        Buffer.concat([
          u32(0x02014b50),
          u16(zip64 ? 45 : 20), // version made by (MS-DOS/FAT attributes)
          u16(zip64 ? 45 : 20),
          u16(0x0800),
          u16(r.method),
          u16(r.time),
          u16(r.date),
          u32(r.crc),
          u32(bigC ? MAX32 : r.csize),
          u32(bigU ? MAX32 : r.usize),
          u16(r.name.length),
          u16(extra.length),
          u16(0), // comment
          u16(0), // disk
          u16(0), // internal attributes
          u32(0), // external attributes
          u32(bigO ? MAX32 : r.offset),
          r.name,
          extra,
        ])
      );
    }
    const cdSize = this.offset - cdStart;
    const count = this.central.length;
    const zip64End = force || count >= MAX16 || cdStart >= MAX32 || cdSize >= MAX32;
    if (zip64End) {
      const eocd64Offset = this.offset;
      await this.write(
        Buffer.concat([
          u32(0x06064b50),
          u64(44),
          u16(45),
          u16(45),
          u32(0),
          u32(0),
          u64(count),
          u64(count),
          u64(cdSize),
          u64(cdStart),
        ])
      );
      await this.write(Buffer.concat([u32(0x07064b50), u32(0), u64(eocd64Offset), u32(1)]));
    }
    await this.write(
      Buffer.concat([
        u32(0x06054b50),
        u16(0),
        u16(0),
        u16(zip64End ? MAX16 : count),
        u16(zip64End ? MAX16 : count),
        u32(zip64End ? MAX32 : cdSize),
        u32(zip64End ? MAX32 : cdStart),
        u16(0),
      ])
    );
    return this.offset;
  }
}
