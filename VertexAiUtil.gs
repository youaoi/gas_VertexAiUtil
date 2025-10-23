/**
 * @fileoverview
 * Google Apps ScriptからVertex AI Gemini APIを簡単に利用するための総合ライブラリです。
 * 認証、テキスト/JSON生成、チャット、トークン計算、ファイル/画像分析(マルチモーダル)、
 * 自動リトライ、デバッグモードなど、高度な機能をシンプルなメソッドで提供します。
 *
 * --- セットアップ手順 ---
 * 1.  **OAuth2ライブラリの追加 (必須)**:
 * - このライブラリはGoogle製`OAuth2`ライブラリに依存しています。
 * - スクリプトエディタの左側のメニューから `ライブラリ` の `+` をクリックします。
 * - `スクリプトID` の欄に以下のIDを貼り付け、`検索` をクリックします。
 * - `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`
 * - `バージョン` は最新のものを選択し、`識別子` が `OAuth2` であることを確認して `追加` をクリックします。
 *
 * 2.  **スクリプトプロパティの設定 (必須)**:
 * - [ファイル] > [プロジェクトの設定] > [スクリプト プロパティ] を開き、以下のプロパティを追加します。
 * - **キー1 (必須)**: `SA_KEY_JSON`
 * - **値**: サービスアカウントのJSONキーの中身を全て貼り付けます。
 * - **キー2 (任意)**: `TEST_FILE_ID`
 * - **値**: マルチモーダル機能のテスト(`testGenerateTextWithAttachment`)で使用する、ご自身のGoogleドライブ上の画像ファイルIDを貼り付けます。
 *
 * 3.  **サービスアカウントキー(JSON)の取得方法**:
 * - A. Google Cloud Platform (GCP) コンソールで、当ライブラリを使用するGCPプロジェクトを選択します。
 * - B. [IAMと管理] > [サービスアカウント] に移動します。
 * - C. 使用するサービスアカウントを選択するか、新規に作成し、`Vertex AI ユーザー` のロールを付与します。
 * - D. アカウント詳細画面の [キー] タブで [鍵を追加] > [新しい鍵を作成] > `JSON` を選択して作成・ダウンロードします。
 * - E. ダウンロードしたJSONファイルの中身を全てコピーし、`SA_KEY_JSON` の値に貼り付けます。
 *
 * @license MIT
 * @author Yuki AOI
 * @version 2.4.1
 * @see https://ai.google.dev/gemini-api/docs/models
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions?hl=ja - 現在利用可能なモデルはこちらをご確認ください。
 */

/**
 * @namespace VertexAiUtil
 * @description Vertex AIの機能をカプセル化したメインオブジェクトです。
 */
