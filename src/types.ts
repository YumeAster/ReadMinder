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
  /**
   * 속한 카테고리의 id. null이면 "미분류"다 (미분류는 실제 카테고리가 아니라 이 상태를 부르는 이름이다).
   * 카테고리 기능 이전에 저장된 데이터에는 없어서, 읽을 때 null로 채운다.
   */
  readonly categoryId: string | null;
}

/** 링크를 모아두는 카테고리. 폴더처럼 안에 카테고리를 둘 수 있고, 깊이에 제한이 없다. */
export interface Category {
  readonly id: string;
  /** 사용자에게 보이는 이름. 저장 전에 normalizeCategoryName으로 정리된 값이다 */
  readonly name: string;
  /** 상위 카테고리의 id. null이면 최상위 */
  readonly parentId: string | null;
  /** 만든 시각 (ISO 8601 문자열) */
  readonly createdAt: string;
}

/** 휴지통에 있는 링크. 삭제 전 링크 정보를 그대로 두고, 삭제한 시각만 더한다. */
export interface TrashedLink extends SavedLink {
  /** 휴지통으로 옮긴 시각 (ISO 8601 문자열). 보관 기간 계산의 기준이다 */
  readonly deletedAt: string;
}

/** 실패할 수 있는 작업의 결과. 에러를 던지지 않고 값으로 돌려준다. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string };
