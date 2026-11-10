# CI運用改善 — 変更範囲別の検証（初期版）

対象：`.github/workflows/ci.yml` ／ `scripts/ci-scope.mjs`

## なぜ変えるか

2026-11-10時点のCIは21種類のジョブ＋住宅の3×3マトリクスで、**PR 1件に29ジョブ**が同時起動されていた。例えばPR #106では同一PRへの細かな更新で古いCIも残り、最後の長期ジョブは実処理約23分のほか、割り当て開始まで約39分待った。PR #105の設計文書変更でも長期検証がすべて実行されていた。

問題は「長期検証が不要」なことではなく、「独立試作・文書変更でも本編の1万年検証を繰り返す」ことと「古いPR実行が居残る」こと。**全体検証は削除せず、条件別に発動させる。**

## 運用スコープ

| 対象 | `scope` の結果 | CIで動くジョブ | 実行する検証 |
|---|---|---|---|
| `README.md` や `docs/` 配下の説明文・画像のみ | `docs` | `scope` のみ | パス分類の単体テストと変更確認 |
| Issue #35 D1の独立ギャラリー実装・テスト（下記厳格リスト）＋説明文 | `prototype` | `scope` と既存`test` | Fable版の建築試作の単体テスト、320×180pxギャラリー生成、画像アーティファクト |
| `src/story`、`src/engine`、`src/scene`、`src/terrain`、`src/environment`、`src/irrigation`、保存、UI、依存関係、未知のスクリプト、CI設定など | `full` | **既存の全29ジョブ**＋`scope` | 従来のシミュレーション・保存・1万年・ブラウザ・性能・容量検証 |
| `push` to `main`／手動`workflow_dispatch` | `full` | **既存の全29ジョブ**＋`scope` | 総合回帰。仕様変更やマージ後に走り、網羅性を維持 |
| PRにラベル`ci:full`を追加 | `full` | **既存の全29ジョブ**＋`scope` | 変更範囲が小さくても明示的に全体実行 |

**prototypeの許可ファイルは以下の4つだけ**。

- `scripts/preview-architecture.mjs`
- `scripts/lib/architecture-samples.mjs`
- `tests/architecture-prototype.test.mjs`
- `tests/fixtures/architecture35-d1-png-sha256.json`

Issue #35 D2-aで、D1試作の描画は本番の`src/architecture`へ移した（`scripts/lib/architecture-prototype.mjs`は削除）。ギャラリーは`dist/architecture`を読むため、prototypeでも`npm ci`と`npm run build`を行ってからテストとギャラリー生成をする。`src/architecture`自体の変更は本番コードなので常にfullとする。

この4つに`docs/`の説明文を足すことはできる。共有の`scripts/lib/pixel-raster.mjs`、本編の`src/`、ほかのテスト、`package.json`、CIやPagesのワークフロー変更などを含む場合は**すべてfullへ昇格**する。Fable版の試作を本編へ接続するD2以降も当然fullになる。

分類はPRの比較元とHEADの**merge-base**との差分に含まれる全ファイルをチェックする。未知のパスや空差分は`full`。比較SHAの取得・git diff・単体テスト・分類スクリプト自体が失敗した場合は`scope`が失敗し、ほかのジョブは安全側に停止する。見逃して軽量へ落とすことはしない。

## CIの重複実行

`concurrency` のグループをPR番号で分け、PRに新しいコミットが来たときは同一PRの旧CIをキャンセルする。別のPR、または`main`のCIはキャンセルしない。既存のGitHub Pagesワークフローのデプロイ制御には触れない。

結果として、PRに数回の修正を入れても、**同じPRの古い29ジョブが稼働し続けることを防ぐ**。

## レビューの注意

- このPRは、**fullの実行内容を削減せず、実行条件だけ変更**する。住宅マトリクスの全3seed×3条件、長期試走、保存互換、環境・経済・灌漑などの監査を削除しない。
- `test` は従来のジョブ名を維持。`docs`に限って`skipped`となる。既存のbranch protectionやrulesetで`CI / test`等が必須になっている場合は、**実際のPRで合否・マージ制約を検証**する。新しい`CI / scope`を必須にする運用も推奨。
- 初回PRはCIファイル自体の変更を含むので`full`を走らせ、移行の正しさを検証する。
- 人の視覚的審査が必要な建築試作は`architecture35-d1-gallery`を提出する。画像が生成されただけでD1の表現がHuman承認されたことにしない。
- `README`や`docs/`で実行プログラムを扱う運用に変わった場合、docs判定のホワイトリストを見直す。
- 既存の`test`内のソース回帰テストの範囲を短縮するわけではない。短縮の主効果は**docs/独立ギャラリーPRの全検証を抑制**し、全体CIの重複実行を削ること。

## 検証手順（Humanレビュー）

1. 本CI変更PRで`CI / scope`が`full`を選択し、29既存ジョブの実行が維持されることを確認する。
2. 別の`docs`のみの試験PRで、`CI / scope`成功・`CI / test`および全長期ジョブがskippedになること、branch protectionで意図せずマージ不能にならないことを確認する。
3. `scripts/preview-architecture.mjs`のみの更新で`prototype`になり、`CI / test`の試作テストと`architecture35-d1-gallery`が生成され、長期ジョブがskippedになることを確認する。
4. `src/story/world-save.ts`や`scripts/lib/pixel-raster.mjs`が含まれる変更で必ず`full`になることを分類テストで確認する。
5. 同一PRへ短時間に2コミットを作る検証は、不要な計算を発生させないため**独立した安全な試験PRだけで実施**する。旧runが`cancelled`になっても新runが成功すればよい。

## 期待する効果と限界

docsは`scope`のみ、prototypeは`scope`＋`test`のみ。後者はPlaywrightのOS依存パッケージ導入も、1万年の全検証も不要になるため、大幅に短くなると期待できる。ただし目標時間はCIの実測で評価する。**本編コードのPRは当面fullを維持するため、1時間近いケースが完全になくなるとは約束しない**。fullの分野別分割・特定パスの依存影響の判定・ジョブ数削減は、今回の導入後のデータをもとに次の独立PRで検討する。

### 計測したい値

PR作成→最終チェック完了の経過時間、`scope`処理時間、run待ち時間、合計ジョブ実行分数、`CI / test`単体時間、キャンセルされた旧CIの件数、fullからの誤った検証省略の有無。実測の前後を混同しない。