const VertexAiUtil = {
  //================================================================
  // 設定値 (利用者が外部から変更可能)
  //================================================================
  GEMINI_MODEL: 'gemini-2.5-flash',
  VTX_REGION: 'asia-northeast1',
  VTX_DEFAULT_TEMP: 0,
  VTX_DEFAULT_MAXTOK: 8192,
  DEBUG_MODE: false,
  MAX_RETRIES: 0,
  GEMINI_MODELS: {
    "PRO_2_5": "gemini-2.5-pro",
    "FLASH_2_5": "gemini-2.5-flash",
  },
  VTX_MAX_TOKENS: {
    "BRIEF": 1024, "SHORT": 2048, "STANDARD": 8192, "LONG": 12288, "MAXIMUM": 16384,
  },
  VTX_REGIONS: {
    "TOKYO": "asia-northeast1", "OSAKA": "asia-northeast2", "SEOUL": "asia-northeast3",
    "US_CENTRAL1": "us-central1", "US_EAST4": "us-east4", "EUROPE_WEST1": "europe-west1",
  },

  //================================================================
  // カスタムエラークラス
  //================================================================
  /**
   * @class
   * @classdesc ライブラリの設定不備（`SA_KEY_JSON`の形式誤り、不正なパラメータ設定など）を示すエラーです。
   */
  ConfigurationError: class extends Error { constructor(message) { super(message); this.name = 'VertexAiUtil.ConfigurationError'; } },
  /**
   * @class
   * @classdesc Vertex AI APIとの通信時に発生したエラーを示します。
   */
  ApiError: class extends Error { constructor(message, statusCode, responseBody) { super(message); this.name = 'VertexAiUtil.ApiError'; this.statusCode = statusCode; this.responseBody = responseBody;} },

  //================================================================
  // Option設定クラス
  //================================================================
  /**
   * @class
   * @classdesc AI呼び出し時の詳細オプションを設定するための専用クラスです。
   * @param {object} [initialValues] - オプションの初期値を格納したオブジェクト。
   */
  Option: class {
    constructor(initialValues = {}) {
      /** @private */
      this._params = {};
      if (initialValues) {
        if (initialValues.customInstruction) this.setCustomInstruction(initialValues.customInstruction);
        if (initialValues.temperature != null) this.setTemperature(initialValues.temperature);
        if (initialValues.maxOutputTokens) this.setMaxOutputTokens(initialValues.maxOutputTokens);
        if (initialValues.model) this.setModel(initialValues.model);
        if (initialValues.region) this.setRegion(initialValues.region);
      }
    }
    /**
     * AIの振る舞いを定義するカスタム指示を設定します。
     * @param {string} instructionText - 「あなたはプロの翻訳家です」のような指示。
     * @returns {VertexAiUtil.Option}
     */
    setCustomInstruction(instructionText) {
      if (typeof instructionText !== 'string') throw new VertexAiUtil.ConfigurationError('カスタム指示は文字列である必要があります。');
      this._params.system = instructionText;
      return this;
    }
    /**
     * 応答のランダム性を制御します。
     * @param {number} temperature - 0.0から2.0の範囲の数値。
     * @returns {VertexAiUtil.Option}
     */
    setTemperature(temperature) {
      if (typeof temperature !== 'number' || temperature < 0.0 || temperature > 2.0) {
        throw new VertexAiUtil.ConfigurationError('temperatureは0.0から2.0の範囲の数値である必要があります。');
      }
      this._params.temperature = temperature;
      return this;
    }
    /**
     * AIが生成するテキストの最大トークン数を設定します。
     * @param {number} maxTokens - 正の整数。
     * @returns {VertexAiUtil.Option}
     */
    setMaxOutputTokens(maxTokens) {
      if (typeof maxTokens !== 'number' || maxTokens <= 0 || !Number.isInteger(maxTokens)) throw new VertexAiUtil.ConfigurationError('maxOutputTokensは正の整数である必要があります。');
      this._params.maxOutputTokens = maxTokens;
      return this;
    }
    /**
     * 使用するAIモデル名を設定します。
     * @param {string} modelName - `VertexAiUtil.GEMINI_MODELS`から選択することを推奨します。
     * @returns {VertexAiUtil.Option}
     */
    setModel(modelName) {
      if (typeof modelName !== 'string' || modelName.trim() === '') throw new VertexAiUtil.ConfigurationError('モデル名は空でない文字列である必要があります。');
      this._params.model = modelName;
      return this;
    }
    /**
     * APIを呼び出すGCPリージョンを設定します。
     * @param {string} regionName - `VertexAiUtil.VTX_REGIONS`から選択することを推奨します。
     * @returns {VertexAiUtil.Option}
     */
    setRegion(regionName) {
      if (typeof regionName !== 'string' || regionName.trim() === '') throw new VertexAiUtil.ConfigurationError('リージョン名は空でない文字列である必要があります。');
      this._params.region = regionName;
      return this;
    }
  },

  //================================================================
  // 公開メソッド (Public Methods)
  //================================================================

  /**
   * デバッグモードの有効/無効を設定します。
   * @param {boolean} enabled - 有効にする場合はtrue、無効にする場合はfalse。
   */
  setDebugMode: function(enabled) {
    this.DEBUG_MODE = !!enabled;
  },

  /**
   * 5xx系のAPIサーバーエラー発生時の最大リトライ回数を設定します。
   * @param {number} count - 0以上の整数。
   */
  setMaxRetries: function(count) {
    if (typeof count !== 'number' || count < 0 || !Number.isInteger(count)) {
      throw new this.ConfigurationError('リトライ回数は0以上の整数である必要があります。');
    }
    this.MAX_RETRIES = count;
  },

  /**
   * Vertex AIを呼び出し、プレーンテキストの応答を生成します。
   * @param {string} prompt - AIへの指示プロンプト。
   * @param {VertexAiUtil.Option} [opts] - オプション設定。
   * @returns {string} AIによって生成されたテキスト応答。
   */
  generateText: function(prompt, opts) {
    const params = opts ? opts._params : {};
    const data = this._vertexCall_({ prompt, ...params });
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const responseText = parts.find(p => typeof p.text === 'string')?.text || '';
    if (!responseText && data?.candidates?.[0]?.finishReason) { throw new Error(`Gemini APIからテキスト応答がありませんでした。終了理由: ${data.candidates[0].finishReason}`); }
    return responseText.trim();
  },

  /**
   * Vertex AIを呼び出し、JSON形式の応答を生成してJavaScriptオブジェクトとして返します。
   * @param {string} prompt - AIへの指示プロンプト。
   * @param {VertexAiUtil.Option} [opts] - オプション設定。
   * @returns {object} AIからの応答をパースしたJSONオブジェクト。
   */
  generateJson: function(prompt, opts) {
    const params = opts ? opts._params : {};
    const data = this._vertexCall_({ prompt, jsonMode: true, ...params });
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const txt = parts.find(p => typeof p.text === 'string')?.text || '{}';
    try {
      return JSON.parse(txt);
    } catch (e) {
      throw new Error(`JSON応答のパースに失敗しました: ${txt}`);
    }
  },

  /**
   * テキストプロンプトと添付ファイル（画像、PDFなど）をAIに渡し、応答を生成します。
   * @param {string} prompt - AIへの指示プロンプト。
   * @param {GoogleAppsScript.Base.Blob} attachmentBlob - Blobオブジェクト。
   * @param {VertexAiUtil.Option} [opts] - オプション設定。
   * @returns {string} AIによって生成されたテキスト応答。
   */
  generateTextWithAttachment: function(prompt, attachmentBlob, opts) {
    const params = opts ? opts._params : {};
    const filePart = {
      inlineData: {
        mimeType: attachmentBlob.getContentType(),
        data: Utilities.base64Encode(attachmentBlob.getBytes())
      }
    };
    const textPart = { text: prompt };
    const contents = [{ role: 'user', parts: [filePart, textPart] }];

    const data = this._vertexCall_({ contents, ...params });
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const responseText = parts.find(p => typeof p.text === 'string')?.text || '';
    if (!responseText && data?.candidates?.[0]?.finishReason) { throw new Error(`Gemini APIからテキスト応答がありませんでした。終了理由: ${data.candidates[0].finishReason}`); }
    return responseText.trim();
  },

  /**
   * 会話の文脈を維持するチャットセッションを開始します。
   * @param {VertexAiUtil.Option} [opts] - チャットセッション全体に適用されるオプション。
   * @returns {{sendMessage: function(string): string, getHistory: function(): object[]}} チャットオブジェクト。
   */
  startChat: function(opts) {
    const sessionOpts = opts ? opts._params : {};
    const history = [];
    const sendMessage = (prompt) => {
      history.push({ role: 'user', parts: [{ text: prompt }] });
      const payload = { contents: history };
      if (sessionOpts.system) {
        payload.systemInstruction = { role: 'system', parts: [{ text: String(sessionOpts.system) }] };
      }
      const callParams = {
        model: sessionOpts.model, region: sessionOpts.region,
        temperature: sessionOpts.temperature, maxOutputTokens: sessionOpts.maxOutputTokens,
      };
      const data = this._vertexCall_({ ...payload, ...callParams });
      const responseContent = data?.candidates?.[0]?.content;
      if (responseContent) {
        history.push(responseContent);
        return responseContent.parts.map(p => p.text).join('').trim();
      } else {
         const stopReason = data?.candidates?.[0]?.finishReason || '不明';
         throw new Error(`Gemini APIから応答がありませんでした。終了理由: ${stopReason}`);
      }
    };
    return { sendMessage, getHistory: () => history };
  },

  /**
   * APIを呼び出す前に、指定されたテキストのトークン数を計算します。
   * @param {string} text - トークン数を計算したいテキスト。
   * @param {object} [opts] - オプション。`{model: 'model-name'}`のように指定可能。
   * @returns {number} 計算された合計トークン数。
   */
  countTokens: function(text, opts = {}) {
    const { token, projectId } = this._getSaAccessToken_();
    const model = opts.model ?? this.GEMINI_MODEL;
    const region = opts.region ?? this.VTX_REGION;
    
    const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${model}:countTokens`;
    
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ contents: [{ parts: [{ text }] }] }),
      muteHttpExceptions: true
    });

    const responseCode = res.getResponseCode();
    if (responseCode !== 200) {
      throw new Error(`Token count APIエラー ${responseCode}: ${res.getContentText()}`);
    }
    
    const data = JSON.parse(res.getContentText());
    return data.totalTokens || 0;
  },

  /**
   * [未実装] ストリーミング応答を処理するためのメソッドです。
   */
  generateTextStream: function() {
    throw new Error("generateTextStreamはGoogle Apps Scriptの技術的制約により実装されていません。リアルタイム応答が必要な場合はHtmlServiceの利用を検討してください。");
  },

  //================================================================
  // 内部処理用のプライベートメソッド (Private Methods)
  //================================================================
  /**
   * @private
   */
  _vertexCall_: function({
    prompt, contents, system, jsonMode = false,
    temperature, maxOutputTokens, model, region
  }) {
    if (!prompt && !contents) throw new this.ConfigurationError('内部エラー: prompt または contents が必要です');
    const { token, projectId } = this._getSaAccessToken_();
    
    const finalModel = model ?? this.GEMINI_MODEL;
    const finalRegion = region ?? this.VTX_REGION;
    const url = `https://${finalRegion}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${finalRegion}/publishers/google/models/${finalModel}:generateContent`;

    const generationConfig = {
      temperature: temperature ?? this.VTX_DEFAULT_TEMP,
      maxOutputTokens: maxOutputTokens ?? this.VTX_DEFAULT_MAXTOK,
    };
    if (jsonMode) generationConfig.responseMimeType = 'application/json';

    const body = { generationConfig };
    if (contents) {
        body.contents = contents;
    } else {
        body.contents = [{ role: 'user', parts: [{ text: String(prompt) }] }];
    }
    if (system) body.systemInstruction = { role: 'system', parts: [{ text: String(system) }] };
    
    const fetchOptions = {
      method: 'post',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    };

    let res;
    for (let i = 0; i <= this.MAX_RETRIES; i++) {
      if (this.DEBUG_MODE) {
        Logger.log(`[DEBUG] Vertex AI Request (Attempt ${i + 1} of ${this.MAX_RETRIES + 1}):\nURL: ${url}\nPayload: ${JSON.stringify(body, null, 2)}`);
      }
      
      try {
        res = UrlFetchApp.fetch(url, fetchOptions);
      } catch (e) {
        throw new this.ApiError(`UrlFetchAppでネットワークエラーが発生しました: ${e.message}`, 0, e.toString());
      }

      const responseCode = res.getResponseCode();
      const responseBody = res.getContentText();
      
      if (this.DEBUG_MODE) {
        Logger.log(`[DEBUG] Vertex AI Response (Attempt ${i + 1}):\nStatus: ${responseCode}\nBody: ${responseBody}`);
      }

      if (responseCode === 200) {
        return JSON.parse(responseBody);
      }

      if (responseCode >= 500 && i < this.MAX_RETRIES) {
        const waitTime = (2 ** i) * 1000 + Math.floor(Math.random() * 1000);
        Logger.log(`APIサーバーエラー(ステータス: ${responseCode})を検知。${waitTime / 1000}秒後にリトライします (試行 ${i + 1}回目)`);
        Utilities.sleep(waitTime);
        continue;
      }
      
      throw new this.ApiError(
        `Vertex AI APIエラー`,
        responseCode,
        responseBody
      );
    }
  },
  
  /**
   * @private
   */
  _getSaAccessToken_: function() {
    const props = PropertiesService.getScriptProperties();
    const keyStr = props.getProperty('SA_KEY_JSON');

    if (!keyStr) {
      throw new this.ConfigurationError('スクリプトプロパティ `SA_KEY_JSON` が設定されていません。');
    }

    let keyObj;
    try {
      keyObj = JSON.parse(keyStr);
    } catch (e) {
      throw new this.ConfigurationError('スクリプトプロパティ `SA_KEY_JSON` は有効なJSON形式ではありません。貼り付けミスがないか確認してください。');
    }
    
    const errorMessages = [];
    if (!keyObj.client_email) {
      errorMessages.push('`client_email` がキーに含まれていません。');
    }
    if (!keyObj.private_key) {
      errorMessages.push('`private_key` がキーに含まれていません。');
    }
    if (!keyObj.project_id) {
      errorMessages.push('`project_id` がキーに含まれていません。');
    }

    if (errorMessages.length > 0) {
      throw new this.ConfigurationError('スクリプトプロパティ `SA_KEY_JSON` の内容に不備があります:\n- ' + errorMessages.join('\n- '));
    }

    const email = keyObj.client_email;
    const pkey = keyObj.private_key.replace(/\\n/g, '\n');

    const { tokenUrl, scope } = this._oauthConfig_();
    const svc = OAuth2.createService('vtx-sa')
      .setTokenUrl(tokenUrl)
      .setIssuer(email)
      .setPrivateKey(pkey)
      .setScope(scope)
      .setPropertyStore(PropertiesService.getScriptProperties())
      .setCache(CacheService.getScriptCache());

    if (!svc.hasAccess()) {
      throw new Error('サービスアカウントのトークン取得に失敗しました: ' + svc.getLastError());
    }
    return { token: svc.getAccessToken(), projectId: keyObj.project_id };
  },
  
  /**
   * @private
   */
  _oauthConfig_: function() {
    const p = PropertiesService.getScriptProperties();
    return {
      tokenUrl: p.getProperty('GCP_TOKEN_URL') || 'https://oauth2.googleapis.com/token',
      scope: p.getProperty('GCP_SCOPES') || 'https://www.googleapis.com/auth/cloud-platform'
    };
  },
};


