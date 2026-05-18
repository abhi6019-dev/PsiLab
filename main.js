import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js?module';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
75,
window.innerWidth/window.innerHeight,
0.1,
1000
);

camera.position.z=10;

const renderer=new THREE.WebGLRenderer({
canvas:document.querySelector('#bg'),
antialias:true
});

renderer.setSize(
window.innerWidth,
window.innerHeight
);

const controls=new OrbitControls(
camera,
renderer.domElement
);

controls.enableDamping=true;

const nucleus=new THREE.Mesh(
new THREE.SphereGeometry(0.6,64,64),
new THREE.MeshBasicMaterial({
color:0xff5533,
depthTest:false
})
);

nucleus.renderOrder=999;
scene.add(nucleus);

let cloud;

// ------------------
// factorial
// ------------------

function fact(n){
let r=1;
for(let i=2;i<=n;i++)r*=i;
return r;
}

// ------------------
// Laguerre
// ------------------

function L(k,a,x){

if(k===0)return 1;
if(k===1)return 1+a-x;

let L0=1;
let L1=1+a-x;

for(let n=2;n<=k;n++){

let Ln=
(
(2*n-1+a-x)*L1
-(n-1+a)*L0
)/n;

L0=L1;
L1=Ln;
}

return L1;
}

// ------------------
// Legendre
// ------------------

function P(l,m,x){

if(m<0)
return Math.pow(-1,m)*
fact(l-m)/fact(l+m)*
P(l,-m,x);

if(l===m)
return Math.pow(-1,m)*
fact(2*m-1)*
Math.pow(1-x*x,m/2);

if(l===m+1)
return x*(2*m+1)*P(m,m,x);

return (
(2*l-1)*x*P(l-1,m,x)
-(l+m-1)*P(l-2,m,x)
)/(l-m);
}

// ------------------
// harmonic
// ------------------

function Y(l,m,theta,phi){

return Math.abs(
P(l,Math.abs(m),Math.cos(theta))
*Math.cos(m*phi)
);
}

// ------------------
// radial
// ------------------

function R(n,l,r){

const rho=2*r/n;

return Math.exp(-rho/2)*
Math.pow(rho,l)*
L(n-l-1,2*l+1,rho);
}

// ------------------
// probability
// ------------------

function psiProb(
n,l,m,
r,theta,phi
){

const radial=
R(n,l,r);

const angular=
Y(l,m,theta,phi);

return radial*radial*
angular*angular;
}

// ------------------
// orbital generation
// ------------------

function generateOrbital(
n,l,m
){

if(l>=n){
alert("Need l < n");
return;
}

if(Math.abs(m)>l){
alert("Need |m| ≤ l");
return;
}

if(cloud)
scene.remove(cloud);

const positions=[];
const colors=[];

const particles=300000;

for(let i=0;i<particles;i++){

let r=Math.random()*20;

let theta=Math.acos(
2*Math.random()-1
);

let phi=Math.random()*Math.PI*2;

let prob=
psiProb(
n,l,m,
r,theta,phi
);

if(Math.random()>prob*5)
continue;

let x=
r*Math.sin(theta)*Math.cos(phi);

let y=
r*Math.sin(theta)*Math.sin(phi);

let z=
r*Math.cos(theta);

positions.push(
x,y,z
);

let intensity=
Math.min(prob*20,1);

colors.push(
intensity,
0.3,
1-intensity
);
}

const geometry=
new THREE.BufferGeometry();

geometry.setAttribute(
'position',
new THREE.Float32BufferAttribute(
positions,3
)
);

geometry.setAttribute(
'color',
new THREE.Float32BufferAttribute(
colors,3
)
);

const material=
new THREE.PointsMaterial({
size:0.04,
transparent:true,
opacity:0.7,
vertexColors:true,
depthWrite:false
});

material.onBeforeCompile=
shader=>{

shader.fragmentShader=
shader.fragmentShader.replace(
`#include <clipping_planes_fragment>`,
`
#include <clipping_planes_fragment>
if(length(gl_PointCoord-vec2(0.5))>0.5) discard;
`
);

};

cloud=new THREE.Points(
geometry,
material
);

scene.add(cloud);

}

// UI

document
.getElementById("generate")
.onclick=()=>{

const n=
parseInt(
document.getElementById("n").value
);

const l=
parseInt(
document.getElementById("l").value
);

const m=
parseInt(
document.getElementById("m").value
);

generateOrbital(
n,l,m
);

};

generateOrbital(3,2,0);

// animation

function animate(){

requestAnimationFrame(
animate
);

controls.update();

renderer.render(
scene,
camera
);

}

animate();

window.addEventListener(
'resize',
()=>{

camera.aspect=
window.innerWidth/
window.innerHeight;

camera.updateProjectionMatrix();

renderer.setSize(
window.innerWidth,
window.innerHeight
);

});