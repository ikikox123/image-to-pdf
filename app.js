/* 圖片轉 PDF｜本地小工具 — 所有處理都在瀏覽器內完成，不發出任何網路請求。 */
(function () {
  'use strict';

  var A4 = { w: 595.28, h: 841.89 };          // A4，單位 pt（1/72 吋）
  var MARGIN_PT = { none: 0, small: 28.35 };   // 10 mm
  var QUALITY = {                              // 大圖先縮小，避免手機記憶體爆掉
    standard: { maxEdge: 2000, jpeg: 0.80 },
    high:     { maxEdge: 3000, jpeg: 0.90 }    // 3000x2250 ≈ 6.75MP，低於 iOS 單一 canvas 16.7MP 上限
  };
  var LITE = { maxEdge: 1600, jpeg: 0.75 };    // 張數很多時自動改用
  var RETRY_EDGE = 1200;                       // 單張處理失敗（多半是記憶體不足）時再試一次的長邊
  var THUMB_EDGE = 280;
  var WARN_COUNT = 20;                         // 超過就顯示記憶體提醒、並自動降畫質
  var LITE_COUNT = 40;                         // 超過就改用 LITE

  var $ = function (id) { return document.getElementById(id); };
  var listEl = $('list'), msgEl = $('messages'), statusEl = $('status');
  var items = [];   // { id, file, name, rotation, thumbUrl, w, h }
  var seq = 0, busy = false;

  // ---------- 小工具 ----------
  function isHeic(file) {
    return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  }
  function msg(text, kind) {
    var d = document.createElement('div');
    if (kind) d.className = kind;
    d.textContent = text;
    msgEl.appendChild(d);
  }
  function clearMsg() { msgEl.textContent = ''; }
  function fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

  // 用 <img> 解碼：現代瀏覽器（Chrome 81+、Safari 13.1+、Firefox 77+）會自動套用 EXIF 方向，
  // naturalWidth/Height 與 drawImage 都是「轉正後」的結果。
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
      img.src = url;
    });
  }
  function releaseImage(h) { URL.revokeObjectURL(h.url); h.img.src = ''; }
  function canvasToBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('toBlob failed')); }, 'image/jpeg', quality);
    });
  }
  function releaseCanvas(c) { c.width = 0; c.height = 0; }

  // 把圖片（含旋轉）畫到 canvas，透明處填白色。
  // crop：在「旋轉後」座標裡、置中裁切的寬高 {sw, sh}（填滿頁面用）；省略＝整張。
  // 長邊以「裁切後區域」計算，不超過 maxEdge、不放大 → 只嵌入裁後的像素，解析度不浪費。
  function renderToCanvas(img, rotation, maxEdge, crop) {
    var w = img.naturalWidth, h = img.naturalHeight;
    var swap = rotation % 180 !== 0;
    var rw = swap ? h : w, rh = swap ? w : h;
    var sw = crop ? Math.min(rw, crop.sw) : rw, sh = crop ? Math.min(rh, crop.sh) : rh;
    var scale = Math.min(1, maxEdge / Math.max(sw, sh));
    var cw = Math.max(1, Math.round(sw * scale)), ch = Math.max(1, Math.round(sh * scale));
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // 裁切是置中的：把「整張旋轉後的圖」以同一比例畫在 canvas 中心，超出 canvas 的部分自然被裁掉
    var k = cw / sw;
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(img, -w * k / 2, -h * k / 2, w * k, h * k);
    return c;
  }

  // ---------- 加入圖片 ----------
  async function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    clearMsg();
    setBusy(true);
    var ok = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      statusEl.textContent = '讀取圖片 ' + (i + 1) + ' / ' + files.length + '…';
      if (f.type && !/^image\//.test(f.type) && !isHeic(f)) { msg('「' + f.name + '」不是圖片，已略過。'); continue; }
      var h;
      try { h = await loadImage(f); }
      catch (e) {
        if (isHeic(f)) {
          msg('「' + f.name + '」是 iPhone 的 HEIC 格式，這個瀏覽器讀不了。解法：① 用 iPhone 的 Safari 開本工具再選照片；或 ② iPhone「設定 › 相機 › 格式」改成「最相容」後重拍；或 ③ 先把照片轉成 JPG。');
        } else {
          msg('「' + f.name + '」讀取失敗（格式不支援或檔案損壞），已略過。');
        }
        continue;
      }
      try {
        var t = renderToCanvas(h.img, 0, THUMB_EDGE);
        var blob = await canvasToBlob(t, 0.7);
        releaseCanvas(t);
        var th = await loadImage(blob);   // 小縮圖（長邊約 280px）常駐記憶體，用來畫頁面預覽
        items.push({ id: 'i' + (++seq), file: f, name: f.name || ('照片' + seq), rotation: 0,
                     thumbUrl: th.url, thumbImg: th.img, w: h.img.naturalWidth, h: h.img.naturalHeight });
        ok++;
      } catch (e2) {
        msg('「' + f.name + '」處理失敗：' + e2.message);
      } finally { releaseImage(h); }
    }
    statusEl.textContent = ok ? '已加入 ' + ok + ' 張。' : '';
    setBusy(false);
    render();
  }

  // ---------- 列表 ----------
  function render() {
    var opt = readOpt();
    listEl.textContent = '';
    items.forEach(function (it, idx) {
      var li = document.createElement('li');
      li.className = 'item';
      li.dataset.id = it.id;
      li.innerHTML =
        '<span class="no"></span><div class="thumb"><canvas class="page-preview" role="img"></canvas></div><div class="name"></div>' +
        '<div class="tools">' +
        '<button type="button" data-act="left" title="往前" aria-label="往前">◀</button>' +
        '<button type="button" data-act="rot" title="旋轉 90°" aria-label="旋轉 90 度">⟳</button>' +
        '<button type="button" data-act="right" title="往後" aria-label="往後">▶</button>' +
        '<button type="button" data-act="del" class="del" title="刪除" aria-label="刪除">✕</button></div>';
      li.querySelector('.no').textContent = idx + 1;
      drawPreview(li.querySelector('canvas'), it, opt);
      li.querySelector('.name').textContent = it.name;
      listEl.appendChild(li);
    });
    var n = items.length;
    $('countHint').textContent = n ? '共 ' + n + ' 頁。拖曳縮圖或用 ◀ ▶ 調整順序。' : '尚未加入圖片';
    var w = $('countWarn');
    if (n > WARN_COUNT) {
      w.hidden = false;
      w.textContent = '⚠️ 目前 ' + n + ' 張，超過 ' + WARN_COUNT + ' 張時手機可能變慢或記憶體不足。產生時會自動' +
        (n > LITE_COUNT ? '改用省記憶體畫質（長邊 ' + LITE.maxEdge + 'px）' : '改用「標準」畫質') + '；也建議分成幾份 PDF。';
    } else { w.hidden = true; w.textContent = ''; }
    $('makePdf').disabled = busy || !n;
    $('clearAll').disabled = busy || !n;
  }

  listEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn || busy) return;
    var id = btn.closest('.item').dataset.id;
    var i = items.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    var act = btn.dataset.act;
    if (act === 'rot') items[i].rotation = (items[i].rotation + 90) % 360;
    else if (act === 'del') { URL.revokeObjectURL(items[i].thumbUrl); items[i].thumbImg.src = ''; items.splice(i, 1); }
    else if (act === 'left' && i > 0) items.splice(i - 1, 0, items.splice(i, 1)[0]);
    else if (act === 'right' && i < items.length - 1) items.splice(i + 1, 0, items.splice(i, 1)[0]);
    render();
  });

  if (window.Sortable) {
    Sortable.create(listEl, {
      animation: 150, handle: '.thumb', delay: 150, delayOnTouchOnly: true,
      onEnd: function () {
        var order = Array.prototype.map.call(listEl.children, function (li) { return li.dataset.id; });
        items.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
        render();
      }
    });
  }

  // ---------- 版面計算（PDF 與縮圖預覽共用） ----------
  function readOpt() {
    return { pageSize: $('pageSize').value, orientation: $('orientation').value, margin: $('margin').value,
             quality: $('quality').value, fit: $('fit').value };
  }
  // 「完整顯示」（contain）：整張圖縮進可用區域，可能留白
  function pageLayout(imgW, imgH, opt) {
    var m = MARGIN_PT[opt.margin] || 0, pw, ph;
    if (opt.pageSize === 'fit') {
      // 依圖片原比例：圖片長邊 = A4 長邊扣掉邊距，頁面 = 圖片 + 邊距
      var s = (A4.h - 2 * m) / Math.max(imgW, imgH);
      pw = imgW * s + 2 * m; ph = imgH * s + 2 * m;
    } else {
      var land = opt.orientation === 'landscape' || (opt.orientation === 'auto' && imgW > imgH);
      pw = land ? A4.h : A4.w; ph = land ? A4.w : A4.h;
    }
    var bw = pw - 2 * m, bh = ph - 2 * m;
    var k = Math.min(bw / imgW, bh / imgH);
    var dw = imgW * k, dh = imgH * k;
    return { pw: pw, ph: ph, m: m, x: (pw - dw) / 2, y: (ph - dh) / 2, w: dw, h: dh };
  }
  // rw/rh＝旋轉後圖片尺寸。回傳頁面大小、圖片在頁面上的位置（pt），以及要裁切的區域（旋轉後像素，置中）。
  // 「填滿頁面」（cover）：保持比例鋪滿可用區域（邊距無＝整張紙），超出部分置中裁掉，不變形。
  // 「依圖片原比例」頁面本來就跟圖片同比例，兩種擺放結果相同（滿版）。
  function placement(rw, rh, opt) {
    var L = pageLayout(rw, rh, opt);
    if (opt.fit !== 'cover' || opt.pageSize === 'fit') {
      if (opt.pageSize === 'fit') { L.x = L.m; L.y = L.m; L.w = L.pw - 2 * L.m; L.h = L.ph - 2 * L.m; }  // 消除浮點誤差，確保貼邊
      return { pw: L.pw, ph: L.ph, x: L.x, y: L.y, w: L.w, h: L.h, crop: null };
    }
    var bw = L.pw - 2 * L.m, bh = L.ph - 2 * L.m, a = bw / bh, sw, sh;
    if (rw / rh > a) { sh = rh; sw = rh * a; } else { sw = rw; sh = rw / a; }
    return { pw: L.pw, ph: L.ph, x: L.m, y: L.m, w: bw, h: bh, crop: { sw: sw, sh: sh } };
  }
  function rotatedSize(w, h, rot) { return rot % 180 ? { w: h, h: w } : { w: w, h: h }; }

  // 縮圖＝頁面預覽：白色紙張＋邊距＋實際裁切範圍
  function drawPreview(cv, it, opt) {
    var img = it.thumbImg, r = rotatedSize(img.naturalWidth, img.naturalHeight, it.rotation);
    var P = placement(r.w, r.h, opt), box = 150, dpr = Math.min(2, window.devicePixelRatio || 1);
    var s = box / Math.max(P.pw, P.ph), cw = Math.round(P.pw * s), ch = Math.round(P.ph * s);
    cv.width = cw * dpr; cv.height = ch * dpr;   // 顯示大小交給 CSS（max-width/height，保持比例）
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
    var dx = P.x * s, dy = (P.ph - P.y - P.h) * s, dw = P.w * s, dh = P.h * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
    var srcW = P.crop ? P.crop.sw : r.w, k = dw / srcW;
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.rotate(it.rotation * Math.PI / 180);
    ctx.drawImage(img, -img.naturalWidth * k / 2, -img.naturalHeight * k / 2, img.naturalWidth * k, img.naturalHeight * k);
    ctx.restore();
    cv.setAttribute('aria-label', it.name + ' 的頁面預覽');
  }

  // ---------- 產生 PDF ----------

  // 記憶體保護：張數多時自動降畫質（不設人為張數上限）
  function pickQuality(choice, n) {
    if (n > LITE_COUNT) return { q: LITE, downgraded: true };
    if (n > WARN_COUNT && choice === 'high') return { q: QUALITY.standard, downgraded: true };
    return { q: QUALITY[choice] || QUALITY.standard, downgraded: false };
  }

  // 逐張處理：解碼 → 縮圖畫到 canvas → 壓成 JPEG → 立刻釋放圖片與 canvas，只留下 JPEG bytes
  async function encodeItem(it, maxEdge, jpegQ, opt) {
    var h = await loadImage(it.file);
    var c, P;
    try {
      var r = rotatedSize(h.img.naturalWidth, h.img.naturalHeight, it.rotation);
      P = placement(r.w, r.h, opt);
      c = renderToCanvas(h.img, it.rotation, maxEdge, P.crop);
    } finally { releaseImage(h); }
    try {
      var blob = await canvasToBlob(c, jpegQ);
      return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height, P: P };
    } finally { releaseCanvas(c); }
  }

  async function buildPdf(opt) {
    var pick = pickQuality(opt.quality, items.length), q = pick.q;
    var note = pick.downgraded ? '（張數多，已自動降畫質以節省記憶體）' : '';
    buildPdf.lastDowngraded = pick.downgraded;
    var doc = await PDFLib.PDFDocument.create();
    doc.setTitle('圖片轉 PDF');
    doc.setCreator('本地 PDF 小工具');
    doc.setProducer('pdf-lib (本地瀏覽器產生)');
    for (var i = 0; i < items.length; i++) {
      statusEl.textContent = '產生中 ' + (i + 1) + ' / ' + items.length + '…' + note;
      var it = items[i], enc;
      try { enc = await encodeItem(it, q.maxEdge, q.jpeg, opt); }
      catch (e) {
        // 多半是手機記憶體不足：縮更小再試一次
        try { enc = await encodeItem(it, RETRY_EDGE, 0.7, opt); }
        catch (e2) { throw new Error('第 ' + (i + 1) + ' 張（' + it.name + '）處理失敗'); }
      }
      var jpg = await doc.embedJpg(enc.bytes);
      enc.bytes = null;
      var L = enc.P;
      var page = doc.addPage([L.pw, L.ph]);
      page.drawImage(jpg, { x: L.x, y: L.y, width: L.w, height: L.h });
      await new Promise(function (r) { setTimeout(r, 0); });   // 讓出主執行緒：畫面不卡、GC 有機會回收
    }
    statusEl.textContent = '封裝 PDF…';
    return doc.save();
  }

  function defaultName() {
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes());
  }
  // 自訂檔名：去掉作業系統不允許的字元與結尾 .pdf；留空用日期時間
  function cleanName(raw) {
    var s = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, ' ').trim().replace(/(\.pdf)+$/i, '').replace(/^[.\s]+|[.\s]+$/g, '');
    return s.slice(0, 80);
  }
  function fileName() { return (cleanName($('fileName').value) || defaultName()) + '.pdf'; }
  function refreshPlaceholder() { $('fileName').placeholder = defaultName(); }

  $('makePdf').addEventListener('click', async function () {
    if (!items.length || busy) return;
    setBusy(true);
    var t0 = performance.now();
    try {
      var bytes = await buildPdf(readOpt());
      var blob = new Blob([bytes], { type: 'application/pdf' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      statusEl.textContent = '完成：' + items.length + ' 頁，' + fmtSize(blob.size) + '，耗時 ' + ((performance.now() - t0) / 1000).toFixed(1) + ' 秒。檔名：' + a.download +
        (buildPdf.lastDowngraded ? '（張數多，已自動降畫質）' : '');
      refreshPlaceholder();
      document.body.dataset.lastPdfSize = blob.size;   // 供自動測試讀取
    } catch (e) {
      console.error(e);
      statusEl.textContent = '產生失敗：' + e.message + '（張數太多或圖片太大時，請試著分批或改用「標準」畫質）';
    } finally { setBusy(false); render(); }
  });

  // ---------- 其他 UI ----------
  function setBusy(b) { busy = b; document.body.classList.toggle('busy', b); $('makePdf').disabled = b || !items.length; $('clearAll').disabled = b || !items.length; }
  function syncOrientation() { var f = $('pageSize').value === 'fit'; $('orientation').disabled = f; $('fit').disabled = f; }
  $('pageSize').addEventListener('change', syncOrientation); syncOrientation();
  // 設定改了 → 縮圖預覽跟著更新
  ['pageSize', 'orientation', 'margin', 'fit'].forEach(function (id) { $(id).addEventListener('change', render); });

  ['pickFiles', 'pickCamera'].forEach(function (id) {
    $(id).addEventListener('change', function (e) { addFiles(e.target.files).then(function () { e.target.value = ''; }); });
  });
  $('clearAll').addEventListener('click', function () {
    items.forEach(function (it) { URL.revokeObjectURL(it.thumbUrl); it.thumbImg.src = ''; });
    items = []; clearMsg(); statusEl.textContent = ''; render();
  });

  // 整頁拖放：把檔案拖到頁面任何地方都能加入（只處理「檔案」拖曳，不干擾縮圖排序）
  var overlay = $('dropOverlay'), dragDepth = 0;
  function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, 'Files') >= 0; }
  window.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); dragDepth++; overlay.hidden = false; });
  window.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  window.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) overlay.hidden = true; });
  window.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; overlay.hidden = true;   // 也防止瀏覽器直接開啟圖片
    if (!busy) addFiles(e.dataTransfer.files);
  });

  // 離線支援：只有 http(s)／localhost 才能註冊 Service Worker；用 file:// 直接開時略過（功能照常）
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW 註冊失敗', e); });
  }

  window.__pdfTool = { items: function () { return items; }, pageLayout: pageLayout, placement: placement, cleanName: cleanName, pickQuality: pickQuality };  // 供自動測試
  refreshPlaceholder();
  render();
})();
