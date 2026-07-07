interface BarcodeDetectorResult {
  rawValue: string;
}

interface BarcodeDetectorInstance {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
}

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

export interface CameraQrScanner {
  stop: () => void;
}

export function isCameraQrScannerSupported(): boolean {
  return Boolean(window.BarcodeDetector && navigator.mediaDevices?.getUserMedia);
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export async function startCameraQrScanner(
  video: HTMLVideoElement,
  onResult: (value: string) => void,
): Promise<CameraQrScanner> {
  if (!window.BarcodeDetector) {
    throw new Error("当前 WebView 不支持系统扫码能力，请使用二维码内容导入。");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      // 尽量使用后置摄像头；部分 WebView 不支持 exact，使用 ideal 避免直接失败。
      facingMode: { ideal: "environment" },
    },
    audio: false,
  });
  const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
  let stopped = false;
  let frameId = 0;

  video.srcObject = stream;
  await video.play();

  const detectFrame = async () => {
    if (stopped) return;

    try {
      const codes = await detector.detect(video);
      const rawValue = codes.find((code) => code.rawValue)?.rawValue;
      if (rawValue) {
        onResult(rawValue);
        return;
      }
    } catch {
      // 某些系统在视频首帧未准备好时会抛一次错误，下一帧继续检测即可。
    }

    frameId = window.requestAnimationFrame(() => {
      void detectFrame();
    });
  };

  void detectFrame();

  return {
    stop: () => {
      stopped = true;
      window.cancelAnimationFrame(frameId);
      stopStream(stream);
      video.srcObject = null;
    },
  };
}