//================================================================
// テスト関数 (GASエディタから直接実行して動作確認ができます)
//================================================================

/**
 * 【最優先テスト】最も基本的なテキスト生成をテストします。
 */
function testSimpleGenerateText() {
  Logger.log('\n--- (1) シンプルなテキスト生成 テスト開始 ---');
  try {
    const prompt = 'Google Apps Scriptとは何ですか？1文で簡潔に説明してください。';
    const response = VertexAiUtil.generateText(prompt);
    Logger.log('✅ 成功\nAIの応答:\n' + response);
  } catch (e) {
    Logger.log(`❌ 失敗: ${e.toString()}`);
  }
}

/**
 * Optionクラスを使って詳細な設定を行ったテキスト生成をテストします。
 */
function testGenerateTextWithOptions() {
  Logger.log('\n--- (2) オプション付きテキスト生成 テスト開始 ---');
  try {
    const prompt = 'APIの概念を一行で説明してください。';
    const options = new VertexAiUtil.Option({
      customInstruction: "5歳の子供にも分かるように説明してください。",
      temperature: 0,
      model: VertexAiUtil.GEMINI_MODELS.PRO_2_5,
    });
    const response = VertexAiUtil.generateText(prompt, options);
    Logger.log('✅ 成功\nAIの応答:\n' + response);
  } catch (e) {
    Logger.log(`❌ 失敗: ${e.toString()}`);
  }
}

