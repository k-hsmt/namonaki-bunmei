# Issue #31 Q5/Q8 — 12世界・予約3案の比較

2026-11-07 Human判断：Q5は「畑1区画のみ予約」、Q8は「差を明記したうえで許容する」で確定。本番候補の `terrain-placement-v1` に反映する。以下の試走結果は判断根拠として保持する。

固定seed 1, 3, 6, 29, 85, 131, 7, 198, 10, 12, 21, 24を置換せず、全3地点を2000年まで進めた36試走。生成・初期計画・地表/占有検証の失敗は0。文明の直接モデル、RNG、選択列、災害年は各旧進行ベースラインと一致した。

| 予約方式 | 住宅街区合計 | 住宅占有面積 px | 通常施設未成立枠 | civic | 共同空地 | 橋 | 都市到達地区 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| wide | 789 | 113616 | 6 | 12 | 3 | 10 | 9 |
| field-only | 801 | 115344 | 6 | 12 | 7 | 10 | 9 |
| none | 801 | 115344 | 6 | 12 | 7 | 10 | 9 |

数値は12世界×3地点の合計。同じ建物の状態更新を新設件数に数えない。都市到達年は未到達をnullのまま保持する。`field-only`を推奨する。この標本で`none`と同数の住宅・空地を許し、初期の畑予備地1区画は保護するため。住宅数だけによる自動承認ではない。Q6の試走値は住宅等grade≤1/標高差≤1、hall等grade0/差0、通路幅2px、候補格子2px。

Q8の間接差：seed 29（二つの中州）と21（網状河川）の川辺は安全な単径間橋がなく、橋枠HOLDにより後続の家屋2件・工房1件が未成立。従来の先頭枠規則を維持した結果、都市到達は旧進行の1067年/962年から2000年時点で未到達となる。3予約案とも同じ。橋HOLDはそれぞれ337回/474回で、後続枠へ飛ばして補完していない。この差の本番許容はHumanが承認済み（設計§7.8/§12、2026-11-07の回答）。

再現：`node scripts/review-generated-scenes.mjs`。成果物`artifacts/terrain31-scenes/index.html`は108景観を予約3案ごとに並べ、320×180原寸と1280×720の4倍を収録。`report.json`はHOLD理由と連続期間、全地点の未成立ID、旧進行との都市到達年差を保持。`*_review.json`は各試走の完全な独立レビュー状態。CI成果物`terrain31-scenes-q5`から一式取得する。

これはD4-Aの構造描画とQ5判断の資料。大気・人物・装飾は保存地形と現在の通行・確定建物へ接続したが、最終景観/D5受入ではない。描画更新時は保存した36試走を再読して再描画でき、建設結果を変更しない。v5本番保存・UI、新規ゲームへの有効化は未実施。本番候補は畑1区画のみ予約に固定し、3案の試走結果は比較資料として保持する。

## 地点別の結果

| seed | site | mode | houses | area px | unbuilt ordinary | civic | public | bridge | city year | baseline city |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1 | river-bank | wide | 23 | 3312 | 0 | 1 | 0 | 1 | 1172 | 1172 |
| 1 | hill-side | wide | 21 | 3024 | 0 | 0 | 0 | 0 | unreached | unreached |
| 1 | coast-inlet | wide | 14 | 2016 | 0 | 0 | 0 | 0 | unreached | unreached |
| 1 | river-bank | field-only | 16 | 2304 | 0 | 1 | 0 | 1 | 1172 | 1172 |
| 1 | hill-side | field-only | 21 | 3024 | 0 | 0 | 0 | 0 | unreached | unreached |
| 1 | coast-inlet | field-only | 14 | 2016 | 0 | 0 | 0 | 0 | unreached | unreached |
| 1 | river-bank | none | 16 | 2304 | 0 | 1 | 0 | 1 | 1172 | 1172 |
| 1 | hill-side | none | 21 | 3024 | 0 | 0 | 0 | 0 | unreached | unreached |
| 1 | coast-inlet | none | 14 | 2016 | 0 | 0 | 0 | 0 | unreached | unreached |
| 3 | river-bank | wide | 14 | 2016 | 0 | 1 | 0 | 1 | 514 | 514 |
| 3 | hill-side | wide | 32 | 4608 | 0 | 0 | 0 | 0 | unreached | unreached |
| 3 | coast-inlet | wide | 30 | 4320 | 0 | 0 | 0 | 0 | 655 | 655 |
| 3 | river-bank | field-only | 14 | 2016 | 0 | 1 | 1 | 1 | 514 | 514 |
| 3 | hill-side | field-only | 32 | 4608 | 0 | 0 | 0 | 0 | unreached | unreached |
| 3 | coast-inlet | field-only | 30 | 4320 | 0 | 0 | 0 | 0 | 655 | 655 |
| 3 | river-bank | none | 14 | 2016 | 0 | 1 | 1 | 1 | 514 | 514 |
| 3 | hill-side | none | 32 | 4608 | 0 | 0 | 0 | 0 | unreached | unreached |
| 3 | coast-inlet | none | 30 | 4320 | 0 | 0 | 0 | 0 | 655 | 655 |
| 6 | river-bank | wide | 26 | 3744 | 0 | 1 | 0 | 1 | 940 | 940 |
| 6 | hill-side | wide | 23 | 3312 | 0 | 0 | 0 | 0 | unreached | unreached |
| 6 | coast-inlet | wide | 22 | 3168 | 0 | 0 | 0 | 0 | unreached | unreached |
| 6 | river-bank | field-only | 26 | 3744 | 0 | 1 | 0 | 1 | 940 | 940 |
| 6 | hill-side | field-only | 23 | 3312 | 0 | 0 | 0 | 0 | unreached | unreached |
| 6 | coast-inlet | field-only | 22 | 3168 | 0 | 0 | 0 | 0 | unreached | unreached |
| 6 | river-bank | none | 26 | 3744 | 0 | 1 | 0 | 1 | 940 | 940 |
| 6 | hill-side | none | 23 | 3312 | 0 | 0 | 0 | 0 | unreached | unreached |
| 6 | coast-inlet | none | 22 | 3168 | 0 | 0 | 0 | 0 | unreached | unreached |
| 29 | river-bank | wide | 21 | 3024 | 3 | 0 | 0 | 0 | unreached | 1067 |
| 29 | hill-side | wide | 21 | 3024 | 0 | 1 | 0 | 0 | unreached | unreached |
| 29 | coast-inlet | wide | 20 | 2880 | 0 | 0 | 0 | 0 | unreached | unreached |
| 29 | river-bank | field-only | 21 | 3024 | 3 | 0 | 0 | 0 | unreached | 1067 |
| 29 | hill-side | field-only | 21 | 3024 | 0 | 1 | 1 | 0 | unreached | unreached |
| 29 | coast-inlet | field-only | 20 | 2880 | 0 | 0 | 0 | 0 | unreached | unreached |
| 29 | river-bank | none | 21 | 3024 | 3 | 0 | 0 | 0 | unreached | 1067 |
| 29 | hill-side | none | 21 | 3024 | 0 | 1 | 1 | 0 | unreached | unreached |
| 29 | coast-inlet | none | 20 | 2880 | 0 | 0 | 0 | 0 | unreached | unreached |
| 85 | river-bank | wide | 23 | 3312 | 0 | 0 | 0 | 1 | 1138 | 1138 |
| 85 | hill-side | wide | 13 | 1872 | 0 | 0 | 0 | 0 | unreached | unreached |
| 85 | coast-inlet | wide | 21 | 3024 | 0 | 1 | 0 | 0 | unreached | unreached |
| 85 | river-bank | field-only | 23 | 3312 | 0 | 0 | 0 | 1 | 1138 | 1138 |
| 85 | hill-side | field-only | 13 | 1872 | 0 | 0 | 0 | 0 | unreached | unreached |
| 85 | coast-inlet | field-only | 21 | 3024 | 0 | 1 | 0 | 0 | unreached | unreached |
| 85 | river-bank | none | 23 | 3312 | 0 | 0 | 0 | 1 | 1138 | 1138 |
| 85 | hill-side | none | 13 | 1872 | 0 | 0 | 0 | 0 | unreached | unreached |
| 85 | coast-inlet | none | 21 | 3024 | 0 | 1 | 0 | 0 | unreached | unreached |
| 131 | river-bank | wide | 20 | 2880 | 0 | 1 | 1 | 1 | 897 | 897 |
| 131 | hill-side | wide | 24 | 3456 | 0 | 0 | 0 | 0 | unreached | unreached |
| 131 | coast-inlet | wide | 23 | 3312 | 0 | 1 | 0 | 0 | 1102 | 1102 |
| 131 | river-bank | field-only | 20 | 2880 | 0 | 1 | 1 | 1 | 897 | 897 |
| 131 | hill-side | field-only | 24 | 3456 | 0 | 0 | 0 | 0 | unreached | unreached |
| 131 | coast-inlet | field-only | 23 | 3312 | 0 | 1 | 0 | 0 | 1102 | 1102 |
| 131 | river-bank | none | 20 | 2880 | 0 | 1 | 1 | 1 | 897 | 897 |
| 131 | hill-side | none | 24 | 3456 | 0 | 0 | 0 | 0 | unreached | unreached |
| 131 | coast-inlet | none | 23 | 3312 | 0 | 1 | 0 | 0 | 1102 | 1102 |
| 7 | river-bank | wide | 17 | 2448 | 0 | 1 | 1 | 1 | unreached | unreached |
| 7 | hill-side | wide | 22 | 3168 | 0 | 0 | 0 | 0 | unreached | unreached |
| 7 | coast-inlet | wide | 22 | 3168 | 0 | 0 | 0 | 0 | unreached | unreached |
| 7 | river-bank | field-only | 17 | 2448 | 0 | 1 | 1 | 1 | unreached | unreached |
| 7 | hill-side | field-only | 22 | 3168 | 0 | 0 | 0 | 0 | unreached | unreached |
| 7 | coast-inlet | field-only | 22 | 3168 | 0 | 0 | 0 | 0 | unreached | unreached |
| 7 | river-bank | none | 17 | 2448 | 0 | 1 | 1 | 1 | unreached | unreached |
| 7 | hill-side | none | 22 | 3168 | 0 | 0 | 0 | 0 | unreached | unreached |
| 7 | coast-inlet | none | 22 | 3168 | 0 | 0 | 0 | 0 | unreached | unreached |
| 198 | river-bank | wide | 29 | 4176 | 0 | 1 | 1 | 1 | unreached | unreached |
| 198 | hill-side | wide | 27 | 3888 | 0 | 0 | 0 | 0 | unreached | unreached |
| 198 | coast-inlet | wide | 26 | 3744 | 0 | 0 | 0 | 0 | 783 | 783 |
| 198 | river-bank | field-only | 29 | 4176 | 0 | 1 | 1 | 1 | unreached | unreached |
| 198 | hill-side | field-only | 27 | 3888 | 0 | 0 | 0 | 0 | unreached | unreached |
| 198 | coast-inlet | field-only | 26 | 3744 | 0 | 0 | 0 | 0 | 783 | 783 |
| 198 | river-bank | none | 29 | 4176 | 0 | 1 | 1 | 1 | unreached | unreached |
| 198 | hill-side | none | 27 | 3888 | 0 | 0 | 0 | 0 | unreached | unreached |
| 198 | coast-inlet | none | 26 | 3744 | 0 | 0 | 0 | 0 | 783 | 783 |
| 10 | river-bank | wide | 30 | 4320 | 0 | 1 | 0 | 1 | 797 | 797 |
| 10 | hill-side | wide | 28 | 4032 | 0 | 0 | 0 | 0 | unreached | unreached |
| 10 | coast-inlet | wide | 27 | 3888 | 0 | 0 | 0 | 0 | unreached | unreached |
| 10 | river-bank | field-only | 30 | 4320 | 0 | 1 | 0 | 1 | 797 | 797 |
| 10 | hill-side | field-only | 28 | 4032 | 0 | 0 | 0 | 0 | unreached | unreached |
| 10 | coast-inlet | field-only | 27 | 3888 | 0 | 0 | 0 | 0 | unreached | unreached |
| 10 | river-bank | none | 30 | 4320 | 0 | 1 | 0 | 1 | 797 | 797 |
| 10 | hill-side | none | 28 | 4032 | 0 | 0 | 0 | 0 | unreached | unreached |
| 10 | coast-inlet | none | 27 | 3888 | 0 | 0 | 0 | 0 | unreached | unreached |
| 12 | river-bank | wide | 19 | 2736 | 0 | 1 | 0 | 1 | unreached | unreached |
| 12 | hill-side | wide | 25 | 3600 | 0 | 0 | 0 | 0 | unreached | unreached |
| 12 | coast-inlet | wide | 24 | 3456 | 0 | 0 | 0 | 0 | unreached | unreached |
| 12 | river-bank | field-only | 28 | 4032 | 0 | 1 | 1 | 1 | unreached | unreached |
| 12 | hill-side | field-only | 25 | 3600 | 0 | 0 | 0 | 0 | unreached | unreached |
| 12 | coast-inlet | field-only | 24 | 3456 | 0 | 0 | 0 | 0 | unreached | unreached |
| 12 | river-bank | none | 28 | 4032 | 0 | 1 | 1 | 1 | unreached | unreached |
| 12 | hill-side | none | 25 | 3600 | 0 | 0 | 0 | 0 | unreached | unreached |
| 12 | coast-inlet | none | 24 | 3456 | 0 | 0 | 0 | 0 | unreached | unreached |
| 21 | river-bank | wide | 25 | 3600 | 3 | 1 | 0 | 0 | unreached | 962 |
| 21 | hill-side | wide | 23 | 3312 | 0 | 0 | 0 | 0 | unreached | unreached |
| 21 | coast-inlet | wide | 23 | 3312 | 0 | 0 | 0 | 0 | unreached | unreached |
| 21 | river-bank | field-only | 24 | 3456 | 3 | 1 | 1 | 0 | unreached | 962 |
| 21 | hill-side | field-only | 23 | 3312 | 0 | 0 | 0 | 0 | unreached | unreached |
| 21 | coast-inlet | field-only | 23 | 3312 | 0 | 0 | 0 | 0 | unreached | unreached |
| 21 | river-bank | none | 24 | 3456 | 3 | 1 | 1 | 0 | unreached | 962 |
| 21 | hill-side | none | 23 | 3312 | 0 | 0 | 0 | 0 | unreached | unreached |
| 21 | coast-inlet | none | 23 | 3312 | 0 | 0 | 0 | 0 | unreached | unreached |
| 24 | river-bank | wide | 9 | 1296 | 0 | 0 | 0 | 1 | unreached | unreached |
| 24 | hill-side | wide | 11 | 1584 | 0 | 0 | 0 | 0 | unreached | unreached |
| 24 | coast-inlet | wide | 11 | 1584 | 0 | 0 | 0 | 0 | unreached | unreached |
| 24 | river-bank | field-only | 20 | 2880 | 0 | 0 | 0 | 1 | unreached | unreached |
| 24 | hill-side | field-only | 11 | 1584 | 0 | 0 | 0 | 0 | unreached | unreached |
| 24 | coast-inlet | field-only | 11 | 1584 | 0 | 0 | 0 | 0 | unreached | unreached |
| 24 | river-bank | none | 20 | 2880 | 0 | 0 | 0 | 1 | unreached | unreached |
| 24 | hill-side | none | 11 | 1584 | 0 | 0 | 0 | 0 | unreached | unreached |
| 24 | coast-inlet | none | 11 | 1584 | 0 | 0 | 0 | 0 | unreached | unreached |
