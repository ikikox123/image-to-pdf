# 圖片轉 PDF｜本地小工具（v2.2：修「填滿仍留白」＋版本一致性）

給同學／朋友用：選多張圖片或用手機拍照 → 排序、刪除、旋轉 → 選 A4 或依圖片原比例、直／橫／自動、邊距、圖片擺放（填滿／完整顯示）、畫質、檔名 → 一鍵下載 PDF。

**v2.2 變更（修線上真機 bug）**：GitHub Pages 對所有檔案送 `Cache-Control: max-age=600`，舊版資源網址又沒帶版本號，更新後瀏覽器會拿到「新 HTML（有填滿選單）＋ 快取裡的舊 JS（沒有填滿邏輯）」→ 選填滿卻仍留白。修法：所有資源網址加 `?v=版本`、Service Worker 安裝時檢查 HTML／JS 同版、頁面與程式版本不同時自動重新載入並暫停產生、頁尾顯示「版本 v2.2」。

**v2.1 變更**：新增「圖片擺放」（預設填滿＋邊距無）、縮圖＝頁面預覽。

**隱私**：圖片只在你的瀏覽器裡處理，不會上傳。沒有後端、不呼叫外部 API、沒有追蹤碼或廣告、PDF 不加浮水印；函式庫全部放在 `vendor/`，不靠外部 CDN，字型用系統內建字型（不附字型檔）。
頁面內建 CSP `connect-src 'none'`，瀏覽器會直接擋掉頁面對外的資料請求。頁面上有「怎麼確認真的沒上傳？」說明（開發者工具 Network／飛航模式）。

## 怎麼開（本機）

1. **最簡單**：解壓後直接用瀏覽器開 `index.html`（雙擊），不用網路。此模式不啟用離線快取／加到主畫面（瀏覽器規定 Service Worker 只能在 https 或 localhost）。
2. **本機伺服器（可測離線）**：在這個資料夾執行 `python3 -m http.server 8000`，開 `http://localhost:8000/`。
3. **手機同 Wi‑Fi 試用**：手機開 `http://<電腦區網IP>:8000/`。非 localhost 的 http 不能註冊 Service Worker，離線要等放到 https 網址。

## 怎麼確認自己拿到最新版
1. 看頁尾：「版本 v2.2」＝目前這版。若還寫 v2.1 或沒有版本，就是舊版。
2. 關掉這個分頁或主畫面圖示後重新開啟（iPhone Safari 按一次重新整理不一定夠，尤其是加到主畫面的）。
3. 若出現黃色提示「版本不一致」，按鈕按「重新整理」；若仍出現，到 Safari「設定 › 網站設定 › 這個網站」清除資料後再開。

## 功能

| 類別 | 內容 |
| --- | --- |
| 輸入 | 多選圖片（JPG／PNG；WebP 等瀏覽器能讀的也可）；手機「拍照」開後鏡頭，可連拍多次累加；電腦可把檔案**拖到頁面任何地方** |
| HEIC | 不解碼。瀏覽器自己能讀（如 Safari）就照用；讀不了會顯示清楚的解法提示 |
| 編輯 | 縮圖拖曳排序（手機長按 0.15 秒）、◀ ▶ 移動、⟳ 旋轉 90°、✕ 刪除；EXIF 方向自動轉正；PNG 透明處填白 |
| 頁面 | A4（自動／直式／橫式）或「依圖片原比例」（長邊 = 297 mm）；邊距 無（預設，貼齊紙緣）／小（10 mm）。A4「自動」＝每頁跟圖片同向，裁切最少 |
| 圖片擺放 | **填滿頁面**（預設）：保持比例鋪滿可用區域（邊距無＝整張紙、邊距小＝邊距內），置中裁掉超出部分，不變形；裁切在 canvas 階段完成，只嵌入裁後像素，長邊以裁後區域計算（標準 2000px／高 3000px，不放大）。**完整顯示**：v2 的舊行為，整張圖縮進頁面，可能留白。「依原圖」頁面本來就與圖片同比例，兩者相同且滿版 |
| 縮圖 | 縮圖就是實際頁面預覽（紙張比例、邊距、裁切範圍），改設定會即時更新 |
| 畫質 | 標準（長邊 2000 px、JPEG 0.80）／高（長邊 3000 px、JPEG 0.90） |
| 檔名 | 可自訂；留空用「YYYYMMDD_HHMM.pdf」；`\ / : * ? " < > |` 會換成 `_`，自動補 `.pdf` |
| 記憶體保護 | 大圖一律先縮小；逐張「解碼→縮圖→壓 JPEG→立刻釋放」；單張失敗自動縮到 1200 px 再試；**超過 20 張**顯示提醒並把「高」自動降為「標準」；**超過 40 張**自動改用長邊 1600 px／JPEG 0.75。不設張數硬上限 |
| 手機版面 | ≤480px 兩欄縮圖、產生鈕固定在底部、所有按鈕／選單／輸入框高度 ≥44px、輸入字級 16px（iOS 不自動放大）、320px 寬無橫向捲動 |
| 離線（PWA） | `manifest.webmanifest` + `sw.js`：快取全部站內檔案；斷網可重新整理、可產 PDF；改版時舊快取自動刪除 |

## 檔案（整個資料夾就是可直接上傳的靜態站部署包）