/**
 * JSONモードでの応答生成とパースが正しく機能するかをテストします。
 */
function testGenerateJson() {
  Logger.log('\n--- (3) JSON生成 テスト開始 ---');
  try {
    const prompt = '次の人物情報をJSON形式で抽出してください。「日本の首都、東京に住む山田太郎は、Googleでソフトウェアエンジニアとして働いています。」';
    const response = VertexAiUtil.generateJson(prompt);
    Logger.log('✅ 成功\nAIの応答:\n' + JSON.stringify(response, null, 2));
    if(typeof response !== 'object') throw new Error("応答がオブジェクトではありません。");
  } catch (e) {
    Logger.log(`❌ 失敗: ${e.toString()}`);
  }
}

/**
 * チャット機能が会話の文脈を正しく維持できるかをテストします。
 */
function testChatFunction() {
  Logger.log('\n--- (4) チャット機能 テスト開始 ---');
  try {
    const chatOptions = new VertexAiUtil.Option()
      .setCustomInstruction("あなたは関西弁を話す親切なアシスタントやで。");
    const chat = VertexAiUtil.startChat(chatOptions);
    let res1 = chat.sendMessage("Google Apps Scriptって何ができるん？");
    Logger.log("AIの返信 (1): " + res1);
    let res2 = chat.sendMessage("おおきに！");
    Logger.log("AIの返信 (2): " + res2);
    Logger.log('✅ 成功');
  } catch (e) {
    Logger.log(`❌ 失敗: ${e.toString()}`);
  }
}

