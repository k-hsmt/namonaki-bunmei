# Issue #31 D2-A — 地形結果の保存基盤・スキーマ候補

2026-11-06。main `fcc277f`（D1-C #50マージ後）起点。
状態：**独立APIとスキーマ候補のHumanレビュー待ち**。
本編のversion=4、localStorageキー、保存・読込UI、旧セーブ、建設処理は変更しない。
この候補をマージしても新規ゲームの地形は変わらない。

## 1. 今回の位置付けと未確定事項

D0の「生成結果保存」を、実装とfixtureで検証するD2-A。完成したv5ゲームセーブではない。
`initial-terrain-record/schemaVersion=1/status=review-only` という独立の候補形式を使う。
`placementPolicy=null`、各地点`initialPlan=null`を必須とし、有効化判定は常に`PLACEMENT_NOT_APPROVED`で停止する。
D1で見つけた家屋・畑の存在検査を、正式な核・予約地・建設計画として保存しない。

| Humanレビューする選択 | 今回の候補／推奨 | 代替と影響 |
| --- | --- | --- |
| v5との段階分離 | 今は独立record。D2-Bで旧互換境界、D3で配置方針と初期計画、D4で本編有効化 | 今からv5必須フィールドにする案は、未確定配置を補完するか不完全な新規世界を作ることになる |
| RLE wire形式 | 行ごとの数値5要素tuple。意味は下表で固定 | object形式は読みやすいが保存量が増える。tuple変更はschema更新が必要 |
| 形状の適用条件 | `applyTo=all/land/freshwater`を明示保存。既存海岸の岩は陸へだけ、中州は淡水へだけ適用 | 形状を切り抜き済みpolygonだけにする案は複雑な穴・自己接触を増やす。条件付き適用を読込時に隠さない |
| 入力計算量の上限 | D0の1MiB／128形状／256頂点に加え、全地形の形状頂点合計2,048。外接矩形内だけラスタ検査 | 大きい入力を無制限に検査する案は破損入力の処理時間が増える。将来の地形表現で不足する場合は上限・版を再レビュー |

これらは候補形式の契約としてコード化したもので、ゲーム保存スキーマやQ5/Q6の承認を代替しない。
本PRでHumanが詳細形式を確認した後、D2-Bへ進む。Issue #31/#47の完了は宣言しない。

## 2. 保存データの表

| 階層／属性 | 値・意味 | 正本の責務 |
| --- | --- | --- |
| format/schemaVersion/status | `initial-terrain-record` / `1` / `review-only` | v2/v3/v4/v5ゲームJSONと混同しない |
| generatorId | `world-prototype-v1` | 由来。読込時にその生成器を呼ばない |
| rasterRule | `terrain-result-raster-v1` | 保存形状と物理セルを照合する固定版 |
| rendererId | `terrain-result-render-v1` | 保存済み投影・地表・装飾だけを読む固定版 |
| establishedYear/placementPolicy | `0` / `null` | 初期地形のみ。将来の配置を未確定として扱う |
| source | revision、正規化済みseed（1..2^32-1） | 出典。seedから形状を復元しない |
| geography | 海側・起伏区分・共通ランドマーク・流域reach・port | D1-Cで確定した抽象地理の結果 |
| sites | hill-side / river-bank / coast-inletが各1件 | 地点の欠損・入替・重複を拒否 |
| variants | 川・丘陵・海岸・山の保存ID。非該当地形はnull | D0適合表と照合。気候・バイオームは推定しない |
| shapes | ID、種類、polygon、標高、applyTo、斜面profile | 配列順を保持。重なりの適用結果を固定 |
| physics | `row-rle-v1`、320×180、180行 | 各行のrun長合計320 |
| render | mirrorX、far/middleの輪郭、装飾矩形と色 | 輪郭や装飾位置を読込時に再抽選しない |
| initialPlan | null | D3まで未確定。建物・敷地履歴を捏造しない |

RLEの1runは **[length, surface, grade, bearing, elevation]**。

| セル属性 | 固定コード |
| --- | --- |
| surface | 0背景、1陸、2淡水、3海水 |
| grade | 0平坦、1緩斜面、2急斜面 |
| bearing | 0安定、1砂州、2岩盤 |
| elevation | 相対標高0..255。世界流域portの相対標高とは別座標系 |

背景・水域はgrade/bearing/elevation=0。砂州はgrade/elevation=0、岩盤はgrade=2。
数値はすべて有限安全整数。行は1..320run、隣接する同値runは不許可（正規化済みRLEのみ）。
形状128個／地点、polygon256頂点、輪郭128頂点、profile32knots、装飾4,096矩形／地点が上限。
自己交差、重複頂点、面積0、profileの逆順・不足、未知属性、未知版を拒否する。

## 3. APIとデータの流れ

型の正本は[terrain-record-types.ts](../src/terrain/terrain-record-types.ts)。

