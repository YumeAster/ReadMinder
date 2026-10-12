/** 저장된 링크 1개. localStorage에 JSON으로 들어가는 모양이다. */
export interface SavedLink {
  /** 목록에서 항목을 구분하기 위한 고유 ID */
  readonly id: string;
  /** 정리(normalize)된 주소. 항상 http 또는 https */
  readonly url: string;
  /** 화면에 보여줄 제목. 입력이 없으면 도메인이 들어간다 */
  readonly title: string;
  /** 저장 시각 (ISO 8601 문자열) */
  readonly createdAt: string;
  /** "이미 본 링크"로 표시했는지. 1-C 이전에 저장된 데이터에는 없어서, 읽을 때 false로 채운다 */
  readonly seen: boolean;
}

/** 실패할 수 있는 작업의 결과. 에러를 던지지 않고 값으로 돌려준다. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };
