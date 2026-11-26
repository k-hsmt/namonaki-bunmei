# Issue #39 D1｜調べる対象の確定履歴API（読み取り専用）

- Issue: [#39 歴史を発見する観察体験](https://github.com/k-hsmt/namonaki-bunmei/issues/39)
- 設計: D0詳細設計 `docs/issue39-historical-discovery-d0.md`（PR #161、本PR作成時点で未マージ）の §3・§4・§10 D1
- 範囲：**履歴の読み取りAPIとテストのみ**。UI（D2調べるモード／D3年移動／D4比較）は含めない。
- 優先規約：[AGENTS.md](../AGENTS.md)。対象は現行のv10世界（`ArchitectureGeneratedSession`）だけで、旧形式向けの分岐は追加していない。

## 1. 実装したもの

| 項目 | 場所 | 内容 |
| --- | --- | --- |
| 参照型 | `src/story/historical-records.ts` | `HistoricalTargetRef`（`facility` / `housing-block` / `bridge` / `waterway`）。廃墟は施設・街区の**状態**であり別IDを持たない（D0 §3） |
| 入力 | `historicalSourceOf(session)` | 既存の確定記録（`observation.sites[].buildingChanges`、`housing.events`、`bridgeReview.bridges`、`irrigation.events`、建築`births`、年代記`history`）への参照だけを束ねる。世界ごとにキャッシュ |
| 1対象の履歴 | `historicalSubjectAt(source, ref, year)` | `year`までの確定変化・状態・建築世代を返す |
| 土地の記録一覧 | `historicalTargetsAt(source, siteId, year)` | その地区で`year`までに記録がある対象（埋め戻した水路のように風景に見えないものを含む）。`year`より後に初めて記録される対象は出さない |
| 屋根部品→街区 | `housingTargetOfRoofPart(part)` | 描画単位の`partId`ではなく`blockId`へ対応づける。一戸の家・住人として扱わない |

保存形式・年次処理・乱数・`state`には一切書き込まない。索引は観測側の`WeakMap`キャッシュで、保存されない。

### 1.1 年と「存在」の語彙

- `year`は0〜最終確定年（`lastObservedYear`。灌漑の`confirmedThrough`がそれより小さければその値）の整数のみ。それ以外は`RangeError`。選択待ち年の暫定記録は読まない。
- `presence`：
  - `recorded`：その年に存在が確定している。
  - `not-yet-built`：建設（初回記録）がその年より後であることが確定している。
  - `unknown`：記録の対象外（どの記録にもないID、記録開始前の年）。
  - `unsupported`：記録はあるが対象に安全に結び付けられない（例：橋の台帳と出生記録が一致しない）。一覧から黙って消さず、この状態で示す。
- D0の`visible`／`recorded-hidden`の区別は描画画素が必要なため**D2で`recorded`を細分化する**。D1は画素を見ない。

### 1.2 年代記との関連づけ

`linkedChronicleId`は、記録が**明示的に名指しするID**で、かつ次を満たすときだけ付ける。近い年・同じ地区・題名からの推定はしない。

| 対象 | 条件 |
| --- | --- |
| 施設・橋 | `building.recordId`の記録が同じ年、同じ`buildingId`、かつ記録の種類と変更後の状態が一致（`building-damaged`→`damaged`など。橋台帳の検証と同じ対応表） |
| 住宅街区 | `causeRecordId`の記録が同じ年、同じ`buildingId`（=`blockId`） |
| 水路 | `cause.kind==='chronicle'`で、その記録が同じ年。`land-use`／`policy-clock`等の原因は年代記として示さない |

条件を満たさない施設・橋の変化は`kind:'condition'`（表示「状態の記録：損傷している」等）とし、理由を作らない。世界暦0年の最初の家屋のように記録IDを持たない建設は、`builtYear`がその年であることから「建設」とするが、年代記は結び付けない。

### 1.3 建築世代

建築台帳の`births`から`built`（第1世代）と`rebuilt`（`rebuild.generation`）だけを世代とする。住宅の`expanded`は部品の追加であり世代に数えない。廃墟からの再利用・修繕の変化には、同じ年・同じ記録IDの建て直しがある場合だけ「（建て直し・第N世代）」を付ける。

## 2. D1で行った判断（Humanレビューで確認してほしい点）

1. **畑（`field`）は対象外**とした。施設台帳にIDはあるが、Issue本文・D0の「土地利用跡は後続」に従った。
2. **表示名**は「川辺の家屋（0年建設）」のように地区・種類・建設年で作り、内部IDは表示文に入れない。同じ種類が複数ある地区での識別用。D2の画面で密度を見て変える可能性がある。
3. **水路の記録開始**は既存の`productionChannelAt`（`year > introducedYear`で導入済み）に合わせ、導入年以前は`unknown`とした。新しい世界では世界暦0年だけが該当する。
4. 状態の文言は既存UI（水路行）と橋の通行規則（無傷の橋だけ渡れる）に合わせた。損傷・廃墟の橋を「渡れる」と表示しない。

## 3. 破壊的変更と既存データへの影響

- **なし**。保存形式・既存の読み書き・描画・年次処理を変更していない。既存の保存はそのまま開け、再開始は不要。

## 4. テスト

`tests/historical-records.test.mjs`（8件）：

- 合成データ（6件）：同一施設IDの建て直し（世代と系譜の区別、建て直し前の年に後の世代が見えない）／年代記の関連づけ条件（別年・別建物・状態不一致は結び付けない、0年の家屋）／屋根部品→街区、住人史を生成しない、増築は世代でない／橋の台帳照合、損傷時に通行可能と表示しない、不一致は`unsupported`／水路の`chronicle`以外の原因を年代記にしない、埋め戻し後も記録一覧に残る／`unknown`・`not-yet-built`・未来の遮断・確定年以外の拒否・破損した住宅履歴の拒否。
- 実世界（seed 42、1,200年、2件）：9つの年×3地区で、`siteAt`・`housingAt`・`productionChannelAt`と状態が一致、施設台帳と住宅の確定状態の全対象が一覧にある、**描画される全ての屋根部品・構造物が一覧の対象に対応する**、4種類すべてと建て直しが現れる。読み取り前後で保存JSONがバイト単位で一致・`rngState`と記録数が不変、保存→復元後も同じ答え。
- 未来の遮断と年代記の年一致条件は、それぞれ外すとテストが失敗することを確認した（変異確認）。

全体回帰：`npm test`の結果は §6 に記す。ブラウザテストは本工程でUIを変えていないため実行していない。

## 5. 性能

seed 42・1,500年の世界で索引の初回構築は約3ms（1回の手元計測）。10,000年・複数seedでの測定はしていない。D0 §9どおり、合格閾値はD5でHumanレビューにより定める。

## 6. 回帰テスト結果

`npm test`：**664件成功・失敗0**（既存656件＋本工程の8件、約265秒）。
