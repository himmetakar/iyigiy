// Gardırop: askıdaki fermuarlı kılıflar, kombin detayı ve parça penceresi.
// Ana sayfa (index.html) ve kişisel mağaza sayfası (magaza.html) ortak kullanır.
// Sayfa, #room/#hint/#back/#dp/#pm işaretlemesini içermeli ve css/wardrobe.css'i yüklemelidir.
import { addToCart, pairingText, loadKombinImage, WORLDS, WORLD_FABRIC } from './app.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)), lerp=(a,b,t)=>a+(b-a)*t;
const tl=n=>'₺'+n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
const body=document.body, S=v=>{body.dataset.s=v};
const GOLD='#c9a45c';
const OPT={bag:.56,sizeIdx:()=>2,loadImage:loadKombinImage};

/* Firestore kombinlerini gardırop biçimine çevirir. */
const toPc=p=>({k:p.id,n:p.name,f:+p.price||0,s:p.sizes?.length?p.sizes:['Tek beden'],imgs:p.images||[]});
export function toWardrobeItems(kombins,products){
  return kombins.map(k=>({id:k.id,g:k.gender,world:WORLDS[k.world]||'',fab:WORLD_FABRIC[k.world]||'pamuk',name:k.name,occ:k.occ||'',d:k.desc||'',
    styles:k.styles||[],productIds:k.productIds,_raw:k,
    p:k.productIds.map(id=>products[id]).filter(Boolean).map(toPc),
    x:(k.extraIds||[]).map(id=>products[id]).filter(Boolean).map(toPc)}));
}
/* list: toWardrobeItems çıktısı; opts: {bag: kılıf yüksekliği (ekran oranı), sizeIdx: ()=>0..4, loadImage: k=>Promise<src>} */
export function hangWardrobe(list,opts={}){ Object.assign(OPT,opts); PICKS=list; build(); }
/* ---------- askılık ---------- */
const stage=$('#stage'); let items=[],vw,vh,bH,bW,gap,ox=0,oxT=0,vel=0,sel=null,mobile,total=0;
/* Tek askı çizimi: kanca halkasının merkezi (50,10) raya oturur. Kılıflarda yalnızca kanca görünür. */
/* Kancanın ucu (sol yarı) rayın arkasında kalır; ön yarısının kopyası rayın önüne çizilir. */
let hid=0;
function hookSVG(s,full,front){
  const sw=(4.2/s).toFixed(2), id='hc'+(hid++);
  const hook=`<path d="M42.5 12.5a7.5 7.5 0 1 1 15 -2.5c0 5 -7.5 6 -7.5 11.5V${full?29:40}" fill="none" stroke="url(#${id}g)" stroke-width="${sw}" stroke-linecap="round"/>`;
  return `<svg class="hook" width="${(100*s).toFixed(1)}" height="${(60*s).toFixed(1)}" viewBox="0 0 100 60" style="top:${(-10*s).toFixed(1)}px">
   <defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#8a6a32"/><stop offset=".45" stop-color="#f2dca0"/><stop offset="1" stop-color="#a8853f"/></linearGradient>
   <clipPath id="${id}c"><rect x="50" y="-5" width="60" height="70"/></clipPath></defs>
   ${front?`<g clip-path="url(#${id}c)">${hook}</g>`:hook}
   ${full&&!front?`<path d="M50 29L94 51.5Q99 57 92.5 57.5H7.5Q1 57 6 51.5Z" fill="none" stroke="${GOLD}" stroke-width="${sw}" stroke-linejoin="round"/>`:''}</svg>`;
}
let PICKS=[];
function build(){
  const seq=['e',...PICKS,'e','e'];
  stage.innerHTML=''; $('#fronts').innerHTML=''; items=seq.map(k=>{
    const el=document.createElement('div'); const it={el,k:k==='e'?null:k,a:0,va:0,cx:0,cs:1,p:0,pT:0,_p:-1};
    if(!it.k){el.className='it empty';}
    else{ el.className='it bag'; const tot=k.p.reduce((s,x)=>s+x.f,0);
      el.innerHTML=`<div class="body">
        <img class="inside" alt="" draggable="false"><div class="dark"></div>
        <div class="flap l" style="background-image:url(/assets/img/bag2-${k.fab}.jpg)"><span class="wl">${k.world}</span></div>
        <div class="flap r" style="background-image:url(/assets/img/bag2-${k.fab}.jpg)"></div>
        <svg class="teeth">
          <path class="tpL" fill="none" stroke="#0a0907" stroke-width="7" stroke-linejoin="round" opacity=".85"/>
          <path class="tpR" fill="none" stroke="#0a0907" stroke-width="7" stroke-linejoin="round" opacity=".85"/>
          <path class="tL" fill="none" stroke="${GOLD}" stroke-width="6" stroke-dasharray="2.4 2.6"/>
          <path class="tR" fill="none" stroke="${GOLD}" stroke-width="6" stroke-dasharray="2.4 2.6" stroke-dashoffset="2.5"/>
          <path class="hL" fill="none" stroke="#f6e6b4" stroke-width="1.4" stroke-dasharray="2.4 2.6" opacity=".85"/>
          <path class="hR" fill="none" stroke="#f6e6b4" stroke-width="1.4" stroke-dasharray="2.4 2.6" stroke-dashoffset="2.5" opacity=".85"/>
        </svg>
        <div class="rim"></div>
        <div class="pull"><i></i><b></b></div></div>
        <div class="cap"><span class="lab">${k.world} · ${k.occ}</span><b>${tl(tot)}</b></div>`;
      const q=s=>el.querySelector(s);
      Object.assign(it,{fl:q('.flap.l'),fr:q('.flap.r'),svg:q('svg.teeth'),tpL:q('.tpL'),tpR:q('.tpR'),tL:q('.tL'),tR:q('.tR'),hL:q('.hL'),hR:q('.hR'),
        pull:q('.pull'),dark:q('.dark'),body:q('.body')});
      bindPull(it); setPull(it);
      OPT.loadImage(k._raw).then(src=>{ q('.inside').src=src||(k.p[0]?.imgs?.[0]||''); }); }
    stage.appendChild(el); return it; });
  layout();
}
function layout(){
  vw=innerWidth;vh=innerHeight;mobile=vw<860;
  bH=Math.round(vh*OPT.bag);bW=Math.round(bH*9/16);gap=Math.round(bW*(mobile?.16:.3));
  let x=0; items.forEach(it=>{
    const w=it.k?bW:Math.round(bW*.72), s=it.k?bW*.4/100:w/100;
    it.w=w; it.x=x+w/2; x+=w+gap;
    it.el.style.width=w+'px'; it.el.style.marginLeft=(-w/2)+'px';
    const old=it.el.querySelector('.hook'); if(old) old.remove();
    it.el.insertAdjacentHTML('afterbegin',hookSVG(s,!it.k,false));
    if(!it.front){it.front=document.createElement('div');it.front.className='fh';$('#fronts').appendChild(it.front);}
    it.front.style.width=w+'px'; it.front.style.marginLeft=(-w/2)+'px'; it.front.innerHTML=hookSVG(s,!it.k,true);
    if(it.k){ it.el.style.paddingTop=(27*s)+'px'; it.body.style.height=bH+'px';
      it.svg.setAttribute('width',bW); it.svg.setAttribute('height',bH); it.svg.setAttribute('viewBox',`0 0 ${bW} ${bH}`); zip(it,it.p,true); }
    else it.el.style.height=(50*s)+'px';
  });
  const bags=items.filter(i=>i.k); const mid=bags.length?bags[Math.floor((bags.length-1)/2)].x:(x-gap)/2;
  total=x-gap; oxT=ox=vw/2-mid; items.forEach(it=>{it.cx=it.x+ox});
}
addEventListener('resize',()=>{if(items.length)layout()});

