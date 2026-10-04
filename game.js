(() => {
  "use strict";
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const startPanel = document.getElementById("start");
  const overPanel = document.getElementById("gameOver");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const finalScoreEl = document.getElementById("finalScore");

  let W=0,H=0,dpr=1,state="menu",score=0,best=0;
  function loadBest(){
    try{
      const v=Number.parseInt(localStorage.getItem("winterbell-best")||"0",10);
      return Number.isFinite(v)&&v>=0?v:0;
    }catch{return 0;}
  }
  function saveBest(v){
    try{localStorage.setItem("winterbell-best",String(v));}catch{}
  }
  best=loadBest();
  let rabbit,bells=[],birds=[],stars=[],particles=[],cameraY=0,nextBellY=0,last=0,mouseX=0;
  let hasLanded=false,waitingForJump=true;
  bestEl.textContent=best;

  function resize(){
    const r=canvas.getBoundingClientRect();
    const oldW=W||r.width, oldH=H||r.height;
    dpr=Math.min(devicePixelRatio||1,2);
    W=Math.max(1,r.width); H=Math.max(1,r.height);
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(state==="playing"&&rabbit){
      const sx=W/oldW, sy=H/oldH;
      rabbit.x=Math.max(18,Math.min(W-18,rabbit.x*sx));
      rabbit.y=Math.min(H-80,rabbit.y*sy);
      for(const b of bells)b.x=Math.max(42,Math.min(W-42,b.x*sx));
      for(const b of birds){b.x*=sx;b.y*=sy;}
      for(const s of stars){s.x*=sx;s.y*=sy;}
      mouseX=Math.max(0,Math.min(W,mouseX*sx));
    }else mouseX=W/2;
    if(state!=="playing") draw();
  }
  addEventListener("resize",resize);

  function rand(a,b){return a+Math.random()*(b-a)}

  function reset(){
    score=0; cameraY=0; nextBellY=H-115;
    rabbit={x:W/2,y:H-155,vx:0,vy:0,r:18};
    bells=[]; birds=[]; particles=[];
    stars=Array.from({length:120},()=>({x:rand(0,W),y:rand(-300,H+300),r:rand(.5,1.8),a:rand(.25,.9)}));
    for(let i=0;i<16;i++) addBell(H-95-i*95,i);
    mouseX=W/2;
    hasLanded=false;
    waitingForJump=true;
    scoreEl.textContent=0;
  }

  function addBell(y,i,forcedX=null){
    const gap=Math.min(W*.34,110+i*7);
    const prev=bells.length?bells[bells.length-1].x:W/2;
    const x=forcedX===null?rand(Math.max(42,prev-gap),Math.min(W-42,prev+gap)):forcedX;
    bells.push({x:Math.max(42,Math.min(W-42,x)),y,w:Math.max(25,52-i*.65),h:12,hit:false});
  }
  function addReachableBell(y,i){
    const prev=bells[bells.length-1];
    const prevX=prev?prev.x:W/2;
    const jumpRise=Math.min(780,660+score*.6);
    const timeToSameHeight=(2*jumpRise)/900;
    const maxOffset=Math.min(W*.30,Math.max(90,150+timeToSameHeight*150));
    addBell(y,i,rand(Math.max(42,prevX-maxOffset),Math.min(W-42,prevX+maxOffset)));
  }

  function startGame(){
    reset();
    state="playing";
    startPanel.classList.add("hidden");
    overPanel.classList.add("hidden");
    last=performance.now();
    requestAnimationFrame(loop);
  }

  function launchFirstJump(){
    if(state!=="playing" || !waitingForJump) return;
    waitingForJump=false;
    rabbit.vy=-720;
  }

  function restartFromInput(){
    if(state==="menu" || state==="over") startGame();
    launchFirstJump();
  }

  function end(){
    state="over";
    finalScoreEl.textContent=score;
    if(score>best){
      best=score;
      saveBest(best);
      bestEl.textContent=best;
    }
    overPanel.classList.remove("hidden");
  }

  function resetBeforeFirstLanding(){
    // Missing the first bell is a failed attempt, not a game over.
    rabbit.x=W/2;
    rabbit.y=H-155;
    rabbit.vx=0;
    rabbit.vy=0;
    cameraY=0;
    waitingForJump=true;
    mouseX=W/2;
  }

  function worldY(y){return y-cameraY}

  function update(dt){
    if(waitingForJump) return;

    const target=mouseX;
    rabbit.vx += (target-rabbit.x)*8*dt;
    rabbit.vx *= Math.pow(.035,dt);
    rabbit.x += rabbit.vx*dt;
    rabbit.vy += 900*dt;
    rabbit.y += rabbit.vy*dt;

    if(rabbit.x<18){rabbit.x=18;rabbit.vx=0}
    if(rabbit.x>W-18){rabbit.x=W-18;rabbit.vx=0}

    const previousFootY=rabbit.y+rabbit.r;
    if(rabbit.vy>0){
      for(const b of bells){
        const by=worldY(b.y);
        if(!b.hit &&
           rabbit.x>b.x-b.w/2-rabbit.r*.55 &&
           rabbit.x<b.x+b.w/2+rabbit.r*.55 &&
           previousFootY<=by+4 &&
           rabbit.y+rabbit.r>=by){
          rabbit.y=by-rabbit.r;
          rabbit.vy=-Math.min(780,660+score*.6);
          b.hit=true;
          hasLanded=true;
          score+=10+Math.floor(score/100)*10;
          scoreEl.textContent=score;
          for(let i=0;i<8;i++){
            particles.push({x:b.x,y:b.y,vy:rand(-50,20),vx:rand(-70,70),life:1});
          }
          break;
        }
      }
    }

    const targetCam=Math.max(0,(H*.45)-rabbit.y);
    cameraY += (targetCam-cameraY)*Math.min(1,5*dt);

    while(nextBellY-cameraY>-120){
      const i=bells.length;
      nextBellY-=rand(82,112);
      addReachableBell(nextBellY,i);
      if(Math.random()<.12){
        birds.push({
          x:rand(40,W-40),
          y:nextBellY-rand(25,55),
          vx:rand(45,90)*(Math.random()<.5?-1:1),
          r:10
        });
      }
    }

    bells=bells.filter(b=>worldY(b.y)<H+80 && b.y-cameraY>-160);
    birds.forEach(b=>{b.x+=b.vx*dt;if(b.x<-30||b.x>W+30)b.vx*=-1});
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=80*dt;p.life-=dt*2});
    particles=particles.filter(p=>p.life>0);

    if(rabbit.y>H+80){
      if(!hasLanded) resetBeforeFirstLanding();
      else end();
    }
  }

  function draw(){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,"#081a35"); g.addColorStop(1,"#24476b");
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    ctx.save();
    ctx.translate(0,-(cameraY%H));
    for(const s of stars){
      ctx.globalAlpha=s.a;
      ctx.fillStyle="#fff";
      ctx.beginPath();
      ctx.arc(s.x,s.y+Math.floor(cameraY/H)*H,s.r,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha=1;
    ctx.restore();

    for(const b of bells){
      const y=worldY(b.y);
      if(y<-50||y>H+50)continue;
      ctx.save();ctx.translate(b.x,y);
      ctx.fillStyle=b.hit?"#b9d7ec":"#eef8ff";
      ctx.strokeStyle="rgba(100,160,195,.8)";ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(0,0,b.w/2,b.h,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle="#d4e9f6";ctx.fillRect(-b.w*.34,-5,b.w*.68,7);
      ctx.fillStyle="#789bb8";ctx.beginPath();ctx.arc(0,7,4,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }

    for(const b of birds){
      const y=worldY(b.y);if(y<-40||y>H+40)continue;
      ctx.save();ctx.translate(b.x,y);ctx.fillStyle="#fff";
      ctx.beginPath();ctx.ellipse(0,0,11,7,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-3,-1);ctx.quadraticCurveTo(-15,-13,-18,-2);ctx.quadraticCurveTo(-9,-5,-2,3);ctx.fill();
      ctx.beginPath();ctx.moveTo(3,-1);ctx.quadraticCurveTo(15,-13,18,-2);ctx.quadraticCurveTo(9,-5,2,3);ctx.fill();
      ctx.restore();
    }

    for(const p of particles){
      ctx.globalAlpha=p.life;ctx.fillStyle="#fff";
      ctx.beginPath();ctx.arc(p.x,worldY(p.y),2.5,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;
    drawRabbit(rabbit.x,rabbit.y);
  }

  function drawRabbit(x,y){
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle="#fff";
    ctx.beginPath();ctx.ellipse(0,7,17,20,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(-9,-14,6,17,-.18,0,Math.PI*2);ctx.ellipse(9,-14,6,17,.18,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#f1aebd";
    ctx.beginPath();ctx.ellipse(-9,-14,2.2,11,-.18,0,Math.PI*2);ctx.ellipse(9,-14,2.2,11,.18,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#24384d";
    ctx.beginPath();ctx.arc(-6,0,2.1,0,Math.PI*2);ctx.arc(6,0,2.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#e8a7b8";ctx.beginPath();ctx.arc(0,5,2.5,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  function loop(t){
    if(state!=="playing")return;
    const dt=Math.min(.033,(t-last)/1000);last=t;
    update(dt);draw();requestAnimationFrame(loop);
  }

  function pointer(e){
    const r=canvas.getBoundingClientRect();
    mouseX=e.clientX-r.left;
    if(e.type==="pointerdown") restartFromInput();
  }

  canvas.addEventListener("pointermove",pointer);
  canvas.addEventListener("pointerdown",pointer);

  addEventListener("keydown",e=>{
    if(e.key===" "||e.key==="Enter"){
      e.preventDefault();
      if(state==="menu"||state==="over") restartFromInput();
      else if(!hasLanded && waitingForJump) launchFirstJump();
    }
  });

  reset();
  resize();
  draw();
})();
