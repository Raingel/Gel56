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


  // All visualizations use the same Dice distance matrix.
  function distanceMatrix(samples) {
    return samples.map((a,i)=>samples.map((b,j)=>i===j?0:diceDistance(a,b)));
  }

  function leafOrder(root) {
    return root.children ? root.children.flatMap(leafOrder) : [root.name];
  }

  function appendTitle(node, value) {
    node.appendChild(makeSvgNode("title",{},value));
    return node;
  }

  function drawHeatmap(matrix, root) {
    const byName=new Map(matrix.samples.map((s,i)=>[s.name,i]));
    const order=leafOrder(root).map(name=>byName.get(name));
    const dist=distanceMatrix(matrix.samples), n=order.length;
    const cell=n<=24?34:n<=55?24:18;
    const left=205,top=185,width=left+n*cell+85,height=top+n*cell+77;
    const svg=makeSvgNode("svg",{xmlns:NS,viewBox:"0 0 "+width+" "+height,width,height,
      role:"img","aria-label":"Pairwise Dice similarity heatmap"});
    svg.appendChild(makeSvgNode("rect",{width,height,fill:"#fff"}));
    svg.appendChild(makeSvgNode("text",{x:18,y:30,fill:"#23313d","font-size":18,
      "font-family":"Arial,sans-serif","font-weight":"bold"},
      tr("兩兩 Dice similarity (%)","Pairwise Dice similarity (%)","ペアごとのDice類似度 (%)")));
    svg.appendChild(makeSvgNode("text",{x:18,y:51,fill:"#536575","font-size":12,"font-family":"Arial,sans-serif"},
      tr("UPGMA 葉節點順序；顏色越深表示越相似",
         "UPGMA leaf order; darker cells indicate greater similarity",
         "UPGMAの順序；濃い色ほど類似度が高い")));
    const short=name=>name.length>20?name.slice(0,19)+"…":name;
    for(let i=0;i<n;i++){
      const name=matrix.samples[order[i]].name;
      const ry=top+i*cell+cell/2;
      const label=makeSvgNode("text",{x:left-9,y:ry+4,fill:"#26343f",
        "font-size":n>55?11:12,"font-family":"Arial,sans-serif","text-anchor":"end"},short(name));
      svg.appendChild(appendTitle(label,name));
      const col=makeSvgNode("text",{x:left+i*cell+cell/2,y:top-12,fill:"#26343f",
        "font-size":n>55?10:12,"font-family":"Arial,sans-serif",
        transform:"rotate(-60 "+(left+i*cell+cell/2)+" "+(top-12)+")","text-anchor":"start"},short(name));
      svg.appendChild(appendTitle(col,name));
      for(let j=0;j<n;j++){
        const similarity=1-dist[order[i]][order[j]];
        const level=Math.max(0,Math.min(1,similarity));
        const rr=Math.round(245-(245-32)*level),gg=Math.round(249-(249-105)*level),bb=Math.round(253-(253-152)*level);
        const rect=makeSvgNode("rect",{x:left+j*cell,y:top+i*cell,width:cell,height:cell,
          fill:"rgb("+rr+","+gg+","+bb+")",stroke:"#d5e1e8","stroke-width":0.6});
        if(n<=55) appendTitle(rect,name+" / "+matrix.samples[order[j]].name+": "+(100*level).toFixed(1)+"%");
        svg.appendChild(rect);
        if(n<=22) svg.appendChild(makeSvgNode("text",{x:left+j*cell+cell/2,y:ry+4,
          fill:level>0.65?"#fff":"#20333d","font-size":10,"font-family":"Arial,sans-serif",
          "text-anchor":"middle"},Math.round(100*level)));
      }
    }
    const lx=left,ly=top+n*cell+32;
    for(let i=0;i<=20;i++){
      const level=i/20,rr=Math.round(245-213*level),gg=Math.round(249-144*level),bb=Math.round(253-101*level);
      svg.appendChild(makeSvgNode("rect",{x:lx+i*12,y:ly,width:12,height:12,fill:"rgb("+rr+","+gg+","+bb+")"}));
    }
    for(const [x,t] of [[lx,"0%"],[lx+120,"50%"],[lx+240,"100%"]])
      svg.appendChild(makeSvgNode("text",{x,y:ly+27,fill:"#344451","font-size":11,
        "font-family":"Arial,sans-serif","text-anchor":"middle"},t));
    return svg;
  }

  // Classical PCoA: double-center squared distances and diagonalize B.
  // Dice distance is not necessarily Euclidean, so negative eigenvalues are reported.
  function classicalPCoA(matrix) {
    const D=distanceMatrix(matrix.samples),n=D.length;
    if(n<3)throw Error(tr("二維 PCoA 至少需要三筆有 band 的樣本。",
      "2D PCoA needs at least three samples with bands.",
      "2次元PCoAにはバンドのある試料が3件以上必要です。"));
    const sq=D.map(row=>row.map(v=>v*v));
    const mean=sq.map(row=>row.reduce((a,b)=>a+b,0)/n);
    const grand=mean.reduce((a,b)=>a+b,0)/n;
    const A=sq.map((row,i)=>row.map((v,j)=>-0.5*(v-mean[i]-mean[j]+grand)));
    const V=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
    const tolerance=1e-12;
    let converged=false;
    for(let sweep=0;sweep<80;sweep++){
      let maxOff=0,scale=0;
      for(let p=0;p<n;p++) {
        scale=Math.max(scale,Math.abs(A[p][p]));
        for(let q=p+1;q<n;q++)maxOff=Math.max(maxOff,Math.abs(A[p][q]));
      }
      if(maxOff<=tolerance*Math.max(1,scale)){converged=true;break;}
      for(let p=0;p<n-1;p++) for(let q=p+1;q<n;q++){
        const apq=A[p][q];
        if(Math.abs(apq)<tolerance*Math.max(1,scale)*0.1)continue;
        const tau=(A[q][q]-A[p][p])/(2*apq);
        const t=(tau<0?-1:1)/(Math.abs(tau)+Math.sqrt(1+tau*tau));
        const c=1/Math.sqrt(1+t*t),ss=t*c;
        const app=A[p][p],aqq=A[q][q];
        A[p][p]=app-t*apq;
        A[q][q]=aqq+t*apq;
        A[p][q]=A[q][p]=0;
        for(let k=0;k<n;k++){
          if(k!==p&&k!==q){
            const akp=A[k][p],akq=A[k][q];
            A[k][p]=A[p][k]=c*akp-ss*akq;
            A[k][q]=A[q][k]=ss*akp+c*akq;
          }
          const vkp=V[k][p],vkq=V[k][q];
          V[k][p]=c*vkp-ss*vkq;V[k][q]=ss*vkp+c*vkq;
        }
      }
    }
    const eigen=Array.from({length:n},(_,i)=>({value:A[i][i],index:i}))
      .sort((a,b)=>b.value-a.value);
    const positive=eigen.filter(e=>e.value>1e-9);
    if(!positive.length)throw Error("No positive PCoA eigenvalues.");
    const positiveSum=positive.reduce((a,e)=>a+e.value,0);
    const negativeSum=eigen.filter(e=>e.value < -1e-9).reduce((a,e)=>a-Math.min(0,e.value),0);
    // Eigenvector signs are arbitrary; coordinate distances are unaffected.
    const coordinate=(i,k)=>positive[k]?
      V[i][positive[k].index]*Math.sqrt(positive[k].value):0;
    return {points:matrix.samples.map((s,i)=>({name:s.name,x:coordinate(i,0),y:coordinate(i,1)})),
      explained:[(positive[0]?.value||0)/positiveSum,(positive[1]?.value||0)/positiveSum],
      negativeFraction:negativeSum/Math.max(positiveSum,1e-20),
      positiveAxes:positive.length,converged};
  }

  function drawPCoA(matrix) {
    const result=classicalPCoA(matrix);
    const width=1020,height=650,left=95,right=790,top=95,bottom=555;
    const xs=result.points.map(p=>p.x),ys=result.points.map(p=>p.y);
    const xmin=Math.min(0,...xs),xmax=Math.max(0,...xs),ymin=Math.min(0,...ys),ymax=Math.max(0,...ys);
    const xpad=Math.max((xmax-xmin)*0.15,0.05),ypad=Math.max((ymax-ymin)*0.15,0.05);
    const x0=xmin-xpad,x1=xmax+xpad,y0=ymin-ypad,y1=ymax+ypad;
    const sx=x=>left+(x-x0)/(x1-x0)*(right-left);
    const sy=y=>bottom-(y-y0)/(y1-y0)*(bottom-top);
    const svg=makeSvgNode("svg",{xmlns:NS,viewBox:"0 0 "+width+" "+height,width,height,
      role:"img","aria-label":"Principal coordinates analysis (Dice distance)"});
    svg.appendChild(makeSvgNode("rect",{width,height,fill:"#fff"}));
    svg.appendChild(makeSvgNode("text",{x:27,y:30,fill:"#263743","font-size":18,
      "font-family":"Arial,sans-serif","font-weight":"bold"},
      tr("PCoA · Dice 距離","PCoA · Dice distance","PCoA · Dice距離")));
    const pcName=k=>"PCo"+(k+1)+" ("+(100*result.explained[k]).toFixed(1)+"%)";
    for(let t=0;t<=5;t++){
      const xt=left+(right-left)*t/5, yt=top+(bottom-top)*t/5;
      svg.appendChild(makeSvgNode("line",{x1:xt,y1:top,x2:xt,y2:bottom,stroke:"#e7ebef"}));
      svg.appendChild(makeSvgNode("line",{x1:left,y1:yt,x2:right,y2:yt,stroke:"#e7ebef"}));
      svg.appendChild(makeSvgNode("text",{x:xt,y:bottom+19,"text-anchor":"middle",
        fill:"#556776","font-size":11,"font-family":"Arial,sans-serif"},(x0+(x1-x0)*t/5).toFixed(2)));
      svg.appendChild(makeSvgNode("text",{x:left-12,y:yt+4,"text-anchor":"end",
        fill:"#556776","font-size":11,"font-family":"Arial,sans-serif"},(y1-(y1-y0)*t/5).toFixed(2)));
    }
    for(const [x1,y1,x2,y2] of [[sx(0),top,sx(0),bottom],[left,sy(0),right,sy(0)]])
      svg.appendChild(makeSvgNode("line",{x1,y1,x2,y2,stroke:"#a4b4c0","stroke-dasharray":"6 5"}));
    const labelAll=result.points.length<=35;
    result.points.forEach((p,i)=>{
      const cx=sx(p.x),cy=sy(p.y);
      const circle=makeSvgNode("circle",{cx,cy,r:5.5,fill:"#267ba9",stroke:"#fff","stroke-width":1.5});
      svg.appendChild(appendTitle(circle,p.name+": ("+p.x.toFixed(3)+", "+p.y.toFixed(3)+")"));
      if(labelAll){
        const lab=makeSvgNode("text",{x:cx+8,y:cy-6,fill:"#243b4a",
          "font-family":"Arial,sans-serif","font-size":12},p.name.length>23?p.name.slice(0,22)+"…":p.name);
        svg.appendChild(appendTitle(lab,p.name));
      }
    });
    svg.appendChild(makeSvgNode("text",{x:(left+right)/2,y:height-56,
      fill:"#243b4a","font-family":"Arial,sans-serif","font-size":14,"text-anchor":"middle"},pcName(0)));
    svg.appendChild(makeSvgNode("text",{x:32,y:(top+bottom)/2,
      fill:"#243b4a","font-family":"Arial,sans-serif","font-size":14,
      transform:"rotate(-90 32 "+((top+bottom)/2)+")","text-anchor":"middle"},pcName(1)));
    svg.appendChild(makeSvgNode("text",{x:27,y:height-17,fill:"#61727d",
      "font-family":"Arial,sans-serif","font-size":12},
      tr("解釋比例以正特徵值總和計算；圖形不一定保留所有原始距離。",
         "Percentages use positive eigenvalues; 2D may not preserve all pairwise distances.",
         "寄与率は正の固有値を基準に計算。2次元では元の距離を完全に再現できません。")));
    return {svg,result};
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