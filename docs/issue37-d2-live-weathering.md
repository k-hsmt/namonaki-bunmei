# Issue #37 D2｜廃墟の風化を本編の建物描画に接続

- 設計：[issue37-ruin-reclamation-d0.md](issue37-ruin-reclamation-d0.md)（D0 §11 D2）、前工程：[D1a](issue37-d1a-ruin-weathering.md)・[D1b](issue37-d1b-reclamation.md)・[D1c](issue37-d1c-integration.md)（いずれもHuman承認済み）
- 状態：**本編の描画に接続**。保存形式・歴史・文明RNG・年次処理・植生は変えない。植物の回帰（D1b）の本編接続はD3。
- 停止線（D0 §11）：風化を理由にした建物の倒壊・消滅の確定イベントは追加しない。確定した状態（`condition`・`use`）と敷地・世代は変えない。

## 1. 何が変わるか（本編の見た目）

本編の建物（`architecture/scene-v1`の`createArchitecturePainter`、v9以降の世界）で、**空き家と廃墟の建物**をD1aの規則（`ruin-weathering-v1`、Human承認済みの数値）で描く。

| 建物の状態（その年の確定履歴） | 描き方 |
|---|---|
| 使用中・低利用 | **従来どおり**（画素単位で同じ。テストで検査） |
| 空き家（住宅の`vacated`） | 空き家になった年からの年数で、色あせ・屋根の穴・苔・蔦・砂。壁は崩さない |
| 廃墟（住宅の`ruined`、施設の`building-abandoned`） | 廃墟になった直後は屋根が落ち、壁が軒まで立つ。数十年で従来の廃墟の輪郭（`drawRuin`、architecture-ruin-v1）まで崩れ、その後は建材ごとの床へ下がる。基礎は残す。苔・蔦・砂は放棄からの年数 |
| 廃墟から修繕され、空き家のまま | 修繕の年から風化をやり直す |
| 記録された状態変化がない廃墟 | 年齢を推測せず、崩れ終わった輪郭（従来の廃墟＋基礎、被覆なし） |

畑・橋・出生の記録のない建物は従来どおり。損傷の印も従来どおり上に描く。季節の雪（#36）は、描かれた建物の画素の上端に載るので、崩れた壁には崩れた形のまま載る。

**既存の世界への影響**：保存データはそのまま読み込める。読み込んだ世界の空き家・廃墟の見た目が、上の表のとおり変わる（新しい世界を作り直す必要はない）。

## 2. 時計は確定履歴から（`src/ruin/ruin-history-v1.ts`）

- 住宅：`housing.events`（年・seq順）の`after.use`と`after.condition`。
- 施設（畑・橋を除く）：観測の`buildingChanges`の`condition`。
- その年の時計は、**その年までの変化だけ**から求める。後の年の修繕・再利用・再放棄が過去の年の見た目を変えないことをテストで検査（年表をその年で切っても同じ時計・同じ画素）。
- 知らない状態の値は推測せず拒否する。
- 保存には何も足さない（毎回、既存の記録から導く）。

## 3. 性能

本編は1枚の景観で同じ建物を何度も描く（構造の層、植物の前後判定の地面線、雪の上端）。D1cで、空き家・廃墟の風化をそのたびに計算し直すと遅くなることが分かったので、painterに**同じ建物・同じ年の状態の描画結果を再利用するキャッシュ**を入れた（上限4000件、超えたら空にする）。キャッシュは結果を変えない（キャッシュ有無で同じ画素になることをテストで検査）。

計測（`scripts/benchmark-ruin-d2.mjs`、4世界を3000年まで進めて廃墟の多い6場面ずつ、ブラウザで2回目の描画の平均）。mainのビルドとD2のビルドを交互に2回ずつ計測した：

| 世界（seed） | main（1回目／2回目の計測） | D2（1回目／2回目の計測） |
|---|---|---|
| 温帯林 6 | 111.6／128.8 ms | 101.1／96.2 ms |
| 熱帯雨林 1 | 95.6／103.8 ms | 90.3／95.3 ms |
| 砂漠 3 | 106.1／76.9 ms | 88.9／73.8 ms |
| 亜寒帯林 18 | 102.0／94.0 ms | 92.6／81.5 ms |

D2で遅くなってはいない（計測の揺れの範囲。速く見える差の原因は確かめていない）。

## 4. 変更したファイル

| ファイル | 内容 |
|---|---|
| `src/ruin/ruin-history-v1.ts` | 新規。確定履歴から時計を導く（`ruinTimelines`・`ruinClocksAt`・`ruinContextOf`） |
| `src/ruin/ruin-weathering-v1.ts` | 本編で使う旨の説明、年齢不明の廃墟の外観（`settledRuinAppearance`） |
| `src/architecture/scene-v1.ts` | `createArchitecturePainter(births, ruins)`：空き家・廃墟を風化で描き、結果をキャッシュ。`drawRuin`は崩れ終わった輪郭の基準として残す |
| `src/story/world-session.ts` | 世界の確定履歴と気候から風化の文脈を作って渡す（`worldRuinContext`） |
| `scripts/lib/ruin-d1c-painter.mjs`・`scripts/preview-ruin-d1c.mjs` | 本編が風化を描くようになったので、D1cの開発用painterは植物（D1b）だけを足す形に整理 |
| `scripts/review-architecture-d2c/d3/d4.mjs` | 新しい引数に追従 |
| `scripts/benchmark-ruin-d2.mjs` | 新規。本編の描画時間の比較 |
| `tests/ruin-d2.test.mjs` | 新規4件 |
| `tests/architecture-scene.test.mjs`・`architecture-rebuild.test.mjs` | 履歴なしの文脈を渡す（世代の選び方の検査は、風化の時計が混ざらないよう履歴なしで行う） |
| `tests/architecture-grammar.test.mjs` | `scene-v1`が読んでよいモジュールに、外観専用の`ruin-weathering-v1`・`ruin-history-v1`を追加 |
| `tests/ruin-weathering.test.mjs`・`reclamation-access.test.mjs` | 風化を本編で使うのは`scene-v1`と`world-session`だけ、植物の回帰（D1b）はまだ本編に入っていないことを検査 |

## 5. 検証

- 単体テスト：622件すべて成功（新規 `tests/ruin-d2.test.mjs` 4件を含む）。
  - 使用中の建物は従来と画素単位で同じ。空き家は画素を失わずに色が変わる。廃墟は履歴の時計どおりのD1aの描画になり、再利用で元の建物に戻る。
  - キャッシュの有無、後の年の観測、年表をその年で切ることが、どれも描画を変えない。
  - 実際の世界（seed 6、1400年）を本編のpainterで描いても、保存データ（`prepareArchitectureSave`）が描画の前後で同一。
- ブラウザテスト：93件中80件が成功。失敗のうち12件はBGMの検査で、作業環境にWebKitの実行ファイルがないため起動できなかったもの（D1cと同じ）。残る1件（`season-transition`の「高速進行で停止すると最新の年を表示」）は、別の描画処理を同時に走らせていたときに1回だけ失敗し、単独で2回再実行するとどちらも成功した。負荷による揺れと見ているが、確証はない。CIでの結果は未確認。
- mainとD2で同じ19場面を描き比べ、空き家・廃墟の建物だけが変わることを目で確認した（差分のある画素は1場面あたり109〜2277）。

## 6. 範囲外・次の工程

- D3：植物の回帰（D1b）を本編に接続する（局所アクセス、修繕・再利用・観測年との統合）。建設上の土地占有は変えない。
- D4：保存往復、1,000/10,000年、複数seed、静止画と動く景観、性能、Humanの景観監査。
