# Issue 34 D4-C1：本番の整地・完全保存とnative検証

[C0契約](issue34-d4-production-design.md)に基づく計算・保存の接続。Bの小規模整地の景観は利用者の「可」を受領済み。通常画面の新規既定はまだv7で、導入操作・通常sessionのv8接続はC2で行う。C1のv8を通常sessionへ落とす処理は明示的に拒否し、旧Bやv7へ読み替えない。

## 入口と所有

`introduceTerrainProduction` は所有済みv7の確定年J、pendingなし、J<10000から、本番専用の不変rootを作る。本番の既存rootへの再導入だけは同一rootを返す。試走・clone・本番風のadapterを受け付けない。

本番rootは `terrain-production-world-v1/status: production`、土地の印は `terrainPolicyBoundary: terrain-development-v1`、台帳は `terrainDevelopment`。trialのroot・packet・永続印を再利用しない。地形の不変結果データと純粋な計算・native検証だけを非公開の内部処理として共有する。共有処理は正本を所有せず、本番と試走の各入口が最後に別のcacheへ登録する。

本番writerが試走の公開moduleを読み込めない状態でも、新しいv8を作って進行・保存できることを検証する。逆に、本番rootを試走や旧B/C3のpublic APIへ渡しても、古い所有cacheへ移らない。

## 年次と地形

本番の規則 `terrain-cut-v1` はBのreview-v2と同じ幾何・候補順序・年次効果。旧A2のreview-v1も別に再検証できる。v1だけの周囲処理と、modernな段状apron／decal除外を区別し、本番の規則名へ変えた際に初期の幾何へ戻さない。

一つの私有batchに経済・建築・水路・植生・RNG phaseを持ち越す。年末の承認Yを保存し、Y+1から地形と実際の植生clearが作用する。pendingは選択後に一度だけcommitし、分割・手動・自動・再開で同じ結果になる。年10000に未作用の工事を新設しない。観測で工事を進めない。

`small-cut-no-direct-economic-effect-v1` は追加負担0／直接収穫加算0。これを保存し、native readerと本番所有境界で固定値を確認する。D3 combinedの全receiptとphaseは元のD3導入年から保持する。D3導入575年・D4導入625年・経済checkpoint675年のように、導入年とcheckpointの位相が異なる例も再開できる。

## 正常保存と互換

v8は `namonaki-world-save` の平らな完全世界。初期地形・敷地・文明・植生・環境・水路・元のD3経済と、改変履歴・本番台帳を一度ずつ保持する。v7起点の不変prefixは本体の静的値とappend-only台帳を参照し、起点hashと小さいscalarを保持する。試走とは別のorigin／current参照dialectを使う。

共通async parser／gzip envelopeへ版8を追加する。同期validatorが受け付けるのは検証済みpacketのみ。外部v8はdetach・freezeを終えてからhashを待ち、初期地形、差分前後・親子revision、同年の占有と到達性、出生年の敷地、植生出典、元のv7起点、さらにD3の元のv6以来の全経済・環境・phaseを検証してから所有する。

native v8読込と再書出しでは、試走の公開API、年次runner、world／気候producer、新しい配置・水路・地形候補の探索、RNG nextを遮断しても成功する。指定された保存工事や既存橋の局所的な幾何再検証は行う。全候補の最良性や全文明抽選の真正性を証明したという意味ではない。

読込順はv8→v7→v6→v5→旧キー。存在する先頭が壊れていれば停止する。v8保存は `namonaki-story-v8` だけに書き、旧v7キーを保持する。gzip外側の版・modeと内側を照合し、版8のgzip保存用JSONは4MiB、plainは16MiB以内。保存や圧縮の失敗では現在のworld・旧キーを変えず、完全JSONを返す。明示import後の保存優先キーの整理はC2の通常UIへ残す。

v5/v6/v7の意味は変えない。旧保存検索テストは「v8が存在しない」ことを明示したうえで同じ旧優先順位と破損停止を確認する。新しい優先キーを無視する偽のread callbackで通さない。

## 独立した固定参照

本番を同じ変更後の試走と比較するだけにしない。

- Bで固定した5世界の完全な意味世界、receipt tuple、phase、工事内容へ照合する。正規化は所有印と診断値、工事規則名・連鎖hashだけ。セル・cause・作用年・幾何を省かない。
- [840件のRGBA参照](../tests/fixtures/terrain-trial-preproduction-rgba.json)は、受け入れ済みPR99のコミット `a50839a`、成功CI42772530269の実PNGから固定した。従来v7と切り土試走、提出した全景観年・3地区を含み、画素の正規化はしない。
- 本番の世界を別に1万年進め、native cold／9900年からのgzip再開を照合する。旧v7 baselineも独立進行し、変更前のC2固定世界へ照合する。
- 本番だけを作るコードで、試走public moduleを遮断しても動くことを別processで確認する。native readerではさらに全progressと候補探索・RNG advanceを遮断する。

資料は `artifacts/environment34-terrain-production`。世界別に旧v7とv8保存・840景観を出力し、rootに固定参照・再開・容量・性能の報告を残す。容量専用の合成最大4件×640セルの記録は、自然な合法工事・native保存とは区別する。

## 検証とCI

ローカルの初期検証で、関連29件、追加の異なる導入年・気候の未来切替・trial公開API遮断・native遮断4件、実ブラウザ1件が成功した。seed42・1万年の意味世界／経済／phase／工事内容はB固定値に一致し、native coldと9900年gzip再開も一致した。正式な3ケース・1準備＋5回と、5世界全件・840画素は本PRのCIで同一headへ揃えて確認する。

既存28ジョブを維持し、本番専用の監査・正式性能・固定画素jobを追加する。数値基準は年次／hash・gzip込み5秒・25秒、D3比2倍、旧中立共通化比1.10、plain16MiB／gzip4MiBを維持する。

ブラウザ依存パッケージの取得だけに9分以上かかる実行を確認したため、ブラウザjobの全体時間枠とsetup／テスト本体を分ける。setup12分、ブラウザテスト本体10分、後続の比較とartifactを含む全体30分。年次・保存・描画の性能閾値を緩めたものではなく、テストや長期比較を省略しない。

次のC2で通常sessionのasync進行・選択、導入ボタンと正本由来の件数／利用表示、新規既定、保存／import競合、Safari／BGM、通常画面の最終比較・動画を接続する。C1だけをD4全体の完了とはしない。
