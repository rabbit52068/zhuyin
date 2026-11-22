# 注音小學堂

給 4 歲以上孩子的注音符號學習網頁遊戲（台灣繁體中文），玩法參考「學習地圖＋短課程」類型的兒童識字 App，角色與畫面為原創（吉祥物：橘貓「橘子老師」）。

- 線上版：https://rabbit52068.github.io/zhuyin/
- 原始碼：`index.html`（頁面）、`style.css`（樣式）、`data.js`（注音與課程資料）、`app.js`（程式）。無建置步驟，直接打開 `index.html` 就能玩

## 內容

| 站 | 類別 | 內容 |
|---|---|---|
| 1–6 | 聲母 | ㄅㄆㄇㄈ／ㄉㄊㄋㄌ／ㄍㄎㄏ／ㄐㄑㄒ／ㄓㄔㄕㄖ／ㄗㄘㄙ |
| 7–9 | 韻母 | ㄚㄛㄜㄝ／ㄞㄟㄠㄡ／ㄢㄣㄤㄥㄦ |
| 10 | 介音 | ㄧㄨㄩ |
| 11 | 拼音 | 拼拼看（ㄅ＋ㄚ＝八 等，3 課） |
| 12 | 聲調 | 四聲（媽麻馬罵、衣姨椅億、八拔把爸） |

共 52 課：每個注音一課，每個注音站最後有一課複習。

### 題型
- **認識**：大字卡＋發音＋例詞（紅字標出目標注音）
- **聽音選字**：聽發音，三選一
- **描寫**：沿楷書字描寫，以像素覆蓋率與精準度判定（`traceScore`）
- **看圖補注音**：例詞注音挖空，選出缺的注音
- **戳泡泡**：找出 3 個目標注音
- **拼音**：示範合併／聽音選拼音／補聲母
- **聲調**：四聲示範＋聽音選第幾聲

### 其他
- 星星：每課 0 錯 3 星、≤2 錯 2 星，其餘 1 星
- 注音表：37 個注音分三組，點擊發音並唸例詞
- 家長設定：發音速度、全部解鎖、清除紀錄（需按兩次）
- 注音以台灣課本直排方式顯示於字右側，含聲調與輕聲

## 技術說明
- 純 HTML/CSS/JS，無框架
- 字型：Google Fonts「LXGW WenKai TC」（楷書注音）、「Noto Sans TC」（介面）
- 發音：預錄音檔（`audio/`，對照表在 `clips.js`，由 `tools/voice-lines.js` 產生）；沒有音檔的句子才用瀏覽器 Web Speech API
- 音效：Web Audio API 合成
- 進度：`localStorage`（`zy-progress`、`zy-settings`），只存在本機瀏覽器
- 支援深色模式、手機寬度、`prefers-reduced-motion`

## 已知限制
- 尚未在 iOS Safari 等實機上驗證音檔播放
- 描寫沒有筆順檢查

## 可能的下一步
- 筆順動畫與筆順檢查
- 更多例詞／圖片、更多拼音與聲調練習

## 素材授權
- 注音發音（`audio/sym/`）：2017 © 教育部，國語注音符號手冊-開放部件。此素材依「創用CC 姓名標示 4.0 國際版本」授權條款進行公眾釋出：https://creativecommons.org/licenses/by/4.0/deed.zh_TW 。原始 WAV 轉為單聲道 MP3。來源：https://language.moe.gov.tw/001/Upload/files/site_content/M0001/juyin/index.html
- 題目、稱讚與例詞（`audio/v/`）：Microsoft Edge 語音合成（曉臻 zh-TW-HsiaoChenNeural、曉雨 zh-TW-HsiaoYuNeural）