| API | 契約 |
| --- | --- |
| captureTerrainRecord(world, revision) | D1結果を一方向に変換。形状・投影・装飾を捕捉し、検証済みrecordを返す。新しい世界を生成しない |
| validateTerrainRecord(unknown) | 構造・意味・全セルを検査。入力を変更せず、切り離したdeep-frozen値を返す |
| serializeTerrainRecord(record) | 再検証してJSONを返す。ファイル・ブラウザ保存を操作しない |
| parseTerrainRecord(json) | 1MiBを解析前に検査。JSONを検証して復元。暗黙の補完・旧キーへの退避・再生成なし |
| terrainRecordAt(record, year) | 非負の安全整数年なら同じ初期正本を返す。建物・改変史は追加しない |
| sampleTerrainRecord(record, site, x, y, coordinates) | screen（既定）またはcanonicalのセルを読む。screenでは鏡映を反映。画面外はnull |
| drawTerrainRecord(canvas, record, site) | 保存済み地表・輪郭・装飾を固定版で描画。生成器・文明RNG・Canvasでの再抽選なし |
| assertTerrainRecordActivationReady(record) | この候補では常に拒否。UIや自然建設へ誤接続しない |

読込・固定ラスタ・固定描画はprototype、capture、engine、storyをimportしない。
生成器更新後も既知の保存版はこの経路で読む。未知のgeneratorラベル／schema／rasterRule／rendererは停止する。
固定版を変更する必要が生じた場合は新IDを追加し、保存済みv1の関数を最新版へ置換しない。

`TerrainRecordError`はcodeとpathを持つ。入力エラーで既存世界や保存値を更新するAPIは存在しない。
RLEは構造と値域を検査してから320×180へ展開し、保存shapeから固定ルールで得たsurface/grade/bearing/elevationと全セル比較する。
川辺のy=95は接続用淡水だけを物理セルに持てる。通常陸の探索範囲はy≥96を維持する。
海岸の岩の陸限定適用、斜面の丸め・grade計算も固定検査関数内に明記している。

## 4. 保存・過去・旧互換の境界

ファイルfixtureと独立recordの往復までを扱う。本編localStorageへのsetItem、キー探索、v5の新規作成はしない。
旧v2/v3/v4に新地形を割り当てない。legacy-fixedの移行・読込境界はD2-Bで実装する。
観測年0/100/1,000/10,000による地形不変を検査するが、新地形の文明を10,000年進行させた意味ではない。
現行10,000年履歴と新recordの容量は別々に計測し、単純和を参考値にする。旧世界に新地形を結合したセーブを作らない。
最終v5のフレーミングと配置履歴は未実装なので、その正確な総容量やブラウザquotaを保証しない。

環境情報は未導入のまま。#47の初期バイオーム、#32の植生遷移、#34の後世の改変は別正本・別履歴。
今回保存する草・波の小さな静的模様を、それらの環境モデルや生活アニメーションとして扱わない。

## 5. fixture・検査と再現

```sh
npm ci
npm test
node scripts/audit-terrain-record.mjs
npx playwright install chromium
node scripts/review-terrain-record.mjs
```

固定fixture：[seed42の保存結果](../tests/fixtures/terrain-record-v1-seed42.json)。テスト実行時に生成し直さない。
追加Node検査は、JSON・RLE・形状・版・ID・stream/port・投影・不正色・色と地表の適用範囲・容量・deep-freeze・読み取り専用性、生成器を含まないimport graphを含む。
既存の文明を並走し、recordのparse／過去投影を挟んでもpending・乱数・履歴を含む全状態が同じことを検査する。

`audit-terrain-record.mjs`はseed1..1,000すべてについて結果を捕捉・全セル照合し、200KiB目標・1MiB拒否上限・失敗seedを記録する。
`review-terrain-record.mjs`はD1-Cと同じ12世界・36場面をファイルへ保存し、別のブラウザで読込・描画する。
読込側ではprototype／capture／engine／storyの取得を拒否し、実際の取得要求が0であることを確認する。
保存前のD1-C PNGとの一致、年0/100/1,000/10,000のPNG一致を検査し、原寸と最近傍4倍を出す。

出力は`artifacts/terrain31-record/`。record JSON12件、PNG36場面×2サイズ、比較一覧、容量監査、検査reportを含む。
CIのNode jobで1,000seed監査、visual-browser jobで生成器なし読込を実行する。既存ブラウザ・長期監査も維持。

## 6. 次の工程

ローカルではNode154件、既存Playwright24件、12世界×3地点の保存前後PNG一致が成功。
初回1,000seed監査は失敗0、最大127,510bytes（出典revisionタグによって数十bytes増減する）。
最終HEADの容量・既存10,000年履歴との成分別計測はCI artifactのcapacity-audit.jsonを正本とする。

この詳細スキーマ候補とfixtureをHumanが確認した後、D2-Bで旧世界のlegacy-fixed境界とv5向け移行fixtureを扱う。
v5への実際の保存切替はD4。配置policyとinitialPlanはD3で別レビューし、nullをseedから補完しない。
保存結果を読めたことと、自然な街並み・安全な橋・全用途が成立することは別の受け入れ条件である。
