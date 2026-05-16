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

camera.position.z = 8;

const renderer = new THREE.WebGLRenderer({
canvas: document.querySelector('#bg'),
antialias:true
});

renderer.setSize(
window.innerWidth,
window.innerHeight
);

const controls = new OrbitControls(
camera,
renderer.domElement
);

controls.enableDamping = true;

const nucleus = new THREE.Mesh(
new THREE.SphereGeometry(0.6,64,64),
new THREE.MeshBasicMaterial({
color:0xff5533,
depthTest:false
})
);

nucleus.renderOrder=999;
scene.add(nucleus);

let cloud;

// ---------------------
// Sampling
// ---------------------

function sampleRadius1s(){
while(true){
let r=Math.random()*8;
if(Math.random()<4*r*r*Math.exp(-2*r))
return r;
}
}

function sampleRadius2s(){
while(true){
let r=Math.random()*12;
let prob=(2-r)*(2-r)*r*r*Math.exp(-r);

if(Math.random()<prob/4)
return r;
}
}

// ---------------------
// Cloud generation
// ---------------------

function createCloud(type){

if(cloud) scene.remove(cloud);

const positions=[];
const colors=[];
const particles= 400000;

for(let i=0;i<particles;i++){

let r=
(type==="1s")
?sampleRadius1s()
:sampleRadius2s();

let theta=Math.acos(
2*Math.random()-1
);

let phi=Math.random()*Math.PI*2;

let x=r*Math.sin(theta)*Math.cos(phi);
let y=r*Math.sin(theta)*Math.sin(phi);
let z=r*Math.cos(theta);

let keep=true;

// p orbitals
if(type==="2px")
keep=Math.random()<Math.abs(x/r);

if(type==="2py")
keep=Math.random()<Math.abs(y/r);

if(type==="2pz")
keep=Math.random()<Math.abs(z/r);

// d orbitals
if(type==="3dxz")
keep=Math.random()<Math.abs(x*z)/(r*r);

if(type==="3dyz")
keep=Math.random()<Math.abs(y*z)/(r*r);

if(type==="3dxy")
keep=Math.random()<Math.abs(x*y)/(r*r);

if(type==="3dx2y2")
keep=Math.random()<Math.abs(x*x-y*y)/(r*r);

if(type==="3dz2")
keep=Math.random()<Math.abs(
(2*z*z-x*x-y*y)/(r*r)
);

if(!keep) continue;

positions.push(x,y,z);

let intensity=1-r/12;

// colors
if(type.includes("d")){
colors.push(
1,
0.5*intensity,
0.15
);
}
else if(type.includes("p")){
colors.push(
0.2,
1,
0.8
);
}
else if(type==="2s"){
colors.push(
0.8,
0.3,
1
);
}
else{
colors.push(
0.3+intensity*0.5,
0.3,
1
);
}
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
size:0.05,
transparent:true,
opacity:0.65,
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

cloud=
new THREE.Points(
geometry,
material
);

scene.add(cloud);
}

createCloud("1s");

// ---------------------
// Selector
// ---------------------

document
.getElementById("orbitalSelect")
.addEventListener(
"change",
e=>createCloud(e.target.value)
);

// ---------------------
// Animation
// ---------------------

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

// ---------------------
// Resize
// ---------------------

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

}
);