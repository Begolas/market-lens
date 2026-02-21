import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════
   MARKET·LENS  —  Responsive Finance Client (Desktop + iOS)
   ▸ Alpha Vantage API
   ▸ Candlestick / Line SVG Chart
   ▸ SMA, EMA, BB, VWAP, Ichimoku, Fibonacci, RSI, MACD
   ▸ Favoriten + Layout → localStorage
   ▸ Fully responsive: Desktop sidebar ↔ Mobile bottom-nav
═══════════════════════════════════════════════════════════════════ */

// ─── Storage ─────────────────────────────────────────────────────
const CACHE_TTL = 15 * 60 * 1000;
const LS = {
  get:  (k)    => { try { const r = JSON.parse(localStorage.getItem(k)); return r && (!r._ts || Date.now()-r._ts < CACHE_TTL) ? r.v : null; } catch { return null; } },
  set:  (k, v) => { try { localStorage.setItem(k, JSON.stringify({ v, _ts: Date.now() })); } catch {} },
  raw:  (k, v) => { if (v===undefined) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } } try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del:  (k)    => { try { localStorage.removeItem(k); } catch {} },
};

// ─── Alpha Vantage ────────────────────────────────────────────────
const AV = "https://www.alphavantage.co/query";
async function avFetch(p) { const r = await fetch(AV+"?"+new URLSearchParams(p)); if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }

async function fetchCandles(symbol, interval, apiKey) {
  const key = "av_"+symbol+"_"+interval;
  const hit = LS.get(key);
  if (hit) return hit.map(c => ({...c, date: new Date(c.date)}));
  let params;
  // Free-tier only: ADJUSTED + INTRADAY are Premium-only
  if      (interval==="1D")  params = {function:"TIME_SERIES_DAILY",   symbol, outputsize:"compact", apikey:apiKey};
  else if (interval==="1W")  params = {function:"TIME_SERIES_WEEKLY",  symbol, apikey:apiKey};
  else if (interval==="1Mo") params = {function:"TIME_SERIES_MONTHLY", symbol, apikey:apiKey};
  else                        params = {function:"TIME_SERIES_DAILY",   symbol, outputsize:"compact", apikey:apiKey}; // Intraday=Premium, fallback Daily
  const data = await avFetch(params);
  if (data["Information"]) throw new Error("Premium-Endpoint: Bitte 'TIME_SERIES_DAILY' verwenden (Free Key)");
  if (data["Note"]) throw new Error("Rate limit: max. 25 req/Tag oder 5/Min. erreicht – kurz warten");
  if (data["Error Message"]) throw new Error("Symbol nicht gefunden");
  const tsKey = Object.keys(data).find(k => k.startsWith("Time Series"));
  if (!tsKey) throw new Error("Keine Daten erhalten");
  const candles = Object.entries(data[tsKey]).map(([date,v]) => ({
    date: new Date(date),
    open:   parseFloat(v["1. open"]),
    high:   parseFloat(v["2. high"]),
    low:    parseFloat(v["3. low"]),
    close:  parseFloat(v["4. close"]),
    volume: parseInt(v["5. volume"]||"0"),
  })).sort((a,b)=>a.date-b.date);
  LS.set(key, candles.map(c=>({...c, date:c.date.toISOString()})));
  return candles;
}

async function searchSymbols(q, apiKey) {
  const data = await avFetch({function:"SYMBOL_SEARCH", keywords:q, apikey:apiKey});
  return (data.bestMatches||[]).map(m=>({symbol:m["1. symbol"],name:m["2. name"],type:m["3. type"],region:m["4. region"],currency:m["8. currency"]}));
}

// ─── TA ───────────────────────────────────────────────────────────
const TA = {
  sma:  (d,p) => d.map((_,i) => i<p-1?null:d.slice(i-p+1,i+1).reduce((s,x)=>s+x.close,0)/p),
  ema:  (d,p) => { const k=2/(p+1),r=[d[0].close]; for(let i=1;i<d.length;i++) r.push(d[i].close*k+r[i-1]*(1-k)); return r; },
  rsi:  (d,p=14) => d.map((_,i) => { if(i<p) return null; let g=0,l=0; for(let j=i-p+1;j<=i;j++){const x=d[j].close-d[j-1].close; x>0?g+=x:l-=x;} return 100-100/(1+g/(l||1e-9)); }),
  macd: (d) => { const e12=TA.ema(d,12),e26=TA.ema(d,26),line=d.map((_,i)=>e12[i]-e26[i]),sig=[line[0]],k=2/10; for(let i=1;i<line.length;i++) sig.push(line[i]*k+sig[i-1]*(1-k)); return {line,signal:sig,hist:line.map((v,i)=>v-sig[i])}; },
  bb:   (d,p=20,m=2) => { const s=TA.sma(d,p); return d.map((_,i)=>{ if(!s[i]) return null; const std=Math.sqrt(d.slice(i-p+1,i+1).reduce((a,x)=>a+(x.close-s[i])**2,0)/p); return {upper:s[i]+m*std,mid:s[i],lower:s[i]-m*std}; }); },
  vwap: (d) => { let cp=0,cv=0; return d.map(x=>{ const t=(x.high+x.low+x.close)/3; cp+=t*x.volume; cv+=x.volume; return cv?cp/cv:null; }); },
  ichi: (d) => { const hi=a=>Math.max(...a.map(x=>x.high)),lo=a=>Math.min(...a.map(x=>x.low)); return d.map((_,i)=>({ tenkan:i>=8?(hi(d.slice(i-8,i+1))+lo(d.slice(i-8,i+1)))/2:null, kijun:i>=25?(hi(d.slice(i-25,i+1))+lo(d.slice(i-25,i+1)))/2:null, senkouA:i>=25?((i>=8?(hi(d.slice(i-8,i+1))+lo(d.slice(i-8,i+1)))/2:0)+(i>=25?(hi(d.slice(i-25,i+1))+lo(d.slice(i-25,i+1)))/2:0))/2:null, senkouB:i>=51?(hi(d.slice(i-51,i+1))+lo(d.slice(i-51,i+1)))/2:null })); },
  fib:  (d) => { const H=Math.max(...d.map(x=>x.high)),L=Math.min(...d.map(x=>x.low)),r=H-L; return [0,0.236,0.382,0.5,0.618,0.786,1].map(lv=>({level:lv,price:H-r*lv,label:(lv*100).toFixed(1)+"%"})); },
};

// ─── Constants ────────────────────────────────────────────────────
const DEFAULT_LAYOUT = { chartType:"candle", activeIndicators:[], subChart:"none", timeRange:"1D", theme:"dark" };
const ALL_IND = [
  {id:"sma20",  label:"SMA 20",    color:"#facc15", group:"Trend"},
  {id:"sma50",  label:"SMA 50",    color:"#60a5fa", group:"Trend"},
  {id:"sma200", label:"SMA 200",   color:"#f97316", group:"Trend"},
  {id:"ema20",  label:"EMA 20",    color:"#a78bfa", group:"Trend"},
  {id:"ema50",  label:"EMA 50",    color:"#34d399", group:"Trend"},
  {id:"bb",     label:"Bollinger", color:"#818cf8", group:"Volatilität"},
  {id:"vwap",   label:"VWAP",      color:"#fb923c", group:"Volumen"},
  {id:"ichimoku",label:"Ichimoku", color:"#6ee7b7", group:"Trend"},
  {id:"fib",    label:"Fibonacci", color:"#fbbf24", group:"Sonstige"},
  {id:"rsi",    label:"RSI",       color:"#a78bfa", group:"Oszillator"},
  {id:"macd",   label:"MACD",      color:"#34d399", group:"Oszillator"},
];
const INTERVALS = ["1D","1W","1Mo"]; // Free tier: no intraday (Premium only)
const IV_LABEL  = {"1D":"Täglich","1W":"Wöchentl.","1Mo":"Monatl."};
const C = { bg:"#060b11",panel:"#0a0f16",card:"#0d1520",border:"#1a2030",border2:"#1e2a38",text:"#e2e8f0",muted:"#5a6a7e",dim:"#1e2a38",up:"#22d3a5",down:"#f87171",accent:"#22d3a5" };

