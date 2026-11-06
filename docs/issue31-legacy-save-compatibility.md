# Issue #31 D2-B — 旧セーブとlegacy-fixedの互換境界

2026-11-07。main `02fcb7f`（D2-A #51マージ後）起点。
状態：**v5旧互換envelope候補・独立APIのレビュー待ち**。
既存UIの保存先はv4のまま。キーの削除・上書き、新地形の割当、生成モードの有効化は行わない。

## 1. 今回の結果と責務

旧v2/v3/v4を、現在の移行処理と同じv4状態へ検証・移行した後、`legacy-fixed`という互換指定を外側に付ける。
文明エンジンに渡す内側の`state.version`は4のままにする。外側の5を既存`migrateCivilization`へ渡し、v2扱いされて観測台帳を初期化する事故を避ける。
既存のengine・housing-save・housing-persistence・draw・housing-groundは変更しない。

`legacy-fixed`は、昔の地形が測量・記録されていたという主張ではない。
従来の固定地形、建設候補・進行、旧表示を使う互換モードの指定だけである。形状・流域・初期敷地・バイオームをseedから生成して埋めない。
D2-Aの生成地形recordを旧世界へ付けることは禁止し、混在した入力は拒否する。

## 2. envelope候補

型の正本：[legacy-terrain-save.ts](../src/story/legacy-terrain-save.ts)。

| 属性 | 候補値・責務 |
| --- | --- |
| format | `namonaki-legacy-save-draft`。既存ゲームJSONと区別する |
| version / schemaVersion / status | 5 / 1 / `review-only` |
| initialTerrain.schemaVersion / mode | 1 / `legacy-fixed` |
| initialTerrain.rendererId | `legacy-d2f7cb1` |
| initialTerrain.groundRule | `legacy-ground-d2f7cb1` |
| progressionPolicy | `legacy-v4-d2f7cb1` |
| origin.saveVersion | 入力の数値版2/3/4。移行後も由来として保持 |
| origin.confirmedYear | 初回移行時に現在の移行処理で得た最後の確定年 |
| state | 現在のvalidatorで検査したv4文明状態。建物・住宅・公共建築・空地・観測・乱数・pendingはここが正本 |

terrain部分に追加のshape・sites・seed・establishedYear等は受け入れない。
由来がv2/v3なら住宅の追跡開始年・legacyUntrackedを初回境界と照合する。v4として既に保存済みのpartial世界は、その元の境界を保持する。
最終のgenerated側v5スキーマと本編への接続はD3/D4で統合する。この候補がゲーム全体のv5形式を単独で確定するものではない。

| Humanレビュー対象 | 推奨候補 | 代替・留意点 |
| --- | --- | --- |
| 外側v5／内側v4 | 既存v4の検査・進行へ明示dispatchし、データを保存し直しても既存履歴と一致させる | state自体を平坦なv5へ変える案は、現行`version===3/4`条件と旧移行を同時変更する必要がある |
| 互換実装の保持 | 現在の固定実装を使い、固定fixtureの状態・観測・RGBA・継続結果で契約を固定 | 今すべてを複製する案は二重保守になる。D3/D4で既存コードを変える場合は互換分岐を維持するか固定実装を分離する必要がある |
| 入力上限 | 候補envelopeと旧JSONは16MiB。10,000年サンプルを含む検査範囲を確保し、過大入力は停止 | 大きい履歴を切り詰める・履歴を再生成する対応はしない。D0の地形1MiB上限とは別 |
| 旧キーとの併存容量 | 容量超過時に旧値を保持してHOLDする方針をD4で実装する。自動削除はしない | 明示バックアップやファイル保存等のUIは別途判断。今回、容量を理由に旧キーを削除する機能は作らない |

## 3. API

| API | 挙動 |
| --- | --- |
| migrateLegacySave(raw) | 数値版2/3/4を検査し、既存prepareHousingSaveに移行を委ねる。入力不変 |
| validateLegacySaveDraft(raw) | 外側の形式・互換指定・由来と、内側のv4状態を検査。切り離したdeep-frozen値を返す |
| parseLegacyCompatibleSave(json) | JSONの版・formatで旧形式／候補形式を判定。未知v5・生成形式・破損は拒否 |
| serializeLegacySaveDraft(draft) | 再検証してJSONを返すだけ。保存先には書かない |
| findLegacyDraftSave(read) | v5→v4→v3→v2の最初の存在値を読む。空文字列も存在扱い。破損した先頭値から旧キーへ黙って退避しない |
| advanceLegacySaveDraft(draft, years, choices) | 内側v4を複製し、既存stepと選択処理で最大10,000年進める。既定はpendingで停止、automaticは明示指定 |
| chooseLegacySaveDraft(draft, index, source) | 複製上の有効なpending選択を確定する。元draftには触れない |
| observeLegacySaveDraft(draft, year, site) | 既存snapshotAt／composeSceneで対象年を投影する。未来年・不正地点は拒否 |
| drawLegacySaveDraft(canvas, draft, year, site) | 対象年の旧Sceneを既存drawSceneで描く。新地形rendererへ切り替えない |

