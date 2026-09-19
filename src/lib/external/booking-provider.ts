/**
 * 外部予約システム（GMO 等）連携の抽象化。
 *
 * 本デモでは実連携を行わず MockBookingProvider がログを残すだけだが、
 * 予約の登録・変更・取消の実処理からこのインターフェース越しに呼ぶことで、
 * 本番では実装を差し替えるだけで連携できるようにしてある。
 */

export interface ExternalBookingPayload {
  bookingId: string;
  patientId: string;
  surgeryName: string;
  doctorName: string;
  roomName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface ExternalBookingResult {
  ok: boolean;
  externalId?: string;
  message?: string;
}

export interface ExternalBookingProvider {
  readonly name: string;
  create(payload: ExternalBookingPayload): Promise<ExternalBookingResult>;
  update(payload: ExternalBookingPayload): Promise<ExternalBookingResult>;
  cancel(bookingId: string): Promise<ExternalBookingResult>;
}

class MockBookingProvider implements ExternalBookingProvider {
  readonly name = 'mock';

  private log(action: string, detail: unknown): ExternalBookingResult {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[external-booking:mock] ${action}`, detail);
    }
    return { ok: true, externalId: `mock-${Date.now()}` };
  }

  async create(payload: ExternalBookingPayload) {
    return this.log('create', payload.bookingId);
  }

  async update(payload: ExternalBookingPayload) {
    return this.log('update', payload.bookingId);
  }

  async cancel(bookingId: string) {
    return this.log('cancel', bookingId);
  }
}

let provider: ExternalBookingProvider = new MockBookingProvider();

export function getBookingProvider(): ExternalBookingProvider {
  return provider;
}

/** 本番で GMO 等の実装に差し替えるための差込口。 */
export function setBookingProvider(next: ExternalBookingProvider): void {
  provider = next;
}
