// Ambient declarations for image-decoder packages whose own types don't
// expose subpath imports cleanly. v0.27.1 multimodal ingestion needs
// `heic-decode` (no @types package on npm) and `@jsquash/png/encode.js`
// (subpath the package.json exports map doesn't expose).

declare module "heic-decode" {
  interface HeicDecodeResult {
    width: number;
    height: number;
    data: Uint8ClampedArray | Uint8Array;
  }
  interface HeicDecodeOptions {
    buffer: Uint8Array | Buffer;
  }
  const heicDecode: (opts: HeicDecodeOptions) => Promise<HeicDecodeResult>;
  export default heicDecode;
  export const all: (opts: HeicDecodeOptions) => Promise<HeicDecodeResult[]>;
}

declare module "@jsquash/png/encode.js" {
  interface ImageDataLike {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  }
  const encode: (data: ImageDataLike, options?: { bitDepth?: 8 | 16 }) => Promise<ArrayBuffer>;
  export default encode;
  export function init(module?: WebAssembly.Module): Promise<unknown>;
}

declare module "@jsquash/avif/codec/dec/avif_dec.wasm" {
  const path: string;
  export default path;
}

// Mirrors pdf2pic 3.x (dist/types/{options,convert,convertResponse}.d.ts).
// Without `responseType: "buffer"` a conversion WRITES ./<saveFilename>.N.png
// and returns no buffer — keep the response types distinct so that call shape
// is visible to the type checker.
declare module "pdf2pic" {
  interface ConvertOptions {
    density?: number;
    format?: "png" | "jpg" | "jpeg";
    width?: number;
    height?: number;
    /** Keep the page's aspect ratio (gm "^"); default false stretches to width x height. */
    preserveAspectRatio?: boolean;
    quality?: number;
    savePath?: string;
    saveFilename?: string;
    compression?: string;
  }
  type ResponseType = "image" | "base64" | "buffer";
  interface BaseResponse {
    size?: string;
    page?: number;
  }
  /** responseType "image" (the default): file written to disk, no image data returned. */
  interface WriteImageResponse extends BaseResponse {
    name?: string;
    fileSize?: number;
    path?: string;
  }
  interface ToBase64Response extends BaseResponse {
    base64?: string;
  }
  interface BufferResponse extends BaseResponse {
    buffer?: Buffer;
  }
  type ConvertResult = WriteImageResponse | ToBase64Response | BufferResponse;
  interface Converter {
    (page?: number, options?: { responseType?: undefined }): Promise<WriteImageResponse>;
    (page: number, options: { responseType: "image" }): Promise<WriteImageResponse>;
    (page: number, options: { responseType: "base64" }): Promise<ToBase64Response>;
    (page: number, options: { responseType: "buffer" }): Promise<BufferResponse>;
    bulk(
      page: number | number[],
      options?: { responseType?: ResponseType }
    ): Promise<ConvertResult[]>;
    setOptions(): void;
    setGMClass(gmClass: string | boolean): void;
  }
  export function fromBuffer(buffer: Buffer, options?: ConvertOptions): Converter;
  export function fromPath(path: string, options?: ConvertOptions): Converter;
  export function fromBase64(base64: string, options?: ConvertOptions): Converter;
}