/**
 * トークン数計算機能が数値を返すかをテストします。
 */
function testCountTokens() {
  Logger.log('\n--- (5) トークン数計算 テスト開始 ---');
  try {
    const text = "これはトークン数を数えるためのテストです。";
    const count = VertexAiUtil.countTokens(text);
    Logger.log(`✅ 成功\n「${text}」のトークン数: ${count}`);
    if(typeof count !== 'number') throw new Error("応答が数値ではありません。");
  } catch (e) {
    Logger.log(`❌ 失敗: ${e.toString()}`);
  }
}

/**
 * 画像ファイル(Blob)を読み込ませて内容を分析させるマルチモーダル機能をテストします。
 */
function testGenerateTextWithAttachment() {
  Logger.log('\n--- (6) 添付ファイル付き生成 テスト開始 ---');
  try {
    const fileId = PropertiesService.getScriptProperties().getProperty('TEST_FILE_ID');
    if (!fileId) {
      Logger.log('⚠️ テストをスキップしました。スクリプトプロパティに `TEST_FILE_ID` を設定してください。');
      return;
    }
    const imageBlob = DriveApp.getFileById(fileId).getBlob();
    const prompt = "この画像について説明してください。";
    const options = new VertexAiUtil.Option().setModel(VertexAiUtil.GEMINI_MODELS.PRO_2_5);
    const response = VertexAiUtil.generateTextWithAttachment(prompt, imageBlob, options);
    Logger.log('✅ 成功\nAIの応答:\n' + response);
  } catch (e) {
    Logger.log(`❌ 失敗: ${e.toString()}`);
  }
}

