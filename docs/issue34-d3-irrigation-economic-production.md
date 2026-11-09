# Issue 34 D3-C3：水路の収穫・工事負担の本番化設計

基準はPR #89・#90統合後のmain `657cd07b5f13ca6be5066462043f8a6e483404c1`。ユーザーの「設計まで進めてください」に基づく設計PRである。C3は今回の本番化工程の呼称とする。本書ではcombined・定数据え置きの採用案と実装契約を定めるが、実行コード・新規世界の既定・保存キーは変更しない。本書のマージだけで本番導入やD3完了とは扱わない。

## 1. 採用案とC2の根拠

[C2の設計](issue34-d3-irrigation-coupled-design.md)、[PR #90](https://github.com/k-hsmt/namonaki-bunmei/pull/90)、[最終CI・比較資料](https://github.com/k-hsmt/namonaki-bunmei/actions/runs/42589457524)を基準とする。5世界×4条件を各1万年進め、完全保存・cold read・9900年からのgzip再開、単体403件とCI全26 jobが成功した。

| seed | 収穫増のみ | 負担のみ | 両方 | 両方の最初の地域人口差 | 両方の最初の土地・景観差 |
| --- | ---: | ---: | ---: | --- | --- |
| 1 | +75,233 | −16,578 | +58,662 | 2736年 | 2834年 |
| 21 | +193 | −11 | +175 | なし | なし |
| 29 | +1,036 | −63 | +966 | なし | なし |
| 42 | +259 | −18 | +245 | なし | なし |
| 198 | +1,002 | −78 | +919 | なし | なし |

値は川辺の全期間収穫の無作用との差で、備蓄資産の増加ではない。seed1の両方条件は約0.00998%増、C1の単年差合計+58,703に対し持越し後は+58,662だった。2736年の丘陵→川辺の移動は44人から26人になり、2834年には住宅街区 `river-residential-00002` が廃墟になる時期に差が出た。2833年の川辺画像は同一、2834年から画像にも差がある。他4世界では収穫差が人口・景観の差へ到達しなかった。全世界で総人口・選択・RNG・災害・都市到達年・水路の物理結果は一致した。これは観測結果であって、本番でも常に一致させる契約ではない。

採用案は **combinedのみを本番の経済policyにし、C1/C2の定数を変えない**。位置を持つ水路の利益と機会費用を両方持ち越し、小さな差や影響のない世界も許容する。4条件の選択画面や効果を増幅する設定は通常画面へ追加しない。4条件の比較入口は独立試走側へ残す。

## 2. 作用の範囲と限界

| 項目 | C3初版 |
| --- | --- |
| 対象 | D3-Bと同じ川辺の合法な水路・実在する対象畑。新たな取水・経路・寿命ruleは追加しない |
| 追加収穫 | 最大100bp。配水率・追加加湿を除いた乾燥需要・畑数で按分する既存式 |
| 負担 | 長さ64を基準に建設200・点検50・修復100・埋戻し50・日常管理5bp。各作業はceil、合計は最大300bp |
| 適用 | 前年の確定prefixから `F' = F × (1 + (gainBp − costBp) / 10000)`。既存の収穫floorは一度だけ |
| 持越し | その枝の備蓄・供給率・交易・地域人口と、その後の社会・施設・住宅・水路・環境 |
| 既存の文明計算 | 短期降雨、伝承waterworks、灌漑イベント、全体の食料・人口の既存式は保持。`state.food`や備蓄から追加で費用を引かない |

定数の正本は `irrigationEconomyRule`、算定は `economy-effect-core-v1.ts` とする。配水・丸め・前年参照を別実装へ書き直さない。既存の伝承・出来事の効果に重なる「位置のある水路からの小さな追加分」であり、それら全体を水路の収穫と呼ばない。

負担は生産の機会費用の近似で、支払済み食料・貨幣・確保した労働者を表さない。上限超過分を債務として消したり、人口0でも労働を確保できたと解釈したりしない。要求費用・適用費用・上限超過・0人口の工事は出典付きで記録する。自然5世界では後二者は0件だった。既定切替前の追加の自然監査でこれらが出た場合は切替を止め、負担モデルの修正または導入延期を判断する。人工fixtureや導入後の実行時には版付きruleどおりに計算・記録し、それだけを理由に進行不能にはしない。労働可否を解決したとは主張しない。

労働市場・債務・直接の総人口ボーナス、修復頻度の変更、畑の増設、水路による建築優先順位の変更、D4の切り土・段々畑・河川付替えは今回の対象に含めない。

## 3. 本番の年次処理と選択

確定年をJ、作用対象年をYとする。導入後はJ+1から年次で次の順序を使う。

1. Y−1までの土地・水路・環境の確定prefixだけから、Y年の追加収穫と費用をprepareする。
2. 既存の大域stepを進める。選択待ちなら準備した作用を保留し、地域経済・土地・環境・確定年を進めない。
3. 選択が必要なら通常の手動または自動選択を行う。確定する年の地域経済へ作用を一度だけ適用する。
4. 社会・施設・橋・住宅・共同空地をその年の実際の状態から更新する。
5. 同年の土地差分、水路ライフサイクル、環境・植生を確定し、receipt・checkpointをcommitして翌年へ入る。

`state.year`がYでも選択待ちなら確定年はY−1である。receiptの末尾、土地・水路・環境の確定年を一致させる。保留中のpreparedにはsourceYear=Y−1と対象年Yを保存し、0年進行・再描画・保存読込で再適用しない。選択の確定後に一度だけ適用してpreparedを消す。1万年の工事の翌年費用は10001年対象として区別し、10000年の収穫へ遡及させない。通常進行の上限10000年は維持する。

本番では手動と自動の両方を通常のsessionから利用する。C2の `automatic-per-branch-v1` は手動を禁止する試走protocolなので、本番runnerにそのまま使わない。手動は乱数0、自動は1の選択phaseと内容bindingを記録する。現在の所有worldのpendingと版付き質問・選択肢を照合し、古い画面からの選択を拒否する。C2の共通明示選択APIやfingerprint引数を通常UIへ公開しない。

## 4. 年次kernelの共有と所有境界

現在の `runAnnualKernel` は中立BとC2を扱うが、作用側はC2のtrialBoundaryを要求し、engine側も `irrigation-coupled-review-only` modeを使う。C3ではこの印を外して本番worldと見なす方法を採らない。

内部の年次処理・作用式・出典cursor・経済receipt生成を中立部品へ抽出し、入口をB／C2／C3の識別可能なmodeに分ける。C3 modeは本番専用factoryと所有証明からだけ構成する。既存Bの公開optionへ自由な経済callbackを追加しない。C2の公開進行・codec・所有cacheをC3の通常進行から呼ばない。BとC2の既存の演算順・境界・保存基準を保持し、共通化前の結果とも照合する。

C3のruntime worldは専用の識別子 `irrigation-economic-production-world-v1` を持ち、landにはclone後も残る `economicPolicyBoundary: regional-economy-irrigated-v1` を付ける案とする。C2のformat・trialBoundaryは受理しない。本番C3、B、C2の所有cacheは分け、検証済みの正確な凍結rootだけを登録する。structuredClone・浅いfreeze・Bのshapeへ包み直す操作では所有証明を継承しない。

通常session・save・sceneはC3専用dispatchを追加する一方、B専用の進行・保存draft・所有入口はC3の印を拒否する。観測adapterにも印を残す。共通の土地・水理・状態機械validatorへ渡す内部viewは、検証・投影だけに使い、本番BやC2の所有cacheへ登録しない。値の印は偶発的な混入を防ぐ境界で、手作業のJSON改変を防ぐ署名ではない。

## 5. 保存v7の案

新しい本番保存は `format: namonaki-world-save / version: 7 / schemaVersion: 1`、生成地形専用とする。v6の地形・土地・文明・水路・環境は一組だけ持ち、`economicCoupling`を必須追加する。描画部品は変わらないためrendererは `generated-scene-v6`、既存のenvironmentAppearanceも維持する。経済policyとrendererの版を同一視しない。v6 readerの未知キー許容を広げてv7を読ませない。

`economicCoupling`は次を持つ案とする。識別子・tupleの最終field順はC3-1で実装前に固定し、C2の保存を互換形式とは扱わない。

| 要素 | 内容 |
| --- | --- |
| header | schemaVersion=1、ruleId=`regional-economy-irrigated-v1`、policy=`combined`、C1の全定数、kernel・RNG・選択templateの版 |
| 境界 | introducedYear=J、confirmedThrough=T、導入時RNGとinitialEconomy。Jは確定年で、最初の作用はJ+1 |
| originPrefix / originHash | 導入直前のv6を復元する版付きprefixとcanonical SHA-256。可変値・台帳長・途中の人口block cursorを保存し、地形や過去台帳は最新worldへの許可された参照で共有 |
| receipts | J+1〜Tの各年の前年作用・出典・実際の係数・地域経済直前入力・発行記録ID・収穫・余剰廃棄。要求費用と適用費用を保持 |
| phases | step／手動／自動の前後RNG・確定境界・環境境界、pending、選択のindexと内容binding。文明historyへ診断の年次記録は追加しない |
| checkpoints | J+100k年の経済・地域人口・phase位置・source cursor。最新経済は既存stateが正本 |
| prepared | 選択待ちの作用、またはnull。未確定年のreceiptはまだ持たない |

originPrefixは `economy-origin-prefix-v1` とし、C2で検証したprefix方式を中立化して本番の参照先へbindする。第二の完全な世界や導入年までの全環境snapshotを格納しない。導入直前の環境currentはJまでの記録からchannelを含めて復元する。許可された参照path・台帳長・cursor以外を拒否し、経済作用後の値を導入前snapshotとして流用しない。復元したv6はそのprefixの検証にだけ使い、作用後の世界をv6として認証しない。

毎年のreceipt・phaseは版付きの固定長tupleにする。field名・年番号の反復や、currentと同年checkpointの環境snapshotの重複を避ける。非永続の探索診断はwireへ含めず、読込時の0初期値と比較対象を明示する。毎年の全経済snapshot・全セル・描画mask・歩行経路は保存しない。

v7のrootには必須の `payloadHash` も追加する。hash対象はこのfield自身を除いた、compactなwire表現のv7保存全体とする。originHashと結合hashは整合性の検査であり、署名ではない。初期導入時のorigin hashは非同期に一度だけ計算し、毎年の同期session進行からhash・元v6再構成を呼ばない。結合hashの生成・外部保存の完全検証は非同期の保存準備へ分け、所有済みsessionの整合性証明を再利用する。v7の外部読込に加え、保存/exportで必要な非同期入口も `world-storage.ts` とmainへ明示的に接続する。既存のv5/v6同期serialize契約を黙ってPromiseへ変えない。

入口案は `prepareWorldSessionSave(session): Promise<WorldSave>` とする。v5/v6は従来の同期保存factoryへ委譲し、v7は呼出し時のsessionから不変な候補を所有して結合hashを計算し、完成した保存packetを返す。未完成のhashを持つ値をWorldSaveとして公開しない。既存の同期 `saveWorldSession` はv7を暗黙にv6へ落とさず、非同期入口が必要として拒否する。通常画面の保存/exportは新入口をawaitしてから既存serialize／gzip／setItemへ渡す。v7の同期validate／restore／serializeは非同期readerまたは保存準備で検証・所有した正確なpacketだけを受け、外部のv7 JSONは必ず非同期readerを通す。

plain JSON上限16MiB、圧縮保存の受け入れ上限4MiB。C2での約9.64〜10.47MB／約1.30〜1.38MBは設計の参考であり、v7の容量達成とは数えない。全20枝相当・任意年導入で別測定する。

## 6. readerと保存先

v7 readerはwriter・step・選択実行・新しい水路探索・気候target生成を呼ばない。入力を所有し直してからawaitし、次を検証する。

1. 版・全定数・未知キー・mode・境界年・tuple形を厳格に検査する。初期地形、土地・施設の出典、文明の構造、水路と環境は共通の中立validatorを使う。
2. originPrefixからv6を復元し、既存v6 readerとoriginHashで導入前を照合する。導入時pendingは認めない。
3. 記録済みの水路決定・土地利用・環境を年次再生し、その年の確定prefixから係数と地域経済を再生する。発行本文・原因・関連ID、収穫・廃棄・地域人口・checkpoint・最新経済・preparedを照合する。
4. C2と同じ有界RNG診断、保存stateの出力値からの干ばつ・自動選択index、選択内容・phaseの連鎖を検査する。乱数器のnextを診断のために消費しない。
5. 再書出しと継続が可能な深い凍結rootを、C3専用cacheへ登録する。長い再生は約8msごとを目標に制御を返す。JSON解析や同期構造検証まで8ms以内と保証しない。

結合hashを再計算した改変も意味の再生で拒否する。不成立の探索最適性や、保存されていない全ての文明抽選・重み・大域変数の真正性まで証明したとは扱わない。検証できる範囲をC2より広い保証として宣伝しない。

保存キーは `namonaki-story-v7`。発見順序はv7→既存のv6→v5→旧キーとする。最初の存在するキーが壊れていたら停止し、古い正常保存へ黙って戻らない。gzip envelopeのversion・mode・展開長と内側を一致させる。v7は新キーへ保存し、v5/v6の保存先・発見・再開の既存契約は保持する。単に保存し直しても経済policyを自動導入しない。

保存はserialize・hash・gzipを完了してからsetItem一回で行う。容量不足や検証失敗で旧キーを削除しない。setItem失敗時はv7の完全なplain JSONを書き出せるようにする。読込・importも全検証完了後にsessionを一度だけ採用し、失敗時は現在のworld・観測年・保存を維持する。旧アプリの読込ではv7の明示importを未知版として拒否するが、新キーを知らない旧アプリが古いキーを発見することまで防げるとは保証しない。

## 7. 新規世界と既存世界への導入

| 世界 | 初版の扱い |
| --- | --- |
| 新規 | C3-3で初めてv7を既定にする。既存v6生成factoryから同じseedで一度だけ生成した年0のworldへ、非同期に経済policyを導入する |
| 既存v6 | 利用者が「水路を暮らしに反映する」を選んだ時だけ、現在の確定年Jから導入する |
| 選択待ちのv6 | 導入を無効にし、先に現在の選択を終える案。既に始まった年へ途中から新policyを混ぜない |
| 既存v5・旧固定地形 | 直接導入しない。対応する生成世界は既存の水路導入手順でv6になってから、別操作で経済作用を導入する |
| C1/C2の保存 | 通常import・本番化の元として受理しない |

導入には生成地形・organic-v3・検証済み本番水路／環境・J<10000・pendingなしを要求する。再導入は同じruleなら無変更で返す。異なるruleや途中の係数変更は初版では拒否する。

導入直前のv6全保存を凍結してprefix・hashを準備し、初期経済・人口・RNG・土地・環境・履歴は変更しない。J年以前の工事を遡及請求しない。J年に確定した工事も過去工事として除外する一方、J年末に既に稼働・休止する合法水路の日常管理と、稼働する畑の追加収穫はJ+1から作用する。新たな工事費はJより後の作業年の翌年に適用する。これはC2の導入境界と同じ契約である。

通常画面の導入説明は「これからの収穫と維持の負担に、水路の状態を反映します。過去の歴史は変わりません。」とする案。導入完了とブラウザ保存完了は別の状態として知らせる。保存形式・tuple・rule番号を通常の操作説明へ出さない。新規世界のseedはユーザー指定または既存のランダム生成値を一度だけ決め、非同期導入の再試行で再抽選しない。

起動・再スタート・ランダム・復旧画面の各経路を同じ非同期生成入口へ揃える。準備中は既存のbusy機構で競合操作と自動選択タイマーを止める。開始時のsession identity／操作番号を確認してから採用し、古い非同期結果を新しいworldへ適用しない。失敗は元worldを保持し、起動時なら既存の復旧操作を提示する。BGMのユーザー操作による起動と動く景観の再準備を壊さない。

## 8. コードの変更単位

以下のファイル名は実装時の案である。試走のpublic APIに依存せず、BとC2の基準を維持できる責務で分ける。

| 変更先 | 責務 |
| --- | --- |
| `src/irrigation/economic-production-types-v1.ts` / `economic-production-wire-v1.ts` | v7 header・境界印・compact tuple・全定数と版の契約 |
| `economic-production-progression-v1.ts` | 検証済みv6からの導入、所有済みv7の進行・手動／自動選択 |
| `economic-production-history-v1.ts` | prefix復元、記録の再生と意味検証、非同期readerと所有cache |
| 年次kernel・origin・receiptの内部共通部品 | B／C2／C3で数式・年次順序を共有。C2 origin参照のlayoutと本番参照を専用adapterで分離 |
| `src/story/engine.ts` と土地batch | C3専用modeを追加。finishYearへの作用を一度だけ適用し、通常Bの演算順を保持 |
| `world-save.ts` / `world-storage.ts` | v7の明示dispatch、非同期保存準備、gzip・キー発見・失敗時の原子性 |
| `world-session.ts` / `new-world.ts` / `src/main.ts` | 通常操作のdispatch、明示導入、最終段階での新規既定切替 |
| sceneの中立投影と既存renderer | 年・地区に対応するv7の記録を観測。現在の経済や環境を過去へ流用しない |

## 9. 実装PRの順序と受け入れ条件

| PR単位 | 実装するもの | 区切り |
| --- | --- | --- |
| C3-0（本書） | 採用案、v7・境界・既存世界導入・検証の設計 | 文書のみ。実装・既定切替・D3完了はまだ行わない |
| C3-1 | 本番専用kernel接続・所有境界・v7 reader/writer・codec・明示導入API | 通常UIから未接続でも、完全な進行・保存・再開を独立検証できる |
| C3-2 | 通常session・過去観測・保存/export/import・既存v6の導入UI | 既存利用者の履歴を保って明示導入できる。新規既定はv6を保持 |
| C3-3 | 新規既定切替、通常画面の自然比較、全互換・性能・景観の受け入れ | 成功した検証と未採用事項を記録し、D3完了を判断する |

新規既定切替はC3-1/2の検証が揃ってから、C3-3の具体的な比較とともにレビューする。設計文書の採用案だけを、切替済みとして扱わない。

必須の検証は次のとおり。

- 自然seed1・21・29・42・198を年0導入で1万年進め、C2 combinedと全ての永続する意味上の値を照合する。header・所有印・wire layout・非永続診断だけを差分から除く。両方が新しい同じコードで一致するだけにせず、PR #90の分岐年・収穫合計・都市到達年と比較資料を固定参照にする。
- Bの既存5世界の完全保存SHA、A2/A3、C1/C2の4条件・専用保存・混入拒否を維持する。過去のB/C1の値やrenderer基準を書き換えて新結果へ合わせない。
- 導入年0・99・100・575と任意年、既存水路・導入年の工事費除外・翌年の日常管理、再導入、選択待ち・10000年での導入拒否を検証する。J年以前の保存内容に相当する値と過去画像が一致する。
- 手動／自動の混在、pending保存・繰返し観測・0年進行・選択後の一度のcommit、1年刻み／一括／分割／gzip再開、10000年末尾の効果年を検証する。手動列の照合にはC2の共通明示protocolを使い、本番に自動選択だけを強制しない。
- 休止・破損・修復・放棄・埋戻し、上限超過・0人口・低備蓄を別の人工fixtureで確認する。自然保存へ制御入力を混ぜない。
- 結合hashを再計算した係数・人口・収穫・本文・source・幾何・checkpoint・prepared・RNG・選択・origin参照の改変拒否、未知版・形式混在・過大展開・キー破損時の停止を検証する。writer・探索・気候生成・RNG nextを遮断した別プロセスでも読込と再書出しが成功する。
- 実ブラウザでv7の起動・再開・import/export・明示導入、容量不足、旧キー不変、処理失敗と操作競合、3地区の過去観測、動く景観、Safariでの描画とBGMを確認する。

C2との照合は全自動列と、質問・選択肢のbindingが一致する全手動列をそれぞれ使う。手動／自動の混在はC3内の一括・分割・保存再開と実際のphase消費で検証し、C2の途中でprotocolを切り替えたり、手動の乱数0を自動の1と同じだと扱ったりしない。

正式性能はseed42の2000／10000年とseed21の2000年をケース別プロセス・順序交替・1準備＋5回中央値で測る。C3の年次と保存準備・結合hash・gzipまでの全体をそれぞれ2000年5秒／10000年25秒以下、同じB比2倍以下とする。中立Bの年次共通化はB比1.10以下を維持する。初期導入・cold read・観測・素材準備・描画は別測定し、既存の観測・描画の性能基準を維持する。保存の非同期化を理由にhash・gzipの時間を全体から外さない。

自然5世界の全保存容量、全年度の作用集計、原寸／4倍の同年3地区、seed1の2736年の地域移動と2833〜2835年の住宅、選択・RNG・災害・水路・都市到達の差なしも含む結果、人工fixture、全5回の生の性能値をCI artifactへ出力する。新形式の容量・読込負荷が基準外なら履歴を削らず実装を見直し、既定切替を行わない。

## 10. D3の完了と次工程

C2は比較まで完了した。C3は本番化の採用案と実装・互換・景観受け入れが揃った時に完了を判断する。D3の区切りには、combinedと定数、既存世界の明示導入、機会費用近似・労働や債務の未モデル化、影響が小さい世界もあることを記録する。

この区切りでD4を実装したり、issue #34全体を閉じたりしない。次のD4では恒久地形改変の別設計として、地形revision・占有・水理・橋・歩行・過去観測と変更前後の原子性を検討する。切り土や段々畑を景観の上塗りだけで追加しない。

## 11. C3-1実装の区切り

本番の所有rootとB/C2を分け、`introduceEconomicProduction`、`advanceEconomicProductionWorld`、`chooseEconomicProductionWorld` を追加する。元の年次kernelと独立した経済証拠の再生・origin prefix・tupleを中立部品へ抽出する。C2の公開writer/readerや所有cacheを本番化の入口として使わない。

v7の `economicCoupling.storageEncoding` は `economic-production-tuples-v1` とする。receiptの15要素は `[systemId, status, wetCells, fieldCells, moisture, fieldCount, potentialGainBp, requestedCostBp, potentialCostBp, workEventIds, appliedGainBp, appliedCostBp, input, harvest, discarded]`。inputは `[people4, drought, blockedMask, granaryMask, disruptionId, issuedRecordIds]`。年は導入年と位置から復元する。phaseの12要素は `[kind, year, confirmedBefore, confirmedAfter, rngBefore, rngAfter, pending, draws, ecologyBefore, ecologyAfter, choiceIndex, choiceBinding]`、kindはstep=0・自動=1・手動=2とする。実際の経済checkpointとpreparedはfield名付きで保持する。読込は固定長・上限・全fieldを検証する。

保存準備は `prepareEconomicProductionSave`、外部readerは `validateEconomicProductionSave`、検証済みpacketからの復元は `restoreEconomicProductionSave` とする。v7の外部読込・gzip・新キーへの保存は共通storageへ接続するが、通常sessionと導入UIはC3-2へ残す。C3-1時点では通常sessionによるv7採用を明示的に拒否し、v6の新規既定を保持する。

`tests/fixtures/economic-production-c2-reference.json` はPR #90のCIが生成した、変更前の5世界のcombined完全保存から固定したworld・receipt・phaseのhashである。world header・所有印・非永続診断・checkpoint参照だけを正規化する。新しい本番と変更後のC2が同じ共通コードを使うことだけで一致を主張しない。`audit-economic-production.mjs` で固定参照、全保存と9900年からのgzip再開、16MiB／4MiBを確認し、`benchmark-economic-production.mjs` でhashを含む保存準備とgzipまでの正式性能を測る。C3-1の検証結果は実装PRとCI artifactに記録し、C3全体・D3の完了とは数えない。