```
index.html              主頁（含 <meta> CSP）
app.js                  全部邏輯（無建置步驟）
style.css               樣式
sw.js                   離線快取（改版請用 tools/bump_version.py）
manifest.webmanifest    PWA 設定（start_url / scope 皆為相對路徑）
icons/                  App 圖示
vendor/pdf-lib.min.js   pdf-lib 1.17.1（npm 原版 dist，未修改）
vendor/Sortable.min.js  SortableJS 1.15.7（npm 原版，未修改）
licenses/               第三方授權全文（index.html 列表）
_headers                Netlify／Cloudflare Pages 的安全標頭（GitHub Pages 會忽略）
.nojekyll               GitHub Pages：關閉 Jekyll，檔案原樣發佈
README.md               本說明（部署時可留可刪）
```

所有路徑都是相對路徑，可以放在網域根目錄，也可以放在子路徑（例如 GitHub Pages 的 `https://<帳號>.github.io/<repo>/`）。Service Worker 的 scope 會自動等於它所在的資料夾。沒有 404 頁（單頁工具不需要）。

## 部署到三家免費託管的步驟（第 3 階段；🔐＝需要人登入，代理不代為操作）

> 以下依各家公開文件的一般流程整理，**未實際操作**；介面名稱、免費方案條件以當下官方頁面為準。任何一步若要求信用卡或付費，先停下來回報創辦人。
> 三家都提供 https，所以部署後手機可「加到主畫面」並離線使用。

### A. GitHub Pages（網址：`https://<帳號>.github.io/<repo>/`）
1. 🔐 登入 GitHub（創辦人帳號）。
2. 🔐 新建 repository（免費帳號的 Pages 需設為 Public）。
3. 🔐 「Add file › Upload files」把本資料夾**裡面的所有檔案**（含 `.nojekyll`、`_headers` 無妨）拖進去 → Commit。
   - 注意：網頁上傳可能略過以 `.` 開頭的檔案；若 `.nojekyll` 沒傳上去，可在 repo 內「Add file › Create new file」建一個空的 `.nojekyll`。
4. 🔐 Settings › Pages › Build and deployment：Source 選「Deploy from a branch」，Branch 選 `main`、資料夾 `/ (root)` → Save。
5. 等一兩分鐘，用頁面上顯示的網址打開。GitHub Pages 不能自訂標頭，安全規則靠 `index.html` 內的 `<meta>` CSP（仍會擋外連）。

### B. Cloudflare Pages（網址：`https://<專案名>.pages.dev/`）
1. 🔐 登入 Cloudflare 儀表板（創辦人帳號）。
2. 🔐 Workers & Pages › 建立 › Pages › 「上傳資產（Direct Upload）」。
3. 🔐 輸入專案名稱 → 把本資料夾拖進上傳區 → 部署。
4. `_headers` 會自動生效（CSP、nosniff、禁止被嵌入等）。之後改版：同一專案再上傳一次新的資料夾即可。

### C. Netlify（網址：`https://<站名>.netlify.app/`）
1. 🔐 登入 Netlify（創辦人帳號）。
2. 🔐 Sites › 「Add new site › Deploy manually」（或 Netlify Drop），把本資料夾拖進去。
   - 不登入也能用 Drop 臨時部署，但網站會在短時間後失效，除非用帳號認領，所以視為需要登入。
3. 🔐 Site configuration 可改站名。`_headers` 會自動生效。

### 部署後檢查（不需要登入）
- 手機用 Safari／Chrome 打開網址 → 選圖、拍照、產生 PDF。
- 「加到主畫面」→ 開飛航模式 → 從主畫面開啟仍可用。
- 改版時：在本專案根目錄執行 `python3 tools/bump_version.py 2.3`（會一次改 `index.html`／`app.js`／`sw.js` 的版本號與所有 `?v=`），再把 `app/` 整包上傳。使用者開啟後若有 Service Worker 會在背景下載新版，再重新整理一次（或關閉分頁重開）即可；頁尾會顯示「版本 v2.3」。

## 第三方開源授權

| 套件 | 版本 | 授權 | 用途 | 授權全文 |
| --- | --- | --- | --- | --- |
| pdf-lib | 1.17.1 | MIT | 產生 PDF、嵌入 JPEG | licenses/pdf-lib.LICENSE.txt |
| @pdf-lib/standard-fonts | 1.0.0 | MIT | 打包在 pdf-lib.min.js 內 | licenses/pdf-lib-standard-fonts.LICENSE.txt |
| @pdf-lib/upng | 1.0.1 | MIT | 打包在 pdf-lib.min.js 內 | licenses/pdf-lib-upng.LICENSE.txt |
| pako | 1.0.11 | MIT AND Zlib | 打包在 pdf-lib.min.js 內 | licenses/pako.LICENSE.txt |
| tslib | 1.14.1 | 0BSD | 打包在 pdf-lib.min.js 內 | licenses/tslib.LICENSE.txt |
| SortableJS | 1.15.7 | MIT | 拖曳排序 | licenses/sortablejs.LICENSE.txt |

皆可免費商用；散佈時保留 `licenses/` 即滿足授權要求。未引入任何 HEIC 解碼器（heic-to、libheif 系列為 LGPL，依 scope v1.1 不採用）。本工具自身程式碼的授權由創辦人決定（建議 MIT）。

## 更新函式庫（需要網路與 npm，不需帳號）

```
mkdir /tmp/vendor && cd /tmp/vendor && npm init -y && npm i pdf-lib@1.17.1 sortablejs@1.15.7
cp node_modules/pdf-lib/dist/pdf-lib.min.js   <本資料夾>/vendor/
cp node_modules/sortablejs/Sortable.min.js    <本資料夾>/vendor/
```
更新後同步改 `sw.js` 的 VERSION 與上表版本。

## 自動測試

測試腳本不在部署包內，放在專案的 `test/`（見 `test/README.md`）。
