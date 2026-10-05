# Jev / CLEF coding controller: comparison and actual training

有限の修正候補から次の編集を選ぶ coding agent を、Mithril / Kotoba で実装・比較した。
CLEF-Flash の重みを H100 上で更新し、保存した重みを別実行で読み直して検証した。
今回の改善は小規模な合成課題に限られる。一般のリポジトリを自力で修正する能力や
SWE-bench の性能を示す実験ではない。

## 実験の進め方

co-scientist の考え方に沿って、仮説の作成、開発データでの順位付け、方式の固定、
評価、失敗分析、学習データの改訂を繰り返した。

1. `source-choice`、`structured-choice`、`atomic-noul` の3仮説を定義した。
   正解ラベルはモデルのリクエストに含めない。
2. 開発データだけで正答率、Brier、応答時間の順に選び、評価前に選択結果を保存した。
   選ばれた方式は毎回 `structured-choice` だった。
3. 比較モデルに同じ仕様、元コード、テスト、3つの編集候補を渡した。
   初回は回答形式と実行可能性の問題が見つかったため、初回証拠を残して追試した。
4. CLEF の単純な追加学習が未学習形式への過信を増やしたため、その版の全面採用を
   棄却した。次に、失敗した形式を学習へ加え、新しい入力と再帰形式で検証した。

これは、1回のモデル判断と最大2候補の実行検証を揃えた比較である。最初に返された
選択を検証し、失敗すれば確率順の次候補を検証する。結果を受けてモデルが再推論する
ループの性能は、この比較では測っていない。既存の `repair-search` には拒否・復元を
伴う反復実行があるが、その実装と今回の比較条件を混同しない。

## モデル比較：実行可能な16課題（v2）

課題は整数演算、境界条件、クランプ、偶奇、絶対距離、切り上げ除算。
修正前の失敗と正解候補の成功を、評価前に全16課題で確認した。
Amu は `ac99fd3c40180fd5cbd3865cb0868b52d8b9ff6a` に固定した。

| モデル | 有効回答 | 初回編集の成功 | 2候補以内の成功 |
| --- | ---: | ---: | ---: |
| Jev 1.13 / structured | 16/16 | 16/16 | 16/16 |
| Qwen3-Coder-30B-A3B / typed JSON | 15/16 | 14/16 | 14/16 |
| CLEF-Flash / 未学習 | 16/16 | 14/16 | 16/16 |
| CLEF-Flash / 4形式で追加学習 | 16/16 | 14/16 | 16/16 |

Qwen の残り2件は誤った編集1件と回答形式違反1件であり、2件ともコード推論の誤答と
数えてはいけない。有効回答だけの正答率は14/15。Qwen は公開の接続先情報を確認し、
JSON Schema をサポートする SiliconFlow に固定した。候補名を補正する処理はしない。

Jev の基本入力も16/16で、正答率の向上は観測されなかった。新しい課題形式8件では、
構造化入力で NLL が `0.03971 -> 0.01277`、Brier が `0.00775 -> 0.000975` に減った。
この確率評価の変化と正答率の改善を区別する。

Jev structured の API 往復は平均395.1 ms、Qwen は平均3719.5 ms。
これは今回の接続先と回答方式を含む1回ずつの観測であり、一般的な速度順位ではない。
候補1件のコンパイル・テストには平均約6.8秒かかり、判断時間だけを coding agent 全体の
時間と扱うこともできない。CLEF の GPU 内計測は API 往復と比較しない。

Gemini 2.5 Flash も初回の開発8件と既知形式の評価8件には正答したが、その後は
HTTP 402 が発生した。v2 は評価16件ともサービスエラーで、能力比較から除外する。
v3 では Qwen、続いて Jev も残高不足になった。160トークンまで上限を下げた開発用の
診断でも不足が確認され、追加購入はしていない。これらのエラーを低いモデル能力と
読み替えない。再開には利用枠の回復と新しい実験記録が必要になる。

## 実学習：形式を加えたカリキュラム（v3）