// ─── useIsMobile hook ─────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

// ─── Candlestick Chart ────────────────────────────────────────────
function CandleChart({ data, layout, isMobile }) {
  const [hover, setHover] = useState(null);
  const [touch, setTouch] = useState(null);
  const W = 900, H = isMobile ? 280 : 370;
  const pad = { top:12, right: isMobile?4:68, bottom:28, left: isMobile?4:10 };
  const cw = W-pad.left-pad.right, ch = H-pad.top-pad.bottom;
  const inds = layout.activeIndicators;

  const computed = useMemo(() => {
    if (!data.length) return {};
    const r = {};
    if (inds.includes("sma20"))     r.sma20 = TA.sma(data,20);
    if (inds.includes("sma50"))     r.sma50 = TA.sma(data,50);
    if (inds.includes("sma200"))    r.sma200= TA.sma(data,200);
    if (inds.includes("ema20"))     r.ema20 = TA.ema(data,20);
    if (inds.includes("ema50"))     r.ema50 = TA.ema(data,50);
    if (inds.includes("bb"))        r.bb    = TA.bb(data);
    if (inds.includes("vwap"))      r.vwap  = TA.vwap(data);
    if (inds.includes("ichimoku"))  r.ichi  = TA.ichi(data);
    if (inds.includes("fib"))       r.fib   = TA.fib(data);
    return r;
  }, [data, inds.join(",")]);

  if (!data.length) return null;

  const allV = data.flatMap(d=>[d.high,d.low]);
  if (computed.bb)   computed.bb.forEach(b=>b&&allV.push(b.upper,b.lower));
  if (computed.ichi) computed.ichi.forEach(ic=>ic&&[ic.senkouA,ic.senkouB].forEach(v=>v&&allV.push(v)));
  const minP=Math.min(...allV)*0.9985, maxP=Math.max(...allV)*1.0015, rng=maxP-minP||1;
  const xS = i => (i/Math.max(data.length-1,1))*cw;
  const yS = v => ch-((v-minP)/rng)*ch;
  const bw  = Math.max(1, Math.min(14, cw/data.length*0.72));

  const lp = arr => arr.reduce((acc,v,i)=>{ if(v==null) return acc+" M"; const pt=xS(i).toFixed(1)+","+yS(v).toFixed(1); return acc.endsWith(" M")?"M"+pt:acc+" L"+pt; }," M").trim();

  const yTicks = Array.from({length:5},(_,i)=>{ const v=minP+(i/4)*rng; return {y:yS(v),label:v>=1000?v.toFixed(0):v>=100?v.toFixed(1):v.toFixed(2)}; });
  const step = Math.max(1,Math.floor(data.length/(isMobile?4:7)));
  const xTicks = data.reduce((a,d,i)=>{ if(i%step===0) a.push({x:xS(i),label:d.date instanceof Date?d.date.toLocaleDateString("de-DE",{month:"short",day:"numeric"}):""}); return a; },[]);

  // Ichimoku cloud
  let cloudPath="";
  const ic = computed.ichi;
  if (ic) {
    const pts = ic.map((x,i)=>x?.senkouA!=null&&x?.senkouB!=null?{x:xS(i),a:yS(x.senkouA),b:yS(x.senkouB)}:null).filter(Boolean);
    if (pts.length>1) cloudPath=pts.map((p,i)=>(i===0?"M":"L")+p.x.toFixed(1)+","+p.a.toFixed(1)).join(" ")+" "+pts.slice().reverse().map(p=>"L"+p.x.toFixed(1)+","+p.b.toFixed(1)).join(" ")+"Z";
  }

  const hoverIdx = touch ?? hover;

  const handleTouch = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const tx = ((e.touches[0].clientX - rect.left) / rect.width) * W - pad.left;
    const idx = Math.round((tx/cw)*(data.length-1));
    setTouch(idx>=0&&idx<data.length?idx:null);
  };

  return (
    <div style={{position:"relative"}}>
      {hoverIdx!==null && data[hoverIdx] && (
        <div style={{position:"absolute",top:4,left:"50%",transform:"translateX(-50%)",background:"#0a0f16ee",border:"1px solid "+C.border,borderRadius:7,padding:"4px 12px",fontSize:10,color:C.text,whiteSpace:"nowrap",pointerEvents:"none",zIndex:10,display:"flex",gap:10}}>
          <span style={{color:C.muted}}>{data[hoverIdx].date instanceof Date?data[hoverIdx].date.toLocaleDateString("de-DE"):""}</span>
          <span>O:<b>{data[hoverIdx].open?.toFixed(2)}</b></span>
          <span>H:<b style={{color:C.up}}>{data[hoverIdx].high?.toFixed(2)}</b></span>
          <span>L:<b style={{color:C.down}}>{data[hoverIdx].low?.toFixed(2)}</b></span>
          <span>C:<b>{data[hoverIdx].close?.toFixed(2)}</b></span>
        </div>
      )}
      <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block",cursor:"crosshair",touchAction:"pan-y"}}
        onMouseMove={e=>{ const rect=e.currentTarget.getBoundingClientRect(); const sx=((e.clientX-rect.left)/rect.width)*W-pad.left; const idx=Math.round((sx/cw)*(data.length-1)); setHover(idx>=0&&idx<data.length?idx:null); }}
        onMouseLeave={()=>setHover(null)}
        onTouchMove={handleTouch}
        onTouchEnd={()=>setTimeout(()=>setTouch(null),1500)}
      >
        <defs>
          <clipPath id="cc"><rect x={0} y={0} width={cw} height={ch}/></clipPath>
          <linearGradient id="upG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.up} stopOpacity="0.18"/><stop offset="100%" stopColor={C.up} stopOpacity="0"/></linearGradient>
          <linearGradient id="dnG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.down} stopOpacity="0.18"/><stop offset="100%" stopColor={C.down} stopOpacity="0"/></linearGradient>
        </defs>
        <g transform={"translate("+pad.left+","+pad.top+")"}>
          {yTicks.map((t,i)=>(
            <g key={i}>
              <line x1={0} y1={t.y} x2={cw} y2={t.y} stroke={C.border} strokeWidth="0.5"/>
              {!isMobile && <text x={cw+5} y={t.y+3.5} fill={C.muted} fontSize="10" textAnchor="start">{t.label}</text>}
              {isMobile  && <text x={3}    y={t.y-2}   fill={C.muted} fontSize="9"  textAnchor="start" fillOpacity="0.6">{t.label}</text>}
            </g>
          ))}
          {xTicks.map((t,i)=><text key={i} x={t.x} y={ch+18} fill={C.muted} fontSize={isMobile?"9":"10"} textAnchor="middle">{t.label}</text>)}

          {/* Ichimoku cloud */}
          {cloudPath && <g clipPath="url(#cc)">
            <path d={cloudPath} fill="#22d3a514"/>
            {ic && <path d={lp(ic.map(x=>x?.tenkan))} fill="none" stroke="#ef4444" strokeWidth="1" opacity="0.7"/>}
            {ic && <path d={lp(ic.map(x=>x?.kijun))} fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.7"/>}
            {ic && <path d={lp(ic.map(x=>x?.senkouA))} fill="none" stroke="#22d3a5" strokeWidth="0.8" opacity="0.4"/>}
            {ic && <path d={lp(ic.map(x=>x?.senkouB))} fill="none" stroke="#f87171" strokeWidth="0.8" opacity="0.4"/>}
          </g>}

          {/* Bollinger */}
          {computed.bb && <g clipPath="url(#cc)">
            <path d={lp(computed.bb.map(b=>b?.upper))+" "+computed.bb.slice().reverse().map((b,i,a)=>b?.lower!=null?"L"+xS(a.length-1-i).toFixed(1)+","+yS(b.lower).toFixed(1):"").filter(Boolean).join(" ")+"Z"} fill="#6366f10c"/>
            <path d={lp(computed.bb.map(b=>b?.upper))} fill="none" stroke="#818cf8" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.7"/>
            <path d={lp(computed.bb.map(b=>b?.lower))} fill="none" stroke="#818cf8" strokeWidth="0.8" strokeDasharray="3,3" opacity="0.7"/>
            <path d={lp(computed.bb.map(b=>b?.mid))}   fill="none" stroke="#818cf840" strokeWidth="0.8"/>
          </g>}

          {/* VWAP + SMAs + EMAs */}
          {computed.vwap  && <path clipPath="url(#cc)" d={lp(computed.vwap)}  fill="none" stroke="#fb923c" strokeWidth="1.3"/>}
          {computed.sma20 && <path clipPath="url(#cc)" d={lp(computed.sma20)} fill="none" stroke="#facc15" strokeWidth="1.2"/>}
          {computed.sma50 && <path clipPath="url(#cc)" d={lp(computed.sma50)} fill="none" stroke="#60a5fa" strokeWidth="1.2"/>}
          {computed.sma200&& <path clipPath="url(#cc)" d={lp(computed.sma200)}fill="none" stroke="#f97316" strokeWidth="1.2"/>}
          {computed.ema20 && <path clipPath="url(#cc)" d={lp(computed.ema20)} fill="none" stroke="#a78bfa" strokeWidth="1.2" strokeDasharray="4,2"/>}
          {computed.ema50 && <path clipPath="url(#cc)" d={lp(computed.ema50)} fill="none" stroke="#34d399" strokeWidth="1.2" strokeDasharray="4,2"/>}

          {/* Fibonacci */}
          {(computed.fib||[]).map((f,i)=>(
            <g key={i}>
              <line x1={0} y1={yS(f.price)} x2={cw} y2={yS(f.price)} stroke="#fbbf24" strokeWidth="0.6" strokeDasharray="4,4" opacity="0.4"/>
              {!isMobile && <text x={cw+4} y={yS(f.price)+3} fill="#fbbf2460" fontSize="9">{f.label}</text>}
            </g>
          ))}

          {/* Candles / Line */}
          <g clipPath="url(#cc)">
            {layout.chartType==="candle" ? data.map((d,i)=>{
              const isUp=d.close>=d.open, x=xS(i), top=yS(Math.max(d.open,d.close)), bot=yS(Math.min(d.open,d.close));
              return <g key={i}><line x1={x} y1={yS(d.high)} x2={x} y2={yS(d.low)} stroke={isUp?C.up:C.down} strokeWidth="1"/><rect x={x-bw/2} y={top} width={bw} height={Math.max(1,bot-top)} fill={isUp?C.up:C.down} fillOpacity="0.85"/></g>;
            }) : (() => {
              const isUp=data[data.length-1].close>=data[0].close;
              const path=data.map((d,i)=>(i===0?"M":"L")+xS(i).toFixed(1)+","+yS(d.close).toFixed(1)).join(" ");
              return <><path d={path+" L"+xS(data.length-1)+","+ch+" L0,"+ch+"Z"} fill={isUp?"url(#upG)":"url(#dnG)"}/><path d={path} fill="none" stroke={isUp?C.up:C.down} strokeWidth="1.6"/></>;
            })()}
          </g>

          {/* Crosshair */}
          {hoverIdx!==null && <>
            <line x1={xS(hoverIdx)} y1={0} x2={xS(hoverIdx)} y2={ch} stroke="#ffffff14" strokeWidth="1"/>
            {data[hoverIdx] && <line x1={0} y1={yS(data[hoverIdx].close)} x2={cw} y2={yS(data[hoverIdx].close)} stroke="#ffffff10" strokeWidth="1"/>}
          </>}
        </g>
      </svg>
    </div>
  );
}

