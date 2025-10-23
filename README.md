# VertexAiUtil for Google Apps Script

[![License MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.4.1-blue)](https://github.com/youaoi/gas_VertexAiUtil)

`VertexAiUtil`は、Google Apps Script（GAS）からGoogle Cloudの**Vertex AI Gemini API**を簡単かつ高機能に利用するための統合ライブラリです。複雑な認証処理をカプセル化し、数行のコードで最新の生成AI機能を呼び出すことができます。

単純なテキスト生成から、画像やファイルを解析するマルチモーダル機能、会話の文脈を維持するチャット機能、さらには自動リトライやデバッグモードといった堅牢な運用を支える機能まで、幅広くサポートします。


## ✨ 特徴 (Features)

- **簡単なセットアップ**: `OAuth2`ライブラリとサービスアカウントキーを設定するだけで、すぐに利用を開始できます。
- **多彩な生成機能:**
  - `generateText`: シンプルなテキスト生成
  - `generateJson`: 構造化されたJSONオブジェクトの生成
  - `generateTextWithAttachment`: 画像やPDFファイルの内容を読み取って回答を生成 (マルチモーダル)
- **会話の文脈を維持**: `startChat`メソッドで、過去のやり取りを記憶するチャットセッションを簡単に実現できます。
- **直感的なオプション設定**: メソッドチェーンで設定可能な`Option`クラスにより、モデルや`temperature`などを安全かつ可読性高く指定できます。
- **堅牢な運用機能:**
  - **自動リトライ**: サーバーエラー(5xx)発生時に自動で再試行します。
  - **デバッグモード**: APIとの通信内容を詳細にログ出力し、問題解決をサポートします。
  - **カスタムエラー**: 設定不備やAPIエラーを判別しやすいカスタムエラーオブジェクトをスローします。
  - **コスト管理**: `countTokens`メソッドで、API呼び出し前に消費トークン数を見積もることができます。


## 🔧 セットアップ (Setup)

このライブラリを利用するには、`OAuth2`ライブラリの追加、`VertexAiUtil.gs` の追加、そしてスクリプトプロパティ設定が必要です。

### 1. OAuth2ライブラリの追加 (必須)

このライブラリはGoogle製`OAuth2`ライブラリに依存しています。

1. スクリプトエディタの左側のメニューから **「ライブラリ」** の **「+」** をクリックします。
2. 「スクリプトID」の欄に以下のIDを貼り付け、「検索」をクリックします。

   ```text
   1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF
   ```

3. 「バージョン」は**最新のもの**を選択し、識別子が`OAuth2`であることを確認して「追加」をクリックします。

### 2. 本ライブラリ (VertexAiUtil) の追加

スクリプトIDによるライブラリ公開は行わないため、プロジェクト内にファイルを作成してコピー＆ペーストで追加します。

1. 対象のGoogle Apps Scriptプロジェクトを開きます。
2. 左側のファイル一覧で「+」 > 「スクリプト」を選び、新規ファイル `VertexAiUtil.gs` を作成します。
3. このリポジトリに含まれる [VertexAiUtil.gs](VertexAiUtil.gs) の内容を全てコピーし、作成した `VertexAiUtil.gs` に貼り付けて保存します。
4. 以降、コード内から `VertexAiUtil` をそのまま利用できます（ライブラリ追加は不要）。

### 3. スクリプトプロパティの設定 (必須)

1. [ファイル] > [プロジェクトの設定] > [スクリプト プロパティ] を開きます。
2. 「プロパティを追加」をクリックし、以下のキーと値を設定します。

- `SA_KEY_JSON`
  - 値: サービスアカウントのJSONキーの中身
  - 説明: **（必須）** Google Cloudからダウンロードしたキーファイルの中身を**全て**コピー＆ペーストします。
- `TEST_FILE_ID`
  - 値: GoogleドライブのファイルID
  - 説明: **（任意）** マルチモーダル機能のテスト(`testGenerateTextWithAttachment`)で使用する画像ファイルなどのID。

### サービスアカウントキー (JSON) の取得方法

1. Google Cloud Platform (GCP) コンソールで、対象のGCPプロジェクトを選択します。
2. [IAMと管理] > [サービスアカウント] に移動します。
3. 使用するサービスアカウントを選択するか、新規に作成し、**「Vertex AI ユーザー」** のロールを付与します。
4. アカウント詳細画面の [キー] タブで [鍵を追加] > [新しい鍵を作成] > `JSON` を選択して作成・ダウンロードします。
5. ダウンロードしたJSONファイルの中身を全てコピーし、上記 `SA_KEY_JSON` の値に貼り付けます。


## 使い方 (Usage)

### 基本的なテキスト生成

```javascript
function myFunction() {
  const prompt = "Google Apps Scriptの主な利点を3つ教えてください。";
  const response = VertexAiUtil.generateText(prompt);
  console.log(response);
}
```

### オプションを指定したテキスト生成

`Option`クラスを使うと、モデルや創造性（temperature）などを直感的に設定できます。

```javascript
function generateWithOption() {
  const prompt = "「API」とは何か、5歳児にも分かるように説明してください。";

  const options = new VertexAiUtil.Option()
    .setModel(VertexAiUtil.GEMINI_MODELS.PRO_2_5)
    .setTemperature(0.2)
    .setMaxOutputTokens(VertexAiUtil.VTX_MAX_TOKENS.BRIEF);

  const response = VertexAiUtil.generateText(prompt, options);
  console.log(response);
}
```

### JSONオブジェクトの生成

プロンプトでJSON形式を指示することで、構造化されたデータを取得できます。

```javascript
function generateJsonData() {
  const prompt = '次の文章から{ "name": "...", "company": "..." }の形式でJSONを抽出してください。「鈴木一朗はAcme Corporationに勤務しています。」';
  const data = VertexAiUtil.generateJson(prompt);

  console.log(data.name);    // "鈴木一朗"
  console.log(data.company); // "Acme Corporation"
}
```

### チャット（会話履歴の維持）

`startChat`でセッションを開始し、`sendMessage`で会話を続けます。

```javascript
function chatExample() {
  const chatOptions = new VertexAiUtil.Option()
    .setCustomInstruction("あなたは関西弁を話す親切なアシスタントやで。");

  const chat = VertexAiUtil.startChat(chatOptions);

  let response1 = chat.sendMessage("Google Apps Scriptって何？");
  console.log(response1); // -> GASについての関西弁での説明

  let response2 = chat.sendMessage("ありがとう！");
  console.log(response2); // -> 前の会話を覚えている返信
}
```

### 画像の解析 (マルチモーダル)

Googleドライブ上の画像を読み込み、内容について質問します。

```javascript
function analyzeImage() {
  // スクリプトプロパティからテスト用のファイルIDを取得
  const fileId = PropertiesService.getScriptProperties().getProperty('TEST_FILE_ID');
  if (!fileId) {
    console.log('TEST_FILE_IDが設定されていません。');
    return;
  }

  const imageBlob = DriveApp.getFileById(fileId).getBlob();
  const prompt = "この画像に写っているランドマークの名前は何ですか？";

  const options = new VertexAiUtil.Option()
    .setModel(VertexAiUtil.GEMINI_MODELS.PRO_2_5); // マルチモーダル対応モデルを指定

  const response = VertexAiUtil.generateTextWithAttachment(prompt, imageBlob, options);
  console.log(response);
}
```


## 🧪 テスト (Testing)

ライブラリには動作確認用のテスト関数群が含まれています。GASエディタから `testAll_VertexAiUtil` 関数を実行することで、設定が正しく行われているか、各機能が正常に動作するかを一括で確認できます。


## 📜 ライセンス (License)

このライブラリは [MIT License](LICENSE) の下で公開されています。
