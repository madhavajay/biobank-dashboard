/* OpenMined Brand Guidelines — script.js */

(function () {
  "use strict";

  /* ---- Toast ---- */
  const toast = document.getElementById("toast");
  let toastTimer;

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("visible");
    toastTimer = setTimeout(function () {
      toast.classList.remove("visible");
    }, 2000);
  }

  /* ---- Copy color hex on click (event delegation) ---- */
  document.addEventListener("click", function (e) {
    var swatch = e.target.closest(".color-swatch");
    if (!swatch) return;
    var hex = swatch.getAttribute("data-color");
    if (!hex) return;
    navigator.clipboard.writeText(hex).then(function () {
      showToast("Copied " + hex);
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var swatch = e.target.closest(".color-swatch");
    if (!swatch) return;
    e.preventDefault();
    var hex = swatch.getAttribute("data-color");
    if (!hex) return;
    navigator.clipboard.writeText(hex).then(function () {
      showToast("Copied " + hex);
    });
  });

  /* ---- Nav scroll highlighting ---- */
  var navLinks = document.querySelectorAll(".nav-links a");
  var sections = [];

  navLinks.forEach(function (link) {
    var id = link.getAttribute("href").replace("#", "");
    var section = document.getElementById(id);
    if (section) sections.push({ id: id, el: section, link: link });
  });

  function updateActiveNav() {
    var scrollY = window.scrollY + 100;
    var current = null;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].el.offsetTop <= scrollY) {
        current = sections[i];
      }
    }
    navLinks.forEach(function (l) {
      l.classList.remove("active");
    });
    if (current) current.link.classList.add("active");
  }

  var scrollTicking = false;
  window.addEventListener("scroll", function () {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(function () {
        updateActiveNav();
        scrollTicking = false;
      });
    }
  }, { passive: true });
  updateActiveNav();
})();

