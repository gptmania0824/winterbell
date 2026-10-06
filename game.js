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
  const GRAVITY=900, HORIZONTAL_ACCEL=8, HORIZONTAL_DAMP=0.035;
  const RABBIT_R=18, BELL_FALL_SPEED=72, FIRST_JUMP=-720;

  function loadBest(){try{const v=Number.parseInt(localStorage.getItem("winterbell-best")||"0",10);return Number.isFinite(v)&&v>=0?v:0;}catch{return 0;}}
  function saveBest(v){try{localStorage.setItem("winterbell-best",String(v));}catch{}}
  best=loadBest();
  let rabbit,bells=[],birds=[],stars=[],particles=[],cameraY=0,last=0,mouseX=0;
  let waitingForJump=true,hasLanded=false,bellIndex=0,bellHits=0,nextBellY=0;
  let lastGeneratedBellX=0,lastGeneratedBellY=0;
  bestEl.textContent=best;

  function rand(a,b){return a+Math.random()*(b-a)}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function worldY(y){return y-cameraY}

  function resize(){
    const r=canvas.getBoundingClientRect();
    const oldW=W||r.width||1;
    dpr=Math.min(devicePixelRatio||1,2);
    W=Math.max(1,r.width); H=Math.max(1,r.height);
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(state==="playing"&&rabbit){
      const sx=W/oldW;
      rabbit.x=clamp(rabbit.x*sx,RABBIT_R,W-RABBIT_R);
      for(const b of bells)b.x=clamp(b.x*sx,42,Math.max(42,W-42));
      for(const b of birds)b.x=clamp(b.x*sx,20,Math.max(20,W-20));
      for(const s of stars)s.x*=sx;
      mouseX=clamp(mouseX*sx,0,W);
      lastGeneratedBellX=clamp(lastGeneratedBellX*sx,42,Math.max(42,W-42));
    } else mouseX=W/2;
    if(state!=="playing"&&rabbit)draw();
  }
  addEventListener("resize",resize);

  function horizontalStep(x,vx,target,dt){
    vx+=(target-x)*HORIZONTAL_ACCEL*dt;
    vx*=Math.pow(HORIZONTAL_DAMP,dt);
    x+=vx*dt;
    if(x<RABBIT_R){x=RABBIT_R;vx=0;}
    if(x>W-RABBIT_R){x=W-RABBIT_R;vx=0;}
    return {x,vx};
  }

  function reset(){
    score=0;bellHits=0;bellIndex=0;cameraY=0;
    rabbit={x:W/2,y:H-155,vx:0,vy:0,r:RABBIT_R};
    bells=[];birds=[];particles=[];
    stars=Array.from({length:120},()=>({x:rand(0,W),y:rand(-300,H+300),r:rand(.5,1.8),a:rand(.25,.9)}));
    lastGeneratedBellX=rabbit.x;
    lastGeneratedBellY=rabbit.y+rabbit.r;

    // Keep the opening sequence deterministic enough to learn, while every bell
    // is placed using the exact horizontal physics used during gameplay.
    let y=H-95;
    for(let i=0;i<16;i++){
      const v=i===0?720:660;
      addValidatedBell(y,v,lastGeneratedBellX,lastGeneratedBellY);
      const b=bells[bells.length-1];
      lastGeneratedBellX=b.x; lastGeneratedBellY=b.y;
      y-=95;
    }
    nextBellY=lastGeneratedBellY;
    mouseX=W/2;waitingForJump=true;hasLanded=false;
    scoreEl.textContent="0";
  }

  function bellWidth(index){return Math.max(25,52-index*.65)}
  function reachableAtTime(startX,targetX,time,hitHalfWidth){
    let x=startX,vx=0;
    const steps=Math.max(1,Math.ceil(time*120)),dt=time/steps;
    for(let i=0;i<steps;i++){
      const p=horizontalStep(x,vx,targetX,dt); x=p.x; vx=p.vx;
    }
    return Math.abs(x-targetX)<=hitHalfWidth;
  }
  function landingTime(fromY,toY,jumpVelocity){
    const gap=fromY-toY;
    const discriminant=jumpVelocity*jumpVelocity-2*GRAVITY*gap;
    if(discriminant<0)return null;
    return (jumpVelocity+Math.sqrt(discriminant))/GRAVITY;
  }
  function chooseReachableX(fromX,fromY,toY,jumpVelocity,width){
    const time=landingTime(fromY,toY,jumpVelocity);
    const minX=42,maxX=Math.max(42,W-42);
    if(time===null)return null;
    const hitHalfWidth=width/2+RABBIT_R*.55+6;
    // Search all candidate positions rather than choosing a random point and
    // hoping the player can reach it.
    const candidates=161;
    for(let pass=0;pass<2;pass++){
      for(let i=0;i<candidates;i++){
        const t=i/(candidates-1);
        const x=pass===0
          ? fromX+(t<.5?t*2:(1-t)*2)*(Math.random()<.5?-1:1)*Math.min(W*.25,120)
          : minX+(maxX-minX)*t;
        const cx=clamp(x,minX,maxX);
        if(reachableAtTime(fromX,cx,time,hitHalfWidth))return cx;
      }
    }
    return null;
  }
  function addValidatedBell(targetY,jumpVelocity,fromX,fromY){
    let y=targetY;
    let velocity=jumpVelocity;
    let x=null;
    // If a proposed gap is too large for the same physics used by gameplay,
    // close the gap until at least one reachable target exists.
    for(let attempt=0;attempt<30&&!x;attempt++){
      const width=bellWidth(bellIndex);
      x=chooseReachableX(fromX,fromY,y,velocity,width);
      if(x!==null)break;
      y=fromY-Math.max(60,(fromY-y)*0.88);
    }
    if(x===null){
      y=fromY-60;
      x=clamp(fromX,42,Math.max(42,W-42));
    }
    const width=bellWidth(bellIndex++);
    bells.push({x,y,w:width,h:12,vy:BELL_FALL_SPEED,hit:false});
  }

  function startGame(){
    reset();state="playing";startPanel.classList.add("hidden");overPanel.classList.add("hidden");
    last=performance.now();requestAnimationFrame(loop);
  }
  function launchFirstJump(){if(state!=="playing"||!waitingForJump)return;waitingForJump=false;rabbit.vy=FIRST_JUMP;}
  function restartFromInput(){
    const inputX=mouseX;
    if(state==="menu"||state==="over"){startGame();mouseX=clamp(inputX,0,W);}
    launchFirstJump();
  }
  function end(){
    state="over";finalScoreEl.textContent=score;
    if(score>best){best=score;saveBest(best);bestEl.textContent=best;}
    overPanel.classList.remove("hidden");
  }

  function updateBirds(dt){
    for(const b of birds){
      b.x+=b.vx*dt;
      if(b.x<-30||b.x>W+30){b.vx*=-1;b.x=clamp(b.x,-30,W+30);}
    }
  }
  function updateBells(dt){
    // Bells are now actual falling objects, matching the original game's core
    // mechanic rather than acting as fixed platforms in world space.
    for(const b of bells)b.y+=b.vy*dt;
  }

  function update(dt){
    if(waitingForJump)return;
    const previousFootY=rabbit.y+rabbit.r;
    const horizontal=horizontalStep(rabbit.x,rabbit.vx,mouseX,dt);
    rabbit.x=horizontal.x;rabbit.vx=horizontal.vx;
    rabbit.vy+=GRAVITY*dt;rabbit.y+=rabbit.vy*dt;
    updateBells(dt);updateBirds(dt);

    const currentFootY=rabbit.y+rabbit.r;
    let landedThisFrame=false;
    if(rabbit.vy>0){
      for(const b of bells){
        if(b.hit)continue;
        const by=b.y;
        const xHit=rabbit.x>b.x-b.w/2-rabbit.r*.55&&rabbit.x<b.x+b.w/2+rabbit.r*.55;
        if(xHit&&previousFootY<=by+4&&currentFootY>=by){
          rabbit.y=by-rabbit.r;
          rabbit.vy=-Math.min(780,660+score*.6);
          b.hit=true;hasLanded=true;bellHits+=1;score+=bellHits*10;
          scoreEl.textContent=score;landedThisFrame=true;
          for(let i=0;i<8;i++)particles.push({x:b.x,y:b.y,vy:rand(-50,20),vx:rand(-70,70),life:1});
          break;
        }
      }
      if(!landedThisFrame){
        for(const b of birds){
          if(b.hit)continue;
          const birdTop=b.y-b.r*.55;
          const xHit=rabbit.x>b.x-rabbit.r-b.r*.9&&rabbit.x<b.x+rabbit.r+b.r*.9;
          if(xHit&&previousFootY<=birdTop+4&&currentFootY>=birdTop){
            b.hit=true;score*=2;scoreEl.textContent=score;
            rabbit.y=birdTop-rabbit.r;rabbit.vy=-Math.min(900,720+score*.15);
            for(let i=0;i<14;i++)particles.push({x:b.x,y:b.y,vy:rand(-90,30),vx:rand(-100,100),life:1.2});
            break;
          }
        }
      }
    }

    const targetCam=rabbit.y-H*.45;
    if(targetCam<cameraY)cameraY+=(targetCam-cameraY)*Math.min(1,5*dt);

    // Maintain a safe amount of future bells. Each new bell is validated against
    // the same physics integrator, and the validator may shorten the gap.
    while(nextBellY-cameraY>-120){
      const proposed=nextBellY-rand(82,112);
      const jumpVelocity=Math.min(780,660+score*.6);
      addValidatedBell(proposed,jumpVelocity,lastGeneratedBellX,lastGeneratedBellY);
      const added=bells[bells.length-1];
      nextBellY=added.y-1;
      lastGeneratedBellX=added.x;lastGeneratedBellY=added.y;
      if(Math.random()<.12)birds.push({x:rand(40,Math.max(40,W-40)),y:added.y-rand(25,55),vx:rand(45,90)*(Math.random()<.5?-1:1),r:10,hit:false});
    }

    bells=bells.filter(b=>worldY(b.y)<H+100&&worldY(b.y)>-220);
    birds=birds.filter(b=>!b.hit&&worldY(b.y)<H+100&&worldY(b.y)>-220);
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=80*dt;p.life-=dt*2});
    particles=particles.filter(p=>p.life>0);

    if(rabbit.y-cameraY>H+80){end();return;}
  }

  function draw(){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"#081a35");g.addColorStop(1,"#24476b");
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    for(const s of stars){const y=((s.y-cameraY)%H+H)%H;ctx.globalAlpha=s.a;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(s.x,y,s.r,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
    for(const b of bells){
      const y=worldY(b.y);if(y<-50||y>H+50)continue;
      ctx.save();ctx.translate(b.x,y);ctx.fillStyle=b.hit?"#b9d7ec":"#eef8ff";ctx.strokeStyle="rgba(100,160,195,.8)";ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(0,0,b.w/2,b.h,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle="#d4e9f6";ctx.fillRect(-b.w*.34,-5,b.w*.68,7);ctx.fillStyle="#789bb8";ctx.beginPath();ctx.arc(0,7,4,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    for(const b of birds){
      const y=worldY(b.y);if(y<-40||y>H+40)continue;ctx.save();ctx.translate(b.x,y);ctx.fillStyle="#fff";
      ctx.beginPath();ctx.ellipse(0,0,11,7,0,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.moveTo(-3,-1);ctx.quadraticCurveTo(-15,-13,-18,-2);ctx.quadraticCurveTo(-9,-5,-2,3);ctx.fill();
      ctx.beginPath();ctx.moveTo(3,-1);ctx.quadraticCurveTo(15,-13,18,-2);ctx.quadraticCurveTo(9,-5,2,3);ctx.fill();ctx.restore();
    }
    for(const p of particles){ctx.globalAlpha=p.life;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(p.x,worldY(p.y),2.5,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;drawRabbit(rabbit.x,rabbit.y-cameraY);
  }
  function drawRabbit(x,y){
    ctx.save();ctx.translate(x,y);ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(0,7,17,20,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(-9,-14,6,17,-.18,0,Math.PI*2);ctx.ellipse(9,-14,6,17,.18,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#f1aebd";ctx.beginPath();ctx.ellipse(-9,-14,2.2,11,-.18,0,Math.PI*2);ctx.ellipse(9,-14,2.2,11,.18,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#24384d";ctx.beginPath();ctx.arc(-6,0,2.1,0,Math.PI*2);ctx.arc(6,0,2.1,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#e8a7b8";ctx.beginPath();ctx.arc(0,5,2.5,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  function loop(t){
    if(state!=="playing")return;
    const dt=Math.min(.033,Math.max(0,(t-last)/1000));last=t;
    update(dt);draw();
    if(state==="playing")requestAnimationFrame(loop);
  }
  function pointer(e){
    const r=canvas.getBoundingClientRect();mouseX=clamp(e.clientX-r.left,0,W);
    if(e.type==="pointerdown"){if(e.pointerType==="mouse"&&e.button!==0)return;restartFromInput();}
  }
  canvas.addEventListener("pointermove",pointer);
  canvas.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"&&e.button!==0)return;if(canvas.setPointerCapture&&e.pointerId!==undefined){try{canvas.setPointerCapture(e.pointerId)}catch{}}pointer(e);});
  canvas.addEventListener("pointerup",e=>{if(canvas.releasePointerCapture&&e.pointerId!==undefined){try{canvas.releasePointerCapture(e.pointerId)}catch{}}});
  canvas.addEventListener("pointercancel",e=>{if(canvas.releasePointerCapture&&e.pointerId!==undefined){try{canvas.releasePointerCapture(e.pointerId)}catch{}}});
  addEventListener("keydown",e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();if(state==="menu"||state==="over")restartFromInput();else if(!hasLanded&&waitingForJump)launchFirstJump();}});

  resize();reset();draw();
})();
