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
  let hasLanded=false,waitingForJump=true,bellIndex=0,bellHits=0;
  bestEl.textContent=best;

  function resize(){
    const r=canvas.getBoundingClientRect();
    const oldW=W||r.width||1;
    dpr=Math.min(devicePixelRatio||1,2);
    W=Math.max(1,r.width); H=Math.max(1,r.height);
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(state==="playing"&&rabbit){
      const sx=W/oldW;
      const maxRabbitX=Math.max(18,W-18);
      const maxBellX=Math.max(42,W-42);
      rabbit.x=Math.max(18,Math.min(maxRabbitX,rabbit.x*sx));
      for(const b of bells)b.x=Math.max(42,Math.min(maxBellX,b.x*sx));
      for(const b of birds)b.x=Math.max(20,Math.min(W-20,b.x*sx));
      for(const s of stars)s.x*=sx;
      mouseX=Math.max(0,Math.min(W,mouseX*sx));
      const targetCam=rabbit.y-H*.45;
      if(targetCam<cameraY) cameraY=targetCam;
    }else{
      mouseX=W/2;
    }
    if(state!=="playing"&&rabbit) draw();
  }
  addEventListener("resize",resize);

  function rand(a,b){return a+Math.random()*(b-a)}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

  function reset(){
    score=0; bellHits=0; cameraY=0; nextBellY=H-115; bellIndex=0;
    rabbit={x:W/2,y:H-155,vx:0,vy:0,r:18};
    bells=[]; birds=[]; particles=[];
    stars=Array.from({length:120},()=>({x:rand(0,W),y:rand(-300,H+300),r:rand(.5,1.8),a:rand(.25,.9)}));
    for(let i=0;i<16;i++){
      const fromY=i===0 ? rabbit.y+rabbit.r : bells[bells.length-1].y;
      const jumpVelocity=i===0 ? 720 : 660;
      addReachableBell(H-95-i*95,jumpVelocity,fromY);
    }
    nextBellY=bells[bells.length-1].y;
    mouseX=W/2;
    hasLanded=false;
    waitingForJump=true;
    scoreEl.textContent=0;
  }

  function addBell(y,forcedX=null){
    const i=bellIndex++;
    const width=Math.max(25,52-i*.65);
    const gap=Math.min(W*.34,110+i*7);
    const prev=bells.length?bells[bells.length-1].x:W/2;
    const minX=Math.min(42,Math.max(1,W-42));
    const maxX=Math.max(minX,Math.max(42,W-42));
    const x=forcedX===null
      ? rand(clamp(prev-gap,minX,maxX),clamp(prev+gap,minX,maxX))
      : clamp(forcedX,minX,maxX);
    bells.push({x,y,w:width,h:12,hit:false});
  }

  function landingTime(gap,jumpVelocity){
    const g=900;
    const discriminant=jumpVelocity*jumpVelocity-2*g*gap;
    if(discriminant<0)return null;
    return (jumpVelocity+Math.sqrt(discriminant))/g;
  }

  function canReachX(startX,targetX,time,halfWidth){
    let x=startX,vx=0;
    const step=1/120;
    const steps=Math.ceil(time/step);
    const dt=time/steps;
    for(let n=0;n<steps;n++){
      const dx=targetX-x;
      vx+=dx*8*dt;
      vx*=Math.pow(.035,dt);
      x+=vx*dt;
      if(x<18){x=18;vx=0}
      if(x>W-18){x=W-18;vx=0}
    }
    return Math.abs(x-targetX)<=halfWidth;
  }

  function findReachableX(startX,targetY,jumpVelocity,fromY,bellWidth){
    const gap=fromY-targetY;
    const time=landingTime(gap,jumpVelocity);
    const minX=Math.min(42,Math.max(1,W-42));
    const maxX=Math.max(minX,Math.max(42,W-42));
    if(time===null)return startX;

    const hitWidth=bellWidth/2+18*.55+6;
    const candidates=[];
    const count=25;
    for(let i=0;i<count;i++){
      candidates.push(minX+(maxX-minX)*(i/(count-1)));
    }
    candidates.sort((a,b)=>Math.abs(a-startX)-Math.abs(b-startX));
    for(const x of candidates){
      if(canReachX(startX,x,time,hitWidth))return x;
    }
    return clamp(startX,minX,maxX);
  }

  function addReachableBell(y,jumpVelocity,fromY){
    const prev=bells[bells.length-1];
    const prevX=prev?prev.x:W/2;
    const width=Math.max(25,52-bellIndex*.65);
    const x=findReachableX(prevX,y,jumpVelocity,fromY,width);
    addBell(y,x);
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
    // Missing the first bell is a failed attempt, so rebuild the whole attempt.
    reset();
  }

  function worldY(y){return y-cameraY}

  function update(dt){
    if(waitingForJump) return;

    // rabbit.y and bell.y are both world-space coordinates.
    const previousFootY=rabbit.y+rabbit.r;
    const target=mouseX;
    const dx=target-rabbit.x;
    rabbit.vx += dx*8*dt;
    rabbit.vx *= Math.pow(.035,dt);
    rabbit.x += rabbit.vx*dt;
    rabbit.vy += 900*dt;
    rabbit.y += rabbit.vy*dt;

    if(rabbit.x<18){rabbit.x=18;rabbit.vx=0}
    if(rabbit.x>W-18){rabbit.x=W-18;rabbit.vx=0}
    const currentFootY=rabbit.y+rabbit.r;

    // Bells: each successful bell is worth 10 more points than the previous one
    // (10, 20, 30, ...), matching the original Winterbells scoring rule.
    if(rabbit.vy>0){
      for(const b of bells){
        const by=b.y;
        if(!b.hit &&
           rabbit.x>b.x-b.w/2-rabbit.r*.55 &&
           rabbit.x<b.x+b.w/2+rabbit.r*.55 &&
           previousFootY<=by+4 &&
           currentFootY>=by){
          rabbit.y=by-rabbit.r;
          rabbit.vy=-Math.min(780,660+score*.6);
          b.hit=true;
          hasLanded=true;
          bellHits+=1;
          score+=bellHits*10;
          scoreEl.textContent=score;
          for(let i=0;i<8;i++){
            particles.push({x:b.x,y:b.y,vy:rand(-50,20),vx:rand(-70,70),life:1});
          }
          break;
        }
      }

      // Birds are bonus targets. Pouncing on one doubles the current score,
      // then gives the rabbit an upward bounce so the run can continue.
      for(const b of birds){
        if(b.hit)continue;
        if(rabbit.x>b.x-rabbit.r-b.r &&
           rabbit.x<b.x+rabbit.r+b.r &&
           previousFootY<=b.y+b.r &&
           currentFootY>=b.y-b.r){
          b.hit=true;
          score*=2;
          scoreEl.textContent=score;
          rabbit.y=b.y-rabbit.r-b.r*.35;
          rabbit.vy=-Math.min(900,720+score*.15);
          for(let i=0;i<14;i++){
            particles.push({x:b.x,y:b.y,vy:rand(-90,30),vx:rand(-100,100),life:1.2});
          }
          break;
        }
      }
    }

    // Camera follows the rabbit only while it climbs above the tracking line.
    // It never moves downward during a fall, so falling out of the viewport
    // can correctly trigger game over.
    const targetCam=rabbit.y-H*.45;
    if(targetCam<cameraY){
      cameraY += (targetCam-cameraY)*Math.min(1,5*dt);
    }

    while(nextBellY-cameraY>-120){
      nextBellY-=rand(82,112);
      const jumpVelocity=Math.min(780,660+score*.6);
      const fromY=bells.length?bells[bells.length-1].y:nextBellY+95;
      addReachableBell(nextBellY,jumpVelocity,fromY);
      if(Math.random()<.12){
        birds.push({
          x:rand(40,W-40),
          y:nextBellY-rand(25,55),
          vx:rand(45,90)*(Math.random()<.5?-1:1),
          r:10,
          hit:false
        });
      }
    }

    bells=bells.filter(b=>worldY(b.y)<H+80 && worldY(b.y)>-160);
    birds.forEach(b=>{b.x+=b.vx*dt;if(b.x<-30||b.x>W+30)b.vx*=-1});
    birds=birds.filter(b=>!b.hit && worldY(b.y)<H+80 && worldY(b.y)>-160);
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=80*dt;p.life-=dt*2});
    particles=particles.filter(p=>p.life>0);

    if(rabbit.y-cameraY>H+80){
      if(!hasLanded) resetBeforeFirstLanding();
      else end();
    }
  }

  function draw(){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,"#081a35"); g.addColorStop(1,"#24476b");
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    // Stars are screen-space background elements. Explicit wrapping avoids
    // modulo/translate artifacts when cameraY becomes negative.
    for(const s of stars){
      const y=((s.y-cameraY)%H+H)%H;
      ctx.globalAlpha=s.a;
      ctx.fillStyle="#fff";
      ctx.beginPath();
      ctx.arc(s.x,y,s.r,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha=1;

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
    drawRabbit(rabbit.x,rabbit.y-cameraY);
  }

  function drawRabbit(x,y){
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle="#fff";
    ctx.beginPath();ctx.ellipse(0,7,17,20,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(-9,-14,6,17,-.18,0,Math.PI*2).ellipse(9,-14,6,17,.18,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#f1aebd";
    ctx.beginPath();ctx.ellipse(-9,-14,2.2,11,-.18,0,Math.PI*2).ellipse(9,-14,2.2,11,.18,0,Math.PI*2);ctx.fill();
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
    mouseX=clamp(e.clientX-r.left,0,W);
    if(e.type==="pointerdown"){
      if(e.pointerType==="mouse"&&e.button!==0)return;
      restartFromInput();
    }
  }

  canvas.addEventListener("pointermove",pointer);
  canvas.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse"&&e.button!==0)return;
    if(canvas.setPointerCapture && e.pointerId!==undefined){
      try{canvas.setPointerCapture(e.pointerId)}catch{}
    }
    pointer(e);
  });
  canvas.addEventListener("pointerup",e=>{
    if(canvas.releasePointerCapture && e.pointerId!==undefined){
      try{canvas.releasePointerCapture(e.pointerId)}catch{}
    }
  });
  canvas.addEventListener("pointercancel",e=>{
    if(canvas.releasePointerCapture && e.pointerId!==undefined){
      try{canvas.releasePointerCapture(e.pointerId)}catch{}
    }
  });

  addEventListener("keydown",e=>{
    if(e.key===" "||e.key==="Enter"){
      e.preventDefault();
      if(state==="menu"||state==="over") restartFromInput();
      else if(!hasLanded && waitingForJump) launchFirstJump();
    }
  });

  // Establish the canvas dimensions before creating world objects.
  resize();
  reset();
  draw();
})();