/* ---- Web Graphic Previews (lazy-init, throttled) ---- */
(function () {
  var streamCanvas = document.getElementById("preview-stream");
  var diamondCanvas = document.getElementById("preview-diamond");
  if (!streamCanvas || !diamondCanvas) return;

  var section = document.getElementById("web-graphics");
  if (!section) return;

  var vsSrc = [
    "attribute vec2 aPos;",
    "varying vec2 vUV;",
    "void main(){vUV=aPos*0.5+0.5;gl_Position=vec4(aPos,0,1);}"
  ].join("\n");

  var noiseSrc = [
    "vec3 mod289v3(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}",
    "vec2 mod289v2(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}",
    "vec3 permute(vec3 x){return mod289v3(((x*34.0)+10.0)*x);}",
    "float snoise(vec2 v){",
    "  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);",
    "  vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);",
    "  vec2 i1=(x0.x>x0.y)?vec2(1,0):vec2(0,1);",
    "  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289v2(i);",
    "  vec3 p=permute(permute(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));",
    "  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);",
    "  m=m*m;m=m*m;",
    "  vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;",
    "  vec3 ox=floor(x+0.5);vec3 a0=x-ox;",
    "  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);",
    "  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;",
    "  return 130.0*dot(m,g);",
    "}"
  ].join("\n");

  var streamFSSrc = [
    "precision highp float;",
    "varying vec2 vUV;",
    "uniform float uTime;",
    "uniform vec2 uRes;",
    noiseSrc,
    "float bezier1D(float t,float p0,float p1,float p2,float p3){",
    "  float u=1.0-t;return u*u*u*p0+3.0*u*u*t*p1+3.0*u*t*t*p2+t*t*t*p3;",
    "}",
    "float getCenterY(float x){",
    "  float t=x;",
    "  for(int i=0;i<6;i++){",
    "    float ex=bezier1D(t,-0.05,0.30,0.70,1.05);",
    "    float dex=3.0*(1.0-t)*(1.0-t)*0.35+6.0*(1.0-t)*t*0.40+3.0*t*t*0.35;",
    "    t-=(ex-x)/max(dex,0.001);t=clamp(t,0.0,1.0);",
    "  }",
    "  return bezier1D(t,0.35,0.72,0.19,0.42);",
    "}",
    "float getHalfWidth(float x){",
    "  float sq=1.0-0.55*exp(-((x-0.45)*(x-0.45))/0.035);",
    "  return 0.1*sq*(1.0-0.25*x);",
    "}",
    "vec3 sampleGrad(float t){",
    "  t=clamp(t,0.0,1.0);",
    "  vec3 c[6];float s[6];",
    "  c[0]=vec3(0.718,0.239,0.337);c[1]=vec3(0.973,0.753,0.451);",
    "  c[2]=vec3(0.576,0.439,0.596);c[3]=vec3(0.412,0.463,0.682);",
    "  c[4]=vec3(0.322,0.659,0.773);c[5]=vec3(0.325,0.745,0.663);",
    "  s[0]=0.0;s[1]=0.333;s[2]=0.5;s[3]=0.667;s[4]=0.833;s[5]=1.0;",
    "  vec3 col=c[0];float pS=s[0];",
    "  for(int i=1;i<6;i++){",
    "    float f=clamp((t-pS)/max(s[i]-pS,0.001),0.0,1.0);",
    "    col=mix(col,c[i],f*step(pS,t));pS=s[i];",
    "  }",
    "  return col;",
    "}",
    "void main(){",
    "  vec2 uv=vUV;float aspect=uRes.x/uRes.y;",
    "  float x=uv.x,y=uv.y;",
    "  float flow=uTime*0.119;float turb=0.67;",
    "  float cN=snoise(vec2(x*1.8+0.3-flow,uTime*0.10))*0.028*turb;",
    "  float amb=snoise(vec2(x*8.0-uTime*0.3,y*6.0+uTime*0.15))*0.005*turb;",
    "  float cY=getCenterY(x)+cN+amb;",
    "  float hw=getHalfWidth(x);",
    "  hw+=snoise(vec2(x*3.0+10.0-flow,uTime*0.12+7.0))*0.010*turb;",
    "  hw=max(hw,0.01);",
    "  float dist=(y-cY)/hw;",
    "  float gauss=exp(-(dist*dist)/(2.0*0.69*0.69));",
    "  float outerG=exp(-(dist*dist)/(2.0*0.84*0.84));",
    "  float alpha=mix(outerG,gauss,0.5);",
    "  float aN=snoise(vec2(x*5.0-flow*1.5,y*5.0*aspect+uTime*0.03))*0.08;",
    "  alpha=clamp(alpha+aN*alpha,0.0,1.0);",
    "  alpha=pow(alpha,0.65);alpha*=smoothstep(0.0,0.03,alpha);",
    "  float vPos=clamp(dist*0.5+0.5,0.0,1.0);",
    "  float vN=snoise(vec2(x*3.0-flow*2.0+20.0,y*4.0*aspect-uTime*0.04))*0.4;",
    "  vPos=clamp(vPos+vN,0.0,1.0);",
    "  float gradT=(x*0.46+vPos*0.11)*2.0;",
    "  vec3 color=sampleGrad(gradT);",
    "  float lum=dot(color,vec3(0.299,0.587,0.114));",
    "  color=mix(vec3(lum),color,1.32);",
    "  gl_FragColor=vec4(mix(vec3(1.0),color,alpha),1.0);",
    "}"
  ].join("\n");

  var diamondFSSrc = [
    "precision highp float;",
    "varying vec2 vUV;",
    "uniform float uTime;",
    "uniform vec2 uRes;",
    noiseSrc,
    "vec3 sampleGrad(float t){",
    "  t=fract(t);",
    "  vec3 c[10];float s[10];",
    "  c[0]=vec3(0.973,0.753,0.451);c[1]=vec3(0.969,0.592,0.388);",
    "  c[2]=vec3(0.800,0.404,0.482);c[3]=vec3(0.576,0.439,0.596);",
    "  c[4]=vec3(0.412,0.463,0.682);c[5]=vec3(0.322,0.659,0.773);",
    "  c[6]=vec3(0.325,0.745,0.663);c[7]=vec3(0.588,0.820,0.584);",
    "  c[8]=vec3(0.949,0.851,0.549);c[9]=vec3(0.973,0.753,0.451);",
    "  s[0]=0.0;s[1]=0.1136;s[2]=0.2273;s[3]=0.3409;s[4]=0.4545;",
    "  s[5]=0.5682;s[6]=0.6818;s[7]=0.7955;s[8]=0.8864;s[9]=1.0;",
    "  vec3 col=c[0];float pS=s[0];",
    "  for(int i=1;i<10;i++){",
    "    float f=clamp((t-pS)/max(s[i]-pS,0.001),0.0,1.0);",
    "    col=mix(col,c[i],f*step(pS,t));pS=s[i];",
    "  }",
    "  return col;",
    "}",
    "void main(){",
    "  vec2 uv=vUV;float aspect=uRes.x/uRes.y;",
    "  float cx=(uv.x-0.5)*aspect,cy=uv.y-0.5;",
    "  float s707=0.7071067811865476;",
    "  float rx=cx*s707+cy*s707,ry=cy*s707-cx*s707;",
    "  float halfSide=0.30*s707;float r=0.15*halfSide;",
    "  vec2 q=abs(vec2(rx,ry))-(halfSide-r);",
    "  float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;",
    "  float ns=3.0,nsp=0.3,na=0.025;",
    "  float eN=snoise(vec2(cx*ns+uTime*nsp*0.3,cy*ns-uTime*nsp*0.2))*na",
    "    +snoise(vec2(cx*ns*2.1+5.0-uTime*nsp*0.4,cy*ns*2.1+uTime*nsp*0.3))*na*0.5;",
    "  float amb=snoise(vec2(cx*8.0-uTime*0.3,cy*6.0+uTime*0.15))*0.005*0.5;",
    "  float dMod=d-eN-amb;",
    "  float outside=max(dMod,0.0);float soft2=2.0*0.04*0.04;",
    "  float alpha=exp(-(outside*outside)/max(soft2,1e-8));",
    "  float aN=snoise(vec2(cx*5.0+uTime*0.03,cy*5.0-uTime*0.02))*0.08;",
    "  alpha=clamp(alpha+aN*alpha,0.0,1.0);",
    "  alpha=pow(max(alpha,1e-6),2.0);alpha*=smoothstep(0.0,0.03,alpha);",
    "  float flow=uTime*0.06;",
    "  float angRad=332.0*3.14159265/180.0;",
    "  float fdx=cos(angRad),fdy=sin(angRad);",
    "  float hs=0.30;",
    "  float tA=(cx*fdx+cy*fdy)/(hs*2.0)+0.5;",
    "  float tC=(-cx*fdy+cy*fdx)/(hs*2.0)+0.5;",
    "  float turbN=snoise(vec2(cx*4.0-uTime*0.1,cy*4.0+uTime*0.08))*0.33*0.3;",
    "  float gradT=(tA*0.43+tC*0.25+turbN)+flow;",
    "  vec3 color=sampleGrad(gradT);",
    "  float lum=dot(color,vec3(0.299,0.587,0.114));",
    "  color=mix(vec3(lum),color,1.08);",
    "  gl_FragColor=vec4(mix(vec3(1.0),color,alpha),1.0);",
    "}"
  ].join("\n");

  function initPreview(canvas, fsSrc) {
    var gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return null;
    function mk(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    }
    var vs = mk(gl.VERTEX_SHADER, vsSrc);
    var fs = mk(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);
    var aPos = gl.getAttribLocation(prog, "aPos");
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return {
      gl: gl,
      uTime: gl.getUniformLocation(prog, "uTime"),
      uRes: gl.getUniformLocation(prog, "uRes")
    };
  }

  function resizePreview(canvas, p) {
    var parent = canvas.parentElement;
    var w = parent.clientWidth;
    var h = parent.clientHeight;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    p.gl.viewport(0, 0, w, h);
  }

  /* Deferred init: compile shaders only after page is loaded + idle */
  var sp = null;
  var dp = null;
  var initStarted = false;
  var visible = false;
  var rafId = 0;
  var spReady = false;
  var dpReady = false;

  function initOne(canvas, fsSrc, cb) {
    var idle = window.requestIdleCallback || function (fn) { setTimeout(fn, 50); };
    idle(function () {
      var p = initPreview(canvas, fsSrc);
      if (p) resizePreview(canvas, p);
      cb(p);
    });
  }

  function init() {
    if (initStarted) return;
    initStarted = true;
    /* Compile stream shader first, then diamond after stream is done */
    initOne(streamCanvas, streamFSSrc, function (p) {
      sp = p;
      initOne(diamondCanvas, diamondFSSrc, function (p2) {
        dp = p2;
      });
    });
    window.addEventListener("resize", function () {
      if (sp) resizePreview(streamCanvas, sp);
      if (dp) resizePreview(diamondCanvas, dp);
    });
  }

  var t0 = performance.now();
  var lastDraw = 0;
  var FRAME_INTERVAL = 1000 / 30; /* cap at 30fps */

  function animate(now) {
    if (!visible) { rafId = 0; return; }
    rafId = requestAnimationFrame(animate);
    if (now - lastDraw < FRAME_INTERVAL) return;
    lastDraw = now;
    var t = (now - t0) / 1000;
    if (sp) {
      sp.gl.uniform1f(sp.uTime, t);
      sp.gl.uniform2f(sp.uRes, streamCanvas.width, streamCanvas.height);
      sp.gl.drawArrays(sp.gl.TRIANGLE_STRIP, 0, 4);
      if (!spReady) { spReady = true; streamCanvas.classList.add("ready"); }
    }
    if (dp) {
      dp.gl.uniform1f(dp.uTime, t);
      dp.gl.uniform2f(dp.uRes, diamondCanvas.width, diamondCanvas.height);
      dp.gl.drawArrays(dp.gl.TRIANGLE_STRIP, 0, 4);
      if (!dpReady) { dpReady = true; diamondCanvas.classList.add("ready"); }
    }
  }

  /* Wait for full page load before any WebGL work */
  function startWhenReady() {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) {
          init();
          if (!rafId) rafId = requestAnimationFrame(animate);
        }
      }, { threshold: 0, rootMargin: "200px" }).observe(section);
    } else {
      init();
      visible = true;
      rafId = requestAnimationFrame(animate);
    }
  }

  if (document.readyState === "complete") {
    startWhenReady();
  } else {
    window.addEventListener("load", startWhenReady);
  }
})();