// ─── Sub Chart ────────────────────────────────────────────────────
function SubChart({ type, data, isMobile }) {
  const W=900, H=isMobile?80:105;
  const pad={top:6,right:isMobile?4:68,bottom:16,left:isMobile?4:10};
  const cw=W-pad.left-pad.right, ch=H-pad.top-pad.bottom;
  const xS=i=>(i/Math.max(data.length-1,1))*cw;

  if (type==="rsi") {
    const rsi=TA.rsi(data);
    const yS=v=>ch-(v/100)*ch;
    const path=rsi.reduce((a,v,i)=>{ if(v==null) return a+" M"; const pt=xS(i).toFixed(1)+","+yS(v).toFixed(1); return a.endsWith(" M")?"M"+pt:a+" L"+pt; }," M").trim();
    return <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block"}}>
      <g transform={"translate("+pad.left+","+pad.top+")"}>
        {[70,50,30].map(v=><g key={v}><line x1={0} y1={yS(v)} x2={cw} y2={yS(v)} stroke={v===70?"#f8717140":v===30?"#22d3a540":C.border} strokeWidth="1" strokeDasharray="3,3"/><text x={cw+3} y={yS(v)+3} fill={C.muted} fontSize="9">{v}</text></g>)}
        <path d={path} fill="none" stroke="#a78bfa" strokeWidth="1.3"/>
        <text x={4} y={10} fill={C.muted} fontSize="9">RSI 14</text>
      </g>
    </svg>;
  }
  if (type==="macd") {
    const {line,signal,hist}=TA.macd(data);
    const all=[...line,...signal,...hist].filter(v=>v!=null);
    const mn=Math.min(...all),mx=Math.max(...all),r=mx-mn||1;
    const yS=v=>ch-((v-mn)/r)*ch, y0=yS(0);
    const mkp=arr=>arr.reduce((a,v,i)=>{ if(v==null) return a+" M"; const pt=xS(i).toFixed(1)+","+yS(v).toFixed(1); return a.endsWith(" M")?"M"+pt:a+" L"+pt; }," M").trim();
    const bw=Math.max(0.8,cw/data.length*0.55);
    return <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block"}}>
      <g transform={"translate("+pad.left+","+pad.top+")"}>
        <line x1={0} y1={y0} x2={cw} y2={y0} stroke={C.border} strokeWidth="1"/>
        {hist.map((v,i)=>v!=null&&<rect key={i} x={xS(i)-bw/2} y={Math.min(y0,yS(v))} width={bw} height={Math.abs(yS(v)-y0)} fill={v>=0?"#22d3a550":"#f8717150"}/>)}
        <path d={mkp(line)}   fill="none" stroke="#facc15" strokeWidth="1.1"/>
        <path d={mkp(signal)} fill="none" stroke="#f97316" strokeWidth="1.1"/>
        <text x={4} y={10} fill={C.muted} fontSize="9">MACD</text>
      </g>
    </svg>;
  }
  if (type==="volume") {
    const maxV=Math.max(...data.map(d=>d.volume));
    const bw=Math.max(0.5,cw/data.length*0.7);
    return <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",display:"block"}}>
      <g transform={"translate("+pad.left+","+pad.top+")"}>
        {data.map((d,i)=>{ const h=(d.volume/maxV)*ch; return <rect key={i} x={xS(i)-bw/2} y={ch-h} width={bw} height={h} fill={d.close>=d.open?C.up+"50":C.down+"50"}/>; })}
        <text x={4} y={10} fill={C.muted} fontSize="9">VOLUMEN</text>
      </g>
    </svg>;
  }
  return null;
}

