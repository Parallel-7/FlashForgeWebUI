declare module 'node-rtsp-stream' {
  import type { ChildProcess } from 'child_process';

  interface NodeRtspStreamOptions {
    name: string;
    streamUrl: string;
    wsPort: number;
    ffmpegOptions?: Record<string, string | number>;
  }

  export default class NodeRtspStream {
    constructor(options: NodeRtspStreamOptions);
    mpeg1Muxer?: {
      stream?: ChildProcess;
    };
    on(event: string, callback: (...args: unknown[]) => void): void;
    stop(): void;
  }
}
