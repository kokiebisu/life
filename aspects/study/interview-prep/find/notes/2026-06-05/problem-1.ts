// ============================================================
// 課題1: BatchProcessor
// ============================================================
// ユーザーイベント（クリック / view 等）をバッファして、サイズ or 時間で
// 外部 API に POST するクラス。実際の analytics SDK でよくある形。
//
// このコードを読んで、面接官として深掘りされる前提で:
//   - 何のコードか
//   - 設計の意図
//   - 気になる点 / 改善したい点
// を整理して話してください。
// ============================================================

type Event = {
  userId: string;
  type: string;
  payload: any;
  timestamp: number;
};

type BatchProcessorOptions = {
  maxBatchSize: number;
  flushIntervalMs: number;
  endpoint: string;
  maxRetries?: number;
};

export class BatchProcessor {
  private buffer: Event[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(private options: BatchProcessorOptions) {
    this.options.maxRetries = this.options.maxRetries ?? 3;
  }

  public push(event: Event): void {
    this.buffer.push(event);

    if (this.buffer.length >= this.options.maxBatchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.options.flushIntervalMs);
    }
  }

  public async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.buffer.length === 0) return;

    this.flushing = true;
    const batch = this.buffer;
    this.buffer = [];

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    let attempt = 0;
    while (attempt < this.options.maxRetries!) {
      try {
        const res = await fetch(this.options.endpoint, {
          method: "POST",
          body: JSON.stringify(batch),
        });
        if (res.ok) {
          this.flushing = false;
          return;
        }
        attempt++;
      } catch (e) {
        attempt++;
      }
    }

    console.error("Batch failed after retries", batch.length);
    this.flushing = false;
  }

  public stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// ---- Usage ----
const processor = new BatchProcessor({
  maxBatchSize: 100,
  flushIntervalMs: 5000,
  endpoint: "https://api.example.com/events",
});

processor.push({
  userId: "u1",
  type: "click",
  payload: { x: 10 },
  timestamp: Date.now(),
});