/* fermuar: p 0..1 (0 kapalı, 1 tamamen açık) */
function zip(it,p,force){ if(!force&&Math.abs(p-it._p)<.0008)return; it._p=p;
  const z=2+p*92, O=p*34, N=14; let L='0% 0%',R='100% 0%'; const pl=[],pr=[];
  for(let i=0;i<=N;i++){const t=i/N,y=t*z,o=O*Math.pow(1-t,.75),xl=50-o,xr=50+o;
    L+=`,${xl.toFixed(2)}% ${y.toFixed(2)}%`;R+=`,${xr.toFixed(2)}% ${y.toFixed(2)}%`; pl.push([xl,y]); pr.push([xr,y]);}
  it.fl.style.clipPath=`polygon(${L},50% 100%,0% 100%)`; it.fr.style.clipPath=`polygon(${R},50% 100%,100% 100%)`;
  const W=bW,H=bH, path=(pts,dx)=>pts.map((q,i)=>(i?'L':'M')+(q[0]/100*W+dx).toFixed(1)+' '+(q[1]/100*H).toFixed(1)).join('')+`L${(W/2+dx).toFixed(1)} ${H}`;
  it.tpL.setAttribute('d',path(pl,-3.5)); it.tpR.setAttribute('d',path(pr,3.5));
  it.tL.setAttribute('d',path(pl,1)); it.tR.setAttribute('d',path(pr,-1));
  it.hL.setAttribute('d',path(pl,.2)); it.hR.setAttribute('d',path(pr,-1.8));
  it.pull.style.top=z+'%'; it.dark.style.opacity=1-p*.92; }
