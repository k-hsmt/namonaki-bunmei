import {terrainReviewIndex as trialIndex,terrainReviewCase as trialCase} from './terrain-trial-review-page.mjs';
const normal=html=>html
 .replaceAll('切り土あり・独立試走','切り土あり・本番v8')
 .replaceAll('切り土ありの独立試走','切り土ありの本番v8')
 .replaceAll('D4 丘陵の切り土・独立比較','D4 丘陵の切り土・本番比較')
 .replaceAll('この試走では','この初版では')
 .replaceAll('本番採用の判断材料です。','受け入れ済みの小規模整地を本番の完全保存で比較しています。')
 .replaceAll('切り土試走の専用保存','本番v8の保存')
 .replaceAll('v7保存は通常画面に読み込めます。切り土試走の保存は通常画面では読み込めません。比較用の専用readerで検証しています。','両方の保存を通常画面へ読み込めます。importだけではブラウザ保存を上書きせず、明示保存の成功後に切り替わります。')
 .replaceAll('本番化後の景観','本番の景観');
export const terrainReviewIndex=m=>normal(trialIndex(m));
export const terrainReviewCase=d=>normal(trialCase(d));
