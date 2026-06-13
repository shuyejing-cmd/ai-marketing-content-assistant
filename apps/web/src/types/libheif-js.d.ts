declare module 'libheif-js/wasm-bundle' {
  type DisplayImage = {
    data: Uint8Array;
    width: number;
    height: number;
  };

  type HeifImage = {
    get_width(): number;
    get_height(): number;
    display(
      target: DisplayImage,
      callback: (result: DisplayImage | null | undefined) => void,
    ): void;
    free(): void;
  };

  class HeifDecoder {
    decode(input: Uint8Array): HeifImage[];
    decoder?: {
      delete?: () => void;
    };
  }

  const libheif: {
    ready: Promise<unknown>;
    HeifDecoder: typeof HeifDecoder;
  };

  export default libheif;
}