function bindPull(it){ let on=false,top=0,h=0,last=0;
  it.pull.addEventListener('pointerdown',e=>{ if(sel!==it||body.dataset.s!=='focus')return; e.stopPropagation(); on=true; it.pull.setPointerCapture(e.pointerId);
    const r=it.body.getBoundingClientRect(); top=r.top; h=r.height; });
  it.pull.addEventListener('pointermove',e=>{ if(!on)return; it.pT=clamp((e.clientY-top-h*.02)/(h*.9));
    if(Math.abs(it.pT-last)>.035){last=it.pT; navigator.vibrate&&navigator.vibrate(4);} $('#hint').style.opacity=it.pT>.05?0:'';
    if(it.pT>=.5){ on=false; it.auto=true; it.pT=1; try{it.pull.releasePointerCapture(e.pointerId)}catch(_){} } });
  const up=()=>{ if(!on)return; on=false; };
  it.pull.addEventListener('pointerup',up); it.pull.addEventListener('pointercancel',up); }

/* Gerçek fermuar başı: yeşil fonlu fotoğraf bir kez arka planından ayrılır ve kırpılır. */
let PULL=null;
(function keyPull(){ const im=new Image(); im.onload=()=>{ const c=document.createElement('canvas'); c.width=im.width; c.height=im.height;
  const g=c.getContext('2d'); g.drawImage(im,0,0); const d=g.getImageData(0,0,c.width,c.height), a=d.data; let x0=c.width,y0=c.height,x1=0,y1=0;
  for(let i=0;i<a.length;i+=4){ const r=a[i],gr=a[i+1],b=a[i+2],m=Math.max(r,b),k=gr-m;
    const al=k>70?0:k>25?Math.round(255*(1-(k-25)/45)):255; if(gr>m)a[i+1]=m; a[i+3]=al;
    if(al>60){const p=i/4,x=p%c.width,y=(p/c.width)|0; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;} }
  g.putImageData(d,0,0); const o=document.createElement('canvas'); o.width=x1-x0+1; o.height=y1-y0+1; o.getContext('2d').drawImage(c,-x0,-y0);
  PULL=o.toDataURL('image/png'); items.forEach(setPull); }; im.src='/assets/img/zip-pull.png'; })();
function setPull(it){ if(!PULL||!it.pull||it.pull.classList.contains('real'))return; it.pull.classList.add('real'); it.pull.insertAdjacentHTML('beforeend',`<img src="${PULL}" alt="">`); }

/* sürükleme + seçim */
let down=false,sx=0,sox=0,moved=0,lx=0,target=null;
stage.addEventListener('pointerdown',e=>{ if(body.dataset.s!=='rail')return; down=true;sx=lx=e.clientX;sox=oxT;moved=0;vel=0;target=e.target.closest('.bag');stage.classList.add('drag');stage.setPointerCapture(e.pointerId); });
stage.addEventListener('pointermove',e=>{ if(!down)return; const dx=e.clientX-lx; lx=e.clientX; moved=Math.max(moved,Math.abs(e.clientX-sx)); oxT=sox+(e.clientX-sx); vel=dx; items.forEach(it=>it.va+=dx*.012); });
stage.addEventListener('pointerup',()=>{ if(!down)return; down=false;stage.classList.remove('drag'); if(moved<8&&target){const it=items.find(i=>i.el===target); if(it)focus(it);} else oxT+=vel*14; });
stage.addEventListener('wheel',e=>{ if(body.dataset.s!=='rail')return; const d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY; oxT-=d; items.forEach(it=>it.va-=d*.004); },{passive:true});