/**
 * 意図的に設定を間違え、ConfigurationErrorが正しく発生するかをテストします。
 */
function testConfigurationError() {
  Logger.log('\n--- (7) 設定エラー検知 テスト開始 ---');
  try {
    new VertexAiUtil.Option().setTemperature("熱い");
  } catch (e) {
    if (e instanceof VertexAiUtil.ConfigurationError) {
      Logger.log(`✅ 成功: 期待通りの設定エラーを検知しました。\n${e.message}`);
    } else {
      Logger.log(`❌ 失敗: 予期せぬエラーが発生しました。\n${e.toString()}`);
    }
  }
}

/**
 * `GEMINI_MODELS`に記載のモデルが利用可能かを確認します。
 */
function testModelAvailability() {
  Logger.log('\n--- (8) モデル可用性 テスト開始 ---');
  const models = VertexAiUtil.GEMINI_MODELS;
  for (const key in models) {
    const modelName = models[key];
    try {
      VertexAiUtil.countTokens("test", { model: modelName });
      Logger.log(`  ✅ ${modelName}: 利用可能です`);
    } catch (e) {
      Logger.log(`  ❌ ${modelName}: 利用できませんでした - ${e.message}`);
    }
  }
}


/**
 * 全てのテスト関数を順番に実行する統合テストです。
 */
function testAll_VertexAiUtil() {
  Logger.log('=============== VertexAiUtil 全機能テスト開始 ===============');
  VertexAiUtil.setDebugMode(false);
  VertexAiUtil.setMaxRetries(1);
  
  testSimpleGenerateText();
  testGenerateTextWithOptions();
  testGenerateJson();
  testChatFunction();
  testCountTokens();
  testGenerateTextWithAttachment();
  testConfigurationError();
  testModelAvailability();
  
  Logger.log('=============== 全てのテストが終了しました ===============');
}