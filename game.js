(() => {
  "use strict";
  const canvas=document.getElementById("canvas"),ctx=canvas.getContext("2d");
  const start=document.getElementById("start"),over=document.getElementById("gameOver");
  const scoreEl=document.getElementById("score"),bestEl=document.getElementById("best"),finalEl=document.getElementById("finalScore");
  const G=900,R=18,FALL=72,FIRST=-720,BASE=660,MAXDT=1/30,MIN_GAP=52,MAX_GAP=94;
  let W=0,H=0,dpr=1,state="menu",score=0,best=0,rabbit,bells=[],birds=[],stars=[],particles=[],cameraY=0,last=0,mouseX=0;
  let waiting=true,hasLanded=false,hits=0,index=0,next=null;
  const rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),worldY=y=>y-cameraY;
  try{best=Math.max(0,Number.parseInt(localStorage.getItem("winterbell-best")||"0",10)||0)}catch(_){} bestEl.textContent=best;
  function saveBest(v){try{localStorage.setItem("winterbell-best",String(v))}catch(_){}}
  function resize(){
    const r=canvas.getBoundingClientRect(),old=W||r.width||1;dpr=Math.min(devicePixelRatio||1,2);W=Math.max(1,r.width);H=Math.max(1,r.height);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    if(state==="playing"&&rabbit){const s=W/old;rabbit.x=clamp(rabbit.x*s,R,Math.max(R,W-R));mouseX=clamp(mouseX*s,0,W);for(const b of bells)b.x=clamp(b.x*s,42,Math.max(42,W-42));for(const b of birds)b.x=clamp(b.x*s,20,Math.max(20,W-20));for(const s0 of stars)s0.x*=s;if(next)next.x=clamp(next.x*s,42,Math.max(42,W-42));}else mouseX=W/2;
    if(state!=="playing"&&rabbit)draw();
  }
  addEventListener("resize",resize);
  function horizontalStep(x,v,target,dt){v+=(target-x)*8*dt;v*=Math.pow(.035,dt);x+=v*dt;if(x<R){x=R;v=0}if(x>W-R){x=W-R;v=0}return[x,v]}
  const bellWidth=i=>Math.max(25,52-i*.65);

  // Return the descending intersection time. The smaller quadratic root is the
  // ascent crossing and must NOT be used to certify a landing.
  function landingTime(fromY,bellY,jump){
    const a=.5*G,b=-(jump+FALL),c=fromY-bellY,d=b*b-4*a*c;if(d<0)return null;
    const q=Math.sqrt(d),t1=(-b-q)/(2*a),t2=(-b+q)/(2*a);return t2>0?t2:(t1>0?t1:null);
  }
  function reachable(fromX,fromY,bellY,bellX,jump,width){
    const T=landingTime(fromY,bellY,jump);if(T===null||T>3.5)return false;
    let x=fromX,v=0,ry=fromY,rv=-jump,by=bellY;const n=Math.max(1,Math.ceil(T*240)),dt=T/n,hit=width/2+R*.55+3;
    for(let i=0;i<n;i++){
      const p=ry,bb=by,h=horizontalStep(x,v,bellX,dt);x=h[0];v=h[1];rv+=G*dt;ry+=rv*dt;by+=FALL*dt;
      if(p-bb<=4&&ry-by>=0&&Math.abs(x-bellX)<=hit)return true;
    }
    return false;
  }
  function chooseBell(fromX,fromY,proposed,jump,width){
    let y=proposed;
    for(let attempt=0;attempt<50;attempt++){
      const min=42,max=Math.max(min,W-42),c=[];for(let i=0;i<=120;i++)c.push(min+(max-min)*i/120);c.push(clamp(fromX,min,max));
      c.sort((a,b)=>Math.abs(a-fromX)-Math.abs(b-fromX));
      for(const x of c)if(reachable(fromX,fromY,y,x,jump,width))return{x,y};
      y=fromY-Math.max(MIN_GAP,(fromY-y)*.85);
    }
    return null;
  }
  function spawnNext(fromX,fromY,proposed,jump){
    const w=bellWidth(index),chosen=chooseBell(fromX,fromY,proposed,jump,w);
    // Same-x, minimum-gap fallback is analytically reachable with these physics.
    const r=chosen||{x:clamp(fromX,42,Math.max(42,W-42)),y:fromY-MIN_GAP};
    next={x:r.x,y:r.y,w,h:12,vy:FALL,hit:false,index:index++};
  }
  function reset(){
    score=0;hits=0;index=0;cameraY=0;bells=[];birds=[];particles=[];next=null;
    rabbit={x:W/2,y:H-155,vx:0,vy:0,r:R};stars=Array.from({length:120},()=>({x:rand(0,W),y:rand(-300,H+300),r:rand(.5,1.8),a:rand(.25,.9)}));
    mouseX=W/2;waiting=true;hasLanded=false;scoreEl.textContent="0";
    spawnNext(rabbit.x,rabbit.y+R,rabbit.y+R-95,720);
  }
  function promote(){if(next){bells.push(next);next=null}}
  function startGame(){reset();state="playing";start.classList.add("hidden");over.classList.add("hidden");last=performance.now();requestAnimationFrame(loop)}
  function launch(){if(state!=="playing"||!waiting)return;waiting=false;promote();rabbit.vy=FIRST}
  function inputRestart(){const x=mouseX;if(state==="menu"||state==="over"){startGame();mouseX=clamp(x,0,W)}launch()}
  function end(){state="over";finalEl.textContent=score;if(score>best){best=score;saveBest(best);bestEl.textContent=best}over.classList.remove("hidden")}
  function land(b){
    rabbit.y=b.y-R;rabbit.vy=-Math.min(780,BASE+score*.6);b.hit=true;hasLanded=true;hits++;score+=hits*10;scoreEl.textContent=score;
    for(let i=0;i<8;i++)particles.push({x:b.x,y:b.y,vx:rand(-70,70),vy:rand(-50,20),life:1});
    const jump=Math.min(780,BASE+score*.6),gap=rand(MIN_GAP,MAX_GAP);spawnNext(rabbit.x,rabbit.y+R,b.y-gap,jump);
    if(Math.random()<.12)birds.push({x:clamp(b.x+rand(-100,100),40,Math.max(40,W-40)),y:b.y-rand(25,55),vx:rand(45,90)*(Math.random()<.5?-1:1),r:10,hit:false});
  }
  function updateBells(dt){for(const b of bells)b.y+=b.vy*dt;if(next)next.y+=next.vy*dt}
  function updateBirds(dt){for(const b of birds){b.x+=b.vx*dt;if(b.x<-30||b.x>W+30){b.vx*=-1;b.x=clamp(b.x,-30,W+30)}}}
  function update(dt){
    if(waiting)return;
    const prevFoot=rabbit.y+R,prevBell=new Map(bells.map(b=>[b,b.y]));updateBells(dt);updateBirds(dt);
    const h=horizontalStep(rabbit.x,rabbit.vx,mouseX,dt);rabbit.x=h[0];rabbit.vx=h[1];rabbit.vy+=G*dt;rabbit.y+=rabbit.vy*dt;
    const foot=rabbit.y+R;let landed=false;
    if(rabbit.vy>0){
      for(const b of bells){if(b.hit)continue;const xHit=rabbit.x>b.x-b.w/2-R*.55&&rabbit.x<b.x+b.w/2+R*.55,rb=prevFoot-prevBell.get(b),ra=foot-b.y;if(xHit&&rb<=4&&ra>=0){land(b);landed=true;break}}
      if(!landed)for(const b of birds){if(b.hit)continue;const top=b.y-b.r*.55,xHit=rabbit.x>b.x-R-b.r*.9&&rabbit.x<b.x+R+b.r*.9;if(xHit&&prevFoot<=top+4&&foot>=top){b.hit=true;score*=2;scoreEl.textContent=score;rabbit.y=top-R;rabbit.vy=-Math.min(900,720+score*.15);for(let i=0;i<14;i++)particles.push({x:b.x,y:b.y,vx:rand(-100,100),vy:rand(-90,30),life:1.2});break}}
    }
    const tc=rabbit.y-H*.45;if(tc<cameraY)cameraY+=(tc-cameraY)*Math.min(1,5*dt);
    bells=bells.filter(b=>!b.hit&&worldY(b.y)<H+120&&worldY(b.y)>-260);birds=birds.filter(b=>!b.hit&&worldY(b.y)<H+120&&worldY(b.y)>-260);
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=80*dt;p.life-=dt*2});particles=particles.filter(p=>p.life>0);
    if(rabbit.y-cameraY>H+80){if(!hasLanded){reset();return}end()}
  }
  function drawBell(b){const y=worldY(b.y);if(y<-55||y>H+55)return;ctx.save();ctx.translate(b.x,y);ctx.fillStyle=b.hit?"#b9d7ec":"#eef8ff";ctx.strokeStyle="rgba(100,160,195,.8)";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,b.w/2,b.h,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle="#d4e9f6";ctx.fillRect(-b.w*.34,-5,b.w*.68,7);ctx.fillStyle="#789bb8";ctx.beginPath();ctx.arc(0,7,4,0,Math.PI*2);ctx.fill();ctx.restore()}
  function drawBird(b){const y=worldY(b.y);if(y<-45||y>H+45)return;ctx.save();ctx.translate(b.x,y);ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(0,0,11,7,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-3,-1);ctx.quadraticCurveTo(-15,-13,-18,-2);ctx.quadraticCurveTo(-9,-5,-2,3);ctx.fill();ctx.beginPath();ctx.moveTo(3,-1);ctx.quadraticCurveTo(15,-13,18,-2);ctx.quadraticCurveTo(9,-5,2,3);ctx.fill();ctx.restore()}
  function drawRabbit(x,y){ctx.save();ctx.translate(x,y);ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(0,7,17,20,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(-9,-14,6,17,-.18,0,Math.PI*2);ctx.ellipse(9,-14,6,17,.18,0,Math.PI*2);ctx.fill();ctx.fillStyle="#f1aebd";ctx.beginPath();ctx.ellipse(-9,-14,2.2,11,-.18,0,Math.PI*2);ctx.ellipse(9,-14,2.2,11,.18,0,Math.PI*2);ctx.fill();ctx.fillStyle="#24384d";ctx.beginPath();ctx.arc(-6,0,2.1,0,Math.PI*2);ctx.arc(6,0,2.1,0,Math.PI*2);ctx.fill();ctx.fillStyle="#e8a7b8";ctx.beginPath();ctx.arc(0,5,2.5,0,Math.PI*2);ctx.fill();ctx.restore()}
  function draw(){const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"#081a35");g.addColorStop(1,"#24476b");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);for(const s of stars){const y=((s.y-cameraY)%H+H)%H;ctx.globalAlpha=s.a;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(s.x,y,s.r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;for(const b of bells)drawBell(b);if(next)drawBell(next);for(const b of birds)drawBird(b);for(const p of particles){ctx.globalAlpha=p.life;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(p.x,worldY(p.y),2.5,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;drawRabbit(rabbit.x,rabbit.y-cameraY)}
  function loop(t){if(state!=="playing")return;const dt=Math.min(MAXDT,Math.max(0,(t-last)/1000));last=t;update(dt);draw();if(state==="playing")requestAnimationFrame(loop)}
  function pointer(e){const r=canvas.getBoundingClientRect();mouseX=clamp(e.clientX-r.left,0,W);if(e.type==="pointerdown"){if(e.pointerType==="mouse"&&e.button!==0)return;inputRestart()}}
  canvas.addEventListener("pointermove",pointer);canvas.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"&&e.button!==0)return;if(canvas.setPointerCapture&&e.pointerId!==undefined)try{canvas.setPointerCapture(e.pointerId)}catch(_){}pointer(e)});
  canvas.addEventListener("pointerup",e=>{if(canvas.releasePointerCapture&&e.pointerId!==undefined)try{canvas.releasePointerCapture(e.pointerId)}catch(_){}});canvas.addEventListener("pointercancel",e=>{if(canvas.releasePointerCapture&&e.pointerId!==undefined)try{canvas.releasePointerCapture(e.pointerId)}catch(_){}});
  addEventListener("keydown",e=>{if(e.key!==" "&&e.key!=="Enter")return;e.preventDefault();if(state==="menu"||state==="over")inputRestart();else if(waiting)launch()});
  resize();reset();draw();
})();