[CLEF-Flash](https://huggingface.co/Cloudflare/clef-flash) の公開リビジョン
`17f0b0ad64efb65d273590632833508766b2aae6` を使用した。
バックボーンを凍結し、判断ヘッドの **121,762,820パラメータ**を更新した。
Hy が学習処理の原本で、Modal の実行用 Python は Hy から生成した。

- 学習96件：6形式 × 定数2〜17。
- 開発12件：6形式 × 定数23・29。チェックポイント選択に使うのは開発 NLL だけ。
- 既存形式の回帰確認8件：4形式 × 定数37・41。
- 新しい対象入力8件：距離・切り上げ除算 × 定数19・27・38・46。
- 未学習形式8件：再帰による総和・階乗。学習にも開発にも入れない。
- AdamW、学習率0.0001、12 epoch、seed 20261005、H100。選択は epoch 12。

以前に評価した距離・除算の形式は、ここでは学習済み形式になる。以前の評価の一部も
学習側へ移している。そのため「未知形式へのゼロショット改善」とは呼ばない。
新しい対象の8入力は、その課題形式について学習・開発・過去の評価に含めていない。

| 評価 | 未学習ヘッド | 学習後 |
| --- | ---: | ---: |
| 新しい対象入力：初回正解 | 7/8 | **8/8** |
| 既存形式の回帰確認 | 8/8 | 8/8 |
| 未学習の再帰形式 | 7/8 | 7/8 |
| 新しい対象入力：Brier | 0.15885 | 約0 |
| 新しい対象入力：NLL | 0.30242 | 約0 |
| 未学習形式：Brier | 0.15355 | 0.13821 |
| 未学習形式：NLL | 0.31371 | 0.30001 |
| 未学習形式：ECE（10 bins） | 0.13559 | **0.21016** |

正解が1件増えたという観測は得られたが、8件では効果の確立にならない。7/8の
Wilson 95%区間は約0.529〜0.978、8/8は約0.676〜1.000で、大きく重なる。
未学習形式の ECE は悪化している。全体の重み置き換えは検証不足で、本番へは配置していない。
判断ヘッドの追加学習が狭い修正カタログに効く候補であることまで確認した。

なお v2 の4形式だけの学習では、未知形式の正答率は6/8のままで、NLL が
`0.54027 -> 0.95166`、ECE が `0.04192 -> 0.24968` に悪化した。この失敗も保存した。
改善した結果だけを抜き出して単純学習の有効性を主張しない。

## 実行と保存

全ての実行確認は、一時ワークスペースで有限の式置換を適用し、ホスト向けネイティブ
コンパイルと KIR・JS・Wasm の5テストを実行した。歴史的な `:jvm-kir` という報告名は
KIR インタプリタを指し、JVM は使用していない。ネイティブ成果物そのものの実行結果と
3つの意味論ターゲットのテスト結果は別の証拠である。
試行後は元ソースへ戻し、成功しても既存の利用者コードへは昇格しない。

保存した最新ヘッド：`.repair-artifacts/clef-head.safetensors`（Gitには含めない）。
SHA-256：`47a64230cc59d8fac2dd04f03be1202ab3c490ccc6b0fb56ee8ffcc2056c0843`。
GPU側の保存先は `mithril-clef-repair-pilot` Volume の
`/runs/20261005-022033/joint_head.safetensors`。初期の棄却した重みも別の保存先に残した。

別の実行でヘッドを読み直し、特徴量キャッシュを使わずに全24評価課題を推論した。
モデルの元のヘッドと学習後のヘッドそれぞれについて、学習実験時の選択との一致と
チェックポイントのハッシュを `clef-checkpoint-inference.json` に記録した。
API 料金は使用記録のある呼び出しについてだけ集計する。GPUの構築・ダウンロード・
利用料金はその集計に含まれず、無料という意味ではない。

## 再現と成果物

各実験の `preregister`、`hypothesis-selection`、`provider-rows`、
`clef-training-report`、`native-rows`、`summary` は
`bench/repair-coscientist/`、`v2/`、`v3/` に保存した。追試は初回の結果を上書きしない。
生の回答は公開の合成入力だけに関するもので、APIキーを記録していない。

```sh
# 制御器・評価器の検証（外部モデル呼び出しなし）
kbb --backend sci --config repair.edn --classpath src:test test/run_repair.cljk

# 保存済み回答の実行検証と集計（外部モデル呼び出しなし）
MITHRIL_REPAIR_EXPERIMENT_ROOT=bench/repair-coscientist/v3 \
  kbb --backend sci --config repair.edn --classpath src \
  bin/mithril-repair-qualify.cljk /absolute/path/to/pinned/amu/bin/amu
MITHRIL_REPAIR_EXPERIMENT_ROOT=bench/repair-coscientist/v3 \
  kbb --backend sci --config repair.edn --classpath src bin/mithril-repair-report.cljk

# Hy -> Modal実行用モジュール。学習には認証済みModal環境が必要。
hy2py scripts/clef_repair_train.hy > /tmp/mithril-clef-train.py
python /tmp/mithril-clef-train.py \
  bench/repair-coscientist/v3/clef-records.json /tmp/new-training-report.json
```

モデル比較は、小さく相関した合成課題を1回ずつ測った探索的実験である。v2以降は
初回の失敗を見て設計を改訂しており、完全に未観測の確認的実験ではない。
未知ドメイン、日本語の自然言語指示、任意のパッチ生成、大規模リポジトリでの
依存関係変更、複数回のばらつき、実運用の分布は未測定。

検証器と分割・確率・拒否・候補順・残高不足時の停止テストは11件、587 assertionsで成功した。
既存の単独修正例と拒否ルールは保持している。実装と記録はローカルの
`feat/system-one-repair` ブランチにあり、mainへの統合・本番への配置はしていない。

一次資料：[CLEF](https://huggingface.co/Cloudflare/clef)、
[CLEF-Flash](https://huggingface.co/Cloudflare/clef-flash)、
[co-scientist](https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/)、
[OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs)。
