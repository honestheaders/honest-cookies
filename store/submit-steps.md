# Honest Cookies をストアに出す手順(PCで約15分)

使うファイル: Googleドライブの「Hornest Tools」→「Honest Cookies 提出用」フォルダ(PCでは マイドライブ\Hornest Tools\Honest Cookies 提出用)。
- honest-cookies-1.0.0.zip(本体)
- store-1.png / store-2.png / store-3.png(画像)
- icon128.png(アイコン)
- listing.md(貼り付ける文)

見つからないときは、ここからも取れます: https://github.com/honestheaders/honest-cookies/tree/main/store

## 1. 本体を上げる
1. Chromeで https://chrome.google.com/webstore/devconsole を開く
2. 「新しいアイテム」→ `honest-cookies-1.0.0.zip` を選ぶ

## 2. ストアの掲載情報(Store listing)
- 説明: listing.md の「## Description」の下の文を全部コピーして貼る
- カテゴリ: 「デベロッパー ツール(Developer Tools)」
- 言語: 英語
- アイコン: `icon128.png`
- スクリーンショット: `store-1.png`、`store-2.png`、`store-3.png`
- 「保存」

## 3. プライバシー(Privacy)
- 単一用途(Single purpose): `View and edit the cookies of sites the user allows.`
- 権限の理由: listing.md の「## Permission justifications」から、それぞれの行をコピー
  - cookies → `to show and change the cookies the user chooses`
  - activeTab → `to know which page the popup was opened on`
  - ホスト権限 → `requested for one site at a time when the user clicks "Allow", required by Chrome to read that site's cookies`
- リモートコード: 「いいえ(No)」
- データの使用: どのデータも集めない(チェックを入れない)。下の3つの「証明」にはチェックを入れる
- プライバシーポリシーURL: `https://github.com/honestheaders/honest-cookies/blob/main/PRIVACY.md`
- 「保存」

## 4. 配布(Distribution)
- 無料、公開(Public)、すべての地域

## 5. 提出
- 「審査のため送信」を押す(「審査後に自動で公開」はオンのまま)
- 終わったら、Claudeに「出した」と送る

注意: Honest Headers のページと料金の設定はさわらない。名前・住所・電話番号を求められたら、入れずにClaudeに知らせる。