// ─── Sparkline ────────────────────────────────────────────────────
function Spark({ vals, up }) {
  if (!vals||vals.length<2) return <div style={{width:60,height:20}}/>;
  const mn=Math.min(...vals),mx=Math.max(...vals),r=mx-mn||1;
  const W=60,H=20;
  const path=vals.map((v,i)=>(i===0?"M":"L")+(i/(vals.length-1)*58+1).toFixed(1)+","+(H-1-((v-mn)/r)*(H-2)).toFixed(1)).join(" ");
  return <svg viewBox={"0 0 "+W+" "+H} style={{width:W,height:H,flexShrink:0}}><path d={path} fill="none" stroke={up?C.up+"90":C.down+"90"} strokeWidth="1.4"/></svg>;
}

// ─── Stat Card ────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return <div style={{background:C.card,borderRadius:10,border:"1px solid "+C.border,padding:"10px 12px"}}>
    <div style={{color:C.muted,fontSize:10,marginBottom:3}}>{label}</div>
    <div style={{fontSize:15,color:color||C.text,fontWeight:500}}>{value}</div>
    {sub && <div style={{color:C.muted,fontSize:10,marginTop:2}}>{sub}</div>}
  </div>;
}

// ─── Indicator Pill ───────────────────────────────────────────────
function IndPill({ id, active, onToggle, small }) {
  const ind=ALL_IND.find(i=>i.id===id);
  if (!ind) return null;
  return <button onClick={()=>onToggle(id)} style={{display:"flex",alignItems:"center",gap:4,padding:small?"3px 8px":"3px 10px",borderRadius:20,cursor:"pointer",fontSize:small?10:11,border:"none",background:active?ind.color+"22":C.card,color:active?ind.color:C.muted,outline:active?"1px solid "+ind.color+"55":"1px solid "+C.border,transition:"all 0.15s",whiteSpace:"nowrap"}}>
    <span style={{width:5,height:5,borderRadius:"50%",background:active?ind.color:C.muted,flexShrink:0}}/>
    {ind.label}
  </button>;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════════
export default function FinanceMVP() {
  const isMobile = useIsMobile();

  // API Key
  const [apiKey,    setApiKey]    = useState(()=>LS.raw("apiKey")||"");
  const [keyInput,  setKeyInput]  = useState("");
  const [confirmed, setConfirmed] = useState(()=>!!LS.raw("apiKey"));

  // Layout (persisted)
  const [layout, setLayout] = useState(()=>({...DEFAULT_LAYOUT,...(LS.raw("layout")||{})}));
  const updateLayout = patch => setLayout(prev=>{ const n={...prev,...patch}; LS.raw("layout",n); return n; });
  const resetLayout  = ()   => { LS.raw("layout",DEFAULT_LAYOUT); setLayout({...DEFAULT_LAYOUT}); };

  // Favorites
  const [favorites, setFavorites] = useState(()=>LS.raw("favorites")||["AAPL","MSFT","NVDA"]);
  const saveFavs = list => { setFavorites(list); LS.raw("favorites",list); };

  // Market data
  const [symbol,  setSymbol]  = useState(()=>LS.raw("lastSymbol")||"AAPL");
  const [symMeta, setSymMeta] = useState(null);
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Search
  const [searchQ,    setSearchQ]    = useState("");
  const [searchRes,  setSearchRes]  = useState([]);
  const [searching,  setSearching]  = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimer = useRef(null);

  // Mobile nav
  const [mobileTab, setMobileTab] = useState("chart"); // chart | watchlist | indicators | settings

  // Table
  const [tablePage, setTablePage] = useState(0);
  const ROWS=15;

  // Load candles
  const loadCandles = useCallback(async (sym, interval, key) => {
    if (!key) return;
    setLoading(true); setError(null); setTablePage(0);
    try {
      const raw = await fetchCandles(sym, interval, key);
      setCandles(raw);
      LS.raw("lastSymbol", sym);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ if (confirmed&&apiKey) loadCandles(symbol,layout.timeRange,apiKey); },[symbol,layout.timeRange,confirmed]);

  // Search
  useEffect(()=>{
    if (!searchQ.trim()||searchQ.length<2) { setSearchRes([]); return; }
    clearTimeout(searchTimer.current);
    searchTimer.current=setTimeout(async()=>{ setSearching(true); try { setSearchRes(await searchSymbols(searchQ,apiKey)); } catch{} setSearching(false); },420);
  },[searchQ]);

  // Stats
  const stats = useMemo(()=>{
    if (!candles.length) return null;
    const last=candles[candles.length-1],first=candles[0];
    const chg=last.close-first.close,pct=(chg/first.close)*100;
    const rsiArr=TA.rsi(candles), rsiLast=rsiArr.slice().reverse().find(v=>v!=null);
    const avgVol=candles.reduce((s,c)=>s+c.volume,0)/candles.length;
    const vs=candles.slice(-20).map((c,i,a)=>i===0?0:Math.log(c.close/a[i-1].close));
    const annVol=Math.sqrt(vs.reduce((s,v)=>s+v*v,0)/vs.length)*Math.sqrt(252)*100;
    return {last:last.close,chg,pct,isUp:chg>=0,high:Math.max(...candles.map(c=>c.high)),low:Math.min(...candles.map(c=>c.low)),rsi:rsiLast,avgVol,annVol};
  },[candles]);

  const tableData  = useMemo(()=>[...candles].reverse(),[candles]);
  const tablePaged = tableData.slice(tablePage*ROWS,(tablePage+1)*ROWS);
  const totalPages = Math.ceil(tableData.length/ROWS);

  // ── API Key Screen ─────────────────────────────────────────────
  if (!confirmed) return (
    <div style={{background:C.bg,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'DM Mono',monospace"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{width:"100%",maxWidth:420,background:C.panel,border:"1px solid "+C.border,borderRadius:16,padding:isMobile?24:38,textAlign:"center"}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,color:C.accent,letterSpacing:3,marginBottom:4}}>MARKET·LENS</div>
        <div style={{color:C.muted,fontSize:12,marginBottom:24}}>Finanzmarkt-Client · Alpha Vantage</div>
        <input value={keyInput} onChange={e=>setKeyInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&keyInput.trim()){const k=keyInput.trim();setApiKey(k);LS.raw("apiKey",k);setConfirmed(true);}}}
          placeholder="API-Key eingeben …"
          style={{width:"100%",background:"#0d1520",border:"1px solid "+C.border2,borderRadius:8,color:C.text,padding:"11px 14px",fontFamily:"inherit",fontSize:13,outline:"none",marginBottom:10,WebkitAppearance:"none"}}
        />
        <button onClick={()=>{const k=keyInput.trim();if(!k)return;setApiKey(k);LS.raw("apiKey",k);setConfirmed(true);}}
          style={{width:"100%",background:C.accent,color:"#060b11",border:"none",borderRadius:8,padding:11,fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:2,cursor:"pointer"}}>
          VERBINDEN
        </button>
        <div style={{color:C.muted,fontSize:10,marginTop:12}}>Kostenloser Key auf alphavantage.co · 25 req/Tag</div>
      </div>
    </div>
  );

  // ── DESKTOP Layout ─────────────────────────────────────────────
  if (!isMobile) return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Mono','Fira Code',monospace",fontSize:13,display:"flex",flexDirection:"column"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:#0a0f16;}::-webkit-scrollbar-thumb{background:#1e2530;border-radius:4px;}
        .btn{cursor:pointer;border:none;outline:none;transition:all 0.15s;font-family:inherit;}.btn:hover{opacity:0.76;}
        .tr:hover>td{background:#0d1520!important;}
        .fade{animation:fi 0.25s ease;}@keyframes fi{from{opacity:0;transform:translateY(3px);}to{opacity:1;transform:translateY(0);}}
      `}</style>

      {/* Header */}
      <div style={{borderBottom:"1px solid "+C.border,padding:"0 14px",height:46,display:"flex",alignItems:"center",gap:10,background:C.panel,flexShrink:0}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:C.accent,letterSpacing:3}}>MARKET·LENS</div>
        <div style={{width:1,height:20,background:C.border}}/>

        {/* Search */}
        <div style={{position:"relative"}}>
          <input value={searchQ} onChange={e=>{setSearchQ(e.target.value);setSearchOpen(true);}} onFocus={()=>setSearchOpen(true)} onBlur={()=>setTimeout(()=>setSearchOpen(false),200)}
            placeholder="Symbol / Name …"
            style={{background:"#0d1520",border:"1px solid "+C.border2,borderRadius:7,color:C.text,padding:"5px 14px 5px 30px",width:240,outline:"none",fontFamily:"inherit",fontSize:12}}/>
          <span style={{position:"absolute",left:8,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:14}}>⌕</span>
          {searching&&<span style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:10}}>…</span>}
          {searchOpen&&(searchRes.length>0||searchQ.length>1)&&(
            <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,width:310,background:C.panel,border:"1px solid "+C.border,borderRadius:8,zIndex:200,boxShadow:"0 8px 32px #000a"}}>
              {searchRes.length===0?<div style={{padding:"10px 14px",color:C.muted,fontSize:12}}>Keine Ergebnisse</div>
              :searchRes.slice(0,8).map(s=>(
                <div key={s.symbol} onMouseDown={()=>{setSymbol(s.symbol);setSymMeta(s);setSearchQ("");setSearchOpen(false);}}
                  style={{padding:"8px 14px",cursor:"pointer",display:"flex",gap:8,alignItems:"center",borderBottom:"1px solid "+C.border}}
                  onMouseEnter={e=>e.currentTarget.style.background="#131d28"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{color:C.accent,minWidth:52,fontWeight:500}}>{s.symbol}</span>
                  <span style={{color:"#8899aa",flex:1,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
                  <span style={{fontSize:10,color:C.muted,background:"#12191f",padding:"1px 6px",borderRadius:4}}>{s.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{flex:1}}/>

        {/* Interval */}
        <div style={{display:"flex",background:C.card,borderRadius:7,padding:2,border:"1px solid "+C.border}}>
          {INTERVALS.map(iv=><button key={iv} className="btn" onClick={()=>updateLayout({timeRange:iv})} style={{padding:"3px 8px",borderRadius:5,background:layout.timeRange===iv?"#1e2a40":"transparent",color:layout.timeRange===iv?C.accent:C.muted,fontSize:11}}>{IV_LABEL[iv]}</button>)}
        </div>

        {/* Chart type */}
        <div style={{display:"flex",background:C.card,borderRadius:7,padding:2,border:"1px solid "+C.border}}>
          {[["candle","🕯 Kerze"],["line","📈 Linie"]].map(([t,l])=><button key={t} className="btn" onClick={()=>updateLayout({chartType:t})} style={{padding:"3px 10px",borderRadius:5,background:layout.chartType===t?"#1e2a40":"transparent",color:layout.chartType===t?C.text:C.muted,fontSize:11}}>{l}</button>)}
        </div>
        <button className="btn" onClick={resetLayout} style={{padding:"4px 10px",borderRadius:7,background:C.card,border:"1px solid "+C.border,color:C.muted,fontSize:11}}>↺ Reset</button>
        <button className="btn" onClick={()=>{LS.del("apiKey");setConfirmed(false);setApiKey("");}} style={{padding:"4px 10px",borderRadius:7,background:"#1a0f10",border:"1px solid #3a1a1a",color:"#f87171",fontSize:11}}>⏏ API Key</button>
      </div>

      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {/* Sidebar */}
        <div style={{width:188,borderRight:"1px solid "+C.border,display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>
          <div style={{padding:"9px 12px 5px",color:C.muted,fontSize:10,letterSpacing:1}}>★ FAVORITEN</div>
          <div style={{flex:1,overflowY:"auto"}}>
            {favorites.map(sym=>{
              const d=LS.get("av_"+sym+"_1D");
              const pts=d?d.slice(-30).map(c=>c.close):[];
              const last=pts[pts.length-1], prev=pts[pts.length-2];
              const chg=last&&prev?((last-prev)/prev)*100:null;
              return (
                <div key={sym} onClick={()=>setSymbol(sym)} style={{padding:"7px 12px",cursor:"pointer",borderLeft:sym===symbol?"2px solid "+C.up:"2px solid transparent",background:sym===symbol?"#0d1520":"transparent"}}
                  onMouseEnter={e=>sym!==symbol&&(e.currentTarget.style.background="#0a1018")}
                  onMouseLeave={e=>sym!==symbol&&(e.currentTarget.style.background="transparent")}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:4}}>
                    <span style={{color:sym===symbol?C.up:"#c0cce0",fontSize:12,fontWeight:sym===symbol?500:400}}>{sym}</span>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      {chg!==null&&<span style={{color:chg>=0?C.up:C.down,fontSize:10}}>{chg>=0?"+":""}{chg.toFixed(1)}%</span>}
                      <span onClick={e=>{e.stopPropagation();saveFavs(favorites.filter(f=>f!==sym));}} style={{color:C.muted,fontSize:11,opacity:0.5}}>✕</span>
                    </div>
                  </div>
                  {last&&<div style={{color:"#7a8a9a",fontSize:10,marginTop:1}}>{last.toFixed(last>=100?1:2)}</div>}
                  <Spark vals={pts} up={chg>=0}/>
                </div>
              );
            })}
            {favorites.length===0&&<div style={{padding:"10px 12px",color:C.muted,fontSize:11}}>Keine Favoriten</div>}
          </div>
        </div>

        {/* Main */}
        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
          {/* Title */}
          <div style={{padding:"10px 16px 0",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,letterSpacing:2}}>{symbol}</div>
            {symMeta&&<span style={{color:C.muted,fontSize:12,flex:1}}>{symMeta.name}</span>}
            {!symMeta&&<div style={{flex:1}}/>}
            {stats&&<div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,letterSpacing:1}}>{stats.last.toFixed(stats.last>=1000?0:2)}<span style={{fontSize:13,color:C.muted,marginLeft:6}}>{symMeta?.currency||""}</span></div>
              <div style={{color:stats.isUp?C.up:C.down,fontSize:13}}>{stats.isUp?"▲":"▼"} {Math.abs(stats.chg).toFixed(2)} ({stats.isUp?"+":""}{stats.pct.toFixed(2)}%)</div>
            </div>}
            <button className="btn" onClick={()=>favorites.includes(symbol)?saveFavs(favorites.filter(f=>f!==symbol)):saveFavs([...favorites,symbol])}
              style={{padding:"5px 12px",borderRadius:8,background:favorites.includes(symbol)?"#162018":C.card,border:"1px solid "+(favorites.includes(symbol)?"#22d3a540":C.border),color:favorites.includes(symbol)?C.up:C.muted,fontSize:12}}>
              {favorites.includes(symbol)?"★ Gespeichert":"☆ Favorit"}
            </button>
          </div>

          {/* Indicator toolbar */}
          <div style={{padding:"8px 16px",display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            {ALL_IND.filter(i=>!["rsi","macd"].includes(i.id)).map(ind=>(
              <IndPill key={ind.id} id={ind.id} active={layout.activeIndicators.includes(ind.id)} onToggle={id=>updateLayout({activeIndicators:layout.activeIndicators.includes(id)?layout.activeIndicators.filter(i=>i!==id):[...layout.activeIndicators,id]})}/>
            ))}
            <div style={{width:1,height:18,background:C.border,margin:"0 3px"}}/>
            {["none","rsi","macd","volume"].map(t=>(
              <button key={t} className="btn" onClick={()=>updateLayout({subChart:t})} style={{padding:"3px 10px",borderRadius:20,fontSize:11,border:"1px solid "+C.border,background:layout.subChart===t?"#1e2a40":C.card,color:layout.subChart===t?C.text:C.muted}}>
                {t==="none"?"— Sub":t.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div style={{padding:"0 16px 8px",flexShrink:0}}>
            {loading&&<div style={{height:280,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:12}}>Lade Marktdaten …</div>}
            {error&&<div style={{height:200,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}><div style={{color:C.down,fontSize:13}}>⚠ {error}</div><button className="btn" onClick={()=>loadCandles(symbol,layout.timeRange,apiKey)} style={{padding:"5px 14px",background:C.card,border:"1px solid "+C.border,borderRadius:7,color:C.muted,fontSize:12}}>Erneut versuchen</button></div>}
            {!loading&&!error&&candles.length>0&&(
              <div style={{background:C.panel,borderRadius:12,border:"1px solid "+C.border,overflow:"hidden"}} className="fade">
                <CandleChart data={candles} layout={layout} isMobile={false}/>
                {layout.subChart!=="none"&&<div style={{borderTop:"1px solid "+C.border}}><SubChart type={layout.subChart} data={candles} isMobile={false}/></div>}
              </div>
            )}
          </div>

          {/* Stats */}
          {stats&&<div style={{padding:"0 16px 12px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(135px,1fr))",gap:8}}>
            <StatCard label="Aktuell" value={stats.last.toFixed(2)}/>
            <StatCard label="Rendite (Range)" value={(stats.pct>=0?"+":"")+stats.pct.toFixed(2)+"%"} color={stats.isUp?C.up:C.down}/>
            <StatCard label="Hoch" value={stats.high.toFixed(2)} color={C.up}/>
            <StatCard label="Tief" value={stats.low.toFixed(2)} color={C.down}/>
            <StatCard label="RSI 14" value={stats.rsi?stats.rsi.toFixed(1):"–"} color={stats.rsi>70?C.down:stats.rsi<30?C.up:C.text} sub={stats.rsi>70?"Überkauft":stats.rsi<30?"Überverkauft":"Neutral"}/>
            <StatCard label="Ø Volumen" value={(stats.avgVol/1e6).toFixed(1)+"M"}/>
            <StatCard label="Ann. Volatilität" value={stats.annVol.toFixed(1)+"%"}/>
            <StatCard label="Kerzen" value={candles.length.toString()} sub={layout.timeRange}/>
          </div>}

          {/* Table */}
          {candles.length>0&&<div style={{padding:"0 16px 24px"}}>
            <div style={{background:C.panel,borderRadius:12,border:"1px solid "+C.border,overflow:"hidden"}}>
              <div style={{padding:"9px 14px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:10}}>
                <span style={{color:C.muted,fontSize:10,letterSpacing:1}}>KURSVERLAUF · OHLCV</span>
                <div style={{flex:1}}/>
                <span style={{color:C.muted,fontSize:11}}>{tablePage+1} / {totalPages}</span>
                <button className="btn" disabled={tablePage===0} onClick={()=>setTablePage(p=>p-1)} style={{padding:"2px 9px",borderRadius:5,background:C.card,border:"1px solid "+C.border,color:C.muted,fontSize:11,opacity:tablePage===0?0.3:1}}>←</button>
                <button className="btn" disabled={tablePage>=totalPages-1} onClick={()=>setTablePage(p=>p+1)} style={{padding:"2px 9px",borderRadius:5,background:C.card,border:"1px solid "+C.border,color:C.muted,fontSize:11,opacity:tablePage>=totalPages-1?0.3:1}}>→</button>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr style={{borderBottom:"1px solid "+C.border}}>{["Datum","Eröffnung","Hoch","Tief","Schluss","Änderung","Volumen"].map(h=><th key={h} style={{padding:"7px 12px",textAlign:"right",color:C.muted,fontSize:10,fontWeight:400,whiteSpace:"nowrap"}}>{h}</th>)}</tr></thead>
                  <tbody>{tablePaged.map((d,i)=>{ const cp=((d.close-d.open)/d.open)*100; return (
                    <tr key={i} className="tr" style={{borderBottom:"1px solid #0d1520"}}>
                      <td style={{padding:"7px 12px",color:C.muted}}>{d.date.toLocaleDateString("de-DE")}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:"#8899aa"}}>{d.open?.toFixed(2)}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:C.up}}>{d.high?.toFixed(2)}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:C.down}}>{d.low?.toFixed(2)}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",fontWeight:500}}>{d.close?.toFixed(2)}</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:cp>=0?C.up:C.down}}>{cp>=0?"+":""}{cp.toFixed(2)}%</td>
                      <td style={{padding:"7px 12px",textAlign:"right",color:C.muted}}>{d.volume>0?(d.volume/1e6).toFixed(2)+"M":"–"}</td>
                    </tr>
                  );})}</tbody>
                </table>
              </div>
            </div>
          </div>}
        </div>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  //  MOBILE Layout
  // ══════════════════════════════════════════════════════════════
  const toggleInd = id => updateLayout({activeIndicators:layout.activeIndicators.includes(id)?layout.activeIndicators.filter(i=>i!==id):[...layout.activeIndicators,id]});

  return (
    <div style={{background:C.bg,height:"100dvh",color:C.text,fontFamily:"'DM Mono',monospace",fontSize:13,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        ::-webkit-scrollbar{display:none;}
        .btn{cursor:pointer;border:none;outline:none;transition:all 0.15s;font-family:inherit;}
        .fade{animation:fi 0.2s ease;}@keyframes fi{from{opacity:0;}to{opacity:1;}}
      `}</style>

      {/* Mobile Header */}
      <div style={{background:C.panel,borderBottom:"1px solid "+C.border,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexShrink:0,paddingTop:"max(10px, env(safe-area-inset-top))"}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:C.accent,letterSpacing:2}}>MARKET·LENS</div>
        <div style={{flex:1}}/>
        {/* Inline search */}
        <div style={{position:"relative",flex:1,maxWidth:200}}>
          <input value={searchQ} onChange={e=>{setSearchQ(e.target.value);setSearchOpen(true);}} onFocus={()=>setSearchOpen(true)} onBlur={()=>setTimeout(()=>setSearchOpen(false),200)}
            placeholder="Symbol suchen …"
            style={{width:"100%",background:"#0d1520",border:"1px solid "+C.border2,borderRadius:8,color:C.text,padding:"6px 12px 6px 28px",outline:"none",fontFamily:"inherit",fontSize:12,WebkitAppearance:"none"}}/>
          <span style={{position:"absolute",left:7,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:13}}>⌕</span>
          {searchOpen&&(searchRes.length>0||searchQ.length>1)&&(
            <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,left:0,background:C.panel,border:"1px solid "+C.border,borderRadius:8,zIndex:300,boxShadow:"0 8px 32px #000c",minWidth:260}}>
              {searchRes.length===0?<div style={{padding:"10px 12px",color:C.muted,fontSize:12}}>Keine Ergebnisse</div>
              :searchRes.slice(0,6).map(s=>(
                <div key={s.symbol} onMouseDown={()=>{setSymbol(s.symbol);setSymMeta(s);setSearchQ("");setSearchOpen(false);setMobileTab("chart");}}
                  style={{padding:"10px 12px",cursor:"pointer",display:"flex",gap:8,alignItems:"center",borderBottom:"1px solid "+C.border}}>
                  <span style={{color:C.accent,minWidth:50,fontWeight:500,fontSize:12}}>{s.symbol}</span>
                  <span style={{color:"#8899aa",flex:1,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Symbol + Price bar */}
      <div style={{background:C.panel,padding:"8px 14px 10px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:1,lineHeight:1}}>{symbol}</div>
          {symMeta&&<div style={{color:C.muted,fontSize:10,marginTop:1,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{symMeta.name}</div>}
        </div>
        <div style={{flex:1}}/>
        {stats&&<div style={{textAlign:"right"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:0.5}}>{stats.last.toFixed(stats.last>=1000?0:2)}</div>
          <div style={{color:stats.isUp?C.up:C.down,fontSize:12}}>{stats.isUp?"▲":"▼"} {Math.abs(stats.pct).toFixed(2)}%</div>
        </div>}
        <button className="btn" onClick={()=>favorites.includes(symbol)?saveFavs(favorites.filter(f=>f!==symbol)):saveFavs([...favorites,symbol])}
          style={{padding:"6px 10px",borderRadius:8,background:favorites.includes(symbol)?"#162018":C.card,border:"1px solid "+(favorites.includes(symbol)?"#22d3a540":C.border),color:favorites.includes(symbol)?C.up:C.muted,fontSize:16}}>
          {favorites.includes(symbol)?"★":"☆"}
        </button>
      </div>

      {/* Mobile Content Area */}
      <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>

        {/* CHART TAB */}
        {mobileTab==="chart"&&(
          <div className="fade">
            {/* Interval selector */}
            <div style={{display:"flex",gap:0,background:C.panel,borderBottom:"1px solid "+C.border,overflowX:"auto"}}>
              {INTERVALS.map(iv=><button key={iv} className="btn" onClick={()=>updateLayout({timeRange:iv})} style={{padding:"9px 12px",flexShrink:0,background:"transparent",color:layout.timeRange===iv?C.accent:C.muted,fontSize:12,borderBottom:layout.timeRange===iv?"2px solid "+C.accent:"2px solid transparent"}}>
                {IV_LABEL[iv]}
              </button>)}
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:0}}>
                {[["candle","🕯"],["line","📈"]].map(([t,l])=><button key={t} className="btn" onClick={()=>updateLayout({chartType:t})} style={{padding:"9px 10px",background:"transparent",color:layout.chartType===t?C.text:C.muted,fontSize:14,borderBottom:layout.chartType===t?"2px solid "+C.text:"2px solid transparent"}}>{l}</button>)}
              </div>
            </div>

            {/* Chart */}
            {loading&&<div style={{height:220,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:12}}>Lade …</div>}
            {error&&<div style={{height:160,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,padding:16}}><div style={{color:C.down,fontSize:13,textAlign:"center"}}>⚠ {error}</div><button className="btn" onClick={()=>loadCandles(symbol,layout.timeRange,apiKey)} style={{padding:"6px 14px",background:C.card,border:"1px solid "+C.border,borderRadius:7,color:C.muted,fontSize:12}}>Erneut versuchen</button></div>}
            {!loading&&!error&&candles.length>0&&(
              <div style={{background:C.panel,margin:"10px 10px 0",borderRadius:10,border:"1px solid "+C.border,overflow:"hidden"}}>
                <CandleChart data={candles} layout={layout} isMobile={true}/>
                {layout.subChart!=="none"&&<div style={{borderTop:"1px solid "+C.border}}><SubChart type={layout.subChart} data={candles} isMobile={true}/></div>}
              </div>
            )}

            {/* Sub chart selector */}
            <div style={{display:"flex",gap:6,padding:"10px 10px 0",overflowX:"auto"}}>
              {["none","rsi","macd","volume"].map(t=><button key={t} className="btn" onClick={()=>updateLayout({subChart:t})} style={{padding:"4px 12px",borderRadius:20,fontSize:11,border:"1px solid "+C.border,background:layout.subChart===t?"#1e2a40":C.card,color:layout.subChart===t?C.text:C.muted,flexShrink:0}}>{t==="none"?"— Sub":t.toUpperCase()}</button>)}
            </div>

            {/* Stats grid */}
            {stats&&<div style={{padding:"10px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              <StatCard label="Aktuell" value={stats.last.toFixed(2)}/>
              <StatCard label="Rendite" value={(stats.pct>=0?"+":"")+stats.pct.toFixed(2)+"%"} color={stats.isUp?C.up:C.down}/>
              <StatCard label="Hoch" value={stats.high.toFixed(stats.high>=1000?0:2)} color={C.up}/>
              <StatCard label="Tief" value={stats.low.toFixed(stats.low>=1000?0:2)} color={C.down}/>
              <StatCard label="RSI 14" value={stats.rsi?stats.rsi.toFixed(1):"–"} color={stats.rsi>70?C.down:stats.rsi<30?C.up:C.text} sub={stats.rsi>70?"Überkauft":stats.rsi<30?"Überverkauft":"Neutral"}/>
              <StatCard label="Volatilität" value={stats.annVol.toFixed(1)+"%"}/>
            </div>}

            {/* OHLCV Table mobile */}
            {candles.length>0&&<div style={{padding:"0 10px 16px"}}>
              <div style={{background:C.panel,borderRadius:10,border:"1px solid "+C.border,overflow:"hidden"}}>
                <div style={{padding:"8px 12px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:C.muted,fontSize:10,letterSpacing:1}}>OHLCV</span>
                  <div style={{flex:1}}/>
                  <span style={{color:C.muted,fontSize:11}}>{tablePage+1}/{totalPages}</span>
                  <button className="btn" disabled={tablePage===0} onClick={()=>setTablePage(p=>p-1)} style={{padding:"3px 10px",borderRadius:5,background:C.card,border:"1px solid "+C.border,color:C.muted,fontSize:12,opacity:tablePage===0?0.3:1}}>←</button>
                  <button className="btn" disabled={tablePage>=totalPages-1} onClick={()=>setTablePage(p=>p+1)} style={{padding:"3px 10px",borderRadius:5,background:C.card,border:"1px solid "+C.border,color:C.muted,fontSize:12,opacity:tablePage>=totalPages-1?0.3:1}}>→</button>
                </div>
                {tablePaged.map((d,i)=>{ const cp=((d.close-d.open)/d.open)*100; return (
                  <div key={i} style={{padding:"9px 12px",borderBottom:"1px solid #0c1520",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{minWidth:72,color:C.muted,fontSize:11}}>{d.date.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})}</div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",gap:10,fontSize:12}}>
                        <span style={{color:"#8899aa"}}>O:{d.open?.toFixed(2)}</span>
                        <span style={{color:C.up}}>H:{d.high?.toFixed(2)}</span>
                        <span style={{color:C.down}}>L:{d.low?.toFixed(2)}</span>
                      </div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>Vol: {d.volume>0?(d.volume/1e6).toFixed(1)+"M":"–"}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:500,fontSize:13}}>{d.close?.toFixed(2)}</div>
                      <div style={{color:cp>=0?C.up:C.down,fontSize:11}}>{cp>=0?"+":""}{cp.toFixed(2)}%</div>
                    </div>
                  </div>
                );})}
              </div>
            </div>}
          </div>
        )}

        {/* WATCHLIST TAB */}
        {mobileTab==="watchlist"&&(
          <div className="fade" style={{padding:"10px 0"}}>
            <div style={{padding:"4px 14px 8px",color:C.muted,fontSize:10,letterSpacing:1}}>FAVORITEN</div>
            {favorites.length===0&&<div style={{padding:"20px 14px",color:C.muted,fontSize:12,textAlign:"center"}}>Suche nach Symbolen und tippe auf ☆</div>}
            {favorites.map(sym=>{
              const d=LS.get("av_"+sym+"_1D");
              const pts=d?d.slice(-30).map(c=>c.close):[];
              const last=pts[pts.length-1],prev=pts[pts.length-2];
              const chg=last&&prev?((last-prev)/prev)*100:null;
              return (
                <div key={sym} onClick={()=>{setSymbol(sym);setMobileTab("chart");}}
                  style={{padding:"12px 14px",borderBottom:"1px solid "+C.border,display:"flex",alignItems:"center",gap:12,cursor:"pointer",background:sym===symbol?"#0d1520":"transparent"}}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:sym===symbol?C.up:C.text,fontWeight:500,fontSize:14}}>{sym}</span>
                    </div>
                    {last&&<div style={{color:C.muted,fontSize:11,marginTop:2}}>Letzter: {last.toFixed(last>=100?1:2)}</div>}
                  </div>
                  <Spark vals={pts} up={chg>=0}/>
                  <div style={{textAlign:"right",minWidth:56}}>
                    {chg!==null&&<div style={{color:chg>=0?C.up:C.down,fontSize:13,fontWeight:500}}>{chg>=0?"+":""}{chg.toFixed(2)}%</div>}
                    <button className="btn" onClick={e=>{e.stopPropagation();saveFavs(favorites.filter(f=>f!==sym));}} style={{color:C.muted,fontSize:11,background:"none",marginTop:2,opacity:0.5}}>Entfernen</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* INDICATORS TAB */}
        {mobileTab==="indicators"&&(
          <div className="fade" style={{padding:14}}>
            {[
              {group:"Trend",    ids:["sma20","sma50","sma200","ema20","ema50","ichimoku"]},
              {group:"Volat.",   ids:["bb"]},
              {group:"Volumen",  ids:["vwap"]},
              {group:"Sonstige", ids:["fib"]},
              {group:"Sub-Chart",ids:["rsi","macd"]},
            ].map(({group,ids})=>(
              <div key={group} style={{marginBottom:16}}>
                <div style={{color:C.muted,fontSize:10,letterSpacing:1,marginBottom:8}}>{group.toUpperCase()}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {ids.map(id=>{
                    if (["rsi","macd"].includes(id)) {
                      const active=layout.subChart===id;
                      const ind=ALL_IND.find(i=>i.id===id);
                      return <button key={id} onClick={()=>updateLayout({subChart:active?"none":id})} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,cursor:"pointer",fontSize:12,border:"none",background:active?ind.color+"22":C.card,color:active?ind.color:C.muted,outline:active?"1px solid "+ind.color+"55":"1px solid "+C.border}}>
                        <span style={{width:7,height:7,borderRadius:"50%",background:active?ind.color:C.muted}}/>
                        {ind.label}
                      </button>;
                    }
                    const ind=ALL_IND.find(i=>i.id===id);
                    const active=layout.activeIndicators.includes(id);
                    return <button key={id} onClick={()=>toggleInd(id)} style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,cursor:"pointer",fontSize:12,border:"none",background:active?ind.color+"22":C.card,color:active?ind.color:C.muted,outline:active?"1px solid "+ind.color+"55":"1px solid "+C.border}}>
                      <span style={{width:7,height:7,borderRadius:"50%",background:active?ind.color:C.muted}}/>
                      {ind.label}
                    </button>;
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS TAB */}
        {mobileTab==="settings"&&(
          <div className="fade" style={{padding:14}}>
            <div style={{color:C.muted,fontSize:10,letterSpacing:1,marginBottom:12}}>EINSTELLUNGEN</div>
            <div style={{background:C.panel,borderRadius:12,border:"1px solid "+C.border,overflow:"hidden"}}>
              <div style={{padding:"14px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:13}}>Layout zurücksetzen</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>Indikatoren, Charttyp, Zeitraum</div></div>
                <button className="btn" onClick={resetLayout} style={{padding:"6px 14px",borderRadius:8,background:"#1a2030",border:"1px solid "+C.border,color:C.muted,fontSize:12}}>↺ Reset</button>
              </div>
              <div style={{padding:"14px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:13}}>Cache leeren</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>Gespeicherte Kursdaten löschen</div></div>
                <button className="btn" onClick={()=>{Object.keys(localStorage).filter(k=>k.startsWith("av_")).forEach(k=>localStorage.removeItem(k));alert("Cache geleert!");}} style={{padding:"6px 14px",borderRadius:8,background:"#1a2030",border:"1px solid "+C.border,color:C.muted,fontSize:12}}>🗑 Leeren</button>
              </div>
              <div style={{padding:"14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:13}}>API Key ändern</div><div style={{color:C.muted,fontSize:11,marginTop:2}}>Alpha Vantage Key</div></div>
                <button className="btn" onClick={()=>{LS.del("apiKey");setConfirmed(false);setApiKey("");}} style={{padding:"6px 14px",borderRadius:8,background:"#1a0f10",border:"1px solid #3a1a1a",color:"#f87171",fontSize:12}}>⏏ Abmelden</button>
              </div>
            </div>
            <div style={{marginTop:16,color:C.muted,fontSize:10,textAlign:"center"}}>MARKET·LENS · Alpha Vantage · Free: 25 req/Tag</div>
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      <div style={{background:C.panel,borderTop:"1px solid "+C.border,display:"flex",flexShrink:0,paddingBottom:"env(safe-area-inset-bottom)"}}>
        {[
          {id:"chart",     icon:"📈", label:"Chart"},
          {id:"watchlist", icon:"★",  label:"Watchlist"},
          {id:"indicators",icon:"⚙",  label:"Indikatoren"},
          {id:"settings",  icon:"☰",  label:"Einstellungen"},
        ].map(tab=>(
          <button key={tab.id} className="btn" onClick={()=>setMobileTab(tab.id)}
            style={{flex:1,padding:"10px 4px 8px",background:"transparent",color:mobileTab===tab.id?C.accent:C.muted,display:"flex",flexDirection:"column",alignItems:"center",gap:2,fontSize:tab.icon==="★"?18:16,borderTop:mobileTab===tab.id?"2px solid "+C.accent:"2px solid transparent"}}>
            <span>{tab.icon}</span>
            <span style={{fontSize:9,letterSpacing:0.3}}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
