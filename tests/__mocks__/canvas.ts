// Mock for canvas package

export function createCanvas(width: number, height: number) {
  const imageData = {
    data: new Uint8ClampedArray(width * height * 4).fill(128),
    width,
    height,
  };
  return {
    getContext: () => ({
      drawImage: jest.fn(),
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
      }),
      putImageData: jest.fn(),
      getImageData: jest.fn(() => imageData),
    }),
    width,
    height,
  };
}

export async function loadImage(_src: string) {
  return { width: 640, height: 480 };
}
