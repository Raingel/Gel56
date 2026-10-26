(() => {
"use strict";
const NS="http://www.w3.org/2000/svg";
const $=id=>document.getElementById(id);
const trigger=$("openFigureExportBtn");
if(!trigger)return;
const tr=(zh,en,ja)=>document.documentElement.lang==="en"?en:
  document.documentElement.lang==="ja"?ja:zh;
const modal=document.createElement("div");
modal.id="figureExportModal";
modal.className="modal-backdrop";
modal.hidden=true;
const selectStyle="width:100%;background:var(--panel-2);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:7px";
modal.innerHTML=[
'<section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="figTitle" style="width:min(1100px,96vw)">',
'<div class="export-dialog-header"><h2 id="figTitle" class="export-dialog-title">匯出分析畫面</h2>',
'<button id="figClose" type="button">關閉</button></div>',
'<div class="export-dialog-body"><div class="export-options">',
'<label class="field-control" for="figLaneMode"><span>Lane 名稱</span><select id="figLaneMode" style="'+selectStyle+'">',
'<option value="lane">L1、L2…</option><option value="sample">樣本名稱</option></select></label>',
'<label class="field-control" for="figBandMode"><span>Band 標示</span><select id="figBandMode" style="'+selectStyle+'">',
'<option value="none">不顯示數值</option><option value="size">顯示片段大小</option>',
'<option value="brightness">顯示 lane 內相對亮度</option><option value="both">同時顯示大小與相對亮度</option>',
'</select></label>',
'<label class="field-control" for="figFormat"><span>檔案格式</span><select id="figFormat" style="'+selectStyle+'">',
'<option value="svg">SVG（可編輯標記）</option><option value="jpg">JPG（圖片）</option></select></label>',
'<div class="field-control"><span>標記</span>',
'<label class="check-control"><input id="figShowMarkers" type="checkbox" checked>顯示 band 點</label>',
'<label class="check-control"><input id="figShowGuides" type="checkbox" checked>顯示 lane 線條</label></div>',
'</div><p class="panel-note">SVG 文字、線條與 band 標記可分別編輯；電泳照片仍為內嵌圖片。</p>',
'<div id="figStatus" class="export-summary" role="status" aria-live="polite"></div>',
'<div id="figPreview" style="overflow:auto;max-height:55vh;background:#fff;border-radius:5px;border:1px solid var(--border)"></div>',
'</div><div class="export-dialog-footer"><button id="figDownload" type="button" class="primary">下載圖檔</button>',
'<button id="figCloseBottom" type="button">關閉</button></div></section>'
].join("");
document.body.appendChild(modal);
const laneMode=$("figLaneMode"),bandMode=$("figBandMode"),
  format=$("figFormat"),markers=$("figShowMarkers"),guides=$("figShowGuides"),
  preview=$("figPreview"),downloadButton=$("figDownload"),status=$("figStatus");
let scene=null;
function showStatus(message,failed=false){status.textContent=message;status.style.color=failed?"#ffa4a4":"";}
function el(tag,attrs={},text){
  const out=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs)){
    if(v!==null && v!==undefined)out.setAttribute(k,String(v));
  }
  if(text!==undefined)out.textContent=String(text);
  return out;
}
function bandText(band,mode,hasResults){
  const chunks=[];
  if(mode==="size"||mode==="both"){
    if(Number.isFinite(band.bp))chunks.push(Math.round(band.bp).toLocaleString()+" bp");
    else if(hasResults)chunks.push("size: —");
  }
  if(mode==="brightness"||mode==="both"){
    if(Number.isFinite(band.relativeIntensity))chunks.push(Math.round(band.relativeIntensity)+"%");
    else if(hasResults)chunks.push("int.: —");
  }
  if(band.saturated)chunks.push("SAT");
  return chunks.join(" · ");
}
function getOptions(){
  return {laneMode:laneMode.value,bandMode:bandMode.value,markers:markers.checked,guides:guides.checked};
}
function makeScene(snapshot,opts){
  const W=snapshot.width,H=snapshot.height;
  const isNames=opts.laneMode==="sample";
  const laneFont=Math.max(10,Math.min(18,W/Math.max(45,snapshot.lanes.length*2.5)));
  const maxLen=Math.max(0,...snapshot.lanes.map(l=>String(l.sampleName||"").length));
  const header=isNames?Math.ceil(Math.min(350,Math.max(65,maxLen*laneFont*0.66+24))):42;
  const bandFont=Math.max(11,W/145);
  const padX=Math.max(3,bandFont*.28),padY=Math.max(2,bandFont*.18);
  const measure=document.createElement("canvas").getContext("2d");
  measure.font=bandFont+"px Arial, sans-serif";
  const items=[];
  const push=(type,obj)=>items.push(Object.assign({type},obj));
  for(const lane of snapshot.lanes){
    const label=isNames?lane.sampleName:"L"+(lane.index+1)+(lane.isLadder?" M":"");
    const x=lane.x;
    if(isNames){
      push("text",{x:x+laneFont*.2,y:header-9,text:label,fill:"#1a2d3a",size:laneFont,angle:-90,align:"start"});
    }else{
      push("text",{x,y:header-11,text:label,fill:"#1a2d3a",
        size:Math.max(9,Math.min(17,W/Math.max(60,snapshot.lanes.length*2.5))),
        angle:0,align:"center"});
    }
    if(opts.guides){
      push("line",{x1:x,y1:header,x2:x,y2:header+H,
        stroke:lane.isLadder?"#ffd166":"#50b7ff",width:Math.max(1.5,W/900),opacity:.8});
    }
  }
  for(const band of snapshot.bands){
    const lane=snapshot.lanes[band.laneIndex];if(!lane)continue;
    const color=lane.isLadder?"#ffd166":"#7ee081",y=header+band.y;
    if(opts.markers){
      const half=Math.max(5,lane.width*.34);
      push("line",{x1:lane.x-half,y1:y,x2:lane.x+half,y2:y,
        stroke:color,width:Math.max(1.5,W/1000),opacity:1});
      push("circle",{x:lane.x,y,r:Math.max(4.5,W/390),
        fill:color,stroke:"#162016",width:Math.max(1.5,W/1000)});
    }
    if(opts.bandMode==="none")continue;
    const label=bandText(band,opts.bandMode,snapshot.resultsValid);
    if(!label)continue;
    const tw=measure.measureText(label).width;
    const right=lane.x+lane.width*.45+tw+padX*2<W;
    const bx=right?lane.x+lane.width*.37+4:
      lane.x-lane.width*.37-4-tw-padX*2;
    const by=header+Math.max(0,Math.min(H-bandFont-padY*2,band.y-bandFont/2-padY));
    push("rect",{x:bx,y:by,w:tw+padX*2,h:bandFont+padY*2,fill:"#000",opacity:.78});
    push("text",{x:bx+padX,y:by+padY+bandFont/2,text:label,
      fill:band.saturated?"#ffb4a8":color,size:bandFont,angle:0,align:"left",baseline:"middle"});
  }
  return {width:W,height:H+header,header,items,snapshot};
}
function makeSVG(result){
  const svg=el("svg",{xmlns:NS,version:"1.1",width:result.width,height:result.height,
    viewBox:"0 0 "+result.width+" "+result.height,role:"img",
    "aria-label":"Gel56 annotated gel analysis"});
  svg.appendChild(el("rect",{x:0,y:0,width:result.width,height:result.height,fill:"#fff"}));
  const raster=el("image",{x:0,y:result.header,width:result.width,
    height:result.snapshot.height,preserveAspectRatio:"none"});
  raster.setAttribute("href",result.snapshot.imageDataUrl);
  svg.appendChild(raster);
  const guideGroup=el("g",{id:"gel56-lane-lines"});
  const labelsGroup=el("g",{id:"gel56-lane-labels"});
  const bandGroup=el("g",{id:"gel56-band-annotations"});
  for(const item of result.items){
    let n;
    if(item.type==="line"){
      n=el("line",{x1:item.x1,y1:item.y1,x2:item.x2,y2:item.y2,
        stroke:item.stroke,"stroke-width":item.width,"stroke-opacity":item.opacity??1});
    }else if(item.type==="circle"){
      n=el("circle",{cx:item.x,cy:item.y,r:item.r,fill:item.fill,
        stroke:item.stroke,"stroke-width":item.width});
    }else if(item.type==="rect"){
      n=el("rect",{x:item.x,y:item.y,width:item.w,height:item.h,fill:item.fill,
        opacity:item.opacity??1});
    }else if(item.type==="text"){
      const attrs={x:item.x,y:item.y,fill:item.fill,
        "font-size":item.size,"font-family":"Arial, sans-serif",
        "text-anchor":item.align==="center"?"middle":"start",
        "dominant-baseline":item.baseline==="middle"?"central":"auto"};
      if(item.angle)attrs.transform="rotate("+item.angle+" "+item.x+" "+item.y+")";
      n=el("text",attrs,item.text);
    }
    if(!n)continue;
    (item.type==="text"&&item.y<=result.header?labelsGroup:
      item.type==="line"&&item.opacity===.8?guideGroup:bandGroup).appendChild(n);
  }
  svg.append(guideGroup,labelsGroup,bandGroup);
  return svg;
}
async function makeJPEG(result){
  const canvas=document.createElement("canvas");
  canvas.width=result.width;canvas.height=result.height;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#fff";ctx.fillRect(0,0,result.width,result.height);
  const image=await new Promise((resolve,reject)=>{
    const pic=new Image();
    pic.onload=()=>resolve(pic);pic.onerror=()=>reject(Error("無法讀取電泳圖片。"));
    pic.src=result.snapshot.imageDataUrl;
  });
  ctx.drawImage(image,0,result.header,result.width,result.snapshot.height);
  for(const item of result.items){
    ctx.save();
    if(item.type==="line"){
      ctx.globalAlpha=item.opacity??1;
      ctx.strokeStyle=item.stroke;ctx.lineWidth=item.width;
      ctx.beginPath();ctx.moveTo(item.x1,item.y1);ctx.lineTo(item.x2,item.y2);ctx.stroke();
    }else if(item.type==="circle"){
      ctx.fillStyle=item.fill;ctx.strokeStyle=item.stroke;ctx.lineWidth=item.width;
      ctx.beginPath();ctx.arc(item.x,item.y,item.r,0,Math.PI*2);ctx.fill();ctx.stroke();
    }else if(item.type==="rect"){
      ctx.globalAlpha=item.opacity??1;ctx.fillStyle=item.fill;
      ctx.fillRect(item.x,item.y,item.w,item.h);
    }else if(item.type==="text"){
      ctx.translate(item.x,item.y);
      if(item.angle)ctx.rotate(item.angle*Math.PI/180);
      ctx.fillStyle=item.fill;ctx.font=item.size+"px Arial, sans-serif";
      ctx.textAlign=item.align;ctx.textBaseline=item.baseline==="middle"?"middle":"alphabetic";
      ctx.fillText(item.text,0,0);
    }
    ctx.restore();
  }
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(Error("無法產生 JPG 圖檔。")),
      "image/jpeg",.94);
  });
}
function rebuild(){
  try{
    window.Gel56FigureApplyOptions?.({laneMode:laneMode.value,bandMode:bandMode.value,
      markers:markers.checked});
    const image=window.Gel56FigureSnapshot();
    scene=makeScene(image,getOptions());
    const svg=makeSVG(scene);
    svg.style.width="100%";svg.style.height="auto";svg.style.display="block";
    preview.replaceChildren(svg);
    showStatus(tr("預覽為完整電泳圖，不受視窗縮放比例影響。",
      "Preview shows the full gel, regardless of zoom.",
      "表示倍率に関係なく、ゲル全体をプレビューします。"));
  }catch(e){
    scene=null;preview.replaceChildren();showStatus(e.message,true);
  }
}
function open(){
  try{
    const image=window.Gel56FigureSnapshot();
    laneMode.value=image.selectedLaneMode;bandMode.value=image.selectedBandMode;
    markers.checked=image.showMarkers;guides.checked=true;
    modal.hidden=false;rebuild();$("figClose").focus();
  }catch(e){showStatus(e.message,true);}
}
function close(){modal.hidden=true;}
function downloadBlob(blob,name){
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),20000);
}
async function save(){
  if(!scene)return;
  downloadButton.disabled=true;
  try{
    const base=String(scene.snapshot.imageName||"gel").replace(/\.[^.]+$/,"")
      .replace(/[\\/:*?"<>|\x00-\x1f]/g,"_").slice(0,90)+"_annotated";
    if(format.value==="svg"){
      const svg=makeSVG(scene);
      const source='<?xml version="1.0" encoding="UTF-8"?>\n'+
        new XMLSerializer().serializeToString(svg);
      downloadBlob(new Blob([source],{type:"image/svg+xml;charset=utf-8"}),base+".svg");
    }else{
      downloadBlob(await makeJPEG(scene),base+".jpg");
    }
    showStatus(tr("圖檔已產生，請確認瀏覽器下載。",
      "File generated. Check your downloads.",
      "画像を作成しました。ダウンロードを確認してください。"));
  }catch(e){showStatus(e.message,true);}
  finally{downloadButton.disabled=false;}
}
trigger.addEventListener("click",open);
$("figClose").addEventListener("click",close);
$("figCloseBottom").addEventListener("click",close);
modal.addEventListener("pointerdown",e=>{if(e.target===modal)close();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.hidden)close();});
[laneMode,bandMode,markers,guides].forEach(control=>
  control.addEventListener("change",rebuild));
downloadButton.addEventListener("click",save);
window.Gel56FigureExport=Object.freeze({makeScene,makeSVG,bandText});
})();