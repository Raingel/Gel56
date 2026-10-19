(() => {
  "use strict";

  const MAX_SAMPLES = 120;
  const NS = "http://www.w3.org/2000/svg";
  const $ = id => document.getElementById(id);
  const tr = (zh, en, ja) => document.documentElement.lang === "en" ? en :
    document.documentElement.lang === "ja" ? ja : zh;

  // Input: Gel56's exploratory binary matrix, or the same CSV pasted by a user.
  function csvFields(line) {
    const out = [];
    let field = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (quoted && line[i+1] === '"') { field += '"'; i++; }
        else quoted = !quoted;
      } else if (c === "," && !quoted) {
        out.push(field.trim()); field = "";
      } else field += c;
    }
    if (quoted) throw Error(tr("CSV 引號沒有結束。","CSV has an unclosed quotation mark.","CSVの引用符が閉じられていません。"));
    out.push(field.trim());
    return out;
  }

  function parseMatrix(csv) {
    const rows = String(csv || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/)
      .map(s => s.trim()).filter(Boolean).map(csvFields);
    if (rows.length < 3) throw Error(tr("至少需要兩筆樣本。","At least two sample rows are required.","試料が2件以上必要です。"));
    const head = rows.shift();
    if (head[0].toLowerCase() !== "lane") throw Error(tr("CSV 第一欄必須是 lane。","The first CSV column must be lane.","CSVの1列目は lane にしてください。"));
    const unresolvedIndex = head.findIndex(x => x.toLowerCase() === "unresolved_bands");
    const binIndices = head.map((x, i) => i).filter(i => i > 0 && i !== unresolvedIndex);
    if (binIndices.length === 0) throw Error(tr("找不到 0/1 band 欄位。","No binary band columns were found.","0/1のバンド列がありません。"));
    if (rows.length > MAX_SAMPLES) throw Error(tr("樣本太多（最多 120 筆）。","Too many samples (maximum 120).","試料数が多すぎます（最大120件）。"));
    const names = new Set();
    const included = [], empty = [], unresolved = [];
    rows.forEach((row, i) => {
      if (row.length !== head.length) throw Error(tr("第" + (i+2) + "列欄位數不符：預期" + head.length + "欄，實際" + row.length + "欄。", "CSV row " + (i+2) + ": expected " + head.length + " columns, found " + row.length + ".", "CSVの" + (i+2) + "行目：列数は" + head.length + "のはずですが、実際は" + row.length + "です。"));
      const name = row[0].trim();
      if (!name || names.has(name)) throw Error(tr("樣本名稱空白或重複：","Missing or duplicate sample name: ","試料名が空欄、または重複しています：") + (name || "row " + (i+2)));
      names.add(name);
      const vector = binIndices.map(j => {
        if (row[j] !== "0" && row[j] !== "1") throw Error(tr("有無效的 band 值：","Invalid band value in ","無効なバンド値：") + name + ": " + row[j]);
        return Number(row[j]);
      });
      const count = vector.reduce((a,b) => a+b, 0);
      if (unresolvedIndex >= 0) {
        const raw = row[unresolvedIndex];
        if (!/^\d+$/.test(raw)) throw Error(tr("unresolved_bands 不是整數：","Invalid unresolved_bands for ","unresolved_bands が整数ではありません：") + name + ".");
        if (+raw > 0) unresolved.push(name + " (" + raw + ")");
      }
      // All-zero rows do not provide meaningful shared-band information.
      if (!count) empty.push(name);
      else included.push({name, vector, count, order:i});
    });
    if (included.length < 2) throw Error(tr("至少需要兩筆有 band 的樣本；全為 0 的樣本不參與分群。","At least two samples with detected bands are required.","バンドのある試料が2件以上必要です。全て0の試料は除外します。"));
    return {samples:included, columns:binIndices.length, empty, unresolved};
  }

  function diceDistance(a,b) {
    let shared = 0;
    for (let i=0;i<a.vector.length;i++) if (a.vector[i] && b.vector[i]) shared++;
    return 1 - 2*shared/(a.count+b.count);
  }

  // Average linkage over every original sample pair; ties follow input order.
  function clusterUPGMA(input) {
    const samples=input.samples;
    const nodes=samples.map((s,i)=>({id:i,name:s.name,size:1,height:0,order:s.order,children:null}));
    let nextId=nodes.length, active=nodes.slice();
    const dist = new Map();
    const key=(a,b)=>a.id<b.id?a.id+":"+b.id:b.id+":"+a.id;
    for(let i=0;i<active.length;i++)
      for(let j=i+1;j<active.length;j++) dist.set(key(active[i],active[j]),diceDistance(samples[i],samples[j]));
    while(active.length>1){
      let ai=0,bi=1,best=Infinity;
      for(let i=0;i<active.length;i++) for(let j=i+1;j<active.length;j++){
        const d=dist.get(key(active[i],active[j]));
        if(d<best-1e-12){best=d;ai=i;bi=j;}
      }
      const a=active[ai],b=active[bi];
      const children=a.order<=b.order?[a,b]:[b,a];
      const merged={id:nextId++,name:null,size:a.size+b.size,height:Math.max(a.height,b.height,best/2),
                    order:Math.min(a.order,b.order),children};
      for(const c of active) if(c!==a && c!==b){
        const da=dist.get(key(a,c)),db=dist.get(key(b,c));
        dist.set(key(merged,c),(a.size*da+b.size*db)/(a.size+b.size));
      }
      active=active.filter(c=>c!==a&&c!==b);
      active.push(merged);
      active.sort((x,y)=>x.order-y.order);
    }
    return active[0];
  }

  function makeSvgNode(tag,attrs={},value=null) {
    const node=document.createElementNS(NS,tag);
    Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));
    if(value!==null)node.textContent=String(value);
    return node;
  }

  function renderTree(root, count) {
    const width=1000, rowH=29, top=86, height=Math.max(250,top+count*rowH+52);
    const right=742, range=590;
    const svg=makeSvgNode("svg",{xmlns:NS,version:"1.1",viewBox:"0 0 "+width+" "+height,
      width:width,height:height,role:"img","aria-label":"UPGMA dendrogram (Dice distance)"});
    svg.appendChild(makeSvgNode("rect",{width,height,fill:"#fff"}));
    svg.appendChild(makeSvgNode("text",{x:30,y:27,fill:"#1b2730","font-size":17,"font-family":"Arial,sans-serif","font-weight":"bold"},
      tr("UPGMA · Dice 距離（1 − similarity）","UPGMA · Dice distance (1 - similarity)","UPGMA · Dice距離（1 − 類似度）")));
    const xOf=n=>right-(2*n.height)*range;
    let nextY=top;
    function layout(n) {
      if(!n.children){n.y=nextY;nextY+=rowH;return;}
      n.children.forEach(layout);n.y=(n.children[0].y+n.children[1].y)/2;
    }
    layout(root);
    for(let i=0;i<=5;i++){
      const d=i/5,x=right-d*range;
      svg.appendChild(makeSvgNode("line",{x1:x,y1:48,x2:x,y2:top+count*rowH-18,
        stroke:"#dce5eb","stroke-dasharray":"3 5","stroke-width":1}));
      svg.appendChild(makeSvgNode("text",{x,y:44,fill:"#56616b","font-size":12,
        "font-family":"Arial,sans-serif","text-anchor":"middle"},d.toFixed(1)));
    }
    function branches(n){
      const px=xOf(n);
      if(!n.children){
        svg.appendChild(makeSvgNode("text",{x:right+13,y:n.y+4,fill:"#182530",
          "font-size":14,"font-family":"Arial,sans-serif"},n.name));
        return;
      }
      const [a,b]=n.children;
      svg.appendChild(makeSvgNode("line",{x1:px,y1:a.y,x2:px,y2:b.y,stroke:"#234b63","stroke-width":1.7}));
      for(const child of [a,b]){
        svg.appendChild(makeSvgNode("line",{x1:px,y1:child.y,x2:xOf(child),y2:child.y,
          stroke:"#234b63","stroke-width":1.7}));
        branches(child);
      }
    }
    branches(root);
    svg.appendChild(makeSvgNode("text",{x:30,y:height-19,fill:"#707c85","font-size":12,
      "font-family":"Arial,sans-serif"},tr("探索性指紋分群 · 非親緣演化樹 · 無 bootstrap","Exploratory fingerprint clustering · not a phylogenetic tree · no bootstrap","探索的フィンガープリント分類 · 系統樹ではありません · bootstrapなし")));
    return svg;
  }

  function encodeNewickLabel(name){
    return "'" + String(name).replace(/'/g,"''") + "'";
  }
  function newick(root){
    function walk(n,parentHeight){
      const branch=parentHeight===null?"":":"+(Math.max(0,parentHeight-n.height)).toFixed(6);
      if(!n.children)return encodeNewickLabel(n.name)+branch;
      return "("+n.children.map(c=>walk(c,n.height)).join(",")+")"+branch;
    }
    return walk(root,null)+";";
  }

  // Accessible pop-up reuses Gel56's existing modal structure and styles.
  const button=$("openDendrogramBtn");
  if(!button) return;
  const modal=document.createElement("div");
  modal.id="dendrogramModal";
  modal.className="modal-backdrop";
  modal.hidden=true;
  modal.innerHTML=[
    '<section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="dendroTitle" style="width:min(1140px,96vw)">',
    '<div class="export-dialog-header"><h2 id="dendroTitle" class="export-dialog-title">UPGMA · 指紋樹狀圖</h2>',
    '<button type="button" id="dendroClose">關閉</button></div>',
    '<div class="export-dialog-body" style="display:flex;flex-direction:column;gap:10px">',
    '<div class="panel-note">Dice similarity + UPGMA。只使用 bin 的 0/1；unresolved_bands 不參與計算。這是指紋分群圖，不是親緣演化樹。</div>',
    '<div class="profile-controls"><button type="button" id="dendroCurrent">帶入目前的 1/0 matrix</button>',
    '<button type="button" id="dendroRun" class="primary">產生樹狀圖</button>',
    '<button type="button" id="dendroSVG" disabled>下載 SVG</button>',
    '<button type="button" id="dendroNewick" disabled>下載 Newick</button></div>',
    '<label class="field-control" for="dendroCSV"><span>1/0 matrix（CSV）</span>',
    '<textarea id="dendroCSV" spellcheck="false" rows="4" style="width:100%;min-height:100px;max-height:210px;font-family:monospace"',
    ' placeholder="lane,unresolved_bands,bin1_1000bp,bin2_500bp&#10;L1,0,1,0&#10;L2,0,1,1"></textarea></label>',
    '<div id="dendroStatus" class="panel-note" role="status" aria-live="polite"></div>',
    '<div id="dendroPlot" style="width:100%;overflow:auto;background:#fff;border-radius:4px;min-height:120px"></div>',
    '</div><div class="export-dialog-footer"><button type="button" id="dendroCloseBottom">關閉</button></div></section>'
  ].join("");
  document.body.appendChild(modal);
  const textarea=$("dendroCSV"),status=$("dendroStatus"),plot=$("dendroPlot");
  const svgBtn=$("dendroSVG"),newickBtn=$("dendroNewick");
  let currentSVG=null,currentNewick=null;
  const setStatus=(s,error=false)=>{status.textContent=s;status.style.color=error?"#fba5a5":"";};
  function loadCurrent(){
    if(typeof window.Gel56MatrixCSV!=="function"){
      setStatus(tr("目前沒有可用的分析資料；可以貼上 CSV。","No analysis data available. You can paste a CSV.","解析データがありません。CSVを貼り付けてください。"),true);
      return;
    }
    try {
      textarea.value=window.Gel56MatrixCSV();
      setStatus(tr("已帶入目前的 band matrix。","Loaded the current band matrix.","現在のバンド行列を読み込みました。"));
    }catch(err){setStatus(String(err.message),true);}
  }
  function run(){
    currentSVG=null;currentNewick=null;plot.replaceChildren();
    svgBtn.disabled=true;newickBtn.disabled=true;
    try{
      const matrix=parseMatrix(textarea.value);
      const root=clusterUPGMA(matrix);
      currentSVG=renderTree(root,matrix.samples.length);
      currentNewick=newick(root);
      plot.appendChild(currentSVG);
      let msg=tr("完成：","Done: ","完了：")+matrix.samples.length+
        tr(" 個樣本、"," samples, ","試料、")+matrix.columns+
        tr(" 個 band bins。"," band bins.","バンド区分。");
      if(matrix.empty.length)msg+=" "+tr("排除沒有任何 band 的樣本：","All-zero samples excluded: ","バンドのない試料を除外：")+matrix.empty.join(", ")+".";
      if(matrix.unresolved.length)msg+=" "+tr("未能估算大小的 bands 已忽略：","Unresolved bands ignored: ","サイズ不明のバンドは除外：")+matrix.unresolved.join(", ")+".";
      setStatus(msg);
      svgBtn.disabled=false;newickBtn.disabled=false;
    }catch(err){setStatus(String(err.message),true);}
  }
  function downloadText(content, filename, type){
    const blob=new Blob([content],{type});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  function close(){modal.hidden=true;}
  function open(){modal.hidden=false;if(!textarea.value.trim())loadCurrent();$("dendroClose").focus();}
  button.addEventListener("click",open);
  const languageSelect=$("languageSelect");
  if(languageSelect) languageSelect.addEventListener("change",()=>{
    if(!modal.hidden && currentSVG)run();
  });
  $("dendroClose").addEventListener("click",close);
  $("dendroCloseBottom").addEventListener("click",close);
  $("dendroCurrent").addEventListener("click",loadCurrent);
  $("dendroRun").addEventListener("click",run);
  modal.addEventListener("pointerdown",e=>{if(e.target===modal)close();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)close();});
  svgBtn.addEventListener("click",()=>{
    if(!currentSVG)return;
    const data='<?xml version="1.0" encoding="UTF-8"?>\n'+new XMLSerializer().serializeToString(currentSVG);
    downloadText(data,"gel56_upgma.svg","image/svg+xml;charset=utf-8");
  });
  newickBtn.addEventListener("click",()=>{
    if(currentNewick)downloadText(currentNewick+"\n","gel56_upgma.nwk","text/plain;charset=utf-8");
  });

  window.Gel56UPGMA = Object.freeze({parseMatrix,clusterUPGMA,diceDistance,newick});
})();