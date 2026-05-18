import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js?module';

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x000000);

const camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,1e-8,1e8);
camera.position.z=25;

const renderer=new THREE.WebGLRenderer({canvas:bg,logarithmicDepthBuffer:true,powerPreference:'high-performance'});
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(1);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;
controls.minDistance=1e-8;

const nucleus=new THREE.Mesh(
new THREE.SphereGeometry(.00032,32,32),
new THREE.MeshBasicMaterial({color:0xff5533,depthTest:false})
);
scene.add(nucleus);

let cloud;

function psi(n,l,m,r,t,p){return Math.exp(-r/n)*Math.pow(r,l)*Math.abs(Math.cos(m*p))*Math.abs(Math.sin(t*l));}

async function generate(){
loading.style.display='flex';

const n=+document.getElementById('n').value;
const l=+document.getElementById('l').value;
const m=+document.getElementById('m').value;
const N=+document.getElementById('count').value;

if(cloud)scene.remove(cloud);

const pos=new Float32Array(N*3);
let ptr=0;

for(let i=0;i<N;i++){
if(i%50000===0){
percent.textContent=Math.floor(i/N*100)+'%';
await new Promise(r=>setTimeout(r,0));
}

const r=-Math.log(Math.random())*n*2;
const t=Math.acos(2*Math.random()-1);
const p=Math.random()*Math.PI*2;

if(Math.random()>psi(n,l,m,r,t,p)*.1)continue;

pos[ptr++]=r*Math.sin(t)*Math.cos(p);
pos[ptr++]=r*Math.sin(t)*Math.sin(p);
pos[ptr++]=r*Math.cos(t);
}

const g=new THREE.BufferGeometry();
g.setAttribute('position',new THREE.BufferAttribute(pos.slice(0,ptr),3));

const mat=new THREE.PointsMaterial({size:.006,transparent:true,opacity:.05,color:0x66aaff,depthWrite:false});

mat.onBeforeCompile=s=>{
s.fragmentShader=s.fragmentShader.replace('#include <clipping_planes_fragment>','\n#include <clipping_planes_fragment>\nif(length(gl_PointCoord-vec2(.5))>.5) discard;');
};

cloud=new THREE.Points(g,mat);
scene.add(cloud);
loading.style.display='none';
}

generate.onclick=generate;
generate();

function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}
animate();

addEventListener('resize',()=>{
camera.aspect=innerWidth/innerHeight;
camera.updateProjectionMatrix();
renderer.setSize(innerWidth,innerHeight)
})