export interface Office {
  id?: string; // FirestoreのドキュメントID
  officeCode?: string; // 事業所整理記号
  officeNumber?: string; // 事業所番号
  corporateNumber?: string; // 法人番号
  prefecture?: string; // 事業所所在都道府県（都道府県コード）
  address?: string; // 事業所所在地
  officeName?: string; // 事業所名称
  phoneNumber?: string; // 電話番号
  ownerName?: string; // 事業主氏名
  createdAt?: Date; // 作成日時
  updatedAt?: Date; // 更新日時
}
