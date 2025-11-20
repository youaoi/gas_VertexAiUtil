# VertexAiUtil for Google Apps Script

[![License MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.8.0-blue)](https://github.com/youaoi/gas_VertexAiUtil)

Google Apps Script から Google Cloud の **Vertex AI Gemini API** を簡単・高機能に使うためのユーティリティです。サービスアカウント認証、テキスト/JSON 生成、マルチモーダル解析、チャット履歴管理、トークン課金見積もり、自動リトライ、デバッグログなどをシンプルなメソッドで提供します。

## ✨ 主な機能

- **最新の Gemini 2.5 対応**: デフォルトは `gemini-2.5-flash`、`gemini-2.5-pro` も選択可。
- **生成機能の充実**: テキスト/JSON 生成、チャットセッション、添付ファイル付き（単一・複数）生成。
- **マルチモーダル**: 画像や PDF などの Blob を渡して回答生成、JSON パースもサポート。
- **リトライとデバッグ**: 429/5xx を検知して自動リトライ（デフォルト 3 回）、詳細ログのデバッグモード。
- **オプションチェーン**: `Option` クラスでモデル・リージョン・温度・最大トークン・システム指示を直感的に設定。
- **カスタムエラー**: 設定ミスを `ConfigurationError`、API 応答を `ApiError` で明示。
- **コスト見積もり**: `countTokens` で呼び出し前にトークン数を確認。

## 🔧 セットアップ

1. ### OAuth2 ライブラリを追加（必須）

   1. Apps Script エディタ左ペインの **「ライブラリ」** で **「＋」** をクリック。
   2. スクリプト ID を貼り付けて検索:  
      `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`
   3. **最新バージョン**を選び、識別子が `OAuth2` になっていることを確認して追加。

2. ### 本ライブラリの追加

   公開ライブラリではなくファイルコピーで利用します。

   - プロジェクトで新規ファイル `VertexAiUtil.js`（`.gs` でも可）を作成し、リポジトリの `VertexAiUtil.js` の中身を貼り付けて保存します。

3. ### スクリプトプロパティを設定

   - `SA_KEY_JSON`（必須）: サービスアカウントの JSON キー全文。
   - `TEST_FILE_ID`（任意）: マルチモーダルのテストで使う Drive ファイル ID。
   - `GCP_TOKEN_URL` / `GCP_SCOPES`（任意）: 認証エンドポイントやスコープをカスタマイズする場合のみ設定。

4. ### サービスアカウントキー（JSON）の取得

   1. GCP コンソールで対象プロジェクトを開く。
   2. 「IAM と管理」→「サービスアカウント」から対象アカウントを選択（または作成）し、ロール「Vertex AI ユーザー」を付与。
   3. 「キー」タブで「鍵を追加」→「新しい鍵を作成」→ `JSON` を選択してダウンロード。
   4. ダウンロードした JSON の全文を `SA_KEY_JSON` に貼り付け。

## 🚀 使い方

### 基本: テキスト生成

```javascript
function myFunction() {
  const prompt = "Google Apps Script のメリットを3つ教えてください。";
  const response = VertexAiUtil.generateText(prompt);
  Logger.log(response);
}
```

### オプション指定で生成

```javascript
function generateWithOption() {
  const options = new VertexAiUtil.Option()
    .setModel(VertexAiUtil.GEMINI_MODELS.PRO_2_5)
    .setTemperature(0.2)
    .setMaxOutputTokens(VertexAiUtil.VTX_MAX_TOKENS.SHORT)
    .setCustomInstruction("5歳の子にも伝わるように説明してください。")
    .setRegion(VertexAiUtil.VTX_REGIONS.TOKYO);

  const prompt = "APIとは何かを一文で説明してください。";
  const response = VertexAiUtil.generateText(prompt, options);
  Logger.log(response);
}
```

### JSON 生成

```javascript
function generateJsonData() {
  const prompt =
    '次の文から { "name": "...", "company": "..." } のJSONを返してください。「鈴木一朗は Acme Corporation に勤務しています。」';
  const data = VertexAiUtil.generateJson(prompt);
  Logger.log(data.name); // "鈴木一朗"
  Logger.log(data.company); // "Acme Corporation"
}
```

### マルチモーダル（添付ファイルつき）

```javascript
function analyzeImage() {
  const fileId =
    PropertiesService.getScriptProperties().getProperty("TEST_FILE_ID");
  if (!fileId) {
    Logger.log("TEST_FILE_ID を設定してください。");
    return;
  }
  const imageBlob = DriveApp.getFileById(fileId).getBlob();
  const options = new VertexAiUtil.Option().setModel(
    VertexAiUtil.GEMINI_MODELS.PRO_2_5
  );
  const prompt = "この画像に写っているランドマークは何ですか？";

  const response = VertexAiUtil.generateTextWithAttachment(
    prompt,
    imageBlob,
    options
  );
  Logger.log(response);
}

function analyzeMultiple() {
  const fileIds = ["<imageId>", "<pdfId>"];
  const blobs = fileIds.map((id) => DriveApp.getFileById(id).getBlob());
  const prompt = "添付の画像とPDFを読んで、要点をJSONでまとめてください。";
  const result = VertexAiUtil.generateJsonWithAttachments(
    prompt,
    blobs,
    new VertexAiUtil.Option().setModel(VertexAiUtil.GEMINI_MODELS.PRO_2_5)
  );
  Logger.log(JSON.stringify(result, null, 2));
}
```

### チャット（会話履歴維持）

```javascript
function chatExample() {
  const chat = VertexAiUtil.startChat(
    new VertexAiUtil.Option().setCustomInstruction(
      "あなたは関西弁の親切なアシスタントです。"
    )
  );

  const res1 = chat.sendMessage("Google Apps Scriptって何ができますか？");
  Logger.log(res1);

  const res2 = chat.sendMessage("もっと詳しく教えて。");
  Logger.log(res2);
}
```

### トークン数の見積もり

```javascript
function countTokensExample() {
  const tokens = VertexAiUtil.countTokens(
    "これはトークン数を数えるための文章です。"
  );
  Logger.log(`合計トークン数: ${tokens}`);
}
```

## 🛠 運用ヒント

- **デバッグログ**: `VertexAiUtil.setDebugMode(true);` でリクエスト/レスポンスを `Logger` に出力。
- **リトライ回数**: `VertexAiUtil.setMaxRetries(n);`（デフォルト 3）。429 は 60〜90 秒待って再試行、5xx は指数バックオフ。
- **モデル/リージョンの指定**: `VertexAiUtil.GEMINI_MODELS` と `VertexAiUtil.VTX_REGIONS` から選択して `Option` にセット。

## 🧪 テスト

Apps Script エディタから以下を実行できます。

- `testAll_VertexAiUtil`: 全テスト一括実行
- 個別: `testSimpleGenerateText`, `testGenerateTextWithOptions`, `testGenerateJson`, `testChatFunction`, `testCountTokens`, `testGenerateTextWithAttachment`, `testConfigurationError`, `testModelAvailability`

## 📜 ライセンス

[MIT License](LICENSE)