function focus(it){ sel=it; it.el.classList.add('sel'); S('focus'); $('#hintT').textContent='Fermuarı tutup aşağı çekin'; $('#hint').style.opacity=''; }
function open(it){ it.el.classList.add('peeled'); renderDP(it.k); S('open'); }
function closeAll(){ if(!sel)return; const it=sel; it.el.classList.remove('peeled'); it.pT=0; S('rail'); $('#hintT').textContent='Kılıfları sağa sola itin, birine dokunun'; $('#hint').style.opacity='';
  setTimeout(()=>{it.el.classList.remove('sel'); if(sel===it)sel=null;},50); }
$('#back').onclick=closeAll;
addEventListener('keydown',e=>{ if(e.key==='Escape'){ if($('#pm').classList.contains('on'))closePM(); else closeAll(); } });

/* kare döngüsü */
function frame(){
  if(items.length){
    const min=vw/2-items[items.length-1].x, max=vw/2-items[0].x;
    if(!down){ if(oxT<min)oxT=lerp(oxT,min,.2); if(oxT>max)oxT=lerp(oxT,max,.2); }
    const pox=ox; ox=lerp(ox,oxT,.12); const dv=ox-pox;
    const st=body.dataset.s;
    items.forEach(it=>{
      it.va+=(-it.a*.045)-it.va*.06+(down?0:dv*.006); it.a+=it.va; it.a=clamp(it.a,-9,9);
      let tx=it.x+ox, ts=1, ang=it.a;
      if(it===sel&&st!=='rail'){ ang*=.3;
        if(st==='focus'){tx=vw/2;ts=mobile?1.18:1.22;}
        else{tx=mobile?vw/2:vw*.27;ts=mobile?.74:1.3;} }
      it.cx=lerp(it.cx,tx,.11); it.cs=lerp(it.cs,ts,.11);
      const tf=`translate3d(${it.cx}px,0,0) rotate(${ang.toFixed(3)}deg) scale(${it.cs.toFixed(4)})`;
      it.el.style.transform=tf; it.front.style.transform=tf;
      it.front.style.opacity=(st!=='rail'&&it!==sel)?0:1;
      if(it.k){ it.p=lerp(it.p,it.pT,it.auto?.075:.22); if(Math.abs(it.p-it.pT)<.001)it.p=it.pT; zip(it,it.p);
        if(it.auto&&it.p>.97){it.auto=false;open(it);} }
    });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- detay paneli ---------- */
const picked={};
function renderDP(k){
  const tot=k.p.reduce((s,x)=>s+x.f,0), si=OPT.sizeIdx();
  $('#dp').innerHTML=`<div><span class="lab">${k.world} · ${k.occ}</span><h2>${k.name}</h2><p class="d">${k.d}</p></div>
   <div class="pcs">${k.p.map((x,i)=>{ if(!picked[x.k])picked[x.k]=x.s[Math.min(si,x.s.length-1)];
     return `<button class="pc" data-k="${x.k}" style="--i:${i};--r:${[-3,2.5,-2,3][i%4]}deg;--fx:${mobile?0:-40}vw;--fy:${mobile?-30:0}vh">
       <span class="ph"><img src="${x.imgs[0]||''}" alt="${x.n}" draggable="false"></span><span>${x.n}</span><em>${tl(x.f)} · <u data-sz="${x.k}">${picked[x.k]}</u></em></button>`}).join('')}</div>
   ${k.x.length?`<div class="pair"><p>${pairingText(k.x.map(x=>({name:x.n})))}</p>
     <div class="xs">${k.x.map(x=>{ if(!picked[x.k])picked[x.k]=x.s[Math.min(si,x.s.length-1)];
       return `<label class="xi"><img src="${x.imgs[0]||''}" alt="" data-xk="${x.k}"><span><b>${x.n}</b><em>+${tl(x.f)}</em></span><input type="checkbox" data-x="${x.k}"><i></i></label>`}).join('')}</div>
     <small>Kombin fiyatına dahil değildir; isterseniz ekleyin.</small></div>`:''}
   <div class="seal"><i></i><span>Markalar mühürlü. Ödeme adımında, siz onaylamadan önce açıklanır.</span></div>
   <div class="buy"><b id="dtot">${tl(tot)}</b><button class="btn" id="add">Kombini sepete ekle</button></div>`;
  $$('#dp .pc').forEach(b=>b.onclick=()=>openPM(k,k.p.find(x=>x.k===b.dataset.k)));
  $$('#dp [data-xk]').forEach(im=>im.onclick=e=>{e.preventDefault();openPM(k,k.x.find(x=>x.k===im.dataset.xk));});
  const chosen=()=>$$('#dp [data-x]').filter(c=>c.checked).map(c=>c.dataset.x);
  $$('#dp [data-x]').forEach(c=>c.onchange=()=>{ $('#dtot').textContent=tl(tot+chosen().reduce((s,id)=>s+k.x.find(x=>x.k===id).f,0)); });
  $('#add').onclick=e=>{ const sizes={}; [...k.p,...k.x].forEach(x=>sizes[x.k]=picked[x.k]); addToCart(k.id,sizes,chosen());
    e.target.outerHTML='<a class="btn ok" href="/sepet">Sepete eklendi · Sepete git →</a>'; };
}

/* ---------- parça penceresi ---------- */
const strip=$('#strip');
function openPM(k,x){
  const imgs=x.imgs.length?x.imgs:[''];
  strip.innerHTML=imgs.map(s=>`<img src="${s}" alt="${x.n}" draggable="false">`).join('');
  $('#dots').innerHTML=imgs.map((_,i)=>`<i class="${i?'':'on'}"></i>`).join(''); strip.scrollLeft=0;
  const rec=x.s[Math.min(OPT.sizeIdx(),x.s.length-1)];
  $('#inf').innerHTML=`<span class="lab">${k.world} · ${k.name}</span><h3>${x.n}</h3><div class="pr">${tl(x.f)}</div>
   <div><span class="lab" style="display:block;margin-bottom:12px">Beden</span><div class="sz">${x.s.map(s=>`<button class="${s===picked[x.k]?'on':''}">${s}</button>`).join('')}</div></div>
   <small>${x.s.length>1?`Ölçülerinize göre önerimiz: <b>${rec}</b>. Her parçanın bedenini ayrı seçebilirsiniz.<br>`:''}Markası ödeme adımında açıklanır.</small>
   <button class="btn" id="pok">Tamam</button>`;
  $$('#inf .sz button').forEach(b=>b.onclick=()=>{$$('#inf .sz button').forEach(q=>q.classList.remove('on'));b.classList.add('on');picked[x.k]=b.textContent;
    const u=document.querySelector(`[data-sz="${x.k}"]`); if(u)u.textContent=b.textContent;});
  $('#pok').onclick=closePM; $('#pm').classList.add('on');
}
function closePM(){$('#pm').classList.remove('on')}
$('#px').onclick=closePM; $('#pm').addEventListener('click',e=>{if(e.target.id==='pm')closePM()});
const gi=()=>Math.round(strip.scrollLeft/strip.clientWidth);
strip.addEventListener('scroll',()=>{const i=gi();[...$('#dots').children].forEach((d,j)=>d.classList.toggle('on',j===i))},{passive:true});
$('#gp').onclick=()=>strip.scrollTo({left:(gi()-1)*strip.clientWidth,behavior:'smooth'});
$('#gn').onclick=()=>strip.scrollTo({left:(gi()+1)*strip.clientWidth,behavior:'smooth'});

/* Tercihler daha önce kaydedildiyse sorular atlanır; #gardirop test kısayoludur. */
function skipIntro(){steps[si].classList.remove('on');si=steps.length-1;steps[si].classList.add('on');finish();}