`LegacyDraftError`はcodeを持つ。既存v4の失敗理由はcauseへ保持する。
版を文字列から数値へ強制変換しない。根本状態・履歴・samples・pending等を検査し、v2に観測台帳、v2/v3に住宅台帳が混在して移行で捨てられるような入力はHOLDする。
v4で住宅台帳が欠損していれば拒否する。旧v4の任意のpublicSpaces台帳が無い場合は、その欠損を維持する。

観測用の`constructionEvidence`は、当時の施設台帳がある`recorded`と、従来の表示推定を維持する`legacy-display-only`を区別する。
住宅のknown/partial/unknownはcomposition.housingStatusをそのまま使う。
v2の旧表示にある推定的な家・橋を、確定した建設イベントとして台帳に書き込むことはない。

## 4. 固定fixtureと期待値

[manifest](../tests/fixtures/legacy-terrain/manifest.json)は、新APIを使わず、基準mainの既存移行・進行・描画から採取した期待値を保持する。
テスト時に再生成しない。JSONは完全な状態のままgzipで格納し、不要な履歴の剪定はしない。
ブラウザや読込APIへ渡す際は、テスト用Nodeスクリプトが展開する。ゲームに圧縮形式を導入した意味ではない。

| ケース | 入力の由来 | 入力年／最後の確定年 | 状態 |
| --- | --- | --- | --- |
| v2-normal | 既存v0.5 fixture | 473 / 473 | 通常、住宅unknown |
| v2-pending | 既存v0.5 fixture | 90 / 90 | 選択待ち、旧境界は90のまま |
| v3-normal | 基準mainのnative v3で作ったテストfixture | 25 / 25 | 通常、住宅unknown |
| v3-pending | 同上 | 390 / 389 | 選択待ち、未確定年を進めない |
| v4-normal | 基準mainのnative v4で作ったテストfixture | 800 / 800 | 住宅・civic・共同空地等を含む |
| v4-pending | 同上 | 972 / 971 | 選択待ち、住宅known |

各fixtureで原本SHA256、正規化状態SHA256、過去のsnapshot/composition SHA256、RGBA SHA256、100年の自動選択継続後の全状態SHA256を固定する。
さらに既存v4世界の800→10,000年の全状態SHA256を固定し、800年以前の観測がそのままであることを検査する。
v3から移行して進行したpartial v4、任意の空地履歴の欠損、不正入力、読み取り優先順もNodeで検査する。
基準実装を変えて期待値を一括更新することで互換問題を隠さない。意図的変更には別の互換方針・レビューが必要。

## 5. 容量の実測と未解決のUI課題

10,000年の既存v4サンプルは3,936,259 UTF-8 bytes、候補envelopeは3,936,573 bytes。
両方を保持する単純和は7,872,832 bytes。UTF-16 code unitsもレポートへ併記し、UTF-8量だけからブラウザquotaを断定しない。

今回のローカルChromiumでは、空のテストcontextへv4を保存できたが、その値を残してv5候補も保存すると`QuotaExceededError`になった。
失敗後も旧v4値が完全に残ることを確認した。これはテスト用の直接書込であり、アプリのv5保存機能を実装した意味ではない。
環境によって両方入る可能性もあるので、CIは成功／容量超過を記録し、失敗時の旧値不変を必須とする。

D4の移行UIでは、この場合に旧保存を自動削除せず旧方式の継続・明示バックアップ等を選べる設計が必要。
本PRは読込・互換境界を用意するまでで、このUI選択を独自に確定しない。大きい旧世界を無条件にv5へ書き直せるとは主張しない。

## 6. 再現・CI・提出物

```sh
npm ci
npm test
node scripts/audit-legacy-terrain-save.mjs
npx playwright install chromium
node scripts/review-legacy-terrain-save.mjs
```

出力先は`artifacts/terrain31-legacy/`。
6ケースの旧JSONと候補JSON、66場面の原寸・最近傍4倍PNG、一覧画像、10,000年旧状態・候補状態、容量・ブラウザレポートを含む。
読込側ブラウザは`/terrain/`モジュールの取得を禁止し、新地形への依存0を確認する。
現行v4読込とのPNG一致と、先に固定したRGBAハッシュ一致の両方を検査する。
有効なv5候補の優先、破損v5からの暗黙fallback禁止、読込によるキー・状態不変も検査する。

既存Node／Playwright、D1/D2-Aの監査、既存長期監査を維持。
CIのvisual-browserで新しい旧互換検査、h3-longrunで800→10,000年の継続検査を追加する。
マージ後もmain.tsと既存findSavedHousingはv4のまま。自動デプロイされてもこの候補はUIから有効化されない。

次はD3-Aの共通土地ゲート・候補探索・初期配置へ進む。Q5の予約3案比較とQ6の探索定数はそこで判断する。
旧互換APIとgeneratedの進行を混ぜず、D4で本編接続が揃ってから有効化する。Issue #31／#47は未完了のまま。
